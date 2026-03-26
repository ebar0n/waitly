// Extiende Env con los bindings de rate limiting
// (wrangler types aún no reconoce el campo rate_limiting en wrangler.jsonc)
interface Env {
  IP_RATE_LIMITER: RateLimit
  COMMENT_RATE_LIMITER: RateLimit
}
