/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { requireActor, assertRoles } from "@/lib/apiAuth"
import { errorJson } from "@/lib/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST
 *  - mode=single: create evaluation row for (scheduleId, evaluatorId) if missing
 *  - mode=panelists: create evaluation rows for all panelists in schedule_panelists for scheduleId
 *
 * DELETE
 *  - removes evaluation row for (scheduleId, evaluatorId)
 *  - safe by default: only if not submitted/locked (unless force=1)
 */

export async function POST(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        assertRoles(actor, ["admin"])

        const body = await req.json().catch(() => ({}))
        const mode = String(body.mode ?? "single").toLowerCase()
        const scheduleId = String(body.scheduleId ?? "").trim()

        if (!scheduleId) {
            return NextResponse.json({ ok: false, message: "scheduleId is required" }, { status: 400 })
        }

        if (mode === "panelists") {
            // IMPORTANT: per migration 001_init.sql the table name is schedule_panelists (NOT defense_schedule_panelists)
            const r = await db.query(
                `
                insert into evaluations (schedule_id, evaluator_id, status)
                select
                    p.schedule_id,
                    p.staff_id,
                    'pending'
                from schedule_panelists p
                where p.schedule_id = $1
                  and not exists (
                    select 1
                    from evaluations e
                    where e.schedule_id = p.schedule_id
                      and e.evaluator_id = p.staff_id
                  )
                `,
                [scheduleId]
            )

            return NextResponse.json({ ok: true, createdCount: r.rowCount ?? 0 })
        }

        // mode === "single"
        const evaluatorId = String(body.evaluatorId ?? "").trim()
        if (!evaluatorId) {
            return NextResponse.json({ ok: false, message: "evaluatorId is required" }, { status: 400 })
        }

        // Validate staff user exists
        const u = await db.query(`select id, role from users where id = $1 limit 1`, [evaluatorId])
        const role = String(u.rows?.[0]?.role ?? "").toLowerCase()
        if (!u.rows?.[0] || role !== "staff") {
            return NextResponse.json({ ok: false, message: "Selected user must be STAFF" }, { status: 400 })
        }

        const ins = await db.query(
            `
            insert into evaluations (schedule_id, evaluator_id, status)
            select $1, $2, 'pending'
            where not exists (
              select 1 from evaluations where schedule_id = $1 and evaluator_id = $2
            )
            returning id
            `,
            [scheduleId, evaluatorId]
        )

        const created = Boolean(ins.rows?.[0]?.id)
        return NextResponse.json({ ok: true, created, id: ins.rows?.[0]?.id ?? null })
    } catch (err: any) {
        return errorJson(err, "Failed to assign evaluation")
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        assertRoles(actor, ["admin"])

        const sp = req.nextUrl.searchParams
        const scheduleId = String(sp.get("scheduleId") ?? "").trim()
        const evaluatorId = String(sp.get("evaluatorId") ?? "").trim()
        const force = String(sp.get("force") ?? "").trim() === "1"

        if (!scheduleId || !evaluatorId) {
            return NextResponse.json({ ok: false, message: "scheduleId and evaluatorId are required" }, { status: 400 })
        }

        // Safe by default: only delete if not submitted and not locked
        const r = await db.query(
            `
            delete from evaluations
            where schedule_id = $1
              and evaluator_id = $2
              and (
                $3::boolean = true
                or (
                  submitted_at is null
                  and locked_at is null
                  and lower(coalesce(status::text,'')) not in ('submitted','locked')
                )
              )
            `,
            [scheduleId, evaluatorId, force]
        )

        return NextResponse.json({ ok: true, removed: (r.rowCount ?? 0) > 0 })
    } catch (err: any) {
        return errorJson(err, "Failed to unassign evaluation")
    }
}
