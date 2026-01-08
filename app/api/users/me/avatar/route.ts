import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { db } from "@/lib/db"
import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth"

export const runtime = "nodejs"

export async function PATCH(req: Request) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value
    if (!token) return NextResponse.json({ ok: false }, { status: 401 })

    const user = await getUserFromSession(token)
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const key = String(body.key ?? "").trim()

    if (!key) {
        return NextResponse.json({ ok: false, message: "Missing key" }, { status: 400 })
    }

    // Basic safety: must be under avatars/userId/
    if (!key.startsWith(`avatars/${user.id}/`)) {
        return NextResponse.json({ ok: false, message: "Invalid avatar key" }, { status: 400 })
    }

    await db.query(`update users set avatar_key = $1, updated_at = now() where id = $2`, [key, user.id])

    return NextResponse.json({ ok: true, avatar_key: key })
}
