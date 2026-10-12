import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { readFileSync } from 'node:fs'

// BASE is set by CI to /<repo-name>/ for GitHub Pages project sites.
export default defineConfig({
  base: process.env.BASE ?? '/',
  plugins: [svelte()],
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
})
