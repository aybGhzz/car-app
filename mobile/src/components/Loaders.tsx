// Light loaders from the Vindici mockups: a sweeping line, three fading dots, a spinning ring and skeleton blocks.
// Each one animates a single value on the UI thread, so they cost almost nothing.
import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '../lib/theme';

const useLoop = (ms: number, ease = Easing.linear) => {
  const v = useSharedValue(0);
  useEffect(() => { v.value = withRepeat(withTiming(1, { duration: ms, easing: ease }), -1, false); return () => cancelAnimation(v); }, []);
  return v;
};

// A short glowing segment that sweeps across: for "working in the background" under a header.
export function LineLoader({ width = 160, height = 3 }: { width?: number; height?: number }) {
  const v = useLoop(1300, Easing.inOut(Easing.cubic));
  const s = useAnimatedStyle(() => ({ transform: [{ translateX: -width * 0.4 + v.value * width * 1.4 }] }));
  return (
    <View style={{ width, height, overflow: 'hidden', borderRadius: height }}>
      <Animated.View style={[{ width: width * 0.4, height }, s]}>
        <LinearGradient colors={['transparent', C.accent, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}

function Dot({ i, v, size, color }: { i: number; v: any; size: number; color: string }) {
  const s = useAnimatedStyle(() => {
    const ph = (v.value * 3 - i + 3) % 3; // each dot peaks one third of a cycle after the previous one
    return { opacity: ph < 1 ? 0.3 + 0.7 * Math.sin(ph * Math.PI) : 0.3 };
  });
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, marginHorizontal: size * 0.3 }, s]} />;
}
export function DotsLoader({ size = 9, color = C.accent }: { size?: number; color?: string }) {
  const v = useLoop(1100);
  return <View style={{ flexDirection: 'row', alignItems: 'center' }}>{[0, 1, 2].map(i => <Dot key={i} i={i} v={v} size={size} color={color} />)}</View>;
}

// A three-quarter ring that spins.
export function RingLoader({ size = 40, stroke = 3, color = C.accent }: { size?: number; stroke?: number; color?: string }) {
  const v = useLoop(800);
  const s = useAnimatedStyle(() => ({ transform: [{ rotate: `${v.value * 360}deg` }] }));
  return (
    <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: color + '30', borderTopColor: color, borderRightColor: color }, s]} />
  );
}

// Grey blocks shaped like the content, pulsing gently while it loads.
export function Skeleton({ style }: { style?: ViewStyle }) {
  const v = useLoop(1400, Easing.inOut(Easing.quad));
  const s = useAnimatedStyle(() => ({ opacity: 0.5 + 0.5 * Math.abs(Math.sin(v.value * Math.PI)) }));
  return <Animated.View style={[{ backgroundColor: C.line, borderRadius: 10 }, style, s]} />;
}
export function SkeletonScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 16, paddingTop: 56 }}>
      <Skeleton style={{ width: 140, height: 26, marginBottom: 18 }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}><Skeleton style={{ width: 128, height: 46, borderRadius: 16 }} /><Skeleton style={{ width: 128, height: 46, borderRadius: 16 }} /></View>
      <Skeleton style={{ height: 180, borderRadius: 24, marginBottom: 16 }} />
      <Skeleton style={{ width: 160, height: 18, marginBottom: 10 }} />
      {[0, 1, 2].map(i => <Skeleton key={i} style={{ height: 64, borderRadius: 20, marginBottom: 8 }} />)}
    </View>
  );
}
