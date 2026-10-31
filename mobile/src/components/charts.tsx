// Charts that draw themselves: lines trace from left to right, bars grow up, progress bars fill.
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { num, t, useLang } from '../lib/i18n';
import { C } from '../lib/theme';
import { T } from './ui';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function Sparkline({ points, color, unit, height = 110 }: { points: [number, number][]; color: string; unit: string; height?: number }) {
  useLang();
  const [w, setW] = useState(0);
  const draw = useSharedValue(0);
  useEffect(() => { draw.value = 0; draw.value = withDelay(150, withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) })); }, [points]);
  if (points.length < 2) return <T className="text-muted">No data</T>;

  // Thin long series out to about one point per 2 px.
  const step = Math.max(1, Math.floor(points.length / Math.max(60, w / 2)));
  const pts = points.filter((_, i) => i % step === 0);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const xy = pts.map(([x, y]) => [((x - x0) / (x1 - x0 || 1)) * w, height - 6 - ((y - lo) / span) * (height - 12)]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  let len = 0;
  for (let i = 1; i < xy.length; i++) len += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);

  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)}>
      {w > 0 && <SparkSvg d={d} w={w} height={height} len={len} color={color} draw={draw} />}
      <View className="mt-1 flex-row justify-between">
        <Text className="text-xs text-muted">{t('max ' + num(hi, 1) + ' ' + unit)}</Text>
        <Text className="text-xs text-muted">{t('min ' + num(lo, 1) + ' ' + unit)}</Text>
      </View>
    </View>
  );
}

function SparkSvg({ d, w, height, len, color, draw }: { d: string; w: number; height: number; len: number; color: string; draw: any }) {
  const line = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - draw.value) }));
  const area = useAnimatedProps(() => ({ fillOpacity: draw.value }));
  const id = 'g' + color.replace('#', '');
  return (
    <Svg width={w} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.35" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <AnimatedPath animatedProps={area} d={`${d}L${w},${height}L0,${height}Z`} fill={`url(#${id})`} />
      <AnimatedPath animatedProps={line} d={d} stroke={color} strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeDasharray={`${len} ${len}`} />
    </Svg>
  );
}

function Bar({ frac, i, label, value, height }: { frac: number; i: number; label: string; value: string; height: number }) {
  const h = useSharedValue(0);
  useEffect(() => { h.value = withDelay(120 + i * 70, withSpring(frac, { damping: 13, stiffness: 110 })); }, [frac]);
  const style = useAnimatedStyle(() => ({ height: `${Math.max(0, h.value) * 100}%` }));
  return (
    <View className="flex-1 items-center">
      <View style={{ height }} className="w-full items-center justify-end">
        {value ? <Text className="mb-1 text-[11px] font-semibold text-text">{value}</Text> : null}
        <Animated.View style={[{ width: '62%', borderRadius: 8, backgroundColor: C.accent }, style]} />
      </View>
      <Text className="mt-1.5 text-[10px] text-muted">{label}</Text>
    </View>
  );
}

export function BarChart({ data, height = 144 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <View className="flex-row items-end">
      {data.map((d, i) => <Bar key={d.label} i={i} frac={(d.value / max) * 0.85} label={d.label} value={d.value ? num(d.value) : ''} height={height} />)}
    </View>
  );
}

export function ProgressBar({ frac, color, delay = 0, height = 8 }: { frac: number; color: string; delay?: number; height?: number }) {
  const w = useSharedValue(0);
  useEffect(() => { w.value = withDelay(delay, withSpring(Math.max(0, Math.min(1, frac)), { damping: 18, stiffness: 80 })); }, [frac]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={{ height, borderRadius: height }} className="overflow-hidden bg-line">
      <Animated.View style={[{ height, borderRadius: height, backgroundColor: color }, style]} />
    </View>
  );
}

const SPLIT = [['city', 'City', C.warn], ['highway', 'Highway', C.accent], ['road', 'Road', C.ok]] as const;
export function SplitBar({ split, delay = 0 }: { split: { city: number; highway: number; road: number }; delay?: number }) {
  useLang();
  return (
    <View>
      <View className="h-2.5 flex-row overflow-hidden rounded-full bg-line">
        {SPLIT.map(([k, , c], i) => <Segment key={k} pct={split[k]} color={c} delay={delay + i * 90} />)}
      </View>
      <View className="mt-2 flex-row gap-3">
        {SPLIT.map(([k, l, c]) => (
          <View key={k} className="flex-row items-center">
            <View style={{ backgroundColor: c }} className="mr-1.5 h-2 w-2 rounded-full" />
            <Text className="text-xs text-muted">{t(`${l} ${split[k]}%`)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
function Segment({ pct, color, delay }: { pct: number; color: string; delay: number }) {
  const w = useSharedValue(0);
  useEffect(() => { w.value = withDelay(delay, withTiming(pct, { duration: 700, easing: Easing.out(Easing.cubic) })); }, [pct]);
  const style = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return <Animated.View style={[{ backgroundColor: color, height: '100%' }, style]} />;
}
