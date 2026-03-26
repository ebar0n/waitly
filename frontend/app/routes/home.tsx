import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router'
import type { Route } from './+types/home'
import styles from '../../src/App.module.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY
const MAX_CHARS = 280

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

interface Comment {
  id: string
  avatarUrl: string | null
  text: string
  votes: number
  createdAt: string
}

function AvatarIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="18" cy="18" r="18" fill="rgba(124,106,247,0.12)" />
      <circle cx="18" cy="14" r="6" fill="rgba(124,106,247,0.4)" />
      <ellipse cx="18" cy="30" rx="10" ry="7" fill="rgba(124,106,247,0.4)" />
    </svg>
  )
}

function CharCounter({ current, max }: { current: number; max: number }) {
  const remaining = max - current
  const color =
    remaining <= 20 ? 'var(--error, #f87171)' : remaining <= 60 ? '#f59e0b' : 'var(--muted)'
  return (
    <span style={{ fontSize: '0.75rem', color, transition: 'color 0.2s' }}>
      {current}/{max}
    </span>
  )
}

export default function Home() {
  const [email, setEmail] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  // Comments state
  const [course, setCourse] = useState(() => {
    if (typeof window === 'undefined') return 'course-2026'
    const params = new URLSearchParams(window.location.search)
    return params.get('course') ?? 'course-2026'
  })
  const [courseInput, setCourseInput] = useState(course)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [commentPosting, setCommentPosting] = useState<'idle' | 'loading' | 'error'>('idle')
  const [commentError, setCommentError] = useState('')
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set())
  const [wsConnected, setWsConnected] = useState(false)
  const [commentToken, setCommentToken] = useState(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('commentToken')
  })
  const wsRef = useRef<WebSocket | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Turnstile
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null)
  const turnstileWidgetId = useRef<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    try {
      const formData = new FormData()
      formData.append('email', email)
      if (avatarFile) formData.append('file', avatarFile)
      if (turnstileToken) formData.append('cf-turnstile-response', turnstileToken)

      const res = await fetch(`${API_URL}/waitlist`, {
        method: 'POST',
        body: formData,
      })

      const data = (await res.json()) as {
        message?: string
        error?: string
        commentToken?: string
      }

      if (!res.ok) {
        throw new Error(data.error ?? 'Algo salió mal. Intenta de nuevo.')
      }

      if (data.commentToken) {
        localStorage.setItem('commentToken', data.commentToken)
        setCommentToken(data.commentToken)
      }

      setStatus('success')
      setMessage(data.message ?? '¡Ya estás en la lista!')
      setEmail('')
      setAvatarFile(null)
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Algo salió mal. Intenta de nuevo.')
      // Resetear el widget para que el usuario pueda reintentar
      if (turnstileWidgetId.current && window.turnstile) {
        window.turnstile.reset(turnstileWidgetId.current)
        setTurnstileToken(null)
      }
    }
  }

  // Fetch comments + open WebSocket when course changes
  useEffect(() => {
    setComments([])
    setWsConnected(false)

    fetch(`${API_URL}/comments?course=${course}`)
      .then((r) => r.json())
      .then((data) => setComments(data as Comment[]))
      .catch(console.error)

    const wsUrl = API_URL.replace(/^http/, 'ws') + `/comments/ws?course=${course}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => setWsConnected(true)
    ws.onclose = () => setWsConnected(false)

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as
          | { type: 'comment_added'; comment: Comment }
          | { type: 'vote_updated'; commentId: string; votes: number }
        if (msg.type === 'comment_added') {
          setComments((prev) => [msg.comment, ...prev])
        } else if (msg.type === 'vote_updated') {
          setComments((prev) =>
            prev.map((c) => (c.id === msg.commentId ? { ...c, votes: msg.votes } : c)),
          )
        }
      } catch {
        // ignore malformed messages
      }
    }

    return () => {
      ws.close()
    }
  }, [course])

  // Cargar y renderizar el widget de Turnstile
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return

    const renderWidget = () => {
      if (!turnstileContainerRef.current || turnstileWidgetId.current) return
      turnstileWidgetId.current = window.turnstile!.render(turnstileContainerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (token) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(null),
        'error-callback': () => setTurnstileToken(null),
      })
    }

    if (window.turnstile) {
      renderWidget()
    } else {
      const existing = document.getElementById('cf-turnstile-script')
      if (!existing) {
        const script = document.createElement('script')
        script.id = 'cf-turnstile-script'
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
        script.async = true
        script.onload = renderWidget
        document.head.appendChild(script)
      } else {
        existing.addEventListener('load', renderWidget, { once: true })
      }
    }

    return () => {
      if (turnstileWidgetId.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetId.current)
        turnstileWidgetId.current = null
      }
    }
  }, [])

  const handleCourseChange = () => {
    const trimmed = courseInput.trim()
    if (!trimmed || trimmed === course) return
    history.pushState({}, '', `?course=${encodeURIComponent(trimmed)}`)
    setCourse(trimmed)
    setCourseInput(trimmed)
  }

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentToken || !commentText.trim() || commentPosting === 'loading') return

    setCommentPosting('loading')
    setCommentError('')

    try {
      const res = await fetch(`${API_URL}/comments?course=${course}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commentToken}`,
        },
        body: JSON.stringify({ text: commentText.trim() }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'No se pudo publicar el comentario.')
      }

      setCommentText('')
      setCommentPosting('idle')
      textareaRef.current?.focus()
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Error al publicar.')
      setCommentPosting('error')
    }
  }

  const handleVote = async (commentId: string) => {
    if (!commentToken) return

    // Optimistic update
    const alreadyVoted = votedIds.has(commentId)
    setVotedIds((prev) => {
      const next = new Set(prev)
      alreadyVoted ? next.delete(commentId) : next.add(commentId)
      return next
    })
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, votes: c.votes + (alreadyVoted ? -1 : 1) } : c,
      ),
    )

    try {
      const res = await fetch(`${API_URL}/comments/${commentId}/vote?course=${course}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${commentToken}` },
      })
      if (!res.ok) throw new Error()
    } catch {
      // Revert optimistic update on failure
      setVotedIds((prev) => {
        const next = new Set(prev)
        alreadyVoted ? next.add(commentId) : next.delete(commentId)
        return next
      })
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, votes: c.votes + (alreadyVoted ? 1 : -1) } : c,
        ),
      )
    }
  }

  const canPost = commentText.trim().length > 0 && commentText.length <= MAX_CHARS

  return (
    <main className={styles.main} style={{ flexDirection: 'column', gap: '1.5rem' }}>
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
              disabled={
                status === 'loading' ||
                status === 'success' ||
                (!!TURNSTILE_SITE_KEY && !turnstileToken)
              }
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

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={status === 'loading' || status === 'success'}
            onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
            aria-label="Foto de perfil (opcional)"
          />

          {TURNSTILE_SITE_KEY && status !== 'success' && (
            <div ref={turnstileContainerRef} style={{ alignSelf: 'center' }} />
          )}

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
        <Link
          to="/landing"
          style={{
            alignSelf: 'center',
            fontSize: '0.8rem',
            color: 'var(--muted)',
            textDecoration: 'none',
          }}
        >
          Landing A/B Test (KV) →
        </Link>
      </div>

      {/* ── Comments board ── */}
      <div className={styles.card} style={{ maxWidth: '560px', textAlign: 'left', gap: '1rem' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Tablero del curso</h2>
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              padding: '0.2rem 0.6rem',
              borderRadius: '999px',
              background: wsConnected ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${wsConnected ? 'rgba(74,222,128,0.3)' : 'var(--border)'}`,
              color: wsConnected ? 'var(--success, #4ade80)' : 'var(--muted)',
              transition: 'all 0.3s',
            }}
          >
            {wsConnected ? '● En vivo' : '○ Conectando…'}
          </span>
        </div>

        {/* Course selector */}
        <div
          className={styles.inputGroup}
          style={{ background: 'transparent', marginBottom: '0.25rem' }}
        >
          <input
            className={styles.input}
            value={courseInput}
            onChange={(e) => setCourseInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCourseChange()}
            placeholder="Nombre del curso"
            aria-label="Nombre del curso"
            style={{ fontSize: '0.85rem' }}
          />
          <button
            className={styles.button}
            onClick={handleCourseChange}
            type="button"
            style={{ minWidth: 'auto', padding: '0.5rem 1rem', fontSize: '0.8rem' }}
          >
            Cambiar
          </button>
        </div>

        {/* Comment composer — visible only if registered */}
        {commentToken ? (
          <form
            onSubmit={handlePostComment}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
          >
            <div
              style={{
                background: 'var(--surface)',
                border: `1px solid ${commentPosting === 'error' ? 'rgba(248,113,113,0.5)' : 'var(--border)'}`,
                borderRadius: '12px',
                padding: '0.35rem',
                transition: 'border-color 0.2s',
                display: 'flex',
                flexDirection: 'column',
              }}
              onFocus={(e) => {
                if (commentPosting !== 'error')
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
              }}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  (e.currentTarget as HTMLElement).style.borderColor =
                    commentPosting === 'error' ? 'rgba(248,113,113,0.5)' : 'var(--border)'
              }}
            >
              <textarea
                ref={textareaRef}
                value={commentText}
                onChange={(e) => {
                  setCommentText(e.target.value)
                  if (commentPosting === 'error') {
                    setCommentPosting('idle')
                    setCommentError('')
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canPost) {
                    e.preventDefault()
                    void handlePostComment(e as unknown as React.FormEvent)
                  }
                }}
                placeholder="Comparte tu experiencia con el curso… (Ctrl+Enter para enviar)"
                maxLength={MAX_CHARS + 1}
                rows={3}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  padding: '0.55rem 0.75rem 0.25rem',
                  fontFamily: 'inherit',
                  fontSize: '0.9rem',
                  color: 'var(--text)',
                  resize: 'none',
                  lineHeight: 1.5,
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.25rem 0.75rem 0.35rem',
                }}
              >
                <CharCounter current={commentText.length} max={MAX_CHARS} />
                <button
                  type="submit"
                  className={styles.button}
                  disabled={!canPost || commentPosting === 'loading'}
                  style={{
                    minWidth: 'auto',
                    padding: '0.4rem 1rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  {commentPosting === 'loading' ? (
                    <span className={styles.spinner} aria-hidden="true" />
                  ) : (
                    'Publicar'
                  )}
                </button>
              </div>
            </div>

            {commentPosting === 'error' && (
              <p
                className={`${styles.feedback} ${styles.error}`}
                role="alert"
                style={{ margin: 0 }}
              >
                {commentError}
              </p>
            )}
          </form>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              background: 'rgba(124,106,247,0.06)',
              border: '1px solid rgba(124,106,247,0.15)',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>💬</span>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.4 }}>
              <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Regístrate arriba</strong>{' '}
              para dejar comentarios y votar.
            </p>
          </div>
        )}

        {/* Divider */}
        <div style={{ height: '1px', background: 'var(--border)', margin: '0 -0.25rem' }} />

        {/* Comment list */}
        {comments.length === 0 ? (
          <p
            style={{
              margin: 0,
              fontSize: '0.85rem',
              color: 'var(--muted)',
              textAlign: 'center',
              padding: '1.5rem 0',
            }}
          >
            Aún no hay comentarios. ¡Sé el primero!
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            {comments.map((comment) => {
              const voted = votedIds.has(comment.id)
              return (
                <li
                  key={comment.id}
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'flex-start',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    transition: 'border-color 0.2s',
                  }}
                >
                  {/* Avatar */}
                  <div style={{ flexShrink: 0, marginTop: '0.1rem' }}>
                    {comment.avatarUrl ? (
                      <img
                        src={comment.avatarUrl}
                        alt="Avatar"
                        width={36}
                        height={36}
                        style={{ borderRadius: '50%', display: 'block' }}
                      />
                    ) : (
                      <AvatarIcon />
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: '0 0 0.35rem',
                        fontSize: '0.9rem',
                        lineHeight: 1.55,
                        wordBreak: 'break-word',
                        color: 'var(--text)',
                      }}
                    >
                      {comment.text}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--muted)' }}>
                      {new Date(comment.createdAt).toLocaleString('es', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>

                  {/* Vote button */}
                  <button
                    onClick={() => void handleVote(comment.id)}
                    disabled={!commentToken}
                    aria-label={`${voted ? 'Quitar voto' : 'Votar'} (${comment.votes} votos)`}
                    aria-pressed={voted}
                    style={{
                      flexShrink: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.1rem',
                      background: voted ? 'rgba(124,106,247,0.15)' : 'transparent',
                      border: `1px solid ${voted ? 'rgba(124,106,247,0.4)' : 'var(--border)'}`,
                      borderRadius: '8px',
                      padding: '0.35rem 0.55rem',
                      cursor: commentToken ? 'pointer' : 'default',
                      color: voted ? 'var(--accent)' : 'var(--muted)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      transition: 'all 0.15s',
                      minWidth: '2.5rem',
                    }}
                  >
                    <span style={{ fontSize: '0.7rem', lineHeight: 1 }}>▲</span>
                    <span>{comment.votes}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
