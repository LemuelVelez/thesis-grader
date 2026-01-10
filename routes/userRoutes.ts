/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"

import { db } from "@/lib/db"
import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth"

type Role = "student" | "staff" | "admin"

async function requireUser(allowed: Role[]) {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) }

    const user = await getUserFromSession(token)
    if (!user) return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) }

    const role = String(user.role || "").toLowerCase() as Role
    if (!allowed.includes(role)) return { error: NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 }) }

    return { error: null as any }
}

function clampInt(v: string | null, def: number, min: number, max: number) {
    const n = Number(v)
    if (!Number.isFinite(n)) return def
    return Math.max(min, Math.min(max, Math.trunc(n)))
}

export async function GET(req: NextRequest) {
    const auth = await requireUser(["staff", "admin"])
    if (auth.error) return auth.error

    try {
        const url = new URL(req.url)
        const resource = (url.searchParams.get("resource") || "staff").toLowerCase()
        if (resource !== "staff") {
            return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
        }

        const q = (url.searchParams.get("q") || "").trim()
        const limit = clampInt(url.searchParams.get("limit"), 50, 1, 200)
        const offset = clampInt(url.searchParams.get("offset"), 0, 0, 10_000)

        const args: any[] = []
        let where = `where lower(role) = 'staff'`

        if (q) {
            args.push(`%${q}%`)
            where += ` and (
                email ilike $1 or
                coalesce(name, '') ilike $1 or
                concat_ws(' ', first_name, last_name) ilike $1
            )`
        }

        const totalRes = await db.query(
            `
            select count(*)::int as total
            from users
            ${where}
            `,
            args
        )

        const listRes = await db.query(
            `
            select
              id,
              email,
              role,
              first_name as "firstName",
              last_name as "lastName",
              coalesce(name, concat_ws(' ', first_name, last_name), email) as "name"
            from users
            ${where}
            order by "name" asc
            limit $${args.length + 1} offset $${args.length + 2}
            `,
            [...args, limit, offset]
        )

        return NextResponse.json({ ok: true, total: totalRes.rows?.[0]?.total ?? 0, users: listRes.rows ?? [] })
    } catch (e: any) {
        return NextResponse.json({ ok: false, message: e?.message ?? "Server error" }, { status: 500 })
    }
}
