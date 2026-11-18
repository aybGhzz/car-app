// The live connection: connect / disconnect, the polling loop, and the trip being recorded.
// Screens declare the PIDs they show with useWantedPids(); only those (plus what the trip log needs) are polled.
import { useEffect, useSyncExternalStore } from 'react';
import { ELM327 } from './obd/elm327';
import { OBD, PIDS, PID_KEYS, moduleName } from './obd/obd';
import { adapterLog, endDiagLog, startDiagLog } from './adapterLog';
import { SimTransport } from './obd/simulator';
import { BleTransport, ClassicTransport } from './transports/bluetooth';
import type { ConnKind, Transport } from './transports/types';
import { activeId, finishTrip, newTrip, odometer, setOdometer, vehicleById, type LiveTrip } from './garage';
import { kv } from './store';
import { checkSignal, resetSignals } from './alerts';
import { metres, simGps, startGps, stopGps } from './gps';
import { vehicleSettings, settings } from './settings';

// Signals written to the trip log once a second (when the car supports them), for the trip charts.
const LOG_KEYS = ['0D', '0C', '11', '04', '05', '0F', '5C', '5E', '10', '42', '0B', '2F', '06', '07', '08', '09'];
let fakeGps: ReturnType<typeof simGps> | null = null;

export type Status = 'idle' | 'connecting' | 'connected' | 'error';
// Adapter mode (see ELM327.setMode): 'live' while polling, 'diag' while reading or clearing codes. Chosen by the app.
export type Mode = 'live' | 'diag';

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
  mode: null as Mode | null,
  supported: null as Set<number> | null,
  ecu: null as string | null, // the module the live data comes from (see OBD.pickEcu)
  dead: new Set<string>(),
  values: {} as Record<string, { v: number; t: number }>,
  history: {} as Record<string, [number, number][]>,
  lastActive: 0, // last time the engine turned or the car moved, for ending a trip automatically
  stats: {} as Record<string, { min: number; max: number; sum: number; n: number }>, // since connecting, for min / avg / max
  trip: newTrip() as LiveTrip,
  version: 0, // bumped on every change; components subscribe to it
};

const listeners = new Set<() => void>();
let pending = false;
let busy = 0; // one-shot requests waiting or running; the polling loop pauses so the adapter answers them right away

// Every use of the adapter goes through this lock, one at a time, so a mode switch (several AT commands) can't be
// interleaved with a request that expects the other mode.
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}
async function ensureMode(elm: any, mode: Mode) {
  if (elm.mode === mode) return;
  S.mode = mode; // shown while the switch runs
  emit(true);
  try { await elm.setMode(mode); }
  finally { if (S.elm === elm) { S.mode = elm.mode; emit(true); } }
}
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
// Battery voltage (42) is always available: when the engine ECU doesn't report it, the adapter measures it (ATRV).
export const isSupported = (k: string) => !S.supported || k === '42' || S.supported.has(parseInt(k, 16));
const adapterVolts = () => !!S.supported && !S.supported.has(0x42);
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
  S.mode = null;
  setStatus('connecting', 'Connecting…');
  adapterLog('#', `connect ${kind}${deviceId ? ' ' + deviceId : ''}`);
  try {
    await t.open();
    const elm = new ELM327(t, adapterLog);
    setStatus('connecting', 'Initializing adapter and detecting protocol…');
    await elm.init();
    adapterLog('#', `adapter ${elm.version} · protocol ${elm.protocolNumber} ${elm.protocolName}`);
    S.elm = elm;
    setStatus('connecting', 'Finding the engine module…');
    const pick = await OBD.pickEcu(elm, [...LOG_KEYS, 'A6']); // ends in live mode
    S.mode = elm.mode;
    adapterLog('#', `modules ${JSON.stringify(pick.ecus)} · live data from ${pick.ecu ?? 'any'}`);
    S.supported = pick.supported;
    S.ecu = pick.ecu;
    S.dead.clear();
    S.values = {};
    S.history = {};
    S.stats = {};
    S.trip = newTrip(LOG_KEYS.filter(k => isSupported(k)));
    resetSignals();
    fakeGps = null;
    const car = vehicleById(S.vehicle);
    const gps = vehicleSettings(S.vehicle, car?.fuel ?? 'petrol').gps;
    if (kind === 'sim') { if (gps) fakeGps = simGps(); }
    else startGps(addFix, gps); // also keeps recording in the background (see gps.ts)
    S.lastActive = Date.now();
    setStatus('connected', elm.protocolName + (pick.ecu ? ' · ECU ' + pick.ecu : ''));
    pollLoop();
  } catch (e: any) {
    adapterLog('!', 'connect failed: ' + (e?.message ?? e));
    S.elm = null;
    S.mode = null;
    setStatus('error', e?.message ?? String(e));
    try { await t.close(); } catch {}
  }
}

export async function disconnect() {
  const elm = S.elm;
  S.elm = null;
  S.mode = null;
  adapterLog('#', 'disconnect');
  setStatus('idle', 'Disconnected');
  stopGps();
  fakeGps = null;
  closeLive();
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
        const elm = S.elm;
        const v = await locked(async () => {
          if (busy || S.elm !== elm) return undefined; // a one-shot request queued meanwhile: let it go first
          await ensureMode(elm, 'live');
          return k === '42' && adapterVolts()
            ? parseFloat((await elm.text('ATRV')).replace(/[^0-9.]/g, '')) || null
            : await OBD.value(elm, k);
        });
        if (v === undefined) break;
        if (v == null) { if ((fails[k] = (fails[k] || 0) + 1) >= 5 && k !== '0C' && k !== '0D') S.dead.add(k); continue; } // rpm and speed stay polled: they tell when the engine starts again
        fails[k] = 0;
        setValue(k, v);
      } catch {
        if (!S.elm) return;
        await sleep(200);
      }
    }
    await sleep(busy ? 200 : 20);
    autoEnd();
  }
}

// Ends and saves the trip when the engine has been off (rpm 0 or no answer) and the car still for the time set in
// Settings > Trips, while the adapter stays connected. A new trip starts when the engine turns again.
function autoEnd() {
  const min = settings().autoEndMin;
  if (!min || !S.trip.samples.length || Date.now() - S.lastActive < min * 60_000) return;
  closeLive();
  S.trip = newTrip(LOG_KEYS.filter(k => isSupported(k)));
  S.dead.clear(); // signals that stopped answering with the engine off get another chance
  S.stats = {};
  emit(true);
}

function setValue(k: string, v: number) {
  const t = now();
  S.values[k] = { v, t };
  const st = S.stats[k];
  if (st) { st.min = Math.min(st.min, v); st.max = Math.max(st.max, v); st.sum += v; st.n++; }
  else S.stats[k] = { min: v, max: v, sum: v, n: 1 };
  const h = (S.history[k] ??= []);
  h.push([t, v]);
  while (h.length && h[0][0] < t - 120) h.shift();
  if ((k === '0C' || k === '0D') && v > 0) S.lastActive = Date.now();
  if (k === '0D') tripUpdate(v, t);
  if (k === 'A6' && S.kind !== 'sim') setOdometer(v, 'car', S.vehicle); // the simulator's mileage is not the car's
  checkSignal(k, v, S.vehicle, meta(k));
  emit();
}

export function fuelRateLh() {
  const r = val('5E');
  if (r != null) return r;
  const maf = val('10');
  if (maf == null) return null;
  // gasoline: stoichiometric AFR 14.7, 740 g/L. The fuel trims say how much fuel the ECU adds on top of what the MAF
  // implies (an air leak after the MAF, for example), so they correct the estimate. Banks averaged when both report.
  const bank = (s: string, l: string) => (val(s) != null || val(l) != null ? (val(s) ?? 0) + (val(l) ?? 0) : null);
  const trims = [bank('06', '07'), bank('08', '09')].filter((x): x is number => x != null);
  const trim = trims.length ? trims.reduce((a, b) => a + b, 0) / trims.length : 0;
  return ((maf * 3600) / (14.7 * 740)) * (1 + Math.max(-25, Math.min(40, trim)) / 100);
}

// The trip in progress is copied to the phone's storage every 15 s, so it survives the app being killed mid-drive.
// It is saved as a normal trip (and uploaded) when it ends: Disconnect, engine off for the set time, or at the next
// start if the app was killed.
let savedAt = 0;
function saveLive() {
  savedAt = Date.now();
  if (S.kind === 'sim') return;
  kv.set('liveTrip', { trip: S.trip, vehicle: S.vehicle, at: savedAt });
}
function closeLive(end?: number) {
  if (S.kind !== 'sim') finishTrip(S.trip, S.vehicle, end); // simulated drives are never saved to a real car
  kv.remove('liveTrip');
  savedAt = 0;
}
export function recoverTrip() {
  const saved = kv.get<{ trip: LiveTrip; vehicle: string; at: number } | null>('liveTrip', null);
  if (!saved || S.status === 'connected') return;
  finishTrip(saved.trip, saved.vehicle, saved.at);
  kv.remove('liveTrip');
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
    if (Date.now() - savedAt > 15_000) saveLive();
  }
}

// Keeps a GPS point when the car has moved at least 15 m since the last one.
function addFix(lat: number, lng: number) {
  const p = S.trip.path, prev = p[p.length - 1];
  if (!prev || metres(prev, [lat, lng]) >= 15) p.push([lat, lng]);
}

// ---------- one-shot requests (trouble codes, odometer) ----------
// Runs fn alone on the adapter, in the given mode. The polling loop switches back to live by itself afterwards.
async function exclusive<T>(mode: Mode, fn: (elm: any) => Promise<T>): Promise<T> {
  const elm = S.elm;
  if (!elm) throw new Error('Not connected');
  busy++;
  try {
    return await locked(async () => {
      if (S.elm !== elm) throw new Error('Not connected');
      await ensureMode(elm, mode);
      return fn(elm);
    });
  } finally { busy--; }
}

export type ModuleCode = { code: string; ecu: string; module: string };
type Readiness = { mil: boolean; count: number; diesel: boolean; monitors: { name: string; supported: boolean; complete: boolean }[] };
export type CodesResult = {
  stored: ModuleCode[];
  pending: ModuleCode[];
  permanent: ModuleCode[];
  modules: { ecu: string; module: string }[]; // the modules that answered the stored-codes request
  unanswered: ('pending' | 'permanent')[]; // requests no module answered (not supported, or lost)
  refused: string[]; // modules that refused a request
  mismatch: { ecu: string; module: string; reported: number; read: number }[]; // module says N codes, fewer were read
  readiness: (Readiness & { count: number }) | null;
};

const label = (ecu: string) => ({ ecu, module: moduleName(ecu) as string });
const flat = (ecus: Record<string, string[]>): ModuleCode[] =>
  Object.keys(ecus).sort().flatMap(ecu => ecus[ecu].map(code => ({ code, ...label(ecu) })));

// Reads the codes from every module (diag mode). Throws when no module answered the stored-codes request: that is
// "the codes could not be read", never "no codes".
export async function readCodes(): Promise<CodesResult> {
  startDiagLog('read codes');
  try {
    type Dtcs = { answered: boolean; ecus: Record<string, string[]>; refused: string[]; errors: string[] };
    const r = await exclusive('diag', async elm => ({
      stored: (await OBD.dtcs(elm, '03')) as Dtcs,
      pending: (await OBD.dtcs(elm, '07')) as Dtcs,
      permanent: (await OBD.dtcs(elm, '0A')) as Dtcs,
      ready: (await OBD.readinessByEcu(elm)) as Record<string, Readiness>,
    }));
    if (!r.stored.answered) {
      const why = r.stored.refused.length ? 'refused by ' + r.stored.refused.join(', ') : r.stored.errors.join(', ') || 'no answer';
      throw new Error(`The car did not answer the trouble code request (${why}). This does not mean there are no codes: check that the ignition is on and read again.`);
    }
    const mods = Object.keys(r.ready);
    const mismatch = [...new Set([...mods, ...Object.keys(r.stored.ecus)])].sort()
      .map(ecu => ({ ...label(ecu), reported: r.ready[ecu]?.count ?? 0, read: r.stored.ecus[ecu]?.length ?? 0 }))
      .filter(m => m.reported > m.read);
    // The monitors come from the module that supports the most of them (the engine); MIL and count from all.
    const main = mods.map(e => r.ready[e]).sort((a, b) => b.monitors.filter(m => m.supported).length - a.monitors.filter(m => m.supported).length)[0];
    const res: CodesResult = {
      stored: flat(r.stored.ecus),
      pending: flat(r.pending.ecus),
      permanent: flat(r.permanent.ecus),
      modules: Object.keys(r.stored.ecus).sort().map(label),
      unanswered: (['pending', 'permanent'] as const).filter(k => !r[k].answered),
      refused: [...new Set([r.stored, r.pending, r.permanent].flatMap(x => x.refused))],
      mismatch,
      readiness: main ? { ...main, mil: mods.some(e => r.ready[e].mil), count: mods.reduce((n, e) => n + r.ready[e].count, 0) } : null,
    };
    adapterLog('#', 'result ' + JSON.stringify({ ...res, readiness: res.readiness && { mil: res.readiness.mil, count: res.readiness.count } }));
    return res;
  } catch (e: any) {
    adapterLog('!', 'read codes failed: ' + (e?.message ?? e));
    throw e;
  } finally {
    endDiagLog(diagHeader('Trouble code read'));
  }
}

// Clears the codes in every module. Returns the modules that confirmed (empty: nobody did).
export async function clearCodes(): Promise<{ ecu: string; module: string }[]> {
  startDiagLog('clear codes');
  try {
    const r = await exclusive('diag', elm => OBD.clear(elm));
    adapterLog('#', 'cleared by ' + (r.ecus.join(', ') || 'nobody') + (r.errors.length ? ' · ' + r.errors.join(', ') : ''));
    return r.ecus.map(label);
  } finally {
    endDiagLog(diagHeader('Clear codes'));
  }
}

export const readOdometer = () => exclusive('live', elm => OBD.value(elm, 'A6') as Promise<number | null>);

function diagHeader(what: string) {
  const car = vehicleById(S.vehicle) as any;
  const elm = S.elm;
  return [
    `${what} · ${new Date().toISOString()}`,
    `Car: ${car ? [car.make, car.model, car.year, car.engine].filter(Boolean).join(' ') : S.vehicle || '?'}`,
    `Adapter: ${S.kind} ${elm?.version ?? ''} · protocol ${elm?.protocolNumber ?? '?'} ${elm?.protocolName ?? ''} · live module ${S.ecu ?? 'any'}`,
  ].join('\n');
}
