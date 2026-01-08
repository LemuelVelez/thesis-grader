import nodemailer from "nodemailer"
import { env, assertServerEnv } from "@/lib/env"

export function getMailer() {
  assertServerEnv()

  // Gmail SMTP (App Password)
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.GMAIL_USER,
      pass: env.GMAIL_APP_PASSWORD,
    },
  })
}

export async function sendPasswordResetEmail(opts: {
  to: string
  name?: string | null
  resetUrl: string
}) {
  const transporter = getMailer()

  const subject = "THESISGRADER — Reset your password"
  const greeting = opts.name ? `Hi ${opts.name},` : "Hi,"
  const text = `${greeting}\n\nYou requested a password reset.\n\nReset link: ${opts.resetUrl}\n\nIf you did not request this, you can ignore this email.\n`

  const html = `
    <div style="font-family: ui-sans-serif, system-ui; line-height: 1.5;">
      <p>${greeting}</p>
      <p>You requested a password reset for <b>THESISGRADER</b>.</p>
      <p>
        <a href="${opts.resetUrl}" style="display:inline-block;padding:10px 14px;border-radius:10px;text-decoration:none;background:#00ff7f;color:#052013;font-weight:600;">
          Reset password
        </a>
      </p>
      <p style="color:#2d5b44;font-size:12px;">If you did not request this, you can ignore this email.</p>
    </div>
  `

  await transporter.sendMail({
    from: `"THESISGRADER" <${env.GMAIL_USER}>`,
    to: opts.to,
    subject,
    text,
    html,
  })
}
