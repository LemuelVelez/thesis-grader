/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { requireActor, assertRoles } from "@/lib/apiAuth"
import { errorJson } from "@/lib/http"

function safeText(v: unknown) {
    return String(v ?? "").trim()
}

export async function GET(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        assertRoles(actor, ["admin"])

        const sp = req.nextUrl.searchParams
        const id = safeText(sp.get("id"))

        if (!id) {
            return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })
        }

        // Base: evaluation + schedule + group + evaluator + adviser
        const baseQ = `
            select
                e.id as "evaluationId",
                e.status as "evaluationStatus",
                e.submitted_at as "submittedAt",
                e.locked_at as "lockedAt",
                e.created_at as "createdAt",

                e.schedule_id as "scheduleId",
                ds.scheduled_at as "scheduledAt",
                ds.room as "room",
                ds.status as "scheduleStatus",

                ds.group_id as "groupId",
                tg.title as "groupTitle",
                tg.program as "program",
                tg.term as "term",

                e.evaluator_id as "evaluatorId",
                eu.name as "evaluatorName",
                eu.email as "evaluatorEmail",

                tg.adviser_id as "adviserId",
                au.name as "adviserName",
                au.email as "adviserEmail"
            from evaluations e
            join defense_schedules ds on ds.id = e.schedule_id
            join thesis_groups tg on tg.id = ds.group_id
            join users eu on eu.id = e.evaluator_id
            left join users au on au.id = tg.adviser_id
            where e.id = $1
            limit 1
        `
        const { rows: baseRows } = await db.query(baseQ, [id])
        const base = baseRows?.[0] ?? null

        if (!base) {
            return NextResponse.json({ ok: false, message: "Evaluation not found" }, { status: 404 })
        }

        // Students in group
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

        // Panelists in schedule
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

        // Determine rubric template for this evaluation:
        // 1) if any score exists, derive template_id from criterion
        // 2) else fallback to latest active template
        let templateId: string | null = null

        const tplFromScoresQ = `
            select rc.template_id as "templateId"
            from evaluation_scores es
            join rubric_criteria rc on rc.id = es.criterion_id
            where es.evaluation_id = $1
            limit 1
        `
        const { rows: tplRows } = await db.query(tplFromScoresQ, [id])
        templateId = (tplRows?.[0]?.templateId ?? null) as string | null

        if (!templateId) {
            const fallbackTplQ = `
                select rt.id as "templateId"
                from rubric_templates rt
                where rt.active = true
                order by rt.updated_at desc nulls last
                limit 1
            `
            const { rows: fbRows } = await db.query(fallbackTplQ, [])
            templateId = (fbRows?.[0]?.templateId ?? null) as string | null
        }

        let template: any = null
        let criteria: any[] = []

        if (templateId) {
            const templateQ = `
                select
                    rt.id,
                    rt.name,
                    rt.version,
                    rt.active,
                    rt.description,
                    rt.created_at as "createdAt",
                    rt.updated_at as "updatedAt"
                from rubric_templates rt
                where rt.id = $1
                limit 1
            `
            const { rows: tRows } = await db.query(templateQ, [templateId])
            template = tRows?.[0] ?? null

            const criteriaQ = `
                select
                    rc.id as "criterionId",
                    rc.criterion,
                    rc.description,
                    rc.weight::text as "weight",
                    rc.min_score as "minScore",
                    rc.max_score as "maxScore",
                    es.score,
                    es.comment
                from rubric_criteria rc
                left join evaluation_scores es
                    on es.criterion_id = rc.id
                   and es.evaluation_id = $2
                where rc.template_id = $1
                order by rc.created_at asc
            `
            const { rows: cRows } = await db.query(criteriaQ, [templateId, id])
            criteria = cRows ?? []
        }

        return NextResponse.json({
            ok: true,
            detail: {
                evaluation: {
                    id: base.evaluationId,
                    status: base.evaluationStatus,
                    submittedAt: base.submittedAt,
                    lockedAt: base.lockedAt,
                    createdAt: base.createdAt,
                },
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
                evaluator: {
                    id: base.evaluatorId,
                    name: base.evaluatorName,
                    email: base.evaluatorEmail,
                },
                panelists: panelists ?? [],
                rubric: template
                    ? {
                        id: template.id,
                        name: template.name,
                        version: template.version,
                        active: template.active,
                        description: template.description,
                        createdAt: template.createdAt,
                        updatedAt: template.updatedAt,
                    }
                    : null,
                criteria: criteria ?? [],
            },
        })
    } catch (err: any) {
        return errorJson(err, "Failed to fetch admin evaluation detail")
    }
}
