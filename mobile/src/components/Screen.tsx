import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Header } from './Header';

// Every tab: header, then scrolling content with room for the floating tab bar.
export function Screen({ title, subtitle, children, header }: { title: string; subtitle?: string; children: ReactNode; header?: ReactNode }) {
  return (
    <View className="flex-1 bg-bg">
      {header ?? <Header title={title} subtitle={subtitle} />}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}
