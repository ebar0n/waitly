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
  avatar_uuid: string | null
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
      .prepare('SELECT email, country, joined_at, avatar_uuid FROM waitlist WHERE email = ?')
      .bind(email)
      .first<WaitlistRow>()

    const entry = rowToEntry(row!)
    return { success: true, message: '¡Te agregamos a la lista de espera!', entry }
  },

  async upsertEmail(
    db: D1Database,
    email: string,
    country: string | null,
  ): Promise<{ result: WaitlistResult; avatarUuid: string; isNew: boolean }> {
    const existing = await db
      .prepare('SELECT email, country, joined_at, avatar_uuid FROM waitlist WHERE email = ?')
      .bind(email)
      .first<WaitlistRow>()

    if (existing) {
      let avatarUuid = existing.avatar_uuid
      if (!avatarUuid) {
        avatarUuid = crypto.randomUUID()
        await db.prepare('UPDATE waitlist SET avatar_uuid = ? WHERE email = ?').bind(avatarUuid, email).run()
      }
      return {
        result: { success: true, message: 'Perfil actualizado', entry: rowToEntry(existing) },
        avatarUuid,
        isNew: false,
      }
    }

    const avatarUuid = crypto.randomUUID()
    await db
      .prepare('INSERT INTO waitlist (email, country, avatar_uuid) VALUES (?, ?, ?)')
      .bind(email, country, avatarUuid)
      .run()

    const row = await db
      .prepare('SELECT email, country, joined_at, avatar_uuid FROM waitlist WHERE email = ?')
      .bind(email)
      .first<WaitlistRow>()

    return {
      result: { success: true, message: '¡Te agregamos a la lista de espera!', entry: rowToEntry(row!) },
      avatarUuid,
      isNew: true,
    }
  },

  async findAll(db: D1Database): Promise<WaitlistEntry[]> {
    const { results } = await db
      .prepare('SELECT email, country, joined_at, avatar_uuid FROM waitlist ORDER BY joined_at ASC')
      .all<WaitlistRow>()
    return results.map(rowToEntry)
  },

  async findByEmail(db: D1Database, email: string): Promise<WaitlistEntry | undefined> {
    const row = await db
      .prepare('SELECT email, country, joined_at, avatar_uuid FROM waitlist WHERE email = ?')
      .bind(email)
      .first<WaitlistRow>()
    return row ? rowToEntry(row) : undefined
  },
}
