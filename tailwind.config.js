/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'primary-soft': 'var(--color-primary-soft)',
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
        ink: '#1F2933',
        muted: '#5B6670',
        line: '#E3E8EC',
      },
      fontFamily: { sans: ['var(--font-family)', 'system-ui', 'sans-serif'] },
      maxWidth: { content: '72rem' },
    },
  },
  plugins: [],
}
