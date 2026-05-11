/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  // Crucial line: Tells Tailwind to scan all astro, md, etc. files in the src directory
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}