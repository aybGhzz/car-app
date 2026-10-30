import '../../global.css';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { kv } from '../lib/store';
import { restoreLang } from '../lib/i18n';
import { C } from '../lib/theme';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => { kv.hydrate().then(() => { restoreLang(); setReady(true); }); }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {ready ? (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_right' }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="trip/[id]" />
            <Stack.Screen name="sensors" />
            <Stack.Screen name="cars" />
            <Stack.Screen name="car-edit/[id]" />
          </Stack>
        ) : <View style={{ flex: 1, backgroundColor: C.bg }} />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
