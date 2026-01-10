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

function clampInt(v: string | null, def: number, min: number, max: number) {
    const n = Number(v)
    if (!Number.isFinite(n)) return def
    return Math.max(min, Math.min(max, Math.trunc(n)))
}

function toNumber(v: any): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string") {
        const x = Number(v)
        return Number.isFinite(x) ? x : null
    }
    return null
}

function toStr(v: any): string | null {
    if (typeof v === "string") return v
    if (v === null || v === undefined) return null
    const s = String(v)
    return s.trim() ? s : null
}

function asObj(v: any): any {
    if (!v || typeof v !== "object" || Array.isArray(v)) return {}
    return v
}

function pickNumberFrom(obj: any, paths: Array<string[]>) {
    const o = asObj(obj)
    for (const path of paths) {
        let cur: any = o
        for (const k of path) {
            cur = cur?.[k]
        }
        const n = toNumber(cur)
        if (n !== null) return n
    }
    return null
}

function pickStringFrom(obj: any, paths: Array<string[]>) {
    const o = asObj(obj)
    for (const path of paths) {
        let cur: any = o
        for (const k of path) {
            cur = cur?.[k]
        }
        const s = toStr(cur)
        if (s) return s
    }
    return null
}

function extractMemberEntry(extras: any, studentId: string): { score: number | null; comment: string | null } | null {
    const ex = asObj(extras)

    const containers = [
        ex.members,
        ex.memberScores,
        ex.individualScores,
        ex.personalScores,
        ex.students,
        ex.studentScores,
        ex.perMember,
        ex.perStudent,
    ].filter(Boolean)

    // map-like: { [studentId]: {score, comment} } or { [studentId]: number }
    for (const c of containers) {
        if (c && typeof c === "object" && !Array.isArray(c)) {
            const hit = (c as any)[studentId] ?? (c as any)[String(studentId)]
            if (hit !== undefined) {
                if (typeof hit === "number" || typeof hit === "string") {
                    return { score: toNumber(hit), comment: null }
                }
                if (hit && typeof hit === "object" && !Array.isArray(hit)) {
                    const score =
                        pickNumberFrom(hit, [
                            ["score"],
                            ["total"],
                            ["value"],
                            ["points"],
                            ["memberScore"],
                            ["finalScore"],
                        ]) ?? null
                    const comment =
                        pickStringFrom(hit, [
                            ["comment"],
                            ["remarks"],
                            ["note"],
                            ["text"],
                            ["message"],
                        ]) ?? null
                    return { score, comment }
                }
            }
        }
    }

    // array-like: [{studentId, score, comment}] etc
    for (const c of containers) {
        if (Array.isArray(c)) {
            const found = c.find((x: any) => {
                const sid = String(x?.studentId ?? x?.memberId ?? x?.userId ?? x?.id ?? "")
                return sid && sid === studentId
            })
            if (found) {
                const score =
                    pickNumberFrom(found, [
                        ["score"],
                        ["total"],
                        ["value"],
                        ["points"],
                        ["memberScore"],
                        ["finalScore"],
                    ]) ?? null
                const comment =
                    pickStringFrom(found, [
                        ["comment"],
                        ["remarks"],
                        ["note"],
                        ["text"],
                        ["message"],
                    ]) ?? null
                return { score, comment }
            }
        }
    }

    // sometimes stored as extras.personal or extras.member (single) but still keyed differently
    const fallback = ex.personal ?? ex.member ?? null
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
        // If it’s already “for the current student” in your design
        const score =
            pickNumberFrom(fallback, [
                ["score"],
                ["total"],
                ["value"],
                ["points"],
                ["memberScore"],
                ["finalScore"],
            ]) ?? null
        const comment =
            pickStringFrom(fallback, [
                ["comment"],
                ["remarks"],
                ["note"],
                ["text"],
                ["message"],
            ]) ?? null
        if (score !== null || comment) return { score, comment }
    }

    return null
}

function avg(nums: Array<number | null>) {
    const x = nums.filter((n) => typeof n === "number" && Number.isFinite(n)) as number[]
    if (!x.length) return null
    return x.reduce((a, b) => a + b, 0) / x.length
}

export async function GET(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        const role = actorRoleOf(actor)
        const studentId = actorIdOf(actor)

        if (role !== "student") {
            return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
        }

        const url = new URL(req.url)
        const limit = clampInt(url.searchParams.get("limit"), 10, 1, 50)
        const offset = clampInt(url.searchParams.get("offset"), 0, 0, 10_000)

        // 1) schedules visible to student (via group_members)
        const { rows: schedRows } = await db.query(
            `
            select
              ds.id as "scheduleId",
              ds.scheduled_at as "scheduledAt",
              ds.room,
              ds.status,
              g.id as "groupId",
              g.title as "groupTitle",
              g.program as "program",
              g.term as "term"
            from defense_schedules ds
            join thesis_groups g on g.id = ds.group_id
            join group_members gm on gm.group_id = ds.group_id
            where gm.student_id = $1
            order by ds.scheduled_at desc
            limit $2 offset $3
            `,
            [studentId, limit, offset]
        )

        const scheduleIds = (schedRows ?? []).map((r: any) => String(r.scheduleId)).filter(Boolean)
        if (!scheduleIds.length) {
            return NextResponse.json({ ok: true, items: [] })
        }

        // 2) evaluations + evaluator + extras (per schedule)
        const { rows: evalRows } = await db.query(
            `
            select
              e.id as "evaluationId",
              e.schedule_id as "scheduleId",
              e.status,
              e.submitted_at as "submittedAt",
              e.locked_at as "lockedAt",
              u.id as "evaluatorId",
              coalesce(u.name, u.email) as "evaluatorName",
              u.email as "evaluatorEmail",
              ex.data as "extras"
            from evaluations e
            join users u on u.id = e.evaluator_id
            left join evaluation_extras ex on ex.evaluation_id = e.id
            where e.schedule_id = any($1::uuid[])
            order by u.name asc
            `,
            [scheduleIds]
        )

        // 3) rubric weighted average fallback for groupScore (if extras doesn’t provide)
        const evaluationIds = (evalRows ?? []).map((r: any) => String(r.evaluationId)).filter(Boolean)
        const rubricAvgByEval = new Map<string, number>()
        if (evaluationIds.length) {
            const { rows: avgRows } = await db.query(
                `
                select
                  es.evaluation_id as "evaluationId",
                  (sum(es.score * rc.weight) / nullif(sum(rc.weight), 0))::float as "avg"
                from evaluation_scores es
                join rubric_criteria rc on rc.id = es.criterion_id
                where es.evaluation_id = any($1::uuid[])
                group by es.evaluation_id
                `,
                [evaluationIds]
            )
            for (const r of avgRows ?? []) {
                const id = String((r as any).evaluationId ?? "")
                const a = toNumber((r as any).avg)
                if (id && a !== null) rubricAvgByEval.set(id, a)
            }
        }

        // 4) student feedback row per schedule
        const { rows: seRows } = await db.query(
            `
            select
              id,
              schedule_id as "scheduleId",
              status,
              answers,
              submitted_at as "submittedAt",
              locked_at as "lockedAt",
              created_at as "createdAt",
              updated_at as "updatedAt"
            from student_evaluations
            where student_id = $1 and schedule_id = any($2::uuid[])
            `,
            [studentId, scheduleIds]
        )
        const seBySchedule = new Map<string, any>()
        for (const r of seRows ?? []) {
            seBySchedule.set(String((r as any).scheduleId), r)
        }

        // 5) build per-schedule summary
        const evalsBySchedule = new Map<string, any[]>()
        for (const r of evalRows ?? []) {
            const sid = String((r as any).scheduleId ?? "")
            if (!sid) continue
            if (!evalsBySchedule.has(sid)) evalsBySchedule.set(sid, [])
            evalsBySchedule.get(sid)!.push(r)
        }

        const items = (schedRows ?? []).map((s: any) => {
            const sid = String(s.scheduleId)
            const rows = evalsBySchedule.get(sid) ?? []

            const panelistEvaluations = rows.map((er: any) => {
                const evaluationId = String(er.evaluationId)
                const extras = asObj(er.extras)

                const fallbackRubricAvg = rubricAvgByEval.get(evaluationId) ?? null

                const groupScore =
                    pickNumberFrom(extras, [
                        ["groupScore"],
                        ["overallScore"],
                        ["overall", "score"],
                        ["overall", "value"],
                        ["group", "score"],
                        ["group", "value"],
                        ["totalScore"],
                        ["total", "score"],
                    ]) ?? fallbackRubricAvg

                const systemScore =
                    pickNumberFrom(extras, [
                        ["systemScore"],
                        ["system", "score"],
                        ["system", "value"],
                        ["ai", "score"],
                        ["aiScore"],
                    ]) ?? null

                const groupComment =
                    pickStringFrom(extras, [
                        ["groupComment"],
                        ["overallComment"],
                        ["overall", "comment"],
                        ["group", "comment"],
                        ["overall", "remarks"],
                    ]) ?? null

                const systemComment =
                    pickStringFrom(extras, [
                        ["systemComment"],
                        ["system", "comment"],
                        ["system", "remarks"],
                        ["ai", "comment"],
                    ]) ?? null

                const member = extractMemberEntry(extras, studentId)
                const personalScore =
                    member?.score ??
                    pickNumberFrom(extras, [
                        ["personalScore"],
                        ["individualScore"],
                        ["memberScore"],
                    ]) ??
                    null

                const personalComment =
                    member?.comment ??
                    pickStringFrom(extras, [
                        ["personalComment"],
                        ["individualComment"],
                        ["memberComment"],
                    ]) ??
                    null

                return {
                    evaluationId,
                    status: String(er.status ?? "pending"),
                    submittedAt: er.submittedAt ?? null,
                    lockedAt: er.lockedAt ?? null,
                    evaluator: {
                        id: String(er.evaluatorId ?? ""),
                        name: String(er.evaluatorName ?? ""),
                        email: String(er.evaluatorEmail ?? ""),
                    },
                    scores: {
                        groupScore,
                        systemScore,
                        personalScore,
                    },
                    comments: {
                        groupComment,
                        systemComment,
                        personalComment,
                    },
                }
            })

            const aggGroup = avg(panelistEvaluations.map((x: any) => x.scores.groupScore))
            const aggSystem = avg(panelistEvaluations.map((x: any) => x.scores.systemScore))
            const aggPersonal = avg(panelistEvaluations.map((x: any) => x.scores.personalScore))

            return {
                schedule: {
                    id: sid,
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
                scores: {
                    groupScore: aggGroup,
                    systemScore: aggSystem,
                    personalScore: aggPersonal,
                },
                panelistEvaluations,
                studentEvaluation: seBySchedule.get(sid) ?? null,
            }
        })

        return NextResponse.json({ ok: true, items })
    } catch (err: any) {
        return errorJson(err, "Failed to load student evaluation summary")
    }
}
