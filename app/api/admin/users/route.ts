/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { db } from "@/lib/db"
import { getUserFromSession, SESSION_COOKIE, type Role } from "@/lib/auth"
import { requireRole } from "@/lib/rbac"
import { hashPassword, isValidEmail, randomToken } from "@/lib/security"

export const runtime = "nodejs"

function isRole(v: unknown): v is Role {
    return v === "student" || v === "staff" || v === "admin"
}

export async function GET(req: Request) {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })

    const actor = await getUserFromSession(token)
    if (!actor) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })

    try {
        requireRole(actor, ["admin"])
    } catch {
        return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
    }

    const url = new URL(req.url)
    const q = String(url.searchParams.get("q") ?? "").trim()
    const limitRaw = Number(url.searchParams.get("limit") ?? 50)
    const offsetRaw = Number(url.searchParams.get("offset") ?? 0)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0

    const where: string[] = []
    const params: any[] = []
    if (q) {
        params.push(`%${q}%`)
        where.push(`(u.name ilike $${params.length} or u.email ilike $${params.length})`)
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : ""

    const countQ = `
    select count(*)::int as total
    from users u
    ${whereSql}
  `
    const listQ = `
    select u.id, u.name, u.email, u.role, u.status, u.avatar_key, u.created_at, u.updated_at
    from users u
    ${whereSql}
    order by u.created_at desc
    limit $${params.length + 1}
    offset $${params.length + 2}
  `

    const countRes = await db.query(countQ, params)
    const total = countRes.rows[0]?.total ?? 0

    const listRes = await db.query(listQ, [...params, limit, offset])

    return NextResponse.json({ ok: true, total, users: listRes.rows })
}

export async function POST(req: Request) {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })

    const actor = await getUserFromSession(token)
    if (!actor) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })

    try {
        requireRole(actor, ["admin"])
    } catch {
        return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))

    const name = String(body.name ?? "").trim()
    const email = String(body.email ?? "").trim()
    const role = String(body.role ?? "student").toLowerCase()
    const passwordProvided = body.password != null && String(body.password).length > 0
    const password = passwordProvided ? String(body.password) : randomToken(12)

    if (!name) return NextResponse.json({ ok: false, message: "Name is required." }, { status: 400 })
    if (!isValidEmail(email)) return NextResponse.json({ ok: false, message: "Invalid email." }, { status: 400 })
    if (!isRole(role)) return NextResponse.json({ ok: false, message: "Invalid role." }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ ok: false, message: "Password too short (min 8)." }, { status: 400 })

    const passwordHash = await hashPassword(password)

    try {
        const insertQ = `
      insert into users (name, email, role, status, password_hash)
      values ($1, $2, $3, 'active', $4)
      returning id, name, email, role, status, avatar_key, created_at, updated_at
    `
        const { rows } = await db.query(insertQ, [name, email, role, passwordHash])
        const user = rows[0]

        await db.query(
            `
        insert into audit_logs (actor_id, action, entity, entity_id, details)
        values ($1, 'user_created', 'users', $2, $3::jsonb)
      `,
            [actor.id, user.id, JSON.stringify({ role })]
        )

        return NextResponse.json({
            ok: true,
            user,
            generatedPassword: passwordProvided ? null : password,
        })
    } catch (err: any) {
        // unique violation (email)
        if (err?.code === "23505") {
            return NextResponse.json({ ok: false, message: "Email already exists." }, { status: 409 })
        }
        return NextResponse.json({ ok: false, message: "Failed to create user." }, { status: 500 })
    }
}
