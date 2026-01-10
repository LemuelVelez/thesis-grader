/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { requireActor, assertRoles } from "@/lib/apiAuth"
import { errorJson } from "@/lib/http"

function normLimit(v: unknown, fallback = 200) {
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) return fallback
    return Math.min(1000, Math.floor(n))
}

function normOffset(v: unknown) {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) return 0
    return Math.floor(n)
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        // groups are used by staff/admin pages
        assertRoles(actor, ["staff", "admin"])

        const sp = req.nextUrl.searchParams
        const resource = String(sp.get("resource") ?? "").toLowerCase()

        if (resource !== "all") {
            return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
        }

        const q = String(sp.get("q") ?? "").trim()
        const like = q ? `%${q}%` : null

        const limit = normLimit(sp.get("limit"), 500)
        const offset = normOffset(sp.get("offset"))

        const where: string[] = []
        const values: any[] = []
        let i = 1

        if (like) {
            where.push(`(coalesce(title,'') ilike $${i} or coalesce(program,'') ilike $${i} or coalesce(term,'') ilike $${i})`)
            values.push(like)
            i++
        }

        const whereSql = where.length ? `where ${where.join(" and ")}` : ""

        const countQ = `
            select count(*)::int as total
            from thesis_groups
            ${whereSql}
        `

        const listQ = `
            select
                id,
                title,
                title as name,
                program,
                term
            from thesis_groups
            ${whereSql}
            order by title asc nulls last, id asc
            limit $${i} offset $${i + 1}
        `

        const [{ rows: countRows }, { rows }] = await Promise.all([
            db.query(countQ, values),
            db.query(listQ, [...values, limit, offset]),
        ])

        return NextResponse.json({
            ok: true,
            total: countRows?.[0]?.total ?? 0,
            groups: rows ?? [],
        })
    } catch (err: any) {
        return errorJson(err, "Failed to fetch groups")
    }
}
