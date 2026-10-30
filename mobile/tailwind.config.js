/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: '#0b0e13',
        panel: '#151a21',
        panel2: '#1d232c',
        line: '#29303b',
        text: '#e8ebf1',
        muted: '#8b93a3',
        accent: '#3fb6ff',
        ok: '#3ccf7a',
        warn: '#ffb020',
        bad: '#ff5a5a',
      },
    },
  },
};
