// Bottom sheet that springs up, follows the finger, and closes when flicked or dragged down.
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from './ui';

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(open);
  const y = useSharedValue(height);

  useEffect(() => {
    if (open) {
      setMounted(true);
      y.value = height;
      y.value = withSpring(0, { damping: 20, stiffness: 180 });
    } else if (mounted) {
      y.value = withTiming(height, { duration: 220 }, () => scheduleOnRN(setMounted, false));
    }
  }, [open]);

  const pan = usePanGesture({
    activeOffsetY: 8,
    onUpdate: e => { 'worklet'; y.value = Math.max(0, e.translationY); },
    onDeactivate: e => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 800) {
        y.value = withTiming(height, { duration: 200 }, () => scheduleOnRN(onClose));
      } else {
        y.value = withSpring(0, { damping: 20, stiffness: 180 });
      }
    },
  });

  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdrop = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - y.value / 500) * 0.6 }));

  return (
    <Modal transparent visible={mounted} onRequestClose={onClose} animationType="none" statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: '#000' }, backdrop]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: height * 0.88 }, panel]}>
          <View className="rounded-t-[28px] border border-line bg-panel" style={{ paddingBottom: insets.bottom + 12 }}>
            <GestureDetector gesture={pan}>
              <View className="items-center pb-2 pt-3">
                <View className="h-1.5 w-11 rounded-full bg-line" />
                {title ? <T className="mt-3 text-lg font-bold">{title}</T> : null}
              </View>
            </GestureDetector>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
