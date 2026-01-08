/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { db } from "@/lib/db"
import { env } from "@/lib/env"
import { deleteAllSessionsForUser, getUserFromSession, SESSION_COOKIE, type Role } from "@/lib/auth"
import { requireRole } from "@/lib/rbac"
import { hashPassword } from "@/lib/security"

export const runtime = "nodejs"

function isRole(v: unknown): v is Role {
    return v === "student" || v === "staff" || v === "admin"
}
function isStatus(v: unknown): v is "active" | "disabled" {
    return v === "active" || v === "disabled"
}

async function requireAdminFromCookies() {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
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

async function getIdFromCtx(ctx: { params: Promise<{ id: string }> }) {
    const p = await ctx.params
    return String(p?.id ?? "").trim()
}

// This route acts as a backwards-compatible alias for user-by-id operations.
// Prefer using /api/admin/users/[id].
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        if (!env.DATABASE_URL) {
            return NextResponse.json({ ok: false, message: "Database is not configured (DATABASE_URL missing)." }, { status: 500 })
        }

        const auth = await requireAdminFromCookies()
        if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status })

        const id = await getIdFromCtx(ctx)
        if (!id) return NextResponse.json({ ok: false, message: "Missing user id." }, { status: 400 })

        const q = `
      select id, name, email, role, status, avatar_key, created_at, updated_at
      from users
      where id = $1
      limit 1
    `
        const { rows } = await db.query(q, [id])
        const user = rows[0]
        if (!user) return NextResponse.json({ ok: false, message: "User not found." }, { status: 404 })

        return NextResponse.json({ ok: true, user })
    } catch (err: any) {
        console.error("GET /api/admin/[id] failed:", err)
        return NextResponse.json({ ok: false, message: "Internal Server Error" }, { status: 500 })
    }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        if (!env.DATABASE_URL) {
            return NextResponse.json({ ok: false, message: "Database is not configured (DATABASE_URL missing)." }, { status: 500 })
        }

        const auth = await requireAdminFromCookies()
        if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status })
        const actor = auth.actor

        const id = await getIdFromCtx(ctx)
        if (!id) return NextResponse.json({ ok: false, message: "Missing user id." }, { status: 400 })

        const body = await req.json().catch(() => ({} as any))

        const patchName = body.name != null ? String(body.name).trim() : undefined
        const patchRole = body.role != null ? String(body.role).toLowerCase() : undefined
        const patchStatus = body.status != null ? String(body.status).toLowerCase() : undefined
        const patchPassword = body.password != null ? String(body.password) : undefined

        if (patchName !== undefined && !patchName) {
            return NextResponse.json({ ok: false, message: "Name cannot be empty." }, { status: 400 })
        }
        if (patchRole !== undefined && !isRole(patchRole)) {
            return NextResponse.json({ ok: false, message: "Invalid role." }, { status: 400 })
        }
        if (patchStatus !== undefined && !isStatus(patchStatus)) {
            return NextResponse.json({ ok: false, message: "Invalid status." }, { status: 400 })
        }
        if (patchPassword !== undefined && patchPassword.trim().length < 8) {
            return NextResponse.json({ ok: false, message: "Password too short (min 8)." }, { status: 400 })
        }

        const sets: string[] = []
        const params: any[] = []
        const details: Record<string, any> = {}

        if (patchName !== undefined) {
            params.push(patchName)
            sets.push(`name = $${params.length}`)
            details.name = true
        }
        if (patchRole !== undefined) {
            params.push(patchRole)
            sets.push(`role = $${params.length}::thesis_role`)
            details.role = patchRole
        }
        if (patchStatus !== undefined) {
            params.push(patchStatus)
            sets.push(`status = $${params.length}::user_status`)
            details.status = patchStatus
        }
        if (patchPassword !== undefined) {
            const passwordHash = await hashPassword(patchPassword.trim())
            params.push(passwordHash)
            sets.push(`password_hash = $${params.length}`)
            details.password = true
        }

        if (!sets.length) {
            return NextResponse.json({ ok: false, message: "No valid fields to update." }, { status: 400 })
        }

        params.push(id)
        const updateQ = `
      update users
      set ${sets.join(", ")}
      where id = $${params.length}
      returning id, name, email, role, status, avatar_key, created_at, updated_at
    `
        const { rows } = await db.query(updateQ, params)
        const user = rows[0]
        if (!user) return NextResponse.json({ ok: false, message: "User not found." }, { status: 404 })

        const shouldRevoke = patchPassword !== undefined || patchStatus === "disabled"
        if (shouldRevoke) {
            await deleteAllSessionsForUser(id).catch(() => null)
        }

        await db.query(
            `
        insert into audit_logs (actor_id, action, entity, entity_id, details)
        values ($1, 'user_updated', 'users', $2, $3::jsonb)
      `,
            [actor.id, id, JSON.stringify({ ...details, sessionsRevoked: shouldRevoke, via: "api/admin/[id]" })]
        )

        return NextResponse.json({ ok: true, user })
    } catch (err: any) {
        console.error("PATCH /api/admin/[id] failed:", err)
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

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        if (!env.DATABASE_URL) {
            return NextResponse.json({ ok: false, message: "Database is not configured (DATABASE_URL missing)." }, { status: 500 })
        }

        const auth = await requireAdminFromCookies()
        if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status })
        const actor = auth.actor

        const id = await getIdFromCtx(ctx)
        if (!id) return NextResponse.json({ ok: false, message: "Missing user id." }, { status: 400 })

        if (id === actor.id) {
            return NextResponse.json({ ok: false, message: "You cannot delete your own account." }, { status: 400 })
        }

        const delQ = `delete from users where id = $1 returning id`
        const { rows } = await db.query(delQ, [id])
        if (!rows[0]) return NextResponse.json({ ok: false, message: "User not found." }, { status: 404 })

        await db.query(
            `
        insert into audit_logs (actor_id, action, entity, entity_id, details)
        values ($1, 'user_deleted', 'users', $2, $3::jsonb)
      `,
            [actor.id, id, JSON.stringify({ via: "api/admin/[id]" })]
        )

        return NextResponse.json({ ok: true })
    } catch (err: any) {
        console.error("DELETE /api/admin/[id] failed:", err)
        return NextResponse.json({ ok: false, message: "Internal Server Error" }, { status: 500 })
    }
}

export async function POST() {
    return NextResponse.json({ ok: false, message: "Method not allowed. Use /api/admin/users." }, { status: 405 })
}
