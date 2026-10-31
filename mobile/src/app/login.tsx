// Sign in / create an account. Until the backend exists the account lives on this device only (see lib/auth.ts).
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DotsLoader } from '../components/Loaders';
import { Logo } from '../components/Logo';
import { Button, PressableScale, T } from '../components/ui';
import { continueAsGuest, signIn } from '../lib/auth';
import { t, useLang } from '../lib/i18n';
import { C } from '../lib/theme';

function Input({ icon, value, onChange, placeholder, secure, keyboard, label }: { icon: any; value: string; onChange: (v: string) => void; placeholder: string; secure?: boolean; keyboard?: any; label: string }) {
  const [focus, setFocus] = useState(false), [show, setShow] = useState(false);
  return (
    <View className={`mb-3 flex-row items-center rounded-2xl border bg-panel px-4 ${focus ? 'border-accent' : 'border-line'}`}>
      <Ionicons name={icon} size={18} color={focus ? C.accent : C.muted} />
      <TextInput value={value} onChangeText={onChange} placeholder={t(placeholder)} placeholderTextColor={C.muted} accessibilityLabel={t(label)}
        secureTextEntry={secure && !show} keyboardType={keyboard} autoCapitalize="none" autoCorrect={false}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} className="flex-1 px-3 py-3.5 text-base text-text" />
      {secure ? <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.muted} onPress={() => setShow(!show)} accessibilityLabel={t('Show password')} /> : null}
    </View>
  );
}

export default function Login() {
  useLang();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [signup, setSignup] = useState(params.mode === 'signup');
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [info, setInfo] = useState('');

  async function go() {
    setErr(''); setBusy(true);
    const e = await signIn(email, pw, signup ? name : undefined);
    setBusy(false);
    if (e) return setErr(e);
    router.replace('/');
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} className="bg-bg">
      <LinearGradient colors={[C.accent2 + '45', 'transparent']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 320 }} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 36, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }} keyboardShouldPersistTaps="handled">
        {router.canGoBack() ? (
          <PressableScale onPress={() => router.back()} accessibilityLabel={t('Back')} className="mb-2 h-10 w-10 items-center justify-center rounded-full border border-line bg-panel">
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </PressableScale>
        ) : null}
        <Animated.View entering={FadeInDown.springify().damping(14)}>
          <View className="mb-8 mt-4 items-center"><Logo size={76} /></View>
        </Animated.View>
        <Animated.View key={signup ? 's' : 'l'} entering={FadeIn.duration(250)}>
          <Text accessibilityRole="header" className="mb-1 text-2xl font-extrabold text-text">{t(signup ? 'Create your account' : 'Welcome back')}</Text>
          <T className="mb-5 text-sm text-muted">{signup ? 'Keep your cars, trips and alerts with your account.' : 'Sign in to find your cars and trips.'}</T>
          {signup ? <Input icon="person-outline" label="Name" value={name} onChange={setName} placeholder="Your name" /> : null}
          <Input icon="mail-outline" label="Email" value={email} onChange={setEmail} placeholder="Email" keyboard="email-address" />
          <Input icon="lock-closed-outline" label="Password" value={pw} onChange={setPw} placeholder="Password" secure />
          {!signup ? <Text onPress={() => setInfo('Password reset will arrive with the online accounts.')} className="mb-4 self-end text-sm font-semibold text-accent">{t('Forgot password?')}</Text> : <View className="h-2" />}
          {err ? <T className="mb-3 text-center text-sm text-bad">{err}</T> : null}
          {info ? <T className="mb-3 text-center text-sm text-muted">{info}</T> : null}
          {busy ? (
            <View style={{ height: 48 }} className="items-center justify-center rounded-2xl bg-panel"><DotsLoader /></View>
          ) : <Button kind="primary" title={signup ? 'Create account' : 'Sign in'} onPress={go} />}
          <View className="my-5 flex-row items-center"><View className="h-px flex-1 bg-line" /><T className="mx-3 text-xs text-muted">or</T><View className="h-px flex-1 bg-line" /></View>
          <Button title={signup ? 'I already have an account' : 'Create an account'} onPress={() => { setSignup(!signup); setErr(''); setInfo(''); }} />
          <Text onPress={() => { continueAsGuest(); router.replace('/'); }} className="mt-5 text-center text-sm font-semibold text-muted">{t('Continue without an account')}</Text>
          <T className="mt-6 text-center text-[11px] text-muted">For now your account is kept on this phone only. Online accounts come with the backend.</T>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
