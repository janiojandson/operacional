/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./web/index.html",
    "./web/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-app': '#0B0E11',
        'bg-panel': '#181A20',
        'border-panel': '#2B3139',
        'text-primary': '#EAECEF',
        'text-muted': '#848E9C',
        'trade-green': '#0ECB81',
        'trade-red': '#F6465D',

        background: '#0B0E11',
        surface: '#181A20',
        'surface-hover': '#2B3139',
        border: '#2B3139',
        buy: '#0ECB81',
        'buy-bg': 'rgba(14, 203, 129, 0.15)',
        sell: '#F6465D',
        'sell-bg': 'rgba(246, 70, 93, 0.15)',
        accent: '#6366f1',
        'accent-glow': 'rgba(99, 102, 241, 0.3)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Roboto Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
