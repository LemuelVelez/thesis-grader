/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { EvaluationController } from "@/controllers/evaluationController"
import { errorJson, readJson } from "@/lib/http"
import { requireActor, assertRoles } from "@/lib/apiAuth"
import {
    parseQuery,
    parseBody,
    zUuid,
    zLimit,
    zOffset,
    zBoolFromString,
    zNonEmptyString,
    zDateTimeString,
} from "@/lib/validate"

const EvalResource = z.enum([
    "rubricTemplates",
    "rubricCriteria",
    "evaluations",
    "evaluationScores",
    "evaluationScoresBulk",
    "studentEvaluations",
])

const EvalBaseQuerySchema = z.object({
    resource: EvalResource.default("rubricTemplates"),
})

/** GET schemas */
const GetRubricTemplatesSchema = z.object({
    resource: z.literal("rubricTemplates"),
    id: zUuid.optional(),
    q: z.string().optional().default(""),
    limit: zLimit,
    offset: zOffset,
})

const GetRubricCriteriaSchema = z.object({
    resource: z.literal("rubricCriteria"),
    templateId: zUuid,
})

const GetEvaluationsSchema = z.object({
    resource: z.literal("evaluations"),
    id: zUuid.optional(),
    scheduleId: zUuid.optional(),
    evaluatorId: zUuid.optional(),
    status: z.string().optional(),
    byAssignment: zBoolFromString.optional(),
    limit: zLimit,
    offset: zOffset,
})

const GetEvaluationScoresSchema = z.object({
    resource: z.literal("evaluationScores"),
    evaluationId: zUuid,
})

const GetStudentEvaluationsSchema = z.object({
    resource: z.literal("studentEvaluations"),
    id: zUuid.optional(),
    scheduleId: zUuid.optional(),
    studentId: zUuid.optional(),
    status: z.string().optional(),
    limit: zLimit,
    offset: zOffset,
})

/** POST schemas */
const CreateRubricTemplateSchema = z.object({
    name: zNonEmptyString("name"),
    description: z.string().nullable().optional(),
    version: z.coerce.number().int().min(1).optional(),
    active: z.coerce.boolean().optional(),
})

const CreateRubricCriterionSchema = z.object({
    templateId: zUuid,
    criterion: zNonEmptyString("criterion"),
    description: z.string().nullable().optional(),
    weight: z.coerce.number().positive().optional(),
    minScore: z.coerce.number().int().min(0).optional(),
    maxScore: z.coerce.number().int().min(1).optional(),
})

const CreateEvaluationSchema = z.object({
    scheduleId: zUuid,
    evaluatorId: zUuid,
    status: z.string().optional(),
})

const UpsertEvalScoreSchema = z.object({
    evaluationId: zUuid,
    criterionId: zUuid,
    score: z.coerce.number().int(),
    comment: z.string().nullable().optional(),
})

const BulkUpsertEvalScoresSchema = z.object({
    evaluationId: zUuid,
    items: z
        .array(
            z.object({
                criterionId: zUuid,
                score: z.coerce.number().int(),
                comment: z.string().nullable().optional(),
            })
        )
        .min(1),
})

const UpsertStudentEvaluationSchema = z.object({
    scheduleId: zUuid,
    studentId: zUuid,
    status: z.enum(["pending", "submitted", "locked"]).optional(),
    answers: z.unknown().optional(),
    submittedAt: zDateTimeString.nullable().optional(),
    lockedAt: zDateTimeString.nullable().optional(),
})

/** PATCH schemas */
const PatchRubricTemplateSchema = z.object({
    id: zUuid.optional(),
    name: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    version: z.coerce.number().int().min(1).optional(),
    active: z.coerce.boolean().optional(),
})

const PatchRubricCriterionSchema = z.object({
    id: zUuid.optional(),
    criterion: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    weight: z.coerce.number().positive().optional(),
    minScore: z.coerce.number().int().min(0).optional(),
    maxScore: z.coerce.number().int().min(1).optional(),
})

const PatchEvaluationSchema = z.object({
    id: zUuid.optional(),
    status: z.string().optional(),
    submittedAt: zDateTimeString.nullable().optional(),
    lockedAt: zDateTimeString.nullable().optional(),
})

const PatchStudentEvaluationSchema = z.object({
    id: zUuid.optional(),
    status: z.enum(["pending", "submitted", "locked"]).optional(),
    answers: z.unknown().optional(),
    submittedAt: zDateTimeString.nullable().optional(),
    lockedAt: zDateTimeString.nullable().optional(),
})

/** DELETE schemas */
const DeleteRubricTemplateSchema = z.object({
    resource: z.literal("rubricTemplates"),
    id: zUuid,
})

const DeleteRubricCriterionSchema = z.object({
    resource: z.literal("rubricCriteria"),
    id: zUuid,
})

const DeleteEvaluationScoresSchema = z.object({
    resource: z.literal("evaluationScores"),
    evaluationId: zUuid,
})

const DeleteStudentEvaluationSchema = z.object({
    resource: z.literal("studentEvaluations"),
    id: zUuid,
})

export async function GET(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        const base = parseQuery(EvalBaseQuerySchema, req.nextUrl.searchParams)

        const staffOnly = new Set(["rubricTemplates", "rubricCriteria", "evaluations", "evaluationScores"])
        const isStudentEvaluations = base.resource === "studentEvaluations"

        if (staffOnly.has(base.resource)) assertRoles(actor, ["staff", "admin"])
        if (!staffOnly.has(base.resource) && !isStudentEvaluations) {
            return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
        }

        if (base.resource === "rubricTemplates") {
            const q = parseQuery(GetRubricTemplatesSchema, req.nextUrl.searchParams)
            if (q.id) {
                const template = await EvaluationController.getRubricTemplateById(q.id)
                if (!template) return NextResponse.json({ ok: false, message: "Template not found" }, { status: 404 })
                return NextResponse.json({ ok: true, template })
            }
            const out = await EvaluationController.listRubricTemplates({ q: q.q, limit: q.limit, offset: q.offset })
            return NextResponse.json({ ok: true, ...out })
        }

        if (base.resource === "rubricCriteria") {
            const q = parseQuery(GetRubricCriteriaSchema, req.nextUrl.searchParams)
            const criteria = await EvaluationController.listRubricCriteria(q.templateId)
            return NextResponse.json({ ok: true, criteria })
        }

        if (base.resource === "evaluations") {
            const q = parseQuery(GetEvaluationsSchema, req.nextUrl.searchParams)

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
            const q = parseQuery(GetEvaluationScoresSchema, req.nextUrl.searchParams)
            const scores = await EvaluationController.listEvaluationScores(q.evaluationId)
            return NextResponse.json({ ok: true, scores })
        }

        if (base.resource === "studentEvaluations") {
            const q = parseQuery(GetStudentEvaluationsSchema, req.nextUrl.searchParams)
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
        const base = parseQuery(EvalBaseQuerySchema, req.nextUrl.searchParams)
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
            const body = parseBody(CreateRubricTemplateSchema, raw)
            const template = await EvaluationController.createRubricTemplate({
                name: body.name,
                description: body.description ?? null,
                version: body.version ?? 1,
                active: body.active ?? true,
            })
            return NextResponse.json({ ok: true, template }, { status: 201 })
        }

        if (base.resource === "rubricCriteria") {
            const body = parseBody(CreateRubricCriterionSchema, raw)
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
            const body = parseBody(CreateEvaluationSchema, raw)
            const evaluation = await EvaluationController.createEvaluation({
                scheduleId: body.scheduleId,
                evaluatorId: body.evaluatorId,
                status: body.status ?? "pending",
            })
            return NextResponse.json({ ok: true, evaluation }, { status: 201 })
        }

        if (base.resource === "evaluationScores") {
            const body = parseBody(UpsertEvalScoreSchema, raw)
            const item = await EvaluationController.upsertEvaluationScore({
                evaluationId: body.evaluationId,
                criterionId: body.criterionId,
                score: body.score,
                comment: body.comment ?? null,
            })
            return NextResponse.json({ ok: true, score: item }, { status: 201 })
        }

        if (base.resource === "evaluationScoresBulk") {
            const body = parseBody(BulkUpsertEvalScoresSchema, raw)
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
            const body = parseBody(UpsertStudentEvaluationSchema, raw)
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
        const base = parseQuery(EvalBaseQuerySchema, req.nextUrl.searchParams)
        const raw = await readJson(req)

        const staffOnly = new Set(["rubricTemplates", "rubricCriteria", "evaluations"])

        if (staffOnly.has(base.resource)) assertRoles(actor, ["staff", "admin"])
        if (!staffOnly.has(base.resource) && base.resource !== "studentEvaluations") {
            return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
        }

        if (base.resource === "rubricTemplates") {
            const body = parseBody(PatchRubricTemplateSchema, raw)
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
            const body = parseBody(PatchRubricCriterionSchema, raw)
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
            const body = parseBody(PatchEvaluationSchema, raw)
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
            const body = parseBody(PatchStudentEvaluationSchema, raw)
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

        const base = parseQuery(EvalBaseQuerySchema, req.nextUrl.searchParams)

        if (base.resource === "rubricTemplates") {
            const q = parseQuery(DeleteRubricTemplateSchema, req.nextUrl.searchParams)
            const deletedId = await EvaluationController.deleteRubricTemplate(q.id)
            if (!deletedId) return NextResponse.json({ ok: false, message: "Template not found" }, { status: 404 })
            return NextResponse.json({ ok: true, id: deletedId })
        }

        if (base.resource === "rubricCriteria") {
            const q = parseQuery(DeleteRubricCriterionSchema, req.nextUrl.searchParams)
            const deletedId = await EvaluationController.deleteRubricCriterion(q.id)
            if (!deletedId) return NextResponse.json({ ok: false, message: "Criterion not found" }, { status: 404 })
            return NextResponse.json({ ok: true, id: deletedId })
        }

        if (base.resource === "evaluationScores") {
            const q = parseQuery(DeleteEvaluationScoresSchema, req.nextUrl.searchParams)
            const deletedCount = await EvaluationController.deleteEvaluationScores(q.evaluationId)
            return NextResponse.json({ ok: true, deletedCount })
        }

        if (base.resource === "studentEvaluations") {
            const q = parseQuery(DeleteStudentEvaluationSchema, req.nextUrl.searchParams)
            const deletedId = await EvaluationController.deleteStudentEvaluation(q.id)
            if (!deletedId) return NextResponse.json({ ok: false, message: "Student evaluation not found" }, { status: 404 })
            return NextResponse.json({ ok: true, id: deletedId })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to delete evaluation data")
    }
}
