// App settings in two scopes: global (one value for every car) and per vehicle (each car keeps its own value).
// The fuel price stays under its original key, fuelPrice.<id>, so existing installs keep their value.
import { kv, useStored } from './store';

export type SearchEngine = 'google' | 'bing' | 'duckduckgo';
export type ThemeId = 'vindici' | 'dark' | 'amoled' | 'racing';

export type Settings = {
  currency: string;
  search: SearchEngine;
  popups: boolean; // show a banner at the top of the screen when a notification arrives
  notifications: boolean; // master switch for every alert rule
  demo: boolean; // show the sample trips
  theme: ThemeId;
  autoEndMin: number; // end and save a trip after this many minutes with the engine off while still connected (0 = never)
};
export const SETTINGS_DEFAULT: Settings = { currency: 'MAD', search: 'google', popups: true, notifications: true, demo: true, theme: 'vindici', autoEndMin: 5 };

export const useSettings = () => ({ ...SETTINGS_DEFAULT, ...useStored<Partial<Settings>>('settings', {}) });
export const settings = (): Settings => ({ ...SETTINGS_DEFAULT, ...kv.get<Partial<Settings>>('settings', {}) });
export const setSetting = <K extends keyof Settings>(k: K, v: Settings[K]) => kv.set('settings', { ...kv.get<Partial<Settings>>('settings', {}), [k]: v });

export type VehicleSettings = {
  shiftFrom: number; // rpm where the first shift light comes on
  shiftTo: number; // rpm where they all flash
  gps: boolean; // record the route during trips
  tank: number; // litres, for range estimates
};
export const vehicleSettingsDefault = (fuel: string): VehicleSettings =>
  fuel === 'diesel' ? { shiftFrom: 2200, shiftTo: 4300, gps: true, tank: 70 } : { shiftFrom: 3000, shiftTo: 6400, gps: true, tank: 60 };

const vkey = (id: string) => 'vsettings.' + id;
export function useVehicleSettings(id: string, fuel: string): VehicleSettings {
  return { ...vehicleSettingsDefault(fuel), ...useStored<Partial<VehicleSettings>>(vkey(id), {}) };
}
export const vehicleSettings = (id: string, fuel: string): VehicleSettings => ({ ...vehicleSettingsDefault(fuel), ...kv.get<Partial<VehicleSettings>>(vkey(id), {}) });
export function setVehicleSetting<K extends keyof VehicleSettings>(id: string, k: K, v: VehicleSettings[K]) {
  kv.set(vkey(id), { ...kv.get<Partial<VehicleSettings>>(vkey(id), {}), [k]: v });
}

// The web search used by the trouble code cards.
export function searchUrl(q: string, engine: SearchEngine = settings().search) {
  const e = encodeURIComponent(q);
  return engine === 'bing' ? `https://www.bing.com/search?q=${e}` : engine === 'duckduckgo' ? `https://duckduckgo.com/?q=${e}` : `https://www.google.com/search?q=${e}`;
}
