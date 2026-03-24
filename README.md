# Waitly

Monorepo de la aplicación de lista de espera construida con **Cloudflare Workers**, **Hono** y **React + Vite**.

> Proyecto del curso de **Cloudflare Workers** en Platzi.

---

## Estructura

```
waitly/
├── .nvmrc                     # Node.js 22
├── package.json               # Scripts raíz
├── frontend/                  # Vite + React + TypeScript
│   ├── src/
│   │   ├── App.tsx            # Página de waitlist
│   │   ├── App.module.css     # Estilos (CSS Modules)
│   │   ├── main.tsx
│   │   └── index.css          # Variables CSS globales
│   ├── worker/
│   │   └── index.ts           # Worker mínimo (sirve assets como SPA)
│   ├── index.html
│   ├── vite.config.ts
│   ├── wrangler.jsonc          # name: waitly-frontend
│   └── tsconfig.json/app/node/worker
└── backend/                   # Cloudflare Worker con Hono
    ├── src/
    │   ├── index.ts            # Endpoints: GET /health, POST /waitlist
    │   └── services/
    │       └── waitlist.ts     # Capa de persistencia (mock → listo para D1)
    ├── tsconfig.json
    └── wrangler.jsonc          # name: waitly-api
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
nvm use   # o: fnm use

# 2. Instalar dependencias de ambos proyectos
npm run install:all
```

---

## Desarrollo local

```bash
# Frontend + backend en paralelo (desde la raíz)
npm run dev

# Solo frontend  →  http://localhost:5173
npm run dev:frontend

# Solo backend   →  http://localhost:8787
npm run dev:backend
```

La URL del backend se configura con la variable de entorno `VITE_API_URL`.
Por defecto apunta a `http://localhost:8787`.

---

## Build y despliegue

### Frontend

```bash
cd frontend

# Compilar (TypeScript + Vite)
npm run build

# Desplegar assets a Cloudflare Workers
npx wrangler deploy
```

### Backend

```bash
cd backend

# Desplegar worker a Cloudflare
npx wrangler deploy
```

> Wrangler bundlea el worker automáticamente al hacer `deploy` o `dev`.
> No hay un paso de build separado para el backend.

---

## API

### `GET /health`

Verifica que el worker está activo.

**Respuesta:**
```json
{ "status": "ok", "timestamp": "2026-03-24T00:00:00.000Z" }
```

### `POST /waitlist`

Agrega un email a la lista de espera.

**Body:**
```json
{ "email": "tu@email.com" }
```

**Respuesta exitosa `201`:**
```json
{
  "success": true,
  "message": "¡Te agregamos a la lista de espera!",
  "entry": { "email": "tu@email.com", "joinedAt": "2026-03-24T00:00:00.000Z" }
}
```

**Errores `400`:**
```json
{ "error": "El campo email es requerido" }
{ "error": "El formato del email no es válido" }
```

---

## Agregar D1 (base de datos)

La capa de persistencia está abstraída en `backend/src/services/waitlist.ts`.
Para conectar una base de datos D1:

1. Crear la base de datos:
   ```bash
   npx wrangler d1 create waitly-db
   ```

2. Descomentar el binding en `backend/wrangler.jsonc`:
   ```jsonc
   "d1_databases": [
     {
       "binding": "DB",
       "database_name": "waitly-db",
       "database_id": "<tu-database-id>"
     }
   ]
   ```

3. Reemplazar el mock en `waitlist.ts` con la query real:
   ```ts
   await env.DB.prepare(
     'INSERT INTO waitlist (email, joined_at) VALUES (?, ?)'
   ).bind(email, new Date().toISOString()).run()
   ```
