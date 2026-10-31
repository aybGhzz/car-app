// Car picker shown on every tab: one chip per car (the selected one lights up), then a chip that opens the cars list.
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { selectVehicle, useVehicle, useVehicles, vehicleName, type Vehicle } from '../lib/garage';
import { useLive } from '../lib/live';
import { t, useLang } from '../lib/i18n';
import { C } from '../lib/theme';

function Chip({ v, on, onX }: { v: Vehicle; on: boolean; onX: (x: number) => void }) {
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => { p.value = withTiming(on ? 1 : 0, { duration: 260 }); }, [on]);
  const bg = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [C.panel, C.accent]),
    borderColor: interpolateColor(p.value, [0, 1], [C.line, C.accent]),
    transform: [{ scale: withSpring(on ? 1 : 0.96, { damping: 14 }) }],
  }));
  return (
    <Pressable onLayout={e => onX(e.nativeEvent.layout.x)} onPress={() => { if (!on) { Haptics.selectionAsync().catch(() => {}); selectVehicle(v.id); } }}>
      <Animated.View style={[{ minWidth: 128, maxWidth: 170, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 }, bg]}>
        <Text numberOfLines={1} style={{ color: on ? C.onAccent : C.text }} className="text-sm font-bold">{v.model || v.make || t('New car')}</Text>
        <Text numberOfLines={1} style={{ color: on ? C.onAccent + 'bb' : C.muted }} className="text-[10px] font-semibold">
          {v.plate || [v.make, v.year].filter(Boolean).join(' · ') || t('No plate yet')}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function VehicleSwitcher() {
  useLang();
  const list = useVehicles(), cur = useVehicle();
  const S = useLive();
  // Keep the selected chip in view (for example a car just added at the end of the row).
  const scroller = useRef<any>(null), xs = useRef<Record<string, number>>({});
  useEffect(() => {
    const x = xs.current[cur.id];
    if (x != null) scroller.current?.scrollTo({ x: Math.max(0, x - 40), animated: true });
  }, [cur.id, list.length]);
  const live = S.status === 'connected' && S.vehicle && S.vehicle !== cur.id ? list.find(v => v.id === S.vehicle) : null;
  return (
    <View className="mb-3 -mx-4">
      <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {list.map(v => <Chip key={v.id} v={v} on={v.id === cur.id} onX={x => {
          const first = xs.current[v.id] == null;
          xs.current[v.id] = x;
          if (first && v.id === cur.id) scroller.current?.scrollTo({ x: Math.max(0, x - 40), animated: false });
        }} />)}
        <Pressable onPress={() => router.push('/cars')}>
          <View className="flex-row items-center rounded-2xl border border-dashed border-line px-4 py-2" style={{ height: '100%' }}>
            <Ionicons name="car-sport-outline" size={18} color={C.accent} />
            <Text className="ml-1.5 text-sm font-bold text-accent">{t('My cars')}</Text>
          </View>
        </Pressable>
      </ScrollView>
      {live ? (
        <View className="mx-4 mt-2 flex-row items-center rounded-xl bg-warn/10 px-3 py-2">
          <Ionicons name="information-circle" size={16} color={C.warn} />
          <Text className="ml-1.5 flex-1 text-xs text-warn">{t('Live data comes from the connected car:')} {vehicleName(live)}</Text>
        </View>
      ) : null}
    </View>
  );
}
