// Small key/value store: everything is loaded into memory at start-up, reads are synchronous,
// writes go to AsyncStorage in the background. useStored() re-renders when a key changes.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const PREFIX = 'obd.';
const mem: Record<string, unknown> = {};
const defaults: Record<string, unknown> = {}; // stable default objects, so useSyncExternalStore sees no change
const listeners = new Map<string, Set<() => void>>();

export const kv = {
  async hydrate() {
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(PREFIX));
      for (const [k, v] of await AsyncStorage.multiGet(keys)) if (v != null) mem[k.slice(PREFIX.length)] = JSON.parse(v);
    } catch {}
  },
  get<T>(k: string, d: T): T {
    return (k in mem ? mem[k] : (defaults[k] ??= d)) as T;
  },
  set<T>(k: string, v: T) {
    mem[k] = v;
    AsyncStorage.setItem(PREFIX + k, JSON.stringify(v)).catch(() => {});
    listeners.get(k)?.forEach(f => f());
  },
  remove(k: string) {
    delete mem[k];
    AsyncStorage.removeItem(PREFIX + k).catch(() => {});
    listeners.get(k)?.forEach(f => f());
  },
  subscribe(k: string, f: () => void) {
    if (!listeners.has(k)) listeners.set(k, new Set());
    listeners.get(k)!.add(f);
    return () => { listeners.get(k)!.delete(f); };
  },
};

export function useStored<T>(k: string, d: T): T {
  return useSyncExternalStore(f => kv.subscribe(k, f), () => kv.get(k, d));
}
