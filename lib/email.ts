import nodemailer from "nodemailer"
import path from "node:path"
import fs from "node:fs/promises"
import { env, assertServerEnv } from "@/lib/env"
import { buildPasswordResetEmail } from "@/database/email-templates/password-reset"

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
  assertServerEnv()

  const transporter = getMailer()

  const logoPath = path.join(process.cwd(), "public", "logo.png")
  let logoBuffer: Buffer | null = null
  try {
    logoBuffer = await fs.readFile(logoPath)
  } catch {
    logoBuffer = null
  }

  const { subject, text, html } = buildPasswordResetEmail({
    name: opts.name ?? null,
    resetUrl: opts.resetUrl,
    brandName: "THESISGRADER",
    logoCid: logoBuffer ? "tg-logo" : null,
    year: new Date().getFullYear(),
  })

  await transporter.sendMail({
    from: `"THESISGRADER" <${env.GMAIL_USER}>`,
    to: opts.to,
    subject,
    text,
    html,
    attachments: logoBuffer
      ? [
        {
          filename: "logo.png",
          content: logoBuffer,
          cid: "tg-logo",
        },
      ]
      : undefined,
  })
}
