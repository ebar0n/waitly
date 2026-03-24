// Minimal worker — all routes fall through to static assets (SPA)
export default {
  async fetch(): Promise<Response> {
    return new Response(null, { status: 404 })
  },
}
