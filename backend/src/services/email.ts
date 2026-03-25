const RESEND_API_URL = 'https://api.resend.com/emails'
// TODO producción: verificar dominio en resend.com/domains y cambiar from + recipient dinámico
const FROM = 'Waitly <onboarding@resend.dev>'
const FIXED_RECIPIENT = 'curso.cloudflare.workers@gmail.com'

export const EmailService = {
  async sendWelcome(email: string, apiKey: SecretsStoreSecret): Promise<void> {
    const key = await apiKey.get()
    const body = {
      from: FROM,
      to: [FIXED_RECIPIENT],
      subject: '¡Estás en la lista de espera! 🎉',
      html: `
        <h2>¡Hola!</h2>
        <p>Tu email <strong>${email}</strong> ha sido registrado exitosamente en la waitlist del curso de Cloudflare Workers.</p>
        <p>Te avisaremos cuando tengamos novedades.</p>
        <p>— El equipo de Waitly</p>
      `,
    }

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
  },
}
