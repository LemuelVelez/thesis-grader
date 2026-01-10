/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { requireActor, assertRoles } from "@/lib/apiAuth"
import { errorJson } from "@/lib/http"

function safeText(v: unknown) {
    return String(v ?? "").trim()
}

function normLimit(v: unknown, fallback = 200) {
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) return fallback
    return Math.min(500, Math.floor(n))
}

function normOffset(v: unknown) {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) return 0
    return Math.floor(n)
}

/**
 * Admin schedules list (joined with group title) so Admin Evaluation UI can show schedules
 * even when no evaluation rows exist yet.
 */
export async function GET(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        assertRoles(actor, ["admin"])

        const sp = req.nextUrl.searchParams
        const q = safeText(sp.get("q"))
        const status = safeText(sp.get("status"))
        const groupId = safeText(sp.get("groupId"))
        const from = safeText(sp.get("from"))
        const to = safeText(sp.get("to"))

        const limit = normLimit(sp.get("limit"), 200)
        const offset = normOffset(sp.get("offset"))

        const where: string[] = []
        const values: any[] = []
        let i = 1

        if (q) {
            where.push(
                `(
                    coalesce(tg.title,'') ilike $${i}
                    or coalesce(tg.program,'') ilike $${i}
                    or coalesce(tg.term,'') ilike $${i}
                    or coalesce(ds.room,'') ilike $${i}
                    or coalesce(ds.status,'') ilike $${i}
                )`
            )
            values.push(`%${q}%`)
            i++
        }

        if (status) {
            where.push(`lower(ds.status::text) = lower($${i})`)
            values.push(status)
            i++
        }

        if (groupId) {
            where.push(`ds.group_id = $${i}`)
            values.push(groupId)
            i++
        }

        if (from) {
            where.push(`ds.scheduled_at >= $${i}::timestamptz`)
            values.push(from)
            i++
        }

        if (to) {
            where.push(`ds.scheduled_at <= $${i}::timestamptz`)
            values.push(to)
            i++
        }

        const whereSql = where.length ? `where ${where.join(" and ")}` : ""

        const AGG_JOINS = `
            left join (
                select group_id, count(*)::int as student_count
                from group_members
                group by group_id
            ) gmc on gmc.group_id = tg.id
            left join (
                select schedule_id, count(*)::int as panelist_count
                from schedule_panelists
                group by schedule_id
            ) spc on spc.schedule_id = ds.id
            left join (
                select schedule_id, count(*)::int as evaluation_count
                from evaluations
                group by schedule_id
            ) ec on ec.schedule_id = ds.id
        `

        const countQ = `
            select count(*)::int as count
            from defense_schedules ds
            join thesis_groups tg on tg.id = ds.group_id
            ${whereSql}
        `

        const listQ = `
            select
                ds.id as "id",
                ds.scheduled_at as "scheduledAt",
                ds.room as "room",
                ds.status as "status",

                tg.id as "groupId",
                tg.title as "groupTitle",
                tg.program as "program",
                tg.term as "term",

                coalesce(gmc.student_count, 0)::int as "studentCount",
                coalesce(spc.panelist_count, 0)::int as "panelistCount",
                coalesce(ec.evaluation_count, 0)::int as "evaluationCount"
            from defense_schedules ds
            join thesis_groups tg on tg.id = ds.group_id
            ${AGG_JOINS}
            ${whereSql}
            order by ds.scheduled_at desc nulls last, ds.updated_at desc nulls last
            limit $${i} offset $${i + 1}
        `

        const [{ rows: countRows }, { rows }] = await Promise.all([
            db.query(countQ, values),
            db.query(listQ, [...values, limit, offset]),
        ])

        return NextResponse.json({
            ok: true,
            total: countRows?.[0]?.count ?? 0,
            items: rows ?? [],
        })
    } catch (err: any) {
        return errorJson(err, "Failed to fetch admin schedules")
    }
}
