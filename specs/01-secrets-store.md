# Spec 01 — Cloudflare Secrets Store

## Objetivo

Configurar Cloudflare Secrets Store para compartir un secreto entre múltiples Workers del proyecto, e integrarlo con el flujo de registro de la waitlist.

## Secreto a usar

**`RESEND_API_KEY`** — clave de la API de Resend para envío de emails transaccionales.

Es el candidato ideal para Secrets Store porque es una clave de servicio externo que pueden necesitar tanto `waitly-api` como cualquier otro Worker que se añada (notificaciones, cron jobs, etc.), y no varía por ambiente del Worker en sí.

## Funcionalidad

Al completarse `POST /waitlist`, enviar un email de bienvenida al estudiante usando Resend. La llamada a Resend debe hacerse dentro de `ctx.waitUntil()` ya que no bloquea la respuesta. El email incluye confirmación de registro y datos del curso.

> **Límite**: `waitUntil` tiene un máximo de 30 segundos. La llamada a Resend debe completarse en ese tiempo, lo cual es razonable para un email transaccional.

## Archivos a crear / modificar

- `backend/wrangler.jsonc` — binding del Secrets Store
- `backend/src/services/email.ts` — nuevo, encapsula la llamada a Resend
- `backend/src/routes/waitlist.ts` — llamar a `EmailService.sendWelcome()` en `ctx.waitUntil()`
- `backend/worker-configuration.d.ts` — regenerar con `wrangler types`

## Conceptos destacados

- Secrets Store vs `wrangler secret put`: Store es compartido entre Workers, `secret put` es por Worker
- `ctx.waitUntil()` para trabajo post-respuesta, con límite de 30s
- El secreto nunca aparece en el bundle ni en el código fuente

## TODO producción

- **Destinatario hardcodeado**: mientras no haya dominio verificado, `email.ts` envía siempre a `curso.cloudflare.workers@gmail.com` en lugar del email real del estudiante.
- **Verificar dominio en Resend** ([resend.com/domains](https://resend.com/domains)) para poder enviar a cualquier destinatario y cambiar el `from` a un dominio propio.
- Una vez verificado: reemplazar el destinatario fijo por el email del estudiante recibido en el request.

## Referencias

- [Resend + Cloudflare Workers](https://resend.com/docs/send-with-cloudflare-workers)
