/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"

import { errorJson } from "@/lib/http"
import { requireActor, assertRoles } from "@/lib/apiAuth"
import { AuditController } from "@/controllers/auditController"

function normLimit(n: unknown, fallback = 50) {
    const x = Number(n)
    if (!Number.isFinite(x) || x <= 0) return fallback
    return Math.min(200, Math.floor(x))
}

function normOffset(n: unknown) {
    const x = Number(n)
    if (!Number.isFinite(x) || x < 0) return 0
    return Math.floor(x)
}

function normPage(n: unknown) {
    const x = Number(n)
    if (!Number.isFinite(x) || x <= 0) return 1
    return Math.floor(x)
}

/**
 * GET /api/admin/audit
 * Supports these query styles (to avoid 500s from old params):
 * - limit & offset
 * - limit & page (1-based)
 * - take & skip (Prisma-style)
 */
export async function GET(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        assertRoles(actor, ["admin"])

        const sp = req.nextUrl.searchParams

        const q = (sp.get("q") ?? "").trim()
        const action = (sp.get("action") ?? "").trim() || undefined
        const entity = (sp.get("entity") ?? "").trim() || undefined
        const actorId = (sp.get("actorId") ?? sp.get("userId") ?? "").trim() || undefined

        const from = (sp.get("from") ?? "").trim() || undefined
        const to = (sp.get("to") ?? "").trim() || undefined

        const limit = normLimit(sp.get("limit") ?? sp.get("take"), 50)

        // Prefer explicit offset/skip. If not provided, accept page.
        let offset = normOffset(sp.get("offset") ?? sp.get("skip"))
        const hasOffset = sp.has("offset") || sp.has("skip")

        if (!hasOffset && sp.has("page")) {
            const page = normPage(sp.get("page"))
            offset = (page - 1) * limit
        }

        const out = await AuditController.listLogs({
            q,
            action,
            entity,
            actorId,
            from,
            to,
            limit,
            offset,
        })

        return NextResponse.json({
            ok: true,
            ...out,
            limit,
            offset,
        })
    } catch (err: any) {
        return errorJson(err, "Failed to fetch audit logs")
    }
}
