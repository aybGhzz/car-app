// Add or edit a car: identity, mileage, fuel price, insurance and visite technique. Maintenance and trips open their tabs.
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BackHeader } from '../../components/BackHeader';
import { Field } from '../../components/Field';
import { Select } from '../../components/Select';
import { CATALOG, GEARBOXES, enginesFor, findModel, yearsFor } from '../../lib/catalog';
import { Screen } from '../../components/Screen';
import { Sheet } from '../../components/Sheet';
import { Button, PressableScale, T } from '../../components/ui';
import { addVehicle, BLANK_VEHICLE, deleteVehicle, FUELS, odometer, saveVehicle, selectVehicle, setOdometer, useFuelPrice, useServices,
  useVehicles, vehicleName, type Vehicle } from '../../lib/garage';
import { t, useLang } from '../../lib/i18n';
import { kv } from '../../lib/store';
import { C } from '../../lib/theme';

function Section({ title, icon, index, children }: { title: string; icon: any; index: number; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 70).springify().damping(16)}>
      <View className="mb-3 rounded-3xl border border-line bg-panel p-4">
        <View className="mb-3 flex-row items-center"><Ionicons name={icon} size={18} color={C.accent} /><T className="ml-2 text-base font-bold">{title}</T></View>
        {children}
      </View>
    </Animated.View>
  );
}

function Chips<K extends string>({ value, options, onChange }: { value: K; options: [K, string][]; onChange: (k: K) => void }) {
  return (
    <View className="mb-3 flex-row flex-wrap gap-2">
      {options.map(([k, l]) => (
        <PressableScale key={k} onPress={() => onChange(k)} className={`rounded-full border px-3.5 py-2 ${value === k ? 'border-accent bg-accent/15' : 'border-line bg-panel2'}`}>
          <T className="text-sm font-semibold">{l}</T>
        </PressableScale>
      ))}
    </View>
  );
}

const fuelLabelOf = (k: string) => FUELS.find(x => x[0] === k)?.[1] ?? k;
const isDate = (s: string) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);

export default function CarEdit() {
  useLang();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const list = useVehicles();
  const existing = list.find(v => v.id === id);
  const [f, setF] = useState<Omit<Vehicle, 'id'>>(existing ?? BLANK_VEHICLE);
  const [odo, setOdo] = useState(isNew ? '' : String(Math.round(odometer(id).value)));
  const price = useFuelPrice(isNew ? '' : id);
  const [fuelPrice, setFuelPrice] = useState(isNew ? '' : String(price));
  const services = useServices(isNew ? '' : id);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  function save() {
    if (!f.make.trim() && !f.model.trim()) return setErr('Enter at least the make or the model.');
    if (f.vin && f.vin.replace(/\s/g, '').length !== 17) return setErr('A VIN has 17 characters.');
    if (![f.insStart, f.insExpiry, f.vtLast, f.vtNext].every(isDate)) return setErr('Dates must look like 2026-12-31.');
    const data = { ...f };
    // A new inspection date pre-fills the next one a year later, unless that was changed too.
    if (data.vtLast && data.vtLast !== existing?.vtLast && data.vtNext === (existing?.vtNext ?? '')) {
      const d = new Date(data.vtLast); d.setFullYear(d.getFullYear() + 1); data.vtNext = d.toISOString().slice(0, 10);
    }
    const km = +odo.replace(/\s/g, '') || 0;
    const vid = isNew ? addVehicle(data, km) : (saveVehicle({ ...data, id }), id);
    if (!isNew && km && Math.abs(km - odometer(id).value) >= 1) setOdometer(km, 'manual', id);
    if (fuelPrice) kv.set('fuelPrice.' + vid, +fuelPrice.replace(',', '.') || 0);
    router.back();
  }

  const goTab = (tab: '/service' | '/trips') => { selectVehicle(id); router.dismissTo(tab); };
  const title = isNew ? t('Add a car') : vehicleName(f) || t('Edit car');

  return (
    <Screen title={title} header={<BackHeader title={title} onBack={() => router.back()} />}>
      <Section title="Vehicle" icon="car-sport" index={0}>
        {/* cascading lists: each choice narrows the next one; "Other" allows typing a car that is not listed */}
        <Select label="Make" value={f.make} placeholder="Choose a make"
          options={CATALOG.map(m => ({ value: m.name, label: m.name, sub: `${m.models.length} ${t('models')}` }))}
          onChange={make => setF({ ...f, make, ...(make !== f.make ? { model: '', year: '', engine: '' } : {}) })} />
        <Select label="Model" value={f.model} placeholder="Choose a model" disabled={!f.make}
          options={(CATALOG.find(m => m.name === f.make)?.models ?? []).map(m => ({ value: m.name, label: m.name, sub: `${m.years[0]}–${m.years[1]}` }))}
          onChange={model => setF({ ...f, model, ...(model !== f.model ? { year: '', engine: '' } : {}) })} />
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Select label="Year" value={f.year} placeholder="Year" disabled={!f.model}
              options={yearsFor(f.make, f.model).map(y => ({ value: y, label: y }))} onChange={year => setF({ ...f, year })} />
          </View>
          <View className="flex-1"><Field label="Plate number" value={f.plate} onChange={set('plate')} placeholder="12345-A-6" /></View>
        </View>
        <Select label="Engine" value={f.engine} placeholder="Choose an engine" disabled={!f.model}
          options={enginesFor(f.make, f.model, f.year).map(en => ({ value: en.name, label: en.name, sub: `${t(fuelLabelOf(en.fuel))} · ${en.kw} kW (${Math.round(en.kw * 1.36)} ${t('hp')})`, en }))}
          onChange={(engine, o: any) => setF({ ...f, engine, ...(o?.en ? { fuel: o.en.fuel, gearbox: o.en.gearbox ?? f.gearbox } : {}) })}
          hint={findModel(f.make, f.model) ? 'Choosing an engine also sets the fuel.' : undefined} />
        <T className="mb-1 text-xs text-muted">Fuel</T>
        <Chips value={f.fuel} options={FUELS} onChange={fuel => setF({ ...f, fuel })} />
        <Select label="Gearbox" value={f.gearbox} placeholder="Choose a gearbox"
          options={[...new Set([...(findModel(f.make, f.model)?.engines.map(en => en.gearbox).filter(Boolean) as string[] ?? []), ...GEARBOXES])].map(g => ({ value: g, label: t(g) }))}
          onChange={set('gearbox')} />
        <Field label="VIN" value={f.vin} onChange={v => set('vin')(v.toUpperCase())} placeholder="17 characters" />
        <Field label="Note" value={f.note} onChange={set('note')}  />
      </Section>

      <Section title="Mileage and fuel" icon="speedometer" index={1}>
        <View className="flex-row gap-2"><View className="flex-1"><Field label="Odometer" value={odo} keyboard="numeric" onChange={setOdo} placeholder="km" /></View>
          <View className="flex-1"><Field label="Fuel price" value={fuelPrice} keyboard="decimal-pad" onChange={setFuelPrice} placeholder="MAD/L" /></View></View>
      </Section>

      <Section title="Insurance" icon="shield-checkmark" index={2}>
        <Field label="Insurance company" value={f.insCompany} onChange={set('insCompany')} />
        <Field label="Policy number" value={f.policy} onChange={set('policy')} />
        <Field label="Assistance phone" value={f.insPhone} keyboard="phone-pad" onChange={set('insPhone')} placeholder="+212 …" />
        <View className="flex-row gap-2"><View className="flex-1"><Field label="Insurance start" value={f.insStart} onChange={set('insStart')} placeholder="YYYY-MM-DD" /></View>
          <View className="flex-1"><Field label="Insurance expiry" value={f.insExpiry} onChange={set('insExpiry')} placeholder="YYYY-MM-DD" /></View></View>
      </Section>

      <Section title="Visite technique annuelle" icon="clipboard" index={3}>
        <View className="flex-row gap-2"><View className="flex-1"><Field label="Last visite technique" value={f.vtLast} onChange={set('vtLast')} placeholder="YYYY-MM-DD" /></View>
          <View className="flex-1"><Field label="Next visite technique" value={f.vtNext} onChange={set('vtNext')} placeholder="YYYY-MM-DD" /></View></View>
        <T className="mb-1 text-xs text-muted">Result</T>
        <Chips value={f.vtResult} options={[['Favorable', 'Favorable'], ['Contre-visite', 'Contre-visite'], ['Défavorable', 'Défavorable']]} onChange={set('vtResult')} />
        <Field label="Inspection centre" value={f.vtCenter} onChange={set('vtCenter')} />
      </Section>

      {!isNew ? (
        <Section title="Maintenance and trips" icon="construct" index={4}>
          <PressableScale onPress={() => goTab('/service')} className="mb-2 flex-row items-center justify-between rounded-2xl border border-line bg-panel2 px-4 py-3">
            <Text className="font-semibold text-text">{t('Service')} · {services.length}</Text><Ionicons name="chevron-forward" size={18} color={C.muted} />
          </PressableScale>
          <PressableScale onPress={() => goTab('/trips')} className="flex-row items-center justify-between rounded-2xl border border-line bg-panel2 px-4 py-3">
            <T className="font-semibold">Trips</T><Ionicons name="chevron-forward" size={18} color={C.muted} />
          </PressableScale>
        </Section>
      ) : <T className="mb-3 px-1 text-xs text-muted">A starter maintenance list is created from the odometer. Adjust it on the Service tab.</T>}

      {err ? <T className="mb-2 text-center text-warn">{err}</T> : null}
      <Button kind="primary" title={isNew ? 'Add the car' : 'Save'} onPress={save} />
      {!isNew && list.length > 1 ? <Button kind="danger" title="Delete this car" className="mt-2" onPress={() => setConfirm(true)} /> : null}

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Delete this car">
        <T className="mb-4 text-muted">This removes the car with its maintenance list, odometer and saved trips. It cannot be undone.</T>
        <Button kind="danger" title="Delete" onPress={() => { setConfirm(false); deleteVehicle(id); router.back(); }} />
        <Button title="Cancel" className="mt-2" onPress={() => setConfirm(false)} />
      </Sheet>
    </Screen>
  );
}
