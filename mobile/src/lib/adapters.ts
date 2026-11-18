// The OBD adapter last connected to each car, per account. Kept on this phone only: lib/sync.ts uploads a fixed list
// of keys (cars, odometer, fuel price, services, trips), so this key never goes to the cloud.
import { currentUser } from './auth';
import { kv, useStored } from './store';
import type { ConnKind } from './transports/types';

export type SavedAdapter = { kind: Exclude<ConnKind, 'sim'>; id: string; name: string; at: number };
type ByCar = Record<string, SavedAdapter>;

const key = (u = currentUser()) => 'adapters.' + (u && !u.guest && u.id ? u.id : 'local');
export const savedAdapter = (car: string): SavedAdapter | null => kv.get<ByCar>(key(), {})[car] ?? null;
export function useSavedAdapter(car: string): SavedAdapter | null {
  useStored('user', null); // re-read when the account changes
  return useStored<ByCar>(key(), {})[car] ?? null;
}
export function saveAdapter(car: string, a: Omit<SavedAdapter, 'at'>) {
  kv.set(key(), { ...kv.get<ByCar>(key(), {}), [car]: { ...a, at: Date.now() } });
}
export function forgetAdapter(car: string) {
  const { [car]: _, ...rest } = kv.get<ByCar>(key(), {});
  kv.set(key(), rest);
}
