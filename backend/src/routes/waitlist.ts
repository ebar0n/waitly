import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { jwtAuth, requireScope } from '../middleware/auth'
import { WaitlistService } from '../services/waitlist'
import { EmailService } from '../services/email'

// --- Schemas ---

const ErrorSchema = z.object({ error: z.string() })

const WaitlistEntrySchema = z.object({
  email: z.email(),
  joinedAt: z.string(),
  country: z.string().nullable(),
})

const WaitlistResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  entry: WaitlistEntrySchema,
})

// --- Rutas públicas ---

export const publicWaitlistRouter = new OpenAPIHono<{ Bindings: Env }>()

const postRoute = createRoute({
  method: 'post',
  path: '/waitlist',
  tags: ['Waitlist'],
  summary: 'Unirse a la lista de espera',
  description: 'Registra un email. Captura el país automáticamente via CF-IPCountry.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ email: z.email() }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: WaitlistResponseSchema } },
      description: 'Email registrado exitosamente',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Request inválido',
    },
  },
})

publicWaitlistRouter.openapi(postRoute, async (c) => {
  const { email } = c.req.valid('json')
  const country = c.req.header('CF-IPCountry') ?? null

  const result = await WaitlistService.addEmail(email, country)

  c.executionCtx.waitUntil(
    EmailService.sendWelcome(email, c.env.RESEND_API_KEY),
  )

  return c.json(result, 201)
})

// --- Rutas protegidas (requieren JWT) ---

export const protectedWaitlistRouter = new OpenAPIHono<{ Bindings: Env }>()

// JWT middleware para todas las rutas de este router
protectedWaitlistRouter.use('/waitlist/*', jwtAuth)
protectedWaitlistRouter.use('/waitlist', jwtAuth)

// Scope middleware por ruta — cada ruta valida el scope requerido
protectedWaitlistRouter.use('/waitlist', requireScope('read:all'))
protectedWaitlistRouter.use('/waitlist/:email', requireScope('read:self'))

const getListRoute = createRoute({
  method: 'get',
  path: '/waitlist',
  tags: ['Waitlist'],
  summary: 'Listar todos los registros',
  description: 'Requiere scope `read:all`.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            entries: z.array(WaitlistEntrySchema),
            total: z.number(),
          }),
        },
      },
      description: 'Lista de emails registrados',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Token ausente o inválido',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Scope insuficiente — se requiere read:all',
    },
  },
})

const getByEmailRoute = createRoute({
  method: 'get',
  path: '/waitlist/{email}',
  tags: ['Waitlist'],
  summary: 'Buscar email en la lista',
  description: 'Requiere scope `read:self`.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ email: z.email() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: WaitlistEntrySchema } },
      description: 'Email encontrado',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Token ausente o inválido',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Scope insuficiente — se requiere read:self',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Email no encontrado',
    },
  },
})

protectedWaitlistRouter.openapi(getListRoute, (c) => {
  const entries = WaitlistService.findAll()
  return c.json({ entries, total: entries.length }, 200 as const)
})

protectedWaitlistRouter.openapi(getByEmailRoute, (c) => {
  const { email } = c.req.valid('param')
  const entry = WaitlistService.findByEmail(email)
  if (!entry) return c.json({ error: 'Email no encontrado en la lista' }, 404 as const)
  return c.json(entry, 200 as const)
})
