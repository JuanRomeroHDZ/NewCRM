/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: {
          bg: '#0c0d10',
          panel: '#121418',
          card: '#17191f',
          surface: '#1c1f26',
          border: '#262a33',
          borderLight: '#323744',
          muted: '#858d98',
          text: '#e2e8f0',
          accent: 'var(--brand-accent, #6366f1)',
          accentGlow: 'rgba(99, 102, 241, 0.25)',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
          cyan: '#06b6d4'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace']
      },
      boxShadow: {
        'obsidian': '0 4px 20px -2px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06)',
        'obsidian-glow': '0 0 25px -5px rgba(99, 102, 241, 0.3), 0 0 0 1px rgba(99, 102, 241, 0.3)',
      }
    },
  },
  plugins: [],
}
