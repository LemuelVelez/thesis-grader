/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { requireActor } from "@/lib/apiAuth"
import { errorJson } from "@/lib/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function actorRoleOf(actor: any) {
    return String(actor?.role ?? "").toLowerCase()
}
function actorIdOf(actor: any) {
    return String(actor?.id ?? "")
}

function toFiniteNumber(v: any): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string" && v.trim()) {
        const n = Number(v)
        return Number.isFinite(n) ? n : null
    }
    return null
}

function pickScoreFromAny(value: any): number | null {
    const direct = toFiniteNumber(value)
    if (direct !== null) return direct

    if (!value || typeof value !== "object" || Array.isArray(value)) return null

    const candidates = [
        value.score,
        value.total,
        value.value,
        value.points,
        value.memberScore,
        value.finalScore,
        value.overallScore,
        value.groupScore,
        value.systemScore,
    ]

    for (const c of candidates) {
        const n = toFiniteNumber(c)
        if (n !== null) return n
    }
    return null
}

function pickCommentFromAny(value: any): string | null {
    if (typeof value === "string" && value.trim()) return value.trim()
    if (!value || typeof value !== "object" || Array.isArray(value)) return null

    const candidates = [value.comment, value.comments, value.note, value.notes, value.feedback, value.reason]
    for (const c of candidates) {
        if (typeof c === "string" && c.trim()) return c.trim()
    }
    return null
}

function pickStudentScore(extras: any, studentId: string): { score: number | null; comment: string | null } {
    if (!extras || typeof extras !== "object") return { score: null, comment: null }

    const containers = [
        extras.members,
        extras.memberScores,
        extras.perMember,
        extras.individuals,
        extras.students,
        extras.studentScores,
    ]

    // object map: { [studentId]: {...} }
    for (const c of containers) {
        if (c && typeof c === "object" && !Array.isArray(c)) {
            const raw = (c as any)[studentId]
            if (raw !== undefined) {
                return { score: pickScoreFromAny(raw), comment: pickCommentFromAny(raw) }
            }
        }
    }

    // array: [{ id/studentId, score, comment }]
    for (const c of containers) {
        if (Array.isArray(c)) {
            const hit = c.find((x: any) => String(x?.id ?? x?.studentId ?? x?.userId ?? "") === studentId)
            if (hit) return { score: pickScoreFromAny(hit), comment: pickCommentFromAny(hit) }
        }
    }

    return { score: null, comment: null }
}

function pickGroupScore(extras: any): { score: number | null; comment: string | null } {
    if (!extras || typeof extras !== "object") return { score: null, comment: null }

    const raw =
        extras.group ??
        extras.groupScore ??
        extras.overall ??
        extras.overallScore ??
        extras.total ??
        extras.final ??
        extras.summary ??
        null

    return { score: pickScoreFromAny(raw), comment: pickCommentFromAny(raw) }
}

function pickSystemScore(extras: any): { score: number | null; comment: string | null } {
    if (!extras || typeof extras !== "object") return { score: null, comment: null }

    const raw = extras.system ?? extras.systemScore ?? extras.systemTotal ?? extras.systemResult ?? null
    return { score: pickScoreFromAny(raw), comment: pickCommentFromAny(raw) }
}

function avg(nums: Array<number | null | undefined>): number | null {
    const xs = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    if (!xs.length) return null
    const s = xs.reduce((a, b) => a + b, 0)
    return s / xs.length
}

export async function GET(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        const role = actorRoleOf(actor)
        const studentId = actorIdOf(actor)

        if (role !== "student") {
            return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
        }

        const limitRaw = req.nextUrl.searchParams.get("limit")
        const limit = Math.min(20, Math.max(1, Number(limitRaw ?? 10) || 10))

        // schedules for the student's group(s)
        const { rows: schedRows } = await db.query(
            `
            select
              ds.id as "scheduleId",
              ds.scheduled_at as "scheduledAt",
              ds.room as room,
              ds.status as status,
              tg.id as "groupId",
              tg.title as "groupTitle",
              tg.program as program,
              tg.term as term
            from group_members gm
            join defense_schedules ds on ds.group_id = gm.group_id
            join thesis_groups tg on tg.id = gm.group_id
            where gm.student_id = $1
            order by ds.scheduled_at desc
            limit $2
            `,
            [studentId, limit]
        )

        const items: any[] = []

        for (const s of schedRows ?? []) {
            const scheduleId = String(s.scheduleId)

            const { rows: evalRows } = await db.query(
                `
                select
                  e.id as "evaluationId",
                  e.status as status,
                  e.submitted_at as "submittedAt",
                  e.locked_at as "lockedAt",
                  u.id as "evaluatorId",
                  u.name as "evaluatorName",
                  u.email as "evaluatorEmail",
                  ex.data as extras
                from evaluations e
                join users u on u.id = e.evaluator_id
                left join evaluation_extras ex on ex.evaluation_id = e.id
                where e.schedule_id = $1
                order by u.name asc
                `,
                [scheduleId]
            )

            const panelistEvaluations = (evalRows ?? []).map((r: any) => {
                const extras = (r.extras ?? {}) as any

                const group = pickGroupScore(extras)
                const system = pickSystemScore(extras)
                const me = pickStudentScore(extras, studentId)

                return {
                    evaluationId: String(r.evaluationId),
                    status: String(r.status ?? ""),
                    submittedAt: r.submittedAt ?? null,
                    lockedAt: r.lockedAt ?? null,
                    evaluator: {
                        id: String(r.evaluatorId ?? ""),
                        name: String(r.evaluatorName ?? ""),
                        email: String(r.evaluatorEmail ?? ""),
                    },
                    scores: {
                        groupScore: group.score,
                        systemScore: system.score,
                        personalScore: me.score,
                    },
                    comments: {
                        groupComment: group.comment,
                        systemComment: system.comment,
                        personalComment: me.comment,
                    },
                }
            })

            const scores = {
                groupScore: avg(panelistEvaluations.map((x: any) => x?.scores?.groupScore)),
                systemScore: avg(panelistEvaluations.map((x: any) => x?.scores?.systemScore)),
                personalScore: avg(panelistEvaluations.map((x: any) => x?.scores?.personalScore)),
            }

            const { rows: seRows } = await db.query(
                `
                select
                  se.id,
                  se.status,
                  se.answers,
                  se.submitted_at as "submittedAt",
                  se.locked_at as "lockedAt",
                  se.created_at as "createdAt",
                  se.updated_at as "updatedAt"
                from student_evaluations se
                where se.schedule_id = $1 and se.student_id = $2
                limit 1
                `,
                [scheduleId, studentId]
            )

            const studentEvaluation = (seRows?.[0] ?? null) as any

            items.push({
                schedule: {
                    id: scheduleId,
                    scheduledAt: s.scheduledAt ?? null,
                    room: s.room ?? null,
                    status: s.status ?? null,
                },
                group: {
                    id: String(s.groupId ?? ""),
                    title: String(s.groupTitle ?? ""),
                    program: s.program ?? null,
                    term: s.term ?? null,
                },
                scores,
                panelistEvaluations,
                studentEvaluation,
            })
        }

        return NextResponse.json({ ok: true, items })
    } catch (err: any) {
        return errorJson(err, "Failed to fetch student evaluation summary")
    }
}
