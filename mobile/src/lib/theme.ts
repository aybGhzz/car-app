// The same colors as tailwind.config.js, for SVG and Reanimated, which take color values rather than classes.
export const C = {
  bg: '#0b0e13', panel: '#151a21', panel2: '#1d232c', line: '#29303b', text: '#e8ebf1', muted: '#8b93a3',
  accent: '#3fb6ff', ok: '#3ccf7a', warn: '#ffb020', bad: '#ff5a5a', violet: '#a78bfa',
};
export const KIND_COLOR = { ok: C.ok, warn: C.warn, bad: C.bad, off: C.muted } as const;
