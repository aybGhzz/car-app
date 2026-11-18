import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Header } from './Header';
import { LANDSCAPE_COLUMN, useLandscape } from '../lib/layout';

// Every tab: header, then scrolling content with room for the floating tab bar.
// With the phone sideways, `wide` screens (dashboard, All sensors, trip) use the whole width; the others stay a
// centred column, easier to read than lines stretched across the screen.
export function Screen({ title, subtitle, children, header, wide }: { title: string; subtitle?: string; children: ReactNode; header?: ReactNode; wide?: boolean }) {
  const landscape = useLandscape();
  return (
    <View className="flex-1 bg-bg">
      {header ?? <Header title={title} subtitle={subtitle} />}
      <ScrollView contentContainerStyle={[{ paddingHorizontal: 16, paddingBottom: 120 }, landscape && !wide ? { width: '100%', maxWidth: LANDSCAPE_COLUMN, alignSelf: 'center' } : null]}
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}
