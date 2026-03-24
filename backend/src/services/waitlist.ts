// Persistence abstraction — swap the mock body for a real D1 implementation
// when you're ready to connect a database.
//
// Example D1 usage:
//   await env.DB.prepare(
//     'INSERT INTO waitlist (email, joined_at) VALUES (?, ?)'
//   ).bind(email, new Date().toISOString()).run()

export interface WaitlistEntry {
  email: string
  joinedAt: string
}

export interface WaitlistResult {
  success: boolean
  message: string
  entry: WaitlistEntry
}

export const WaitlistService = {
  async addEmail(email: string): Promise<WaitlistResult> {
    // TODO: replace with real DB call (e.g. D1)
    const entry: WaitlistEntry = {
      email,
      joinedAt: new Date().toISOString(),
    }

    return {
      success: true,
      message: '¡Te agregamos a la lista de espera!',
      entry,
    }
  },
}
