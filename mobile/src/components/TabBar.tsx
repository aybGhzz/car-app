// Floating tab bar: a highlight pill slides under the active tab and its icon pops.
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { getLang, t, useLang } from '../lib/i18n';
import { C } from '../lib/theme';

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  index: ['speedometer', 'speedometer-outline'],
  codes: ['pulse', 'pulse-outline'],
  trips: ['map', 'map-outline'],
  service: ['construct', 'construct-outline'],
  car: ['shield-checkmark', 'shield-checkmark-outline'],
};

// Short labels so five tabs fit on a phone in every language.
const SHORT: Record<string, Record<string, string>> = {
  index: { en: 'Dashboard', fr: 'Bord', es: 'Panel' },
  codes: { en: 'Codes', fr: 'Codes', es: 'Códigos' },
  service: { en: 'Service', fr: 'Entretien', es: 'Servicio' },
};

function Tab({ focused, icon, label, onPress }: { focused: boolean; icon: [any, any]; label: string; onPress: () => void }) {
  const s = useSharedValue(focused ? 1 : 0);
  useEffect(() => { s.value = withSpring(focused ? 1 : 0, { damping: 12, stiffness: 200 }); }, [focused]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + s.value * 0.15 }, { translateY: -s.value * 1.5 }] }));
  return (
    <Pressable onPress={onPress} className="flex-1 items-center justify-center py-2">
      <Animated.View style={iconStyle}>
        <Ionicons name={focused ? icon[0] : icon[1]} size={22} color={focused ? C.accent : C.muted} />
      </Animated.View>
      <Text numberOfLines={1} style={{ color: focused ? C.text : C.muted }} className="mt-0.5 text-[10px] font-semibold">{label}</Text>
    </Pressable>
  );
}

export function TabBar({ state, descriptors, navigateToTab, insets }: BottomTabBarProps) {
  useLang();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const n = state.routes.length, tabW = w / n;
  useEffect(() => { x.value = withSpring(state.index * tabW, { damping: 16, stiffness: 170 }); }, [state.index, tabW]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 10) }}>
      <View onLayout={e => setW(e.nativeEvent.layout.width)} className="flex-row rounded-[26px] border border-line bg-panel/95 p-1"
        style={{ shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 }}>
        {w > 0 && (
          <Animated.View style={[{ position: 'absolute', top: 4, bottom: 4, left: 4, width: tabW - 8 + 0, borderRadius: 22, backgroundColor: C.accent + '1f', borderWidth: 1, borderColor: C.accent + '40' }, pill]} />
        )}
        {state.routes.map((r, i) => (
          <Tab key={r.key} focused={state.index === i} icon={ICONS[r.name] ?? ICONS.index} label={SHORT[r.name]?.[getLang()] ?? t(descriptors[r.key].options.title ?? r.name)}
            onPress={() => { if (state.index !== i) { Haptics.selectionAsync().catch(() => {}); navigateToTab(r.key); } }} />
        ))}
      </View>
    </View>
  );
}
