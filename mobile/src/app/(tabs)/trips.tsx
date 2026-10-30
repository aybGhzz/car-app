// Trips: last 7 days at a glance (numbers count up, bars grow), then one card per trip.
import { useMemo } from 'react';
import { Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BarChart, SplitBar } from '../../components/charts';
import { Screen } from '../../components/Screen';
import { Card, CountUp, PressableScale, SectionTitle, T } from '../../components/ui';
import { DAY, useFuelPrice, useVehicle, withStats, type Trip, type TripWithStats } from '../../lib/garage';
import { VehicleSwitcher } from '../../components/VehicleSwitcher';
import { fmtDate, fmtTime, hm, locale, num, t, useLang } from '../../lib/i18n';
import { kv, useStored } from '../../lib/store';
import { C } from '../../lib/theme';

function Big({ label, value, dp, unit, index, color = C.text }: { label: string; value: number; dp: number; unit: string; index: number; color?: string }) {
  return (
    <Card index={index} className="p-3.5" style={{ flexBasis: '47%', flexGrow: 1 }}>
      <T className="text-xs text-muted">{label}</T>
      <View className="mt-1 flex-row items-baseline">
        <CountUp value={value} format={v => num(v, dp)} className="text-2xl font-extrabold" />
        <T className="ml-1 text-xs text-muted">{unit}</T>
      </View>
      <View style={{ backgroundColor: color, height: 3, width: 28, borderRadius: 2, marginTop: 8, opacity: 0.8 }} />
    </Card>
  );
}

export function TripCard({ tr, index, price }: { tr: TripWithStats; index: number; price: number }) {
  const s = tr.stats;
  return (
    <Animated.View entering={FadeInDown.delay(150 + index * 70).springify().damping(16)}>
      <PressableScale onPress={() => router.push(`/trip/${tr.id}`)} className="mb-3 rounded-3xl border border-line bg-panel p-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-bold text-text">{fmtDate(tr.start)} · {fmtTime(tr.start)}–{fmtTime(tr.end)}</Text>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </View>
        {tr.places ? (
          <View className="mt-1 flex-row items-center">
            <View className="h-2 w-2 rounded-full bg-ok" /><Text numberOfLines={1} className="ml-1.5 flex-shrink text-xs text-muted">{tr.places[0]}</Text>
            <Text className="mx-1.5 text-xs text-muted">→</Text>
            <View className="h-2 w-2 rounded-full bg-bad" /><Text numberOfLines={1} className="ml-1.5 flex-shrink text-xs text-muted">{tr.places[1]}</Text>
          </View>
        ) : null}
        <View className="my-3 flex-row justify-between">
          <Fig v={num(s.dist, 1)} u="km" />
          <Fig v={num(s.avgSpeed, 0)} u="km/h" />
          <Fig v={s.consumption == null ? '—' : num(s.consumption, 1)} u="L/100km" />
          <Fig v={num(s.fuel * price, 0)} u="MAD" />
        </View>
        <SplitBar split={tr.split} delay={250 + index * 70} />
      </PressableScale>
    </Animated.View>
  );
}
const Fig = ({ v, u }: { v: string; u: string }) => (
  <View><Text className="text-base font-bold text-text">{v}</Text><Text className="text-[10px] text-muted">{t(u)}</Text></View>
);

export default function Trips() {
  useLang();
  const stored = useStored<Trip[]>('trips', []);
  const vehicle = useVehicle();
  const price = useFuelPrice(vehicle.id);
  const trips = useMemo(() => withStats(stored, vehicle.id), [stored, vehicle.id]);

  const since = new Date().setHours(0, 0, 0, 0) - 6 * DAY;
  const week = trips.filter(tr => tr.start >= since);
  const sum = (k: 'dist' | 'fuel' | 'time' | 'driving') => week.reduce((a, tr) => a + tr.stats[k], 0);
  const dist = sum('dist'), fuel = sum('fuel'), time = sum('time'), driving = sum('driving');
  const days = Array.from({ length: 7 }, (_, i) => {
    const d0 = since + i * DAY;
    return { label: new Date(d0).toLocaleDateString(locale(), { weekday: 'short' }), value: week.filter(tr => tr.start >= d0 && tr.start < d0 + DAY).reduce((a, tr) => a + tr.stats.dist, 0) };
  });

  return (
    <Screen title="Trips" subtitle="Last 7 days">
      <VehicleSwitcher />
      {/* keyed by vehicle, so switching cars replays the entrance: numbers count up, bars regrow */}
      <View key={vehicle.id}>
      <View className="flex-row flex-wrap gap-2.5">
        <Big index={0} label="Distance" value={dist} dp={1} unit="km" color={C.accent} />
        <Big index={1} label="Fuel" value={fuel} dp={1} unit="L" color={C.ok} />
        <Big index={2} label="Consumption" value={dist ? (fuel / dist) * 100 : 0} dp={2} unit="L/100km" color={C.warn} />
        <Big index={3} label="Costs" value={fuel * price} dp={0} unit="MAD" color={C.violet} />
      </View>
      <Card index={4} className="mt-2.5 flex-row justify-between">
        <Small l="Total time" v={hm(time)} /><Small l="Driving time" v={hm(driving)} /><Small l="Standing time" v={hm(time - driving)} />
      </Card>
      <Card index={5} className="mt-2.5">
        <T className="mb-3 font-bold">Distance per day (km)</T>
        <BarChart data={days} />
      </Card>

      <SectionTitle right={
        <View className="flex-row items-center">
          <T className="mr-1.5 text-xs text-muted">Fuel price</T>
          <TextInput defaultValue={String(price)} keyboardType="decimal-pad" onEndEditing={e => kv.set('fuelPrice.' + vehicle.id, +e.nativeEvent.text.replace(',', '.') || 0)}
            onBlur={(e: any) => e?.nativeEvent?.text != null && kv.set('fuelPrice.' + vehicle.id, +String(e.nativeEvent.text).replace(',', '.') || 0)}
            className="w-16 rounded-xl border border-line bg-panel2 px-2 py-1 text-right text-text" />
          <T className="ml-1 text-xs text-muted">MAD/L</T>
        </View>
      }>Trips</SectionTitle>
      {trips.map((tr, i) => <TripCard key={tr.id} tr={tr} index={i} price={price} />)}
      </View>
    </Screen>
  );
}
const Small = ({ l, v }: { l: string; v: string }) => (
  <View className="items-center"><Text className="text-base font-bold text-text">{v}</Text><T className="text-[10px] text-muted">{l}</T></View>
);
