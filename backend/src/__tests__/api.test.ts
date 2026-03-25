/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import worker from '../index'

const BASE = 'http://localhost'

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      }),
      env,
      ctx,
    )
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBe(true)
  })

  it('returns 400 for invalid email', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(
      new Request(`${BASE}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      }),
      env,
      ctx,
    )
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(400)
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
})
