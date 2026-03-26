const RESEND_API_URL = 'https://api.resend.com/emails'
// TODO producción: verificar dominio en resend.com/domains y cambiar from + recipient dinámico
const FROM = 'Waitly <onboarding@resend.dev>'
const FIXED_RECIPIENT = 'curso.cloudflare.workers@gmail.com'

async function sendEmail(
  apiKey: SecretsStoreSecret,
  subject: string,
  html: string,
): Promise<void> {
  const key = await apiKey.get()
  const body = { from: FROM, to: [FIXED_RECIPIENT], subject, html }

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Resend error ${res.status}: ${text}`)
  }
}

export const EmailService = {
  async sendWelcome(email: string, apiKey: SecretsStoreSecret): Promise<void> {
    await sendEmail(
      apiKey,
      '¡Estás en la lista de espera! 🎉',
      `
        <h2>¡Hola!</h2>
        <p>Tu email <strong>${email}</strong> ha sido registrado exitosamente en la waitlist del curso de Cloudflare Workers.</p>
        <p>El tablero de comentarios ya está activo. ¡Comparte tus expectativas con el resto de estudiantes!</p>
        <p>— El equipo de Waitly</p>
      `,
    )
  },

  async sendFollowUp(email: string, apiKey: SecretsStoreSecret): Promise<void> {
    await sendEmail(
      apiKey,
      '¿Ya dejaste tu primer comentario? 💬',
      `
        <h2>¡Hola!</h2>
        <p>Vemos que <strong>${email}</strong> aún no ha dejado ningún comentario en el tablero.</p>
        <p>El tablero de comentarios del curso está activo y la comunidad ya está participando.</p>
        <p>Entra y deja tu primer comentario — nos interesa saber qué esperas del curso.</p>
        <p>— El equipo de Waitly</p>
      `,
    )
  },
}
