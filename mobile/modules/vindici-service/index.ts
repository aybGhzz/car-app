// Keeps the adapter connection and the trip recording alive with the phone locked or another app open (Android).
// Native side: android/…/RecordingService.kt (foreground service, wake lock, GPS) and VindiciServiceModule.kt.
// On the web and in Expo Go the native module is missing and every call does nothing.
import { AppRegistry, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type Native = {
  start(title: string, body: string, stopLabel: string, channel: string, gps: boolean): boolean;
  update(title: string, body: string): void;
  stop(): void;
  isRunning(): boolean;
  brand(): string;
  notificationsEnabled(): boolean;
  batteryUnrestricted(): boolean;
  requestBatteryUnrestricted(): boolean;
  openAppSettings(): boolean;
  openAutostart(): boolean;
  addListener(event: string, f: (e: any) => void): { remove(): void };
};
const N = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('VindiciService') : null;
export const available = !!N;

// The headless task does no work: while it is running, React Native keeps JS timers firing in the background.
let release: (() => void) | null = null;
if (N) AppRegistry.registerHeadlessTask('VindiciKeepAlive', () => () => new Promise<void>(r => { release = r; }));

export function startService(o: { title: string; body: string; stopLabel: string; channel: string; gps: boolean }) {
  try { N?.start(o.title, o.body, o.stopLabel, o.channel, o.gps); } catch {}
}
export function updateService(title: string, body: string) {
  try { N?.update(title, body); } catch {}
}
export function stopService() {
  try { N?.stop(); } catch {}
  release?.();
  release = null;
}
export const serviceRunning = () => { try { return !!N?.isRunning(); } catch { return false; } };

export const onServiceGps = (f: (lat: number, lng: number) => void) => N?.addListener('onLocation', e => f(e.lat, e.lng));
export const onServiceAction = (f: (action: string) => void) => N?.addListener('onAction', e => f(e.action));

// ---- Settings > Background check (null = unknown, e.g. on the web) ----
const call = <T,>(f: () => T): T | null => { try { return N ? f() : null; } catch { return null; } };
export const phoneBrand = () => call(() => N!.brand()) ?? '';
export const notificationsEnabled = () => call(() => N!.notificationsEnabled());
export const batteryUnrestricted = () => call(() => N!.batteryUnrestricted());
export const requestBatteryUnrestricted = () => call(() => N!.requestBatteryUnrestricted());
export const openAppSettings = () => call(() => N!.openAppSettings());
export const openAutostart = () => call(() => N!.openAutostart());
