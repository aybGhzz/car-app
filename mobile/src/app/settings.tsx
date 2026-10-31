// Settings, by category. "This car" settings are kept per vehicle (pick the car at the top of that section);
// the others apply to the whole app.
import type { ReactNode } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BackHeader } from '../components/BackHeader';
import { Screen } from '../components/Screen';
import { VehicleSwitcher } from '../components/VehicleSwitcher';
import { Button, Card, PressableScale, Segmented, T, Toggle } from '../components/ui';
import { odometer, setOdometer, useFuelPrice, useVehicle, vehicleName } from '../lib/garage';
import { fmtDate, fmtTime, getLang, LANGS, setLang, t, useLang, type Lang } from '../lib/i18n';
import { setSetting, setVehicleSetting, useSettings, useVehicleSettings, type ThemeId } from '../lib/settings';
import { kv, useStored } from '../lib/store';
import { initials, useUser } from '../lib/auth';
import { cloudEnabled } from '../lib/supabase';
import { syncNow, useSyncState } from '../lib/sync';
import { DotsLoader } from '../components/Loaders';
import { C } from '../lib/theme';

function Group({ title, scope, icon, children }: { title: string; scope: 'car' | 'app'; icon: any; children: ReactNode }) {
  return (
    <View className="mt-6">
      <View className="mb-2 flex-row items-center px-1">
        <Ionicons name={icon} size={16} color={C.accent} />
        <T className="ml-2 flex-1 text-lg font-bold">{title}</T>
        <View className={`rounded-full px-2 py-0.5 ${scope === 'car' ? 'bg-accent/15' : 'bg-line'}`}>
          <T className={`text-[10px] font-bold uppercase ${scope === 'car' ? 'text-accent' : 'text-muted'}`}>{scope === 'car' ? 'This car' : 'All cars'}</T>
        </View>
      </View>
      {children}
    </View>
  );
}
const Row = ({ label, sub, children, last }: { label: string; sub?: string; children: ReactNode; last?: boolean }) => (
  <View className={`flex-row items-center py-3 ${last ? '' : 'border-b border-line/60'}`}>
    <View className="flex-1 pr-3"><T className="font-semibold">{label}</T>{sub ? <T className="text-xs text-muted">{sub}</T> : null}</View>
    {children}
  </View>
);
const Link = ({ label, sub, onPress, last }: { label: string; sub?: string; onPress: () => void; last?: boolean }) => (
  <PressableScale onPress={onPress}><Row label={label} sub={sub} last={last}><Ionicons name="chevron-forward" size={18} color={C.muted} /></Row></PressableScale>
);
function Num({ value, onChange, unit, w = 'w-20' }: { value: number; onChange: (n: number) => void; unit: string; w?: string }) {
  const done = (s?: string) => s != null && onChange(+String(s).replace(',', '.').replace(/\s/g, '') || 0);
  return (
    <View className="flex-row items-center">
      <TextInput key={value} defaultValue={String(value)} keyboardType="decimal-pad" accessibilityLabel={t(unit)}
        onEndEditing={e => done(e.nativeEvent.text)} onBlur={(e: any) => done(e?.nativeEvent?.text)}
        className={`${w} rounded-xl border border-line bg-panel2 px-2 py-1.5 text-right font-bold text-text`} />
      <Text className="ml-1.5 min-w-[44px] text-xs text-muted">{t(unit)}</Text>
    </View>
  );
}

const THEMES: { id: ThemeId; name: string; colors: string[]; ready: boolean }[] = [
  { id: 'vindici', name: 'Vindici teal', colors: ['#eef5f6', '#ffffff', '#0d8077'], ready: true },
  { id: 'dark', name: 'Night', colors: ['#0b0e13', '#151a21', '#3fb6ff'], ready: true },
  { id: 'amoled', name: 'Pure black', colors: ['#000000', '#0d0d0d', '#3ccf7a'], ready: false },
  { id: 'racing', name: 'Racing', colors: ['#120808', '#1f0f0f', '#ff4d2e'], ready: false },
];

export default function Settings() {
  useLang();
  const cfg = useSettings();
  const car = useVehicle();
  const vs = useVehicleSettings(car.id, car.fuel);
  const price = useFuelPrice(car.id);
  const user = useUser();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen title="Settings" header={<BackHeader title="Settings" onBack={back} />}>
      <PressableScale onPress={() => router.push('/profile')} className="mt-1 flex-row items-center rounded-3xl border border-line bg-panel p-3.5">
        <View style={{ backgroundColor: C.accent + '1f' }} className="h-12 w-12 items-center justify-center rounded-full"><Text style={{ color: C.accent }} className="text-lg font-extrabold">{initials(user)}</Text></View>
        <View className="ml-3 flex-1"><Text className="font-bold text-text">{user?.guest || !user ? t('Guest') : user.name}</Text><T className="text-xs text-muted">{user?.guest || !user ? 'Sign in to keep your data' : 'Profile and account'}</T></View>
        <Ionicons name="chevron-forward" size={18} color={C.muted} />
      </PressableScale>
      <Group title="This car" scope="car" icon="car-sport">
        <VehicleSwitcher />
        <Card className="py-1">
          <Row label="Fuel price" sub={vehicleName(car)}><Num value={price} unit={`${cfg.currency}/L`} onChange={v => kv.set('fuelPrice.' + car.id, v)} /></Row>
          <Row label="Odometer" sub="Updated by trips and by the car when it reports it"><Num value={Math.round(odometer(car.id).value)} unit="km" w="w-24" onChange={v => setOdometer(v, 'manual', car.id)} /></Row>
          <Row label="Tank capacity"><Num value={vs.tank} unit="L" onChange={v => setVehicleSetting(car.id, 'tank', v)} /></Row>
          <Row label="Shift lights start at"><Num value={vs.shiftFrom} unit="rpm" onChange={v => setVehicleSetting(car.id, 'shiftFrom', v)} /></Row>
          <Row label="Shift lights flash at"><Num value={vs.shiftTo} unit="rpm" onChange={v => setVehicleSetting(car.id, 'shiftTo', v)} /></Row>
          <Row label="Record the route" sub="GPS position during trips"><Toggle value={vs.gps} onChange={v => setVehicleSetting(car.id, 'gps', v)} /></Row>
          <Link label="Car details" sub="Make, model, engine, plate, VIN" onPress={() => router.push(`/car-edit/${car.id}`)} />
          <Link label="Papers" sub="Insurance and visite technique" onPress={() => router.push('/papers')} last />
        </Card>
      </Group>

      <Group title="Notifications" scope="app" icon="notifications">
        <Card className="py-1">
          <Row label="Notifications" sub="Every alert rule"><Toggle value={cfg.notifications} onChange={v => setSetting('notifications', v)} /></Row>
          <Row label="Pop-up banner" sub="Show new alerts at the top of the screen"><Toggle value={cfg.popups} onChange={v => setSetting('popups', v)} /></Row>
          <Link label="Alert rules" sub="Coolant, battery, insurance, visite technique, service" onPress={() => router.push('/notifications')} last />
        </Card>
      </Group>

      <Group title="General" scope="app" icon="options">
        <Card>
          <T className="mb-1.5 mt-1 font-semibold">Language</T>
          <Segmented value={getLang()} onChange={(l: Lang) => setLang(l)} options={(Object.keys(LANGS) as Lang[]).map(l => [l, LANGS[l]] as [Lang, string])} className="mb-3" />
          <T className="mb-1.5 font-semibold">Web search for trouble codes</T>
          <Segmented value={cfg.search} onChange={v => setSetting('search', v)} options={[['google', 'Google'], ['bing', 'Bing'], ['duckduckgo', 'DuckDuckGo']]} className="mb-1" />
          <Row label="Currency" last>
            <TextInput defaultValue={cfg.currency} autoCapitalize="characters" maxLength={4} accessibilityLabel={t('Currency')}
              onEndEditing={e => setSetting('currency', e.nativeEvent.text.trim() || 'MAD')} onBlur={(e: any) => e?.nativeEvent?.text && setSetting('currency', String(e.nativeEvent.text).trim())}
              className="w-20 rounded-xl border border-line bg-panel2 px-2 py-1.5 text-center font-bold text-text" />
          </Row>
        </Card>
      </Group>

      <Group title="Appearance" scope="app" icon="color-palette">
        <View className="flex-row flex-wrap gap-2.5">
          {THEMES.map(th => (
            <PressableScale key={th.id} disabled={!th.ready} onPress={() => { setSetting('theme', th.id); if (Platform.OS !== 'web') setTimeout(() => router.push('/settings'), 60); /* the web keeps the URL */ }} style={{ flexBasis: '47%', flexGrow: 1 }}
              className={`rounded-3xl border p-3 ${cfg.theme === th.id ? 'border-accent' : 'border-line'} bg-panel`}>
              <View style={{ backgroundColor: th.colors[0] }} className="h-16 overflow-hidden rounded-2xl border border-line p-2">
                <View style={{ backgroundColor: th.colors[1] }} className="h-4 w-3/4 rounded-md" />
                <View style={{ backgroundColor: th.colors[2] }} className="mt-2 h-2 w-1/3 rounded-full" />
              </View>
              <View className="mt-2 flex-row items-center justify-between">
                <T className="font-semibold">{th.name}</T>
                {cfg.theme === th.id ? <Ionicons name="checkmark-circle" size={18} color={C.accent} />
                  : !th.ready ? <View className="rounded-full bg-line px-2 py-0.5"><T className="text-[10px] font-bold text-muted">Coming soon</T></View> : null}
              </View>
            </PressableScale>
          ))}
        </View>
      </Group>

      <Group title="Cloud sync" scope="app" icon="cloud">
        <CloudSync />
      </Group>

      <Group title="Data" scope="app" icon="server">
        <Card className="py-1">
          <Row label="Show demo trips" sub="Sample trips so the screens are not empty"><Toggle value={cfg.demo} onChange={v => setSetting('demo', v)} /></Row>
          <Row label="Dashboard gauges" sub="Back to the default six" last>
            <Button title="Reset" onPress={() => { kv.remove('gauges'); kv.remove('gaugeStyle'); }} />
          </Row>
        </Card>
      </Group>

      <T className="mt-6 text-center text-xs text-muted">Vindici · version 1.0 · proof of concept</T>
    </Screen>
  );
}

// Account sync: who is signed in, when the last sync ran, and a manual "Sync now".
function CloudSync() {
  const user = useUser(), st = useSyncState();
  const trips = useStored<unknown[]>('cloudTrips', []);
  if (!cloudEnabled) return <Card><T className="text-sm text-muted">Cloud sync is not set up in this build of the app.</T></Card>;
  if (!user?.cloud) {
    return (
      <Card>
        <T className="mb-3 text-sm text-muted">Sign in to save your cars, papers, services and trips to your account and find them on any phone.</T>
        <Button kind="primary" title="Sign in or create an account" onPress={() => router.push('/login')} />
      </Card>
    );
  }
  return (
    <Card className="py-1">
      <Row label="Account" sub={user.email}><Ionicons name="cloud-done-outline" size={20} color={C.ok} /></Row>
      <Row label="Last sync" sub={st.error ? `${t('Error')}: ${st.error}` : st.at ? `${fmtDate(st.at)}, ${fmtTime(st.at)}` : t('Not synced yet')}>
        {st.busy ? <DotsLoader /> : <Ionicons name={st.error ? 'alert-circle' : 'checkmark-circle'} size={20} color={st.error ? C.bad : C.ok} />}
      </Row>
      <Row label="Trips in the account" sub="Includes the Car Scanner history">
        <Text className="font-bold text-text">{trips.length}</Text>
      </Row>
      <Row label="Sync now" sub="Changes are also sent automatically a few seconds after you make them" last>
        <Button title="Sync" onPress={() => syncNow()} />
      </Row>
    </Card>
  );
}
