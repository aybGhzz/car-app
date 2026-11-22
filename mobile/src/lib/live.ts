// The live connection: connect / disconnect, the polling loop, and the trip being recorded.
// Screens declare the PIDs they show with useWantedPids(); only those (plus what the trip log needs) are polled.
import { useEffect, useSyncExternalStore } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { ELM327 } from './obd/elm327';
import { OBD, PIDS, PID_KEYS, hex2, isBitmapPid } from './obd/obd';
import { addressName, canScan, scanModules } from './obd/scan';
import { adapterLog, endDiagLog, startDiagLog } from './adapterLog';
import { SimTransport } from './obd/simulator';
import { BleTransport, ClassicTransport, classicReady, scanBle } from './transports/bluetooth';
import type { ConnKind, Transport } from './transports/types';
import { activeId, DERIVED_META, fuelRateFrom, finishTrip, newTrip, odometer, setOdometer, vehicleById, vehicleName, type LiveTrip } from './garage';
import { kv } from './store';
import { checkSignal, resetSignals } from './alerts';
import { metres, simGps, startGps, stopGps } from './gps';
import { vehicleSettings, settings } from './settings';
import { savedAdapter, saveAdapter, type SavedAdapter } from './adapters';
import { t as tr } from './i18n';
import { batteryUnrestricted, onServiceAction, requestBatteryUnrestricted, startService, stopService, updateService } from '../../modules/vindici-service';

// Signals written to the trip log once a second (when the car supports them), for the trip charts.
const LOG_KEYS = ['0D', '0C', '11', '04', '05', '0F', '5C', '5E', '10', '42', '0B', '2F', '06', '07', '08', '09'];
let fakeGps: ReturnType<typeof simGps> | null = null;

// 'reconnecting': the adapter dropped mid-drive; the trip stays open while the app tries to get it back.
export type Status = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
// Adapter mode (see ELM327.setMode): 'live' while polling, 'diag' while reading or clearing codes. Chosen by the app.
export type Mode = 'live' | 'diag';

type PidMeta = { name: string; unit: string; min: number; max: number; dp: number };
export const meta = (k: string): PidMeta => (PIDS as Record<string, PidMeta>)[k] ?? DERIVED_META[k] ?? { name: k, unit: '', min: 0, max: 100, dp: 1 };

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
  modules: {} as Record<string, number[]>, // every module that answered at connect, and its supported Mode 01 PIDs
  texts: {} as Record<string, { s: string[]; t: number }>, // sensors without a number formula: state text or raw hex
  dead: new Set<string>(),
  values: {} as Record<string, { v: number; t: number }>,
  history: {} as Record<string, [number, number][]>,
  lastActive: 0, // last time the engine turned or the car moved, for ending a trip automatically
  stats: {} as Record<string, { min: number; max: number; sum: number; n: number }>, // since connecting, for min / avg / max
  trip: newTrip() as LiveTrip,
  attempt: 0, // reconnect attempts so far
  prompt: 0, // bumped when the connect sheet should open by itself (the remembered adapter did not answer)
  failed: null as SavedAdapter | null, // that adapter
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
// Every Mode 01 sensor the live module reports (All sensors), numbers or not. Without a list, the known ones.
export const allSensorKeys = (): string[] => {
  if (!S.supported) return PID_KEYS as string[];
  const keys = [...S.supported].filter(n => !isBitmapPid(n)).map(hex2);
  if (!keys.includes('42')) keys.push('42'); // measured by the adapter
  return keys.sort((a, b) => parseInt(a, 16) - parseInt(b, 16));
};
export const isNumeric = (k: string) => k in PIDS;
export const textVal = (k: string) => (S.texts[k] && now() - S.texts[k].t < 30 ? S.texts[k].s : null);
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

type Link = { kind: ConnKind; id?: string; name?: string };
let link: Link | null = null; // what the user asked to be connected to, kept through reconnects
let gen = 0; // bumped on every connect / disconnect / drop, so a stale loop or reconnect attempt stops by itself
let lastOk = 0; // last time the adapter answered anything (NO DATA counts): no answer for STALL_MS = the link is dead
const STALL_MS = 10_000;

const withTimeout = <T,>(p: Promise<T>, ms: number, msg: string) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

// Opens the transport, initializes the ELM327 and finds the engine module. Used by connect and by every reconnect.
async function openLink(l: Link, g: number) {
  const t: Transport = l.kind === 'sim' ? Object.assign(new SimTransport(), { odoStart: odometer().value }) // the fake car shares the selected vehicle's mileage
    : l.kind === 'classic' ? new ClassicTransport(l.id!) : new BleTransport(l.id!);
  t.onLost = () => { if (g === gen) lost(); };
  try {
    await withTimeout(t.open(), 15_000, 'The adapter did not answer. Is it plugged in and the ignition on?');
    const elm = new ELM327(t, adapterLog);
    if (g === gen) setStatus(S.status === 'reconnecting' ? 'reconnecting' : 'connecting', S.status === 'reconnecting' ? S.message : 'Initializing adapter and detecting protocol…');
    await elm.init();
    adapterLog('#', `adapter ${elm.version} · protocol ${elm.protocolNumber} ${elm.protocolName}`);
    if (g === gen && S.status === 'connecting') setStatus('connecting', 'Finding the engine module…');
    const pick = await OBD.pickEcu(elm, [...LOG_KEYS, 'A6']); // ends in live mode
    adapterLog('#', `modules ${JSON.stringify(pick.ecus)} · live data from ${pick.ecu ?? 'any'}`);
    return { elm, pick };
  } catch (e: any) {
    adapterLog('!', 'connect failed: ' + (e?.message ?? e));
    try { await t.close(); } catch {}
    throw e;
  }
}

export async function connect(kind: ConnKind, deviceId?: string, name?: string, opts: { auto?: boolean } = {}) {
  if (S.status === 'connecting' || S.status === 'connected' || S.status === 'reconnecting') return false;
  const g = ++gen;
  link = { kind, id: deviceId, name };
  S.kind = kind;
  S.vehicle = activeId();
  S.failed = null;
  S.mode = null;
  setStatus('connecting', opts.auto && name ? tr('Connecting to') + ' ' + name + '…' : 'Connecting…');
  adapterLog('#', `connect ${kind}${deviceId ? ' ' + deviceId : ''}`);
  try {
    const { elm, pick } = await openLink(link, g);
    if (g !== gen) { try { await elm.t.close(); } catch {} return false; } // disconnected while connecting
    S.elm = elm;
    S.mode = elm.mode;
    S.supported = pick.supported;
    S.ecu = pick.ecu;
    S.modules = pick.modules;
    S.texts = {};
    if (kind !== 'sim') saveScan(S.vehicle, elm.protocolName, pick);
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
    else {
      saveAdapter(S.vehicle, { kind, id: deviceId!, name: name || deviceId! }); // offered first next time (lib/adapters.ts)
      startBackground(gps);
    }
    S.lastActive = Date.now();
    lastOk = Date.now();
    setStatus('connected', elm.protocolName + (pick.ecu ? ' · ECU ' + pick.ecu : ''));
    pollLoop(g);
    if (kind !== 'sim') askBatteryOnce();
    return true;
  } catch (e: any) {
    if (g !== gen) return false;
    S.mode = null;
    link = null;
    if (opts.auto && kind !== 'sim') {
      S.failed = savedAdapter(S.vehicle);
      setStatus('error', 'The last adapter did not answer. Try again or pick another one.');
      S.prompt++;
      emit(true);
    } else setStatus('error', e?.message ?? String(e));
    return false;
  }
}

export async function disconnect() {
  gen++;
  link = null;
  const elm = S.elm;
  S.elm = null;
  S.mode = null;
  S.attempt = 0;
  adapterLog('#', 'disconnect');
  setStatus('idle', 'Disconnected');
  stopBackground();
  fakeGps = null;
  closeLive();
  S.trip = newTrip();
  try { await elm?.t.close(); } catch {}
}

// ---------- automatic connection to the remembered adapter ----------
let autoTried = '';
// At start-up and after signing in: connects to the adapter last used with the selected car. If it does not answer,
// the connect sheet opens with it on top, next to the usual list.
export async function autoConnect() {
  if (Platform.OS !== 'android' || !settings().autoConnect || S.status !== 'idle') return;
  const car = activeId(), a = savedAdapter(car);
  if (!a || autoTried === car + a.id) return;
  autoTried = car + a.id; // once per car and adapter per app start
  if (a.kind === 'classic' && !(await classicReady(a.id).catch(() => false))) {
    S.failed = a;
    setStatus('error', 'The last adapter did not answer. Try again or pick another one.');
    S.prompt++;
    emit(true);
    return;
  }
  if (await connect(a.kind, a.id, a.name, { auto: a.kind === 'classic' })) return;
  if (a.kind === 'ble') { // a BLE adapter can need a short scan before Android connects to it again
    const seen = await scanBle(4).catch(() => []);
    if (seen.some(d => d.id === a.id) && (await connect('ble', a.id, a.name))) return;
    S.failed = a;
    setStatus('error', 'The last adapter did not answer. Try again or pick another one.');
    S.prompt++;
    emit(true);
  }
}

// ---------- reconnect while driving ----------
// The adapter dropped (unplugged, out of range, Bluetooth off) or stopped answering. The trip stays open and the
// background service keeps running (Android does not let an app start it again from the background), while the app
// tries again: after 1, 2, 4, 8, 15 s, then every 30 s. It gives up after the auto-end time (Settings > Trips, at
// least 2 min, 10 min when auto-end is off) and saves the trip.
function lost() {
  if (!link || link.kind === 'sim' || S.status !== 'connected') return;
  const g = ++gen;
  const elm = S.elm;
  S.elm = null;
  S.mode = null;
  adapterLog('!', 'adapter lost, reconnecting');
  elm?.t.close().catch(() => {});
  reconnect(g, Date.now());
}

async function reconnect(g: number, lostAt: number) {
  const delays = [1, 2, 4, 8, 15], min = settings().autoEndMin;
  const giveUpMs = (min ? Math.max(2, min) : 10) * 60_000;
  for (let n = 1; ; n++) {
    S.attempt = n;
    setStatus('reconnecting', 'Reconnecting to the adapter…');
    updateService(tr('Reconnecting to the adapter…'), `${carLabel()} · ${tr('attempt')} ${n}`);
    await sleep((delays[n - 1] ?? 30) * 1000);
    if (g !== gen || !link) return;
    try {
      const { elm, pick } = await openLink(link, g);
      if (g !== gen) { elm.t.close().catch(() => {}); return; }
      S.elm = elm;
      S.mode = elm.mode;
      S.supported = pick.supported;
      S.ecu = pick.ecu;
      S.modules = pick.modules;
      S.dead.clear();
      S.attempt = 0;
      lastOk = Date.now();
      setStatus('connected', elm.protocolName + (pick.ecu ? ' · ECU ' + pick.ecu : ''));
      updateService(tr('Vindici is recording your trip'), carLabel());
      pollLoop(g);
      return;
    } catch {
      if (g !== gen) return;
      if (Date.now() - lostAt > giveUpMs) {
        gen++;
        link = null;
        S.attempt = 0;
        closeLive(lostAt);
        S.trip = newTrip();
        stopBackground();
        setStatus('error', 'Lost the adapter. The trip was saved.');
        return;
      }
    }
  }
}

// ---------- background (Android foreground service, modules/vindici-service) ----------
const carLabel = () => { const v = vehicleById(S.vehicle); return v ? vehicleName(v) : ''; };
async function startBackground(gps: boolean) {
  if (Platform.OS !== 'android') { startGps(addFix, gps); return; }
  // Android 13+: without this permission the service still runs, but its notification is hidden.
  if (Platform.Version >= 33) await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as any).catch(() => {});
  const route = await startGps(addFix, gps); // asks for location ("While using the app" is enough)
  startService({ title: tr('Vindici is recording your trip'), body: carLabel(), stopLabel: tr('Disconnect'), channel: tr('Trip recording'), gps: route });
}
function stopBackground() {
  stopGps();
  stopService();
}
// Once, at the first real connection: the system dialog that lets the app run in the background without limits.
function askBatteryOnce() {
  if (kv.get('bg.batteryAsked', false) || batteryUnrestricted() !== false) return;
  kv.set('bg.batteryAsked', true);
  setTimeout(() => requestBatteryUnrestricted(), 1500);
}
onServiceAction?.(a => { if (a === 'disconnect') disconnect(); }); // the notification's Disconnect button

let notifiedAt = 0;
function notifyProgress() {
  if (S.kind === 'sim' || Date.now() - notifiedAt < 5000) return;
  notifiedAt = Date.now();
  const v = val('0D');
  updateService(tr('Vindici is recording your trip'), [carLabel(), v != null ? Math.round(v) + ' km/h' : null, S.trip.dist.toFixed(1) + ' km'].filter(Boolean).join(' · '));
}

async function pollLoop(g: number) {
  const fails: Record<string, number> = {};
  while (S.elm && g === gen) {
    // Speed drives the trip distance, so read it between every few other signals: on a slow adapter or an older
    // car (K-line), a full round of signals can take several seconds.
    const keys = wantedKeys(), order: string[] = [];
    keys.filter(k => k !== '0D').forEach((k, i) => { if (keys.includes('0D') && i % 3 === 0) order.push('0D'); order.push(k); });
    if (!order.length && keys.includes('0D')) order.push('0D');
    for (const k of order) {
      if (!S.elm || busy || g !== gen) break;
      try {
        const elm = S.elm;
        const r = await locked(async (): Promise<{ skip: true } | { text: string[] | null } | { v: number | null }> => {
          if (busy || S.elm !== elm) return { skip: true }; // a one-shot request queued meanwhile: let it go first
          await ensureMode(elm, 'live');
          if (!(k in PIDS)) return { text: await OBD.text(elm, k) }; // a state or an unknown sensor
          return { v: k === '42' && adapterVolts()
            ? parseFloat((await elm.text('ATRV')).replace(/[^0-9.]/g, '')) || null
            : await OBD.value(elm, k) };
        });
        if ('skip' in r) break;
        lastOk = Date.now(); // it answered, even if with NO DATA
        if ('text' in r) { // shown as text on All sensors, never logged
          if (r.text == null) { if ((fails[k] = (fails[k] || 0) + 1) >= 5) S.dead.add(k); continue; }
          fails[k] = 0;
          S.texts[k] = { s: r.text, t: now() };
          emit();
          continue;
        }
        const v = r.v;
        if (v == null) { if ((fails[k] = (fails[k] || 0) + 1) >= 5 && k !== '0C' && k !== '0D') S.dead.add(k); continue; } // rpm and speed stay polled: they tell when the engine starts again
        fails[k] = 0;
        setValue(k, v);
      } catch {
        if (!S.elm || g !== gen) return;
        if (Date.now() - lastOk > STALL_MS) { lost(); return; } // no answer to anything: the link is dead
        await sleep(200);
      }
    }
    await sleep(busy ? 200 : 20);
    autoEnd();
    notifyProgress();
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

// The last module scan of each car, kept on the phone so All sensors can show it while disconnected.
export type ModuleScan = { at: number; protocol: string; ecu: string | null; modules: Record<string, number[]> };
function saveScan(car: string, protocol: string, pick: { ecu: string | null; modules: Record<string, number[]> }) {
  if (car && Object.keys(pick.modules).length) kv.set<ModuleScan>('modules.' + car, { at: Date.now(), protocol, ecu: pick.ecu, modules: pick.modules });
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
  return fuelRateFrom(val, vehicleById(S.vehicle)?.fuel ?? 'petrol');
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
      const r = await fn(elm);
      lastOk = Date.now(); // a long diag read must not look like a dead link to the polling loop's stall check
      return r;
    });
  } finally { busy--; }
}

export type ModuleCode = { code: string; ecu: string; module: string };
// A code from a module's own fault memory (UDS 19 02): failure type byte and status byte as the module reported them.
// kind: 'uds' (CAN, ISO 14229 status byte, failure type byte) or 'kwp' (K-line, ISO 14230 status byte, maker's hex code).
export type MemoryCode = ModuleCode & { kind: 'uds' | 'kwp'; ftb?: number; status: number; active: boolean };
type Readiness = { mil: boolean; count: number; diesel: boolean; monitors: { name: string; supported: boolean; complete: boolean }[] };
export type CodesResult = {
  stored: ModuleCode[];
  pending: ModuleCode[];
  permanent: ModuleCode[];
  memory: MemoryCode[]; // codes in the modules' own fault memory, active and history (CAN cars only)
  memoryRead: { ecu: string; module: string }[]; // modules whose fault memory was read
  memoryService: 'uds' | 'kwp' | null; // null: the car's protocol has no standard fault memory service
  vin: string | null; // Mode 09 PID 02, null when the car does not report it
  protocol: string; // the protocol the adapter detected
  modules: { ecu: string; module: string }[]; // the modules that answered the stored-codes request
  unanswered: ('pending' | 'permanent')[]; // requests no module answered (not supported, or lost)
  refused: string[]; // modules that refused a request
  mismatch: { ecu: string; module: string; reported: number; read: number }[]; // module says N codes, fewer were read
  readiness: (Readiness & { count: number }) | null;
};

// Modules found by a module scan, per car: { at, list: [{ ecu, req, name }] }.
export type ScannedModule = { ecu: string; req: string; name: string };
// Not 'modules.<car>': that key already holds the live-data PID map saved on connect (ModuleScan, another shape).
const scanKey = () => 'diagModules.' + S.vehicle;
export const scannedModules = (): { at: number; list: ScannedModule[] } | null => {
  const v = kv.get<any>(scanKey(), null);
  return v && Array.isArray(v.list) ? v : null;
};
const carMake = () => (vehicleById(S.vehicle) as any)?.make as string | undefined;
// A module's name: what it said about itself in the last scan, else the usual module at that address.
const label = (ecu: string) => ({ ecu, module: scannedModules()?.list.find(m => m.ecu === ecu)?.name ?? (addressName(ecu, carMake()) as string) });

// Asks every possible module address (see obd/scan.js) and remembers what answered for this car, so every later
// code read also asks those modules. onProgress gets { done, total, found }.
export async function scanAllModules(onProgress?: (p: { done: number; total: number; found: number }) => void): Promise<ScannedModule[]> {
  startDiagLog('module scan');
  try {
    const list = (await exclusive('diag', elm => scanModules(elm, { make: carMake(), onProgress }))) as ScannedModule[];
    adapterLog('#', 'modules found: ' + (list.map(m => `${m.ecu} (${m.name}, asked on ${m.req})`).join(', ') || 'none'));
    kv.set(scanKey(), { at: Date.now(), list });
    return list;
  } finally {
    endDiagLog(diagHeader('Module scan'));
  }
}
export const moduleScanSupported = () => !!S.elm && canScan(S.elm.protocolNumber);
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
      vin: (await OBD.vin(elm).catch(() => null)) as string | null,
    }));
    // Each module's own fault memory, with the service that matches the detected protocol (see OBD.memoryCodes).
    // A module that does not support it just refuses: that never hides the Mode 03 result above.
    type Mem = { service: 'uds' | 'kwp' | null; read: string[]; codes: { ecu: string; code: string; ftb?: number; status: number; active: boolean }[] };
    const saved = scannedModules()?.list ?? [];
    const targets = [...new Set([...Object.keys(r.stored.ecus), ...Object.keys(r.ready), ...saved.map(x => x.ecu)])].sort();
    const asked = targets.map(ecu => saved.find(x => x.ecu === ecu) ?? ecu); // a scanned module is asked on its own ID
    const m: Mem = targets.length ? (await exclusive('diag', elm => OBD.memoryCodes(elm, asked))) as Mem : { service: null, read: [], codes: [] };
    const memoryRead = m.read.map(label);
    const memory: MemoryCode[] = m.service ? m.codes.map(c => ({ ...c, ...label(c.ecu), kind: m.service! })) : [];
    memory.sort((a, b) => Number(b.active) - Number(a.active) || a.ecu.localeCompare(b.ecu) || a.code.localeCompare(b.code));
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
      memory,
      memoryRead,
      memoryService: m.service,
      vin: r.vin,
      protocol: S.elm?.protocolName ?? '',
      modules: [...new Set([...targets, ...m.read])].sort().map(label),
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
