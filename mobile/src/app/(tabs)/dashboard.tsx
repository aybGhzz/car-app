// Dashboard: a big speedometer with shift lights, then the user's own gauges (long-press one to change it).
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Gauge } from '../../components/Gauge';
import { Screen } from '../../components/Screen';
import { VehicleSwitcher } from '../../components/VehicleSwitcher';
import { Sheet } from '../../components/Sheet';
import { Button, Card, PressableScale, SectionTitle, StatTile, Swatches, T, Toggle } from '../../components/ui';
import { RuleDot, RuleEditor, ruleText } from '../../components/RuleEditor';
import { newRuleId, ruleColor, useRules, type SignalRule } from '../../lib/alerts';
import { useVehicle } from '../../lib/garage';
import { useAppWidth } from '../../lib/layout';
import { useVehicleSettings } from '../../lib/settings';
import { availableKeys, connect, fuelRateLh, meta, useLive, useWantedPids, val } from '../../lib/live';
import { hm, num, t, useLang } from '../../lib/i18n';
import { kv, useStored } from '../../lib/store';
import { C } from '../../lib/theme';

const DEFAULT_GAUGES = ['0C', '05', '04', '11', '42', '2F'];

// The rpm range comes from the car's settings (a diesel shifts much earlier than a petrol engine).
function ShiftLights({ rpm, from, to }: { rpm: number | null; from: number; to: number }) {
  const lit = rpm == null ? 0 : Math.max(0, Math.min(10, Math.round(((rpm - from) / Math.max(1, to - from)) * 10)));
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
      <Ionicons name="car-sport" size={52} color={C.accent} />
      <T className="mt-3 text-center text-xl font-bold">Not connected</T>
      <T className="mb-5 mt-1 text-center text-muted">Plug the ELM327 into the OBD port, or try the built-in simulator.</T>
      <Animated.View style={s}>
        <Button kind="primary" title="Start the simulator" onPress={() => connect('sim')} />
      </Animated.View>
    </Card>
  );
}

export default function Dashboard() {
  useLang();
  const S = useLive();
  const width = useAppWidth();
  const gauges = useStored<string[]>('gauges', DEFAULT_GAUGES);
  const styles = useStored<Record<string, { color?: string; stats?: boolean }>>('gaugeStyle', {});
  const rules = useRules();
  const car = useVehicle();
  const vs = useVehicleSettings(S.vehicle || car.id, car.fuel);
  const [editing, setEditing] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [rule, setRule] = useState<SignalRule | null>(null);
  const liveCar = S.vehicle || car.id;
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
            <ShiftLights rpm={rpm} from={vs.shiftFrom} to={vs.shiftTo} />
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
          const m = meta(k), v = val(k);
          const alert = ruleColor(rules, k, v, liveCar), base = styles[k]?.color ?? C.accent;
          return (
            <Animated.View key={k + i} entering={ZoomIn.springify().delay(i * 40)} exiting={ZoomOut.duration(180)} layout={LinearTransition.springify()}>
              <PressableScale delayLongPress={350} onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setEditing(i); }}
                onPress={() => setEditing(i)}>
                <View style={alert ? { borderColor: alert, backgroundColor: alert + '14' } : undefined} className="items-center rounded-3xl border border-line bg-panel px-3 pb-3 pt-2">
                {/* a matching rule sets the colour; without rules the gauge keeps its own colour */}
                <Gauge value={v} min={m.min} max={m.max} unit={m.unit} label={m.name} dp={m.dp} size={small} color={alert ?? base}
                  redFrom={rules.some(r => r.pid === k && r.color) ? 2 : 0.85} />
                {styles[k]?.stats !== false ? <MinMax k={k} dp={m.dp} width={small} /> : null}
                </View>
              </PressableScale>
            </Animated.View>
          );
        })}
      </View>
      <View className="mt-3 flex-row gap-2">
        <Button title="+ Add gauge" className="flex-1" onPress={() => setGauges([...gauges, availableKeys().find(k => !gauges.includes(k)) ?? '0C'])} />
      </View>
      <T className="mt-2 px-1 text-xs text-muted">Tap a gauge to change its sensor, colour and alerts.</T>

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

      <Sheet open={editing != null} onClose={() => { setEditing(null); setPicking(false); }} title={picking ? 'Choose a sensor' : 'Gauge settings'}>
        {editing != null ? (picking ? (
          availableKeys().filter(k => k !== 'A6').map(k => (
            <PressableScale key={k} onPress={() => { const g = [...gauges]; g[editing] = k; setGauges(g); setPicking(false); }}
              className={`mb-1.5 flex-row items-center justify-between rounded-2xl border px-4 py-3 ${gauges[editing] === k ? 'border-accent bg-accent/10' : 'border-line bg-panel2'}`}>
              <T className="flex-1 font-semibold">{meta(k).name}</T>
              <T className="text-xs text-muted">{meta(k).unit}</T>
            </PressableScale>
          ))
        ) : (() => {
          const k = gauges[editing], mine = rules.filter(r => r.pid === k);
          return (
            <>
              <T className="mb-1 text-xs text-muted">Sensor</T>
              <PressableScale onPress={() => setPicking(true)} className="mb-4 flex-row items-center rounded-2xl border border-line bg-panel2 px-4 py-3">
                <T className="flex-1 text-base font-semibold">{meta(k).name}</T>
                <T className="mr-1 text-sm text-accent">Change</T><Ionicons name="chevron-forward" size={16} color={C.accent} />
              </PressableScale>

              <T className="mb-1.5 text-xs text-muted">Colour</T>
              <View className="mb-4"><Swatches value={styles[k]?.color ?? C.accent} onChange={color => kv.set('gaugeStyle', { ...styles, [k]: { ...styles[k], color } })} /></View>

              <View className="mb-4 flex-row items-center rounded-2xl border border-line bg-panel2 px-4 py-3">
                <View className="flex-1">
                  <T className="font-semibold">Show min / avg / max</T>
                  <T className="text-xs text-muted">Since connecting</T>
                </View>
                <Toggle value={styles[k]?.stats !== false} onChange={v => kv.set('gaugeStyle', { ...styles, [k]: { ...styles[k], stats: v } })} />
              </View>

              <T className="mb-1 text-xs text-muted">Colour changes and alerts</T>
              {mine.map(r => (
                <PressableScale key={r.id} onPress={() => { setEditing(null); setRule(r); }} className="mb-1.5 flex-row items-center rounded-2xl border border-line bg-panel2 px-4 py-3">
                  <RuleDot color={r.color} />
                  <Text className="ml-3 flex-1 font-semibold text-text">{ruleText(r)}</Text>
                  {r.notify ? <Ionicons name="notifications" size={16} color={C.warn} style={{ marginRight: 6 }} /> : null}
                  {r.scope !== 'all' ? <T className="mr-2 text-[10px] text-muted">This car</T> : null}
                  <Ionicons name="chevron-forward" size={16} color={C.muted} />
                </PressableScale>
              ))}
              <Button title="+ Add a colour change or alert" className="mb-4" onPress={() => {
                const m = meta(k);
                setEditing(null);
                setRule({ id: newRuleId(), pid: k, op: 'above', value: Math.round(m.min + (m.max - m.min) * 0.8), color: C.bad, notify: true, enabled: true, scope: 'all' });
              }} />
              <Button kind="danger" title="Remove gauge" onPress={() => { setGauges(gauges.filter((_, i) => i !== editing)); setEditing(null); }} />
            </>
          );
        })()) : null}
      </Sheet>
      <RuleEditor rule={rule} onClose={() => setRule(null)} fixedPid />
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

// Min / avg / max of a signal since connecting, under its gauge (like a scan tool's tiles).
function MinMax({ k, dp, width }: { k: string; dp: number; width: number }) {
  const st = useLive().stats[k];
  const f = (v?: number) => (v == null ? '—' : num(v, dp));
  return (
    <View style={{ width }} className="mt-1 flex-row justify-between">
      {([['Min', st?.min], ['Avg', st ? st.sum / st.n : undefined], ['Max', st?.max]] as const).map(([l, v]) => (
        <View key={l} className="items-center">
          <Text style={{ fontVariant: ['tabular-nums'] }} className="text-xs font-bold text-text">{f(v)}</Text>
          <Text className="text-[10px] text-muted">{t(l)}</Text>
        </View>
      ))}
    </View>
  );
}
