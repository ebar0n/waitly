import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { WaitlistService } from './services/waitlist'

const app = new Hono()

// CORS middleware — restrict `origin` to your frontend URL in production
app.use(
  '/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
)

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.post('/waitlist', async (c) => {
  let body: { email?: unknown }

  try {
    body = await c.req.json<{ email?: unknown }>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { email } = body

  if (!email || typeof email !== 'string') {
    return c.json({ error: 'El campo email es requerido' }, 400)
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return c.json({ error: 'El formato del email no es válido' }, 400)
  }

  const result = await WaitlistService.addEmail(email)

  return c.json(result, 201)
})

export default app
