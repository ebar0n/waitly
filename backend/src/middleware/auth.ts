import { jwt } from 'hono/jwt'
import { HTTPException } from 'hono/http-exception'
import type { Context, Next } from 'hono'

export type Scope = 'read:self' | 'read:all'

export type JwtPayload = {
  scope: Scope
  iat: number
  exp: number
}

// Verifica que el request tenga un JWT válido firmado con JWT_SECRET
export async function jwtAuth(c: Context<{ Bindings: Env }>, next: Next) {
  try {
    return await jwt({ secret: c.env.JWT_SECRET, alg: 'HS256' })(c, next)
  } catch (e) {
    if (e instanceof HTTPException) return e.getResponse()
    throw e
  }
}

// Verifica que el payload del JWT tenga el scope requerido
export function requireScope(required: Scope) {
  return async (c: Context, next: Next) => {
    const payload = c.get('jwtPayload') as JwtPayload
    if (payload.scope !== required && payload.scope !== 'read:all') {
      return c.json({ error: `Se requiere el scope: ${required}` }, 403)
    }
    await next()
  }
}
