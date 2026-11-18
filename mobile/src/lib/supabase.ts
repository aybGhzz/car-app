// Supabase client for cloud sync. Only the public anon key is used here: what protects the data is Row Level Security
// in the database (each account only sees its own rows in the `vindici` schema). Never put the service_role key in the app.
// Without EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY the app works as before, on this phone only.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const cloudEnabled = !!(url && anonKey);

export const supabase: SupabaseClient<any, 'vindici'> | null = cloudEnabled
  ? createClient<any, 'vindici'>(url!, anonKey!, {
      db: { schema: 'vindici' },
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null;

// Refresh the session only while the app is in the foreground (recommended for React Native).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', s => (s === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh()));
}
