// Service calendar: bars fill as the odometer nears each "next due" mileage. Swipe a card left to mark it done.
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { ProgressBar } from '../../components/charts';
import { Field } from '../../components/Field';
import { Screen } from '../../components/Screen';
import { Sheet } from '../../components/Sheet';
import { Button, Card, CountUp, Pill, PressableScale, T } from '../../components/ui';
import { serviceKey, serviceState, setOdometer, useOdometer, useServices, useVehicle, type ServiceItem } from '../../lib/garage';
import { VehicleSwitcher } from '../../components/VehicleSwitcher';
import { readOdometer, useLive, useWantedPids } from '../../lib/live';
import { fmtTime, num, t, useLang } from '../../lib/i18n';
import { kv } from '../../lib/store';
import { C, KIND_COLOR } from '../../lib/theme';

function DoneAction({ drag }: { drag: SharedValue<number> }) {
  const s = useAnimatedStyle(() => ({ transform: [{ scale: Math.min(1, Math.abs(drag.value) / 90) }] }));
  return (
    <View className="mb-3 ml-2 w-24 items-center justify-center rounded-3xl bg-ok">
      <Animated.View style={[{ alignItems: 'center' }, s]}>
        <Ionicons name="checkmark-done" size={26} color="#00230f" />
        <Text className="text-xs font-bold text-[#00230f]">{t('Done now')}</Text>
      </Animated.View>
    </View>
  );
}

function ServiceCard({ s, odo, index, onDone, onEdit }: { s: ServiceItem; odo: number; index: number; onDone: () => void; onEdit: () => void }) {
  const st = serviceState(s, odo);
  const color = KIND_COLOR[st.kind];
  const ref = useRef<SwipeableMethods>(null);
  const draggedAt = useRef(0), startX = useRef(0); // a drag must not also count as a tap that opens the editor
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(16)} layout={LinearTransition.springify()}>
      <Swipeable ref={ref} friction={1.6} rightThreshold={70} overshootRight={false}
        renderRightActions={(_, drag) => <DoneAction drag={drag} />}
        onSwipeableOpenStartDrag={() => { draggedAt.current = Date.now(); }}
        onSwipeableOpen={() => {
          draggedAt.current = Date.now();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          onDone();
          setTimeout(() => ref.current?.close(), 700); // snap back showing the reset bar
        }}>
        <PressableScale onPressIn={e => { startX.current = e.nativeEvent.pageX; }}
          onPress={e => { if (Date.now() - draggedAt.current > 500 && Math.abs(e.nativeEvent.pageX - startX.current) < 10) onEdit(); }} className="mb-3 rounded-3xl border border-line bg-panel p-4">
          <View className="flex-row items-center justify-between">
            <T className="text-base font-bold">{s.name}</T>
            <Pill kind={st.kind} text={st.label} />
          </View>
          <Text style={{ color }} className="my-2 text-2xl font-extrabold">
            {st.left < 0 ? t(`+${num(-st.left)} km over`) : `−${num(st.left)} km`}
          </Text>
          <ProgressBar frac={st.used} color={color} delay={200 + index * 60} />
          <View className="mt-2 flex-row justify-between">
            <Text className="text-[11px] text-muted">{t(`Last: ${num(s.last)} km`)}</Text>
            <Text className="text-[11px] text-muted">{t(`${Math.round(Math.max(0, st.used) * 100)}% used`)}</Text>
            <Text className="text-[11px] text-muted">{t(`Next: ${num(s.next)} km`)}</Text>
          </View>
        </PressableScale>
      </Swipeable>
    </Animated.View>
  );
}

export default function Service() {
  useLang();
  const S = useLive();
  const vehicle = useVehicle();
  const list = useServices(vehicle.id);
  const odo = useOdometer(vehicle.id);
  const [edit, setEdit] = useState<ServiceItem | 'new' | null>(null);
  const [odoOpen, setOdoOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  useWantedPids(['A6']); // cars that report the odometer refresh the bars live

  const save = (l: ServiceItem[]) => kv.set(serviceKey(vehicle.id), l);
  const done = (id: string) => { const o = Math.round(odo.value); save(list.map(s => (s.id === id ? { ...s, last: o, next: o + s.interval } : s))); };
  const open = (s: ServiceItem | 'new') => {
    setEdit(s);
    setForm(s === 'new' ? { name: '', last: String(Math.round(odo.value)), interval: '30000' } : { name: s.name, last: String(s.last), next: String(s.next), interval: String(s.interval) });
  };
  const submit = () => {
    if (edit === 'new') {
      if (!form.name) return;
      save([...list, { id: Date.now().toString(36), name: form.name, interval: +form.interval, last: +form.last, next: +form.last + +form.interval }]);
    } else if (edit) save(list.map(s => (s.id === edit.id ? { ...s, name: form.name || s.name, last: +form.last, next: +form.next, interval: +form.interval } : s)));
    setEdit(null);
  };
  const sorted = [...list].sort((a, b) => (a.next - odo.value) - (b.next - odo.value));

  return (
    <Screen title="Service" subtitle="Swipe a card left when the job is done.">
      <VehicleSwitcher />
      <View key={vehicle.id}>
      <PressableScale onPress={() => { setForm({ odo: String(Math.round(odo.value)) }); setMsg(''); setOdoOpen(true); }}>
        <Card className="flex-row items-center">
          <View className="mr-3 h-12 w-12 items-center justify-center rounded-2xl bg-accent/15"><Ionicons name="speedometer-outline" size={24} color={C.accent} /></View>
          <View className="flex-1">
            <T className="text-xs text-muted">Odometer</T>
            <View className="flex-row items-baseline">
              <CountUp value={odo.value} format={v => num(v)} className="text-3xl font-extrabold" />
              <Text className="ml-1 text-sm text-muted">km</Text>
            </View>
            <Text className="text-[11px] text-muted">{odo.source === 'car' ? t(`Read from the car (PID A6) at ${fmtTime(odo.at)}`) : t('Entered manually. It grows with each saved trip.')}</Text>
          </View>
          <Ionicons name="create-outline" size={20} color={C.muted} />
        </Card>
      </PressableScale>
      <View className="h-3" />
      {sorted.map((s, i) => <ServiceCard key={s.id} s={s} odo={odo.value} index={i + 1} onDone={() => done(s.id)} onEdit={() => open(s)} />)}
      <Button title="Add a service item" icon="+" onPress={() => open('new')} />
      </View>

      <Sheet open={edit != null} onClose={() => setEdit(null)} title={edit === 'new' ? 'Add a service item' : edit ? t(edit.name) : ''}>
        {edit === 'new' ? <Field label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder={t('Spark plugs')} /> : null}
        <Field label="Last done at (km)" value={form.last ?? ''} keyboard="numeric" onChange={v => setForm({ ...form, last: v })} />
        {edit !== 'new' ? <Field label="Next due at (km)" value={form.next ?? ''} keyboard="numeric" onChange={v => setForm({ ...form, next: v })} /> : null}
        <Field label="Interval (km)" value={form.interval ?? ''} keyboard="numeric" onChange={v => setForm({ ...form, interval: v })} />
        <Button kind="primary" title={edit === 'new' ? 'Add' : 'Save'} onPress={submit} />
        {edit && edit !== 'new' ? (
          <View className="mt-2 flex-row gap-2">
            <Button title="Done now" className="flex-1" onPress={() => { done(edit.id); setEdit(null); }} />
            <Button kind="danger" title="Delete" className="flex-1" onPress={() => { save(list.filter(s => s.id !== edit.id)); setEdit(null); }} />
          </View>
        ) : null}
      </Sheet>

      <Sheet open={odoOpen} onClose={() => setOdoOpen(false)} title="Odometer">
        <Field label="Set odometer (km)" value={form.odo ?? ''} keyboard="numeric" onChange={v => setForm({ ...form, odo: v })} />
        <Button kind="primary" title="Set" onPress={() => { if (+form.odo > 0) setOdometer(+form.odo, 'manual'); setOdoOpen(false); }} />
        <Button title="Read from car" className="mt-2" disabled={S.status !== 'connected'} onPress={async () => {
          const r = await readOdometer().catch(() => null);
          if (r != null) { setOdometer(r, 'car'); setOdoOpen(false); } else setMsg('This car does not report its odometer over OBD (PID A6). Enter it manually.');
        }} />
        {msg ? <T className="mt-3 text-center text-warn">{msg}</T> : null}
      </Sheet>
    </Screen>
  );
}
