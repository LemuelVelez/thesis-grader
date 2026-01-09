/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    createRubricCriterion,
    deleteRubricCriterion,
    getRubricCriterion,
    listAllRubricCriteria,
    listRubricCriteria,
    updateRubricCriterion,
} from "@/models/rubric-criterion.model"

function toNumber(v: any): number | undefined {
    if (v === null || v === undefined || v === "") return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
}

function badRequest(message: string) {
    const err: any = new Error(message)
    err.status = 400
    return err
}

function isUuid(s: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

export const RubricCriteriaController = {
    // ✅ Accepts query object from route.ts
    async list(query?: any) {
        const templateIdRaw =
            query?.templateId ??
            query?.template_id ??
            query?.rubricTemplateId ??
            query?.rubric_template_id ??
            query?.rubricId

        if (!templateIdRaw) {
            // ✅ Needed by /dashboard/admin/rubrics (counts)
            return await listAllRubricCriteria()
        }

        const template_id = String(templateIdRaw)
        if (!isUuid(template_id)) {
            throw badRequest(`Invalid templateId (expected UUID): "${template_id}"`)
        }

        return await listRubricCriteria(template_id)
    },

    async create(body: any) {
        const template_id =
            body?.template_id ??
            body?.templateId ??
            body?.rubricTemplateId ??
            body?.rubric_template_id ??
            body?.rubricId

        if (!template_id) throw badRequest("template_id (or templateId) is required")

        const templateIdStr = String(template_id)
        if (!isUuid(templateIdStr)) {
            throw badRequest(`Invalid template_id (expected UUID): "${templateIdStr}"`)
        }

        const criterion =
            body?.criterion ??
            body?.title ??
            body?.name ??
            body?.label

        if (!criterion) throw badRequest("criterion (or title/name/label) is required")

        const id = await createRubricCriterion({
            template_id: templateIdStr,
            criterion: String(criterion),
            description: body?.description ?? body?.desc ?? null,
            weight: toNumber(body?.weight ?? body?.points ?? body?.score),
            min_score: toNumber(body?.min_score ?? body?.minScore),
            max_score: toNumber(body?.max_score ?? body?.maxScore),
        })

        if (!id) return null
        return await getRubricCriterion(id)
    },

    // ✅ Route calls update(id, body), so controller must match
    async update(id: string, body: any) {
        if (!id) throw badRequest("id is required")

        const updatedId = await updateRubricCriterion({
            id: String(id),
            criterion: body?.criterion ?? body?.title ?? body?.name ?? body?.label,
            description: body?.description ?? body?.desc,
            weight: toNumber(body?.weight ?? body?.points ?? body?.score),
            min_score: toNumber(body?.min_score ?? body?.minScore),
            max_score: toNumber(body?.max_score ?? body?.maxScore),
        })

        if (!updatedId) return null
        return await getRubricCriterion(updatedId)
    },

    async delete(id: string) {
        if (!id) throw badRequest("id is required")
        await deleteRubricCriterion(String(id))
        return { ok: true }
    },
}
