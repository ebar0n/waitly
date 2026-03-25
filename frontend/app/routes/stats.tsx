import type { Route } from './+types/stats'

export function meta(_: Route.MetaArgs) {
  return [{ title: 'Stats — Waitly' }]
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const cf = context.cloudflare.cf

  return {
    country: cf?.country ?? null,
    city: cf?.city ?? null,
    region: cf?.region ?? null,
    timezone: cf?.timezone ?? null,
    continent: cf?.continent ?? null,
    colo: cf?.colo ?? null,
    // Solo disponible en producción — el proxy de Cloudflare lo inyecta
    cfIpCountry: request.headers.get('CF-IPCountry'),
  }
}

export default function Stats({ loaderData }: Route.ComponentProps) {
  const { country, city, region, timezone, continent, colo, cfIpCountry } = loaderData

  return (
    <main
      style={{
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        background:
          'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(124, 106, 247, 0.15), transparent), var(--bg)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <a
            href="/"
            style={{ fontSize: '0.85rem', color: 'var(--muted)', textDecoration: 'none' }}
          >
            ← Volver
          </a>
          <h1
            style={{
              fontSize: '1.8rem',
              fontWeight: 800,
              marginTop: '1rem',
              background: 'linear-gradient(135deg, #fff 30%, var(--accent))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Tu conexión
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Datos obtenidos del request en el Worker (SSR)
          </p>
        </div>

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          {[
            { label: 'País (request.cf)', value: country },
            { label: 'País (CF-IPCountry header)', value: cfIpCountry, note: 'Solo en producción' },
            { label: 'Ciudad', value: city },
            { label: 'Región', value: region },
            { label: 'Continente', value: continent },
            { label: 'Timezone', value: timezone },
            { label: 'Datacenter CF', value: colo },
          ].map(({ label, value, note }, i, arr) => (
            <div
              key={label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1.25rem',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{label}</span>
              <span style={{ textAlign: 'right' }}>
                <span
                  style={{
                    color: value ? 'var(--text)' : 'var(--muted)',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    display: 'block',
                  }}
                >
                  {value ?? '—'}
                </span>
                {note && <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>{note}</span>}
              </span>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)' }}>
          Esta página se renderiza en el Worker de Cloudflare, no en el browser.
        </p>
      </div>
    </main>
  )
}
