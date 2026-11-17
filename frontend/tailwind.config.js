const neutralPalette = {
  50: '#ffffff',
  100: '#f1f2f1',
  200: '#dadddc',
  300: '#c7cdca',
  400: '#b3b9b6',
  500: '#88918e',
  600: '#65706c',
  700: '#46504d',
  800: '#28312f',
  900: '#101313',
  950: '#080A0A',
};

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
          panel: '#101313',
          card: '#101313',
          surface: '#171B1A',
          border: '#252B29',
          borderLight: '#39413F',
          muted: '#B3B9BC',
          text: '#FFFFFF',
          accent: 'var(--brand-accent, #0F766E)',
          dangerBg: '#240B0B',
          errorText: '#F87171',
          emerald: '#10B981',
          amber: '#F59E0B',
        },
        // Legacy color utilities now resolve to the shared neutral scale.
        // The brand accent is applied only to primary and selected controls in index.css.
        indigo: neutralPalette,
        slate: neutralPalette,
        blue: neutralPalette,
        cyan: neutralPalette,
        sky: neutralPalette,
        teal: neutralPalette,
        purple: neutralPalette,
        violet: neutralPalette,
        brand: { 400: '#6ee7b7', 500: '#0f766e', 600: '#064e3b' }
      },
      borderRadius: { lg: '0.375rem', xl: '0.5rem', '2xl': '0.625rem', '3xl': '0.75rem' },
      fontFamily: {
        serif: ['Lora', 'Georgia', 'serif'],
        sans: ['Poppins', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace']
      },
      boxShadow: {
        'obsidian': '0 4px 16px -2px rgba(0, 0, 0, 0.56), 0 0 0 1px rgba(255, 255, 255, 0.04)',
      }
    },
  },
  plugins: [],
}
