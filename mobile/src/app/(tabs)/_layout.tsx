import { Tabs } from 'expo-router';
import { TabBar } from '../../components/TabBar';
import { C } from '../../lib/theme';

export default function TabsLayout() {
  return (
    <Tabs tabBar={p => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg }, animation: 'shift' }}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="codes" options={{ title: 'Trouble codes' }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips' }} />
      <Tabs.Screen name="service" options={{ title: 'Service' }} />
      <Tabs.Screen name="car" options={{ title: 'Ownership' }} />
    </Tabs>
  );
}
