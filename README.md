# Waitly

Monorepo de la aplicación de lista de espera construida con **Cloudflare Workers**, **Hono** y **React Router v7**.

> Proyecto del curso de **Cloudflare Workers** en Platzi.

---

## Estructura

```
waitly/
├── .nvmrc                          # Node.js 22
├── package.json                    # Scripts raíz
├── frontend/                       # React Router v7 SSR + Cloudflare Workers
│   ├── app/
│   │   ├── routes/
│   │   │   ├── home.tsx            # Waitlist + tablero de comentarios (cliente)
│   │   │   ├── stats.tsx           # Datos de geolocalización (SSR puro)
│   │   │   └── landing.tsx         # Landing A/B testing con KV (SSR)
│   │   ├── entry.server.tsx        # Render en Worker (renderToReadableStream)
│   │   └── root.tsx
│   ├── worker/
│   │   └── app.ts                  # Worker SSR — pasa request.cf al loader
│   ├── react-router.config.ts
│   ├── vite.config.ts
│   ├── wrangler.jsonc              # name: waitly-frontend
│   ├── .dev.vars.example
│   └── tsconfig.app/node/worker.json
└── backend/                        # Cloudflare Worker con Hono + OpenAPI
    ├── src/
    │   ├── index.ts                # App principal + Swagger UI en /swagger
    │   ├── durable-objects/
    │   │   └── comment-board.ts    # DO CommentBoard — SQLite, RPC, Hibernation WS
    │   ├── middleware/
    │   │   └── auth.ts             # JWT middleware + requireScope
    │   ├── routes/
    │   │   ├── auth.ts             # POST /auth/token
    │   │   ├── waitlist.ts         # POST /waitlist, GET /waitlist, GET /waitlist/:email
    │   │   └── comments.ts         # GET|POST /comments, POST /comments/:id/vote, WS
    │   └── services/
    │       ├── waitlist.ts         # Capa de datos — D1 (INSERT / SELECT)
    │       └── email.ts            # Envío de email de bienvenida via Resend
    ├── tsconfig.json
    ├── wrangler.jsonc              # name: waitly-api
    └── .dev.vars.example
```

---

## Claude Code — MCP y Skills de Cloudflare

Para obtener acceso a documentación, bindings, observability y builds de Cloudflare directamente desde Claude Code, instala el MCP oficial:

```bash
claude mcp add --transport http cloudflare https://observability.mcp.cloudflare.com/sse
```

También puedes instalar los skills de Cloudflare que añaden conocimiento especializado sobre Workers, D1, KV, R2 y más:

```bash
claude plugin install cloudflare
```

Documentación completa: https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/

---

## Requisitos

- [Node.js 22](https://nodejs.org/) (ver `.nvmrc`)
- [nvm](https://github.com/nvm-sh/nvm) o [fnm](https://github.com/Schniz/fnm)
- Cuenta de [Cloudflare](https://cloudflare.com) para despliegue

---

## Configuración inicial

```bash
# 1. Activar la versión de Node correcta
nvm use

# 2. Instalar dependencias de ambos proyectos
npm run install:all

# 3. Configurar variables de entorno locales
cp backend/.dev.vars.example backend/.dev.vars
cp frontend/.dev.vars.example frontend/.dev.vars
# Edita los archivos con tus valores
```

---

## Desarrollo local

```bash
# Frontend + backend en paralelo (desde la raíz)
npm run dev

# Solo frontend  →  http://localhost:5173
npm run dev:frontend

# Solo backend   →  http://localhost:8787  (Swagger UI en /)
npm run dev:backend
```

---

## Variables de entorno

### Backend (`backend/.dev.vars`)

| Variable         | Descripción                                         | Ejemplo local           |
|------------------|-----------------------------------------------------|-------------------------|
| `CORS_ORIGIN`    | Origen permitido para CORS                          | `*`                     |
| `JWT_SECRET`     | Clave para firmar y verificar JWTs                  | `dev-jwt-secret`        |
| `ADMIN_SECRET`   | Clave para obtener tokens desde `/auth/token`       | `dev-admin-secret`      |
| `RESEND_API_KEY` | API key de Resend (dev local — en prod usa Secrets Store) | `re_...`          |

### Frontend (`frontend/.dev.vars`)

| Variable       | Descripción                        | Ejemplo local               |
|----------------|------------------------------------|-----------------------------|
| `VITE_API_URL` | URL del backend                    | `http://localhost:8787`     |

---

## Build y despliegue

### 1. Configurar secrets en producción (primera vez)

Antes del primer deploy, configura los secrets por Worker:

```bash
cd backend

npx wrangler secret put CORS_ORIGIN
# Introduce: https://waitly-frontend.<tu-subdominio>.workers.dev

npx wrangler secret put JWT_SECRET
# Introduce: un valor seguro generado con openssl rand -base64 32

npx wrangler secret put ADMIN_SECRET
# Introduce: un valor seguro generado con openssl rand -base64 32
```

`RESEND_API_KEY` se gestiona en el **Cloudflare Secrets Store** (compartido entre Workers) y ya está configurado. Para actualizarlo:

```bash
# Listar stores disponibles
npx wrangler secrets-store store list --remote

# Actualizar el secreto en el store
npx wrangler secrets-store secret put <STORE_ID> RESEND_API_KEY --remote
```

> Los secrets de Worker se guardan cifrados y persisten entre deploys.
> `wrangler deploy` falla si alguno de los secrets requeridos no está configurado.

### 2. Deploy del backend

```bash
cd backend
npx wrangler deploy
```

### 3. Deploy del frontend

```bash
cd frontend
npm run build
npx wrangler deploy
```

---

## API

La documentación interactiva está disponible en el Worker desplegado en `/swagger`.

### Autenticación

```bash
# Obtener un token con scope read:all
curl -X POST http://localhost:8787/auth/token \
  -H "Content-Type: application/json" \
  -d '{ "secret": "dev-admin-secret", "scope": "read:all" }'
```

### Endpoints principales

| Método | Ruta                          | Auth requerida      | Descripción                                              |
|--------|-------------------------------|---------------------|----------------------------------------------------------|
| GET    | `/health`                     | No                  | Estado del Worker                                        |
| POST   | `/waitlist`                   | No                  | Registrar email; devuelve `commentToken` en la respuesta |
| GET    | `/waitlist`                   | JWT `read:all`      | Listar todos los registros                               |
| GET    | `/waitlist/:email`            | JWT `read:self`     | Consultar un registro por email                          |
| POST   | `/auth/token`                 | `ADMIN_SECRET`      | Emitir JWT con scope                                     |
| GET    | `/swagger`                    | No                  | Documentación OpenAPI                                    |
| GET    | `/comments?course=X`          | No                  | Listar comentarios del curso X                           |
| POST   | `/comments?course=X`          | JWT `comment`       | Publicar comentario en el curso X                        |
| POST   | `/comments/:id/vote?course=X` | JWT `comment`       | Toggle +1 en el comentario `:id` del curso X             |
| GET    | `/comments/ws?course=X`       | No                  | WebSocket — actualizaciones en tiempo real del curso X   |

---

## Bindings de Cloudflare

### D1 — Base de datos (`waitly-db`)

El backend usa D1 para persistir registros. Las migraciones están en `backend/migrations/`.

```bash
# Aplicar migraciones en producción
cd backend
npx wrangler d1 migrations apply waitly-db --remote

# Aplicar migraciones en local
npx wrangler d1 migrations apply waitly-db --local
```

### KV — A/B Testing (`AB_CONFIG`)

El frontend usa KV para la landing con experimento A/B. La key `ab:config` almacena la configuración de variantes; `variant:<email>` registra qué variante vio cada usuario.

```bash
# Sembrar la config en producción
cd frontend
npx wrangler kv key put --remote --namespace-id=e19adee3c5904afa84672409a89e573e "ab:config" \
  '{"variant_a":{"badge":"Acceso Anticipado","headline":"Domina Cloudflare Workers desde cero","cta":"Reservar mi lugar"},"variant_b":{"badge":"Cupos Limitados","headline":"Construye apps serverless de producción hoy","cta":"Quiero aprender ahora"}}'

# Sembrar la config en local
npx wrangler kv key put --local --namespace-id=e19adee3c5904afa84672409a89e573e "ab:config" \
  '{"variant_a":{"badge":"Acceso Anticipado","headline":"Domina Cloudflare Workers desde cero","cta":"Reservar mi lugar"},"variant_b":{"badge":"Cupos Limitados","headline":"Construye apps serverless de producción hoy","cta":"Quiero aprender ahora"}}'
```

### R2 — Avatares (`UPLOADS_BUCKET`)

El backend almacena fotos de perfil en R2. El binding `UPLOADS_BUCKET` usa `remote = true` para conectar al bucket real durante `wrangler dev`.

```bash
# Crear el bucket (requiere R2 habilitado en el Dashboard de Cloudflare)
cd backend
npx wrangler r2 bucket create waitly-uploads

# Aplicar la migración que añade avatar_uuid
npx wrangler d1 migrations apply waitly-db --remote
```

- Key en R2: `avatars/<uuid>.<ext>` (sin nombre de archivo, solo extensión)
- El UUID se genera una vez por email y persiste en D1 (`avatar_uuid`)
- Re-registrarse con un nuevo avatar sobreescribe el mismo objeto en R2
- Tipos permitidos: `image/jpeg`, `image/png`, `image/webp` — máximo 5MB

### Durable Objects — Tablero de comentarios (`COMMENT_BOARD`)

El backend usa un Durable Object por cada valor de `?course=X`. Cada instancia mantiene su propio SQLite con los comentarios y votos del curso, y gestiona todas las conexiones WebSocket en tiempo real.

```bash
# El binding y la migración se declaran en backend/wrangler.jsonc
# No requiere creación manual — Wrangler crea las instancias bajo demanda
```

**Cómo funciona el multi-tenancy**:

```
?course=course-2026  →  idFromName('course-2026')  →  DO instancia A  (su propio SQLite)
?course=bootcamp-q1  →  idFromName('bootcamp-q1')  →  DO instancia B  (su propio SQLite)
```

Cambiar el parámetro `?course=` en la URL es suficiente para suscribirse a un tablero completamente distinto — sin tocar código.

**JWT `comment`**: al registrarse en `POST /waitlist`, la respuesta incluye `commentToken` con `{ email, scope: 'comment', exp: +30 días }`. El frontend lo guarda en `localStorage` y lo usa en las peticiones protegidas. El backend extrae el `email` del token para asociar el comentario al usuario sin que el cliente envíe datos extra.

### Service Binding — `BACKEND`

El frontend usa un service binding para llamar al backend Worker-to-Worker en producción (sin latencia de red):

```jsonc
// frontend/wrangler.jsonc
"services": [{ "binding": "BACKEND", "service": "waitly-api" }]
```

Detección de entorno en acciones SSR:
- `VITE_API_URL` definida (local dev) → `fetch(apiUrl + '/waitlist', { body: formData })`
- `VITE_API_URL` ausente (producción) → `env.BACKEND.fetch(new Request('http://waitly-api/waitlist', { body: formData }))`
