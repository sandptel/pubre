import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// BASE is set by CI to /<repo-name>/ for GitHub Pages project sites.
export default defineConfig({
  base: process.env.BASE ?? '/',
  plugins: [svelte()],
})
