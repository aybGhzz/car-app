// First screen of a new install: the brand, what the app does, then sign in or explore.
import { View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from '../components/Logo';
import { Button, T } from '../components/ui';
import { useLang } from '../lib/i18n';
import { C } from '../lib/theme';

const FEATURES: [any, string, string][] = [
  ['pulse', 'Read and understand trouble codes', 'Scan every ECU with an ELM327 adapter, then search the web for your exact car and code.'],
  ['speedometer', 'Live data and alerts', 'Gauges you can colour, and notifications when the coolant runs hot or the battery drops.'],
  ['map', 'Trips, service and papers', 'Every trip with its route, maintenance reminders, insurance and visite technique countdowns.'],
];

export default function Welcome() {
  useLang();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }} className="bg-bg px-6">
      <LinearGradient colors={[C.accent2 + '40', 'transparent']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 360 }} />
      <Animated.View entering={FadeInDown.springify().damping(14)}>
        <View className="items-center">
          <Logo size={92} />
          <T className="mt-3 text-center text-base text-muted">Your car's health, trips and papers in one place.</T>
        </View>
      </Animated.View>
      <View className="mt-10 flex-1">
        {FEATURES.map(([icon, title, sub], i) => (
          <Animated.View key={title} entering={FadeInDown.delay(150 + i * 110).springify().damping(16)}>
            <View className="mb-5 flex-row">
            <View style={{ backgroundColor: C.accent + '1a' }} className="mr-4 h-12 w-12 items-center justify-center rounded-2xl">
              <Ionicons name={icon} size={22} color={C.accent} />
            </View>
            <View className="flex-1"><T className="text-base font-bold">{title}</T><T className="mt-0.5 text-sm text-muted">{sub}</T></View>
            </View>
          </Animated.View>
        ))}
      </View>
      <Animated.View entering={FadeInUp.delay(450).springify().damping(16)}>
        <View className="mb-5 flex-row justify-center gap-1.5">
          <View className="h-1.5 w-6 rounded-full bg-accent" /><View className="h-1.5 w-1.5 rounded-full bg-line" /><View className="h-1.5 w-1.5 rounded-full bg-line" />
        </View>
        <Button kind="primary" title="Get started" onPress={() => router.push({ pathname: '/login', params: { mode: 'signup' } })} />
        <Button title="I already have an account" className="mt-2.5" onPress={() => router.push('/login')} />
      </Animated.View>
    </View>
  );
}
