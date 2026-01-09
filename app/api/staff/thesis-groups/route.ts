/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"

import { env } from "@/lib/env"
import { requireRole } from "@/lib/rbac"
import { listThesisGroups } from "@/lib/thesis-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function safeInt(v: unknown, fallback: number, min: number, max: number) {
    const n = typeof v === "string" ? Number(v) : Number(v)
    if (!Number.isFinite(n)) return fallback
    const i = Math.trunc(n)
    return Math.min(Math.max(i, min), max)
}

async function requireStaffOrAdmin(req: NextRequest) {
    // Make this resilient in case your requireRole signature differs
    try {
        return await (requireRole as any)(req, ["staff", "admin"])
    } catch {
        return await (requireRole as any)(["staff", "admin"])
    }
}

export async function GET(req: NextRequest) {
    try {
        if (!env.DATABASE_URL) {
            return NextResponse.json(
                { ok: false, message: "Database is not configured (DATABASE_URL missing)." },
                { status: 500 }
            )
        }

        const auth = await requireStaffOrAdmin(req)
        if (!auth?.ok) {
            return NextResponse.json(
                { ok: false, message: auth?.message ?? "Forbidden" },
                { status: auth?.status ?? 403 }
            )
        }

        const url = new URL(req.url)
        const q = String(url.searchParams.get("q") ?? "").trim()
        const limit = safeInt(url.searchParams.get("limit"), 20, 5, 200)
        const offset = safeInt(url.searchParams.get("offset"), 0, 0, 1_000_000)

        const res = await listThesisGroups({ q, limit, offset })
        return NextResponse.json({ ok: true, total: res.total, groups: res.groups })
    } catch (err: any) {
        console.error("GET /api/staff/thesis-groups failed:", err)
        return NextResponse.json({ ok: false, message: "Internal Server Error" }, { status: 500 })
    }
}
