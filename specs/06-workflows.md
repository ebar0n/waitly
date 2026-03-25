# Spec 06 — Workflows: Onboarding de estudiantes

## Objetivo

Orquestar el proceso completo de onboarding al unirse a la waitlist usando Cloudflare Workflows, reemplazando el `ctx.waitUntil()` donde la duración excede los 30 segundos o requiera reintentos.

## Cambio en el modelo de datos (D1)

Se añade la columna `last_comment_at` a la tabla `waitlist`:

```sql
ALTER TABLE waitlist ADD COLUMN last_comment_at TEXT;  -- null hasta que el estudiante publique su primer comentario
```

> Esta columna se actualiza **únicamente al añadir un comentario** (spec 05 — `POST /comments`). Votar no la modifica.

(**Solo crear la migración `0003_add_last_comment.sql` — no ejecutar, se aplica manualmente**)

## Parámetro de entrada

El workflow recibe un único parámetro tipado:

```ts
interface OnboardingParams {
  email: string
}
```

Se lanza desde `POST /waitlist` pasando el email registrado:

```ts
await env.ONBOARDING_WORKFLOW.create({
  id: email,          // usar el email como instance ID garantiza una sola instancia por estudiante
  params: { email },
})
```

> Usar `email` como `id` de instancia previene lanzar workflows duplicados si el email ya existe — Cloudflare rechaza crear una instancia con un ID ya en uso.

## Proceso del Workflow

El workflow recibe `{ email }` y lo usa en cada step para consultar D1 y enviar emails.

Cada operación visible al exterior (enviar email, consultar D1) va dentro de `step.do()` para que sea idempotente y reintentable. Los `step.sleep()` van entre steps.

```
step.do('send-welcome')        → enviar email de bienvenida via this.env
step.sleep('wait-30m', '30 minutes')

step.do('check-activity-1')   → consultar last_comment_at en D1 via this.env.DB
  └─ si tiene valor → return (finalizar)
step.do('send-followup-1')    → enviar email de seguimiento  [solo si llegó aquí]
step.sleep('wait-24h', '24 hours')

step.do('check-activity-2')   → consultar last_comment_at en D1
  └─ si tiene valor → return (finalizar)
step.do('send-followup-2')    → enviar email de seguimiento
step.sleep('wait-7d', '7 days')

step.do('check-activity-3')   → consultar last_comment_at en D1
  └─ si tiene valor → return (finalizar)
step.do('send-followup-3')    → enviar email de seguimiento final
                                finalizar (ciclo completo)
```

> El workflow accede a D1 y al servicio de email via `this.env` — los bindings están disponibles igual que en un Worker normal.

## Emails

- **Bienvenida** (step 1): confirmación de registro, intro al curso, enlace a la landing con el tablero de comentarios
- **Seguimiento** (steps 2, 3, 4): recordatorio de que el tablero está activo, invitación a dejar su primer comentario

## Integración con spec 05

Cuando el backend procesa `POST /comments` (spec 05), además de llamar al DO via RPC, actualiza `last_comment_at` en D1 usando `ctx.waitUntil()` para no bloquear la respuesta:

```ts
c.executionCtx.waitUntil(
  db.prepare('UPDATE waitlist SET last_comment_at = ? WHERE email = ?')
    .bind(new Date().toISOString(), email)
    .run()
)
```

El email se extrae del JWT — consistente con el flujo del spec 05.

## Idempotencia

Cada `step.do()` puede ejecutarse más de una vez ante un reintento. Usar el email como idempotency key en Resend para no enviar duplicados.

## Archivos a crear / modificar

- `backend/migrations/0003_add_last_comment.sql` — `ALTER TABLE waitlist ADD COLUMN last_comment_at TEXT` (**solo crear — aplicar manualmente**)
- `backend/wrangler.jsonc` — añadir binding `workflows` y declarar `OnboardingWorkflow`
- `backend/src/workflows/onboarding.ts` — nuevo, `OnboardingWorkflow extends WorkflowEntrypoint` con los 4 steps
- `backend/src/services/email.ts` — añadir `sendFollowUp(email)`
- `backend/src/routes/waitlist.ts` — lanzar workflow tras el registro en lugar de `waitUntil`; si el email ya existía en D1, no lanzar workflow (el `id: email` lo previene, pero conviene verificar antes para evitar el error de instancia duplicada)
- `backend/src/routes/comments.ts` — actualizar `last_comment_at` en D1 al crear un comentario
- `backend/worker-configuration.d.ts` — regenerar (`cd backend && npm run cf-typegen`)

## Conceptos destacados

- La razón de usar Workflows es `step.sleep()` — imposible con `waitUntil` (límite 30s en CPU, no en tiempo de reloj)
- `step.do()` envuelve cada operación externa — ante reinicios, el workflow retoma desde el último `step.do()` completado, no desde el principio
- Los bindings (`this.env.DB`, `this.env`) están disponibles en el workflow igual que en un Worker — no hace falta pasarlos como parámetro
- El workflow persiste su estado entre hibernaciones — puede dormir 7 días y retomar exactamente donde lo dejó
- `last_comment_at` como señal de actividad: simple, sin ambigüedad, consultable desde D1 sin pasar por el DO
- Votar no cuenta como actividad — la intención es que el estudiante exprese algo, no solo interactúe
- Workflows vs `waitUntil`: `waitUntil` es fire-and-forget sin estado; Workflows tienen estado, reintentos y sleeps de días
- Workflows vs Queues: Workflows para procesos multi-step orquestados por instancia; Queues para fan-out masivo

## Al finalizar

Actualizar `CLAUDE.md` y `README.md` para reflejar:
- Workflow `OnboardingWorkflow` y su binding en el backend
- Parámetro de entrada `{ email }` e `id: email` como instance ID
- Ciclo de onboarding: bienvenida → 30min → 24h → 7d → fin
- Columna `last_comment_at` en D1 como señal de actividad (migración `0003_add_last_comment.sql`, aplicar manualmente)
- `POST /comments` actualiza `last_comment_at` via `waitUntil`
