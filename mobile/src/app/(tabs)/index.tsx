// Dashboard: a big speedometer with shift lights, then the user's own gauges (long-press one to change it).
import { useEffect, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Gauge } from '../../components/Gauge';
import { Screen } from '../../components/Screen';
import { VehicleSwitcher } from '../../components/VehicleSwitcher';
import { Sheet } from '../../components/Sheet';
import { Button, Card, PressableScale, SectionTitle, StatTile, T } from '../../components/ui';
import { availableKeys, connect, fuelRateLh, meta, useLive, useWantedPids, val } from '../../lib/live';
import { hm, num, t, useLang } from '../../lib/i18n';
import { kv, useStored } from '../../lib/store';
import { C } from '../../lib/theme';

const DEFAULT_GAUGES = ['0C', '05', '04', '11', '42', '2F'];

function ShiftLights({ rpm }: { rpm: number | null }) {
  const lit = rpm == null ? 0 : Math.max(0, Math.min(10, Math.round(((rpm - 2000) / 4400) * 10)));
  return (
    <View className="mb-1 flex-row justify-center gap-1.5">
      {Array.from({ length: 10 }, (_, i) => <Led key={i} on={i < lit} color={i < 5 ? C.ok : i < 8 ? C.warn : C.bad} flash={lit >= 10} />)}
    </View>
  );
}
function Led({ on, color, flash }: { on: boolean; color: string; flash: boolean }) {
  const o = useSharedValue(0.15);
  useEffect(() => {
    o.value = flash ? withRepeat(withSequence(withTiming(1, { duration: 70 }), withTiming(0.2, { duration: 70 })), -1) : withTiming(on ? 1 : 0.15, { duration: 120 });
  }, [on, flash]);
  const s = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: 0.85 + o.value * 0.15 }] }));
  return <Animated.View style={[{ width: 14, height: 14, borderRadius: 7, backgroundColor: color, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 6 }, s]} />;
}

function Offline() {
  const pulse = useSharedValue(1);
  useEffect(() => { pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: 900 }), withTiming(1, { duration: 900 })), -1); }, []);
  const s = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Card className="items-center overflow-hidden py-8">
      <LinearGradient colors={[C.accent + '30', 'transparent']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 160 }} />
      <Text className="text-5xl">🚗</Text>
      <T className="mt-3 text-center text-xl font-bold">Not connected</T>
      <T className="mb-5 mt-1 text-center text-muted">Plug the ELM327 into the OBD port, or try the built-in simulator.</T>
      <Animated.View style={s}>
        <Button kind="primary" icon="▶" title="Start the simulator" onPress={() => connect('sim')} />
      </Animated.View>
    </Card>
  );
}

export default function Dashboard() {
  useLang();
  const S = useLive();
  const { width } = useWindowDimensions();
  const gauges = useStored<string[]>('gauges', DEFAULT_GAUGES);
  const [editing, setEditing] = useState<number | null>(null);
  useWantedPids(['0C', '0D', ...gauges]);

  const setGauges = (g: string[]) => kv.set('gauges', g);
  const connected = S.status === 'connected';
  const speed = val('0D'), rpm = val('0C');
  const T_ = S.trip, rate = fuelRateLh();
  const inst = rate != null && speed != null ? (speed > 3 ? (rate / speed) * 100 : rate) : null;
  const big = Math.min(width - 64, 300), small = Math.floor((width - 32 - 12) / 2 - 26); // 2 per row: card padding + border

  return (
    <Screen title="Dashboard" subtitle={connected ? S.message : undefined}>
      <VehicleSwitcher />
      {!connected ? <Offline /> : (
        <Animated.View entering={FadeIn.duration(500)}>
          <Card className="items-center pb-5 pt-4">
            <ShiftLights rpm={rpm} />
            <Gauge value={speed} min={0} max={240} unit="km/h" label="Vehicle speed" size={big} ticks redFrom={0.75} />
            <View className="mt-3 w-full flex-row justify-around">
              <Mini label="Engine RPM" value={rpm == null ? '—' : num(rpm)} unit="rpm" />
              <Mini label="Instant consumption" value={inst == null ? '—' : num(inst, 1)} unit={speed != null && speed > 3 ? 'L/100km' : 'L/h'} />
            </View>
          </Card>
        </Animated.View>
      )}

      <SectionTitle right={<PressableScale onPress={() => router.push('/sensors')}><T className="font-semibold text-accent">All sensors →</T></PressableScale>}>
        Gauges
      </SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {gauges.map((k, i) => {
          const m = meta(k);
          return (
            <Animated.View key={k + i} entering={ZoomIn.springify().delay(i * 40)} exiting={ZoomOut.duration(180)} layout={LinearTransition.springify()}>
              <PressableScale delayLongPress={350} onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setEditing(i); }}
                onPress={() => setEditing(i)} className="items-center rounded-3xl border border-line bg-panel px-3 pb-3 pt-2">
                <Gauge value={val(k)} min={m.min} max={m.max} unit={m.unit} label={m.name} dp={m.dp} size={small} />
              </PressableScale>
            </Animated.View>
          );
        })}
      </View>
      <View className="mt-3 flex-row gap-2">
        <Button title="+ Add gauge" className="flex-1" onPress={() => setGauges([...gauges, availableKeys().find(k => !gauges.includes(k)) ?? '0C'])} />
      </View>
      <T className="mt-2 px-1 text-xs text-muted">Tap a gauge to change its sensor.</T>

      {connected && T_.time > 0 ? (
        <>
          <SectionTitle>Current trip</SectionTitle>
          <View className="flex-row flex-wrap gap-2.5">
            <StatTile index={0} label="Distance" value={num(T_.dist, 2)} unit="km" />
            <StatTile index={1} label="Duration" value={hm(T_.time)} />
            <StatTile index={2} label="Fuel used" value={num(T_.fuel, 2)} unit="L" />
            <StatTile index={3} label="Top speed" value={num(T_.max)} unit="km/h" />
          </View>
        </>
      ) : null}

      <Sheet open={editing != null} onClose={() => setEditing(null)} title="Choose a sensor">
        {editing != null ? (
          <>
            {availableKeys().filter(k => k !== 'A6').map(k => (
              <PressableScale key={k} onPress={() => { const g = [...gauges]; g[editing] = k; setGauges(g); setEditing(null); }}
                className={`mb-1.5 flex-row items-center justify-between rounded-2xl border px-4 py-3 ${gauges[editing] === k ? 'border-accent bg-accent/10' : 'border-line bg-panel2'}`}>
                <T className="flex-1 font-semibold">{meta(k).name}</T>
                <T className="text-xs text-muted">{meta(k).unit}</T>
              </PressableScale>
            ))}
            <Button kind="danger" title="Remove gauge" className="mt-2" onPress={() => { setGauges(gauges.filter((_, i) => i !== editing)); setEditing(null); }} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function Mini({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View className="items-center">
      <Text style={{ fontVariant: ['tabular-nums'] }} className="text-2xl font-extrabold text-text">{value}</Text>
      <Text className="text-[11px] text-muted">{t(unit)} · {t(label)}</Text>
    </View>
  );
}
