// Every Mode 01 sensor the car reports, live: numbers with a bar that slides to the value, states as text, and
// sensors the app has no formula for as their raw bytes, so nothing the car offers is hidden.
// Above them, the modules (ECUs) that answered when connecting, and which sensors each one has.
import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ProgressBar } from '../components/charts';
import { Screen } from '../components/Screen';
import { BackHeader } from '../components/BackHeader';
import { Card, Empty, PressableScale, SectionTitle, T } from '../components/ui';
import { allSensorKeys, isNumeric, meta, textVal, useLive, useWantedPids, val, type ModuleScan } from '../lib/live';
import { hex2, moduleRole, PIDS, STATUS_PIDS } from '../lib/obd/obd';
import { activeId } from '../lib/garage';
import { useStored } from '../lib/store';
import { useAppWidth, useLandscape } from '../lib/layout';
import { fmtDate, fmtTime, num, t, useLang } from '../lib/i18n';
import { C } from '../lib/theme';

const nameOf = (k: string): string | null => (PIDS as any)[k]?.name ?? (STATUS_PIDS as any)[k]?.name ?? null;
const label = (k: string) => { const n = nameOf(k); return n ? t(n) : `PID ${k}`; };
// text pieces from OBD.text: 1st, 3rd… translated, 2nd, 4th… as they are
const joinText = (parts: string[]) => parts.map((p, i) => (i % 2 ? p : p ? t(p) : '')).join('');

export default function Sensors() {
  useLang();
  const S = useLive();
  const connected = S.status === 'connected';
  const keys = connected ? allSensorKeys() : [];
  useWantedPids(keys);
  const saved = useStored<ModuleScan | null>('modules.' + (S.vehicle || activeId()), null);
  const live = connected && Object.keys(S.modules).length ? { modules: S.modules, ecu: S.ecu, at: 0, protocol: S.elm?.protocolName ?? '' } : null;
  const scan = live ?? saved;
  const width = useAppWidth(), landscape = useLandscape();
  const cardW = landscape ? (width - 32 - 8) / 2 : undefined; // two columns when the phone is sideways

  return (
    <Screen wide title="All sensors" header={<BackHeader title="All sensors" onBack={() => router.back()} />}>
      {!connected ? <Empty text='Connect to an adapter, or pick "Simulator" and press Connect.' /> : null}

      {scan ? <Modules scan={scan} live={!!live} /> : null}

      {connected ? (
        <>
          <SectionTitle right={<T className="text-xs text-muted">{`${keys.length} ${t('supported')}`}</T>}>Sensors</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {keys.map((k, i) => <Sensor key={k} k={k} index={i} width={cardW} />)}
          </View>
          <T className="mt-3 px-1 text-xs text-muted">Every standard OBD-II sensor the module reports. "Raw" sensors have no formula in Vindici yet: their bytes are shown as the car sends them. With many sensors, each one refreshes less often, mostly on older cars (K-line).</T>
        </>
      ) : null}
    </Screen>
  );
}

function Sensor({ k, index, width }: { k: string; index: number; width?: number }) {
  if (isNumeric(k)) {
    const m = meta(k), v = val(k);
    return (
      <Card index={index} className="p-3.5" style={{ width: width ?? '100%' }}>
        <View className="mb-2 flex-row items-baseline justify-between">
          <Text className="flex-1 font-semibold text-text" numberOfLines={2}>{t(m.name)}</Text>
          <Text style={{ fontVariant: ['tabular-nums'] }} className="text-lg font-bold text-text">{v == null ? '—' : num(v, m.dp)}</Text>
          <Text className="ml-1 w-14 text-xs text-muted">{t(m.unit)}</Text>
        </View>
        <ProgressBar frac={v == null ? 0 : (v - m.min) / (m.max - m.min)} color={C.accent} height={5} />
      </Card>
    );
  }
  const parts = textVal(k), raw = !nameOf(k);
  return (
    <Card index={index} className="p-3.5" style={{ width: width ?? '100%' }}>
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 font-semibold text-text" numberOfLines={2}>{label(k)}</Text>
        {raw ? <View className="rounded-full border border-line px-2 py-0.5"><T className="text-[10px] font-bold text-muted">Raw</T></View> : null}
      </View>
      <Text className={`mt-1.5 ${raw ? 'font-mono text-sm text-muted' : 'text-base font-bold text-text'}`}>{parts ? joinText(parts) : '—'}</Text>
    </Card>
  );
}

// The modules that answered the "which sensors do you support" request, engine first. Tap one to see its sensors.
function Modules({ scan, live }: { scan: Pick<ModuleScan, 'modules' | 'ecu' | 'at' | 'protocol'>; live: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const list = Object.entries(scan.modules);
  return (
    <>
      <SectionTitle right={<T className="text-xs text-muted">{live ? 'This connection' : `${t('Last scan')} ${fmtDate(scan.at)} ${fmtTime(scan.at)}`}</T>}>Modules</SectionTitle>
      <Card className="py-1">
        {list.map(([addr, pids], i) => {
          const role = moduleRole(addr), main = addr === scan.ecu, expanded = open === addr;
          return (
            <View key={addr} className={i < list.length - 1 ? 'border-b border-line' : ''}>
              <PressableScale haptic={false} onPress={() => setOpen(expanded ? null : addr)} className="flex-row items-center py-3">
                <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-accent/10">
                  <Ionicons name={role === 'Engine' ? 'speedometer-outline' : role === 'Gearbox' ? 'cog-outline' : 'hardware-chip-outline'} size={18} color={C.accent} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <T className="font-semibold">{role}</T>
                    <Text className="ml-2 font-mono text-xs text-muted">{addr}</Text>
                  </View>
                  <T className="text-xs text-muted">{`${pids.length} ${t('sensors')}${main ? ' · ' + t('live data comes from here') : ''}`}</T>
                </View>
                {main ? <View className="mr-2 h-2 w-2 rounded-full" style={{ backgroundColor: C.ok }} /> : null}
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
              </PressableScale>
              {expanded ? (
                <View className="mb-3 flex-row flex-wrap gap-1.5">
                  {pids.map(n => (
                    <View key={n} className="rounded-full border border-line bg-panel2 px-2.5 py-1">
                      <Text className="text-xs text-text">{label(hex2(n))}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>
      <T className="mt-2 px-1 text-xs text-muted">{`${scan.protocol ? scan.protocol + ' · ' : ''}${t('The modules that answered the standard OBD-II requests. Engine and gearbox are recognised by their address; makers use other modules for their own data.')}`}</T>
    </>
  );
}
