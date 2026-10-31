// Small building blocks shared by every screen. Motion comes from Reanimated: cards slide in with a spring,
// buttons squash under the finger, and numbers count up.
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View, type PressableProps, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring, withTiming, Easing, useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { t, useLang } from '../lib/i18n';
import { C, KIND_COLOR } from '../lib/theme';

// Translated text. The default colour applies only when the caller gives none: a default class listed first would
// win over the caller's colour (that made the primary buttons unreadable).
const HAS_COLOR = /(^|\s)text-(text|muted|accent|onaccent|ok|warn|bad|violet|white|black|\[#)/;
export function T({ children, className = '', style, ...p }: { children: ReactNode; className?: string; numberOfLines?: number; style?: any }) {
  useLang();
  const tr = (c: ReactNode): ReactNode => (typeof c === 'string' ? t(c) : Array.isArray(c) ? c.map(tr) : c);
  return <Text className={(HAS_COLOR.test(className) ? '' : 'text-text ') + className} style={style} {...p}>{tr(children)}</Text>;
}

// Slides in from below. index staggers lists so items arrive one after the other.
export function Card({ children, className = '', index = 0, style }: { children: ReactNode; className?: string; index?: number; style?: ViewStyle }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 55).springify().damping(16)} style={style}>
      <View className={'rounded-3xl border border-line bg-panel p-4 ' + className}>{children}</View>
    </Animated.View>
  );
}

export function PressableScale({ children, className = '', haptic = true, style, accessibilityRole = 'button', ...p }: PressableProps & { className?: string; haptic?: boolean; children: ReactNode; style?: ViewStyle }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      {...p}
      onPressIn={e => { s.value = withSpring(0.95, { damping: 15, stiffness: 400 }); p.onPressIn?.(e); }}
      onPressOut={e => { s.value = withSpring(1, { damping: 12, stiffness: 300 }); p.onPressOut?.(e); }}
      onPress={e => { if (haptic) Haptics.selectionAsync().catch(() => {}); p.onPress?.(e); }}
    >
      <Animated.View style={[anim, style]}>
        <View className={className}>{children}</View>
      </Animated.View>
    </Pressable>
  );
}

const BTN = {
  primary: ['overflow-hidden', 'text-onaccent font-bold'], // gradient background, drawn below
  ghost: ['bg-panel2 border border-line', 'text-text font-semibold'],
  danger: ['border border-bad', 'text-bad font-semibold'],
};
export function Button({ title, onPress, kind = 'ghost', disabled, icon, className = '' }: { title: string; onPress?: () => void; kind?: keyof typeof BTN; disabled?: boolean; icon?: string; className?: string }) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} className={`flex-row items-center justify-center rounded-2xl px-4 py-3 ${BTN[kind][0]} ${disabled ? 'opacity-40' : ''} ${className}`}>
      {kind === 'primary' ? <LinearGradient colors={C.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} /> : null}
      {icon ? <Text className={'mr-2 ' + BTN[kind][1]}>{icon}</Text> : null}
      <T className={BTN[kind][1]}>{title}</T>
    </PressableScale>
  );
}

export function Pill({ kind, text }: { kind: keyof typeof KIND_COLOR; text: string }) {
  const c = KIND_COLOR[kind];
  return (
    <View style={{ backgroundColor: c + '22', borderColor: c + '55' }} className="flex-row items-center rounded-full border px-2.5 py-1">
      <View style={{ backgroundColor: c }} className="mr-1.5 h-1.5 w-1.5 rounded-full" />
      <T className="text-xs font-semibold" >{text}</T>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View className="mb-2 mt-6 flex-row items-center justify-between px-1">
      <T className="text-lg font-bold">{children}</T>
      {right}
    </View>
  );
}

// Animates from 0 (or the previous value) to the new value, in the current locale's number format.
export function CountUp({ value, dp = 0, className = '', format }: { value: number; dp?: number; className?: string; format?: (v: number) => string }) {
  const sv = useSharedValue(0);
  const [shown, setShown] = useState(0);
  useEffect(() => { sv.value = withTiming(value, { duration: 900, easing: Easing.out(Easing.cubic) }); }, [value]);
  useAnimatedReaction(() => sv.value, v => { scheduleOnRN(setShown, v); });
  return <Text className={'text-text ' + className}>{format ? format(shown) : shown.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}</Text>;
}

export function StatTile({ label, value, unit = '', index = 0, color }: { label: string; value: string; unit?: string; index?: number; color?: string }) {
  return (
    <Card index={index} className="p-3.5" style={{ flexBasis: '47%', flexGrow: 1 }}>
      <T className="text-xs text-muted">{label}</T>
      <View className="mt-1 flex-row items-baseline">
        <Text style={color ? { color } : undefined} className="text-xl font-bold text-text">{value}</Text>
        {unit ? <T className="ml-1 text-xs text-muted">{unit}</T> : null}
      </View>
    </Card>
  );
}

export const Grid = ({ children }: { children: ReactNode }) => <View className="flex-row flex-wrap gap-2.5">{children}</View>;

export const Empty = ({ text }: { text: string }) => (
  <View className="items-center py-10"><T className="text-center text-muted">{text}</T></View>
);

export { C };

// On/off switch drawn with a spring, the same on every platform.
export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => { x.value = withSpring(value ? 1 : 0, { damping: 16, stiffness: 220 }); }, [value]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 20 }] }));
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value, disabled }} disabled={disabled}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(!value); }}
      style={{ width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? C.accent : C.line, opacity: disabled ? 0.4 : 1 }}>
      <Animated.View style={[{ width: 22, height: 22, borderRadius: 11, backgroundColor: value ? C.onAccent : C.dark ? C.muted : '#ffffff' }, knob]} />
    </Pressable>
  );
}

// A row of options where one is selected.
export function Segmented<K extends string>({ value, options, onChange, className = '' }: { value: K; options: [K, string][]; onChange: (k: K) => void; className?: string }) {
  return (
    <View className={'flex-row rounded-2xl border border-line bg-panel2 p-1 ' + className}>
      {options.map(([k, l]) => (
        <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: value === k }} onPress={() => onChange(k)}
          className={`flex-1 items-center rounded-xl px-2 py-2 ${value === k ? 'bg-accent' : ''}`}>
          <T numberOfLines={1} className={`text-sm font-semibold ${value === k ? 'text-onaccent' : 'text-muted'}`}>{l}</T>
        </Pressable>
      ))}
    </View>
  );
}

// Colour swatches for gauges, rules and chart lines.
export const SWATCHES = [C.accent, C.ok, C.warn, C.bad, C.violet, '#f472b6', '#2dd4bf', '#475569'];
export function Swatches({ value, onChange }: { value?: string; onChange: (c: string) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {SWATCHES.map(c => (
        <Pressable key={c} accessibilityRole="button" accessibilityLabel={c} onPress={() => onChange(c)}
          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: value === c ? 3 : 0, borderColor: '#fff' }} />
      ))}
    </View>
  );
}

// Small "Demo" label for sample data.
export const DemoTag = () => (
  <View className="rounded-full border border-violet/50 bg-violet/10 px-2 py-0.5"><T className="text-[10px] font-bold uppercase text-violet">Demo</T></View>
);
