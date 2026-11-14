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
          card: '#0C1024',
          surface: '#081416',
          border: '#182226',
          borderLight: '#26363C',
          muted: '#B3B9BC',
          text: '#FFFFFF',
          accent: 'var(--brand-accent, #A98242)',
          accentGlow: 'rgba(169, 130, 66, 0.25)',
          dangerBg: '#240B0B',
          errorText: '#F87171',
          emerald: '#10B981',
          amber: '#F59E0B',
          gold: '#A98242'
        },
        indigo: {
          50: '#ffffff', 100: '#ffffff', 200: '#eee1c9', 300: '#d5bc8f',
          400: '#c9aa73', 500: '#A98242', 600: '#A98242', 700: '#806333',
          800: '#544124', 900: '#302919', 950: '#1c1a14'
        },
        slate: {
          50: '#ffffff', 100: '#f1f1f0', 200: '#dadddd', 300: '#c7cdce',
          400: '#b3b9bc', 500: '#889394', 600: '#617071', 700: '#344749',
          800: '#182a2c', 900: '#0C1024', 950: '#080A0A'
        },
        brand: { 400: '#d5bc8f', 500: '#A98242', 600: '#25334a' }
      },
      borderRadius: { lg: '0.375rem', xl: '0.5rem', '2xl': '0.625rem', '3xl': '0.75rem' },
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
