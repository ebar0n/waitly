import { createRequestHandler } from 'react-router'

declare module 'react-router' {
  interface AppLoadContext {
    cloudflare: {
      env: Env
      ctx: ExecutionContext
      cf: Request['cf']
    }
  }
}

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE
)

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return requestHandler(request, {
      cloudflare: { env, ctx, cf: request.cf },
    })
  },
} satisfies ExportedHandler<Env>
