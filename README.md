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
│   │   │   ├── home.tsx            # Página de waitlist (SPA con hidratación)
│   │   │   └── stats.tsx           # Datos de geolocalización (SSR puro)
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
    │   ├── middleware/
    │   │   └── auth.ts             # JWT middleware + requireScope
    │   ├── routes/
    │   │   ├── auth.ts             # POST /auth/token
    │   │   └── waitlist.ts         # POST /waitlist, GET /waitlist, GET /waitlist/:email
    │   └── services/
    │       └── waitlist.ts         # Capa de datos (mock → listo para D1)
    ├── tsconfig.json
    ├── wrangler.jsonc              # name: waitly-api
    └── .dev.vars.example
```

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

| Variable       | Descripción                                         | Ejemplo local           |
|----------------|-----------------------------------------------------|-------------------------|
| `CORS_ORIGIN`  | Origen permitido para CORS                          | `*`                     |
| `JWT_SECRET`   | Clave para firmar y verificar JWTs                  | `dev-jwt-secret`        |
| `ADMIN_SECRET` | Clave para obtener tokens desde `/auth/token`       | `dev-admin-secret`      |

### Frontend (`frontend/.dev.vars`)

| Variable       | Descripción                        | Ejemplo local               |
|----------------|------------------------------------|-----------------------------|
| `VITE_API_URL` | URL del backend                    | `http://localhost:8787`     |

---

## Build y despliegue

### 1. Configurar secrets en producción (primera vez)

Antes del primer deploy, configura los secrets en Cloudflare:

```bash
cd backend

npx wrangler secret put CORS_ORIGIN
# Introduce: https://waitly-frontend.<tu-subdominio>.workers.dev

npx wrangler secret put JWT_SECRET
# Introduce: un valor seguro generado con openssl rand -base64 32

npx wrangler secret put ADMIN_SECRET
# Introduce: un valor seguro generado con openssl rand -base64 32
```

> Los secrets se guardan cifrados en Cloudflare y persisten entre deploys.
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

| Método | Ruta                  | Auth requerida      | Descripción                        |
|--------|-----------------------|---------------------|------------------------------------|
| GET    | `/health`             | No                  | Estado del Worker                  |
| POST   | `/waitlist`           | No                  | Registrar email en la lista        |
| GET    | `/waitlist`           | JWT `read:all`      | Listar todos los registros         |
| GET    | `/waitlist/:email`    | JWT `read:self`     | Consultar un registro por email    |
| POST   | `/auth/token`         | `ADMIN_SECRET`      | Emitir JWT con scope               |
| GET    | `/swagger`            | No                  | Documentación OpenAPI              |

---

## Agregar D1 (base de datos)

La capa de persistencia está abstraída en `backend/src/services/waitlist.ts`.
Para conectar una base de datos D1:

1. Crear la base de datos:
   ```bash
   npx wrangler d1 create waitly-db
   ```

2. Descomentar el binding en `backend/wrangler.jsonc` con el ID generado.

3. Reemplazar el mock en `waitlist.ts` con las queries reales a `env.DB`.
