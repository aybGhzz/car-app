// Notifications: rules, the inbox, and the pop-up banner.
// - Signal rules watch a live value ("coolant above 105 °C"). The same rules colour the dashboard gauges, so a gauge's
//   colour change and its alert are set up in one place. Each rule applies to every car or to one car.
// - Document and maintenance rules count down to the insurance expiry, the visite technique and the next service.
import { useSyncExternalStore } from 'react';
import { kv, useStored } from './store';
import { DAY, dueStatus, odometer, serviceKey, serviceState, SERVICE_DEFAULT, vehicleName, VEHICLES_DEFAULT, type ServiceItem, type Vehicle } from './garage';
import { settings } from './settings';
import { C } from './theme';

export type SignalRule = {
  id: string; pid: string; op: 'above' | 'below'; value: number;
  color?: string; // gauge colour while the rule matches
  notify: boolean; // send a notification when the value crosses the threshold
  enabled: boolean;
  scope: 'all' | string; // every car, or one vehicle id
};
export type DocRules = { insurance: { enabled: boolean; days: number }; vt: { enabled: boolean; days: number }; service: { enabled: boolean; km: number } };
export type Notif = { id: string; key: string; at: number; title: string; body: string; level: 'info' | 'warn' | 'bad'; vehicle?: string; read: boolean; route?: string };

export const RULES_DEFAULT: SignalRule[] = [
  { id: 'coolant-hot', pid: '05', op: 'above', value: 105, color: C.bad, notify: true, enabled: true, scope: 'all' },
  { id: 'coolant-cold', pid: '05', op: 'below', value: 60, color: C.accent, notify: false, enabled: true, scope: 'all' },
  { id: 'battery-low', pid: '42', op: 'below', value: 12, color: C.warn, notify: true, enabled: true, scope: 'all' },
  { id: 'fuel-low', pid: '2F', op: 'below', value: 12, color: C.warn, notify: true, enabled: true, scope: 'all' },
];
export const DOC_DEFAULT: DocRules = { insurance: { enabled: true, days: 20 }, vt: { enabled: true, days: 20 }, service: { enabled: true, km: 1000 } };

export const useRules = () => useStored<SignalRule[]>('alerts.signals', RULES_DEFAULT);
export const rules = () => kv.get<SignalRule[]>('alerts.signals', RULES_DEFAULT);
export const saveRule = (r: SignalRule) => {
  const list = rules();
  kv.set('alerts.signals', list.some(x => x.id === r.id) ? list.map(x => (x.id === r.id ? r : x)) : [...list, r]);
};
export const deleteRule = (id: string) => kv.set('alerts.signals', rules().filter(r => r.id !== id));
export const newRuleId = () => 'r' + Date.now().toString(36);

export const useDocRules = () => ({ ...DOC_DEFAULT, ...useStored<Partial<DocRules>>('alerts.docs', {}) });
const docRules = (): DocRules => ({ ...DOC_DEFAULT, ...kv.get<Partial<DocRules>>('alerts.docs', {}) });
export const setDocRule = <K extends keyof DocRules>(k: K, v: DocRules[K]) => kv.set('alerts.docs', { ...kv.get<Partial<DocRules>>('alerts.docs', {}), [k]: v });

const applies = (r: SignalRule, vehicle: string) => r.enabled && (r.scope === 'all' || r.scope === vehicle);
const matches = (r: SignalRule, v: number) => (r.op === 'above' ? v > r.value : v < r.value);

// The colour a gauge should take for this value: the first matching rule that sets one.
export function ruleColor(list: SignalRule[], pid: string, v: number | null, vehicle: string): string | null {
  if (v == null) return null;
  return list.find(r => r.pid === pid && r.color && applies(r, vehicle) && matches(r, v))?.color ?? null;
}

// ---------- inbox ----------
export const useNotifs = () => useStored<Notif[]>('notifications', []);
export const useUnread = () => useNotifs().filter(n => !n.read).length;
export const markAllRead = () => kv.set('notifications', kv.get<Notif[]>('notifications', []).map(n => ({ ...n, read: true })));
export const markRead = (id: string) => kv.set('notifications', kv.get<Notif[]>('notifications', []).map(n => (n.id === id ? { ...n, read: true } : n)));
export const clearNotifs = () => kv.set('notifications', []);

// The banner shown at the top of the screen for the newest notification.
let toast: Notif | null = null;
const toastListeners = new Set<() => void>();
export const useToast = () => useSyncExternalStore(f => { toastListeners.add(f); return () => toastListeners.delete(f); }, () => toast);
export const dismissToast = () => { toast = null; toastListeners.forEach(f => f()); };

// Adds a notification unless one with the same key is already in the inbox (each event is told once).
export function push(n: Omit<Notif, 'id' | 'at' | 'read'>, popup = true) {
  const list = kv.get<Notif[]>('notifications', []);
  if (list.some(x => x.key === n.key)) return;
  const item: Notif = { ...n, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now(), read: false };
  kv.set('notifications', [item, ...list].slice(0, 100));
  if (popup && settings().popups) { toast = item; toastListeners.forEach(f => f()); }
}

// ---------- live signals ----------
const active = new Map<string, number>(); // rule id -> when it fired; cleared when the value goes back to normal
type PidMeta = { name: string; unit: string; dp: number; min: number; max: number };

export function checkSignal(pid: string, v: number, vehicle: string, m: PidMeta) {
  if (!settings().notifications) return;
  for (const r of rules()) {
    if (r.pid !== pid || !r.notify || !applies(r, vehicle)) continue;
    const hyst = (m.max - m.min) * 0.02; // must come back 2 % of the range before it can fire again
    const on = active.has(r.id);
    if (!on && matches(r, v)) {
      active.set(r.id, Date.now());
      const car = vehicleName(vehicles().find(x => x.id === vehicle) ?? { make: '', model: '' });
      push({
        key: `sig.${r.id}.${vehicle}.${Math.floor(Date.now() / 300000)}`, // at most once per 5 minutes
        title: `${m.name} ${r.op} ${fmt(r.value, m.dp)} ${m.unit}`, body: `${car}: ${fmt(v, m.dp)} ${m.unit}`,
        level: r.color === C.bad || pid === '05' ? 'bad' : 'warn', vehicle, route: '/dashboard',
      });
    } else if (on && (r.op === 'above' ? v < r.value - hyst : v > r.value + hyst)) active.delete(r.id);
  }
}
export const resetSignals = () => active.clear();
const fmt = (v: number, dp: number) => Number(v.toFixed(dp)).toString();
const vehicles = () => kv.get<Vehicle[]>('vehicles', VEHICLES_DEFAULT);

// ---------- documents and maintenance ----------
// Run at start-up and whenever a car, its papers or its service list change. Keys hold the due date or mileage,
// so a renewed insurance gets a fresh alert next year.
export function checkDocs() {
  if (!settings().notifications) return;
  const R = docRules();
  for (const v of vehicles()) {
    const name = vehicleName(v) + (v.plate ? ` (${v.plate})` : '');
    const doc = (kind: 'insurance' | 'vt', date: string, label: string) => {
      const rule = R[kind], d = dueStatus(date);
      if (!rule.enabled || d.days == null || d.days > rule.days) return;
      push({
        key: `${kind}.${v.id}.${date}.${d.days < 0 ? 'late' : 'soon'}`, vehicle: v.id, route: '/papers', level: d.days < 7 ? 'bad' : 'warn',
        title: d.days < 0 ? `${label} expired` : `${label} in ${d.days} days`, body: name,
      }, false);
    };
    doc('insurance', v.insExpiry, 'Insurance');
    doc('vt', v.vtNext, 'Visite technique');
    if (R.service.enabled) {
      const odo = odometer(v.id).value;
      for (const s of kv.get<ServiceItem[]>(serviceKey(v.id), SERVICE_DEFAULT[v.id] ?? [])) {
        const st = serviceState(s, odo);
        if (st.left > R.service.km) continue;
        push({
          key: `svc.${v.id}.${s.id}.${s.next}`, vehicle: v.id, route: '/service', level: st.left < 0 ? 'bad' : 'warn',
          title: st.left < 0 ? `${s.name} overdue` : `${s.name} due in ${Math.round(st.left)} km`, body: name,
        }, false);
      }
    }
  }
}

export function watchDocs() {
  let timer: any = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(checkDocs, 400); };
  checkDocs();
  const offs = ['vehicles', 'alerts.docs', 'settings'].map(k => kv.subscribe(k, later));
  const day = setInterval(checkDocs, DAY / 24);
  return () => { offs.forEach(f => f()); clearInterval(day); };
}
