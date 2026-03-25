import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { sign } from 'hono/jwt'
type AlgorithmTypes = 'HS256'

export const authRouter = new OpenAPIHono<{ Bindings: Env }>()

const tokenRoute = createRoute({
  method: 'post',
  path: '/auth/token',
  tags: ['Auth'],
  summary: 'Generar JWT',
  description: 'Valida el ADMIN_SECRET y devuelve un JWT firmado con el scope solicitado.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            secret: z.string(),
            scope: z.enum(['read:self', 'read:all']),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ token: z.string() }),
        },
      },
      description: 'Token JWT generado (expira en 24h)',
    },
    401: {
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
      description: 'Secret inválido',
    },
  },
})

authRouter.openapi(tokenRoute, async (c) => {
  const { secret, scope } = c.req.valid('json')

  if (secret !== c.env.ADMIN_SECRET) {
    return c.json({ error: 'Secret inválido' }, 401 as const)
  }

  const token = await sign(
    {
      scope,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24h
    },
    c.env.JWT_SECRET,
    'HS256' as AlgorithmTypes,
  )

  return c.json({ token }, 200 as const)
})
