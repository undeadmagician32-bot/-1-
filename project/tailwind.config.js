/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans KR"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        ink: {
          900: '#0f1115',
          800: '#161a21',
          700: '#1d222c',
          600: '#272d39',
          500: '#383f4d',
          400: '#525a6b',
          300: '#7c8598',
          200: '#aab2c2',
          100: '#d5dae3',
          50: '#f2f4f8',
        },
        accent: {
          600: '#1d6a7a',
          500: '#2a8b9e',
          400: '#3aa8bd',
          300: '#6fc6d6',
          200: '#a9e2ec',
          100: '#d4f3f8',
        },
        success: { 600: '#2f7d52', 500: '#3a9670', 400: '#5fbc8f', 100: '#dcf5e8' },
        warning: { 600: '#b5740f', 500: '#d4901a', 400: '#eab24a', 100: '#fcedd4' },
        error: { 600: '#b23a48', 500: '#c94e5c', 400: '#dd6b78', 100: '#f8dde1' },
      },
    },
  },
  plugins: [],
};
