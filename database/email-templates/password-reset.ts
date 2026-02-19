import { escapeHtml, renderEmailLayout, resolveAppLink } from "./base"

export interface PasswordResetTemplateInput {
  name?: string | null
  resetUrl: string
  brandName?: string
  logoCid?: string | null
  year?: number
}

export function buildPasswordResetEmail(input: PasswordResetTemplateInput) {
  const brandName = (input.brandName ?? "THESISGRADER").trim() || "THESISGRADER"
  const resetUrl = resolveAppLink(input.resetUrl, "/reset-password")

  const displayName = (input.name ?? "").trim()
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi,"

  const subject = `${brandName} — Reset your password`

  const text = [
    displayName ? `Hi ${displayName},` : "Hi,",
    "",
    `We received a request to reset your ${brandName} password.`,
    "",
    `Reset link: ${resetUrl}`,
    "",
    "If you didn’t request this, you can safely ignore this email.",
    "",
    `— ${brandName}`,
  ].join("\n")

  const bodyHtml = `
      <p style="margin:0 0 10px 0;">${greeting}</p>
      <p style="margin:0 0 14px 0;">
        We received a request to reset your <b>${escapeHtml(brandName)}</b> password. Click the button below to continue.
      </p>
    `

  const secondaryHtml = `
      If the button doesn’t work, copy and paste this link:
      <div style="word-break:break-all;margin-top:6px;padding:10px 12px;border-radius:12px;background:#eefdf4;border:1px dashed #c9f1dc;">
        <a href="${escapeHtml(resetUrl)}" style="color:#0aa36a;text-decoration:underline;">${escapeHtml(resetUrl)}</a>
      </div>
    `

  const safetyHtml = `
      <b>Didn’t request this?</b> You can safely ignore this email. Your password won’t change unless you open the link and complete the reset.
    `

  const html = renderEmailLayout({
    preheader: `Reset your ${brandName} password.`,
    brandName,
    heading: "Reset your password",
    bodyHtml,
    cta: {
      label: "Reset password",
      href: resetUrl,
    },
    secondaryHtml,
    safetyHtml,
    logoCid: input.logoCid ?? null,
    year: input.year,
  })

  return { subject, text, html }
}