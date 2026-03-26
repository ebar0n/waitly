import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { cors } from 'hono/cors'
import { authRouter } from './routes/auth'
import { publicWaitlistRouter, protectedWaitlistRouter } from './routes/waitlist'
import { commentsRouter } from './routes/comments'
import { ipRateLimit } from './middleware/rate-limit'
export { CommentBoard } from './durable-objects/comment-board'
export { OnboardingWorkflow } from './workflows/onboarding'

const app = new OpenAPIHono<{ Bindings: Env }>()

// CORS middleware — origin es set via CORS_ORIGIN var en wrangler.jsonc
app.use(
  '/*',
  cors({
    origin: (_, c) => c.env.CORS_ORIGIN,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
)

// Rate limiting de infraestructura — cubre todos los endpoints públicos escribibles
app.use('/waitlist', ipRateLimit)
app.use('/comments', ipRateLimit)
app.use('/comments/:id/vote', ipRateLimit)

// --- Rutas ---
app.route('/', authRouter)
app.route('/', publicWaitlistRouter)
app.route('/', protectedWaitlistRouter)
app.route('/', commentsRouter)

// --- Health check ---
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// --- Docs ---
app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
})

app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    title: 'Waitly API',
    version: '1.0.0',
    description: 'API para gestionar la lista de espera de Waitly.',
  },
  servers: [{ url: '/', description: 'Current server' }],
})

app.get('/swagger', swaggerUI({ url: '/doc' }))
app.get('/', (c) => c.redirect('/swagger'))

export default app
