# Spec 04 — R2: Uploads de avatar vía Worker binding

## Objetivo

Permitir que los estudiantes adjunten una foto de perfil al registrarse. El archivo pasa por el Worker de API usando el binding de R2 directamente (`env.UPLOADS_BUCKET.put()`).

## Flujo

1. Browser → frontend Worker (`home.tsx` o `landing.tsx`) con `multipart/form-data` (`email`, `file` opcional)
2. Frontend Worker reenvía la petición al backend Worker:
   - **En runtime de Workers**: usa el service binding `env.BACKEND` (sin red, Worker-to-Worker)
   - **En local (`wrangler dev`)**: `env.BACKEND` no está disponible; detectar con `typeof env.BACKEND !== 'undefined'` y hacer `fetch('http://localhost:8787/waitlist', ...)` como fallback
3. Backend Worker busca en D1 si el email ya existe:
   - **Nuevo**: genera un UUID, lo guarda en D1 como `avatar_uuid`, sube el avatar a R2 con key `avatars/<uuid>`
   - **Existente**: reutiliza el `avatar_uuid` de D1, sobreescribe el objeto en R2 con el mismo key
4. Backend Worker escribe en R2: `env.UPLOADS_BUCKET.put('avatars/<uuid>', file.stream(), { httpMetadata: { contentType } })`
5. Backend Worker guarda o actualiza el registro en D1

## Restricciones a implementar

- Validar `contentType` — solo `image/jpeg`, `image/png`, `image/webp`
- El key en R2 es `avatars/<uuid>.<type>` — sin filename, solo extension
- El UUID se genera una sola vez por estudiante y persiste en D1 (`avatar_uuid TEXT`), usa `crypto.randomUUID()` para generarlo
- Limitar tamaño a 5MB antes de hacer el `put`

## Desarrollo local

El binding `UPLOADS_BUCKET` se configura con `remote = true` en `wrangler.jsonc` para que en `wrangler dev` escriba en el bucket real de R2 en lugar de una simulación local.

## Archivos a crear / modificar

- `backend/wrangler.jsonc` — binding `UPLOADS_BUCKET` (R2 bucket, `remote = true`)
- `backend/src/routes/waitlist.ts` — extender `POST /waitlist` para aceptar `multipart/form-data`
- `backend/src/services/waitlist.ts` — lógica de upsert con `avatar_uuid`
- `backend/migrations/0002_add_avatar.sql` — `ALTER TABLE waitlist ADD COLUMN avatar_uuid TEXT` (**solo crear el archivo; no ejecutar la migración — se aplica manualmente**)
- `frontend/wrangler.jsonc` — añadir service binding `BACKEND` apuntando al Worker `waitly-api`
- `frontend/app/routes/home.tsx` — input de archivo, enviar como `multipart/form-data`; delegar al backend via service binding con fallback a `fetch` local
- `frontend/app/routes/landing.tsx` — ídem: soporte de subida de avatar en el `action` SSR; misma lógica de service binding con fallback
- `backend/worker-configuration.d.ts` — regenerar (`cd backend && npm run cf-typegen`)
- `frontend/worker-configuration.d.ts` — regenerar (`cd frontend && npm run cf-typegen`)

## Service binding — configuración

En `frontend/wrangler.jsonc`:

```jsonc
"services": [
  { "binding": "BACKEND", "service": "waitly-api" }
]
```

En el `action` / handler del frontend, detectar el entorno a través de `VITE_API_URL`:

```ts
const apiUrl = import.meta.env.VITE_API_URL
const response = apiUrl
  ? await fetch(`${apiUrl}/waitlist`, { method: 'POST', body: formData })
  : await env.BACKEND.fetch(new Request('http://waitly-api/waitlist', { method: 'POST', body: formData }))
```

> En local (`wrangler dev`), `VITE_API_URL` está definida en `.dev.vars` y apunta a `http://localhost:8787` — se usa `fetch` directo. En runtime de Workers (producción), `VITE_API_URL` no existe y se usa el service binding `env.BACKEND`, que enruta la petición directamente al Worker `waitly-api` sin pasar por la red pública.

## Conceptos destacados

- `env.BUCKET.put(key, stream)` — el binding de R2 es la forma idiomática desde Workers, sin SDK de S3
- Reutilizar el mismo UUID como key permite sobreescribir en R2 sin acumular objetos huérfanos
- `remote = true` en el binding: conecta al bucket real durante `wrangler dev` en lugar de emulación local
- R2 no tiene costo de egress entre R2 y Workers (a diferencia de S3)
- Worker tiene límite de 128MB — suficiente para fotos de perfil si se limita el tamaño en el endpoint
- Service bindings son la forma correcta de comunicación Worker-to-Worker en producción — sin latencia de red, sin salir a internet
- `VITE_API_URL` actúa como señal de entorno: definida → local con fetch directo; ausente → producción con service binding
- `home.tsx` usa client-side fetch; `landing.tsx` usa server-side `action` — ambos deben manejar el service binding con fallback local

## Al finalizar

Actualizar `CLAUDE.md` y `README.md` para reflejar:
- Binding R2 `UPLOADS_BUCKET` en el backend y service binding `BACKEND` en el frontend
- Flujo de subida de avatar (multipart, UUID, key en R2)
- Lógica de detección de entorno (`VITE_API_URL`) para service binding vs fetch directo
- Nueva migración `0002_add_avatar.sql` (aplicar manualmente)
