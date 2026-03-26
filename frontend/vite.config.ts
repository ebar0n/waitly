import { defineConfig } from 'vite'
import { reactRouter } from '@react-router/dev/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { readFileSync } from 'fs'

// Lee las vars VITE_ de .dev.vars para exponerlas en import.meta.env durante dev
function loadViteVarsFromDevVars(): Record<string, string> {
  try {
    const content = readFileSync('.dev.vars', 'utf-8')
    return Object.fromEntries(
      content
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split('=').map((s) => s.trim()) as [string, string])
        .filter(([key]) => key?.startsWith('VITE_')),
    )
  } catch {
    return {}
  }
}

export default defineConfig(({ mode }) => {
  const devVars = mode === 'development' ? loadViteVarsFromDevVars() : {}
  const define = Object.fromEntries(
    Object.entries(devVars).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)]),
  )

  return {
    define,
    plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), reactRouter()],
  }
})
