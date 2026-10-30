// Small building blocks shared by every screen. Motion comes from Reanimated: cards slide in with a spring,
// buttons squash under the finger, and numbers count up.
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View, type PressableProps, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring, withTiming, Easing, useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { t, useLang } from '../lib/i18n';
import { C, KIND_COLOR } from '../lib/theme';

export function T({ children, className = '', ...p }: { children: ReactNode; className?: string; numberOfLines?: number }) {
  useLang();
  const tr = (c: ReactNode): ReactNode => (typeof c === 'string' ? t(c) : Array.isArray(c) ? c.map(tr) : c);
  return <Text className={'text-text ' + className} {...p}>{tr(children)}</Text>;
}

// Slides in from below. index staggers lists so items arrive one after the other.
export function Card({ children, className = '', index = 0, style }: { children: ReactNode; className?: string; index?: number; style?: ViewStyle }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 55).springify().damping(16)} style={style}>
      <View className={'rounded-3xl border border-line bg-panel p-4 ' + className}>{children}</View>
    </Animated.View>
  );
}

export function PressableScale({ children, className = '', haptic = true, style, ...p }: PressableProps & { className?: string; haptic?: boolean; children: ReactNode; style?: ViewStyle }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
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
  primary: ['bg-accent', 'text-[#001523] font-bold'],
  ghost: ['bg-panel2 border border-line', 'text-text font-semibold'],
  danger: ['border border-bad', 'text-bad font-semibold'],
};
export function Button({ title, onPress, kind = 'ghost', disabled, icon, className = '' }: { title: string; onPress?: () => void; kind?: keyof typeof BTN; disabled?: boolean; icon?: string; className?: string }) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} className={`flex-row items-center justify-center rounded-2xl px-4 py-3 ${BTN[kind][0]} ${disabled ? 'opacity-40' : ''} ${className}`}>
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
