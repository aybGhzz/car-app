import '../../global.css';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Toast } from '../components/Toast';
import { SkeletonScreen } from '../components/Loaders';
import { watchDocs } from '../lib/alerts';
import { kv } from '../lib/store';
import { restoreLang } from '../lib/i18n';
import { MAX_W } from '../lib/layout';
import { useSettings } from '../lib/settings';
import { applyTheme, C, themeVars } from '../lib/theme';
import { vars } from 'nativewind';

applyTheme('vindici');

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const { theme } = useSettings();
  useEffect(() => { kv.hydrate().then(() => { restoreLang(); setReady(true); }); }, []);
  useEffect(() => (ready ? watchDocs() : undefined), [ready]);
  applyTheme(theme); // before rendering, so every component reads the new colours
  return (
    // keyed by theme: switching re-renders every screen with the new palette
    <GestureHandlerRootView key={theme} style={[{ flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : C.bg }, vars(themeVars())]}>
      <SafeAreaProvider>
        <StatusBar style={C.dark ? 'light' : 'dark'} />
        {/* a phone-width column, centred on wide screens */}
        <View style={{ flex: 1, width: '100%', maxWidth: MAX_W, alignSelf: 'center', backgroundColor: C.bg, overflow: 'hidden' }}>
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
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
