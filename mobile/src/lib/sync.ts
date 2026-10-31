// Cloud sync with Supabase (schema `vindici`, one row per car / service item / trip, owned by the signed-in account).
//
// Local first: the phone stays the source of truth while driving and works offline. Changes are uploaded a few seconds
// after they happen, and everything is downloaded at sign-in, at start-up and with "Sync now".
// - Cars, papers, odometer, fuel price and services: the phone's copy wins while it has changes not uploaded yet,
//   otherwise the account's copy wins (empty fields in the account keep the phone's value).
// - Trips recorded on the phone are uploaded once (summary in `trips`, GPS trace and signal log in `trip_traces`).
//   Trips from the account (other phones, the Car Scanner CSV history) are kept in 'cloudTrips', summaries only;
//   their trace or KPIs are fetched when the trip is opened.
import { kv, useStored } from './store';
import { supabase } from './supabase';
import { currentUser } from './auth';
import { serviceKey, withStats, type Fuel, type Odometer, type ServiceItem, type Trip, type Vehicle } from './garage';

export type SyncState = { at: number | null; busy: boolean; error: string | null };
const IDLE: SyncState = { at: null, busy: false, error: null };
export const useSyncState = () => useStored<SyncState>('sync.state', IDLE);
const setState = (p: Partial<SyncState>) => kv.set('sync.state', { ...kv.get('sync.state', IDLE), ...p });

// vehicle local id -> row uuid, filled by every pull
const ids = () => kv.get<Record<string, string>>('sync.ids', {});
const uid = () => { const u = currentUser(); return u?.cloud && u.id ? u.id : null; };
export const syncOn = () => !!supabase && !!uid();

// ---------- mapping ----------
const date = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const str = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => (v == null || v === '' ? null : Number(v));

function vehicleRow(v: Vehicle, user: string) {
  const odo = kv.get<Odometer | null>('odometer.' + v.id, null), price = kv.get<number | null>('fuelPrice.' + v.id, null);
  return {
    user_id: user, local_id: v.id, make: v.make || '—', model: v.model, year: v.year, plate: v.plate, vin: v.vin, engine: v.engine,
    fuel: v.fuel, gearbox: v.gearbox, note: v.note,
    odometer_km: odo?.value ?? null, odometer_source: odo?.source ?? null, odometer_at: odo?.at ? new Date(odo.at).toISOString() : null,
    fuel_price: price,
    ins_company: v.insCompany, ins_policy: v.policy, ins_phone: v.insPhone, ins_start: date(v.insStart), ins_expiry: date(v.insExpiry),
    vt_last: date(v.vtLast), vt_next: date(v.vtNext), vt_result: v.vtResult, vt_center: v.vtCenter,
    updated_at: new Date().toISOString(), deleted_at: null,
  };
}
// The account's car over the phone's: fields left empty in the account keep the phone's value.
function vehicleFrom(r: any, local?: Vehicle): Vehicle {
  const pick = (remote: unknown, mine: string | undefined) => (remote == null || remote === '' ? mine ?? '' : String(remote));
  return {
    id: r.local_id, make: pick(r.make, local?.make), model: pick(r.model, local?.model), year: pick(r.year, local?.year),
    plate: pick(r.plate, local?.plate), vin: pick(r.vin, local?.vin), engine: pick(r.engine, local?.engine),
    fuel: (pick(r.fuel, local?.fuel) || 'petrol') as Fuel, gearbox: pick(r.gearbox, local?.gearbox), note: pick(r.note, local?.note),
    insCompany: pick(r.ins_company, local?.insCompany), policy: pick(r.ins_policy, local?.policy), insPhone: pick(r.ins_phone, local?.insPhone),
    insStart: pick(r.ins_start, local?.insStart), insExpiry: pick(r.ins_expiry, local?.insExpiry),
    vtLast: pick(r.vt_last, local?.vtLast), vtNext: pick(r.vt_next, local?.vtNext), vtResult: pick(r.vt_result, local?.vtResult), vtCenter: pick(r.vt_center, local?.vtCenter),
  };
}

const TRIP_COLS = 'id,local_id,source,vehicle_id,started_at,ended_at,distance_km,duration_s,moving_s,avg_speed_kmh,max_speed_kmh,fuel_l,'
  + 'city_pct,road_pct,highway_pct,start_lat,start_lng,end_lat,end_lng,start_place,end_place,car,'
  + 'coolant_avg:metrics->>avg_coolant_temp_c,coolant_max:metrics->>max_coolant_temp_c';

function tripFrom(r: any, vehicleOf: Record<string, string>): Trip {
  const start = Date.parse(r.started_at), time = n(r.duration_s) ?? 0, dist = n(r.distance_km) ?? 0, driving = n(r.moving_s) || time; // 0 = not computed
  const fuel = n(r.fuel_l) ?? 0, cAvg = n(r.coolant_avg), cMax = n(r.coolant_max);
  const pt = (a: unknown, b: unknown): [number, number] | null => (a == null || b == null ? null : [Number(a), Number(b)]);
  const vehicle = vehicleOf[r.vehicle_id] ?? undefined;
  const car = r.car ? { id: vehicle ?? '', name: [r.car.make, r.car.model].filter(Boolean).join(' '), make: str(r.car.make), model: str(r.car.model),
    year: str(r.car.year), engine: str(r.car.engine), plate: str(r.car.plate), vin: str(r.car.vin) } : undefined;
  return {
    id: r.local_id ?? 'c-' + r.id, cloudId: r.id, source: r.source === 'carscanner_csv' ? 'csv' : 'app',
    start, end: r.ended_at ? Date.parse(r.ended_at) : start + time * 1000, samples: [], path: [], vehicle, car,
    split: { city: n(r.city_pct) ?? 0, highway: n(r.highway_pct) ?? 0, road: n(r.road_pct) ?? 0 },
    places: r.start_place || r.end_place ? [r.start_place ?? '', r.end_place ?? ''] : undefined,
    ends: [pt(r.start_lat, r.start_lng), pt(r.end_lat, r.end_lng)],
    summary: {
      dist, time, driving, standing: Math.max(0, time - driving), fuel, maxSpeed: n(r.max_speed_kmh) ?? 0,
      avgSpeed: n(r.avg_speed_kmh) ?? (driving ? dist / (driving / 3600) : 0), consumption: dist > 0.05 && fuel ? (fuel / dist) * 100 : null,
      coolant: cAvg != null ? { avg: cAvg, max: cMax ?? cAvg, min: cAvg } : null,
    },
  };
}

function tripRow(tr: Trip, user: string) {
  const s = withStats([tr], undefined, false)[0].stats, first = tr.path[0], last = tr.path[tr.path.length - 1];
  return {
    user_id: user, local_id: tr.id, source: 'app', vehicle_id: ids()[tr.vehicle ?? ''] ?? null,
    started_at: new Date(tr.start).toISOString(), ended_at: new Date(tr.end).toISOString(),
    distance_km: +s.dist.toFixed(3), duration_s: Math.round(s.time), moving_s: Math.round(s.driving),
    avg_speed_kmh: +s.avgSpeed.toFixed(1), max_speed_kmh: s.maxSpeed, fuel_l: +s.fuel.toFixed(3),
    city_pct: tr.split.city, road_pct: tr.split.road, highway_pct: tr.split.highway,
    start_lat: first?.[0] ?? null, start_lng: first?.[1] ?? null, end_lat: last?.[0] ?? null, end_lng: last?.[1] ?? null,
    start_place: tr.places?.[0] ?? null, end_place: tr.places?.[1] ?? null, car: tr.car ?? null, updated_at: new Date().toISOString(),
  };
}

// ---------- pull ----------
async function pull(user: string) {
  const db = supabase!;
  const [vr, sr] = await Promise.all([
    db.from('vehicles').select('*').is('deleted_at', null),
    db.from('services').select('*').is('deleted_at', null),
  ]);
  if (vr.error) throw vr.error;
  if (sr.error) throw sr.error;

  const dirty = kv.get<number | null>('sync.dirty', null) != null;
  const known = new Set(kv.get<string[]>('sync.known', []));
  const local = kv.get<Vehicle[]>('vehicles', []);
  const byLocal = new Map(local.map(v => [v.id, v]));
  const map: Record<string, string> = {}, vehicleOf: Record<string, string> = {};
  for (const r of vr.data) { map[r.local_id] = r.id; vehicleOf[r.id] = r.local_id; }
  kv.set('sync.ids', map);

  // cars added on another phone (in the account, never seen here) are always added
  const added = vr.data.filter(r => !byLocal.has(r.local_id) && !known.has(r.local_id)).map(r => vehicleFrom(r));
  if (dirty) {
    if (added.length) kv.set('vehicles', [...local, ...added]);
  } else {
    // the account's cars over the phone's; cars only on the phone stay (they are uploaded next)
    const merged = local.map(v => (map[v.id] ? vehicleFrom(vr.data.find(r => r.local_id === v.id), v) : v))
      .filter(v => map[v.id] || !known.has(v.id)) // known before but gone from the account: deleted on another phone
      .concat(added);
    if (merged.length) kv.set('vehicles', merged);
    for (const r of vr.data) {
      if (r.odometer_km != null) kv.set('odometer.' + r.local_id, { value: Number(r.odometer_km), source: r.odometer_source ?? 'manual', at: r.odometer_at ? Date.parse(r.odometer_at) : 0 });
      if (r.fuel_price != null) kv.set('fuelPrice.' + r.local_id, Number(r.fuel_price));
      const items = sr.data.filter(s => s.vehicle_id === r.id);
      if (items.length) kv.set(serviceKey(r.local_id), items.map(s => ({ id: s.local_id.split('/').pop(), name: s.name, interval: s.interval_km ?? 0, last: s.last_km ?? 0, next: s.next_km ?? 0 } satisfies ServiceItem)));
    }
  }

  // trips: everything in the account, newest first, in pages of 1000
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('trips').select(TRIP_COLS).is('deleted_at', null).order('started_at', { ascending: false }).range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const prev = new Map(kv.get<Trip[]>('cloudTrips', []).map(tr => [tr.cloudId, tr]));
  kv.set('cloudTrips', rows.map(r => {
    const tr = tripFrom(r, vehicleOf), old = prev.get(r.id);
    return old?.samples.length ? { ...tr, samples: old.samples, path: old.path, log: old.log } : tr; // keep a trace already downloaded
  }));
  kv.set('sync.pushedTrips', [...new Set([...kv.get<string[]>('sync.pushedTrips', []), ...rows.filter(r => r.local_id).map(r => r.local_id)])]);
}

// ---------- push ----------
async function pushOwnership(user: string) {
  const db = supabase!, list = kv.get<Vehicle[]>('vehicles', []);
  if (list.length) {
    const { data, error } = await db.from('vehicles').upsert(list.map(v => vehicleRow(v, user)), { onConflict: 'user_id,local_id' }).select('id,local_id');
    if (error) throw error;
    const map = { ...ids() };
    for (const r of data) map[r.local_id] = r.id;
    kv.set('sync.ids', map);
  }
  const map = ids(), now = new Date().toISOString();
  // cars deleted on this phone
  const gone = Object.keys(map).filter(id => !list.some(v => v.id === id));
  if (gone.length) {
    const { error } = await db.from('vehicles').update({ deleted_at: now, updated_at: now }).in('local_id', gone);
    if (error) throw error;
    kv.set('sync.ids', Object.fromEntries(Object.entries(map).filter(([k]) => !gone.includes(k))));
  }
  // services: the phone's list per car, items removed on the phone are marked deleted
  for (const v of list) {
    const vid = map[v.id];
    if (!vid) continue;
    const items = kv.get<ServiceItem[] | null>(serviceKey(v.id), null);
    if (!items) continue;
    const rows = items.map(s => ({ user_id: user, vehicle_id: vid, local_id: `${v.id}/${s.id}`, name: s.name, interval_km: Math.round(s.interval), last_km: Math.round(s.last), next_km: Math.round(s.next), updated_at: now, deleted_at: null }));
    if (rows.length) {
      const { error } = await db.from('services').upsert(rows, { onConflict: 'user_id,local_id' });
      if (error) throw error;
    }
    const keep = rows.map(r => r.local_id);
    let q = db.from('services').update({ deleted_at: now, updated_at: now }).eq('vehicle_id', vid).is('deleted_at', null);
    if (keep.length) q = q.not('local_id', 'in', `(${keep.map(k => `"${k}"`).join(',')})`);
    const { error } = await q;
    if (error) throw error;
  }
  kv.set('sync.known', list.map(v => v.id));
  kv.remove('sync.dirty');
}

async function pushTrips(user: string) {
  const db = supabase!, done = new Set(kv.get<string[]>('sync.pushedTrips', []));
  for (const tr of kv.get<Trip[]>('trips', [])) {
    if (done.has(tr.id) || tr.demo) continue;
    const { data, error } = await db.from('trips').upsert(tripRow(tr, user), { onConflict: 'user_id,local_id' }).select('id').single();
    if (error) throw error;
    const trace = await db.from('trip_traces').upsert({ trip_id: data.id, user_id: user, path: tr.path, log: { ...(tr.log ?? { keys: [], rows: [] }), samples: tr.samples } });
    if (trace.error) throw trace.error;
    done.add(tr.id);
    kv.set('sync.pushedTrips', [...done]);
  }
}

// ---------- public ----------
let running: Promise<void> | null = null;
export function syncNow(): Promise<void> {
  const user = uid();
  if (!supabase || !user) return Promise.resolve();
  return (running ??= (async () => {
    setState({ busy: true, error: null });
    try {
      await pull(user);
      await pushOwnership(user);
      await pushTrips(user);
      setState({ busy: false, at: Date.now(), error: null });
    } catch (e: any) {
      setState({ busy: false, error: e?.message ?? String(e) });
    } finally {
      running = null;
    }
  })());
}

// Trips from the account are downloaded as summaries; this fetches one trip's GPS trace and signal log, or for a
// Car Scanner trip its full KPI row. Returns the KPIs (or null).
export async function loadTripDetail(tr: Trip): Promise<Record<string, unknown> | null> {
  if (!supabase || !tr.cloudId) return null;
  if (tr.source === 'csv') {
    const { data } = await supabase.from('trips').select('metrics').eq('id', tr.cloudId).single();
    return (data?.metrics as Record<string, unknown>) ?? null;
  }
  if (!tr.samples.length) {
    const { data } = await supabase.from('trip_traces').select('path,log').eq('trip_id', tr.cloudId).maybeSingle();
    if (data) {
      const { samples = [], ...log } = (data.log ?? {}) as any;
      kv.set('cloudTrips', kv.get<Trip[]>('cloudTrips', []).map(x => (x.cloudId === tr.cloudId ? { ...x, path: data.path ?? [], log, samples, summary: samples.length ? undefined : x.summary } : x)));
    }
  }
  return null;
}

// Uploads a few seconds after the last change, and a full sync at start-up and at sign-in.
let timer: ReturnType<typeof setTimeout> | null = null;
const OWNERSHIP = /^(vehicles$|services\.|odometer\.|fuelPrice\.)/;
export function startSync() {
  let lastUser = uid();
  const off = kv.onAnyChange(k => {
    if (k === 'user') {
      const u = uid();
      if (u && u !== lastUser) syncNow();
      lastUser = u;
      return;
    }
    if (!syncOn() || running) return; // changes made by a pull are not local edits
    if (OWNERSHIP.test(k)) kv.set('sync.dirty', Date.now());
    if (OWNERSHIP.test(k) || k === 'trips') {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; syncNow(); }, 4000);
    }
  });
  if (syncOn()) syncNow();
  return off;
}

