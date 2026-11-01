// Records the route of the trip. With a real adapter it uses the phone's (or browser's) location. With the simulator
// it drives a fake position around Casablanca at the simulated speed, so simulated trips also get a route.
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

type Fix = (lat: number, lng: number) => void;
let sub: { remove: () => void } | null = null;
let handler: Fix | null = null;
let background = false;

// On Android, while connected to a real adapter, the location updates run in a foreground service (a notification
// says the trip is being recorded). That keeps the app alive when the user switches to another app or locks the
// phone, so the adapter keeps being read. Defined at the top level, as the task manager requires.
const TASK = 'vindici-trip';
if (Platform.OS !== 'web') {
  TaskManager.defineTask(TASK, async ({ data, error }: any) => {
    if (error || !handler) return;
    for (const l of (data?.locations ?? []) as Location.LocationObject[]) handler(l.coords.latitude, l.coords.longitude);
  });
}

// `route`: record fixes (the car's GPS setting). Without it the service still runs, with coarse low-power updates,
// only to keep recording in the background.
export async function startGps(onFix: Fix, route = true) {
  await stopGps();
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return false;
    handler = route ? onFix : null;
    if (Platform.OS === 'android') {
      const bg = await Location.requestBackgroundPermissionsAsync().catch(() => ({ status: 'denied' }));
      if (bg.status === 'granted') {
        await Location.startLocationUpdatesAsync(TASK, {
          accuracy: route ? Location.Accuracy.High : Location.Accuracy.Lowest,
          distanceInterval: route ? 15 : 200, timeInterval: 3000,
          foregroundService: { notificationTitle: 'Vindici is recording your trip', notificationBody: 'Connected to your car. Disconnect in the app to stop.', notificationColor: '#0f7d74', killServiceOnDestroy: false },
        });
        background = true;
        return true;
      }
    }
    if (!route) return false; // no background permission: recording only while the app is on screen
    sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 15, timeInterval: 3000 },
      p => onFix(p.coords.latitude, p.coords.longitude));
    return true;
  } catch { return false; }
}
export async function stopGps() {
  sub?.remove(); sub = null; handler = null;
  if (background) {
    background = false;
    await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
  }
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
