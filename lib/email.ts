import nodemailer from "nodemailer"
import path from "node:path"
import fs from "node:fs/promises"
import { env, assertServerEnv } from "@/lib/env"
import { buildPasswordResetEmail } from "@/database/email-templates/password-reset"
import { buildLoginDetailsEmail } from "@/database/email-templates/log-in-details"

async function readBrandLogoBuffer(): Promise<Buffer | null> {
  const logoPath = path.join(process.cwd(), "public", "logo.png")
  try {
    return await fs.readFile(logoPath)
  } catch {
    return null
  }
}

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
  const logoBuffer = await readBrandLogoBuffer()

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

export async function sendLoginDetailsEmail(opts: {
  to: string
  name?: string | null
  email: string
  password: string
  loginUrl: string
}) {
  assertServerEnv()

  const transporter = getMailer()
  const logoBuffer = await readBrandLogoBuffer()

  const { subject, text, html } = buildLoginDetailsEmail({
    name: opts.name ?? null,
    email: opts.email,
    password: opts.password,
    loginUrl: opts.loginUrl,
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
