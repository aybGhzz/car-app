/** @type {import('tailwindcss').Config} */
// Colours come from CSS variables set by the active theme (src/lib/theme.ts), so one class works in every theme.
const v = name => `rgb(var(--c-${name}) / <alpha-value>)`;
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), panel: v('panel'), panel2: v('panel2'), line: v('line'), text: v('text'), muted: v('muted'),
        accent: v('accent'), accent2: v('accent2'), onaccent: v('onAccent'), ok: v('ok'), warn: v('warn'), bad: v('bad'), violet: v('violet'),
      },
    },
  },
};
