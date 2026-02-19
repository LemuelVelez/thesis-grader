import { escapeHtml, renderEmailLayout, resolveAppLink } from "./base"

export interface LoginDetailsTemplateInput {
  name?: string | null
  email: string
  password: string
  loginUrl: string
  brandName?: string
  logoCid?: string | null
  year?: number
}

export function buildLoginDetailsEmail(input: LoginDetailsTemplateInput) {
  const brandName = (input.brandName ?? "THESISGRADER").trim() || "THESISGRADER"
  const loginUrl = resolveAppLink(input.loginUrl, "/login")

  const displayName = (input.name ?? "").trim()
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi,"

  const subject = `${brandName} — Your account login details`

  const text = [
    displayName ? `Hi ${displayName},` : "Hi,",
    "",
    `Your ${brandName} account has been created successfully.`,
    "",
    `Email: ${input.email}`,
    `Temporary Password: ${input.password}`,
    `Login URL: ${loginUrl}`,
    "",
    "For security, please log in and change your password immediately.",
    "",
    `— ${brandName}`,
  ].join("\n")

  const bodyHtml = `
      <p style="margin:0 0 10px 0;">${greeting}</p>
      <p style="margin:0 0 14px 0;">
        Your <b>${escapeHtml(brandName)}</b> account has been created.
        Use the login credentials below to access your account.
      </p>

      <div style="margin:0 0 12px 0;padding:12px 14px;border-radius:12px;background:#eefdf4;border:1px dashed #c9f1dc;">
        <div style="margin:0 0 6px 0;"><b>Email:</b> ${escapeHtml(input.email)}</div>
        <div style="margin:0;"><b>Temporary Password:</b> ${escapeHtml(input.password)}</div>
      </div>
    `

  const secondaryHtml = `
      Login URL:
      <div style="word-break:break-all;margin-top:6px;padding:10px 12px;border-radius:12px;background:#eefdf4;border:1px dashed #c9f1dc;">
        <a href="${escapeHtml(loginUrl)}" style="color:#0aa36a;text-decoration:underline;">${escapeHtml(loginUrl)}</a>
      </div>
    `

  const safetyHtml = `
      <b>Security reminder:</b> Please sign in as soon as possible and change your password immediately.
    `

  const html = renderEmailLayout({
    preheader: `Your ${brandName} login details.`,
    brandName,
    heading: "Welcome to THESISGRADER",
    bodyHtml,
    cta: {
      label: "Login now",
      href: loginUrl,
    },
    secondaryHtml,
    safetyHtml,
    logoCid: input.logoCid ?? null,
    year: input.year,
  })

  return { subject, text, html }
}