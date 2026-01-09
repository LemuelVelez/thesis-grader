/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { EvaluationController } from "@/controllers/evaluationController"

function pgStatus(err: any) {
    if (err?.status) return err.status
    const code = String(err?.code ?? "")
    if (code === "23505") return 409
    if (code === "23503") return 400
    if (code === "23502") return 400
    if (code === "22P02") return 400
    if (code === "P0001") return 400
    return 500
}

function errorJson(err: any, fallback: string) {
    const status = pgStatus(err)
    return NextResponse.json({ ok: false, message: err?.message ?? fallback }, { status })
}

async function readJson(req: NextRequest) {
    try {
        return await req.json()
    } catch {
        return {}
    }
}

function toNum(v: string | null, fallback: number) {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
}

export async function GET(req: NextRequest) {
    try {
        const sp = req.nextUrl.searchParams
        const resource = sp.get("resource") ?? "rubricTemplates"

        if (resource === "rubricTemplates") {
            const id = sp.get("id")
            if (id) {
                const template = await EvaluationController.getRubricTemplateById(id)
                if (!template) return NextResponse.json({ ok: false, message: "Template not found" }, { status: 404 })
                return NextResponse.json({ ok: true, template })
            }
            const out = await EvaluationController.listRubricTemplates({
                q: sp.get("q") ?? "",
                limit: toNum(sp.get("limit"), 50),
                offset: toNum(sp.get("offset"), 0),
            })
            return NextResponse.json({ ok: true, ...out })
        }

        if (resource === "rubricCriteria") {
            const templateId = sp.get("templateId")
            if (!templateId) return NextResponse.json({ ok: false, message: "templateId is required" }, { status: 400 })
            const criteria = await EvaluationController.listRubricCriteria(templateId)
            return NextResponse.json({ ok: true, criteria })
        }

        if (resource === "evaluations") {
            const id = sp.get("id")
            if (id) {
                const evaluation = await EvaluationController.getEvaluationById(id)
                if (!evaluation) return NextResponse.json({ ok: false, message: "Evaluation not found" }, { status: 404 })
                return NextResponse.json({ ok: true, evaluation })
            }

            const scheduleId = sp.get("scheduleId") ?? undefined
            const evaluatorId = sp.get("evaluatorId") ?? undefined
            const status = sp.get("status") ?? undefined

            // convenience: if scheduleId + evaluatorId => fetch unique assignment
            if (scheduleId && evaluatorId && sp.get("byAssignment") === "true") {
                const evaluation = await EvaluationController.getEvaluationByAssignment(scheduleId, evaluatorId)
                if (!evaluation) return NextResponse.json({ ok: false, message: "Evaluation not found" }, { status: 404 })
                return NextResponse.json({ ok: true, evaluation })
            }

            const evaluations = await EvaluationController.listEvaluations({
                scheduleId,
                evaluatorId,
                status,
                limit: toNum(sp.get("limit"), 50),
                offset: toNum(sp.get("offset"), 0),
            })
            return NextResponse.json({ ok: true, evaluations })
        }

        if (resource === "evaluationScores") {
            const evaluationId = sp.get("evaluationId")
            if (!evaluationId) return NextResponse.json({ ok: false, message: "evaluationId is required" }, { status: 400 })
            const scores = await EvaluationController.listEvaluationScores(evaluationId)
            return NextResponse.json({ ok: true, scores })
        }

        if (resource === "studentEvaluations") {
            const id = sp.get("id")
            if (id) {
                const studentEvaluation = await EvaluationController.getStudentEvaluationById(id)
                if (!studentEvaluation) return NextResponse.json({ ok: false, message: "Student evaluation not found" }, { status: 404 })
                return NextResponse.json({ ok: true, studentEvaluation })
            }

            const items = await EvaluationController.listStudentEvaluations({
                scheduleId: sp.get("scheduleId") ?? undefined,
                studentId: sp.get("studentId") ?? undefined,
                status: sp.get("status") ?? undefined,
                limit: toNum(sp.get("limit"), 50),
                offset: toNum(sp.get("offset"), 0),
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
        const sp = req.nextUrl.searchParams
        const resource = sp.get("resource") ?? "rubricTemplates"
        const body = await readJson(req)

        if (resource === "rubricTemplates") {
            const name = String(body?.name ?? "").trim()
            if (!name) return NextResponse.json({ ok: false, message: "name is required" }, { status: 400 })
            const template = await EvaluationController.createRubricTemplate({
                name,
                description: body?.description ?? null,
                version: body?.version ?? 1,
                active: body?.active ?? true,
            })
            return NextResponse.json({ ok: true, template }, { status: 201 })
        }

        if (resource === "rubricCriteria") {
            const templateId = String(body?.templateId ?? "").trim()
            const criterion = String(body?.criterion ?? "").trim()
            if (!templateId || !criterion) {
                return NextResponse.json({ ok: false, message: "templateId and criterion are required" }, { status: 400 })
            }
            const item = await EvaluationController.createRubricCriterion({
                templateId,
                criterion,
                description: body?.description ?? null,
                weight: body?.weight ?? 1,
                minScore: body?.minScore ?? 1,
                maxScore: body?.maxScore ?? 5,
            })
            return NextResponse.json({ ok: true, criterion: item }, { status: 201 })
        }

        if (resource === "evaluations") {
            const scheduleId = String(body?.scheduleId ?? "").trim()
            const evaluatorId = String(body?.evaluatorId ?? "").trim()
            if (!scheduleId || !evaluatorId) {
                return NextResponse.json({ ok: false, message: "scheduleId and evaluatorId are required" }, { status: 400 })
            }
            const evaluation = await EvaluationController.createEvaluation({
                scheduleId,
                evaluatorId,
                status: body?.status ?? "pending",
            })
            return NextResponse.json({ ok: true, evaluation }, { status: 201 })
        }

        if (resource === "evaluationScores") {
            const evaluationId = String(body?.evaluationId ?? "").trim()
            const criterionId = String(body?.criterionId ?? "").trim()
            const score = Number(body?.score)
            if (!evaluationId || !criterionId || !Number.isFinite(score)) {
                return NextResponse.json(
                    { ok: false, message: "evaluationId, criterionId and numeric score are required" },
                    { status: 400 }
                )
            }
            const item = await EvaluationController.upsertEvaluationScore({
                evaluationId,
                criterionId,
                score,
                comment: body?.comment ?? null,
            })
            return NextResponse.json({ ok: true, score: item }, { status: 201 })
        }

        if (resource === "evaluationScoresBulk") {
            const evaluationId = String(body?.evaluationId ?? "").trim()
            const items = Array.isArray(body?.items) ? body.items : []
            if (!evaluationId || !items.length) {
                return NextResponse.json(
                    { ok: false, message: "evaluationId and items[] are required" },
                    { status: 400 }
                )
            }
            const out = await EvaluationController.bulkUpsertEvaluationScores({
                evaluationId,
                items: items.map((x: any) => ({
                    criterionId: String(x?.criterionId ?? ""),
                    score: Number(x?.score),
                    comment: x?.comment ?? null,
                })),
            })
            return NextResponse.json({ ok: true, scores: out }, { status: 201 })
        }

        if (resource === "studentEvaluations") {
            const scheduleId = String(body?.scheduleId ?? "").trim()
            const studentId = String(body?.studentId ?? "").trim()
            if (!scheduleId || !studentId) {
                return NextResponse.json({ ok: false, message: "scheduleId and studentId are required" }, { status: 400 })
            }
            const item = await EvaluationController.upsertStudentEvaluation({
                scheduleId,
                studentId,
                status: body?.status ?? "pending",
                answers: body?.answers ?? {},
                submittedAt: body?.submittedAt ?? null,
                lockedAt: body?.lockedAt ?? null,
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
        const sp = req.nextUrl.searchParams
        const resource = sp.get("resource") ?? "rubricTemplates"
        const body = await readJson(req)

        if (resource === "rubricTemplates") {
            const id = sp.get("id") ?? String(body?.id ?? "")
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })
            const template = await EvaluationController.updateRubricTemplate(id, {
                name: body?.name,
                description: body?.description,
                version: body?.version,
                active: body?.active,
            })
            if (!template) return NextResponse.json({ ok: false, message: "Template not found" }, { status: 404 })
            return NextResponse.json({ ok: true, template })
        }

        if (resource === "rubricCriteria") {
            const id = sp.get("id") ?? String(body?.id ?? "")
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })
            const criterion = await EvaluationController.updateRubricCriterion(id, {
                criterion: body?.criterion,
                description: body?.description,
                weight: body?.weight,
                minScore: body?.minScore,
                maxScore: body?.maxScore,
            })
            if (!criterion) return NextResponse.json({ ok: false, message: "Criterion not found" }, { status: 404 })
            return NextResponse.json({ ok: true, criterion })
        }

        if (resource === "evaluations") {
            const id = sp.get("id") ?? String(body?.id ?? "")
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })
            const evaluation = await EvaluationController.updateEvaluation(id, {
                status: body?.status,
                submittedAt: body?.submittedAt,
                lockedAt: body?.lockedAt,
            })
            if (!evaluation) return NextResponse.json({ ok: false, message: "Evaluation not found" }, { status: 404 })
            return NextResponse.json({ ok: true, evaluation })
        }

        if (resource === "studentEvaluations") {
            const id = sp.get("id") ?? String(body?.id ?? "")
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })
            const studentEvaluation = await EvaluationController.updateStudentEvaluation(id, {
                status: body?.status,
                answers: body?.answers,
                submittedAt: body?.submittedAt,
                lockedAt: body?.lockedAt,
            })
            if (!studentEvaluation) {
                return NextResponse.json({ ok: false, message: "Student evaluation not found" }, { status: 404 })
            }
            return NextResponse.json({ ok: true, studentEvaluation })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to update evaluation data")
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const sp = req.nextUrl.searchParams
        const resource = sp.get("resource") ?? "rubricTemplates"

        if (resource === "rubricTemplates") {
            const id = sp.get("id")
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })
            const deletedId = await EvaluationController.deleteRubricTemplate(id)
            if (!deletedId) return NextResponse.json({ ok: false, message: "Template not found" }, { status: 404 })
            return NextResponse.json({ ok: true, id: deletedId })
        }

        if (resource === "rubricCriteria") {
            const id = sp.get("id")
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })
            const deletedId = await EvaluationController.deleteRubricCriterion(id)
            if (!deletedId) return NextResponse.json({ ok: false, message: "Criterion not found" }, { status: 404 })
            return NextResponse.json({ ok: true, id: deletedId })
        }

        if (resource === "evaluationScores") {
            const evaluationId = sp.get("evaluationId")
            if (!evaluationId) return NextResponse.json({ ok: false, message: "evaluationId is required" }, { status: 400 })
            const deletedCount = await EvaluationController.deleteEvaluationScores(evaluationId)
            return NextResponse.json({ ok: true, deletedCount })
        }

        if (resource === "studentEvaluations") {
            const id = sp.get("id")
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })
            const deletedId = await EvaluationController.deleteStudentEvaluation(id)
            if (!deletedId) return NextResponse.json({ ok: false, message: "Student evaluation not found" }, { status: 404 })
            return NextResponse.json({ ok: true, id: deletedId })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to delete evaluation data")
    }
}
