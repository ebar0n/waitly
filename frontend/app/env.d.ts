import type {} from 'react-router'

declare module 'react-router' {
  interface AppLoadContext {
    cloudflare: {
      env: Env
      ctx: ExecutionContext
      cf: Request['cf']
    }
  }
}

declare global {
  // Cloudflare Turnstile widget global
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          callback?: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
          theme?: 'auto' | 'light' | 'dark'
        },
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}
