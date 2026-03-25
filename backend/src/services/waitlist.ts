// Persistence abstraction — swap por D1 cuando conectes la base de datos.
//
// Ejemplo D1:
//   await env.DB.prepare(
//     'INSERT INTO waitlist (email, country, joined_at) VALUES (?, ?, ?)'
//   ).bind(email, country, new Date().toISOString()).run()

export interface WaitlistEntry {
  email: string
  joinedAt: string
  country: string | null
}

export interface WaitlistResult {
  success: boolean
  message: string
  entry: WaitlistEntry
}

// Mock data — reemplazar con consultas D1
const MOCK_ENTRIES: WaitlistEntry[] = [
  { email: 'ana@example.com', joinedAt: '2026-03-24T10:00:00.000Z', country: 'MX' },
  { email: 'carlos@example.com', joinedAt: '2026-03-24T11:30:00.000Z', country: 'CO' },
  { email: 'lucia@example.com', joinedAt: '2026-03-24T13:00:00.000Z', country: 'AR' },
]

export const WaitlistService = {
  async addEmail(email: string, country: string | null): Promise<WaitlistResult> {
    // TODO: reemplazar con INSERT en D1
    const entry: WaitlistEntry = {
      email,
      joinedAt: new Date().toISOString(),
      country,
    }
    return {
      success: true,
      message: '¡Te agregamos a la lista de espera!',
      entry,
    }
  },

  findAll(): WaitlistEntry[] {
    // TODO: reemplazar con SELECT * FROM waitlist
    return MOCK_ENTRIES
  },

  findByEmail(email: string): WaitlistEntry | undefined {
    // TODO: reemplazar con SELECT * FROM waitlist WHERE email = ?
    return MOCK_ENTRIES.find((e) => e.email === email)
  },
}
