import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { PressableScale, T } from './ui';

export function BackHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 8 }} className="flex-row items-center px-4 pb-3">
      <PressableScale onPress={onBack} className="mr-3 h-10 w-10 items-center justify-center rounded-full border border-line bg-panel">
        <Ionicons name="chevron-back" size={20} color={C.text} />
      </PressableScale>
      <T className="flex-1 text-lg font-bold" numberOfLines={1}>{title}</T>
      {right}
    </View>
  );
}
