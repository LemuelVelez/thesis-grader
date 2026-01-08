import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import { consumePasswordReset, deleteAllSessionsForUser } from "@/lib/auth"
import { hashPassword } from "@/lib/security"

export const runtime = "nodejs"

export async function POST(req: Request) {
    const body = await req.json().catch(() => ({}))
    const token = String(body.token ?? "").trim()
    const newPassword = String(body.password ?? "")

    if (!token || newPassword.length < 8) {
        return NextResponse.json(
            { ok: false, message: "Invalid token or password too short (min 8 characters)." },
            { status: 400 }
        )
    }

    const userId = await consumePasswordReset(token)
    if (!userId) {
        return NextResponse.json({ ok: false, message: "Invalid or expired reset token." }, { status: 400 })
    }

    const passwordHash = await hashPassword(newPassword)

    await db.query(`update users set password_hash = $1, updated_at = now() where id = $2`, [passwordHash, userId])

    // Log out all existing sessions after password change
    await deleteAllSessionsForUser(userId)

    await db.query(
        `
    insert into audit_logs (actor_id, action, entity, entity_id, details)
    values ($1, 'password_reset_completed', 'users', $1, $2::jsonb)
  `,
        [userId, JSON.stringify({ via: "reset-password" })]
    )

    return NextResponse.json({ ok: true })
}
