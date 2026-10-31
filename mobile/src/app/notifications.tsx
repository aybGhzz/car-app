// Notifications: the inbox, and the rules that create notifications (signals, papers, maintenance).
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BackHeader } from '../components/BackHeader';
import { RuleDot, RuleEditor, ruleText } from '../components/RuleEditor';
import { Screen } from '../components/Screen';
import { Button, Card, Empty, PressableScale, Segmented, SectionTitle, T, Toggle } from '../components/ui';
import { clearNotifs, markAllRead, markRead, newRuleId, saveRule, setDocRule, useDocRules, useNotifs, useRules, type Notif, type SignalRule } from '../lib/alerts';
import { useVehicles, vehicleName } from '../lib/garage';
import { meta } from '../lib/live';
import { fmtDate, fmtTime, t, useLang } from '../lib/i18n';
import { setSetting, useSettings } from '../lib/settings';
import { C } from '../lib/theme';

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? t('just now') : m < 60 ? `${m} min` : m < 1440 ? fmtTime(ms) : fmtDate(ms);
};

function Item({ n, index }: { n: Notif; index: number }) {
  const color = n.level === 'bad' ? C.bad : n.level === 'warn' ? C.warn : C.accent;
  const icon = n.key.startsWith('sig') ? 'pulse' : n.key.startsWith('svc') ? 'construct' : n.key.startsWith('insurance') ? 'shield-checkmark' : 'clipboard';
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 50).springify().damping(16)}>
      <PressableScale onPress={() => { markRead(n.id); if (n.route) router.push(n.route as any); }}
        className={`mb-2 flex-row items-center rounded-3xl border p-3.5 ${n.read ? 'border-line bg-panel' : 'border-accent/40 bg-panel2'}`}>
        <View style={{ backgroundColor: color + '22' }} className="mr-3 h-11 w-11 items-center justify-center rounded-2xl">
          <Ionicons name={icon as any} size={20} color={color} />
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} className="font-bold text-text">{t(n.title)}</Text>
          <Text numberOfLines={1} className="text-xs text-muted">{t(n.body)}</Text>
        </View>
        <View className="ml-2 items-end">
          <Text className="text-[11px] text-muted">{ago(n.at)}</Text>
          {!n.read ? <View className="mt-1.5 h-2 w-2 rounded-full bg-accent" /> : null}
        </View>
      </PressableScale>
    </Animated.View>
  );
}

function Days({ value, onChange, unit }: { value: number; onChange: (n: number) => void; unit: string }) {
  return (
    <View className="flex-row items-center">
      <TextInput defaultValue={String(value)} keyboardType="number-pad" accessibilityLabel={t(unit)}
        onEndEditing={e => onChange(+e.nativeEvent.text || 0)} onBlur={(e: any) => e?.nativeEvent?.text != null && onChange(+e.nativeEvent.text || 0)}
        className="w-16 rounded-xl border border-line bg-panel2 px-2 py-1.5 text-right font-bold text-text" />
      <T className="ml-1.5 w-10 text-xs text-muted">{unit}</T>
    </View>
  );
}

function DocRow({ icon, title, sub, on, onToggle, children }: { icon: any; title: string; sub: string; on: boolean; onToggle: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center border-b border-line/60 py-3">
      <Ionicons name={icon} size={18} color={C.accent} />
      <View className="ml-3 flex-1 pr-2"><T className="font-semibold">{title}</T><T className="text-xs text-muted">{sub}</T></View>
      <View className={on ? '' : 'opacity-40'}>{children}</View>
      <View className="ml-3"><Toggle value={on} onChange={onToggle} /></View>
    </View>
  );
}

export default function Notifications() {
  useLang();
  const [tab, setTab] = useState<'inbox' | 'rules'>('inbox');
  const list = useNotifs();
  const rules = useRules();
  const docs = useDocRules();
  const cfg = useSettings();
  const vehicles = useVehicles();
  const [edit, setEdit] = useState<SignalRule | null>(null);
  const unread = list.filter(n => !n.read).length;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen title="Notifications" header={<BackHeader title="Notifications" onBack={back} />}>
      <Segmented value={tab} onChange={setTab} options={[['inbox', unread ? `${t('Inbox')} (${unread})` : 'Inbox'], ['rules', 'Rules']]} className="mb-3" />

      {tab === 'inbox' ? (
        <>
          {list.length ? (
            <View className="mb-2 flex-row justify-end gap-4 px-1">
              {unread ? <Text onPress={markAllRead} className="text-sm font-semibold text-accent">{t('Mark all as read')}</Text> : null}
              <Text onPress={clearNotifs} className="text-sm font-semibold text-muted">{t('Clear')}</Text>
            </View>
          ) : null}
          {list.length ? list.map((n, i) => <Item key={n.id} n={n} index={i} />) : <Empty text="No notifications. Alerts about your cars will show up here." />}
        </>
      ) : (
        <>
          <Card className="flex-row items-center">
            <View className="flex-1 pr-3"><T className="font-bold">Notifications</T><T className="text-xs text-muted">Turn every alert on or off.</T></View>
            <Toggle value={cfg.notifications} onChange={v => setSetting('notifications', v)} />
          </Card>

          <SectionTitle>Papers and maintenance</SectionTitle>
          <Card className="py-1">
            <DocRow icon="shield-checkmark" title="Insurance expiry" sub="Alert when fewer days are left than" on={docs.insurance.enabled} onToggle={enabled => setDocRule('insurance', { ...docs.insurance, enabled })}>
              <Days value={docs.insurance.days} unit="days" onChange={days => setDocRule('insurance', { ...docs.insurance, days })} />
            </DocRow>
            <DocRow icon="clipboard" title="Visite technique" sub="Alert when fewer days are left than" on={docs.vt.enabled} onToggle={enabled => setDocRule('vt', { ...docs.vt, enabled })}>
              <Days value={docs.vt.days} unit="days" onChange={days => setDocRule('vt', { ...docs.vt, days })} />
            </DocRow>
            <View className="-mb-px">
              <DocRow icon="construct" title="Service due" sub="Alert when the next service is closer than" on={docs.service.enabled} onToggle={enabled => setDocRule('service', { ...docs.service, enabled })}>
                <Days value={docs.service.km} unit="km" onChange={km => setDocRule('service', { ...docs.service, km })} />
              </DocRow>
            </View>
          </Card>
          <T className="mt-2 px-1 text-xs text-muted">These apply to every car.</T>

          <SectionTitle>Live signals</SectionTitle>
          {rules.map(r => (
            <PressableScale key={r.id} onPress={() => setEdit(r)} className={`mb-2 flex-row items-center rounded-3xl border border-line bg-panel p-3.5 ${r.enabled ? '' : 'opacity-50'}`}>
              <RuleDot color={r.color} />
              <View className="ml-3 flex-1">
                <T className="font-semibold">{meta(r.pid).name}</T>
                <Text className="text-xs text-muted">
                  {ruleText(r)} · {r.notify ? t('notify') : t('colour only')} · {r.scope === 'all' ? t('All cars') : vehicleName(vehicles.find(v => v.id === r.scope) ?? { make: '', model: '' })}
                </Text>
              </View>
              <Toggle value={r.enabled} onChange={enabled => saveRule({ ...r, enabled })} />
            </PressableScale>
          ))}
          <Button title="+ Add a signal alert" onPress={() => setEdit({ id: newRuleId(), pid: '0C', op: 'above', value: 5500, color: C.bad, notify: true, enabled: true, scope: 'all' })} />
          <T className="mt-2 px-1 text-xs text-muted">Signal alerts also colour the dashboard gauges. Change them here or from a gauge.</T>
        </>
      )}
      <RuleEditor rule={edit} onClose={() => setEdit(null)} />
    </Screen>
  );
}
