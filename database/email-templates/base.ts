import { emailFontFamily, thesisgraderEmailTheme as theme } from "./theme"

export interface EmailLayoutInput {
    preheader: string
    brandName: string
    heading: string
    bodyHtml: string
    cta?: { label: string; href: string }
    secondaryHtml?: string
    safetyHtml?: string
    logoCid?: string | null
    year?: number
}

export function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;")
}

export function renderEmailLayout(input: EmailLayoutInput): string {
    const brandName = escapeHtml(input.brandName)
    const preheader = escapeHtml(input.preheader)
    const heading = escapeHtml(input.heading)
    const year = Number.isFinite(input.year) ? Number(input.year) : new Date().getFullYear()

    const logoBlock = input.logoCid
        ? `
        <div style="width:100%;background:${theme.secondary};">
            <img
                src="cid:${escapeHtml(input.logoCid)}"
                alt="${brandName}"
                width="600"
                height="170"
                style="display:block;width:100%;height:170px;object-fit:cover;border:0;outline:none;text-decoration:none;"
            />
        </div>
        `
        : ""

    const ctaBlock =
        input.cta && input.cta.href
            ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
                <td style="background:${theme.primary};border-radius:12px;">
                    <a
                        href="${escapeHtml(input.cta.href)}"
                        style="
                            display:inline-block;
                            padding:12px 16px;
                            font-family:${emailFontFamily};
                            font-size:14px;
                            font-weight:800;
                            color:${theme.primaryForeground};
                            text-decoration:none;
                            border-radius:12px;
                        "
                    >
                        ${escapeHtml(input.cta.label)}
                    </a>
                </td>
            </tr>
        </table>
        `
            : ""

    const secondaryBlock = input.secondaryHtml
        ? `
        <div style="height:14px;"></div>
        <div style="font-family:${emailFontFamily}; color:${theme.mutedForeground}; font-size:12px; line-height:1.6;">
            ${input.secondaryHtml}
        </div>
        `
        : ""

    const safetyBlock = input.safetyHtml
        ? `
        <div style="height:14px;"></div>
        <div style="padding:12px 14px;border-radius:14px;background:${theme.background};border:1px solid ${theme.border};">
            <div style="font-family:${emailFontFamily}; color:${theme.foreground}; font-size:12px; line-height:1.55;">
                ${input.safetyHtml}
            </div>
        </div>
        `
        : ""

    return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${preheader}
    </div>

    <div style="margin:0;padding:0;background:${theme.background};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${theme.background};">
        <tr>
          <td align="center" style="padding:28px 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;border-collapse:collapse;">
              <tr>
                <td style="padding:0 0 12px 0;">
                  <div style="font-family:${emailFontFamily}; color:${theme.foreground}; font-size:12px; opacity:.85;">
                    ${brandName} • Security
                  </div>
                </td>
              </tr>

              <tr>
                <td style="background:${theme.card};border:1px solid ${theme.border};border-radius:16px;overflow:hidden;">
                  ${logoBlock}

                  <div style="padding:22px 22px 6px 22px;">
                    <div style="font-family:${emailFontFamily}; color:${theme.foreground}; font-size:18px; font-weight:800; letter-spacing:.2px;">
                      ${heading}
                    </div>

                    <div style="height:10px;"></div>

                    <div style="font-family:${emailFontFamily}; color:${theme.foreground}; font-size:14px; line-height:1.65;">
                      ${input.bodyHtml}
                    </div>

                    <div style="height:6px;"></div>
                    ${ctaBlock}
                    ${secondaryBlock}
                    ${safetyBlock}

                    <div style="height:18px;"></div>

                    <div style="font-family:${emailFontFamily}; color:${theme.mutedForeground}; font-size:12px;">
                      — ${brandName}
                    </div>
                  </div>

                  <div style="padding:0 22px 18px 22px;">
                    <div style="font-family:${emailFontFamily}; color:${theme.mutedForeground}; font-size:11px; line-height:1.55; opacity:.9;">
                      This is an automated email. If you need help, contact your system administrator.
                    </div>
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding:14px 6px 0 6px;">
                  <div style="font-family:${emailFontFamily}; color:${theme.mutedForeground}; font-size:11px; opacity:.85;">
                    © ${year} ${brandName}
                  </div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </div>
    `
}
