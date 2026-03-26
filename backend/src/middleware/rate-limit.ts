import type { Context, Next } from 'hono'

// Nivel 1 — Infraestructura: 20 req/60s por IP
export async function ipRateLimit(c: Context<{ Bindings: Env }>, next: Next) {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const { success } = await c.env.IP_RATE_LIMITER.limit({ key: ip })
  if (!success) {
    return c.json({ error: 'Demasiadas peticiones' }, 429)
  }
  await next()
}

// Nivel 2 — Negocio: 3 comentarios/24h por estudiante (key = email del JWT)
export async function commentRateLimit(c: Context<{ Bindings: Env }>, next: Next) {
  const { email } = c.get('jwtPayload') as { email: string }
  const { success } = await c.env.COMMENT_RATE_LIMITER.limit({ key: email })
  if (!success) {
    return c.json({ error: 'Límite de comentarios alcanzado' }, 429)
  }
  await next()
}
