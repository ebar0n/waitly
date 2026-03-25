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
