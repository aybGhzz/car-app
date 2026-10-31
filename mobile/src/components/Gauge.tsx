// Round gauge: the arc and the needle follow the value with a spring, and the colour warms up towards the red zone.
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedProps, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { t, useLang, num } from '../lib/i18n';
import { C } from '../lib/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const SWEEP = 240; // degrees, from -120° to +120° around 12 o'clock

const polar = (c: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [c + r * Math.sin(a), c - r * Math.cos(a)];
};
const arcPath = (c: number, r: number) => {
  const [x0, y0] = polar(c, r, -SWEEP / 2), [x1, y1] = polar(c, r, SWEEP / 2);
  return `M${x0},${y0} A${r},${r} 0 1 1 ${x1},${y1}`;
};

type Props = {
  value: number | null; min: number; max: number; label: string; unit: string; dp?: number;
  size?: number; redFrom?: number; ticks?: boolean; color?: string;
};

export function Gauge({ value, min, max, label, unit, dp = 0, size = 150, redFrom = 0.85, ticks = false, color = C.accent }: Props) {
  useLang();
  const p = useSharedValue(0);
  useEffect(() => {
    const frac = value == null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
    p.value = withSpring(frac, { damping: 15, stiffness: 90, mass: 0.8 });
  }, [value, min, max]);

  const stroke = size * 0.075, c = size / 2, r = c - stroke - (ticks ? size * 0.07 : 2);
  const L = (r * SWEEP * Math.PI) / 180;

  // Only the length is animated. The colour is worked out on each render (live values re-render several times a
  // second) and drawn as a plain prop, so a colour rule shows at once on every platform.
  const frac = value == null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const arcColor = redFrom > 1 ? color : interpolateColor(frac, [0, redFrom * 0.8, redFrom, 1], [color, color, C.warn, C.bad]);
  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: L * (1 - p.value) }), [L]);
  const needle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-SWEEP / 2 + SWEEP * p.value}deg` }] }));
  

  const majors = ticks ? Array.from({ length: 9 }, (_, i) => i / 8) : [];
  return (
    <View style={{ width: size, height: size * 0.86 }} className="items-center">
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="track" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={C.line} stopOpacity="0.7" />
            <Stop offset="1" stopColor={C.line} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Path d={arcPath(c, r)} stroke="url(#track)" strokeWidth={stroke} strokeLinecap="round" fill="none" />
        {/* soft glow under the value arc */}
        <AnimatedPath animatedProps={arcProps} stroke={arcColor} d={arcPath(c, r)} strokeWidth={stroke * 2.2} strokeOpacity={0.12} strokeLinecap="round" fill="none" strokeDasharray={`${L} ${L}`} />
        <AnimatedPath animatedProps={arcProps} stroke={arcColor} d={arcPath(c, r)} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${L} ${L}`} />
        {majors.map(f => {
          const deg = -SWEEP / 2 + SWEEP * f;
          const [x0, y0] = polar(c, r + stroke * 0.9, deg), [x1, y1] = polar(c, r + stroke * 1.6, deg), [tx, ty] = polar(c, r - stroke * 1.5, deg);
          return (
            <G key={f}>
              <Line x1={x0} y1={y0} x2={x1} y2={y1} stroke={f >= redFrom ? C.bad : C.muted} strokeWidth={1.5} />
              <SvgText x={tx} y={ty + 4} fill={f >= redFrom ? C.bad : C.muted} fontSize={size * 0.048} textAnchor="middle">
                {formatTick(min + (max - min) * f)}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      {/* needle: a square the size of the gauge, rotated around its centre, with the bar drawn in its top half */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, alignItems: 'center' }, needle]}>
        <Animated.View style={[{ marginTop: c - r - stroke * 0.2, width: Math.max(3, size * 0.022), height: r * 0.5, borderRadius: 4, opacity: ticks ? 1 : 0, backgroundColor: arcColor }]} />
      </Animated.View>
      <View pointerEvents="none" style={{ position: 'absolute', top: c - size * (ticks ? 0.1 : 0.16), width: size }} className="items-center">
        <Text style={{ fontSize: size * (ticks ? 0.17 : 0.21), fontVariant: ['tabular-nums'] }} className="font-extrabold text-text">
          {value == null ? '—' : num(value, dp)}
        </Text>
        <Text style={{ fontSize: Math.max(10, size * 0.075) }} className="text-muted">{t(unit)}</Text>
      </View>
      <Text numberOfLines={1} style={{ position: 'absolute', bottom: ticks ? -2 : 0, fontSize: Math.max(11, size * 0.08), maxWidth: size }} className="font-semibold text-muted">
        {t(label)}
      </Text>
    </View>
  );
}

const formatTick = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));
