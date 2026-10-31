// Trips: a short summary of the last 7 days, then one card per trip with its route, duration and distance.
// Fuel, costs and the other details are on each trip's page.
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BarChart } from '../../components/charts';
import { Screen } from '../../components/Screen';
import { TripMap } from '../../components/TripMap';
import { Card, CountUp, DemoTag, Empty, PressableScale, SectionTitle, T } from '../../components/ui';
import { DAY, useVehicle, withStats, type Trip, type TripWithStats } from '../../lib/garage';
import { VehicleSwitcher } from '../../components/VehicleSwitcher';
import { fmtDate, fmtTime, hm, locale, num, t, useLang } from '../../lib/i18n';
import { useSettings } from '../../lib/settings';
import { useStored } from '../../lib/store';
import { C } from '../../lib/theme';

export function TripCard({ tr, index }: { tr: TripWithStats; index: number }) {
  const s = tr.stats;
  return (
    <Animated.View entering={FadeInDown.delay(120 + Math.min(index, 8) * 60).springify().damping(16)}>
      <PressableScale onPress={() => router.push(`/trip/${tr.id}`)} className="mb-3 overflow-hidden rounded-3xl border border-line bg-panel">
        {tr.path?.length > 1 ? <View pointerEvents="none"><TripMap path={tr.path} height={130} compact /></View> : null}
        <View className="p-4 pt-3">
          <View className="flex-row items-center justify-between">
            <Text className="font-bold text-text">{fmtDate(tr.start)} · {fmtTime(tr.start)}</Text>
            <View className="flex-row items-center gap-2">{tr.demo ? <DemoTag /> : null}<Ionicons name="chevron-forward" size={18} color={C.muted} /></View>
          </View>
          {tr.places ? (
            <View className="mt-1 flex-row items-center">
              <View className="h-2 w-2 rounded-full bg-ok" /><Text numberOfLines={1} className="ml-1.5 flex-shrink text-xs text-muted">{tr.places[0]}</Text>
              <Text className="mx-1.5 text-xs text-muted">→</Text>
              <View className="h-2 w-2 rounded-full bg-bad" /><Text numberOfLines={1} className="ml-1.5 flex-shrink text-xs text-muted">{tr.places[1]}</Text>
            </View>
          ) : null}
          <View className="mt-3 flex-row gap-6">
            <Fig icon="time-outline" v={hm(s.time)} />
            <Fig icon="navigate-outline" v={num(s.dist, 1) + ' km'} />
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}
const Fig = ({ icon, v }: { icon: any; v: string }) => (
  <View className="flex-row items-center"><Ionicons name={icon} size={16} color={C.accent} /><Text className="ml-1.5 text-lg font-bold text-text">{v}</Text></View>
);

export default function Trips() {
  useLang();
  const stored = useStored<Trip[]>('trips', []);
  const vehicle = useVehicle();
  const { demo } = useSettings();
  const trips = useMemo(() => withStats(stored, vehicle.id, demo), [stored, vehicle.id, demo]);

  const since = new Date().setHours(0, 0, 0, 0) - 6 * DAY;
  const week = trips.filter(tr => tr.start >= since);
  const dist = week.reduce((a, tr) => a + tr.stats.dist, 0), time = week.reduce((a, tr) => a + tr.stats.time, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d0 = since + i * DAY;
    return { label: new Date(d0).toLocaleDateString(locale(), { weekday: 'short' }), value: week.filter(tr => tr.start >= d0 && tr.start < d0 + DAY).reduce((a, tr) => a + tr.stats.dist, 0) };
  });

  return (
    <Screen title="Trips">
      <VehicleSwitcher />
      <View key={vehicle.id}>
        <Card>
          <T className="text-xs font-semibold uppercase text-muted">Last 7 days</T>
          <View className="mb-3 mt-2 flex-row justify-between">
            <Sum label="Distance" unit="km"><CountUp value={dist} format={v => num(v, 0)} className="text-2xl font-extrabold" /></Sum>
            <Sum label="Time driving"><Text className="text-2xl font-extrabold text-text">{hm(time)}</Text></Sum>
            <Sum label="Trips"><CountUp value={week.length} className="text-2xl font-extrabold" /></Sum>
          </View>
          <BarChart data={days} height={80} />
        </Card>

        <SectionTitle>Trips</SectionTitle>
        {trips.length ? trips.map((tr, i) => <TripCard key={tr.id} tr={tr} index={i} />) : <Empty text="No trips yet. Trips are recorded while the adapter is connected." />}
      </View>
    </Screen>
  );
}
const Sum = ({ label, unit, children }: { label: string; unit?: string; children: React.ReactNode }) => (
  <View>
    <View className="flex-row items-baseline">{children}{unit ? <T className="ml-1 text-xs text-muted">{unit}</T> : null}</View>
    <T className="text-[11px] text-muted">{label}</T>
  </View>
);
