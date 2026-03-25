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

interface WaitlistRow {
  email: string
  joined_at: string
  country: string | null
}

function rowToEntry(row: WaitlistRow): WaitlistEntry {
  return { email: row.email, joinedAt: row.joined_at, country: row.country }
}

export const WaitlistService = {
  async addEmail(db: D1Database, email: string, country: string | null): Promise<WaitlistResult> {
    await db
      .prepare('INSERT INTO waitlist (email, country) VALUES (?, ?)')
      .bind(email, country)
      .run()

    const row = await db
      .prepare('SELECT email, country, joined_at FROM waitlist WHERE email = ?')
      .bind(email)
      .first<WaitlistRow>()

    const entry = rowToEntry(row!)
    return { success: true, message: '¡Te agregamos a la lista de espera!', entry }
  },

  async findAll(db: D1Database): Promise<WaitlistEntry[]> {
    const { results } = await db
      .prepare('SELECT email, country, joined_at FROM waitlist ORDER BY joined_at ASC')
      .all<WaitlistRow>()
    return results.map(rowToEntry)
  },

  async findByEmail(db: D1Database, email: string): Promise<WaitlistEntry | undefined> {
    const row = await db
      .prepare('SELECT email, country, joined_at FROM waitlist WHERE email = ?')
      .bind(email)
      .first<WaitlistRow>()
    return row ? rowToEntry(row) : undefined
  },
}
