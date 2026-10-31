// The garage: every car with what needs attention, add a car, tap one to select it, edit it from its card.
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BackHeader } from '../components/BackHeader';
import { Screen } from '../components/Screen';
import { Button, Pill, PressableScale, T } from '../components/ui';
import { dueStatus, fuelLabel, selectVehicle, serviceKey, serviceState, useVehicle, useVehicles, vehicleName, useTrips, withStats, odometer,
  SERVICE_DEFAULT, DAY, type ServiceItem, type Trip, type Vehicle } from '../lib/garage';
import { num, t, useLang } from '../lib/i18n';
import { kv, useStored } from '../lib/store';
import { C, KIND_COLOR } from '../lib/theme';

function CarCard({ v, index, selected, trips }: { v: Vehicle; index: number; selected: boolean; trips: ReturnType<typeof withStats> }) {
  const odo = odometer(v.id).value;
  const services = kv.get<ServiceItem[]>(serviceKey(v.id), SERVICE_DEFAULT[v.id] ?? []);
  const next = services.map(s => ({ s, st: serviceState(s, odo) })).sort((a, b) => a.st.left - b.st.left)[0];
  const ins = dueStatus(v.insExpiry, 30), vt = dueStatus(v.vtNext, 45);
  const mine = trips.filter(tr => tr.vehicle === v.id), week = mine.filter(tr => tr.start >= Date.now() - 7 * DAY);
  const km7 = week.reduce((a, tr) => a + tr.stats.dist, 0);
  return (
    <Animated.View entering={FadeInDown.delay(index * 80).springify().damping(16)} layout={LinearTransition.springify()}>
      <PressableScale onPress={() => { selectVehicle(v.id); router.back(); }}
        className={`mb-3 rounded-3xl border bg-panel p-4 ${selected ? 'border-accent' : 'border-line'}`}>
        <View className="flex-row items-center">
          <View style={{ backgroundColor: (selected ? C.accent : C.muted) + '22' }} className="mr-3 h-12 w-12 items-center justify-center rounded-2xl">
            <Ionicons name="car-sport" size={24} color={selected ? C.accent : C.muted} />
          </View>
          <View className="flex-1">
            <Text numberOfLines={1} className="text-base font-bold text-text">{vehicleName(v) || t('New car')}{v.year ? ' · ' + v.year : ''}</Text>
            <Text numberOfLines={1} className="text-xs text-muted">{[v.plate || t('No plate yet'), [v.engine, t(fuelLabel(v.fuel))].filter(Boolean).join(' '), t(v.gearbox)].filter(Boolean).join(' · ')}</Text>
          </View>
          <PressableScale onPress={() => router.push(`/car-edit/${v.id}`)} className="h-10 w-10 items-center justify-center rounded-full border border-line bg-panel2">
            <Ionicons name="create-outline" size={18} color={C.text} />
          </PressableScale>
        </View>
        <View className="mt-3 flex-row justify-between">
          <Stat v={num(odo)} l="km" />
          <Stat v={String(mine.length)} l="Trips" />
          <Stat v={num(km7)} l="km this week" />
        </View>
        <View className="mt-3 flex-row flex-wrap gap-1.5">
          {next ? <Pill kind={next.st.kind} text={`${t(next.s.name)}: ${next.st.left < 0 ? t('Overdue') : '−' + num(next.st.left) + ' km'}`} /> : null}
          <Pill kind={ins.kind} text={`${t('Insurance')}: ${ins.days == null ? t('Not set') : ins.days < 0 ? t('Expired') : ins.days + ' ' + t('days left')}`} />
          <Pill kind={vt.kind} text={`${t('Visite technique')}: ${vt.days == null ? t('Not set') : vt.days < 0 ? t('Expired') : vt.days + ' ' + t('days left')}`} />
        </View>
        {selected ? <View style={{ position: 'absolute', top: 12, right: 64 }}><Text style={{ color: C.accent }} className="text-[10px] font-bold uppercase">{t('Selected')}</Text></View> : null}
      </PressableScale>
    </Animated.View>
  );
}
const Stat = ({ v, l }: { v: string; l: string }) => (
  <View><Text className="text-lg font-extrabold text-text">{v}</Text><T className="text-[10px] text-muted">{l}</T></View>
);

export default function Cars() {
  useLang();
  const list = useVehicles(), cur = useVehicle();
  const stored = useTrips();
  const trips = useMemo(() => withStats(stored).map(tr => ({ ...tr, vehicle: tr.vehicle ?? list[0]?.id })), [stored, list]);
  useStored('odometer.' + cur.id, null); // refresh when the selected car's mileage changes
  return (
    <Screen title="My cars" header={<BackHeader title="My cars" onBack={() => router.back()} />}>
      <T className="mb-3 px-1 text-xs text-muted">Tap a car to show it everywhere in the app. Each car keeps its own trips, maintenance, odometer and papers.</T>
      {list.map((v, i) => <CarCard key={v.id} v={v} index={i} selected={v.id === cur.id} trips={trips} />)}
      <Button kind="primary" icon="+" title="Add a car" className="mt-1" onPress={() => router.push('/car-edit/new')} />
    </Screen>
  );
}
