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
          bg: '#080A0A',
          panel: '#0C1024',
          card: '#081416',
          surface: '#0D1C20',
          border: '#182226',
          borderLight: '#26363C',
          muted: '#9CA3AF',
          text: '#FFFFFF',
          accent: 'var(--brand-accent, #A98242)',
          accentGlow: 'rgba(169, 130, 66, 0.25)',
          dangerBg: '#240B0B',
          errorText: '#F87171',
          emerald: '#10B981',
          amber: '#F59E0B',
          gold: '#A98242'
        }
      },
      fontFamily: {
        serif: ['Lora', 'Georgia', 'serif'],
        sans: ['Poppins', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace']
      },
      boxShadow: {
        'obsidian': '0 4px 20px -2px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        'obsidian-glow': '0 0 25px -5px rgba(169, 130, 66, 0.3), 0 0 0 1px rgba(169, 130, 66, 0.4)',
      }
    },
  },
  plugins: [],
}
