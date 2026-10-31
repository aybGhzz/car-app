// Colour themes. Tailwind classes (bg-panel, text-muted…) read CSS variables, and C holds the same colours as hex for
// SVG and Reanimated, which take colour values rather than classes. Switching theme updates both and re-renders the app.
import { Platform } from 'react-native';

export type Palette = {
  bg: string; panel: string; panel2: string; line: string; text: string; muted: string;
  accent: string; accent2: string; onAccent: string; ok: string; warn: string; bad: string; violet: string;
  grad: [string, string]; // primary buttons and highlights
  dark: boolean; tiles: string; mapBg: string; mapGrid: string;
};

// Vindici: the light teal look from the mockups (default).
const VINDICI: Palette = {
  bg: '#eef5f6', panel: '#ffffff', panel2: '#f2f8f9', line: '#d7e5e8', text: '#17262c', muted: '#5f737a',
  accent: '#0d8077', accent2: '#3cc9b9', onAccent: '#ffffff', ok: '#15924a', warn: '#c26a04', bad: '#d42a2a', violet: '#7c3aed',
  grad: ['#16a191', '#0a6e66'], dark: false, tiles: 'rastertiles/voyager', mapBg: '#e7eef0', mapGrid: '#dbe5e8',
};
// Night: the original dark look.
const NIGHT: Palette = {
  bg: '#0b0e13', panel: '#151a21', panel2: '#1d232c', line: '#29303b', text: '#e8ebf1', muted: '#8b93a3',
  accent: '#3fb6ff', accent2: '#7fd0ff', onAccent: '#001523', ok: '#3ccf7a', warn: '#ffb020', bad: '#ff5a5a', violet: '#a78bfa',
  grad: ['#6cc8ff', '#3fb6ff'], dark: true, tiles: 'dark_all', mapBg: '#10161e', mapGrid: '#1a222c',
};
export const PALETTES = { vindici: VINDICI, dark: NIGHT } as const;
export type ReadyTheme = keyof typeof PALETTES;

export const C: Palette = { ...VINDICI };
export const KIND_COLOR = { ok: C.ok, warn: C.warn, bad: C.bad, off: C.muted };

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(' ');
const TOKENS = ['bg', 'panel', 'panel2', 'line', 'text', 'muted', 'accent', 'accent2', 'onAccent', 'ok', 'warn', 'bad', 'violet'] as const;
export const themeVars = (p: Palette = C) => Object.fromEntries(TOKENS.map(k => [`--c-${k}`, rgb(p[k])]));

export function applyTheme(id: string) {
  const p = PALETTES[id as ReadyTheme] ?? VINDICI;
  Object.assign(C, p);
  Object.assign(KIND_COLOR, { ok: p.ok, warn: p.warn, bad: p.bad, off: p.muted });
  // On the web, sheets render outside the app's root view, so the variables also go on the page itself.
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    for (const [k, v] of Object.entries(themeVars(p))) document.documentElement.style.setProperty(k, v);
    document.body.style.backgroundColor = p.dark ? '#07090d' : '#dfe9eb';
  }
}
