/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./web/index.html",
    "./web/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#090d16',
        surface: '#0f172a',
        'surface-hover': '#1e293b',
        border: '#1e293b',
        buy: '#10b981',
        'buy-bg': 'rgba(16, 185, 129, 0.15)',
        sell: '#ef4444',
        'sell-bg': 'rgba(239, 68, 68, 0.15)',
        accent: '#6366f1',
        'accent-glow': 'rgba(99, 102, 241, 0.3)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      }
    },
  },
  plugins: [],
}
