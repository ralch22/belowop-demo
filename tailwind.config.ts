import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          DEFAULT: '#0F766E',
          hover: '#0D5F5A',
          dark: '#14B8A6',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.05)',
        hover: '0 4px 6px -1px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.05)',
        modal: '0 10px 15px -3px rgb(15 23 42 / 0.10)',
      },
      maxWidth: {
        content: '1200px',
      },
    },
  },
  plugins: [],
};

export default config;
