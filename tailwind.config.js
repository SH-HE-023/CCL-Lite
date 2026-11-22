/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          900: 'rgb(var(--base-900) / <alpha-value>)',
          800: 'rgb(var(--base-800) / <alpha-value>)',
          700: 'rgb(var(--base-700) / <alpha-value>)',
          600: 'rgb(var(--base-600) / <alpha-value>)',
          500: 'rgb(var(--base-500) / <alpha-value>)',
        },
        grass: {
          DEFAULT: 'rgb(var(--grass) / <alpha-value>)',
          deep: 'rgb(var(--grass-deep) / <alpha-value>)',
          soft: 'rgb(var(--grass-soft) / <alpha-value>)',
        },
        sand: {
          DEFAULT: 'rgb(var(--sand) / <alpha-value>)',
          deep: 'rgb(var(--sand-deep) / <alpha-value>)',
        },
        ink: {
          100: 'rgb(var(--ink-100) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
        },
        danger: '#E8654A',
      },
      fontFamily: {
        display: ['"Chakra Petch"', '"Segoe UI Variable Display"', '"Microsoft YaHei"', 'sans-serif'],
        sans: ['"Chakra Petch"', '"Segoe UI Variable Text"', '"Microsoft YaHei"', 'sans-serif'],
        pixel: ['Silkscreen', 'Consolas', 'monospace'],
      },
      borderRadius: {
        capsule: '999px',
      },
      boxShadow: {
        glass: '0 1px 0 0 rgba(255,255,255,0.06) inset, 0 24px 60px -30px rgba(0,0,0,0.9)',
      },
      keyframes: {
        'rise': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        rise: 'rise 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
