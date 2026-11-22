// Trips log, ownership papers (insurance, visite technique) and service calendar. Ported from garage.js in the web POC.
import { useMemo } from 'react';
import { kv, useStored } from './store';

export const DAY = 86400000;

// samples: [seconds since start, speed km/h, coolant °C, intake air °C, fuel rate L/h]
export type Sample = [number, number, number | null, number | null, number | null];
export type Split = { city: number; highway: number; road: number };
// Who drove: a copy of the car's identity at the time of the trip, so a trip stays traceable in a database
// even if the car is renamed, re-plated or deleted later.
export type CarRef = { id: string; name: string; make: string; model: string; year: string; engine: string; plate: string; vin: string };
// Every logged signal, one row per sample: row[0] is seconds since start, row[i] is the value of keys[i - 1] (PID, null if missing).
export type TripLog = { keys: string[]; rows: (number | null)[][] };
export type Trip = {
  id: string; start: number; end: number; samples: Sample[]; path: [number, number][];
  split: Split; demo?: boolean; places?: [string, string]; vehicle?: string; car?: CarRef; log?: TripLog;
  // Cloud trips (lib/sync.ts): `cloudId` is the row id in vindici.trips. Trips imported from the Car Scanner CSV
  // pipeline (source 'csv') only have a summary, no samples, trace or signal log.
  cloudId?: string; source?: 'app' | 'csv'; summary?: Partial<TripStats>; ends?: [[number, number] | null, [number, number] | null];
};
export type MinMax = { min: number; max: number; avg: number } | null;
export type TripStats = ReturnType<typeof tripStats>;
export type LiveTrip = { dist: number; fuel: number; time: number; moving: number; max: number; last: number | null; startedAt: number | null; samples: Sample[]; path: [number, number][]; log: TripLog };

export const newTrip = (keys: string[] = []): LiveTrip => ({ dist: 0, fuel: 0, time: 0, moving: 0, max: 0, last: null, startedAt: null, samples: [], path: [], log: { keys, rows: [] } });

export const carRef = (v: Vehicle): CarRef => ({ id: v.id, name: vehicleName(v), make: v.make, model: v.model, year: v.year, engine: v.engine, plate: v.plate, vin: v.vin });

// One signal of a trip as [seconds, value] points. Older trips without a log still have speed, temperatures and fuel rate.
const SAMPLE_COL: Record<string, number> = { '0D': 1, '05': 2, '0F': 3, '5E': 4 };
// Signals computed from the samples, for every trip that has speed and fuel rate (measured, or estimated from
// the MAF on cars without PID 5E, like the E60): fuel rate in L/h, and consumption in L/100km over the last 10 s
// (instant values swing too much to read). Not shown while standing still: L/100km has no meaning at 0 km/h.
export const DERIVED_META: Record<string, { name: string; unit: string; min: number; max: number; dp: number }> = {
  FR: { name: 'Fuel rate', unit: 'L/h', min: 0, max: 40, dp: 1 },
  L100: { name: 'Fuel consumption', unit: 'L/100km', min: 0, max: 30, dp: 1 },
};
const hasFuel = (tr: Trip) => withFuelFromLog(tr).some(s => s[4] != null);
export function tripKeys(tr: Trip): string[] {
  const base = tr.log?.keys.length ? tr.log.keys : Object.keys(SAMPLE_COL).filter(k => tr.samples.some(s => s[SAMPLE_COL[k]] != null));
  if (!hasFuel(tr)) return base;
  return [...base, ...(base.includes('5E') ? [] : ['FR']), 'L100'];
}
export function tripSeries(tr: Trip, key: string): [number, number][] {
  if (key === 'FR') return withFuelFromLog(tr).filter(s => s[4] != null).map(s => [s[0], s[4]!]);
  if (key === 'L100') return consumptionSeries(withFuelFromLog(tr));
  if (tr.log?.keys.length) {
    const i = tr.log.keys.indexOf(key) + 1;
    return i ? tr.log.rows.filter(r => r[i] != null).map(r => [r[0]!, r[i]!]) : [];
  }
  const c = SAMPLE_COL[key];
  return c ? tr.samples.filter(s => s[c] != null).map(s => [s[0], s[c]!]) : [];
}
function consumptionSeries(samples: Sample[], win = 10): [number, number][] {
  const out: [number, number][] = [], q: [number, number, number][] = []; // [t, km, L] per step
  let km = 0, L = 0;
  for (let i = 1; i < samples.length; i++) {
    const [t0, v0, , , r0] = samples[i - 1], [t1, v1, , , r1] = samples[i], dt = t1 - t0;
    if (dt <= 0 || dt > 10) continue;
    const d = ((v0 + v1) / 2) * dt / 3600, f = (((r0 ?? r1 ?? 0) + (r1 ?? r0 ?? 0)) / 2) * dt / 3600;
    q.push([t1, d, f]); km += d; L += f;
    while (q.length && q[0][0] <= t1 - win) { const [, a, b] = q.shift()!; km -= a; L -= b; }
    if (v1 > 3 && km > 0.01) out.push([t1, Math.min(50, (L / km) * 100)]);
  }
  return out;
}

// Fuel rate in L/h from one moment's PID values (get returns null when a PID is missing).
// PID 5E (engine fuel rate) is used as is when the car reports it. Otherwise it is estimated from the MAF:
// - petrol: burns at a fixed air/fuel ratio (14.7, 740 g/L). The fuel trims say how much fuel the ECU adds on top
//   of what the MAF implies (an air leak after the MAF, for example), so they correct it. Banks averaged.
// - diesel: no fixed ratio. A diesel runs very lean (about 55:1 at idle, about 22:1 under full load), so the petrol
//   ratio overstated it about 4 times. The fuel/air ratio is taken from the engine load instead:
//   λ⁻¹ = 0.25 + 0.0045 × load %, at 14.5:1 and 832 g/L. Fitted on two Ford Fiesta 1.5 TDCi trips that report
//   PID 5E: within 3 % of the car's own figure.
// Engine off (0 rpm) burns nothing, and MAF 655.35 g/s (FFFF) is the ECU saying "no value", not air.
export function fuelRateFrom(get: (k: string) => number | null | undefined, fuel: Fuel = 'petrol'): number | null {
  const v = (k: string) => get(k) ?? null;
  const r = v('5E');
  if (r != null) return r;
  if (fuel === 'electric') return null;
  const maf = v('10');
  if (maf == null || maf >= 655) return null;
  if (v('0C') === 0) return 0;
  if (fuel === 'diesel') {
    const load = v('04');
    const phi = load == null ? 0.35 : Math.min(0.9, 0.25 + 0.0045 * load);
    return (maf * phi * 3600) / (14.5 * 832);
  }
  const bank = (s: string, l: string) => (v(s) != null || v(l) != null ? (v(s) ?? 0) + (v(l) ?? 0) : null);
  const trims = [bank('06', '07'), bank('08', '09')].filter((x): x is number => x != null);
  const trim = trims.length ? trims.reduce((a, b) => a + b, 0) / trims.length : 0;
  return ((maf * 3600) / (14.7 * 740)) * (1 + Math.max(-25, Math.min(40, trim)) / 100);
}

// Trips recorded before the diesel formula stored a petrol estimate. When the trip has its signal log and the car
// gives no PID 5E, the fuel rate is worked out again from the log with the car's fuel type.
export function withFuelFromLog(tr: Trip): Sample[] {
  const log = tr.log;
  if (!log?.keys.includes('10') || log.keys.includes('5E') || log.rows.length !== tr.samples.length) return tr.samples;
  const fuel = vehicleById(tr.vehicle ?? '')?.fuel ?? 'petrol', col = new Map(log.keys.map((k, i) => [k, i + 1]));
  return tr.samples.map((s, i) => {
    const row = log.rows[i];
    const rate = fuelRateFrom(k => (col.has(k) ? row[col.get(k)!] : null), fuel);
    return [s[0], s[1], s[2], s[3], rate == null ? null : Math.round(rate * 100) / 100];
  });
}

export function tripStats(samples: Sample[]) {
  let dist = 0, fuel = 0, driving = 0, maxSpeed = 0, hardAcc = 0, hardBrake = 0, maxAcc = 0, maxDec = 0, inAcc = false, inBrake = false;
  for (let i = 1; i < samples.length; i++) {
    const [t0, v0] = samples[i - 1], [t1, v1, , , rate] = samples[i], dt = t1 - t0;
    if (dt <= 0 || dt > 10) continue;
    dist += ((v0 + v1) / 2) * dt / 3600;
    if (rate != null) fuel += rate * dt / 3600;
    if (v1 > 0) driving += dt;
    maxSpeed = Math.max(maxSpeed, v1);
    const a = (v1 - v0) / 3.6 / dt; // m/s²
    maxAcc = Math.max(maxAcc, a); maxDec = Math.min(maxDec, a);
    if (a > 2 && !inAcc) hardAcc++;
    if (a < -2.5 && !inBrake) hardBrake++;
    inAcc = a > 2; inBrake = a < -2.5;
  }
  const series = (i: number) => samples.map(s => s[i]).filter((v): v is number => v != null);
  const mma = (arr: number[]): MinMax => (arr.length ? { min: Math.min(...arr), max: Math.max(...arr), avg: arr.reduce((a, b) => a + b, 0) / arr.length } : null);
  const time = samples.length ? samples[samples.length - 1][0] : 0;
  return {
    dist, fuel, time, driving, standing: time - driving, maxSpeed,
    avgSpeed: driving ? dist / (driving / 3600) : 0, consumption: dist > 0.05 ? (fuel / dist) * 100 : null,
    coolant: mma(series(2)), iat: mma(series(3)), hardAcc, hardBrake, maxAcc, maxDec: -maxDec,
  };
}

// Placeholder for the backend speed-profile classifier: a random split that sums to 100 %.
export function randomSplit(rand = Math.random): Split {
  const a = 20 + rand() * 50, b = rand() * (100 - a);
  const p = [a, b].map(Math.round);
  return { city: p[0], highway: p[1], road: 100 - p[0] - p[1] };
}

export const useFuelPrice = (id: string) => useStored<number>('fuelPrice.' + id, DEFAULT_FUEL_PRICE[vehicleById(id)?.fuel ?? 'petrol']);

// Saves the trip with the car's identity (id, name, plate, VIN…) copied onto the record. Kept to the last 60 trips:
// every signal is logged once a second, and the browser's storage is small.
export function finishTrip(T: LiveTrip, vehicle = activeId(), end = Date.now()) {
  if (T.samples.length > 5 && T.dist > 0.05) {
    const trips = kv.get<Trip[]>('trips', []), v = vehicleById(vehicle);
    kv.set('trips', [{ id: Date.now().toString(36), start: T.startedAt!, end, samples: T.samples, path: T.path, split: randomSplit(), vehicle,
      car: v ? carRef(v) : undefined, log: T.log }, ...trips].slice(0, 60));
    bumpOdometer(T.dist, vehicle);
  }
}

// ---------- demo trips (deterministic, so the screens are never empty) ----------
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PLACES: Record<string, [number, number, string]> = {
  maarif: [33.5835, -7.6326, 'Maarif, Casablanca'], ainDiab: [33.5932, -7.6853, 'Ain Diab, Casablanca'],
  sidiMaarouf: [33.5302, -7.6455, 'Sidi Maarouf, Casablanca'], centre: [33.5951, -7.6187, 'Centre-ville, Casablanca'],
  bouskoura: [33.4489, -7.6486, 'Bouskoura'], mohammedia: [33.6866, -7.383, 'Mohammedia'], rabat: [34.0209, -6.8416, 'Agdal, Rabat'],
};

// L/100km by road type: [city, road, highway] base, plus a random spread.
const CONSUMPTION: Record<string, [number, number, number]> = { e60: [13.5, 8, 9.5], x5: [10.5, 7, 8.5] };

function demoTrip(vehicle: string, seed: number, dayOffset: number, startHour: number, from: string, to: string, distKm: number): Trip {
  const [cCity, cRoad, cHwy] = CONSUMPTION[vehicle];
  const rand = mulberry32(seed), split = randomSplit(rand);
  const legs: [keyof Split, number][] = [['city', split.city * 0.6], ['road', split.road / 2], ['highway', split.highway], ['road', split.road / 2], ['city', split.city * 0.4]];
  const target = { city: [35, 15], road: [75, 12], highway: [112, 8] };
  const samples: Sample[] = [], rows: (number | null)[][] = [], dists: number[] = [];
  const diesel = vehicle === 'x5', ratio = diesel ? [0, 105, 62, 41, 31, 25, 21] : [0, 120, 72, 49, 37, 30, 25]; // rpm per km/h in each gear
  let t = 0, v = 0, d = 0, stopIn = 0.4 + rand() * 0.4, stopped = 0, oil = 22;
  const dt = 2;
  for (const [kind, pct] of legs) {
    const legEnd = d + (distKm * pct) / 100;
    while (d < legEnd) {
      const [mean, sd] = target[kind];
      if (kind === 'city' && stopIn <= 0) { // traffic light or junction
        v = Math.max(0, v - (rand() < 0.15 ? 20 : 9)); // sometimes a hard stop
        if (v === 0 && ++stopped > 6 + rand() * 12) { stopped = 0; stopIn = 0.3 + rand() * 0.6; }
      } else {
        const goal = mean + (rand() - 0.5) * 2 * sd;
        if (kind === 'city' && v < 15 && rand() < 0.08) v += 16; // occasional brisk launch from a stop
        else v = Math.max(0, v + Math.max(-6, Math.min(kind === 'city' ? 7 : 5, (goal - v) * 0.25 + (rand() - 0.5) * 3)));
      }
      const step = (v * dt) / 3600;
      d += step; stopIn -= step; t += dt;
      const coolant = Math.min(89 + rand() * 4, 24 + t / 7);
      const iat = 24 + Math.min(14, t / 120) + rand() * 3 + (v < 5 ? 4 : 0);
      const cons = kind === 'city' ? cCity + rand() * 4 : kind === 'road' ? cRoad + rand() * 1.5 : cHwy + rand() * 1.5;
      const rate = v < 2 ? 0.75 : (cons * v) / 100, acc = samples.length ? (v - samples[samples.length - 1][1]) / dt : 0;
      samples.push([t, Math.round(v), Math.round(coolant), Math.round(iat), rate]);
      const gear = v < 3 ? 0 : v < 18 ? 1 : v < 35 ? 2 : v < 55 ? 3 : v < 75 ? 4 : v < 95 ? 5 : 6;
      const rpm = gear ? v * ratio[gear] + (rand() - 0.5) * 80 : 720 + rand() * 60;
      const throttle = Math.max(0, Math.min(100, gear ? 8 + v * 0.12 + acc * 9 + rand() * 4 : 0));
      oil += (Math.min(coolant + 8, 105) - oil) * 0.004 * dt;
      rows.push([t, Math.round(v), Math.round(rpm), Math.round(throttle), Math.round(Math.max(12, Math.min(100, throttle * 0.9 + 14 + rand() * 4))),
        Math.round(coolant), Math.round(iat), Math.round(oil), +rate.toFixed(2), +(14.05 + (rand() - 0.5) * 0.25).toFixed(2)]);
      dists.push(d);
    }
  }
  const start = new Date(new Date().setHours(startHour, Math.floor(rand() * 60), 0, 0) - dayOffset * DAY).getTime();
  const v0 = VEHICLES_DEFAULT.find(x => x.id === vehicle)!;
  return { id: 'demo' + seed, demo: true, vehicle, car: carRef(v0), start, end: start + t * 1000, samples,
    log: { keys: ['0D', '0C', '11', '04', '05', '0F', '5C', '5E', '42'], rows },
    path: demoRoute(PLACES[from], PLACES[to], dists, d, rand), places: [PLACES[from][2], PLACES[to][2]], split };
}

// A plausible GPS trace between two places: the straight line bent into a wide curve, plus a slow random wander,
// sampled every few seconds along the distance actually driven. The real app records the phone's GPS instead.
function demoRoute(a: [number, number, string], b: [number, number, string], dists: number[], total: number, rand: () => number): [number, number][] {
  const out: [number, number][] = [];
  const dLat = b[0] - a[0], dLng = b[1] - a[1], len = Math.hypot(dLat, dLng) || 1;
  const nLat = -dLng / len, nLng = dLat / len, bend = (rand() < 0.5 ? -1 : 1) * (0.12 + rand() * 0.18) * len;
  let wLat = 0, wLng = 0;
  for (let i = 0; i < dists.length; i += 3) {
    const f = total ? dists[i] / total : 0;
    wLat = wLat * 0.95 + (rand() - 0.5) * 0.012 * len; wLng = wLng * 0.95 + (rand() - 0.5) * 0.012 * len;
    const side = Math.sin(Math.PI * f) * bend + Math.sin(Math.PI * 3 * f) * bend * 0.25, damp = Math.sin(Math.PI * f);
    out.push([a[0] + dLat * f + nLat * side + wLat * damp, a[1] + dLng * f + nLng * side + wLng * damp]);
  }
  out.push([b[0], b[1]]);
  return out;
}

export type TripWithStats = Trip & { stats: TripStats };

// Trips recorded on this phone plus the ones downloaded from the account (other phones, Car Scanner history).
// A trip that is both local and in the cloud is shown once, from the local copy.
export function useTrips(): Trip[] {
  const local = useStored<Trip[]>('trips', []), cloud = useStored<Trip[]>('cloudTrips', []);
  return useMemo(() => {
    if (!cloud.length) return local;
    const ids = new Set(local.map(tr => tr.id));
    return local.concat(cloud.filter(tr => !ids.has(tr.id)));
  }, [local, cloud]);
}
let demoCache: TripWithStats[] | null = null;
const demoTrips = () => (demoCache ??= [
  demoTrip('e60', 11, 0, 13, 'maarif', 'ainDiab', 12.6), demoTrip('e60', 12, 0, 8, 'sidiMaarouf', 'maarif', 10.2),
  demoTrip('e60', 14, 2, 9, 'rabat', 'centre', 92.5), demoTrip('e60', 16, 5, 12, 'ainDiab', 'bouskoura', 21.3),
  demoTrip('x5', 13, 1, 18, 'centre', 'mohammedia', 27.4), demoTrip('x5', 15, 3, 17, 'bouskoura', 'sidiMaarouf', 14.8),
  demoTrip('x5', 17, 0, 17, 'mohammedia', 'rabat', 64.1), demoTrip('x5', 18, 4, 10, 'maarif', 'bouskoura', 18.9),
].map(tr => ({ ...tr, stats: tripStats(tr.samples) })));

const statsCache = new WeakMap<Trip, TripWithStats>();
// All trips, or only one vehicle's. Trips saved before vehicles existed count as the first vehicle's.
// The sample trips are left out once the user turns off demo data in Settings.
const statsOf = (tr: Trip): TripStats => (tr.summary && !tr.samples.length ? { ...tripStats([]), ...tr.summary } : tripStats(withFuelFromLog(tr)));
export const withStats = (trips: Trip[], vehicle?: string, demo = kv.get<{ demo?: boolean }>('settings', {}).demo !== false) =>
  trips.map(tr => statsCache.get(tr) ?? (statsCache.set(tr, { ...tr, stats: statsOf(tr) }), statsCache.get(tr)!)).concat(demo ? demoTrips() : [])
    .filter(tr => !vehicle || (tr.vehicle ?? VEHICLES_DEFAULT[0].id) === vehicle)
    .sort((a, b) => b.start - a.start);

// ---------- vehicles (the garage: every screen shows the selected car) ----------
export type Fuel = 'petrol' | 'diesel' | 'hybrid' | 'electric' | 'lpg';
export type Vehicle = {
  id: string; make: string; model: string; year: string; plate: string; engine: string; fuel: Fuel; gearbox: string; note: string; vin: string;
  insCompany: string; policy: string; insPhone: string; insStart: string; insExpiry: string;
  vtLast: string; vtNext: string; vtResult: string; vtCenter: string;
};
export const FUELS: [Fuel, string][] = [['petrol', 'Petrol'], ['diesel', 'Diesel'], ['hybrid', 'Hybrid'], ['electric', 'Electric'], ['lpg', 'LPG']];
const DEFAULT_FUEL_PRICE: Record<Fuel, number> = { petrol: 14.5, diesel: 12.9, hybrid: 14.5, electric: 0, lpg: 7 }; // MAD/L, examples

// Mileages, insurance and inspection dates are demo values to edit in the app.
export const VEHICLES_DEFAULT: Vehicle[] = [
  {
    id: 'e60', make: 'BMW', model: '525i E60', year: '2003', plate: '7361-B-6', engine: '2.5', fuel: 'petrol', gearbox: 'ZF 6HP19 automatic', note: 'pre-LCI', vin: '',
    insCompany: 'Example Assurance', policy: 'POL-2026-004512', insPhone: '+212 522 00 00 00', insStart: '2026-01-16', insExpiry: '2027-01-15',
    vtLast: '2025-11-20', vtNext: '2026-11-20', vtResult: 'Favorable', vtCenter: 'Centre de visite technique, Ain Sebaa',
  },
  {
    id: 'x5', make: 'BMW', model: 'X5 xDrive', year: '', plate: '', engine: '3.0', fuel: 'diesel', gearbox: 'Automatic', note: '', vin: '',
    insCompany: 'Example Assurance', policy: 'POL-2026-007730', insPhone: '+212 522 00 00 00', insStart: '2026-03-02', insExpiry: '2027-03-01',
    vtLast: '2026-02-10', vtNext: '2027-02-10', vtResult: 'Favorable', vtCenter: 'Centre de visite technique, Ain Sebaa',
  },
];
export const BLANK_VEHICLE: Omit<Vehicle, 'id'> = {
  make: '', model: '', year: '', plate: '', engine: '', fuel: 'petrol', gearbox: '', note: '', vin: '',
  insCompany: '', policy: '', insPhone: '', insStart: '', insExpiry: '', vtLast: '', vtNext: '', vtResult: 'Favorable', vtCenter: '',
};

export const useVehicles = () => useStored<Vehicle[]>('vehicles', VEHICLES_DEFAULT);
const vehicles = () => kv.get<Vehicle[]>('vehicles', VEHICLES_DEFAULT);
export const vehicleById = (id: string) => vehicles().find(v => v.id === id);
export const activeId = () => {
  const id = kv.get<string>('vehicle', VEHICLES_DEFAULT[0].id), list = vehicles();
  return list.some(v => v.id === id) ? id : list[0]?.id ?? '';
};
export function useVehicle(): Vehicle {
  const list = useVehicles(), id = useStored<string>('vehicle', VEHICLES_DEFAULT[0].id);
  return list.find(v => v.id === id) ?? list[0];
}
export const selectVehicle = (id: string) => kv.set('vehicle', id);
export const saveVehicle = (v: Vehicle) => kv.set('vehicles', vehicles().map(x => (x.id === v.id ? v : x)));
export function addVehicle(v: Omit<Vehicle, 'id'>, odo: number): string {
  const id = Date.now().toString(36);
  kv.set('vehicles', [...vehicles(), { ...v, id }]);
  kv.set(odoKey(id), { value: odo, source: 'manual', at: Date.now() });
  kv.set(serviceKey(id), starterServices(v.fuel, odo));
  selectVehicle(id);
  return id;
}
// Removes the car with its service list, odometer, fuel price and saved trips. The last car cannot be deleted.
export function deleteVehicle(id: string) {
  const list = vehicles().filter(v => v.id !== id);
  if (!list.length) return;
  kv.set('vehicles', list);
  for (const k of [serviceKey(id), odoKey(id), 'fuelPrice.' + id]) kv.remove(k);
  kv.set('trips', kv.get<Trip[]>('trips', []).filter(tr => tr.vehicle !== id));
  if (kv.get('vehicle', '') === id) selectVehicle(list[0].id);
}
export const vehicleName = (v: Pick<Vehicle, 'make' | 'model'>) => [v.make, v.model].filter(Boolean).join(' ');
export const vehicleTitle = (v: Vehicle) => [vehicleName(v), v.year].filter(Boolean).join(' · ');
export const fuelLabel = (f: Fuel) => FUELS.find(x => x[0] === f)?.[1] ?? f;

export type Due = { kind: 'ok' | 'warn' | 'bad' | 'off'; text: string; days: number | null };
export function dueStatus(date: string, warnDays = 30): Due {
  if (!date) return { kind: 'off', text: 'Not set', days: null };
  const days = Math.ceil((new Date(date + 'T23:59:59').getTime() - Date.now()) / DAY);
  if (days < 0) return { kind: 'bad', text: `Expired ${-days} day${days === -1 ? '' : 's'} ago`, days };
  if (days <= warnDays) return { kind: 'warn', text: `Due in ${days} day${days === 1 ? '' : 's'}`, days };
  return { kind: 'ok', text: `Valid · ${days} days left`, days };
}

// ---------- service calendar (one list and one odometer per vehicle) ----------
export type ServiceItem = { id: string; name: string; interval: number; last: number; next: number };
const item = (id: string, name: string, interval: number, last: number): ServiceItem => ({ id, name, interval, last, next: last + interval });
export const SERVICE_DEFAULT: Record<string, ServiceItem[]> = {
  e60: [ // M54 straight-six: timing chain, so no belt
    item('oil', 'Engine oil', 10000, 239000), item('oilf', 'Oil filter', 10000, 239000), item('air', 'Air filter', 30000, 221000),
    item('plugs', 'Spark plugs', 60000, 192000), item('cabin', 'Cabin filter', 20000, 231000), item('gear', 'Gearbox oil (6HP19)', 80000, 170000),
    item('coolant', 'Coolant', 60000, 205000), item('brake', 'Brake fluid', 40000, 206000),
  ],
  x5: [
    item('oil', 'Engine oil', 15000, 148900), item('oilf', 'Oil filter', 15000, 148900), item('fuelf', 'Fuel filter', 60000, 95000),
    item('air', 'Air filter', 30000, 131000), item('cabin', 'Cabin filter', 20000, 137000), item('gear', 'Gearbox oil', 80000, 92000),
    item('transfer', 'Transfer case oil', 80000, 92000), item('brake', 'Brake fluid', 40000, 128000),
  ],
};
// A fresh list for a newly added car, counted from its current mileage.
function starterServices(fuel: Fuel, odo: number): ServiceItem[] {
  const o = Math.round(odo);
  if (fuel === 'electric') return [item('cabin', 'Cabin filter', 20000, o), item('brake', 'Brake fluid', 40000, o), item('tyres', 'Tyre rotation', 10000, o)];
  return [
    item('oil', 'Engine oil', 10000, o), item('oilf', 'Oil filter', 10000, o), item('air', 'Air filter', 30000, o), item('cabin', 'Cabin filter', 20000, o),
    fuel === 'diesel' ? item('fuelf', 'Fuel filter', 40000, o) : item('plugs', 'Spark plugs', 60000, o),
    item('brake', 'Brake fluid', 40000, o), item('coolant', 'Coolant', 60000, o),
  ];
}
export const serviceKey = (id: string) => 'services.' + id;
export const useServices = (id: string) => useStored<ServiceItem[]>(serviceKey(id), SERVICE_DEFAULT[id] ?? []);

export type Odometer = { value: number; source: 'manual' | 'car'; at: number };
const ODO_DEFAULT: Record<string, Odometer> = { e60: { value: 248300, source: 'manual', at: 0 }, x5: { value: 156400, source: 'manual', at: 0 } };
const odoKey = (id: string) => 'odometer.' + id;
export const useOdometer = (id: string) => useStored<Odometer>(odoKey(id), ODO_DEFAULT[id] ?? { value: 0, source: 'manual', at: 0 });
export const odometer = (id = activeId()) => kv.get<Odometer>(odoKey(id), ODO_DEFAULT[id] ?? { value: 0, source: 'manual', at: 0 });
export function setOdometer(v: number, source: Odometer['source'], id = activeId()) {
  const o = odometer(id);
  if (o.source === source && Math.abs(o.value - v) < 0.1) return;
  kv.set(odoKey(id), { value: v, source, at: Date.now() });
}
function bumpOdometer(dist: number, id: string) {
  const o = odometer(id);
  if (o.source !== 'car') kv.set(odoKey(id), { ...o, value: o.value + dist });
}

export function serviceState(s: ServiceItem, odo: number) {
  const span = Math.max(1, s.next - s.last), used = (odo - s.last) / span, left = s.next - odo;
  const kind: 'ok' | 'warn' | 'bad' = left < 0 ? 'bad' : left <= Math.min(1000, span * 0.1) ? 'warn' : 'ok';
  return { used, left, kind, label: left < 0 ? 'Overdue' : kind === 'warn' ? 'Due soon' : 'OK' };
}
