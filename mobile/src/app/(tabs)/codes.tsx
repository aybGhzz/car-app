// Trouble codes: a radar sweep while the ECUs are read, then the codes drop in one by one.
import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown, FadeOut, LinearTransition, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Screen } from '../../components/Screen';
import { DotsLoader } from '../../components/Loaders';
import { VehicleSwitcher } from '../../components/VehicleSwitcher';
import { Sheet } from '../../components/Sheet';
import { Button, Card, Empty, Pill, PressableScale, SectionTitle, T } from '../../components/ui';
import { clearCodes, connect, moduleScanSupported, readCodes, scanAllModules, scannedModules, useLive, type CodesResult, type MemoryCode, type ModuleCode } from '../../lib/live';
import { shareAdapterLog } from '../../lib/adapterLog';
import { useVehicle, useVehicles, type Vehicle } from '../../lib/garage';
import { searchUrl, useSettings } from '../../lib/settings';
import { describeDTC } from '../../lib/obd/dtc-db';
import { hex2, kwpStatusLabels, udsStatusLabels } from '../../lib/obd/obd';
import { t, useLang } from '../../lib/i18n';
import { C } from '../../lib/theme';

type Result = CodesResult;
const moduleLabel = (m: { ecu: string; module: string }) => `${t(m.module)} · ${m.ecu}`;

function Radar({ active, onPress, disabled }: { active: boolean; onPress: () => void; disabled: boolean }) {
  const spin = useSharedValue(0), ring = useSharedValue(0);
  useEffect(() => {
    if (active) {
      spin.value = 0; ring.value = 0;
      spin.value = withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1);
      ring.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1);
    } else {
      cancelAnimation(spin); cancelAnimation(ring);
      spin.value = withTiming(0); ring.value = 0;
    }
  }, [active]);
  const sweep = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }], opacity: active ? 1 : 0 }));
  const wave = useAnimatedStyle(() => ({ transform: [{ scale: 0.6 + ring.value * 0.6 }], opacity: active ? 1 - ring.value : 0 }));
  const SIZE = 170;
  return (
    <View className="items-center py-2">
      <View style={{ width: SIZE, height: SIZE }} className="items-center justify-center">
        {[1, 0.72, 0.44].map(f => (
          <View key={f} style={{ position: 'absolute', width: SIZE * f, height: SIZE * f, borderRadius: SIZE, borderWidth: 1, borderColor: C.accent + '30' }} />
        ))}
        <Animated.View style={[{ position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE, borderWidth: 2, borderColor: C.accent }, wave]} />
        <Animated.View style={[{ position: 'absolute', width: SIZE, height: SIZE, alignItems: 'center' }, sweep]}>
          <View style={{ width: 3, height: SIZE / 2, backgroundColor: C.accent, borderRadius: 2, shadowColor: C.accent, shadowOpacity: 1, shadowRadius: 10 }} />
        </Animated.View>
        <PressableScale onPress={onPress} disabled={disabled}
          className={`h-24 w-24 items-center justify-center rounded-full ${disabled ? 'bg-panel2' : 'bg-accent'}`}>
          <Ionicons name={active ? 'radio' : 'scan'} size={30} color={disabled ? C.muted : C.onAccent} />
          {active ? <View className="mt-1.5"><DotsLoader size={6} color={C.onAccent} /></View>
            : <Text style={{ color: disabled ? C.muted : C.onAccent }} className="mt-0.5 text-xs font-bold">{t('Read codes')}</Text>}
        </PressableScale>
      </View>
    </View>
  );
}

// Shares the adapter's transcript of the last read, to see what the car actually answered.
function LogLink({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" className="mt-2 flex-row items-center justify-center py-1.5">
      <Ionicons name="document-text-outline" size={14} color={C.muted} />
      <Text className="ml-1.5 text-xs font-semibold text-muted">{t('Share the adapter log')}</Text>
    </PressableScale>
  );
}

// "BMW 525i E60 2003 2.5 P0171": what the web search looks for, from the car the codes were read from.
const searchQuery = (v: Vehicle | undefined, code: string) => [v?.make, v?.model, v?.year, v?.engine, code].filter(Boolean).join(' ');
const ENGINE_NAME = { google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo' } as const;

type Kind = 'Stored' | 'Pending' | 'Permanent' | 'Active' | 'History';
const KIND_PILL: Record<Kind, 'bad' | 'warn' | 'off'> = { Stored: 'bad', Pending: 'warn', Permanent: 'off', Active: 'bad', History: 'off' };

function CodeCard({ item, kind, index, car }: { item: ModuleCode | MemoryCode; kind: Kind; index: number; car?: Vehicle }) {
  const { code } = item;
  const mem = 'status' in item ? item : null; // a code from the module's own fault memory: failure type + status
  const [open, setOpen] = useState(false);
  const { search } = useSettings();
  const q = searchQuery(car, code);
  const color = kind === 'Stored' || kind === 'Active' ? C.bad : kind === 'Pending' ? C.warn : kind === 'History' ? C.muted : C.violet;
  return (
    <Animated.View entering={FadeInDown.delay(index * 90).springify()} exiting={FadeOut} layout={LinearTransition.springify()}>
      <PressableScale onPress={() => setOpen(!open)} className="mb-2 overflow-hidden rounded-3xl border border-line bg-panel">
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: color }} />
        <View className="flex-row items-center p-4 pl-5">
          <View className="flex-1">
            <View className="flex-row items-center">
              <Text style={{ fontFamily: 'monospace' }} className="mr-2 text-lg font-extrabold text-text">
                {code}{mem?.kind === 'uds' && mem.ftb != null ? <Text className="text-sm font-semibold text-muted">-{hex2(mem.ftb)}</Text> : null}
              </Text>
              <Pill kind={KIND_PILL[kind]} text={kind} />
            </View>
            <View className="mt-1 flex-row items-center">
              <Ionicons name="hardware-chip-outline" size={12} color={C.muted} />
              <Text className="ml-1 text-[11px] font-semibold text-muted">{moduleLabel(item)}</Text>
            </View>
            <Text numberOfLines={open ? undefined : 2} className="mt-1.5 text-sm text-muted">{describeDTC(code)}</Text>
            {mem ? (
              <Text className="mt-1 text-[11px] text-muted">
                {t('Status:')} {(mem.kind === 'kwp' ? kwpStatusLabels : udsStatusLabels)(mem.status).map((l: string) => t(l)).join(', ')} ({hex2(mem.status)})
              </Text>
            ) : null}
          </View>
        </View>
        {/* no built-in code database: send the user to a web search for this car and this code */}
        <PressableScale onPress={() => Linking.openURL(searchUrl(q, search))} accessibilityRole="link"
          className="mx-4 mb-4 ml-5 flex-row items-center rounded-2xl border border-line bg-panel2 px-3 py-2.5">
          <Ionicons name="search" size={16} color={C.accent} />
          <View className="ml-2 flex-1">
            <Text className="text-sm font-semibold text-accent">{t('Search the web')} · {ENGINE_NAME[search]}</Text>
            <Text numberOfLines={1} className="text-[11px] text-muted">“{q}”</Text>
          </View>
          <Ionicons name="open-outline" size={16} color={C.muted} />
        </PressableScale>
      </PressableScale>
    </Animated.View>
  );
}

type Entry = { item: ModuleCode | MemoryCode; kind: Kind };

// One module: its name and address, how many codes it holds; tap to open its codes.
function EcuBox({ mod, entries, index, car }: { mod: { ecu: string; module: string }; entries: Entry[]; index: number; car?: Vehicle }) {
  const [open, setOpen] = useState(false);
  const count = new Set(entries.map(e => e.item.code)).size;
  const bad = entries.some(e => e.kind === 'Stored' || e.kind === 'Active');
  const color = !count ? C.ok : bad ? C.bad : C.warn;
  return (
    <Animated.View entering={FadeInDown.delay(index * 80).springify()} layout={LinearTransition.springify()}>
      <PressableScale onPress={() => count && setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        className="mb-2 flex-row items-center rounded-3xl border border-line bg-panel p-4">
        <View style={{ backgroundColor: color + '22' }} className="mr-3 h-10 w-10 items-center justify-center rounded-2xl">
          <Ionicons name="hardware-chip-outline" size={20} color={color} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-text">{t(mod.module)}</Text>
          <Text style={{ fontFamily: 'monospace' }} className="text-xs text-muted">{t('ID')} {mod.ecu}</Text>
        </View>
        <View style={{ backgroundColor: color + '22' }} className="mr-2 rounded-full px-3 py-1">
          <Text style={{ color }} className="text-xs font-bold">{count ? t(`${count} code(s)`) : t('No codes')}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={count ? C.text : C.line} />
      </PressableScale>
      {open ? (
        <View className="mb-2 ml-3">
          {entries.map((e, i) => <CodeCard key={e.kind + e.item.code + ('ftb' in e.item ? e.item.ftb ?? '' : '')} item={e.item} kind={e.kind} index={i} car={car} />)}
        </View>
      ) : null}
    </Animated.View>
  );
}

function SummaryRow({ icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) {
  return (
    <View className="flex-row items-center py-1.5">
      <Ionicons name={icon} size={16} color={C.accent} />
      <Text className="ml-2 w-28 text-xs text-muted">{t(label)}</Text>
      <Text selectable style={mono ? { fontFamily: 'monospace' } : undefined} className="flex-1 text-sm font-semibold text-text">{value}</Text>
    </View>
  );
}

export default function Codes() {
  useLang();
  const S = useLive();
  const [busy, setBusy] = useState<'' | 'read' | 'clear' | 'scan'>('');
  const [scan, setScan] = useState<{ done: number; total: number; found: number } | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const connected = S.status === 'connected';
  const vehicles = useVehicles(), selected = useVehicle();
  const car = (connected && vehicles.find(v => v.id === S.vehicle)) || selected; // the codes belong to the connected car

  // Asks every module address, then reads the codes again so the new modules show with theirs.
  async function scanAll() {
    setBusy('scan'); setMsg(''); setScan({ done: 0, total: 1, found: 0 });
    try { await scanAllModules(setScan); } catch (e: any) { setMsg(e?.message ?? String(e)); }
    setScan(null); setBusy('');
    await read();
  }

  async function read() {
    setBusy('read'); setMsg('');
    try {
      const started = Date.now();
      const r = await readCodes();
      await new Promise(f => setTimeout(f, Math.max(0, 1500 - (Date.now() - started)))); // let the sweep finish a turn
      setRes(r);
      Haptics.notificationAsync(r.stored.length || r.memory.some(c => c.active) ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) { setRes(null); setMsg(e?.message ?? String(e)); }
    setBusy('');
  }

  async function shareLog() {
    try { await shareAdapterLog('diag'); } catch (e: any) { setMsg(e?.message ?? String(e)); }
  }

  async function clear() {
    setConfirm(false); setBusy('clear');
    try {
      const ok = (await clearCodes()).length > 0;
      setMsg(ok ? 'Codes cleared.' : 'The ECU refused to clear codes.');
      setBusy('');
      if (ok) await read();
    } catch (e: any) { setMsg(e?.message ?? String(e)); setBusy(''); }
  }

  const total = res ? res.stored.length + res.pending.length + res.permanent.length : 0;
  // every module that answered anything, with all its codes: generic (stored, pending, permanent) then its own memory
  const mods = res ? [...new Map([...res.modules, ...res.memoryRead, ...res.stored, ...res.pending, ...res.permanent, ...res.memory]
    .map(m => [m.ecu, { ecu: m.ecu, module: m.module }])).values()].sort((a, b) => a.ecu.localeCompare(b.ecu)) : [];
  const entriesOf = (ecu: string): Entry[] => !res ? [] : [
    ...res.stored.filter(c => c.ecu === ecu).map(item => ({ item, kind: 'Stored' as Kind })),
    ...res.pending.filter(c => c.ecu === ecu).map(item => ({ item, kind: 'Pending' as Kind })),
    ...res.permanent.filter(c => c.ecu === ecu).map(item => ({ item, kind: 'Permanent' as Kind })),
    ...res.memory.filter(c => c.ecu === ecu).map(item => ({ item, kind: (item.active ? 'Active' : 'History') as Kind })),
  ];
  const mil = res?.readiness?.mil;
  const n = mods.length;
  return (
    <Screen title="Trouble codes">
      <VehicleSwitcher />
      <Card className="items-center">
        {!res || busy === 'read' ? <Radar active={busy === 'read'} onPress={read} disabled={!connected || !!busy} /> : (
          <View className="w-full"><Button kind="primary" title="Read again" onPress={read} /></View>
        )}
        {!connected ? (
          <>
            <T className="mb-3 text-center text-muted">Connect to an adapter to read the codes.</T>
            <View className="w-full"><Button kind="primary" title="Start the simulator" onPress={() => connect('sim')} /></View>
          </>
        ) : null}
        {msg ? <Text className="mt-1 text-center text-warn">{t(msg)}</Text> : null}
        {msg && !res && connected && !busy ? <LogLink onPress={shareLog} /> : null}
      </Card>

      {res ? (
        <>
          <SectionTitle>Diagnostic summary</SectionTitle>
          <Card index={1}>
            <SummaryRow icon="barcode-outline" label="VIN" value={res.vin ?? t('Not reported by the car')} mono={!!res.vin} />
            <SummaryRow icon="hardware-chip-outline" label="Modules found" value={`${mods.length}${mods.length ? ' · ' + mods.map(m => m.ecu).join(', ') : ''}`} />
            <SummaryRow icon="git-network-outline" label="Protocol" value={res.protocol || '?'} />
          </Card>

          <Card index={2} className="mt-3 flex-row items-center">
            <View style={{ backgroundColor: (mil ? C.warn : C.ok) + '22', shadowColor: mil ? C.warn : C.ok, shadowOpacity: 0.8, shadowRadius: 14 }}
              className="mr-3 h-12 w-12 items-center justify-center rounded-2xl">
              <Ionicons name={mil ? 'warning' : 'checkmark-circle'} size={26} color={mil ? C.warn : C.ok} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-text">{t('Check engine light:')} {t(mil ? 'ON' : 'OFF')}</Text>
              <Text className="text-xs text-muted">{total ? t(`${total} code(s) found`) : t('No trouble codes.')}</Text>
              {res.memory.length ? <Text className="text-xs text-muted">{t(`${res.memory.length} code(s) in module memory`)}</Text> : null}
            </View>
          </Card>

          {res.mismatch.length || res.unanswered.length || res.refused.length || !res.memoryService ? (
            <Card index={3} className="mt-3">
              {res.mismatch.map(m => (
                <View key={m.ecu} className="mb-1.5 flex-row">
                  <Ionicons name="alert-circle" size={16} color={C.bad} />
                  <Text className="ml-1.5 flex-1 text-xs text-text">
                    <Text className="font-bold">{moduleLabel(m)}: </Text>{t(`${m.reported} code(s) reported, ${m.read} read`)}
                  </Text>
                </View>
              ))}
              {res.refused.length ? (
                <View className="mb-1.5 flex-row">
                  <Ionicons name="alert-circle" size={16} color={C.warn} />
                  <Text className="ml-1.5 flex-1 text-xs text-text">{t('Refused the request:')} {res.refused.join(', ')}</Text>
                </View>
              ) : null}
              {res.unanswered.map(k => (
                <View key={k} className="mb-1.5 flex-row">
                  <Ionicons name="information-circle" size={16} color={C.muted} />
                  <Text className="ml-1.5 flex-1 text-xs text-muted">
                    {t(k === 'pending' ? 'No module answered the pending codes request.' : 'No module answered the permanent codes request (older cars do not support it).')}
                  </Text>
                </View>
              ))}
              {!res.memoryService ? (
                <View className="mb-1.5 flex-row">
                  <Ionicons name="information-circle" size={16} color={C.muted} />
                  <Text className="ml-1.5 flex-1 text-xs text-muted">{t("This car's protocol has no standard way to read the modules' own memory (old ISO 9141 or J1850 cars).")}</Text>
                </View>
              ) : null}
              {res.mismatch.length ? <LogLink onPress={shareLog} /> : null}
            </Card>
          ) : null}

          <SectionTitle>Modules</SectionTitle>
          <T className="mb-2 px-1 text-[11px] text-muted">Tap a module to see its codes. Active: the fault is present now. History: it happened before and is not present now.</T>
          {mods.map((m, i) => <EcuBox key={m.ecu} mod={m} entries={entriesOf(m.ecu)} index={i} car={car} />)}
          {moduleScanSupported() ? (
            <Card index={n + 1} className="mt-1">
              {busy === 'scan' && scan ? (
                <>
                  <Text className="text-sm font-bold text-text">{t('Scanning every module address…')}</Text>
                  <View className="mt-2 h-2 overflow-hidden rounded-full bg-panel2">
                    <View style={{ width: `${Math.round(scan.done * 100 / scan.total)}%`, backgroundColor: C.accent }} className="h-2 rounded-full" />
                  </View>
                  <Text className="mt-1.5 text-xs text-muted">{t(`${scan.done} of ${scan.total} addresses · ${scan.found} module(s) found`)}</Text>
                </>
              ) : (
                <>
                  <T className="mb-2 text-xs text-muted">Only the engine and the gearbox answer the generic OBD-II request. A module scan asks every module address once (about a minute) and remembers what it finds for this car.</T>
                  {scannedModules() ? <Text className="mb-2 text-[11px] text-muted">{t('Last scan:')} {new Date(scannedModules()!.at).toLocaleString()}</Text> : null}
                  <Button title={scannedModules() ? 'Scan all modules again' : 'Scan all modules'} disabled={!!busy} onPress={scanAll} />
                </>
              )}
            </Card>
          ) : null}

          {res.readiness ? (
            <>
              <SectionTitle>Readiness</SectionTitle>
              <Card index={n + 1}>
                <View className="flex-row flex-wrap">
                  {res.readiness.monitors.filter((m: any) => m.supported).map((m: any) => (
                    <View key={m.name} className="w-1/2 flex-row items-center py-1.5">
                      <Ionicons name={m.complete ? 'checkmark-circle' : 'time'} size={16} color={m.complete ? C.ok : C.warn} />
                      <Text numberOfLines={1} className="ml-1.5 flex-1 text-xs text-text">{t(m.name)}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </>
          ) : null}

          {total || res.memory.length ? <Button kind="danger" title={busy === 'clear' ? 'Clearing…' : 'Clear codes'} className="mt-5" disabled={!!busy} onPress={() => setConfirm(true)} /> : null}
          {!busy ? <LogLink onPress={shareLog} /> : null}
        </>
      ) : connected && !busy ? <Empty text="Press the button to read the trouble codes." /> : null}

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Clear codes">
        <T className="mb-4 text-muted">{'Clear all trouble codes?\n\nThis turns off the check-engine light, erases freeze frame data and resets the emissions readiness monitors. Do it with the engine off and ignition on.'}</T>
        <Button kind="danger" title="Clear codes" onPress={clear} />
        <Button title="Cancel" className="mt-2" onPress={() => setConfirm(false)} />
      </Sheet>
    </Screen>
  );
}
