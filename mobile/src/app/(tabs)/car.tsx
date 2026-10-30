// Ownership: plate, insurance and the annual visite technique, each with a ring counting down to the due date.
import type { ReactNode } from 'react';
import { Linking, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Ring } from '../../components/Ring';
import { Screen } from '../../components/Screen';
import { Button, Card, Pill, PressableScale, T } from '../../components/ui';
import { dueStatus, fuelLabel, useVehicle, vehicleName, type Due } from '../../lib/garage';
import { router } from 'expo-router';
import { VehicleSwitcher } from '../../components/VehicleSwitcher';
import { fmtDate, t, useLang } from '../../lib/i18n';
import { C, KIND_COLOR } from '../../lib/theme';

const fmtD = (d: string) => (d ? fmtDate(new Date(d + 'T12:00:00').getTime()) : '');
const Row = ({ k, v }: { k: string; v: ReactNode }) => (
  <View className="flex-row justify-between border-b border-line/60 py-2.5">
    <T className="text-sm text-muted">{k}</T>
    {typeof v === 'string' || v == null ? <Text className="ml-4 flex-shrink text-right text-sm font-semibold text-text">{v || t('not set')}</Text> : v}
  </View>
);

function DueRing({ due, period }: { due: Due; period: number }) {
  const days = due.days ?? 0;
  return <Ring frac={due.days == null ? 0 : days / period} color={KIND_COLOR[due.kind]} label={due.days == null ? '—' : String(Math.max(0, days))} sub={t('days left')} />;
}

export default function Car() {
  useLang();
  const o = useVehicle();
  const ins = dueStatus(o.insExpiry, 30), vt = dueStatus(o.vtNext, 45);
  const tel = o.insPhone.replace(/\s/g, '');
  const edit = () => router.push(`/car-edit/${o.id}`);

  return (
    <Screen title="Ownership">
      <VehicleSwitcher />
      {/* keyed by vehicle, so switching cars replays the entrance and the countdown rings */}
      <View key={o.id}>
      <Card className="items-center overflow-hidden">
        <LinearGradient colors={[C.accent + '25', 'transparent']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 120 }} />
        {o.plate ? (
          <View className="flex-row items-stretch overflow-hidden rounded-xl border-2 border-[#111] bg-white">
            <View className="items-center justify-center bg-[#c1272d] px-2"><Text className="text-[10px] font-extrabold text-white">MA</Text></View>
            <Text style={{ fontFamily: 'monospace', letterSpacing: 2 }} className="px-4 py-2 text-2xl font-extrabold text-[#111]">{o.plate}</Text>
          </View>
        ) : (
          <PressableScale onPress={edit} className="rounded-xl border-2 border-dashed border-muted px-5 py-2.5">
            <T className="text-base font-bold text-muted">+ Add the plate number</T>
          </PressableScale>
        )}
        <Text className="mt-3 text-lg font-bold text-text">{vehicleName(o)}{o.year ? ' · ' + o.year : ''}</Text>
        <View className="mt-2 flex-row flex-wrap justify-center gap-1.5">
          {[[o.engine, t(fuelLabel(o.fuel))].filter(Boolean).join(' '), o.gearbox, o.note].filter(Boolean).map(x => (
            <View key={x} className="rounded-full border border-line bg-panel2 px-2.5 py-1"><Text className="text-xs font-semibold text-text">{t(x)}</Text></View>
          ))}
        </View>
        <Text className="mt-2 text-xs text-muted">VIN {o.vin || t('not set')}</Text>
      </Card>

      <Card index={1} className="mt-3">
        <View className="flex-row items-center">
          <View className="flex-1">
            <View className="mb-1 flex-row items-center"><Ionicons name="shield-checkmark" size={18} color={C.accent} /><T className="ml-2 text-lg font-bold">Insurance</T></View>
            <Pill kind={ins.kind} text={ins.text} />
          </View>
          <DueRing due={ins} period={365} />
        </View>
        <View className="mt-2">
          <Row k="Company" v={o.insCompany} />
          <Row k="Policy number" v={o.policy} />
          <Row k="Valid from" v={fmtD(o.insStart)} />
          <Row k="Expiry date" v={fmtD(o.insExpiry)} />
        </View>
        {o.insPhone ? <Button kind="primary" icon="📞" title="Call roadside assistance" className="mt-3" onPress={() => Linking.openURL('tel:' + tel)} /> : null}
      </Card>

      <Card index={2} className="mt-3">
        <View className="flex-row items-center">
          <View className="flex-1">
            <View className="mb-1 flex-row items-center"><Ionicons name="clipboard" size={18} color={C.accent} /><T className="ml-2 text-lg font-bold">Visite technique annuelle</T></View>
            <Pill kind={vt.kind} text={vt.text} />
          </View>
          <DueRing due={vt} period={365} />
        </View>
        <View className="mt-2">
          <Row k="Last inspection" v={fmtD(o.vtLast)} />
          <Row k="Result" v={<Pill kind={o.vtResult === 'Favorable' ? 'ok' : o.vtResult === 'Contre-visite' ? 'warn' : 'bad'} text={o.vtResult} />} />
          <Row k="Next inspection due" v={fmtD(o.vtNext)} />
          <Row k="Inspection centre" v={o.vtCenter} />
        </View>
      </Card>

      <Button title="Edit details" icon="✎" className="mt-4" onPress={edit} />
      </View>

    </Screen>
  );
}
