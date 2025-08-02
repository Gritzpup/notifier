/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        discord: '#5865F2',
        telegram: '#0088cc',
        twitch: '#9146FF'
      }
    }
  },
  plugins: []
};