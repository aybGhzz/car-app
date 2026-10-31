// Editor for one signal rule ("when coolant is above 105 °C: turn the gauge red and notify me"), shown in a sheet.
// Used by the dashboard gauge settings and by the Notifications page.
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { deleteRule, saveRule, type SignalRule } from '../lib/alerts';
import { useVehicle, vehicleName } from '../lib/garage';
import { availableKeys, meta } from '../lib/live';
import { t, useLang } from '../lib/i18n';
import { C } from '../lib/theme';
import { Select } from './Select';
import { Sheet } from './Sheet';
import { Button, Segmented, Swatches, T, Toggle } from './ui';

export function RuleEditor({ rule, onClose, fixedPid }: { rule: SignalRule | null; onClose: () => void; fixedPid?: boolean }) {
  useLang();
  const car = useVehicle();
  const [r, setR] = useState<SignalRule | null>(rule);
  const [text, setText] = useState('');
  useEffect(() => { setR(rule); setText(rule ? String(rule.value) : ''); }, [rule]);
  const m = r ? meta(r.pid) : null;
  const done = () => { if (r) saveRule({ ...r, value: +text.replace(',', '.') || 0 }); onClose(); };

  return (
    <Sheet open={!!rule} onClose={onClose} title="Signal alert">
      {r && m ? (
        <>
          {fixedPid ? <Text className="mb-3 text-base font-bold text-text">{t(m.name)}</Text> : (
            <Select label="Signal" value={r.pid} other={false} onChange={pid => setR({ ...r, pid })}
              options={availableKeys().filter(k => k !== 'A6').map(k => ({ value: k, label: t(meta(k).name), sub: meta(k).unit }))} />
          )}
          <T className="mb-1 text-xs text-muted">When the value is</T>
          <View className="mb-3 flex-row items-center gap-2">
            <Segmented className="flex-1" value={r.op} onChange={op => setR({ ...r, op })} options={[['above', 'Above'], ['below', 'Below']]} />
            <TextInput value={text} onChangeText={setText} keyboardType="decimal-pad" accessibilityLabel={t('Threshold')}
              className="w-24 rounded-2xl border border-line bg-panel2 px-3 py-2.5 text-right text-base font-bold text-text" />
            <Text className="w-12 text-sm text-muted">{t(m.unit)}</Text>
          </View>

          <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-line bg-panel2 px-4 py-3">
            <View className="flex-1 pr-3">
              <T className="font-semibold">Send a notification</T>
              <T className="text-xs text-muted">Pop-up and inbox, at most once every 5 minutes.</T>
            </View>
            <Toggle value={r.notify} onChange={notify => setR({ ...r, notify })} />
          </View>

          <View className="mb-1 flex-row items-center justify-between">
            <T className="text-xs text-muted">Gauge colour while it matches</T>
            {r.color ? <Text onPress={() => setR({ ...r, color: undefined })} className="text-xs font-semibold text-accent">{t('No colour change')}</Text> : null}
          </View>
          <View className="mb-3"><Swatches value={r.color} onChange={color => setR({ ...r, color })} /></View>

          <T className="mb-1 text-xs text-muted">Applies to</T>
          <Segmented className="mb-4" value={r.scope === 'all' ? 'all' : 'car'} onChange={v => setR({ ...r, scope: v === 'all' ? 'all' : car.id })}
            options={[['all', 'All cars'], ['car', vehicleName(car) || 'This car']]} />

          <Button kind="primary" title="Save" onPress={done} />
          <Button kind="danger" title="Delete this alert" className="mt-2" onPress={() => { deleteRule(r.id); onClose(); }} />
        </>
      ) : null}
    </Sheet>
  );
}

export const ruleText = (r: SignalRule) => {
  const m = meta(r.pid);
  return `${t(r.op === 'above' ? 'Above' : 'Below')} ${r.value} ${t(m.unit)}`;
};
export const RuleDot = ({ color }: { color?: string }) => (
  <View style={{ backgroundColor: color ?? 'transparent', borderColor: color ?? C.muted, borderWidth: 1.5 }} className="h-3 w-3 rounded-full" />
);
