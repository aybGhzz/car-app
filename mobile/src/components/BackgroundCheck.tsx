// Settings > Trips: what lets the app keep reading the car with the phone locked. Notifications and the battery
// exemption can be checked; phone makers' own battery savers (Samsung, Xiaomi…) can't be read by an app, so those
// rows only open the right screen. Re-checked whenever the user comes back to the app.
import { useEffect, useState } from 'react';
import { AppState, PermissionsAndroid, Platform, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { batteryUnrestricted, notificationsEnabled, openAppSettings, openAutostart, phoneBrand, requestBatteryUnrestricted } from '../../modules/vindici-service';
import { t, useLang } from '../lib/i18n';
import { C } from '../lib/theme';
import { Card, PressableScale, T } from './ui';

type State = { notif: boolean | null; battery: boolean | null; location: boolean | null };

function read(): Promise<State> {
  return Location.getForegroundPermissionsAsync()
    .then(p => p.granted, () => null)
    .then(location => ({ notif: notificationsEnabled(), battery: batteryUnrestricted(), location: Platform.OS === 'web' ? null : location }));
}

function Item({ ok, title, sub, action, onPress, last }: { ok: boolean | null; title: string; sub: string; action?: string; onPress?: () => void; last?: boolean }) {
  const icon = ok == null ? 'information-circle' : ok ? 'checkmark-circle' : 'alert-circle';
  const color = ok == null ? C.muted : ok ? C.ok : C.warn;
  return (
    <View className={`flex-row items-center py-3 ${last ? '' : 'border-b border-line/60'}`}>
      <Ionicons name={icon as any} size={22} color={color} />
      <View className="ml-2.5 flex-1 pr-2">
        <T className="font-semibold">{title}</T>
        <T className="text-xs text-muted">{sub}</T>
      </View>
      {action && onPress && ok !== true ? (
        <PressableScale onPress={onPress} className="rounded-full border border-accent px-3 py-1.5"><Text className="text-xs font-bold text-accent">{t(action)}</Text></PressableScale>
      ) : null}
    </View>
  );
}

export function BackgroundCheck() {
  useLang();
  const [s, setS] = useState<State>({ notif: null, battery: null, location: null });
  useEffect(() => {
    const refresh = () => read().then(setS);
    refresh();
    const sub = AppState.addEventListener('change', a => a === 'active' && refresh());
    return () => sub.remove();
  }, []);
  const brand = phoneBrand();
  const samsung = brand === 'samsung', xiaomi = /xiaomi|redmi|poco/.test(brand), known = samsung || xiaomi;

  async function allowNotifications() {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const r = await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as any).catch(() => null);
      if (r === 'granted') return read().then(setS);
    }
    openAppSettings();
  }

  return (
    <Card className="mt-2.5 py-1">
      <T className="pt-3 font-semibold">Background check</T>
      <T className="text-xs text-muted">Keeps the live data and the trip going with the phone locked or another app open.</T>
      <Item ok={s.notif} title="Notifications" sub="Shows that a trip is being recorded, with a Disconnect button." action="Allow" onPress={allowNotifications} />
      <Item ok={s.battery} title="Battery: no limits" sub="Lets the app run in the background without Android stopping it." action="Allow" onPress={requestBatteryUnrestricted} />
      {samsung || !known ? (
        <Item ok={null} title="Samsung" sub="App info > Battery > Unrestricted. In Battery > Background usage limits, Vindici must not be in Sleeping or Deep sleeping apps." action="Open" onPress={openAppSettings} />
      ) : null}
      {xiaomi || !known ? (
        <Item ok={null} title="Xiaomi, Redmi, POCO" sub="Autostart on, and Battery saver set to No restrictions." action="Open" onPress={openAutostart} />
      ) : null}
      <Item ok={s.location} title="Location (route only)" sub="'While using the app' is enough. Without it, trips are recorded without the map." action="Allow"
        onPress={() => Location.requestForegroundPermissionsAsync().then(() => read().then(setS))} last />
    </Card>
  );
}
