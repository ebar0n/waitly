# Spec 03 — KV: A/B Testing de la Landing

## Objetivo

Usar Workers KV para almacenar la configuración de un experimento A/B en una segunda landing SSR. Mostrar las estrategias de cache frío y cache caliente jugando con el `cacheTtl` de lectura, usando un valor explícito en lugar del default.

## El experimento

Dos variantes del copy de la landing (`variant_a` / `variant_b`) con diferente headline, badge y CTA. La configuración se almacena en KV como JSON bajo la key `ab:config`. La variante se asigna por cookie: si el usuario ya tiene la cookie `ab_variant`, se respeta; si no, se asigna aleatoriamente (50/50) y se persiste en cookie.

### Estructura del valor en KV (`ab:config`)

```json
{
  "variant_a": {
    "badge": "Acceso Anticipado",
    "headline": "Domina Cloudflare Workers desde cero",
    "cta": "Reservar mi lugar"
  },
  "variant_b": {
    "badge": "Cupos Limitados",
    "headline": "Construye apps serverless de producción hoy",
    "cta": "Quiero aprender ahora"
  }
}
```

## Estrategias de cache

**Cache frío**: primera lectura en un datacenter, KV va al almacenamiento central (~50ms extra).

**Cache caliente**: KV replica el dato en el datacenter local. Lecturas posteriores son < 1ms. La propagación puede tardar hasta 60s (consistencia eventual).

La opción `cacheTtl` en `env.AB_CONFIG.get('ab:config', { cacheTtl: 60 })` controla cuánto tiempo el runtime cachea la respuesta en el datacenter local antes de volver a consultar el store central.

> **Advertencia de Cloudflare**: no usar variables globales para estado de request (viola la regla de no global mutable state). Cache de configuración compartida es la excepción aceptada.

## Archivos a crear / modificar

- `frontend/wrangler.jsonc` — añadir binding `AB_CONFIG` (KV namespace)
- `frontend/app/routes/landing.tsx` — **nueva ruta SSR** (`/landing`):
  - `loader`: lee `ab:config` de KV con `cacheTtl: 60`, parsea cookie `ab_variant`, asigna variante si no existe, devuelve `{ config, variant, setVariantCookie }`
  - `headers`: emite `Set-Cookie: ab_variant=...` si la variante fue recién asignada
  - `action`: recibe el formulario server-side, registra `variant:<email>` en KV y reenvía el email al backend usando `import.meta.env.VITE_API_URL` (igual que `home.tsx`)
  - componente: renderiza badge, headline y CTA de la variante activa; muestra resultado del action
- `frontend/app/routes.ts` — registrar la nueva ruta `/landing`
- `frontend/app/routes/home.tsx` — añadir enlace a `/landing` para facilitar la demo

## Paso previo: crear y sembrar el KV namespace

```bash
# Crear el namespace en producción y obtener el ID
wrangler kv namespace create AB_CONFIG

# Sembrar la config inicial
wrangler kv key put --namespace-id=<ID> "ab:config" \
  '{"variant_a":{"badge":"Acceso Anticipado","headline":"Domina Cloudflare Workers desde cero","cta":"Reservar mi lugar"},"variant_b":{"badge":"Cupos Limitados","headline":"Construye apps serverless de producción hoy","cta":"Quiero aprender ahora"}}'

# Para dev local (wrangler dev usa un store local automático)
wrangler kv key put --local "ab:config" \
  '{"variant_a":{"badge":"Acceso Anticipado","headline":"Domina Cloudflare Workers desde cero","cta":"Reservar mi lugar"},"variant_b":{"badge":"Cupos Limitados","headline":"Construye apps serverless de producción hoy","cta":"Quiero aprender ahora"}}'
```

Tras añadir el binding en `wrangler.jsonc`, regenerar tipos:

```bash
cd frontend && npm run cf-typegen
```

## Conceptos destacados

- KV es eventualmente consistente — no usar para datos que requieren frescura garantizada
- `cacheTtl` (cache en datacenter local) es distinto al TTL del dato en el store central (`expirationTtl`)
- Las instancias de Workers son efímeras — el cache en memoria se pierde al reciclar la instancia
- KV para config que cambia raramente, DO para estado que requiere consistencia fuerte
- El `action` de React Router corre en el Worker (server-side), no en el browser — permite usar bindings de KV directamente
