import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { createSession, getUserByEmail, SESSION_COOKIE } from "@/lib/auth"
import { isValidEmail, verifyPassword } from "@/lib/security"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * GET kept as a simple health/debug check (optional).
 */
export async function GET(req: NextRequest) {
    const { rows } = await db.query("select now() as now")

    // Helpful debug: tells you if browser sent tg_session cookie to this endpoint
    const hasCookie = !!req.cookies.get(SESSION_COOKIE)?.value

    const res = NextResponse.json({ ok: true, now: rows[0].now, hasSessionCookie: hasCookie })
    res.headers.set("Cache-Control", "no-store")
    return res
}

/**
 * POST performs login (creates session + sets httpOnly cookie).
 */
export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? "").trim()
    const password = String(body.password ?? "")

    if (!isValidEmail(email) || !password) {
        const res = NextResponse.json({ ok: false, message: "Invalid credentials" }, { status: 400 })
        res.headers.set("Cache-Control", "no-store")
        return res
    }

    const user = await getUserByEmail(email)
    if (!user) {
        const res = NextResponse.json({ ok: false, message: "Invalid credentials" }, { status: 401 })
        res.headers.set("Cache-Control", "no-store")
        return res
    }

    if (user.status !== "active") {
        const res = NextResponse.json({ ok: false, message: "Account disabled" }, { status: 403 })
        res.headers.set("Cache-Control", "no-store")
        return res
    }

    const ok = await verifyPassword(password, user.password_hash)
    if (!ok) {
        const res = NextResponse.json({ ok: false, message: "Invalid credentials" }, { status: 401 })
        res.headers.set("Cache-Control", "no-store")
        return res
    }

    const session = await createSession(user.id)

    const res = NextResponse.json({
        ok: true,
        user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_key: user.avatar_key },
    })

    // Prevent any caching surprises
    res.headers.set("Cache-Control", "no-store")

    // IMPORTANT: path "/" ensures cookie is sent to /api/admin/* too
    res.cookies.set(SESSION_COOKIE, session.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
    })

    return res
}
