import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--site-background)',
        surface: 'var(--site-surface)',
        panel: 'var(--site-panel)',
        card: 'var(--site-card)',
        line: 'var(--site-line)',
        brand: 'var(--site-primary)',
        coral: 'var(--site-secondary)',
        mint: 'var(--site-success)',
        warning: 'var(--site-warning)',
      },
      boxShadow: {
        glow: '0 20px 80px rgba(34, 211, 238, 0.16)',
      },
    },
  },
  plugins: [],
} satisfies Config;
