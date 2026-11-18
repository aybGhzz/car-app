// Screen rotation. The app follows the phone's auto-rotate setting; the rotate button in the header turns the
// screen to the other orientation and keeps it there (handy on a car mount with auto-rotate off). Pressing it
// again goes back to following the phone. The choice is remembered.
import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { kv, useStored } from './store';

export type Rotation = 'auto' | 'portrait' | 'landscape';
const KEY = 'rotation';
export const rotationSupported = Platform.OS !== 'web';
export const useRotation = () => useStored<Rotation>(KEY, 'auto');

async function apply(r: Rotation) {
  if (!rotationSupported) return;
  const L = ScreenOrientation.OrientationLock;
  try {
    if (r === 'auto') await ScreenOrientation.unlockAsync(); // follows the phone's own auto-rotate setting
    else await ScreenOrientation.lockAsync(r === 'portrait' ? L.PORTRAIT_UP : L.LANDSCAPE);
  } catch {}
}

export const restoreRotation = () => apply(kv.get<Rotation>(KEY, 'auto'));

export async function toggleRotation(landscapeNow: boolean) {
  const cur = kv.get<Rotation>(KEY, 'auto');
  const next: Rotation = cur !== 'auto' ? 'auto' : landscapeNow ? 'portrait' : 'landscape';
  kv.set(KEY, next);
  await apply(next);
}
