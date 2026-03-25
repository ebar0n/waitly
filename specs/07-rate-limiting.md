# Spec 07 — Rate Limiting

## Objetivo

Implementar dos niveles de rate limiting: protección de infraestructura por IP y límite de negocio por estudiante usando la Workers Rate Limiting API.

## Nivel 1 — Infraestructura (por IP)

Binding en `wrangler.jsonc` con `simple: { limit: 20, period: 60 }`. Se evalúa antes de ejecutar cualquier lógica de negocio. Retorna 429 si se supera.

Se aplica como middleware global en el router del backend — cubre todos los endpoints públicos escribibles:

- `POST /waitlist`
- `POST /comments`
- `POST /comments/:id/vote`

## Nivel 2 — Negocio (por estudiante)

Binding separado con `simple: { limit: 3, period: 86400 }` (3 comentarios por estudiante cada 24 horas).

La key del rate limiter es el **email extraído del JWT** — consistente con el flujo del spec 05 donde el email nunca viene del body:

```ts
const { email } = c.get('jwtPayload')
const { success } = await env.COMMENT_RATE_LIMITER.limit({ key: email })
if (!success) return c.json({ error: 'Límite de comentarios alcanzado' }, 429)
```

Se aplica como middleware en `POST /comments` — antes del handler, después de `jwtAuth`.

> Votar (`POST /comments/:id/vote`) no está limitado por este binding — el DO ya previene votos duplicados del mismo email por comentario.

## Headers de respuesta

Añadir headers estándar en las respuestas de `POST /comments`:

```
X-RateLimit-Limit: 3
X-RateLimit-Remaining: <n>
Retry-After: <segundos>   # solo en 429
```

> La Workers Rate Limiting API no expone el contador actual. Para calcular `X-RateLimit-Remaining`, consultar D1: `SELECT COUNT(*) FROM comments WHERE email = ? AND created_at > <hace 24h>`.
>
> El email se obtiene del JWT — nunca del body.

## Archivos a crear / modificar

- `backend/wrangler.jsonc` — añadir dos bindings `rate_limiting`: `IP_RATE_LIMITER` (por IP) y `COMMENT_RATE_LIMITER` (por estudiante)
- `backend/src/middleware/rate-limit.ts` — dos middlewares: `ipRateLimit` y `commentRateLimit`
- `backend/src/routes/comments.ts` — aplicar `commentRateLimit` en `POST /comments`; calcular `X-RateLimit-Remaining` desde D1
- `backend/src/index.ts` — aplicar `ipRateLimit` globalmente
- `backend/worker-configuration.d.ts` — regenerar (`cd backend && npm run cf-typegen`)

## Conceptos destacados

- Rate limiting de infraestructura (por IP) vs de negocio (por entidad de usuario via JWT)
- Extraer la key del JWT en lugar del body evita spoofing — el cliente no puede falsificar el email
- La Workers Rate Limiting API usa contadores distribuidos globalmente — sin servidor central, sin estado local
- El período es una ventana fija, no deslizante
- HTTP 429 + `Retry-After` es el contrato estándar para rate limit superado
- Votar no necesita rate limiting de negocio — el DO lo gestiona a nivel de datos (PRIMARY KEY en tabla `votes`)

## Al finalizar

Actualizar `CLAUDE.md` y `README.md` para reflejar:
- Bindings `IP_RATE_LIMITER` y `COMMENT_RATE_LIMITER` en el backend
- Dos niveles de rate limiting: por IP (global) y por estudiante via JWT (comentarios)
- Middleware `ipRateLimit` aplicado globalmente y `commentRateLimit` en `POST /comments`
- Header `X-RateLimit-Remaining` calculado desde D1
