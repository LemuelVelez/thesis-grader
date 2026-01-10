/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { requireActor, assertRoles } from "@/lib/apiAuth"
import { errorJson } from "@/lib/http"

function safeText(v: unknown) {
    return String(v ?? "").trim()
}

/**
 * Admin schedule detail (by scheduleId):
 * - schedule + group + adviser
 * - students in group
 * - panelists in schedule_panelists
 * - evaluation rows (if any) for this schedule
 */
export async function GET(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        assertRoles(actor, ["admin"])

        const sp = req.nextUrl.searchParams
        const id = safeText(sp.get("id"))

        if (!id) {
            return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })
        }

        const baseQ = `
            select
                ds.id as "scheduleId",
                ds.scheduled_at as "scheduledAt",
                ds.room as "room",
                ds.status as "scheduleStatus",

                tg.id as "groupId",
                tg.title as "groupTitle",
                tg.program as "program",
                tg.term as "term",

                tg.adviser_id as "adviserId",
                au.name as "adviserName",
                au.email as "adviserEmail"
            from defense_schedules ds
            join thesis_groups tg on tg.id = ds.group_id
            left join users au on au.id = tg.adviser_id
            where ds.id = $1
            limit 1
        `
        const { rows: baseRows } = await db.query(baseQ, [id])
        const base = baseRows?.[0] ?? null

        if (!base) {
            return NextResponse.json({ ok: false, message: "Schedule not found" }, { status: 404 })
        }

        const studentsQ = `
            select
                u.id,
                u.name,
                u.email
            from group_members gm
            join users u on u.id = gm.student_id
            where gm.group_id = $1
            order by u.name asc nulls last, u.email asc
        `
        const { rows: students } = await db.query(studentsQ, [base.groupId])

        const panelistsQ = `
            select
                u.id,
                u.name,
                u.email
            from schedule_panelists sp
            join users u on u.id = sp.staff_id
            where sp.schedule_id = $1
            order by u.name asc nulls last, u.email asc
        `
        const { rows: panelists } = await db.query(panelistsQ, [base.scheduleId])

        const evalsQ = `
            select
                e.id as "id",
                e.status as "status",
                e.submitted_at as "submittedAt",
                e.locked_at as "lockedAt",
                e.created_at as "createdAt",
                u.id as "evaluatorId",
                u.name as "evaluatorName",
                u.email as "evaluatorEmail"
            from evaluations e
            join users u on u.id = e.evaluator_id
            where e.schedule_id = $1
            order by u.name asc nulls last, e.created_at desc
        `
        const { rows: evalRows } = await db.query(evalsQ, [base.scheduleId])

        return NextResponse.json({
            ok: true,
            detail: {
                schedule: {
                    id: base.scheduleId,
                    scheduledAt: base.scheduledAt,
                    room: base.room,
                    status: base.scheduleStatus,
                },
                group: {
                    id: base.groupId,
                    title: base.groupTitle,
                    program: base.program,
                    term: base.term,
                    adviser: base.adviserId
                        ? { id: base.adviserId, name: base.adviserName, email: base.adviserEmail }
                        : null,
                    students: students ?? [],
                },
                panelists: panelists ?? [],
                evaluations: (evalRows ?? []).map((r: any) => ({
                    id: r.id,
                    status: r.status,
                    submittedAt: r.submittedAt,
                    lockedAt: r.lockedAt,
                    createdAt: r.createdAt,
                    evaluator: { id: r.evaluatorId, name: r.evaluatorName, email: r.evaluatorEmail },
                })),
            },
        })
    } catch (err: any) {
        return errorJson(err, "Failed to fetch admin schedule detail")
    }
}
