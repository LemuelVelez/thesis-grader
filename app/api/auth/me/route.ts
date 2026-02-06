/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { db } from "@/lib/db"
import { createSession, getUserByEmail, getUserFromSession, SESSION_COOKIE } from "@/lib/auth"
import { verifyPassword, isValidEmail } from "@/lib/security"

export const runtime = "nodejs"

async function getSessionUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return { token: null, user: null }

  const user = await getUserFromSession(token)
  if (!user) return { token: null, user: null }

  return { token, user }
}

export async function GET() {
  const { user } = await getSessionUser()
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

// Added for settings/profile update compatibility
export async function PATCH(req: Request) {
  const { user } = await getSessionUser()
  if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const nextName =
    typeof body.name === "string"
      ? body.name.trim()
      : undefined

  const avatarRaw = body.avatar_key ?? body.avatarKey
  const nextAvatarKey =
    avatarRaw === null
      ? null
      : typeof avatarRaw === "string"
        ? avatarRaw.trim()
        : undefined

  const updates: string[] = []
  const values: any[] = []

  if (nextName !== undefined) {
    values.push(nextName || null)
    updates.push(`name = $${values.length}`)
  }

  if (nextAvatarKey !== undefined) {
    values.push(nextAvatarKey || null)
    updates.push(`avatar_key = $${values.length}`)
  }

  if (!updates.length) {
    return NextResponse.json({ ok: false, message: "No valid fields to update" }, { status: 400 })
  }

  const userIdParam = values.length + 1
  const result = await db.query(
    `
      update users
      set ${updates.join(", ")}, updated_at = now()
      where id = $${userIdParam}
      returning id, name, email, role, avatar_key
    `,
    [...values, user.id]
  )

  const updated = result.rows?.[0]
  if (!updated) {
    return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      avatar_key: updated.avatar_key,
    },
  })
}

// Alias PUT -> PATCH to prevent 405 from clients using PUT
export async function PUT(req: Request) {
  return PATCH(req)
}

// Optional logout compatibility on /api/auth/me
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
  return res
}

// Handle preflight/unsupported-method probing cleanly
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    },
  })
}
