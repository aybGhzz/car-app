// Drop-down field: tap to open a list in a bottom sheet (with a search box for long lists). "Other" lets the user
// type a value that is not in the list.
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { t, useLang } from '../lib/i18n';
import { C } from '../lib/theme';
import { Sheet } from './Sheet';
import { PressableScale, T } from './ui';

export type Option = { value: string; label: string; sub?: string };

export function Select({ label, value, options, onChange, placeholder = 'Choose…', disabled, other = true, hint }: {
  label: string; value: string; options: Option[]; onChange: (v: string, o?: Option) => void;
  placeholder?: string; disabled?: boolean; other?: boolean; hint?: string;
}) {
  useLang();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [typing, setTyping] = useState(false);
  const known = options.find(o => o.value === value);
  const custom = !!value && !known;
  const list = q ? options.filter(o => (o.label + ' ' + (o.sub ?? '')).toLowerCase().includes(q.toLowerCase())) : options;

  if (typing) {
    return (
      <View className="mb-3">
        <T className="mb-1 text-xs text-muted">{label}</T>
        <View className="flex-row items-center rounded-2xl border border-accent bg-panel2 pr-2">
          <TextInput autoFocus value={value} onChangeText={v => onChange(v)} placeholder={t(placeholder)} placeholderTextColor={C.muted}
            className="flex-1 px-4 py-3 text-base text-text" />
          {options.length ? (
            <PressableScale onPress={() => setTyping(false)} accessibilityLabel={t('Back to the list')} className="h-8 w-8 items-center justify-center rounded-full bg-panel">
              <Ionicons name="list" size={16} color={C.accent} />
            </PressableScale>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View className="mb-3">
      <T className="mb-1 text-xs text-muted">{label}</T>
      <PressableScale disabled={disabled} accessibilityLabel={t(label)} onPress={() => { setQ(''); options.length ? setOpen(true) : setTyping(true); }}
        className={`flex-row items-center rounded-2xl border border-line bg-panel2 px-4 py-3 ${disabled ? 'opacity-40' : ''}`}>
        <View className="flex-1">
          <Text numberOfLines={1} className={`text-base ${value ? 'text-text' : 'text-muted'}`}>{value ? (known?.label ?? value) : t(placeholder)}</Text>
          {known?.sub ? <Text numberOfLines={1} className="text-[11px] text-muted">{known.sub}</Text> : custom ? <T className="text-[11px] text-muted">Typed in</T> : null}
        </View>
        <Ionicons name="chevron-down" size={18} color={C.muted} />
      </PressableScale>
      {hint ? <T className="mt-1 px-1 text-[11px] text-muted">{hint}</T> : null}
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        {options.length > 8 ? (
          <View className="mb-2 flex-row items-center rounded-2xl border border-line bg-panel2 px-3">
            <Ionicons name="search" size={16} color={C.muted} />
            <TextInput value={q} onChangeText={setQ} placeholder={t('Search')} placeholderTextColor={C.muted} className="flex-1 px-2 py-2.5 text-base text-text" />
          </View>
        ) : null}
        {list.map(o => (
          <PressableScale key={o.value} onPress={() => { onChange(o.value, o); setOpen(false); }}
            className={`mb-1.5 flex-row items-center rounded-2xl border px-4 py-3 ${o.value === value ? 'border-accent bg-accent/10' : 'border-line bg-panel2'}`}>
            <View className="flex-1">
              <Text className="text-base font-semibold text-text">{o.label}</Text>
              {o.sub ? <Text className="text-xs text-muted">{o.sub}</Text> : null}
            </View>
            {o.value === value ? <Ionicons name="checkmark" size={18} color={C.accent} /> : null}
          </PressableScale>
        ))}
        {other ? (
          <PressableScale onPress={() => { setOpen(false); setTyping(true); }} className="mb-1.5 flex-row items-center rounded-2xl border border-dashed border-line px-4 py-3">
            <Ionicons name="create-outline" size={18} color={C.accent} />
            <T className="ml-2 font-semibold text-accent">Other: type it in</T>
          </PressableScale>
        ) : null}
      </Sheet>
    </View>
  );
}
