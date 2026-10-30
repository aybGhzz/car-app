// Screen title with the connection chip (tap to connect) and the language button.
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLive } from '../lib/live';
import { getLang, LANGS, setLang, t, useLang, type Lang } from '../lib/i18n';
import { C } from '../lib/theme';
import { ConnectSheet } from './ConnectSheet';
import { Sheet } from './Sheet';
import { PressableScale, T } from './ui';

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
  const [langOpen, setLangOpen] = useState(false);
  const color = S.status === 'connected' ? C.ok : S.status === 'error' ? C.bad : S.status === 'connecting' ? C.warn : C.muted;
  const label = S.status === 'connected' ? (S.kind === 'sim' ? 'Simulator' : 'Connected') : S.status === 'connecting' ? 'Connecting…' : S.status === 'error' ? 'Error' : 'Connect';

  return (
    <View style={{ paddingTop: insets.top + 8 }} className="flex-row items-center justify-between px-4 pb-3">
      <View className="flex-1">
        <Text numberOfLines={1} style={{ fontSize: t(title).length > 12 ? 22 : 28 }} className="font-extrabold tracking-tight text-text">{t(title)}</Text>
        {subtitle ? <T className="text-xs text-muted" numberOfLines={1}>{subtitle}</T> : null}
      </View>
      <PressableScale onPress={() => setLangOpen(true)} className="mr-2 h-10 w-10 items-center justify-center rounded-full border border-line bg-panel">
        <Text className="text-xs font-bold uppercase text-text">{getLang()}</Text>
      </PressableScale>
      <PressableScale onPress={() => setConnOpen(true)} className="h-10 flex-row items-center rounded-full border border-line bg-panel px-3.5">
        {S.status === 'connecting' ? <ActivityIndicator size="small" color={C.warn} style={{ marginRight: 8 }} /> : <PulseDot color={color} pulse={S.status === 'connected'} />}
        <Text className="text-sm font-semibold text-text">{t(label)}</Text>
      </PressableScale>
      <ConnectSheet open={connOpen} onClose={() => setConnOpen(false)} />
      <Sheet open={langOpen} onClose={() => setLangOpen(false)} title="Language">
        {(Object.keys(LANGS) as Lang[]).map(l => (
          <PressableScale key={l} onPress={() => { setLang(l); setLangOpen(false); }}
            className={`mb-2 flex-row items-center justify-between rounded-2xl border px-4 py-3.5 ${l === getLang() ? 'border-accent bg-accent/10' : 'border-line bg-panel2'}`}>
            <Text className="text-base font-semibold text-text">{LANGS[l]}</Text>
            {l === getLang() ? <Text className="text-accent">✓</Text> : null}
          </PressableScale>
        ))}
      </Sheet>
    </View>
  );
}
