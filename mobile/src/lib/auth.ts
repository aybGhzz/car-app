// Sign-in placeholder until the backend exists: the profile is kept on this device only and no password is stored.
// The screens (welcome, login, sign-up, profile) are real, so plugging in a server later only changes this file.
import { kv, useStored } from './store';

export type User = { name: string; email: string; since: number; guest?: boolean };

export const useUser = () => useStored<User | null>('user', null);
export const currentUser = () => kv.get<User | null>('user', null);

const nameFromEmail = (email: string) => {
  const n = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return n ? n[0].toUpperCase() + n.slice(1) : 'Driver';
};
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export async function signIn(email: string, password: string, name?: string): Promise<string | null> {
  if (!validEmail(email)) return 'Enter a valid email address.';
  if (password.length < 6) return 'The password needs at least 6 characters.';
  await new Promise(r => setTimeout(r, 900)); // where the server call will go
  const known = kv.get<Record<string, string>>('accounts', {});
  const key = email.trim().toLowerCase();
  const display = name?.trim() || known[key] || nameFromEmail(key);
  kv.set('accounts', { ...known, [key]: display });
  kv.set('user', { name: display, email: key, since: Date.now() } satisfies User);
  return null;
}
export const continueAsGuest = () => kv.set('user', { name: 'Guest', email: '', since: Date.now(), guest: true } satisfies User);
export const signOut = () => kv.remove('user');
export const initials = (u: User | null) => (u?.name ?? '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
