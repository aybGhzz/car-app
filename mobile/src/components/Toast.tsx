// The pop-up for a new notification: drops in from the top, stays 5 s, tap to open the inbox, swipe or tap × to close.
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dismissToast, markRead, useToast } from '../lib/alerts';
import { t, useLang } from '../lib/i18n';
import { C } from '../lib/theme';

export function Toast() {
  useLang();
  const n = useToast();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!n) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    const id = setTimeout(dismissToast, 5000);
    return () => clearTimeout(id);
  }, [n?.id]);
  if (!n) return null;
  const color = n.level === 'bad' ? C.bad : n.level === 'warn' ? C.warn : C.accent;
  return (
    <Animated.View key={n.id} entering={SlideInUp.springify().damping(16)} exiting={SlideOutUp.duration(200)}
      style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, zIndex: 50 }}>
      <Pressable accessibilityRole="alert" onPress={() => { markRead(n.id); dismissToast(); router.push('/notifications'); }}
        style={{ shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 14, borderColor: color + '88' }}
        className="flex-row items-center rounded-2xl border bg-panel2 p-3">
        <View style={{ backgroundColor: color + '26' }} className="mr-3 h-10 w-10 items-center justify-center rounded-xl">
          <Ionicons name={n.level === 'info' ? 'notifications' : 'warning'} size={20} color={color} />
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} className="text-sm font-bold text-text">{t(n.title)}</Text>
          <Text numberOfLines={1} className="text-xs text-muted">{t(n.body)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Close')} onPress={dismissToast} hitSlop={10} className="ml-2 p-1">
          <Ionicons name="close" size={18} color={C.muted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}
