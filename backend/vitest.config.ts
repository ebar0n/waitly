import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          CORS_ORIGIN: '*',
          JWT_SECRET: 'test-secret',
          ADMIN_SECRET: 'test-admin',
        },
        d1Databases: ['DB'],
      },
    }),
  ],
})
