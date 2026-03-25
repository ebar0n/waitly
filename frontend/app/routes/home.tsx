import { useState } from 'react'
import { Link } from 'react-router'
import type { Route } from './+types/home'
import styles from '../../src/App.module.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'Waitly — Cloudflare Workers con Platzi' },
    {
      name: 'description',
      content: 'Aprende a construir aplicaciones serverless de producción con Cloudflare Workers.',
    },
  ]
}

type Status = 'idle' | 'loading' | 'success' | 'error'

export default function Home() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch(`${API_URL}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = (await res.json()) as { message?: string; error?: string }

      if (!res.ok) {
        throw new Error(data.error ?? 'Algo salió mal. Intenta de nuevo.')
      }

      setStatus('success')
      setMessage(data.message ?? '¡Ya estás en la lista!')
      setEmail('')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Algo salió mal. Intenta de nuevo.')
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <div className={styles.badge}>Próximamente</div>

        <h1 className={styles.logo}>Waitly</h1>

        <p className={styles.subtitle}>
          Aprende a construir aplicaciones serverless de producción con{' '}
          <span className={styles.highlight}>Cloudflare Workers</span> en el curso de Platzi.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.inputGroup}>
            <input
              type="email"
              className={styles.input}
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={status === 'loading' || status === 'success'}
              aria-label="Correo electrónico"
            />
            <button
              type="submit"
              className={styles.button}
              disabled={status === 'loading' || status === 'success'}
            >
              {status === 'loading' ? (
                <span className={styles.spinner} aria-hidden="true" />
              ) : status === 'success' ? (
                '¡Listo!'
              ) : (
                'Unirme a la lista'
              )}
            </button>
          </div>

          {status === 'success' && (
            <p className={`${styles.feedback} ${styles.success}`} role="status">
              {message}
            </p>
          )}
          {status === 'error' && (
            <p className={`${styles.feedback} ${styles.error}`} role="alert">
              {message}
            </p>
          )}
        </form>

        <p className={styles.tagline}>Sin spam. Solo lo importante.</p>

        <Link
          to="/stats"
          style={{
            alignSelf: 'center',
            fontSize: '0.8rem',
            color: 'var(--muted)',
            textDecoration: 'none',
          }}
        >
          Stats via Server Render →
        </Link>
      </div>
    </main>
  )
}
