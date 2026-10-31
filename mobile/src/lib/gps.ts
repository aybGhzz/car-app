// Records the route of the trip. With a real adapter it uses the phone's (or browser's) location. With the simulator
// it drives a fake position around Casablanca at the simulated speed, so simulated trips also get a route.
import * as Location from 'expo-location';

type Fix = (lat: number, lng: number) => void;
let sub: { remove: () => void } | null = null;

export async function startGps(onFix: Fix) {
  stopGps();
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return false;
    sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 15, timeInterval: 3000 },
      p => onFix(p.coords.latitude, p.coords.longitude));
    return true;
  } catch { return false; }
}
export function stopGps() { sub?.remove(); sub = null; }

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
