import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--site-background)',
        panel: 'var(--site-panel)',
        line: 'var(--site-line)',
        brand: 'var(--site-primary)',
        coral: 'var(--site-secondary)',
        mint: '#34d399',
      },
      boxShadow: {
        glow: '0 20px 80px rgba(34, 211, 238, 0.16)',
      },
    },
  },
  plugins: [],
} satisfies Config;
