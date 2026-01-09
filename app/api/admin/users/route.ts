/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { env } from "@/lib/env"
import { getUserFromSession, SESSION_COOKIE, type Role } from "@/lib/auth"
import { requireRole } from "@/lib/rbac"
import { hashPassword, isValidEmail, randomToken } from "@/lib/security"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function isRole(v: unknown): v is Role {
    return v === "student" || v === "staff" || v === "admin"
}

function safeInt(v: unknown, fallback: number, min: number, max: number) {
    const n = typeof v === "string" ? Number(v) : Number(v)
    if (!Number.isFinite(n)) return fallback
    const i = Math.trunc(n)
    return Math.min(Math.max(i, min), max)
}

async function requireAdmin(req: NextRequest) {
    const cookieToken = req.cookies.get(SESSION_COOKIE)?.value
    const authHeader = req.headers.get("authorization") || ""
    const bearerToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : ""
    const token = cookieToken || bearerToken

    if (!token) return { ok: false as const, status: 401, message: "Unauthorized" }

    const actor = await getUserFromSession(token)
    if (!actor) return { ok: false as const, status: 401, message: "Unauthorized" }

    try {
        requireRole(actor, ["admin"])
    } catch {
        return { ok: false as const, status: 403, message: "Forbidden" }
    }

    return { ok: true as const, actor }
}

export async function GET(req: NextRequest) {
    try {
        if (!env.DATABASE_URL) {
            return NextResponse.json(
                { ok: false, message: "Database is not configured (DATABASE_URL missing)." },
                { status: 500 }
            )
        }

        const auth = await requireAdmin(req)
        if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status })

        const url = new URL(req.url)
        const q = String(url.searchParams.get("q") ?? "").trim()
        const limit = safeInt(url.searchParams.get("limit"), 50, 1, 200)
        const offset = safeInt(url.searchParams.get("offset"), 0, 0, 1_000_000)

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
    } catch (err: any) {
        console.error("GET /api/admin/users failed:", err)
        return NextResponse.json(
            {
                ok: false,
                message:
                    process.env.NODE_ENV !== "production"
                        ? `Internal error: ${String(err?.message ?? err)}`
                        : "Internal Server Error",
            },
            { status: 500 }
        )
    }
}

export async function POST(req: NextRequest) {
    try {
        if (!env.DATABASE_URL) {
            return NextResponse.json(
                { ok: false, message: "Database is not configured (DATABASE_URL missing)." },
                { status: 500 }
            )
        }

        const auth = await requireAdmin(req)
        if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status })
        const actor = auth.actor

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
        values ($1, $2, $3::thesis_role, 'active'::user_status, $4)
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
            if (err?.code === "23505") {
                return NextResponse.json({ ok: false, message: "Email already exists." }, { status: 409 })
            }
            console.error("POST /api/admin/users failed:", err)
            return NextResponse.json({ ok: false, message: "Failed to create user." }, { status: 500 })
        }
    } catch (err: any) {
        console.error("POST /api/admin/users failed:", err)
        return NextResponse.json(
            {
                ok: false,
                message:
                    process.env.NODE_ENV !== "production"
                        ? `Internal error: ${String(err?.message ?? err)}`
                        : "Internal Server Error",
            },
            { status: 500 }
        )
    }
}
