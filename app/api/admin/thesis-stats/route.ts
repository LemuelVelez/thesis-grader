/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"

import { env } from "@/lib/env"
import { requireAdminFromCookies } from "@/lib/admin-auth"
import { getThesisDashboardStats } from "@/lib/thesis-admin"

export const runtime = "nodejs"

export async function GET() {
    try {
        if (!env.DATABASE_URL) {
            return NextResponse.json({ ok: false, message: "Database is not configured (DATABASE_URL missing)." }, { status: 500 })
        }

        const auth = await requireAdminFromCookies()
        if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status })

        const stats = await getThesisDashboardStats()
        return NextResponse.json({ ok: true, stats })
    } catch (err: any) {
        console.error("GET /api/admin/thesis-stats failed:", err)
        return NextResponse.json({ ok: false, message: "Internal Server Error" }, { status: 500 })
    }
}
