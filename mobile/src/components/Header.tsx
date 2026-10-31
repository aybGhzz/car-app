// Screen title with the notifications bell, settings, and the connection chip (tap to connect).
// The language moved to Settings: it is chosen once, so it does not need space on every screen.
import { useState } from 'react';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useUnread } from '../lib/alerts';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLive } from '../lib/live';
import { t, useLang } from '../lib/i18n';
import { C } from '../lib/theme';
import { ConnectSheet } from './ConnectSheet';
import { PressableScale, T } from './ui';
import { LineLoader, RingLoader } from './Loaders';

function PulseDot({ color, pulse }: { color: string; pulse: boolean }) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = pulse ? withRepeat(withSequence(withTiming(2.4, { duration: 900 }), withTiming(1, { duration: 0 })), -1) : 1;
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: pulse ? (2.4 - s.value) / 1.4 * 0.6 : 0 }));
  return (
    <View className="mr-2 h-2.5 w-2.5 items-center justify-center">
      <Animated.View style={[{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: color }, ring]} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  useLang();
  const S = useLive();
  const insets = useSafeAreaInsets();
  const [connOpen, setConnOpen] = useState(false);
  const unread = useUnread();
  const color = S.status === 'connected' ? C.ok : S.status === 'error' ? C.bad : S.status === 'connecting' ? C.warn : C.muted;
  const label = S.status === 'connected' ? (S.kind === 'sim' ? 'Simulator' : 'Connected') : S.status === 'connecting' ? 'Connecting…' : S.status === 'error' ? 'Error' : 'Connect';

  return (
    <View style={{ paddingTop: insets.top + 8 }} className="flex-row items-center justify-between px-4 pb-3">
      <View className="flex-1 pr-2">
        <Text accessibilityRole="header" numberOfLines={1} style={{ fontSize: t(title).length > 12 ? 21 : 26 }} className="font-extrabold tracking-tight text-text">{t(title)}</Text>
        {subtitle ? <T className="text-xs text-muted" numberOfLines={1}>{subtitle}</T> : null}
      </View>
      <IconBtn icon="notifications-outline" label="Notifications" badge={unread} onPress={() => router.push('/notifications')} />
      <IconBtn icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
      <PressableScale onPress={() => setConnOpen(true)} className="h-10 flex-row items-center rounded-full border border-line bg-panel px-3.5">
        {S.status === 'connecting' ? <View style={{ marginRight: 8 }}><RingLoader size={14} stroke={2} /></View> : <PulseDot color={color} pulse={S.status === 'connected'} />}
        <Text className="text-sm font-semibold text-text">{t(label)}</Text>
      </PressableScale>
      {S.status === 'connecting' ? <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 2, alignItems: 'center' }}><LineLoader width={220} /></View> : null}
      <ConnectSheet open={connOpen} onClose={() => setConnOpen(false)} />
    </View>
  );
}

function IconBtn({ icon, label, badge = 0, onPress }: { icon: any; label: string; badge?: number; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={t(label)} className="mr-2 h-10 w-10 items-center justify-center rounded-full border border-line bg-panel">
      <Ionicons name={icon} size={19} color={C.text} />
      {badge ? (
        <View style={{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: C.bad, borderWidth: 2, borderColor: C.bg }}
          className="items-center justify-center">
          <Text className="text-[10px] font-extrabold text-white">{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}
