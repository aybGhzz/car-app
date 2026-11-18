// Records the route of the trip. With a real adapter it uses the phone's (or browser's) location. With the simulator
// it drives a fake position around Casablanca at the simulated speed, so simulated trips also get a route.
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { available as serviceAvailable, onServiceGps } from '../../modules/vindici-service';

type Fix = (lat: number, lng: number) => void;
let sub: { remove: () => void } | null = null;

// Before this build, Android recording used an expo-location background task, which needed "Allow all the time".
// The app's own foreground service (modules/vindici-service) now keeps it alive and reads the GPS itself, with
// "While using the app". Stop the old task if an earlier version left it running.
const TASK = 'vindici-trip';
if (Platform.OS !== 'web') {
  TaskManager.defineTask(TASK, async () => {});
  Location.hasStartedLocationUpdatesAsync(TASK).then(on => (on ? Location.stopLocationUpdatesAsync(TASK) : undefined)).catch(() => {});
}

// `route`: record fixes (the car's GPS setting). Resolves true when fixes will arrive. On Android with the service,
// the fixes come from the service, which must then be started with gps: true (lib/live.ts startBackground).
export async function startGps(onFix: Fix, route = true) {
  await stopGps();
  if (!route) return false;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return false;
    if (Platform.OS === 'android' && serviceAvailable) {
      sub = onServiceGps(onFix) ?? null;
      return true;
    }
    sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 15, timeInterval: 3000 },
      p => onFix(p.coords.latitude, p.coords.longitude));
    return true;
  } catch { return false; }
}
export async function stopGps() {
  sub?.remove(); sub = null;
}

// Fake GPS for the simulator: a heading that slowly turns, advanced by speed × time.
export function simGps() {
  let lat = 33.5835, lng = -7.6326, heading = 40, turn = 0;
  return (speedKmh: number, dt: number): [number, number] => {
    turn = turn * 0.9 + (Math.random() - 0.5) * 6;
    heading += turn * dt;
    const m = (speedKmh / 3.6) * dt, rad = (heading * Math.PI) / 180;
    lat += (m * Math.cos(rad)) / 111320;
    lng += (m * Math.sin(rad)) / (111320 * Math.cos((lat * Math.PI) / 180));
    return [lat, lng];
  };
}

// Metres between two points (equirectangular, plenty for points a few metres apart).
export function metres(a: [number, number], b: [number, number]) {
  const k = Math.PI / 180, x = (b[1] - a[1]) * k * Math.cos(((a[0] + b[0]) / 2) * k), y = (b[0] - a[0]) * k;
  return Math.hypot(x, y) * 6371000;
}
