import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // El plugin de Cloudflare solo se activa al hacer build
    // En dev corre Vite puro sin overhead de wrangler
    command === 'build' ? cloudflare() : null,
  ],
}))
