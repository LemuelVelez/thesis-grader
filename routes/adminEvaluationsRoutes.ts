/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { requireActor, assertRoles } from "@/lib/apiAuth"
import { errorJson } from "@/lib/http"

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
 * Admin evaluation overview for:
 * - staff evaluations (table: evaluations)
 * - student feedback (table: student_evaluations)
 *
 * IMPORTANT FIX:
 * - Do NOT cast to enum types (like ::student_eval_status) because that can 500 if the enum/type differs or is missing.
 * - Compare using status::text in a case-insensitive way instead.
 */
export async function GET(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        assertRoles(actor, ["admin"])

        const sp = req.nextUrl.searchParams

        const type = String(sp.get("type") ?? "staff").toLowerCase()
        if (type !== "staff" && type !== "student") {
            return NextResponse.json({ ok: false, message: "Invalid type" }, { status: 400 })
        }

        const q = String(sp.get("q") ?? "").trim()
        const status = String(sp.get("status") ?? "").trim()
        const scheduleId = String(sp.get("scheduleId") ?? "").trim()

        // staff list uses evaluatorId; student list uses studentId
        const evaluatorId = String(sp.get("evaluatorId") ?? "").trim()
        const studentId = String(sp.get("studentId") ?? "").trim()

        const limit = normLimit(sp.get("limit"), 200)
        const offset = normOffset(sp.get("offset"))

        const like = q ? `%${q}%` : null

        if (type === "staff") {
            const where: string[] = []
            const values: any[] = []
            let i = 1

            if (like) {
                where.push(
                    `(
                        coalesce(tg.title,'') ilike $${i}
                        or coalesce(tg.program,'') ilike $${i}
                        or coalesce(tg.term,'') ilike $${i}
                        or coalesce(ds.room,'') ilike $${i}
                        or coalesce(u.name,'') ilike $${i}
                        or coalesce(u.email,'') ilike $${i}
                    )`
                )
                values.push(like)
                i++
            }

            if (status) {
                // SAFE: no enum cast, works for text or enum columns
                where.push(`lower(e.status::text) = lower($${i})`)
                values.push(status)
                i++
            }

            if (scheduleId) {
                where.push(`e.schedule_id = $${i}`)
                values.push(scheduleId)
                i++
            }

            if (evaluatorId) {
                where.push(`e.evaluator_id = $${i}`)
                values.push(evaluatorId)
                i++
            }

            const whereSql = where.length ? `where ${where.join(" and ")}` : ""

            const countQ = `
                select count(*)::int as count
                from evaluations e
                join defense_schedules ds on ds.id = e.schedule_id
                join thesis_groups tg on tg.id = ds.group_id
                join users u on u.id = e.evaluator_id
                ${whereSql}
            `

            const listQ = `
                select
                    e.id as "id",
                    e.status,
                    e.submitted_at as "submittedAt",
                    e.locked_at as "lockedAt",
                    e.created_at as "createdAt",

                    ds.id as "scheduleId",
                    ds.scheduled_at as "scheduledAt",
                    ds.room,
                    ds.status as "scheduleStatus",

                    tg.id as "groupId",
                    tg.title as "groupTitle",
                    tg.program,
                    tg.term,

                    u.id as "evaluatorId",
                    u.name as "evaluatorName",
                    u.email as "evaluatorEmail",
                    u.role as "evaluatorRole",
                    u.status as "evaluatorStatus"
                from evaluations e
                join defense_schedules ds on ds.id = e.schedule_id
                join thesis_groups tg on tg.id = ds.group_id
                join users u on u.id = e.evaluator_id
                ${whereSql}
                order by ds.scheduled_at desc nulls last, e.created_at desc
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
        }

        // type === "student"
        {
            const where: string[] = []
            const values: any[] = []
            let i = 1

            if (like) {
                where.push(
                    `(
                        coalesce(tg.title,'') ilike $${i}
                        or coalesce(tg.program,'') ilike $${i}
                        or coalesce(tg.term,'') ilike $${i}
                        or coalesce(ds.room,'') ilike $${i}
                        or coalesce(u.name,'') ilike $${i}
                        or coalesce(u.email,'') ilike $${i}
                    )`
                )
                values.push(like)
                i++
            }

            if (status) {
                // SAFE: no enum cast, works for text or enum columns
                where.push(`lower(se.status::text) = lower($${i})`)
                values.push(status)
                i++
            }

            if (scheduleId) {
                where.push(`se.schedule_id = $${i}`)
                values.push(scheduleId)
                i++
            }

            if (studentId) {
                where.push(`se.student_id = $${i}`)
                values.push(studentId)
                i++
            }

            const whereSql = where.length ? `where ${where.join(" and ")}` : ""

            const countQ = `
                select count(*)::int as count
                from student_evaluations se
                join defense_schedules ds on ds.id = se.schedule_id
                join thesis_groups tg on tg.id = ds.group_id
                join users u on u.id = se.student_id
                ${whereSql}
            `

            const listQ = `
                select
                    se.id as "id",
                    se.status,
                    se.submitted_at as "submittedAt",
                    se.locked_at as "lockedAt",
                    se.created_at as "createdAt",
                    se.updated_at as "updatedAt",

                    ds.id as "scheduleId",
                    ds.scheduled_at as "scheduledAt",
                    ds.room,
                    ds.status as "scheduleStatus",

                    tg.id as "groupId",
                    tg.title as "groupTitle",
                    tg.program,
                    tg.term,

                    u.id as "studentId",
                    u.name as "studentName",
                    u.email as "studentEmail"
                from student_evaluations se
                join defense_schedules ds on ds.id = se.schedule_id
                join thesis_groups tg on tg.id = ds.group_id
                join users u on u.id = se.student_id
                ${whereSql}
                order by se.updated_at desc nulls last
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
        }
    } catch (err: any) {
        return errorJson(err, "Failed to fetch admin evaluation overview")
    }
}
