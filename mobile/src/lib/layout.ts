// The app is a phone layout. On a wide screen (the web demo on a laptop) it stays a centred column this wide.
// A phone turned sideways uses its whole width instead: the screens that gain from it (dashboard, All sensors,
// trip charts) lay out in more columns, the others keep a readable centred column (see Screen).
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const MAX_W = 520;
export const LANDSCAPE_COLUMN = 680; // forms and lists, when the phone is sideways

export function useLandscape() {
  const { width, height } = useWindowDimensions();
  return Platform.OS !== 'web' && width > height;
}
export const useMaxW = () => {
  const { width } = useWindowDimensions();
  return useLandscape() ? width : MAX_W;
};
// The width the screens get: sideways, minus the notch and the rounded corners kept clear (see Frame in _layout).
export function useAppWidth() {
  const { width } = useWindowDimensions(), insets = useSafeAreaInsets(), landscape = useLandscape();
  return landscape ? width - insets.left - insets.right : Math.min(width, MAX_W);
}
