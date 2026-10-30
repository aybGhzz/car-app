// One trip: map, road-type split, and the speed / temperature / consumption traces drawing themselves.
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import { Sparkline, SplitBar } from '../../components/charts';
import { BackHeader } from '../../components/BackHeader';
import { Screen } from '../../components/Screen';
import { TripMap } from '../../components/TripMap';
import { Card, Empty, Grid, Pill, SectionTitle, StatTile, T } from '../../components/ui';
import { useFuelPrice, useVehicles, vehicleTitle, withStats, type MinMax, type Trip } from '../../lib/garage';
import { fmtDate, fmtTime, hm, num, t, useLang } from '../../lib/i18n';
import { useStored } from '../../lib/store';
import { C } from '../../lib/theme';

export default function TripDetail() {
  useLang();
  const { id } = useLocalSearchParams<{ id: string }>();
  const stored = useStored<Trip[]>('trips', []);
  const tr = useMemo(() => withStats(stored).find(x => x.id === id), [stored, id]);
  const vehicles = useVehicles();
  const car = vehicles.find(v => v.id === (tr?.vehicle ?? vehicles[0].id));
  const price = useFuelPrice(car?.id ?? '');
  if (!tr) return <Screen title="Trips" header={<BackHeader title="Trips" onBack={() => router.back()} />}><Empty text="No data" /></Screen>;
  const s = tr.stats, sp = tr.split, kmOf = (p: number) => num((s.dist * p) / 100, 1);
  const temps = (label: string, m: MinMax, i: number) => m ? (
    <Grid>
      <StatTile index={i} label={label + ' average'} value={num(m.avg)} unit="°C" />
      <StatTile index={i + 1} label={label + ' min'} value={num(m.min)} unit="°C" />
      <StatTile index={i + 2} label={label + ' max'} value={num(m.max)} unit="°C" />
    </Grid>
  ) : null;

  return (
    <Screen title="Trips" header={<BackHeader title={`${fmtDate(tr.start)}, ${fmtTime(tr.start)} – ${fmtTime(tr.end)}`} onBack={() => router.back()}
      right={tr.demo ? <Pill kind="off" text="demo data" /> : undefined} />}>
      <Animated.View entering={FadeIn.duration(500)}>
        {tr.path?.length ? <TripMap path={tr.path} /> : <Card><T className="text-muted">No GPS position was recorded for this trip.</T></Card>}
      </Animated.View>
      {car ? <Text className="mt-3 px-1 text-sm font-semibold text-text">🚘 {vehicleTitle(car)}{car.plate ? ' · ' + car.plate : ''}</Text> : null}
      {tr.places ? (
        <View className="mt-2 flex-row justify-between px-1">
          <Text className="text-xs text-ok">● {t('Start: ' + tr.places[0])}</Text>
          <Text className="text-xs text-bad">● {t('End: ' + tr.places[1])}</Text>
        </View>
      ) : null}

      <SectionTitle>Road type</SectionTitle>
      <Card index={1}>
        <SplitBar split={sp} delay={200} />
        <View className="mt-3 flex-row justify-between">
          {(['city', 'highway', 'road'] as const).map(k => (
            <View key={k}><Text className="text-lg font-bold text-text">{kmOf(sp[k])} km</Text><T className="text-xs text-muted">{k[0].toUpperCase() + k.slice(1)}</T></View>
          ))}
        </View>
        <T className="mt-3 text-xs text-muted">Placeholder numbers. The speed-profile classifier will compute these in the backend.</T>
      </Card>

      <SectionTitle>Summary</SectionTitle>
      <Grid>
        <StatTile index={2} label="Distance" value={num(s.dist, 2)} unit="km" />
        <StatTile index={3} label="Duration" value={hm(s.time)} />
        <StatTile index={4} label="Driving time" value={hm(s.driving)} />
        <StatTile index={5} label="Standing time" value={hm(s.standing)} />
        <StatTile index={6} label="Fuel used" value={num(s.fuel, 2)} unit="L" />
        <StatTile index={7} label="Consumption" value={s.consumption == null ? '—' : num(s.consumption, 2)} unit="L/100km" />
        <StatTile index={8} label="Cost" value={num(s.fuel * price, 2)} unit="MAD" />
        <StatTile index={9} label="Maximum" value={num(s.maxSpeed)} unit="km/h" />
      </Grid>

      <SectionTitle>Speed</SectionTitle>
      <Card><Sparkline points={tr.samples.map(x => [x[0], x[1]])} color={C.accent} unit="km/h" /></Card>

      <SectionTitle>Accelerations and decelerations</SectionTitle>
      <Grid>
        <StatTile label="Hard accelerations" value={String(s.hardAcc)} unit="times" color={s.hardAcc ? C.warn : undefined} />
        <StatTile label="Hard braking" value={String(s.hardBrake)} unit="times" color={s.hardBrake ? C.bad : undefined} />
        <StatTile label="Max acceleration" value={num(s.maxAcc, 2)} unit="m/s²" />
        <StatTile label="Max deceleration" value={num(s.maxDec, 2)} unit="m/s²" />
      </Grid>
      <T className="mt-2 px-1 text-xs text-muted">Hard acceleration means more than 2 m/s², hard braking more than 2.5 m/s².</T>

      <SectionTitle>Engine temperature</SectionTitle>
      {temps('Coolant', s.coolant, 0)}
      <Card className="mt-2.5"><Sparkline points={tr.samples.filter(x => x[2] != null).map(x => [x[0], x[2]!])} color={C.bad} unit="°C" /></Card>

      <SectionTitle>Intake air temperature</SectionTitle>
      {temps('Intake air', s.iat, 0)}
      <Card className="mt-2.5"><Sparkline points={tr.samples.filter(x => x[3] != null).map(x => [x[0], x[3]!])} color={C.warn} unit="°C" /></Card>

      <SectionTitle>Fuel consumption</SectionTitle>
      <Card><Sparkline points={tr.samples.filter(x => x[4] != null && x[1] > 3).map(x => [x[0], Math.min(30, (x[4]! / x[1]) * 100)])} color={C.ok} unit="L/100km" /></Card>
    </Screen>
  );
}
