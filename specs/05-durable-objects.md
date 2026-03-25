# Spec 05 — Durable Objects: Tablero de comentarios

## Objetivo

Crear un tablero donde los estudiantes dejan comentarios del curso. Un Durable Object actúa como servidor de estado con SQLite embebido, expone métodos RPC para las operaciones de datos y WebSocket para actualizaciones en tiempo real.

> **Decisión educativa**: el curso al que te conectas se pasa como query param (`?course=course-2026`). Cada valor de `course` resuelve a un DO distinto via `idFromName(course)` — así demostramos en vivo cómo escalar a N instancias independientes sin cambiar código: cambias el parámetro en la URL y te suscribes a un tablero completamente diferente.

## Modelo de datos

```ts
interface Comment {
  id: string
  avatarUrl: string | null  // null si el estudiante no subió avatar (spec 04 es opcional)
  text: string              // max 280 caracteres
  votes: number             // total de votos positivos acumulados
  createdAt: string         // ISO 8601
}
```

## Token JWT de comentarios

Al completar el registro en `POST /waitlist`, el backend emite un JWT adicional con scope `comment` firmado con el mismo `JWT_SECRET`:

```json
{ "email": "...", "scope": "comment", "exp": <30 días> }
```

El token se devuelve en la respuesta de `POST /waitlist` (`commentToken`). El frontend persiste únicamente el `commentToken` en `localStorage`. Al crear un comentario, el backend extrae el `email` del payload del JWT, consulta D1 para obtener el `avatar_uuid` y construye el `avatarUrl` — el frontend no envía ni almacena ningún dato extra. Todos los endpoints protegidos de comentarios validan este token via el middleware `jwtAuth` con `requireScope('comment')`.

## Sistema de votos

- Cada usuario registrado puede dar **+1** a un comentario; es un contador simple pero un mismo email no puede repetir votos por un mismo comentario.
- El conteo `votes` es el total de votos positivos activos en ese momento.
- Votar requiere JWT con scope `comment`.
- El frontend muestra únicamente el contador numérico de votos — no hay indicador de "ya voté". Si el usuario recarga la página, el número persiste (está en el DO) pero el estado local se resetea. Esto es intencional para esta iteración.

## Almacenamiento en el Durable Object (SQLite)

El DO usa `this.ctx.storage.sql` (SQLite embebido). Esquema:

```sql
CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  avatar_url TEXT,
  text       TEXT NOT NULL,
  votes      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_votes      ON comments (votes DESC);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments (created_at DESC);

CREATE TABLE IF NOT EXISTS votes (
  comment_id TEXT NOT NULL,
  email      TEXT NOT NULL,
  PRIMARY KEY (comment_id, email)
);
```

> `votes` y `created_at` están indexados porque el listado se ordena primero por `votes DESC` y luego por `created_at DESC`.

## Arquitectura

El `course` llega como query param desde el frontend (`?course=course-2026`). El backend valida y sanitiza el valor antes de usarlo, luego resuelve el DO con `idFromName(course)`. El DO no está expuesto directamente al browser.

```
Browser ──GET /comments?course=X──▶ backend Worker ──stub.fetch()──▶ CommentBoard DO (instancia X)
Browser ──WS  /comments/ws?course=X─▶ backend Worker ──stub.fetch()──▶ CommentBoard DO (instancia X)
Browser ──POST /comments?course=X──▶ backend Worker ──stub.addComment() RPC──▶ CommentBoard DO
Browser ──POST /comments/:id/vote──▶ backend Worker ──stub.toggleVote() RPC──▶ CommentBoard DO
```

El DO tiene **dos patrones de acceso según la operación**:

- **`stub.fetch(request)`** — para `GET /comments` (lista pública) y el upgrade de WebSocket. El DO maneja la petición HTTP internamente y devuelve una `Response`. Es el único caso donde se usa fetch al DO.
- **RPC (métodos públicos)** — para operaciones de escritura (`addComment`, `toggleVote`). Tipado, sin overhead de serialización HTTP, sin rutas internas que mantener.

## Validación del parámetro `course`

Antes de pasarlo a `idFromName`, el backend valida el query param:

- Longitud máxima: 32 caracteres
- Solo caracteres alfanuméricos, guiones y guiones bajos (`/^[a-z0-9_-]+$/i`)
- Si no viene o no es válido, se usa `'course-2026'` como default

```ts
const raw = c.req.query('course') ?? 'course-2026'
const course = /^[a-z0-9_-]{1,32}$/i.test(raw) ? raw : 'course-2026'
const stub = env.COMMENT_BOARD.get(env.COMMENT_BOARD.idFromName(course))
```

## RPC — operaciones de escritura

```ts
// En el DO
export class CommentBoard extends DurableObject {
  async addComment(email: string, avatarUrl: string | null, text: string): Promise<Comment> { ... }
  // avatarUrl lo resuelve el backend Worker desde D1 antes de llamar al RPC
  async castVote(commentId: string, email: string): Promise<number> { ... }
}

// En el backend Worker
await stub.addComment(email, avatarUrl, text)
await stub.castVote(commentId, email)
```

## Inicialización del esquema SQL

El esquema se crea en el **constructor** del DO con `CREATE TABLE IF NOT EXISTS`, garantizando que existe antes de cualquier operación:

```ts
export class CommentBoard extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS comments ( ... );
      CREATE INDEX IF NOT EXISTS ...;
      CREATE TABLE IF NOT EXISTS votes ( ... );
    `)
  }
}
```

## Endpoints del backend (públicos / protegidos)

| Método | Ruta                   | Auth                | Descripción                                                   |
|--------|------------------------|---------------------|---------------------------------------------------------------|
| GET    | `/comments?course=X`          | No                  | Lista comentarios del curso X — primera carga (pública)   |
| POST   | `/comments?course=X`          | JWT `comment`       | Crea comentario; extrae `email` del JWT, resuelve `avatarUrl` desde D1             |
| POST   | `/comments/:id/vote?course=X` | JWT `comment`       | Toggle voto en curso X                                    |
| GET    | `/comments/ws?course=X`       | No (público)        | Upgrade a WebSocket — relay al DO de curso X              |

> `GET /comments` y `GET /comments/ws` son **públicos** — cualquier visitante puede leer y recibir actualizaciones en tiempo real sin haberse registrado. Solo crear comentarios y votar requiere JWT.

## WebSocket — tiempo real

El DO usa la **Hibernation API** (`this.ctx.acceptWebSocket(ws)`). Cuando ocurre un cambio (nuevo comentario o voto), el DO hace broadcast a todos los clientes conectados con un mensaje JSON:

```json
{ "type": "comment_added", "comment": { ...Comment } }
{ "type": "vote_updated", "commentId": "...", "votes": 42 }
```

El frontend escucha estos mensajes y actualiza el estado local sin recargar.

## WebSocket — URL en el frontend

La URL del WebSocket se deriva de `VITE_API_URL` cambiando el protocolo, e incluye el `course` actual. No requiere token:

```ts
const wsUrl = import.meta.env.VITE_API_URL.replace(/^http/, 'ws') + `/comments/ws?course=${course}`
```

> `VITE_API_URL=http://localhost:8787` → `ws://localhost:8787/comments/ws?course=course-2026`
> `VITE_API_URL=https://waitly-api.workers.dev` → `wss://waitly-api.workers.dev/comments/ws?course=course-2026`

## Frontend

Nueva sección en `home.tsx` (la ruta raíz `/`). Al ser un componente client-side con hidratación, siempre tiene acceso a `import.meta.env.VITE_API_URL`.

**Estado del curso**: el componente lee `course` de `window.location.search` (`?course=course-2026`). Si no hay query param, usa `'course-2026'` como default. El valor se muestra en un input editable: al cambiar y confirmar, se actualiza el query param en la URL (`history.pushState`), se cierra el WebSocket actual y se abre uno nuevo apuntando al nuevo DO. Esto permite cambiar de tablero en vivo sin recargar la página.

```ts
const params = new URLSearchParams(window.location.search)
const course = params.get('course') ?? 'course-2026'
```

- **Primera carga**: fetch a `GET /comments?course=${course}` al montar el componente
- **Tiempo real**: abre WebSocket con `course` en el query param; al cambiar el curso, cierra y reabre la conexión
- **Input de curso**: visible en la interfaz, permite escribir cualquier nombre de curso y confirmar con Enter o un botón; demuestra que cada valor genera un DO independiente
- **Formulario** (visible solo si hay `commentToken` en `localStorage`):
  - Textarea (max 280 caracteres)
  - Botón de envío — `POST /comments?course=${course}` con `Authorization: Bearer <commentToken>`; el body solo lleva `{ text }` — el backend resuelve todo lo demás desde el JWT y D1
- **Avatar**: si `avatarUrl` es `null`, renderizar un SVG inline de silueta genérica — sin petición de red adicional
- **Votos**: botón de +1 junto a cada comentario con el contador numérico. Click hace toggle via `POST /comments/:id/vote?course=${course}`
- Si no está registrado, mostrar solo la lista con el CTA para registrarse

## Archivos a crear / modificar

- `backend/wrangler.jsonc` — añadir `durable_objects` (clase `CommentBoard`) y `migrations` del DO
- `backend/src/durable-objects/comment-board.ts` — nuevo, clase `CommentBoard extends DurableObject` con SQLite, métodos RPC y Hibernation API para WebSocket
- `backend/src/routes/comments.ts` — nuevo router; `GET /comments` y WS usan `stub.fetch()`; escritura usa RPC (`stub.addComment()`, `stub.castVote()`)
- `backend/src/routes/waitlist.ts` — incluir `commentToken` en la respuesta de `POST /waitlist`
- `backend/src/index.ts` — montar router de comentarios
- `backend/worker-configuration.d.ts` — regenerar (`cd backend && npm run cf-typegen`)
- `frontend/app/routes/home.tsx` — sección de comentarios con fetch inicial + WebSocket client-side; `VITE_API_URL` siempre definida (Vite la inlinea en build)

## Conceptos destacados

- DO serializa los requests — sin race conditions, sin locks manuales
- **RPC es la forma idiomática** de comunicar un Worker con su DO: tipado, sin overhead de serialización HTTP, sin rutas internas que mantener
- SQLite embebido en DO (`ctx.storage.sql`) es la forma moderna frente a `ctx.storage.put/get` por clave
- Indexes en `votes` y `created_at` son necesarios para el ORDER BY eficiente dentro del SQLite del DO
- Hibernation API: el DO puede hibernar entre mensajes WS sin perder las conexiones activas — crucial para cost efficiency
- El swap `replace(/^http/, 'ws')` sobre `VITE_API_URL` para la URL del WebSocket es consistente con el patrón de todas las llamadas al backend — `VITE_API_URL` siempre está definida porque Vite la inlinea en build
- `avatarUrl` es nullable — spec 04 (uploads) es opcional; el frontend renderiza un SVG inline de avatar genérico si es `null` (sin petición de red adicional)
- El contador de votos persiste en el DO al recargar; el estado local (si el usuario ya votó) no se persiste en local — intencional para esta iteración
- `idFromName(course)` convierte el query param en un DO independiente por curso — cambiar `?course=X` en la URL es suficiente para suscribirse a un tablero completamente distinto, sin tocar código
- El input editable de `course` en la UI hace tangible el concepto de N DOs: los estudiantes pueden crearse su propio espacio en tiempo real
- DO vs KV vs D1: DO para estado coordinado con consistencia fuerte y tiempo real, KV para config global, D1 para datos relacionales del backend
- El JWT de scope `comment` desacopla la autorización de comentarios del token de admin (`read:all`)

## Al finalizar

Actualizar `CLAUDE.md` y `README.md` para reflejar:
- Durable Object `CommentBoard` en el backend: SQLite, RPC, Hibernation API
- Binding `COMMENT_BOARD` y patrón `idFromName(course)` para múltiples instancias
- JWT de scope `comment` emitido en `POST /waitlist`
- Endpoints de comentarios (públicos vs protegidos) y flujo de WebSocket
- Columna `last_comment_at` en D1 (actualizada via `waitUntil` en `POST /comments`)
