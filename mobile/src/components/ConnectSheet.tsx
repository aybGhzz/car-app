// Connection picker: simulator, classic Bluetooth (paired adapters) or Bluetooth LE (scan).
import { useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { connect, disconnect, useLive } from '../lib/live';
import { listClassicDevices, scanBle } from '../lib/transports/bluetooth';
import type { ConnKind, FoundDevice } from '../lib/transports/types';
import { t, useLang } from '../lib/i18n';
import { C } from '../lib/theme';
import { Sheet } from './Sheet';
import { Button, PressableScale, T } from './ui';

const OPTIONS: { kind: ConnKind; icon: string; title: string; sub: string }[] = [
  { kind: 'sim', icon: '🧪', title: 'Simulator (no car needed)', sub: 'A fake CAN car on a 30 s drive cycle.' },
  { kind: 'classic', icon: '📶', title: 'ELM327 Bluetooth (classic)', sub: 'Pair the adapter in Android settings first (PIN 1234 or 0000).' },
  { kind: 'ble', icon: '🔵', title: 'ELM327 Bluetooth LE', sub: 'Vgate iCar Pro BLE, OBDLink CX, “BLE 4.0” adapters.' },
];

export function ConnectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useLang();
  const S = useLive();
  const [kind, setKind] = useState<ConnKind>('sim');
  const [devices, setDevices] = useState<FoundDevice[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState('');

  async function pick(k: ConnKind) {
    setKind(k); setDevices(null); setErr('');
    if (k === 'sim') return;
    setSearching(true);
    try { setDevices(k === 'classic' ? await listClassicDevices() : await scanBle()); }
    catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setSearching(false); }
  }

  async function go(id?: string) {
    onClose();
    await connect(kind, id);
  }

  const connected = S.status === 'connected' || S.status === 'connecting';
  return (
    <Sheet open={open} onClose={onClose} title={connected ? 'Connection' : 'Connect'}>
      {connected ? (
        <Animated.View entering={FadeIn}>
          <View className="mb-3 rounded-2xl border border-line bg-panel2 p-4">
            <T className="text-xs text-muted">Protocol</T>
            <Text className="mt-1 text-base font-semibold text-text">{t(S.message)}</Text>
            {S.elm?.version ? <Text className="mt-1 text-xs text-muted">{S.elm.version}</Text> : null}
          </View>
          <Button kind="danger" title="Disconnect" onPress={() => { disconnect(); onClose(); }} />
        </Animated.View>
      ) : (
        <Animated.View layout={LinearTransition.springify()}>
          {S.status === 'error' ? <Text className="mb-3 rounded-2xl bg-bad/10 p-3 text-bad">{t(S.message)}</Text> : null}
          {OPTIONS.filter(o => !(o.kind === 'classic' && Platform.OS === 'ios')).map((o, i) => (
            <Animated.View key={o.kind} entering={FadeInDown.delay(i * 60).springify()}>
              <PressableScale onPress={() => pick(o.kind)}
                className={`mb-2.5 flex-row items-center rounded-2xl border p-4 ${kind === o.kind ? 'border-accent bg-accent/10' : 'border-line bg-panel2'}`}>
                <Text className="mr-3 text-2xl">{o.icon}</Text>
                <View className="flex-1">
                  <T className="text-base font-semibold">{o.title}</T>
                  <T className="mt-0.5 text-xs text-muted">{o.sub}</T>
                </View>
              </PressableScale>
            </Animated.View>
          ))}
          {searching ? (
            <View className="flex-row items-center justify-center py-4"><ActivityIndicator color={C.accent} /><T className="ml-2 text-muted">Searching for adapters…</T></View>
          ) : null}
          {err ? <Text className="mb-2 text-center text-warn">{t(err)}</Text> : null}
          {devices?.length === 0 ? <T className="mb-2 text-center text-muted">No adapter found.</T> : null}
          {devices?.map((d, i) => (
            <Animated.View key={d.id} entering={FadeInDown.delay(i * 50)}>
              <PressableScale onPress={() => go(d.id)} className="mb-2 flex-row items-center justify-between rounded-2xl border border-line bg-panel p-3.5">
                <View><Text className="font-semibold text-text">{d.name}</Text><Text className="text-xs text-muted">{d.id}</Text></View>
                <T className="font-semibold text-accent">Connect</T>
              </PressableScale>
            </Animated.View>
          ))}
          {kind === 'sim' ? <Button kind="primary" title="Connect" onPress={() => go()} className="mt-2" /> : null}
        </Animated.View>
      )}
    </Sheet>
  );
}
