// Every Mode 01 sensor the car supports, live, each with a bar that slides to the value.
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { ProgressBar } from '../components/charts';
import { Screen } from '../components/Screen';
import { BackHeader } from '../components/BackHeader';
import { Card, Empty } from '../components/ui';
import { availableKeys, meta, useLive, useWantedPids, val } from '../lib/live';
import { num, t, useLang } from '../lib/i18n';
import { C } from '../lib/theme';

export default function Sensors() {
  useLang();
  const S = useLive();
  const keys = availableKeys();
  useWantedPids(keys);
  return (
    <Screen title="All sensors" header={<BackHeader title="All sensors" onBack={() => router.back()} />}>
      {S.status !== 'connected' ? <Empty text='Connect to an adapter, or pick "Simulator" and press Connect.' /> : null}
      {S.status === 'connected' && keys.map((k, i) => {
        const m = meta(k), v = val(k);
        return (
          <Card key={k} index={i} className="mb-2 p-3.5">
            <View className="mb-2 flex-row items-baseline justify-between">
              <Text className="flex-1 font-semibold text-text">{t(m.name)}</Text>
              <Text style={{ fontVariant: ['tabular-nums'] }} className="text-lg font-bold text-text">{v == null ? '—' : num(v, m.dp)}</Text>
              <Text className="ml-1 w-14 text-xs text-muted">{t(m.unit)}</Text>
            </View>
            <ProgressBar frac={v == null ? 0 : (v - m.min) / (m.max - m.min)} color={C.accent} height={5} />
          </Card>
        );
      })}
    </Screen>
  );
}
