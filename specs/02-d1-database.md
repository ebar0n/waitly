# Spec 02 — D1 Database

## Objetivo

Reemplazar el mock de `WaitlistService` con persistencia real en D1. Introducir migraciones, índices y el patrón de insert asíncrono con `waitUntil`.

## Schema

```sql
CREATE TABLE waitlist (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  email     TEXT    NOT NULL UNIQUE,
  country   TEXT,
  joined_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_waitlist_email    ON waitlist (email);
CREATE INDEX idx_waitlist_joined_at ON waitlist (joined_at);
```

El constraint `UNIQUE` en `email` previene duplicados a nivel de DB. El índice en `email` optimiza `GET /waitlist/:email`. El índice en `joined_at` optimiza el listado ordenado.

## Patrón de insert

El insert debe ir en `ctx.waitUntil()`: la respuesta 201 se envía al cliente inmediatamente, el insert ocurre en background.

> **Límite de `waitUntil`**: 30 segundos. Un INSERT simple en D1 está bien dentro de ese límite. No usar `waitUntil` si se necesita el resultado del insert para construir la respuesta (e.g., retornar el `id` generado).

## Base de datos

Nombre: `waitly-db`. Binding en el Worker: `DB`.

Crear la base de datos antes de implementar:

```bash
wrangler d1 create waitly-db
```

Copiar el `database_id` generado en `backend/wrangler.jsonc`.

## Migraciones

Carpeta `backend/migrations/` con archivos numerados (`0001_create_waitlist.sql`). Aplicar con:

```bash
# Local (dev)
wrangler d1 migrations apply waitly-db --local
# Producción
wrangler d1 migrations apply waitly-db
```

## Archivos a crear / modificar

- `backend/wrangler.jsonc` — descomentar y completar `d1_databases` con `binding: "DB"` y el `database_id` obtenido
- `backend/migrations/0001_create_waitlist.sql` — nuevo
- `backend/src/services/waitlist.ts` — reemplazar mock con queries D1 (`.prepare().run()`, `.first()`, `.all()`)
- `backend/vitest.config.ts` — añadir `d1Databases` en miniflare para tests
- `backend/src/__tests__/api.test.ts` — test de persistencia real contra D1 local

## Conceptos destacados

- `waitUntil` para insert async — cuándo usarlo y cuándo no (si necesitas el resultado, usa await)
- Diferencia entre `.run()`, `.first()`, `.all()` en la D1 API
- El constraint `UNIQUE` retorna error D1 — manejarlo para dar un 409 en lugar de 500
- D1 es SQLite — las migraciones son SQL estándar
