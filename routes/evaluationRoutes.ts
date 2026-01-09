/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { EvaluationController } from "@/controllers/evaluationController"
import { errorJson, readJson } from "@/lib/http"
import { requireActor, assertRoles } from "@/lib/apiAuth"
import { parseQuery, parseBody } from "@/lib/validate"
import { evaluationContracts } from "@/lib/apiContracts"

export async function GET(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        const base = parseQuery(evaluationContracts.baseQuerySchema, req.nextUrl.searchParams)

        const staffOnly = new Set(["rubricTemplates", "rubricCriteria", "evaluations", "evaluationScores"])
        const isStudentEvaluations = base.resource === "studentEvaluations"

        if (staffOnly.has(base.resource)) assertRoles(actor, ["staff", "admin"])
        if (!staffOnly.has(base.resource) && !isStudentEvaluations) {
            return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
        }

        if (base.resource === "rubricTemplates") {
            const q = parseQuery(evaluationContracts.getRubricTemplatesQuerySchema, req.nextUrl.searchParams)
            if (q.id) {
                const template = await EvaluationController.getRubricTemplateById(q.id)
                if (!template) return NextResponse.json({ ok: false, message: "Template not found" }, { status: 404 })
                return NextResponse.json({ ok: true, template })
            }
            const out = await EvaluationController.listRubricTemplates({ q: q.q, limit: q.limit, offset: q.offset })
            return NextResponse.json({ ok: true, ...out })
        }

        if (base.resource === "rubricCriteria") {
            const q = parseQuery(evaluationContracts.getRubricCriteriaQuerySchema, req.nextUrl.searchParams)
            const criteria = await EvaluationController.listRubricCriteria(q.templateId)
            return NextResponse.json({ ok: true, criteria })
        }

        if (base.resource === "evaluations") {
            const q = parseQuery(evaluationContracts.getEvaluationsQuerySchema, req.nextUrl.searchParams)

            if (q.id) {
                const evaluation = await EvaluationController.getEvaluationById(q.id)
                if (!evaluation) return NextResponse.json({ ok: false, message: "Evaluation not found" }, { status: 404 })
                return NextResponse.json({ ok: true, evaluation })
            }

            if (q.byAssignment && q.scheduleId && q.evaluatorId) {
                const evaluation = await EvaluationController.getEvaluationByAssignment(q.scheduleId, q.evaluatorId)
                if (!evaluation) return NextResponse.json({ ok: false, message: "Evaluation not found" }, { status: 404 })
                return NextResponse.json({ ok: true, evaluation })
            }

            const evaluations = await EvaluationController.listEvaluations({
                scheduleId: q.scheduleId,
                evaluatorId: q.evaluatorId,
                status: q.status,
                limit: q.limit,
                offset: q.offset,
            })
            return NextResponse.json({ ok: true, evaluations })
        }

        if (base.resource === "evaluationScores") {
            const q = parseQuery(evaluationContracts.getEvaluationScoresQuerySchema, req.nextUrl.searchParams)
            const scores = await EvaluationController.listEvaluationScores(q.evaluationId)
            return NextResponse.json({ ok: true, scores })
        }

        if (base.resource === "studentEvaluations") {
            const q = parseQuery(evaluationContracts.getStudentEvaluationsQuerySchema, req.nextUrl.searchParams)
            const actorRole = String((actor as any)?.role ?? "").toLowerCase()
            const actorId = String((actor as any)?.id ?? "")

            if (q.id) {
                const studentEvaluation = await EvaluationController.getStudentEvaluationById(q.id)
                if (!studentEvaluation) {
                    return NextResponse.json({ ok: false, message: "Student evaluation not found" }, { status: 404 })
                }
                if (actorRole === "student" && studentEvaluation.studentId !== actorId) {
                    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
                }
                return NextResponse.json({ ok: true, studentEvaluation })
            }

            const studentId = actorRole === "student" ? actorId : q.studentId
            const items = await EvaluationController.listStudentEvaluations({
                scheduleId: q.scheduleId,
                studentId,
                status: q.status,
                limit: q.limit,
                offset: q.offset,
            })
            return NextResponse.json({ ok: true, items })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to fetch evaluation data")
    }
}

export async function POST(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        const base = parseQuery(evaluationContracts.baseQuerySchema, req.nextUrl.searchParams)
        const raw = await readJson(req)

        const staffOnly = new Set([
            "rubricTemplates",
            "rubricCriteria",
            "evaluations",
            "evaluationScores",
            "evaluationScoresBulk",
        ])

        if (staffOnly.has(base.resource)) assertRoles(actor, ["staff", "admin"])
        if (!staffOnly.has(base.resource) && base.resource !== "studentEvaluations") {
            return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
        }

        if (base.resource === "rubricTemplates") {
            const body = parseBody(evaluationContracts.createRubricTemplateBodySchema, raw)
            const template = await EvaluationController.createRubricTemplate({
                name: body.name,
                description: body.description ?? null,
                version: body.version ?? 1,
                active: body.active ?? true,
            })
            return NextResponse.json({ ok: true, template }, { status: 201 })
        }

        if (base.resource === "rubricCriteria") {
            const body = parseBody(evaluationContracts.createRubricCriterionBodySchema, raw)
            const item = await EvaluationController.createRubricCriterion({
                templateId: body.templateId,
                criterion: body.criterion,
                description: body.description ?? null,
                weight: body.weight ?? 1,
                minScore: body.minScore ?? 1,
                maxScore: body.maxScore ?? 5,
            })
            return NextResponse.json({ ok: true, criterion: item }, { status: 201 })
        }

        if (base.resource === "evaluations") {
            const body = parseBody(evaluationContracts.createEvaluationBodySchema, raw)
            const evaluation = await EvaluationController.createEvaluation({
                scheduleId: body.scheduleId,
                evaluatorId: body.evaluatorId,
                status: body.status ?? "pending",
            })
            return NextResponse.json({ ok: true, evaluation }, { status: 201 })
        }

        if (base.resource === "evaluationScores") {
            const body = parseBody(evaluationContracts.upsertEvaluationScoreBodySchema, raw)
            const item = await EvaluationController.upsertEvaluationScore({
                evaluationId: body.evaluationId,
                criterionId: body.criterionId,
                score: body.score,
                comment: body.comment ?? null,
            })
            return NextResponse.json({ ok: true, score: item }, { status: 201 })
        }

        if (base.resource === "evaluationScoresBulk") {
            const body = parseBody(evaluationContracts.bulkUpsertEvaluationScoresBodySchema, raw)
            const out = await EvaluationController.bulkUpsertEvaluationScores({
                evaluationId: body.evaluationId,
                items: body.items.map((x) => ({
                    criterionId: x.criterionId,
                    score: x.score,
                    comment: x.comment ?? null,
                })),
            })
            return NextResponse.json({ ok: true, scores: out }, { status: 201 })
        }

        if (base.resource === "studentEvaluations") {
            const body = parseBody(evaluationContracts.upsertStudentEvaluationBodySchema, raw)
            const actorRole = String((actor as any)?.role ?? "").toLowerCase()
            const actorId = String((actor as any)?.id ?? "")

            if (actorRole === "student" && body.studentId !== actorId) {
                return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
            }

            const item = await EvaluationController.upsertStudentEvaluation({
                scheduleId: body.scheduleId,
                studentId: body.studentId,
                status: body.status ?? "pending",
                answers: body.answers ?? {},
                submittedAt: body.submittedAt ?? null,
                lockedAt: body.lockedAt ?? null,
            })
            return NextResponse.json({ ok: true, studentEvaluation: item }, { status: 201 })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to create evaluation data")
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        const base = parseQuery(evaluationContracts.baseQuerySchema, req.nextUrl.searchParams)
        const raw = await readJson(req)

        const staffOnly = new Set(["rubricTemplates", "rubricCriteria", "evaluations"])

        if (staffOnly.has(base.resource)) assertRoles(actor, ["staff", "admin"])
        if (!staffOnly.has(base.resource) && base.resource !== "studentEvaluations") {
            return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
        }

        if (base.resource === "rubricTemplates") {
            const body = parseBody(evaluationContracts.patchRubricTemplateBodySchema, raw)
            const id = req.nextUrl.searchParams.get("id") ?? body.id
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })

            const template = await EvaluationController.updateRubricTemplate(id, {
                name: body.name,
                description: body.description,
                version: body.version,
                active: body.active,
            })
            if (!template) return NextResponse.json({ ok: false, message: "Template not found" }, { status: 404 })
            return NextResponse.json({ ok: true, template })
        }

        if (base.resource === "rubricCriteria") {
            const body = parseBody(evaluationContracts.patchRubricCriterionBodySchema, raw)
            const id = req.nextUrl.searchParams.get("id") ?? body.id
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })

            const criterion = await EvaluationController.updateRubricCriterion(id, {
                criterion: body.criterion,
                description: body.description,
                weight: body.weight,
                minScore: body.minScore,
                maxScore: body.maxScore,
            })
            if (!criterion) return NextResponse.json({ ok: false, message: "Criterion not found" }, { status: 404 })
            return NextResponse.json({ ok: true, criterion })
        }

        if (base.resource === "evaluations") {
            const body = parseBody(evaluationContracts.patchEvaluationBodySchema, raw)
            const id = req.nextUrl.searchParams.get("id") ?? body.id
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })

            const evaluation = await EvaluationController.updateEvaluation(id, {
                status: body.status,
                submittedAt: body.submittedAt,
                lockedAt: body.lockedAt,
            })
            if (!evaluation) return NextResponse.json({ ok: false, message: "Evaluation not found" }, { status: 404 })
            return NextResponse.json({ ok: true, evaluation })
        }

        if (base.resource === "studentEvaluations") {
            const body = parseBody(evaluationContracts.patchStudentEvaluationBodySchema, raw)
            const id = req.nextUrl.searchParams.get("id") ?? body.id
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })

            const actorRole = String((actor as any)?.role ?? "").toLowerCase()
            const actorId = String((actor as any)?.id ?? "")

            if (actorRole === "student") {
                const existing = await EvaluationController.getStudentEvaluationById(id)
                if (!existing) return NextResponse.json({ ok: false, message: "Student evaluation not found" }, { status: 404 })
                if (existing.studentId !== actorId) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
            } else {
                assertRoles(actor, ["staff", "admin"])
            }

            const studentEvaluation = await EvaluationController.updateStudentEvaluation(id, {
                status: body.status,
                answers: body.answers,
                submittedAt: body.submittedAt,
                lockedAt: body.lockedAt,
            })
            if (!studentEvaluation) return NextResponse.json({ ok: false, message: "Student evaluation not found" }, { status: 404 })
            return NextResponse.json({ ok: true, studentEvaluation })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to update evaluation data")
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        assertRoles(actor, ["staff", "admin"])

        const base = parseQuery(evaluationContracts.baseQuerySchema, req.nextUrl.searchParams)

        if (base.resource === "rubricTemplates") {
            const q = parseQuery(evaluationContracts.deleteRubricTemplateQuerySchema, req.nextUrl.searchParams)
            const deletedId = await EvaluationController.deleteRubricTemplate(q.id)
            if (!deletedId) return NextResponse.json({ ok: false, message: "Template not found" }, { status: 404 })
            return NextResponse.json({ ok: true, id: deletedId })
        }

        if (base.resource === "rubricCriteria") {
            const q = parseQuery(evaluationContracts.deleteRubricCriterionQuerySchema, req.nextUrl.searchParams)
            const deletedId = await EvaluationController.deleteRubricCriterion(q.id)
            if (!deletedId) return NextResponse.json({ ok: false, message: "Criterion not found" }, { status: 404 })
            return NextResponse.json({ ok: true, id: deletedId })
        }

        if (base.resource === "evaluationScores") {
            const q = parseQuery(evaluationContracts.deleteEvaluationScoresQuerySchema, req.nextUrl.searchParams)
            const deletedCount = await EvaluationController.deleteEvaluationScores(q.evaluationId)
            return NextResponse.json({ ok: true, deletedCount })
        }

        if (base.resource === "studentEvaluations") {
            const q = parseQuery(evaluationContracts.deleteStudentEvaluationQuerySchema, req.nextUrl.searchParams)
            const deletedId = await EvaluationController.deleteStudentEvaluation(q.id)
            if (!deletedId) return NextResponse.json({ ok: false, message: "Student evaluation not found" }, { status: 404 })
            return NextResponse.json({ ok: true, id: deletedId })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to delete evaluation data")
    }
}
