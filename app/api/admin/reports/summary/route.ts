/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"

import { env } from "@/lib/env"
import { requireAdminFromCookies } from "@/lib/admin-auth"
import { getReportsSummary } from "@/lib/reports-admin"

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
            return NextResponse.json(
                { ok: false, message: "Database is not configured (DATABASE_URL missing)." },
                { status: 500 }
            )
        }

        const auth = await requireAdminFromCookies()
        if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status })

        const url = new URL(req.url)
        const from = String(url.searchParams.get("from") ?? "").trim()
        const to = String(url.searchParams.get("to") ?? "").trim()
        const days = safeInt(url.searchParams.get("days"), 30, 1, 365)

        const program = String(url.searchParams.get("program") ?? "").trim()
        const term = String(url.searchParams.get("term") ?? "").trim()

        const summary = await getReportsSummary({
            from: from || undefined,
            to: to || undefined,
            days,
            program: program || undefined,
            term: term || undefined,
        })

        return NextResponse.json({ ok: true, summary })
    } catch (err: any) {
        console.error("GET /api/admin/reports/summary failed:", err)
        return NextResponse.json({ ok: false, message: "Internal Server Error" }, { status: 500 })
    }
}
