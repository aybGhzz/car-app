// Screen title with the notifications bell, settings, and the connection chip (tap to connect).
// The language moved to Settings: it is chosen once, so it does not need space on every screen.
import { useRef, useState, type ReactNode } from 'react';
import { router, useIsFocused } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { rotationSupported, toggleRotation, useRotation } from '../lib/rotation';
import { useLandscape } from '../lib/layout';
import { useUnread } from '../lib/alerts';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLive, type Mode } from '../lib/live';
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
  const landscape = useLandscape();
  const focused = useIsFocused();
  // the remembered adapter did not answer: open the picker, on the screen being shown only (tab screens stay mounted)
  const prompt = useRef(S.prompt);
  useEffect(() => {
    if (S.prompt !== prompt.current) { prompt.current = S.prompt; if (focused) setConnOpen(true); }
  }, [S.prompt]);
  const color = S.status === 'connected' ? C.ok : S.status === 'error' ? C.bad : S.status === 'connecting' || S.status === 'reconnecting' ? C.warn : C.muted;
  const label = S.status === 'connected' ? (S.kind === 'sim' ? 'Simulator' : 'Connected') : S.status === 'connecting' ? 'Connecting…' : S.status === 'reconnecting' ? 'Reconnecting…' : S.status === 'error' ? 'Error' : 'Connect';

  return (
    <View style={{ paddingTop: insets.top + 8 }} className="flex-row items-center justify-between px-4 pb-3">
      <View className="flex-1 pr-2">
        <Text accessibilityRole="header" numberOfLines={1} style={{ fontSize: t(title).length > 12 ? 20 : rotationSupported && !landscape ? 22 : 26 }} className="font-extrabold tracking-tight text-text">{t(title)}</Text>
        {subtitle ? <T className="text-xs text-muted" numberOfLines={1}>{subtitle}</T> : null}
      </View>
      <RotateButton />
      <IconBtn icon="notifications-outline" label="Notifications" badge={unread} onPress={() => router.push('/notifications')} />
      <IconBtn icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
      <PressableScale onPress={() => setConnOpen(true)} className="ml-0.5 h-9 flex-row items-center rounded-full border border-line bg-panel px-2.5">
        {S.status === 'connecting' || S.status === 'reconnecting' ? <View style={{ marginRight: 8 }}><RingLoader size={14} stroke={2} /></View> : <PulseDot color={color} pulse={S.status === 'connected'} />}
        <Text className="text-sm font-semibold text-text">{t(label)}</Text>
        {S.status === 'connected' && S.mode ? <ModeTag mode={S.mode} /> : null}
      </PressableScale>
      {S.status === 'connecting' ? <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 2, alignItems: 'center' }}><LineLoader width={220} /></View> : null}
      <ConnectSheet open={connOpen} onClose={() => setConnOpen(false)} />
    </View>
  );
}

// The adapter's mode, switched by the app (live data vs reading every module for codes). Display only.
function ModeTag({ mode }: { mode: Mode }) {
  const color = mode === 'diag' ? C.violet : C.accent;
  return (
    <View accessibilityLabel={t(mode === 'diag' ? 'Diagnostic mode' : 'Live mode')} style={{ backgroundColor: color + '22', borderColor: color + '66' }}
      className="ml-1.5 rounded-full border px-1.5 py-0.5">
      <Text style={{ color }} className="text-[10px] font-extrabold uppercase">{t(mode === 'diag' ? 'Diag' : 'Live')}</Text>
    </View>
  );
}

function IconBtn({ icon, label, badge = 0, onPress, custom }: { icon?: any; label: string; badge?: number; onPress: () => void; custom?: ReactNode }) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={t(label)} className="mr-1 h-9 w-9 items-center justify-center rounded-full border border-line bg-panel">
      {custom ?? <Ionicons name={icon} size={18} color={C.text} />}
      {badge ? (
        <View style={{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: C.bad, borderWidth: 2, borderColor: C.bg }}
          className="items-center justify-center">
          <Text className="text-[10px] font-extrabold text-white">{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

// Turns the screen to the other orientation and keeps it there; pressed again, the app follows the phone again.
export function RotateButton() {
  const rotation = useRotation(), landscape = useLandscape();
  if (!rotationSupported) return null;
  return (
    <IconBtn label={rotation === 'auto' ? 'Rotate the screen' : 'Follow the phone rotation'} onPress={() => toggleRotation(landscape)}
      custom={<MaterialIcons name={rotation === 'auto' ? 'screen-rotation' : 'screen-lock-rotation'} size={19} color={rotation === 'auto' ? C.text : C.accent} />} />
  );
}
