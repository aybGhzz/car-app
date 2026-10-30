import { TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { C } from '../lib/theme';
import { T } from './ui';

export function Field({ label, value, onChange, keyboard, placeholder }: { label: string; value: string; onChange: (v: string) => void; keyboard?: KeyboardTypeOptions; placeholder?: string }) {
  return (
    <View className="mb-3">
      <T className="mb-1 text-xs text-muted">{label}</T>
      <TextInput value={value} onChangeText={onChange} keyboardType={keyboard} placeholder={placeholder} placeholderTextColor={C.muted}
        className="rounded-2xl border border-line bg-panel2 px-4 py-3 text-base text-text" />
    </View>
  );
}
