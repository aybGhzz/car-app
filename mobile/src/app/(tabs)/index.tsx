// Home: where the app opens. The selected car, what needs attention (papers, service, alerts), shortcuts,
// the last trip and the week, each one tap away from its screen.
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useUser } from '../../lib/auth';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '../../components/Screen';
import { TripMap } from '../../components/TripMap';
import { VehicleSwitcher } from '../../components/VehicleSwitcher';
import { Button, Card, DemoTag, PressableScale, SectionTitle, T } from '../../components/ui';
import { useDocRules, useNotifs } from '../../lib/alerts';
import { DAY, dueStatus, serviceState, useOdometer, useServices, useVehicle, vehicleName, useTrips, withStats, type Trip } from '../../lib/garage';
import { connect, useLive } from '../../lib/live';
import { fmtDate, fmtTime, hm, num, t, useLang } from '../../lib/i18n';
import { setSetting, useSettings } from '../../lib/settings';
import { useStored } from '../../lib/store';
import { C, KIND_COLOR } from '../../lib/theme';

type Attention = { icon: any; title: string; sub: string; kind: 'ok' | 'warn' | 'bad'; route: string };

export default function Home() {
  useLang();
  const S = useLive();
  const car = useVehicle();
  const odo = useOdometer(car.id).value;
  const services = useServices(car.id);
  const docs = useDocRules();
  const notifs = useNotifs();
  const cfg = useSettings();
  const stored = useTrips();
  const trips = useMemo(() => withStats(stored, car.id, cfg.demo), [stored, car.id, cfg.demo]);
  const connected = S.status === 'connected';
  const user = useUser();

  // What needs attention for this car, most urgent first.
  const items: Attention[] = [];
  const ins = dueStatus(car.insExpiry), vt = dueStatus(car.vtNext);
  if (ins.days != null && ins.days <= Math.max(docs.insurance.days, 30)) items.push({ icon: 'shield-checkmark', title: ins.days < 0 ? 'Insurance expired' : `Insurance in ${ins.days} days`, sub: car.insCompany, kind: ins.days <= docs.insurance.days ? 'bad' : 'warn', route: '/papers' });
  if (vt.days != null && vt.days <= Math.max(docs.vt.days, 45)) items.push({ icon: 'clipboard', title: vt.days < 0 ? 'Visite technique expired' : `Visite technique in ${vt.days} days`, sub: car.vtCenter, kind: vt.days <= docs.vt.days ? 'bad' : 'warn', route: '/papers' });
  for (const s of services) {
    const st = serviceState(s, odo);
    if (st.left <= docs.service.km * 2) items.push({ icon: 'construct', title: st.left < 0 ? `${t(s.name)}: ${t('overdue')}` : `${t(s.name)}: ${num(st.left)} km ${t('left')}`, sub: t('Service'), kind: st.left < 0 ? 'bad' : 'warn', route: '/service' });
  }
  const unread = notifs.filter(n => !n.read && (!n.vehicle || n.vehicle === car.id) && n.key.startsWith('sig'));
  if (unread.length) items.unshift({ icon: 'pulse', title: unread[0].title, sub: unread[0].body, kind: unread[0].level === 'bad' ? 'bad' : 'warn', route: '/notifications' });
  items.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'bad' ? -1 : 1));

  const last = trips[0];
  const week = trips.filter(tr => tr.start >= Date.now() - 7 * DAY);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (!user) return <Redirect href="/welcome" />; // first launch: welcome, then sign in or continue as a guest
  return (
    <Screen title="Home" subtitle={user.guest ? hello : `${t(hello)}, ${user.name.split(' ')[0]}`}>
      <VehicleSwitcher />
      {cfg.demo && trips.some(tr => tr.demo) ? (
        <View className="mb-3 flex-row items-center rounded-2xl border border-violet/40 bg-violet/10 px-3 py-2.5">
          <Ionicons name="flask" size={16} color={C.violet} />
          <T className="ml-2 flex-1 text-xs text-text">Sample trips are shown so you can explore the app.</T>
          <Text onPress={() => setSetting('demo', false)} className="ml-2 text-xs font-bold text-violet">{t('Hide them')}</Text>
        </View>
      ) : null}

      {/* the car */}
      <Card className="overflow-hidden">
        <LinearGradient colors={[C.accent + '30', 'transparent']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 140 }} />
        <View className="flex-row items-start">
          <View className="flex-1">
            <Text numberOfLines={1} className="text-xl font-extrabold text-text">{vehicleName(car) || t('New car')}</Text>
            <Text numberOfLines={1} className="text-xs text-muted">{[car.year, car.engine, car.plate].filter(Boolean).join(' · ')}</Text>
          </View>
          <View className={`flex-row items-center rounded-full px-2.5 py-1 ${connected ? 'bg-ok/15' : 'bg-line'}`}>
            <View style={{ backgroundColor: connected ? C.ok : C.muted }} className="mr-1.5 h-2 w-2 rounded-full" />
            <T className={`text-[11px] font-bold ${connected ? 'text-ok' : 'text-muted'}`}>{connected ? (S.kind === 'sim' ? 'Simulator' : 'Connected') : 'Not connected'}</T>
          </View>
        </View>
        <View className="mt-4 flex-row items-end justify-between">
          <View>
            <Text style={{ fontVariant: ['tabular-nums'] }} className="text-3xl font-extrabold text-text">{num(odo)}</Text>
            <T className="text-xs text-muted">km on the odometer</T>
          </View>
          <Ionicons name="car-sport" size={56} color={C.accent + '55'} />
        </View>
        <View className="mt-4">
          {connected ? <Button kind="primary" title="Open the live dashboard" onPress={() => router.push('/dashboard')} />
            : <Button kind="primary" title="Start the simulator" onPress={() => connect('sim')} />}
        </View>
      </Card>

      <SectionTitle right={<T className="text-xs text-muted">{items.length ? `${items.length}` : ''}</T>}>Needs attention</SectionTitle>
      {items.length ? items.slice(0, 4).map((it, i) => (
        <Animated.View key={it.title} entering={FadeInDown.delay(80 + i * 60).springify().damping(16)}>
          <PressableScale onPress={() => router.push(it.route as any)} className="mb-2 flex-row items-center rounded-3xl border border-line bg-panel p-3.5">
            <View style={{ backgroundColor: KIND_COLOR[it.kind] + '22' }} className="mr-3 h-10 w-10 items-center justify-center rounded-2xl">
              <Ionicons name={it.icon} size={19} color={KIND_COLOR[it.kind]} />
            </View>
            <View className="flex-1">
              <Text numberOfLines={1} className="font-bold text-text">{t(it.title)}</Text>
              {it.sub ? <Text numberOfLines={1} className="text-xs text-muted">{t(it.sub)}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </PressableScale>
        </Animated.View>
      )) : (
        <Card className="flex-row items-center"><Ionicons name="checkmark-circle" size={22} color={C.ok} /><T className="ml-2 text-muted">All good: papers and service are up to date.</T></Card>
      )}

      <SectionTitle>Shortcuts</SectionTitle>
      <View className="flex-row flex-wrap gap-2.5">
        {([['speedometer', 'Live data', '/dashboard'], ['pulse', 'Trouble codes', '/codes'], ['map', 'Trips', '/trips'],
          ['construct', 'Service', '/service'], ['shield-checkmark', 'Papers', '/papers'], ['car-sport', 'My cars', '/cars']] as const).map(([icon, label, route], i) => (
          <Animated.View key={route} entering={FadeInDown.delay(120 + i * 40).springify().damping(16)} style={{ flexBasis: '30%', flexGrow: 1 }}>
            <PressableScale onPress={() => router.push(route as any)} className="items-center rounded-3xl border border-line bg-panel py-4">
              <Ionicons name={icon} size={24} color={C.accent} />
              <T numberOfLines={1} className="mt-1.5 text-xs font-semibold">{label}</T>
            </PressableScale>
          </Animated.View>
        ))}
      </View>

      {last ? (
        <>
          <SectionTitle right={<Text onPress={() => router.push('/trips')} className="font-semibold text-accent">{t('All trips →')}</Text>}>Last trip</SectionTitle>
          <PressableScale onPress={() => router.push(`/trip/${last.id}`)} className="overflow-hidden rounded-3xl border border-line bg-panel">
            {last.path?.length > 1 ? <View pointerEvents="none"><TripMap path={last.path} height={120} compact /></View> : null}
            <View className="flex-row items-center p-4 pt-3">
              <View className="flex-1">
                <Text className="font-bold text-text">{fmtDate(last.start)} · {fmtTime(last.start)}</Text>
                {last.places ? <Text numberOfLines={1} className="text-xs text-muted">{last.places[0]} → {last.places[1]}</Text> : null}
              </View>
              {last.demo ? <DemoTag /> : null}
            </View>
            <View className="flex-row gap-6 px-4 pb-4">
              <Text className="text-lg font-bold text-text">{hm(last.stats.time)}</Text>
              <Text className="text-lg font-bold text-text">{num(last.stats.dist, 1)} km</Text>
            </View>
          </PressableScale>

          <Card className="mt-2.5 flex-row justify-between">
            <Wk v={num(week.reduce((a, x) => a + x.stats.dist, 0))} l="km this week" />
            <Wk v={String(week.length)} l="Trips" />
            <Wk v={hm(week.reduce((a, x) => a + x.stats.time, 0))} l="Time driving" />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
const Wk = ({ v, l }: { v: string; l: string }) => (
  <View className="items-center"><Text className="text-lg font-extrabold text-text">{v}</Text><T className="text-[11px] text-muted">{l}</T></View>
);
