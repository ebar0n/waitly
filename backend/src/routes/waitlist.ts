import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { sign } from 'hono/jwt'
import { jwtAuth, requireScope } from '../middleware/auth'
import { WaitlistService } from '../services/waitlist'

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
  commentToken: z.string(),
})

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

// --- Rutas públicas ---

export const publicWaitlistRouter = new OpenAPIHono<{ Bindings: Env }>()

const postRoute = createRoute({
  method: 'post',
  path: '/waitlist',
  tags: ['Waitlist'],
  summary: 'Unirse a la lista de espera',
  description:
    'Registra un email con foto de perfil opcional. Captura el país automáticamente via CF-IPCountry. Si el email ya existe, actualiza el avatar.',
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            email: z.string().email(),
            file: z.any().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: WaitlistResponseSchema } },
      description: 'Email registrado exitosamente',
    },
    200: {
      content: { 'application/json': { schema: WaitlistResponseSchema } },
      description: 'Perfil actualizado (email ya existía)',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Request inválido',
    },
  },
})

publicWaitlistRouter.openapi(postRoute, async (c) => {
  const { email, file } = c.req.valid('form')
  const country = c.req.header('CF-IPCountry') ?? null

  const { result, avatarUuid, isNew } = await WaitlistService.upsertEmail(c.env.DB, email, country)

  if (file instanceof File && file.size > 0) {
    const contentType = file.type
    if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
      return c.json({ error: 'Tipo de archivo no permitido. Solo JPEG, PNG o WebP.' }, 400 as const)
    }
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: 'El archivo supera el límite de 5MB.' }, 400 as const)
    }
    const ext = contentType.split('/')[1]
    await c.env.UPLOADS_BUCKET.put(`avatars/${avatarUuid}.${ext}`, file.stream(), {
      httpMetadata: { contentType },
    })
  }

  if (isNew) {
    await c.env.ONBOARDING_WORKFLOW.create({ id: email, params: { email } })
  }

  const commentToken = await sign(
    { email, scope: 'comment', exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 },
    c.env.JWT_SECRET,
    'HS256',
  )

  return c.json({ ...result, commentToken }, isNew ? (201 as const) : (200 as const))
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

protectedWaitlistRouter.openapi(getListRoute, async (c) => {
  const entries = await WaitlistService.findAll(c.env.DB)
  return c.json({ entries, total: entries.length }, 200 as const)
})

protectedWaitlistRouter.openapi(getByEmailRoute, async (c) => {
  const { email } = c.req.valid('param')
  const entry = await WaitlistService.findByEmail(c.env.DB, email)
  if (!entry) return c.json({ error: 'Email no encontrado en la lista' }, 404 as const)
  return c.json(entry, 200 as const)
})
