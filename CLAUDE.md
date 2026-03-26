# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo structure

Two independent Cloudflare Workers in a npm workspaces-style layout (no shared `node_modules`):

- `backend/` — Hono API Worker (`waitly-api`, port 8787)
- `frontend/` — React Router v7 SSR Worker (`waitly-frontend`, port 5173)

Each app has its own `package.json`, `wrangler.jsonc`, `tsconfig`, and `node_modules`.

## Commands

All commands require Node 22 (`nvm use` from the repo root).

### From the root
```bash
npm run dev          # backend + frontend in parallel
npm test             # backend tests, then frontend tests
npm run format       # Prettier on both apps
npm run cf-typegen   # regenerate worker-configuration.d.ts in both apps
npm run install:all  # install deps in both apps
```

### Backend (`cd backend`)
```bash
npm run dev          # wrangler dev → http://localhost:8787
npm run typecheck    # tsc --noEmit
npm test             # vitest run (inside workerd via @cloudflare/vitest-pool-workers)
npm run test:watch   # vitest watch mode
npm run deploy       # wrangler deploy
npm run cf-typegen   # regenerate worker-configuration.d.ts
```

### Frontend (`cd frontend`)
```bash
npm run dev          # vite dev → http://localhost:5173
npm run build        # react-router typegen && tsc -b && vite build
npm test             # vitest run (jsdom)
npm run deploy       # wrangler deploy
npm run cf-typegen   # react-router typegen + wrangler types
```

## Backend architecture

**Entry**: `src/index.ts` — `OpenAPIHono` app, mounts routers, registers CORS, Swagger UI at `/swagger`, OpenAPI doc at `/doc`, redirects `/` → `/swagger`. Also re-exports `CommentBoard` and `OnboardingWorkflow` so Wrangler can register both classes.

**Routers**:
- `src/routes/auth.ts` — `POST /auth/token`: validates `ADMIN_SECRET`, returns signed JWT (24h, HS256)
- `src/routes/waitlist.ts` — public router (`POST /waitlist`) + protected router (`GET /waitlist`, `GET /waitlist/{email}`). `POST /waitlist` also signs and returns a `commentToken` (scope `comment`, 30-day exp) so the frontend can post comments without storing extra user data. On new registrations, launches `ONBOARDING_WORKFLOW` with `{ id: email, params: { email } }` — using email as instance ID prevents duplicate workflows.
- `src/routes/comments.ts` — `POST /comments` updates `last_comment_at` in D1 via `ctx.waitUntil()` after posting to the DO, so the workflow can detect activity.
- `src/routes/comments.ts` — comment board router. Public: `GET /comments?course=X` (list) and `GET /comments/ws?course=X` (WebSocket upgrade), both proxied to the DO via `stub.fetch()`. Protected (JWT `comment`): `POST /comments?course=X` (add comment via `stub.addComment()` RPC) and `POST /comments/:id/vote?course=X` (toggle vote via `stub.castVote()` RPC). Course param is validated (`/^[a-z0-9_-]{1,32}$/i`), defaults to `'course-2026'`.

**Rate limiting** (`src/middleware/rate-limit.ts`): dos middlewares exportados:
- `ipRateLimit` — Nivel 1 por IP (`CF-Connecting-IP`). Binding `IP_RATE_LIMITER` (20 req/60s). Aplicado en `src/index.ts` sobre `/waitlist`, `/comments` y `/comments/:id/vote`.
- `commentRateLimit` — Nivel 2 por estudiante (key = email del JWT). Binding `COMMENT_RATE_LIMITER` (3/86400s). Aplicado en `POST /comments` tras `jwtAuth`. Ambos bindings se declaran en `wrangler.jsonc` → `rate_limiting`; los tipos se definen en `src/types/rate-limit.d.ts` porque wrangler 4.77 no los genera.

`POST /comments` añade headers `X-RateLimit-Limit: 3` y `X-RateLimit-Remaining: <n>` (calculado desde D1 con `COUNT(*) WHERE email = ? AND created_at > <hace 24h>`).

**Auth middleware** (`src/middleware/auth.ts`):
- `jwtAuth` — wraps `hono/jwt`, catches `HTTPException` so it returns a response instead of throwing
- `requireScope(scope)` — checks `jwtPayload.scope`; `read:all` satisfies any required scope
- Scopes: `'read:self'`, `'read:all'`, `'comment'`. Comment tokens carry `{ email, scope: 'comment', exp }`.
- Protected router applies `jwtAuth` via `.use('/waitlist/*')` and `.use('/waitlist')` (not `/*` — that would catch `/swagger`)

**Service layer**:
- `src/services/waitlist.ts` — persists data in D1. Methods: `addEmail(db, email, country)`, `upsertEmail(db, email, country)` (returns `{ result, avatarUuid, isNew }`), `findAll(db)`, `findByEmail(db, email)`. Migrations live in `backend/migrations/`.
- `src/services/email.ts` — `sendWelcome(email, apiKey)` and `sendFollowUp(email, apiKey)` via Resend. Both called from the workflow. Hardcoded recipient until a domain is verified in Resend.

**Workflow** (`wrangler.jsonc` → `workflows`): binding `ONBOARDING_WORKFLOW`, class `OnboardingWorkflow` (`src/workflows/onboarding.ts`). Launched from `POST /waitlist` for new registrations using `crypto.randomUUID()` as instance ID. Steps: `send-welcome` → `wait-30m` → `check-activity-1` (D1) → `send-followup-1` → `wait-24h` → `check-activity-2` (D1) → `send-followup-2` → `wait-7d` → `check-activity-3` (D1) → `send-followup-3`. Each check reads `last_comment_at` from D1 and returns early if set. Each `step.do()` is idempotent and retryable; `step.sleep()` enables multi-day pauses impossible with `waitUntil`.

**D1 database** (`wrangler.jsonc` → `d1_databases`): binding `DB`, database `waitly-db` (ID: `69ed849a-5347-4dec-abb3-5ccb9e15b886`). Run migrations with `wrangler d1 migrations apply waitly-db --remote`. Local dev uses a local SQLite file automatically. Migration `0002_add_avatar.sql` adds `avatar_uuid TEXT` column — apply manually. Migration `0003_add_last_comment.sql` adds `last_comment_at TEXT` column (updated by `POST /comments` via `waitUntil`) — apply manually.

**Durable Object** (`wrangler.jsonc` → `durable_objects` + `migrations`): binding `COMMENT_BOARD`, class `CommentBoard` (`src/durable-objects/comment-board.ts`). Uses `new_sqlite_classes` migration tag `v1`.
- `idFromName(course)` routes each course slug to its own independent DO instance — changing `?course=X` subscribes to a different board with zero code changes.
- SQLite schema initialized in constructor: `comments` table (id, email, avatar_url, text, votes, created_at) with indexes on `votes DESC` and `created_at DESC`; `votes` table (comment_id, email, PRIMARY KEY).
- **RPC methods**: `addComment(email, avatarUrl, text) → Comment` and `castVote(commentId, email) → number`. Both broadcast changes to all connected WebSocket clients via `this.ctx.getWebSockets()`.
- **`fetch()` handler**: if `Upgrade: websocket` header is present, accepts the WebSocket with Hibernation API (`this.ctx.acceptWebSocket(server)`); otherwise returns the comment list as JSON ordered by `votes DESC, created_at DESC`.
- **Broadcast messages**: `{ type: 'comment_added', comment }` and `{ type: 'vote_updated', commentId, votes }`.
- `castVote` is a toggle: if the email already voted on that comment, it removes the vote (-1); otherwise adds it (+1).

**R2 bucket** (`wrangler.jsonc` → `r2_buckets`): binding `UPLOADS_BUCKET`, bucket `waitly-uploads`, `remote = true` so `wrangler dev` writes to the real bucket. Avatar key format: `avatars/<uuid>.<ext>`. Allowed types: `image/jpeg`, `image/png`, `image/webp`. Max size: 5MB. The UUID is generated once per email and persisted in D1 (`avatar_uuid`); re-registration overwrites the same R2 key. Tests use `wrangler.test.jsonc` (no `remote = true`) with `r2Buckets: ['UPLOADS_BUCKET']` in miniflare.

**Secrets** (declared in `wrangler.jsonc` as `secrets.required`): `CORS_ORIGIN`, `JWT_SECRET`, `ADMIN_SECRET`. Local values come from `.dev.vars`. In production, set with `wrangler secret put`.

**Secrets Store** (`wrangler.jsonc` → `secrets_store_secrets`): `RESEND_API_KEY` is bound from the `default_secrets_store` (store ID: `59210c5f4b6c4de39491d30070a047e9`). In the Worker, the binding is typed as `SecretsStoreSecret` — call `await env.RESEND_API_KEY.get()` to retrieve the value. For local dev, wrangler falls back to `.dev.vars`.

**Tests** run inside the actual workerd runtime using `@cloudflare/vitest-pool-workers`. Test bindings are injected via `miniflare.bindings` in `vitest.config.ts` — not from `.dev.vars`. Tests use `wrangler.test.jsonc` to avoid remote R2 proxy sessions.

**Types**: `worker-configuration.d.ts` is generated by `wrangler types`. Never hand-edit it. The `Env` interface is global and used throughout `src/`.

## Frontend architecture

**SSR worker** (`worker/app.ts`): receives `Request`, passes `{ env, ctx, cf: request.cf }` as `context.cloudflare` to React Router loaders.

**Routes** (`app/routes.ts`):
- `routes/home.tsx` — waitlist signup form + comment board. On successful registration, saves `commentToken` from the response to `localStorage` and immediately activates the comment composer (no page reload needed). Comment board: fetches initial list from `GET /comments?course=X`, opens a WebSocket to `ws[s]://.../comments/ws?course=X` for real-time updates, posts via `POST /comments`, votes via `POST /comments/:id/vote`. Course is read from `?course=` query param (defaults to `'course-2026'`) and can be changed live via an editable input — each value resolves to a distinct DO instance via `idFromName`. `VITE_API_URL` drives both the REST calls and the WebSocket URL (`replace(/^http/, 'ws')`). Includes a Cloudflare Turnstile widget (loaded via CDN script, no npm package) controlled by `VITE_TURNSTILE_SITE_KEY`; if the var is absent the widget is skipped. The submit button is disabled until Turnstile resolves. Token is sent as `cf-turnstile-response` in the `FormData`.
- `routes/stats.tsx` — reads `context.cloudflare.cf` in the loader for geolocation data (SSR only, no client state)
- `routes/landing.tsx` — SSR A/B testing landing. `loader` reads `ab:config` from KV (`AB_CONFIG` binding, `cacheTtl: 60`), assigns variant via cookie (`ab_variant`). `action` saves `variant:<email>` to KV and forwards `multipart/form-data` to backend via service binding (`env.BACKEND`) or direct fetch when `VITE_API_URL` is defined.

**KV namespace** (`wrangler.jsonc` → `kv_namespaces`): binding `AB_CONFIG` (ID: `e19adee3c5904afa84672409a89e573e`). Stores `ab:config` (A/B variant config JSON) and `variant:<email>` (which variant each user saw).

**Service binding** (`wrangler.jsonc` → `services`): binding `BACKEND` pointing to Worker `waitly-api`. Used in SSR actions to call the backend Worker-to-Worker without going through the public internet. Detection pattern: `import.meta.env.VITE_API_URL` defined → local dev with `fetch`; absent → production with `env.BACKEND.fetch()`.

**`AppLoadContext`** is augmented in `app/env.d.ts` (included in `tsconfig.app.json`) so loaders see `context.cloudflare` typed. `worker-configuration.d.ts` is also included in `tsconfig.app.json` to provide `Env` and `ExecutionContext`. `env.d.ts` also declares `window.turnstile` (inside `declare global`) for the Turnstile widget API.

**`vite.config.ts`** reads `.dev.vars` in `development` mode and injects any `VITE_` prefixed variable via Vite's `define` option. This means `VITE_API_URL` and `VITE_TURNSTILE_SITE_KEY` only need to be set in `.dev.vars` — no separate `.env.local` required. In production, these vars must be available in the build environment (CI/CD) as standard env vars before running `vite build`.

**Three tsconfigs** in the frontend:
- `tsconfig.app.json` — app/ and src/ (React, DOM types, includes `worker-configuration.d.ts` and `.react-router/types/**/*`)
- `tsconfig.worker.json` — worker/ only (`@cloudflare/workers-types`)
- `tsconfig.node.json` — vite.config.ts, react-router.config.ts

**`.react-router/`** is gitignored. `react-router typegen` runs as the first step of `npm run build` to generate route types into `.react-router/types/`. The `rootDirs: [".", "./.react-router/types"]` in `tsconfig.app.json` is what makes `import type { Route } from './+types/home'` resolve correctly.

**`virtual:react-router/server-build`** is declared in `worker/virtual.d.ts` with the named exports matching `ServerBuild`.

**Frontend tests** use jsdom + `@testing-library/react`. They run outside of workerd (unlike backend tests).

## Key constraints

- `@react-router/dev` requires Vite `^7` (not 8) — do not upgrade Vite in the frontend
- Backend middleware pattern: `protectedWaitlistRouter.use('/waitlist/*', jwtAuth)` + `protectedWaitlistRouter.use('/waitlist', jwtAuth)` — using `/*` would intercept `/swagger`
- CF properties on `request.cf` (e.g. `cf?.country`) may be typed as `{}` by workerd types; cast to `string | undefined` when needed
- `hono/jwt` throws `HTTPException` instead of returning — always wrap in try/catch and return `e.getResponse()`
- OpenAPIHono response types: middleware-returned status codes (401/403 from `jwtAuth`) must NOT appear in `createRoute` responses for protected routes — TypeScript will error because the handler doesn't return those codes
- DO RPC stubs: `wrangler types` generates `DurableObjectNamespace` (non-generic). Cast via `as unknown as DurableObjectNamespace<CommentBoard>` to get typed RPC calls.
- DO SQLite type constraint: `sql.exec<T>` requires `T extends Record<string, SqlStorageValue>`. Use an intersection type (`type Row = Record<string, SqlStorageValue> & { ... specific fields ... }`) to preserve field-level typing while satisfying the constraint.
- `CommentBoard` must be re-exported from `src/index.ts` (the Worker's `main` entry) for Wrangler to register the DO class. Forgetting this export causes a runtime error at DO instantiation.
- WebSocket proxy to DO: pass `c.req.raw` directly to `stub.fetch()`. The DO detects the upgrade via the `Upgrade: websocket` header and returns a `101` response with the client WebSocket — the Worker returns it as-is.
- `commentToken` in `home.tsx` must be `useState` with a setter (not a plain `const`) so that registering for the first time activates the comment composer immediately without a page reload.
- `VITE_` vars in the frontend come from `.dev.vars` in dev (via `vite.config.ts` `define`) — NOT from a separate `.env.local`. Do not create `.env.local` for frontend vars; keep everything in `.dev.vars`.
- Turnstile token (`cf-turnstile-response`) is appended to `FormData` client-side and verified server-side via `https://challenges.cloudflare.com/turnstile/v0/siteverify`. If `TURNSTILE_SECRET_KEY` is absent in the backend env, verification is skipped (backward-compatible). Use Cloudflare test keys in `.dev.vars` during development.
