import nodemailer from "nodemailer"
import path from "node:path"
import fs from "node:fs/promises"
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
  assertServerEnv()

  const transporter = getMailer()

  const subject = "THESISGRADER — Reset your password"
  const greeting = opts.name ? `Hi ${opts.name},` : "Hi,"

  const text = [
    greeting,
    "",
    "We received a request to reset your THESISGRADER password.",
    "",
    `Reset link: ${opts.resetUrl}`,
    "",
    "If you didn’t request this, you can safely ignore this email.",
    "",
    "— THESISGRADER",
  ].join("\n")

  // Attach the local public/logo.png and embed via CID
  const logoPath = path.join(process.cwd(), "public", "logo.png")
  let logoBuffer: Buffer | null = null
  try {
    logoBuffer = await fs.readFile(logoPath)
  } catch {
    logoBuffer = null
  }

  const html = `
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Reset your THESISGRADER password.
  </div>

  <div style="margin:0;padding:0;background:#f4fff8;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#f4fff8;">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;border-collapse:collapse;">
            <tr>
              <td style="padding:0 0 12px 0;">
                <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#0b1f15; font-size:12px; opacity:.85;">
                  THESISGRADER • Security
                </div>
              </td>
            </tr>

            <tr>
              <td style="background:#ffffff;border:1px solid #d2f5e2;border-radius:16px;overflow:hidden;">
                ${logoBuffer
      ? `
                <div style="width:100%;background:#eefdf4;">
                  <img
                    src="cid:tg-logo"
                    alt="THESISGRADER"
                    width="600"
                    height="170"
                    style="display:block;width:100%;height:170px;object-fit:cover;border:0;outline:none;text-decoration:none;"
                  />
                </div>
                `
      : ""
    }

                <div style="padding:22px 22px 6px 22px;">
                  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#0b1f15; font-size:18px; font-weight:800; letter-spacing:.2px;">
                    Reset your password
                  </div>

                  <div style="height:10px;"></div>

                  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#0b1f15; font-size:14px; line-height:1.65;">
                    <p style="margin:0 0 10px 0;">${greeting}</p>
                    <p style="margin:0 0 14px 0;">
                      We received a request to reset your <b>THESISGRADER</b> password. Click the button below to continue.
                    </p>
                  </div>

                  <div style="height:6px;"></div>

                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                    <tr>
                      <td style="background:#00ff7f;border-radius:12px;">
                        <a
                          href="${opts.resetUrl}"
                          style="display:inline-block;padding:12px 16px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;
                                 font-size:14px;font-weight:800;color:#052013;text-decoration:none;border-radius:12px;"
                        >
                          Reset password
                        </a>
                      </td>
                    </tr>
                  </table>

                  <div style="height:14px;"></div>

                  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#2d5b44; font-size:12px; line-height:1.6;">
                    If the button doesn’t work, copy and paste this link:
                    <div style="word-break:break-all;margin-top:6px;padding:10px 12px;border-radius:12px;background:#eefdf4;border:1px dashed #c9f1dc;">
                      <a href="${opts.resetUrl}" style="color:#0aa36a;text-decoration:underline;">${opts.resetUrl}</a>
                    </div>
                  </div>

                  <div style="height:14px;"></div>

                  <div style="padding:12px 14px;border-radius:14px;background:#f4fff8;border:1px solid #d2f5e2;">
                    <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#0b1f15; font-size:12px; line-height:1.55;">
                      <b>Didn’t request this?</b> You can safely ignore this email. Your password won’t change unless you open the link and complete the reset.
                    </div>
                  </div>

                  <div style="height:18px;"></div>

                  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#2d5b44; font-size:12px;">
                    — THESISGRADER
                  </div>
                </div>

                <div style="padding:0 22px 18px 22px;">
                  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#2d5b44; font-size:11px; line-height:1.55; opacity:.9;">
                    This is an automated email. If you need help, contact your system administrator.
                  </div>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 6px 0 6px;">
                <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#2d5b44; font-size:11px; opacity:.85;">
                  © ${new Date().getFullYear()} THESISGRADER
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </div>
  `

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
