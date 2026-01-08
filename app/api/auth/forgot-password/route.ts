import { NextResponse } from "next/server"

import { env } from "@/lib/env"
import { db } from "@/lib/db"
import { getUserByEmail, createPasswordReset } from "@/lib/auth"
import { isValidEmail } from "@/lib/security"
import { sendPasswordResetEmail } from "@/lib/email"

export const runtime = "nodejs"

export async function POST(req: Request) {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? "").trim()

    // Always respond OK to avoid email enumeration
    const safeOk = () =>
        NextResponse.json({
            ok: true,
            message: "If an account exists for that email, a reset link will be sent.",
        })

    if (!isValidEmail(email)) return safeOk()

    const user = await getUserByEmail(email)
    if (!user) return safeOk()
    if (user.status !== "active") return safeOk()

    const reset = await createPasswordReset(user.id, 60)

    const base = String(env.APP_URL || "http://localhost:3000").replace(/\/$/, "")
    // ✅ Updated to your pages:
    const resetUrl = `${base}/auth/password/reset?token=${encodeURIComponent(reset.token)}`

    try {
        await sendPasswordResetEmail({
            to: user.email,
            name: user.name,
            resetUrl,
        })

        await db.query(
            `
        insert into audit_logs (actor_id, action, entity, entity_id, details)
        values ($1, 'password_reset_requested', 'users', $1, $2::jsonb)
      `,
            [user.id, JSON.stringify({ via: "forgot-password" })]
        )
    } catch {
        // still return safe response (do not leak)
        return safeOk()
    }

    return safeOk()
}
