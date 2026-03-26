/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import worker from '../index'

const BASE = 'http://localhost'

async function getToken(): Promise<string> {
  const ctx = createExecutionContext()
  const res = await worker.fetch(
    new Request(`${BASE}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: 'test-admin', scope: 'read:all' }),
    }),
    env,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  const body = (await res.json()) as { token: string }
  return body.token
}

function makeWaitlistForm(email: string): FormData {
  const fd = new FormData()
  fd.append('email', email)
  return fd
}

beforeEach(async () => {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS waitlist (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      email     TEXT    NOT NULL UNIQUE,
      country   TEXT,
      joined_at TEXT    NOT NULL DEFAULT (datetime('now')),
      avatar_uuid TEXT
    )`,
  ).run()
  await env.DB.prepare('DELETE FROM waitlist').run()
})

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request(`${BASE}/health`), env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('ok')
  })
})

describe('POST /waitlist', () => {
  it('returns 201 with success: true for valid email', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(
      new Request(`${BASE}/waitlist`, {
        method: 'POST',
        body: makeWaitlistForm('test@example.com'),
      }),
      env,
      ctx,
    )
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; entry: { email: string } }
    expect(body.success).toBe(true)
    expect(body.entry.email).toBe('test@example.com')
  })

  it('returns 400 for invalid email', async () => {
    const ctx = createExecutionContext()
    const fd = new FormData()
    fd.append('email', 'not-an-email')
    const res = await worker.fetch(
      new Request(`${BASE}/waitlist`, {
        method: 'POST',
        body: fd,
      }),
      env,
      ctx,
    )
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 200 for duplicate email (upsert)', async () => {
    const register = () =>
      worker.fetch(
        new Request(`${BASE}/waitlist`, {
          method: 'POST',
          body: makeWaitlistForm('dup@example.com'),
        }),
        env,
        createExecutionContext(),
      )

    const first = await register()
    await waitOnExecutionContext(createExecutionContext())
    expect(first.status).toBe(201)

    const second = await register()
    await waitOnExecutionContext(createExecutionContext())
    expect(second.status).toBe(200)
  })
})

describe('POST /auth/token', () => {
  it('returns 200 with token for valid ADMIN_SECRET', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(
      new Request(`${BASE}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'test-admin', scope: 'read:all' }),
      }),
      env,
      ctx,
    )
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string }
    expect(body.token).toBeDefined()
  })

  it('returns 401 for wrong secret', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(
      new Request(`${BASE}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'wrong-secret', scope: 'read:all' }),
      }),
      env,
      ctx,
    )
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(401)
  })
})

describe('GET /waitlist', () => {
  it('returns 401 without Authorization header', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request(`${BASE}/waitlist`), env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(401)
  })

  it('returns 200 with registered entries', async () => {
    for (const email of ['alice@example.com', 'bob@example.com']) {
      const ctx = createExecutionContext()
      await worker.fetch(
        new Request(`${BASE}/waitlist`, {
          method: 'POST',
          body: makeWaitlistForm(email),
        }),
        env,
        ctx,
      )
      await waitOnExecutionContext(ctx)
    }

    const token = await getToken()
    const ctx = createExecutionContext()
    const res = await worker.fetch(
      new Request(`${BASE}/waitlist`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
      ctx,
    )
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { total: number; entries: unknown[] }
    expect(body.total).toBe(2)
    expect(body.entries).toHaveLength(2)
  })
})

describe('GET /waitlist/:email', () => {
  it('returns 404 for unknown email', async () => {
    const token = await getToken()
    const ctx = createExecutionContext()
    const res = await worker.fetch(
      new Request(`${BASE}/waitlist/nobody@example.com`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
      ctx,
    )
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(404)
  })

  it('returns 200 with entry for registered email', async () => {
    const email = 'found@example.com'
    const postCtx = createExecutionContext()
    await worker.fetch(
      new Request(`${BASE}/waitlist`, {
        method: 'POST',
        body: makeWaitlistForm(email),
      }),
      env,
      postCtx,
    )
    await waitOnExecutionContext(postCtx)

    const token = await getToken()
    const ctx = createExecutionContext()
    const res = await worker.fetch(
      new Request(`${BASE}/waitlist/${email}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
      ctx,
    )
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { email: string }
    expect(body.email).toBe(email)
  })
})
