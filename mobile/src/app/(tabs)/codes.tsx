// Trouble codes: a radar sweep while the ECUs are read, then the codes drop in one by one.
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, FadeInDown, FadeOut, LinearTransition, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Screen } from '../../components/Screen';
import { VehicleSwitcher } from '../../components/VehicleSwitcher';
import { Sheet } from '../../components/Sheet';
import { Button, Card, Empty, Pill, PressableScale, SectionTitle, T } from '../../components/ui';
import { clearCodes, readCodes, useLive } from '../../lib/live';
import { describeDTC } from '../../lib/obd/dtc-db';
import { t, useLang } from '../../lib/i18n';
import { C } from '../../lib/theme';

type Result = Awaited<ReturnType<typeof readCodes>>;

function Radar({ active, onPress, disabled }: { active: boolean; onPress: () => void; disabled: boolean }) {
  const spin = useSharedValue(0), ring = useSharedValue(0);
  useEffect(() => {
    if (active) {
      spin.value = 0; ring.value = 0;
      spin.value = withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1);
      ring.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1);
    } else {
      cancelAnimation(spin); cancelAnimation(ring);
      spin.value = withTiming(0); ring.value = 0;
    }
  }, [active]);
  const sweep = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }], opacity: active ? 1 : 0 }));
  const wave = useAnimatedStyle(() => ({ transform: [{ scale: 0.6 + ring.value * 0.6 }], opacity: active ? 1 - ring.value : 0 }));
  const SIZE = 170;
  return (
    <View className="items-center py-2">
      <View style={{ width: SIZE, height: SIZE }} className="items-center justify-center">
        {[1, 0.72, 0.44].map(f => (
          <View key={f} style={{ position: 'absolute', width: SIZE * f, height: SIZE * f, borderRadius: SIZE, borderWidth: 1, borderColor: C.accent + '30' }} />
        ))}
        <Animated.View style={[{ position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE, borderWidth: 2, borderColor: C.accent }, wave]} />
        <Animated.View style={[{ position: 'absolute', width: SIZE, height: SIZE, alignItems: 'center' }, sweep]}>
          <View style={{ width: 3, height: SIZE / 2, backgroundColor: C.accent, borderRadius: 2, shadowColor: C.accent, shadowOpacity: 1, shadowRadius: 10 }} />
        </Animated.View>
        <PressableScale onPress={onPress} disabled={disabled}
          className={`h-24 w-24 items-center justify-center rounded-full ${disabled ? 'bg-panel2' : 'bg-accent'}`}>
          <Ionicons name={active ? 'radio' : 'scan'} size={30} color={disabled ? C.muted : '#001523'} />
          <Text style={{ color: disabled ? C.muted : '#001523' }} className="mt-0.5 text-xs font-bold">{t(active ? 'Scanning…' : 'Read codes')}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

function CodeCard({ code, kind, index }: { code: string; kind: 'Stored' | 'Pending' | 'Permanent'; index: number }) {
  const [open, setOpen] = useState(false);
  const color = kind === 'Stored' ? C.bad : kind === 'Pending' ? C.warn : C.violet;
  return (
    <Animated.View entering={FadeInDown.delay(index * 90).springify()} exiting={FadeOut} layout={LinearTransition.springify()}>
      <PressableScale onPress={() => setOpen(!open)} className="mb-2 overflow-hidden rounded-3xl border border-line bg-panel">
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: color }} />
        <View className="flex-row items-center p-4 pl-5">
          <View className="flex-1">
            <View className="flex-row items-center">
              <Text style={{ fontFamily: 'monospace' }} className="mr-2 text-lg font-extrabold text-text">{code}</Text>
              <Pill kind={kind === 'Stored' ? 'bad' : kind === 'Pending' ? 'warn' : 'off'} text={kind} />
            </View>
            <Text numberOfLines={open ? undefined : 2} className="mt-1.5 text-sm text-muted">{describeDTC(code)}</Text>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

export default function Codes() {
  useLang();
  const S = useLive();
  const [busy, setBusy] = useState<'' | 'read' | 'clear'>('');
  const [res, setRes] = useState<Result | null>(null);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const connected = S.status === 'connected';

  async function read() {
    setBusy('read'); setMsg('');
    try {
      const started = Date.now();
      const r = await readCodes();
      await new Promise(f => setTimeout(f, Math.max(0, 1500 - (Date.now() - started)))); // let the sweep finish a turn
      setRes(r);
      Haptics.notificationAsync(r.stored.length ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) { setMsg(e?.message ?? String(e)); }
    setBusy('');
  }

  async function clear() {
    setConfirm(false); setBusy('clear');
    try {
      const ok = await clearCodes();
      setMsg(ok ? 'Codes cleared.' : 'The ECU refused to clear codes.');
      setBusy('');
      if (ok) await read();
    } catch (e: any) { setMsg(e?.message ?? String(e)); setBusy(''); }
  }

  const total = res ? res.stored.length + res.pending.length + res.permanent.length : 0;
  const mil = res?.readiness?.mil;
  let n = 0;
  return (
    <Screen title="Trouble codes" subtitle="Reads stored (03), pending (07) and permanent (0A) codes from all ECUs that answer.">
      <VehicleSwitcher />
      <Card className="items-center">
        <Radar active={busy === 'read'} onPress={read} disabled={!connected || !!busy} />
        {!connected ? <T className="text-center text-muted">Connect to an adapter, or pick "Simulator" and press Connect.</T> : null}
        {msg ? <Text className="mt-1 text-center text-warn">{t(msg)}</Text> : null}
      </Card>

      {res ? (
        <>
          <Card index={1} className="mt-3 flex-row items-center">
            <View style={{ backgroundColor: (mil ? C.warn : C.ok) + '22', shadowColor: mil ? C.warn : C.ok, shadowOpacity: 0.8, shadowRadius: 14 }}
              className="mr-3 h-12 w-12 items-center justify-center rounded-2xl">
              <Ionicons name={mil ? 'warning' : 'checkmark-circle'} size={26} color={mil ? C.warn : C.ok} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-text">{t('Check engine light:')} {t(mil ? 'ON' : 'OFF')}</Text>
              <Text className="text-xs text-muted">{total ? t(`${total} code(s) found`) : t('No trouble codes.')}</Text>
            </View>
          </Card>

          {(['Stored', 'Pending', 'Permanent'] as const).map(kind => {
            const list = res[kind.toLowerCase() as 'stored' | 'pending' | 'permanent'];
            return list.length ? (
              <View key={kind}>
                <SectionTitle>{kind}</SectionTitle>
                {list.map(c => <CodeCard key={kind + c} code={c} kind={kind} index={n++} />)}
              </View>
            ) : null;
          })}

          {res.readiness ? (
            <>
              <SectionTitle>Readiness</SectionTitle>
              <Card index={n + 1}>
                <View className="flex-row flex-wrap">
                  {res.readiness.monitors.filter((m: any) => m.supported).map((m: any) => (
                    <View key={m.name} className="w-1/2 flex-row items-center py-1.5">
                      <Ionicons name={m.complete ? 'checkmark-circle' : 'time'} size={16} color={m.complete ? C.ok : C.warn} />
                      <Text numberOfLines={1} className="ml-1.5 flex-1 text-xs text-text">{t(m.name)}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </>
          ) : null}

          {total ? <Button kind="danger" title={busy === 'clear' ? 'Clearing…' : 'Clear codes'} className="mt-5" disabled={!!busy} onPress={() => setConfirm(true)} /> : null}
        </>
      ) : connected ? <Empty text="Press the button to read the trouble codes." /> : null}

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Clear codes">
        <T className="mb-4 text-muted">{'Clear all trouble codes?\n\nThis turns off the check-engine light, erases freeze frame data and resets the emissions readiness monitors. Do it with the engine off and ignition on.'}</T>
        <Button kind="danger" title="Clear codes" onPress={clear} />
        <Button title="Cancel" className="mt-2" onPress={() => setConfirm(false)} />
      </Sheet>
    </Screen>
  );
}
