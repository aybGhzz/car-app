// Accounts. With Supabase configured (see lib/supabase.ts) sign-in uses Supabase Auth (email + password) and the
// session is kept on the phone; signing in starts the cloud sync (lib/sync.ts). Without it, the profile stays on this
// device only, as before. "Continue without an account" always works offline.
import type { User as AuthUser } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import { kv, useStored } from './store';
import { supabase } from './supabase';

export type User = { name: string; email: string; since: number; guest?: boolean; id?: string; cloud?: boolean };

export const useUser = () => useStored<User | null>('user', null);
export const currentUser = () => kv.get<User | null>('user', null);

const nameFromEmail = (email: string) => {
  const n = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return n ? n[0].toUpperCase() + n.slice(1) : 'Driver';
};
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

const fromAuth = (u: AuthUser): User => ({
  id: u.id, cloud: true, email: u.email ?? '',
  name: (u.user_metadata?.name as string | undefined)?.trim() || nameFromEmail(u.email ?? ''),
  since: Date.parse(u.created_at) || Date.now(),
});

// Supabase's English messages, made a little friendlier. Returned strings go through t() on the screen.
function authError(m: string): string {
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first: open the link we sent you.';
  if (/already registered|already exists/i.test(m)) return 'An account already exists with this email. Sign in instead.';
  if (/signups? not allowed|signups? (are )?disabled/i.test(m)) return 'Vindici is invite-only for now. Ask for an invitation first.';
  if (/network|fetch/i.test(m)) return 'No connection to the server. Check your internet, or continue without an account.';
  return m;
}

// Returns an error message, or null when signed in. `info` is set when the user has to confirm their email first.
export async function signIn(email: string, password: string, name?: string): Promise<string | null> {
  if (!validEmail(email)) return 'Enter a valid email address.';
  if (password.length < 6) return 'The password needs at least 6 characters.';
  const key = email.trim().toLowerCase();

  if (supabase) {
    const res = name != null
      ? await supabase.auth.signUp({ email: key, password, options: { data: { name: name.trim() || nameFromEmail(key) } } })
      : await supabase.auth.signInWithPassword({ email: key, password });
    if (res.error) return authError(res.error.message);
    // signing up again with an existing email: Supabase answers with a user that has no identity and sends nothing
    if (name != null && res.data.user && !res.data.user.identities?.length) return 'An account already exists with this email. Sign in instead.';
    if (!res.data.session || !res.data.user) return 'Account created. Open the link in the email we sent you, then sign in.';
    kv.set('user', fromAuth(res.data.user));
    return null;
  }

  // local-only accounts (no Supabase configured)
  await new Promise(r => setTimeout(r, 600));
  const known = kv.get<Record<string, string>>('accounts', {});
  const display = name?.trim() || known[key] || nameFromEmail(key);
  kv.set('accounts', { ...known, [key]: display });
  kv.set('user', { name: display, email: key, since: Date.now() } satisfies User);
  return null;
}

// Sign in with Google (Android): Google's account picker returns an ID token that Supabase checks. While sign-ups
// are closed in Supabase (invite-only), only people already invited or signed up get in.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
export const googleEnabled = !!supabase && !!GOOGLE_WEB_CLIENT_ID && Platform.OS === 'android';
export async function signInWithGoogle(): Promise<string | null> {
  if (!supabase || !googleEnabled) return 'Google sign-in is not set up yet.';
  try {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const r = await GoogleSignin.signIn();
    if (!isSuccessResponse(r)) return ''; // cancelled: no message
    if (!r.data.idToken) return 'Google did not return a sign-in token.';
    const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: r.data.idToken });
    if (error) { await GoogleSignin.signOut().catch(() => {}); return authError(error.message); }
    kv.set('user', fromAuth(data.user));
    return null;
  } catch (e: any) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return '';
    if (isErrorWithCode(e) && e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return 'Google Play services are needed for Google sign-in.';
    return authError(e?.message ?? String(e));
  }
}

export async function resetPassword(email: string): Promise<string> {
  if (!supabase) return 'Password reset needs the online accounts.';
  if (!validEmail(email)) return 'Enter your email above first.';
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
  return error ? authError(error.message) : 'If an account exists for this email, a reset link is on its way.';
}

export const continueAsGuest = () => kv.set('user', { name: 'Guest', email: '', since: Date.now(), guest: true } satisfies User);

// Signing out forgets the cloud copy on this phone (trips downloaded from the account). Cars and trips recorded
// on this phone stay.
export async function signOut() {
  kv.remove('user');
  for (const k of ['cloudTrips', 'sync.state', 'sync.ids', 'sync.pushedTrips', 'sync.known', 'sync.dirty', 'sync.base']) kv.remove(k);
  await supabase?.auth.signOut().catch(() => {});
  if (googleEnabled) await GoogleSignin.signOut().catch(() => {});
}

// At start-up: keep the saved profile in step with the Supabase session (restored from storage, refreshed in the background).
export function watchAuth() {
  if (!supabase) return () => {};
  supabase.auth.getSession().then(({ data }) => {
    const u = currentUser();
    if (data.session) kv.set('user', fromAuth(data.session.user));
    else if (u?.cloud) kv.remove('user'); // the session expired or was revoked: sign in again
  });
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' && currentUser()?.cloud) kv.remove('user');
    if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) kv.set('user', fromAuth(session.user));
  });
  return () => data.subscription.unsubscribe();
}

export const initials = (u: User | null) => (u?.name ?? '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
