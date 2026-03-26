import { WorkflowEntrypoint, WorkflowStep } from 'cloudflare:workers'
import { EmailService } from '../services/email'

interface OnboardingParams {
  email: string
}

export class OnboardingWorkflow extends WorkflowEntrypoint<Env, OnboardingParams> {
  async run(event: { payload: OnboardingParams }, step: WorkflowStep) {
    const { email } = event.payload

    await step.do('send-welcome', async () => {
      await EmailService.sendWelcome(email, this.env.RESEND_API_KEY)
    })

    await step.sleep('wait-30m', '30 minutes')

    const active1 = await step.do('check-activity-1', async () => {
      const row = await this.env.DB.prepare('SELECT last_comment_at FROM waitlist WHERE email = ?')
        .bind(email)
        .first<{ last_comment_at: string | null }>()
      return row?.last_comment_at ?? null
    })
    if (active1) return

    await step.do('send-followup-1', async () => {
      await EmailService.sendFollowUp(email, this.env.RESEND_API_KEY)
    })

    await step.sleep('wait-24h', '24 hours')

    const active2 = await step.do('check-activity-2', async () => {
      const row = await this.env.DB.prepare('SELECT last_comment_at FROM waitlist WHERE email = ?')
        .bind(email)
        .first<{ last_comment_at: string | null }>()
      return row?.last_comment_at ?? null
    })
    if (active2) return

    await step.do('send-followup-2', async () => {
      await EmailService.sendFollowUp(email, this.env.RESEND_API_KEY)
    })

    await step.sleep('wait-7d', '7 days')

    const active3 = await step.do('check-activity-3', async () => {
      const row = await this.env.DB.prepare('SELECT last_comment_at FROM waitlist WHERE email = ?')
        .bind(email)
        .first<{ last_comment_at: string | null }>()
      return row?.last_comment_at ?? null
    })
    if (active3) return

    await step.do('send-followup-3', async () => {
      await EmailService.sendFollowUp(email, this.env.RESEND_API_KEY)
    })
  }
}
