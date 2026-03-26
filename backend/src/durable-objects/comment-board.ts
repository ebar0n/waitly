import { DurableObject } from 'cloudflare:workers'

export interface Comment {
  id: string
  avatarUrl: string | null
  text: string
  votes: number
  createdAt: string
}

type CommentRow = Record<string, SqlStorageValue> & {
  id: string
  email: string
  avatar_url: string | null
  text: string
  votes: number
  created_at: string
}

function rowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    avatarUrl: row.avatar_url,
    text: row.text,
    votes: row.votes,
    createdAt: row.created_at,
  }
}

export class CommentBoard extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS comments (
        id         TEXT PRIMARY KEY,
        email      TEXT NOT NULL,
        avatar_url TEXT,
        text       TEXT NOT NULL,
        votes      INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_comments_votes      ON comments (votes DESC);
      CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments (created_at DESC);

      CREATE TABLE IF NOT EXISTS votes (
        comment_id TEXT NOT NULL,
        email      TEXT NOT NULL,
        PRIMARY KEY (comment_id, email)
      );
    `)
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)
      this.ctx.acceptWebSocket(server)
      return new Response(null, { status: 101, webSocket: client })
    }

    const rows = this.ctx.storage.sql
      .exec<CommentRow>(
        'SELECT id, email, avatar_url, text, votes, created_at FROM comments ORDER BY votes DESC, created_at DESC',
      )
      .toArray()
    return Response.json(rows.map(rowToComment))
  }

  async addComment(email: string, avatarUrl: string | null, text: string): Promise<Comment> {
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    this.ctx.storage.sql.exec(
      'INSERT INTO comments (id, email, avatar_url, text, votes, created_at) VALUES (?, ?, ?, ?, 0, ?)',
      id,
      email,
      avatarUrl,
      text,
      createdAt,
    )
    const comment: Comment = { id, avatarUrl, text, votes: 0, createdAt }
    this.broadcast({ type: 'comment_added', comment })
    return comment
  }

  async castVote(commentId: string, email: string): Promise<number> {
    const existing = this.ctx.storage.sql
      .exec<{
        comment_id: string
      }>('SELECT comment_id FROM votes WHERE comment_id = ? AND email = ?', commentId, email)
      .toArray()

    if (existing.length > 0) {
      this.ctx.storage.sql.exec(
        'DELETE FROM votes WHERE comment_id = ? AND email = ?',
        commentId,
        email,
      )
      this.ctx.storage.sql.exec('UPDATE comments SET votes = votes - 1 WHERE id = ?', commentId)
    } else {
      this.ctx.storage.sql.exec(
        'INSERT INTO votes (comment_id, email) VALUES (?, ?)',
        commentId,
        email,
      )
      this.ctx.storage.sql.exec('UPDATE comments SET votes = votes + 1 WHERE id = ?', commentId)
    }

    const rows = this.ctx.storage.sql
      .exec<{ votes: number }>('SELECT votes FROM comments WHERE id = ?', commentId)
      .toArray()
    const votes = rows[0]?.votes ?? 0
    this.broadcast({ type: 'vote_updated', commentId, votes })
    return votes
  }

  webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): void {
    // No incoming messages expected
  }

  webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    // Cleanup handled by Hibernation API
  }

  webSocketError(_ws: WebSocket, _error: unknown): void {
    // Cleanup handled by Hibernation API
  }

  private broadcast(message: object): void {
    const msg = JSON.stringify(message)
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg)
      } catch {
        // Client disconnected
      }
    }
  }
}
