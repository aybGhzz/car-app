// The live connection: connect / disconnect, the polling loop, and the trip being recorded.
// Screens declare the PIDs they show with useWantedPids(); only those (plus what the trip log needs) are polled.
import { useEffect, useSyncExternalStore } from 'react';
import { ELM327 } from './obd/elm327';
import { OBD, PIDS, PID_KEYS } from './obd/obd';
import { SimTransport } from './obd/simulator';
import { BleTransport, ClassicTransport } from './transports/bluetooth';
import type { ConnKind, Transport } from './transports/types';
import { activeId, finishTrip, newTrip, odometer, setOdometer, vehicleById, type LiveTrip } from './garage';
import { checkSignal, resetSignals } from './alerts';
import { metres, simGps, startGps, stopGps } from './gps';
import { vehicleSettings } from './settings';

// Signals written to the trip log once a second (when the car supports them), for the trip charts.
const LOG_KEYS = ['0D', '0C', '11', '04', '05', '0F', '5C', '5E', '10', '42', '0B', '2F'];
let fakeGps: ReturnType<typeof simGps> | null = null;

export type Status = 'idle' | 'connecting' | 'connected' | 'error';

type PidMeta = { name: string; unit: string; min: number; max: number; dp: number };
export const meta = (k: string): PidMeta => (PIDS as Record<string, PidMeta>)[k] ?? { name: k, unit: '', min: 0, max: 100, dp: 1 };

const now = () => performance.now() / 1000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const S = {
  status: 'idle' as Status,
  message: 'Disconnected',
  kind: null as ConnKind | null,
  vehicle: '', // the car selected when connecting: its odometer and trips get the live data, even if another car is selected later
  elm: null as any,
  supported: null as Set<number> | null,
  ecu: null as string | null, // the module the live data comes from (see OBD.pickEcu)
  dead: new Set<string>(),
  values: {} as Record<string, { v: number; t: number }>,
  history: {} as Record<string, [number, number][]>,
  trip: newTrip() as LiveTrip,
  version: 0, // bumped on every change; components subscribe to it
};

const listeners = new Set<() => void>();
let pending = false;
let busy = false; // a one-shot request is running; the polling loop pauses so the adapter answers it right away
// Batches updates to ~8 per second: enough for smooth springs on the gauges, cheap for the JS thread.
function emit(now = false) {
  S.version++;
  if (now) { listeners.forEach(f => f()); return; }
  if (pending) return;
  pending = true;
  setTimeout(() => { pending = false; listeners.forEach(f => f()); }, 120);
}
export function useLive() {
  useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f); }, () => S.version);
  return S;
}

// ---------- which PIDs to poll ----------
const wanted = new Map<string, number>();
export function useWantedPids(keys: string[]) {
  const sig = keys.join(',');
  useEffect(() => {
    keys.forEach(k => wanted.set(k, (wanted.get(k) ?? 0) + 1));
    return () => keys.forEach(k => { const n = (wanted.get(k) ?? 1) - 1; n ? wanted.set(k, n) : wanted.delete(k); });
  }, [sig]);
}
export const isSupported = (k: string) => !S.supported || S.supported.has(parseInt(k, 16));
export const availableKeys = () => PID_KEYS.filter(isSupported) as string[];
export const val = (k: string) => (S.values[k] && now() - S.values[k].t < 5 ? S.values[k].v : null);

function wantedKeys() {
  const w = new Set([...LOG_KEYS, ...wanted.keys()]); // the trip log needs these even when no screen shows them
  return [...w].filter(k => isSupported(k) && !S.dead.has(k));
}

// ---------- connection ----------
function setStatus(status: Status, message: string) {
  S.status = status;
  S.message = message;
  emit(true);
}

export async function connect(kind: ConnKind, deviceId?: string) {
  const t: Transport = kind === 'sim' ? Object.assign(new SimTransport(), { odoStart: odometer().value }) // the fake car shares the selected vehicle's mileage
    : kind === 'classic' ? new ClassicTransport(deviceId!) : new BleTransport(deviceId!);
  S.kind = kind;
  S.vehicle = activeId();
  setStatus('connecting', 'Connecting…');
  try {
    await t.open();
    const elm = new ELM327(t);
    setStatus('connecting', 'Initializing adapter and detecting protocol…');
    await elm.init();
    S.elm = elm;
    setStatus('connecting', 'Finding the engine module…');
    const pick = await OBD.pickEcu(elm, [...LOG_KEYS, 'A6']);
    S.supported = pick.supported;
    S.ecu = pick.ecu;
    S.dead.clear();
    S.values = {};
    S.history = {};
    S.trip = newTrip(LOG_KEYS.filter(k => isSupported(k)));
    resetSignals();
    fakeGps = null;
    const car = vehicleById(S.vehicle);
    if (vehicleSettings(S.vehicle, car?.fuel ?? 'petrol').gps) {
      if (kind === 'sim') fakeGps = simGps();
      else startGps(addFix);
    }
    setStatus('connected', elm.protocolName + (pick.ecu ? ' · ECU ' + pick.ecu : ''));
    pollLoop();
  } catch (e: any) {
    setStatus('error', e?.message ?? String(e));
    try { await t.close(); } catch {}
  }
}

export async function disconnect() {
  const elm = S.elm;
  S.elm = null;
  setStatus('idle', 'Disconnected');
  stopGps();
  fakeGps = null;
  finishTrip(S.trip, S.vehicle);
  S.trip = newTrip();
  try { await elm?.t.close(); } catch {}
}

async function pollLoop() {
  const fails: Record<string, number> = {};
  while (S.elm) {
    // Speed drives the trip distance, so read it between every few other signals: on a slow adapter or an older
    // car (K-line), a full round of signals can take several seconds.
    const keys = wantedKeys(), order: string[] = [];
    keys.filter(k => k !== '0D').forEach((k, i) => { if (keys.includes('0D') && i % 3 === 0) order.push('0D'); order.push(k); });
    if (!order.length && keys.includes('0D')) order.push('0D');
    for (const k of order) {
      if (!S.elm || busy) break;
      try {
        const v = await OBD.value(S.elm, k);
        if (v == null) { if ((fails[k] = (fails[k] || 0) + 1) >= 5) S.dead.add(k); continue; }
        fails[k] = 0;
        setValue(k, v);
      } catch {
        if (!S.elm) return;
        await sleep(200);
      }
    }
    await sleep(busy ? 200 : 20);
  }
}

function setValue(k: string, v: number) {
  const t = now();
  S.values[k] = { v, t };
  const h = (S.history[k] ??= []);
  h.push([t, v]);
  while (h.length && h[0][0] < t - 120) h.shift();
  if (k === '0D') tripUpdate(v, t);
  if (k === 'A6') setOdometer(v, 'car', S.vehicle);
  checkSignal(k, v, S.vehicle, meta(k));
  emit();
}

export function fuelRateLh() {
  const r = val('5E');
  if (r != null) return r;
  const maf = val('10');
  return maf != null ? (maf * 3600) / (14.7 * 740) : null; // gasoline: stoichiometric AFR 14.7, 740 g/L
}

function tripUpdate(speed: number, t: number) {
  const T = S.trip;
  if (T.last != null && t - T.last < 15) { // gaps up to 15 s still count (slow adapters); longer ones are dropouts
    const dt = t - T.last;
    T.time += dt;
    T.dist += (speed * dt) / 3600;
    if (speed > 0) T.moving += dt;
    const r = fuelRateLh();
    if (r != null) T.fuel += (r * dt) / 3600;
  }
  T.last = t;
  T.max = Math.max(T.max, speed);
  T.startedAt ??= Date.now();
  const last = T.samples[T.samples.length - 1];
  if (!last || T.time - last[0] >= 1) {
    if (fakeGps && last) addFix(...fakeGps(speed, T.time - last[0]));
    T.samples.push([T.time, speed, val('05'), val('0F'), fuelRateLh()]);
    T.log.rows.push([Math.round(T.time * 10) / 10, ...T.log.keys.map(k => { const x = val(k); return x == null ? null : Math.round(x * 100) / 100; })]);
  }
}

// Keeps a GPS point when the car has moved at least 15 m since the last one.
function addFix(lat: number, lng: number) {
  const p = S.trip.path, prev = p[p.length - 1];
  if (!prev || metres(prev, [lat, lng]) >= 15) p.push([lat, lng]);
}

// ---------- one-shot requests (trouble codes, readiness, odometer) ----------
async function exclusive<T>(fn: (elm: any) => Promise<T>): Promise<T> {
  if (!S.elm) throw new Error('Not connected');
  busy = true;
  try { return await fn(S.elm); } finally { busy = false; }
}

export const readCodes = () =>
  exclusive(async elm => ({
    stored: (await OBD.dtcs(elm, '03')) as string[],
    pending: (await OBD.dtcs(elm, '07')) as string[],
    permanent: (await OBD.dtcs(elm, '0A')) as string[],
    readiness: await OBD.readiness(elm),
  }));
export const clearCodes = () => exclusive(elm => OBD.clear(elm) as Promise<boolean>);
export const readOdometer = () => exclusive(elm => OBD.value(elm, 'A6') as Promise<number | null>);
