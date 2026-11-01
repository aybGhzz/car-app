// Profile: who is signed in, their cars, and sign out.
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, PressableScale, T } from '../components/ui';
import { initials, signOut, useUser } from '../lib/auth';
import { useVehicles, vehicleName } from '../lib/garage';
import { fmtDate, fmtTime, t, useLang } from '../lib/i18n';
import { useSyncState } from '../lib/sync';
import { C } from '../lib/theme';
import { ScrollView } from 'react-native';

export default function Profile() {
  useLang();
  const u = useUser();
  const cars = useVehicles();
  const sync = useSyncState();
  const insets = useSafeAreaInsets();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ paddingBottom: 40 }}>
      <LinearGradient colors={C.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top + 8, paddingBottom: 70, paddingHorizontal: 16, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <View className="flex-row items-center">
          <PressableScale onPress={back} accessibilityLabel={t('Back')} className="h-10 w-10 items-center justify-center rounded-full bg-white/20">
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </PressableScale>
          <T className="ml-3 text-lg font-bold text-white">Profile</T>
        </View>
      </LinearGradient>
      <View className="-mt-14 items-center px-4">
        <View style={{ borderColor: C.bg }} className="h-24 w-24 items-center justify-center rounded-full border-4 bg-panel">
          <Text style={{ color: C.accent }} className="text-3xl font-extrabold">{initials(u)}</Text>
        </View>
        <Text className="mt-3 text-xl font-extrabold text-text">{u?.guest ? t('Guest') : u?.name}</Text>
        <Text className="text-sm text-muted">{u?.guest ? t('Not signed in') : u?.email}</Text>
      </View>
      <View className="px-4">
        <Card className="mt-5 py-1">
          <Row icon="calendar-outline" k="Member since" v={u ? fmtDate(u.since) : '—'} />
          <Row icon="car-sport-outline" k="Cars" v={String(cars.length)} />
          <Row icon={u?.cloud ? 'cloud-done-outline' : 'cloud-offline-outline'} k="Sync" v={u?.cloud ? (sync.busy ? t('Syncing…') : sync.at ? `${t('Synced')} ${fmtTime(sync.at)}` : t('Not synced yet')) : t('This phone only')} last />
        </Card>
        <T className="mb-2 mt-5 px-1 text-lg font-bold">My cars</T>
        {cars.map(c => (
          <PressableScale key={c.id} onPress={() => router.push(`/car-edit/${c.id}`)} className="mb-2 flex-row items-center rounded-2xl border border-line bg-panel p-3.5">
            <Ionicons name="car-sport" size={20} color={C.accent} />
            <View className="ml-3 flex-1"><Text className="font-bold text-text">{vehicleName(c)}</Text><Text className="text-xs text-muted">{[c.year, c.plate].filter(Boolean).join(' · ') || '—'}</Text></View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </PressableScale>
        ))}
        {u?.guest ? <Button kind="primary" title="Sign in or create an account" className="mt-4" onPress={() => router.push('/login')} />
          : <Button kind="danger" title="Sign out" className="mt-4" onPress={() => { signOut(); router.replace('/welcome'); }} />}
      </View>
    </ScrollView>
  );
}
const Row = ({ icon, k, v, last }: { icon: any; k: string; v: string; last?: boolean }) => (
  <View className={`flex-row items-center py-3 ${last ? '' : 'border-b border-line/60'}`}>
    <Ionicons name={icon} size={18} color={C.muted} /><T className="ml-3 flex-1 text-muted">{k}</T><Text className="font-semibold text-text">{v}</Text>
  </View>
);
