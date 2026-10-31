// The app is a phone layout. On a wide screen (the web demo on a laptop) it stays a centred column this wide.
import { useWindowDimensions } from 'react-native';

export const MAX_W = 520;
export const useAppWidth = () => Math.min(useWindowDimensions().width, MAX_W);
