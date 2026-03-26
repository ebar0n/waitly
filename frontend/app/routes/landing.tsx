import { data, Form, useActionData, useLoaderData } from 'react-router'
import type { Route } from './+types/landing'
import styles from '../../src/App.module.css'

interface VariantConfig {
  badge: string
  headline: string
  cta: string
}

interface AbConfig {
  variant_a: VariantConfig
  variant_b: VariantConfig
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.cloudflare

  const raw = await env.AB_CONFIG.get('ab:config', { cacheTtl: 60 })
  const config: AbConfig = raw ? JSON.parse(raw) : {
    variant_a: { badge: 'Acceso Anticipado', headline: 'Domina Cloudflare Workers desde cero', cta: 'Reservar mi lugar' },
    variant_b: { badge: 'Cupos Limitados', headline: 'Construye apps serverless de producción hoy', cta: 'Quiero aprender ahora' },
  }

  const cookieHeader = request.headers.get('Cookie') ?? ''
  const existingVariant = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('ab_variant='))
    ?.split('=')[1] as 'variant_a' | 'variant_b' | undefined

  const isNew = !existingVariant
  const variant: 'variant_a' | 'variant_b' = existingVariant ?? (Math.random() < 0.5 ? 'variant_a' : 'variant_b')

  return data(
    { config, variant, setVariantCookie: isNew },
    isNew
      ? { headers: { 'Set-Cookie': `ab_variant=${variant}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` } }
      : undefined,
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.cloudflare
  const formData = await request.formData()
  const email = formData.get('email') as string
  const variant = formData.get('variant') as string

  if (!email) {
    return { ok: false, message: 'El correo es requerido.' }
  }

  await env.AB_CONFIG.put(`variant:${email}`, variant)

  try {
    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
    const res = await fetch(`${apiUrl}/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const result = (await res.json()) as { message?: string; error?: string }
    if (!res.ok) {
      return { ok: false, message: result.error ?? 'Algo salió mal.' }
    }
    return { ok: true, message: result.message ?? '¡Ya estás en la lista!' }
  } catch (error) {
    console.error({message: 'No se pudo conectar al servidor.', error})
    return { ok: false, message: 'No se pudo conectar al servidor.' }
  }
}

export default function Landing() {
  const { config, variant } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const variantConfig = config[variant]

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <div className={styles.badge}>{variantConfig.badge}</div>

        <h1 className={styles.logo}>Waitly</h1>

        <p className={styles.subtitle}>{variantConfig.headline}</p>

        {actionData?.ok ? (
          <p className={`${styles.feedback} ${styles.success}`} role="status">
            {actionData.message}
          </p>
        ) : (
          <Form method="post" className={styles.form}>
            <input type="hidden" name="variant" value={variant} />
            <div className={styles.inputGroup}>
              <input
                type="email"
                name="email"
                className={styles.input}
                placeholder="tu@email.com"
                required
                aria-label="Correo electrónico"
              />
              <button type="submit" className={styles.button}>
                {variantConfig.cta}
              </button>
            </div>
            {actionData?.ok === false && (
              <p className={`${styles.feedback} ${styles.error}`} role="alert">
                {actionData.message}
              </p>
            )}
          </Form>
        )}

        <p className={styles.tagline}>Sin spam. Solo lo importante.</p>
        <p style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
          Variante: {variant}
        </p>
      </div>
    </main>
  )
}
