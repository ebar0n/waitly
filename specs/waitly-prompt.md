Crea un proyecto monorepo llamado **Waitly** con la siguiente estructura y requisitos:

## Estructura del proyecto

```
waitly/
├── frontend/     # Vite + React (basado en la config de example-1)
└── backend/      # Hono worker
```

## Backend (`backend/`)

- Worker de Cloudflare con **Hono**
- Endpoint `POST /waitlist` que recibe `{ email: string }` y lo valida
- La lógica de persistencia debe estar abstraída en un módulo/servicio separado (preparado para conectar a D1 u otra DB en el futuro — por ahora puede retornar un mock exitoso)
- Endpoint `GET /health` para verificar que el worker funciona
- CORS en un midleware configurado para permitir llamadas desde el frontend
- `wrangler.jsonc` con nombre `waitly-api`

## Frontend (`frontend/`)

- **Vite + React + TypeScript**, reutilizando la configuración de `example-1` (tsconfig, eslint, vite.config.ts, wrangler.jsonc)
- Página única de waitlist con:
  - Branding: nombre **Waitly** y subtítulo orientado al curso de Cloudflare Workers de Platzi
  - Formulario con campo de email y botón de envío
  - Estados visuales: idle, loading, éxito y error
  - Llamada al endpoint del backend con fetch
- Diseño moderno y minimalista (puedes usar Tailwind o CSS modules)
- `wrangler.jsonc` configurado para servir el frontend como Worker estático

## Requisitos generales

- Cada carpeta tiene su propio `package.json` y `wrangler.jsonc`
- `package.json` raíz con scripts `dev:frontend`, `dev:backend` y `dev` (ambos en paralelo)
- TypeScript en ambos proyectos
- Sin base de datos real aún — el backend debe estar estructurado para agregar D1 fácilmente después