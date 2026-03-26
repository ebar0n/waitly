import { Hono } from 'hono'
import { jwtAuth, requireScope } from '../middleware/auth'
import type { CommentBoard } from '../durable-objects/comment-board'

export const commentsRouter = new Hono<{ Bindings: Env }>()

function resolveCourse(raw: string | undefined): string {
  const value = raw ?? 'course-2026'
  return /^[a-z0-9_-]{1,32}$/i.test(value) ? value : 'course-2026'
}

function getStub(env: Env, course: string): DurableObjectStub<CommentBoard> {
  const ns = env.COMMENT_BOARD as unknown as DurableObjectNamespace<CommentBoard>
  return ns.get(ns.idFromName(course))
}

// GET /comments — public, proxied to DO via stub.fetch()
commentsRouter.get('/comments', async (c) => {
  const course = resolveCourse(c.req.query('course'))
  const stub = getStub(c.env, course)
  return stub.fetch(c.req.raw)
})

// GET /comments/ws — public WebSocket upgrade, proxied to DO via stub.fetch()
commentsRouter.get('/comments/ws', async (c) => {
  const course = resolveCourse(c.req.query('course'))
  const stub = getStub(c.env, course)
  return stub.fetch(c.req.raw)
})

// POST /comments — requires JWT with scope 'comment'
commentsRouter.post('/comments', jwtAuth, requireScope('comment'), async (c) => {
  const payload = c.get('jwtPayload') as { email: string }
  const { text } = await c.req.json<{ text: string }>()

  if (!text || text.trim().length === 0) {
    return c.json({ error: 'El texto es requerido' }, 400)
  }
  if (text.length > 280) {
    return c.json({ error: 'El comentario no puede superar 280 caracteres' }, 400)
  }

  const course = resolveCourse(c.req.query('course'))
  const email = payload.email

  // Resolve avatarUrl from D1 (spec 04 is optional — null if no avatar)
  const row = await c.env.DB.prepare('SELECT avatar_uuid FROM waitlist WHERE email = ?')
    .bind(email)
    .first<{ avatar_uuid: string | null }>()

  const avatarUrl = row?.avatar_uuid
    ? `https://waitly-api.workers.dev/avatars/${row.avatar_uuid}`
    : null

  const stub = getStub(c.env, course)
  const comment = await stub.addComment(email, avatarUrl, text.trim())

  c.executionCtx.waitUntil(
    c.env.DB.prepare('UPDATE waitlist SET last_comment_at = ? WHERE email = ?')
      .bind(new Date().toISOString(), email)
      .run(),
  )

  return c.json(comment, 201)
})

// POST /comments/:id/vote — requires JWT with scope 'comment'
commentsRouter.post('/comments/:id/vote', jwtAuth, requireScope('comment'), async (c) => {
  const payload = c.get('jwtPayload') as { email: string }
  const commentId = c.req.param('id') ?? ''
  const course = resolveCourse(c.req.query('course'))

  const stub = getStub(c.env, course)
  const votes = await stub.castVote(commentId, payload.email)
  return c.json({ votes })
})
