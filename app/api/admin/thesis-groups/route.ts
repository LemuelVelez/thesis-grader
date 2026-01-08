/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"

import { env } from "@/lib/env"
import { requireAdminFromCookies } from "@/lib/admin-auth"
import { createThesisGroup, listThesisGroups } from "@/lib/thesis-admin"

export const runtime = "nodejs"

function safeInt(v: unknown, fallback: number, min: number, max: number) {
    const n = typeof v === "string" ? Number(v) : Number(v)
    if (!Number.isFinite(n)) return fallback
    const i = Math.trunc(n)
    return Math.min(Math.max(i, min), max)
}

export async function GET(req: Request) {
    try {
        if (!env.DATABASE_URL) {
            return NextResponse.json({ ok: false, message: "Database is not configured (DATABASE_URL missing)." }, { status: 500 })
        }

        const auth = await requireAdminFromCookies()
        if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status })

        const url = new URL(req.url)
        const q = String(url.searchParams.get("q") ?? "").trim()
        const limit = safeInt(url.searchParams.get("limit"), 20, 5, 200)
        const offset = safeInt(url.searchParams.get("offset"), 0, 0, 1_000_000)

        const res = await listThesisGroups({ q, limit, offset })
        return NextResponse.json({ ok: true, total: res.total, groups: res.groups })
    } catch (err: any) {
        console.error("GET /api/admin/thesis-groups failed:", err)
        return NextResponse.json({ ok: false, message: "Internal Server Error" }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        if (!env.DATABASE_URL) {
            return NextResponse.json({ ok: false, message: "Database is not configured (DATABASE_URL missing)." }, { status: 500 })
        }

        const auth = await requireAdminFromCookies()
        if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status })

        const body = await req.json().catch(() => ({} as any))

        const title = String(body.title ?? "").trim()
        const program = body.program != null ? String(body.program).trim() : null
        const term = body.term != null ? String(body.term).trim() : null
        const adviserEmail = body.adviserEmail != null ? String(body.adviserEmail).trim() : null

        const res = await createThesisGroup(
            { title, program: program || null, term: term || null, adviserEmail: adviserEmail || null },
            auth.actor
        )

        if (!res.ok) {
            return NextResponse.json({ ok: false, message: res.message }, { status: 400 })
        }

        return NextResponse.json({ ok: true, groupId: res.groupId })
    } catch (err: any) {
        console.error("POST /api/admin/thesis-groups failed:", err)
        return NextResponse.json({ ok: false, message: "Internal Server Error" }, { status: 500 })
    }
}
