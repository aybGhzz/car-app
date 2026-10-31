// One trip: the route on the map, how long and how far, the car that drove it, then the signal plotter.
// The detailed numbers (road type, fuel, braking, temperatures) are folded under "More details".
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SplitBar } from '../../components/charts';
import { BackHeader } from '../../components/BackHeader';
import { Screen } from '../../components/Screen';
import { Sheet } from '../../components/Sheet';
import { SignalChart, type Series } from '../../components/SignalChart';
import { TripMap } from '../../components/TripMap';
import { Button, Card, DemoTag, Empty, Grid, PressableScale, Segmented, SectionTitle, StatTile, SWATCHES, T } from '../../components/ui';
import { tripKeys, tripSeries, useFuelPrice, withStats, type Trip, type TripWithStats } from '../../lib/garage';
import { meta } from '../../lib/live';
import { fmtDate, fmtTime, hm, num, t, useLang } from '../../lib/i18n';
import { useSettings } from '../../lib/settings';
import { kv, useStored } from '../../lib/store';
import { C } from '../../lib/theme';

export default function TripDetail() {
  useLang();
  const { id } = useLocalSearchParams<{ id: string }>();
  const stored = useStored<Trip[]>('trips', []);
  const tr = useMemo(() => withStats(stored, undefined, true).find(x => x.id === id), [stored, id]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/trips'));
  if (!tr) return <Screen title="Trips" header={<BackHeader title="Trips" onBack={back} />}><Empty text="No data" /></Screen>;
  const s = tr.stats;
  const short = new Date(tr.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <Screen title="Trips" header={<BackHeader title={`${short}, ${fmtTime(tr.start)}`} onBack={back} right={tr.demo ? <DemoTag /> : undefined} />}>
      <Animated.View entering={FadeIn.duration(500)}>
        {tr.path?.length > 1 ? <TripMap path={tr.path} height={240} /> : <Card><T className="text-muted">No GPS position was recorded for this trip.</T></Card>}
      </Animated.View>

      <View className="mt-3 flex-row gap-2.5">
        <Key label="Duration" value={hm(s.time)} icon="time-outline" />
        <Key label="Distance" value={num(s.dist, 1)} unit="km" icon="navigate-outline" />
        <Key label="Average" value={num(s.avgSpeed)} unit="km/h" icon="speedometer-outline" />
      </View>

      <Card className="mt-2.5">
        <Stop color={C.ok} time={fmtTime(tr.start)} place={tr.places?.[0] ?? t('Start')} />
        <View className="ml-[5px] h-5 w-0.5 bg-line" />
        <Stop color={C.bad} time={fmtTime(tr.end)} place={tr.places?.[1] ?? t('End')} />
      </Card>

      <CarCard tr={tr} />

      <SectionTitle>Signals</SectionTitle>
      <Plotter tr={tr} />

      <Details tr={tr} />
    </Screen>
  );
}

function Key({ label, value, unit, icon }: { label: string; value: string; unit?: string; icon: any }) {
  return (
    <Card className="flex-1 p-3">
      <Ionicons name={icon} size={16} color={C.accent} />
      <View className="mt-1 flex-row items-baseline">
        <Text className="text-xl font-extrabold text-text">{value}</Text>
        {unit ? <T className="ml-1 text-xs text-muted">{unit}</T> : null}
      </View>
      <T className="text-[11px] text-muted">{label}</T>
    </Card>
  );
}
const Stop = ({ color, time, place }: { color: string; time: string; place: string }) => (
  <View className="flex-row items-center">
    <View style={{ backgroundColor: color }} className="h-3 w-3 rounded-full" />
    <Text className="ml-3 w-12 text-sm font-bold text-text">{time}</Text>
    <Text numberOfLines={1} className="flex-1 text-sm text-muted">{place}</Text>
  </View>
);

// The car's identity as saved on the trip record (not the car's current details).
function CarCard({ tr }: { tr: TripWithStats }) {
  const c = tr.car;
  if (!c) return null;
  return (
    <Card className="mt-2.5">
      <View className="flex-row items-center">
        <Ionicons name="car-sport" size={18} color={C.accent} />
        <Text numberOfLines={1} className="ml-2 flex-1 font-bold text-text">{[c.name, c.year].filter(Boolean).join(' · ')}</Text>
      </View>
      <View className="mt-2 flex-row flex-wrap">
        <Id k="Plate" v={c.plate} /><Id k="VIN" v={c.vin} /><Id k="Engine" v={c.engine} /><Id k="Car ID" v={c.id} />
      </View>
      <T className="mt-1 text-[11px] text-muted">Saved with the trip, so it stays linked to this car even if the car is edited later.</T>
    </Card>
  );
}
const Id = ({ k, v }: { k: string; v: string }) => (
  <View className="mb-1.5 w-1/2 pr-2"><T className="text-[10px] uppercase text-muted">{k}</T><Text numberOfLines={1} style={{ fontFamily: 'monospace' }} className="text-xs text-text">{v || '—'}</Text></View>
);

// ---------- signal plotter ----------
type PlotLine = { key: string; axis: 'L' | 'R'; color: string };
type PlotChart = { id: string; lines: PlotLine[] };
const PLOT_DEFAULT: PlotChart[] = [{ id: 'a', lines: [{ key: '0D', axis: 'L', color: C.accent }, { key: '0C', axis: 'R', color: C.warn }] }];
const MAX_LINES = 4;

function Plotter({ tr }: { tr: Trip }) {
  const charts = useStored<PlotChart[]>('plotter', PLOT_DEFAULT); // remembered between trips
  const [adding, setAdding] = useState<string | null>(null); // chart id
  const [axis, setAxis] = useState<'L' | 'R'>('L');
  const keys = tripKeys(tr);
  const save = (c: PlotChart[]) => kv.set('plotter', c);
  const update = (id: string, f: (c: PlotChart) => PlotChart) => save(charts.map(c => (c.id === id ? f(c) : c)));
  const nextColor = (c: PlotChart) => SWATCHES.find(x => !c.lines.some(l => l.color === x)) ?? C.accent;

  return (
    <>
      {charts.map((c, ci) => {
        const series: Series[] = c.lines.filter(l => keys.includes(l.key)).map(l => {
          const m = meta(l.key);
          return { key: l.key, label: m.name, unit: m.unit, color: l.color, axis: l.axis, dp: m.dp, points: tripSeries(tr, l.key) };
        });
        return (
          <Card key={c.id} className="mb-2.5">
            <View className="mb-2 flex-row flex-wrap items-center gap-1.5">
              {c.lines.map(l => (
                <View key={l.key} style={{ borderColor: l.color + '88' }} className="flex-row items-center rounded-full border bg-panel2 py-1 pl-2.5 pr-1">
                  <View style={{ backgroundColor: l.color }} className="mr-1.5 h-2 w-2 rounded-full" />
                  <Text numberOfLines={1} className="max-w-[130px] text-xs font-semibold text-text">{t(meta(l.key).name)}</Text>
                  {/* tap the axis letter to move the line to the other y-axis */}
                  <PressableScale accessibilityLabel={t('Switch axis')} onPress={() => update(c.id, x => ({ ...x, lines: x.lines.map(y => (y.key === l.key ? { ...y, axis: y.axis === 'L' ? 'R' : 'L' } : y)) }))}
                    className="ml-1.5 rounded-full bg-line px-1.5 py-0.5">
                    <Text className="text-[10px] font-bold text-text">{l.axis === 'L' ? t('L axis') : t('R axis')}</Text>
                  </PressableScale>
                  <PressableScale accessibilityLabel={t('Remove')} onPress={() => update(c.id, x => ({ ...x, lines: x.lines.filter(y => y.key !== l.key) }))} className="ml-0.5 px-1">
                    <Ionicons name="close" size={14} color={C.muted} />
                  </PressableScale>
                </View>
              ))}
              {c.lines.length < MAX_LINES ? (
                <PressableScale onPress={() => { setAxis(c.lines.some(l => l.axis === 'L') ? 'R' : 'L'); setAdding(c.id); }} className="flex-row items-center rounded-full border border-dashed border-accent px-2.5 py-1">
                  <Ionicons name="add" size={14} color={C.accent} /><T className="text-xs font-semibold text-accent">Signal</T>
                </PressableScale>
              ) : null}
              {charts.length > 1 ? (
                <PressableScale accessibilityLabel={t('Delete chart')} onPress={() => save(charts.filter(x => x.id !== c.id))} className="ml-auto p-1">
                  <Ionicons name="trash-outline" size={16} color={C.muted} />
                </PressableScale>
              ) : null}
            </View>
            {series.length ? <SignalChart series={series} height={ci === 0 ? 210 : 170} /> : <Empty text="Add a signal to this chart." />}
          </Card>
        );
      })}
      <Button title="+ Add a chart" onPress={() => save([...charts, { id: Date.now().toString(36), lines: [{ key: keys.find(k => k === '05') ?? keys[0], axis: 'L', color: C.bad }] }])} />
      <T className="mt-2 px-1 text-xs text-muted">Up to 4 signals per chart, on a left and a right axis. Drag across a chart to read the values.</T>

      <Sheet open={adding != null} onClose={() => setAdding(null)} title="Add a signal">
        <T className="mb-1 text-xs text-muted">Axis</T>
        <Segmented value={axis} onChange={setAxis} options={[['L', 'Left axis'], ['R', 'Right axis']]} className="mb-3" />
        {keys.map(k => {
          const c = charts.find(x => x.id === adding), on = c?.lines.some(l => l.key === k);
          return (
            <PressableScale key={k} disabled={on} onPress={() => { if (c) update(c.id, x => ({ ...x, lines: [...x.lines, { key: k, axis, color: nextColor(x) }] })); setAdding(null); }}
              className={`mb-1.5 flex-row items-center justify-between rounded-2xl border px-4 py-3 ${on ? 'border-line opacity-40' : 'border-line bg-panel2'}`}>
              <T className="flex-1 font-semibold">{meta(k).name}</T>
              <T className="text-xs text-muted">{on ? 'Already in the chart' : meta(k).unit}</T>
            </PressableScale>
          );
        })}
      </Sheet>
    </>
  );
}

// ---------- the detailed numbers, folded ----------
function Details({ tr }: { tr: TripWithStats }) {
  const [open, setOpen] = useState(false);
  const price = useFuelPrice(tr.vehicle ?? '');
  const { currency } = useSettings();
  const s = tr.stats, sp = tr.split, kmOf = (p: number) => num((s.dist * p) / 100, 1);
  return (
    <>
      <PressableScale onPress={() => setOpen(!open)} className="mt-6 flex-row items-center justify-between rounded-2xl border border-line bg-panel px-4 py-3.5">
        <T className="font-bold">More details</T>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
      </PressableScale>
      {open ? (
        <>
          <SectionTitle>Road type</SectionTitle>
          <Card>
            <SplitBar split={sp} delay={100} />
            <View className="mt-3 flex-row justify-between">
              {(['city', 'highway', 'road'] as const).map(k => (
                <View key={k}><Text className="text-lg font-bold text-text">{kmOf(sp[k])} km</Text><T className="text-xs text-muted">{k[0].toUpperCase() + k.slice(1)}</T></View>
              ))}
            </View>
            <T className="mt-3 text-xs text-muted">Placeholder numbers. The speed-profile classifier will compute these in the backend.</T>
          </Card>
          <SectionTitle>Fuel and time</SectionTitle>
          <Grid>
            <StatTile label="Fuel used" value={num(s.fuel, 2)} unit="L" />
            <StatTile label="Consumption" value={s.consumption == null ? '—' : num(s.consumption, 1)} unit="L/100km" />
            <StatTile label="Cost" value={num(s.fuel * price, 0)} unit={currency} />
            <StatTile label="Standing time" value={hm(s.standing)} />
          </Grid>
          <SectionTitle>Driving style</SectionTitle>
          <Grid>
            <StatTile label="Hard accelerations" value={String(s.hardAcc)} unit="times" color={s.hardAcc ? C.warn : undefined} />
            <StatTile label="Hard braking" value={String(s.hardBrake)} unit="times" color={s.hardBrake ? C.bad : undefined} />
            <StatTile label="Maximum" value={num(s.maxSpeed)} unit="km/h" />
            <StatTile label="Max deceleration" value={num(s.maxDec, 1)} unit="m/s²" />
          </Grid>
          <T className="mt-2 px-1 text-xs text-muted">Hard acceleration means more than 2 m/s², hard braking more than 2.5 m/s².</T>
          {s.coolant ? (
            <>
              <SectionTitle>Engine temperature</SectionTitle>
              <Grid>
                <StatTile label="Coolant average" value={num(s.coolant.avg)} unit="°C" />
                <StatTile label="Coolant max" value={num(s.coolant.max)} unit="°C" />
              </Grid>
            </>
          ) : null}
          <T className="mt-3 px-1 text-[11px] text-muted">{fmtDate(tr.start)}</T>
        </>
      ) : null}
    </>
  );
}
