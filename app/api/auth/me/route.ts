import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { createSession, getUserByEmail, getUserFromSession, SESSION_COOKIE } from "@/lib/auth"
import { verifyPassword, isValidEmail } from "@/lib/security"

export const runtime = "nodejs"

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ ok: false })

  const user = await getUserFromSession(token)
  if (!user) return NextResponse.json({ ok: false })

  return NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_key: user.avatar_key },
  })
}

// Kept for compatibility: POST here performs login (creates session cookie)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email ?? "").trim()
  const password = String(body.password ?? "")

  if (!isValidEmail(email) || !password) {
    return NextResponse.json({ ok: false, message: "Invalid credentials" }, { status: 400 })
  }

  const user = await getUserByEmail(email)
  if (!user) {
    return NextResponse.json({ ok: false, message: "Invalid credentials" }, { status: 401 })
  }

  if (user.status !== "active") {
    return NextResponse.json({ ok: false, message: "Account disabled" }, { status: 403 })
  }

  const ok = await verifyPassword(password, user.password_hash)
  if (!ok) {
    return NextResponse.json({ ok: false, message: "Invalid credentials" }, { status: 401 })
  }

  const session = await createSession(user.id)

  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_key: user.avatar_key },
  })

  res.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })

  return res
}
