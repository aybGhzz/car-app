// Circular countdown that winds up to the fraction of time left.
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { C } from '../lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function Ring({ frac, color, label, sub, size = 84 }: { frac: number; color: string; label: string; sub: string; size?: number }) {
  const p = useSharedValue(0);
  useEffect(() => { p.value = withDelay(250, withTiming(Math.max(0, Math.min(1, frac)), { duration: 1200, easing: Easing.out(Easing.cubic) })); }, [frac]);
  const w = 8, r = (size - w) / 2, L = 2 * Math.PI * r;
  const props = useAnimatedProps(() => ({ strokeDashoffset: L * (1 - p.value) }));
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.line} strokeWidth={w} fill="none" />
        <AnimatedCircle animatedProps={props} cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" strokeDasharray={`${L} ${L}`} />
      </Svg>
      <Text style={{ color }} className="text-lg font-extrabold">{label}</Text>
      <Text className="-mt-0.5 text-[10px] text-muted">{sub}</Text>
    </View>
  );
}
