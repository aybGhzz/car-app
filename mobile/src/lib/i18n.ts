// French / English / Spanish. English strings are the keys, as in the web POC, so the old tables are reused as-is.
import { useSyncExternalStore } from 'react';
import { getLocales } from 'expo-localization';
import { UI_STRINGS, UI_PATTERNS } from './i18n-data';
import { APP_PATTERNS, APP_STRINGS } from './i18n-app';
import { DTC_I18N } from './obd/dtc-i18n';
import { kv } from './store';

export type Lang = 'en' | 'fr' | 'es';
export const LANGS: Record<Lang, string> = { en: 'English', fr: 'Français', es: 'Español' };
const LOCALES: Record<Lang, string> = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES' };

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const DICT: Record<string, { fr: string; es: string }> = {};
for (const [en, fr, es] of [...UI_STRINGS, ...APP_STRINGS]) DICT[norm(en)] = { fr, es };

let LANG: Lang = (() => {
  const l = getLocales()[0]?.languageCode;
  return l && l in LANGS ? (l as Lang) : 'en';
})();
const listeners = new Set<() => void>();

export const locale = () => LOCALES[LANG];
export const getLang = () => LANG;

export function setLang(l: Lang) {
  LANG = l;
  kv.set('lang', l);
  listeners.forEach(f => f());
}

// Called once the stored settings are loaded.
export function restoreLang() {
  const l = kv.get<Lang | null>('lang', null);
  if (l && l in LANGS && l !== LANG) setLang(l);
}

export function t(s: string): string {
  if (LANG === 'en' || s == null) return s;
  const k = norm(String(s));
  if (!k) return s;
  const hit = DICT[k]?.[LANG] ?? (DTC_I18N as any)[LANG]?.[k];
  if (hit) return hit;
  for (const [re, rep] of [...APP_PATTERNS, ...(UI_PATTERNS as typeof APP_PATTERNS)]) {
    const m = k.match(re);
    if (m && rep[LANG]) return rep[LANG](...m);
  }
  return s;
}

// Re-renders the calling component when the language changes.
export function useLang() {
  return useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f); }, () => LANG);
}

// ---------- number and date formatting in the current language ----------
export const num = (v: number, dp = 0) =>
  Number(v).toLocaleString(locale(), { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
export const hm = (s: number) => {
  s = Math.round(s / 60);
  return s < 60 ? `${s} min` : `${Math.floor(s / 60)} h ${String(s % 60).padStart(2, '0')}`;
};
