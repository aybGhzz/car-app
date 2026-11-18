import '../../global.css';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Toast } from '../components/Toast';
import { SkeletonScreen } from '../components/Loaders';
import { watchDocs } from '../lib/alerts';
import { autoConnect, recoverTrip } from '../lib/live';
import { useUser, watchAuth } from '../lib/auth';
import { startSync } from '../lib/sync';
import { kv } from '../lib/store';
import { restoreLang } from '../lib/i18n';
import { useLandscape, useMaxW } from '../lib/layout';
import { restoreRotation } from '../lib/rotation';
import { useSettings } from '../lib/settings';
import { applyTheme, C, themeVars } from '../lib/theme';
import { vars } from 'nativewind';

applyTheme('vindici');

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const { theme } = useSettings();
  useEffect(() => { kv.hydrate().then(() => { restoreLang(); restoreRotation(); setReady(true); }); }, []);
  useEffect(() => (ready ? watchDocs() : undefined), [ready]);
  useEffect(() => { if (ready) recoverTrip(); }, [ready]); // a trip cut short by the app being killed
  const user = useUser();
  // the car's last adapter, at start-up and right after signing in (lib/adapters.ts)
  useEffect(() => { if (ready && user) setTimeout(autoConnect, 600); }, [ready, user?.id ?? user?.email ?? null]);
  useEffect(() => {
    if (!ready) return;
    const offAuth = watchAuth(), offSync = startSync();
    return () => { offAuth(); offSync(); };
  }, [ready]);
  applyTheme(theme); // before rendering, so every component reads the new colours
  return (
    // keyed by theme: switching re-renders every screen with the new palette
    <GestureHandlerRootView key={theme} style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : C.bg }}>
      <SafeAreaProvider>
        <StatusBar style={C.dark ? 'light' : 'dark'} />
        <Frame>
          {ready ? (
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_right' }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="trip/[id]" />
              <Stack.Screen name="sensors" />
              <Stack.Screen name="cars" />
              <Stack.Screen name="car-edit/[id]" />
              <Stack.Screen name="papers" />
              <Stack.Screen name="notifications" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
              <Stack.Screen name="login" options={{ animation: 'fade' }} />
              <Stack.Screen name="profile" />
            </Stack>
          ) : <SkeletonScreen />}
          {ready ? <Toast /> : null}
        </Frame>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// A phone-width column, centred on wide screens; the whole width on a phone turned sideways, clear of the notch.
// The theme colour variables go here: NativeWind only applies vars() on its own components, so on
// GestureHandlerRootView they were dropped on Android.
function Frame({ children }: { children: ReactNode }) {
  const maxWidth = useMaxW(), landscape = useLandscape(), insets = useSafeAreaInsets();
  return (
    <View style={[{ flex: 1, width: '100%', maxWidth, alignSelf: 'center', backgroundColor: C.bg, overflow: 'hidden' },
      landscape ? { paddingLeft: insets.left, paddingRight: insets.right } : null, vars(themeVars())]}>
      {children}
    </View>
  );
}
