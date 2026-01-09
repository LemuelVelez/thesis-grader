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

function notFound(message: string) {
    const err: any = new Error(message)
    err.status = 404
    return err
}

function isUuid(s: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

// ✅ Prevent common “object-ish” values from causing errors
function normalizeId(raw: any): string | null {
    if (raw === null || raw === undefined) return null
    const s = String(raw).trim()
    if (!s) return null
    if (s === "{}" || s === "[object Object]" || s === "undefined" || s === "null") return null
    return s
}

// ✅ Allows partial update + supports clearing description by sending null
function pickOptionalText(body: any, keys: string[]): string | null | undefined {
    if (!body || typeof body !== "object") return undefined
    for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(body, k)) {
            const v = body[k]
            if (v === null) return null
            if (v === undefined) return undefined
            return String(v)
        }
    }
    return undefined
}

export const RubricCriteriaController = {
    // ✅ Lenient list: invalid templateId => return all instead of 400
    async list(query?: any) {
        const templateIdRaw =
            query?.templateId ??
            query?.template_id ??
            query?.rubricTemplateId ??
            query?.rubric_template_id ??
            query?.rubricId

        const template_id = normalizeId(templateIdRaw)

        if (!template_id) return await listAllRubricCriteria()
        if (!isUuid(template_id)) return await listAllRubricCriteria()

        return await listRubricCriteria(template_id)
    },

    async getById(id: string) {
        if (!id) throw badRequest("id is required")
        const idStr = String(id).trim()
        if (!isUuid(idStr)) throw badRequest(`Invalid id (expected UUID): "${idStr}"`)

        const row = await getRubricCriterion(idStr)
        if (!row) throw notFound("Rubric criterion not found")
        return row
    },

    async create(body: any) {
        const template_id_raw =
            body?.template_id ??
            body?.templateId ??
            body?.rubricTemplateId ??
            body?.rubric_template_id ??
            body?.rubricId

        const templateIdStr = normalizeId(template_id_raw)
        if (!templateIdStr) throw badRequest("template_id (or templateId) is required")
        if (!isUuid(templateIdStr)) throw badRequest(`Invalid template_id (expected UUID): "${templateIdStr}"`)

        const criterion =
            body?.criterion ??
            body?.title ??
            body?.name ??
            body?.label

        if (!criterion) throw badRequest("criterion (or title/name/label) is required")

        // ✅ accept many possible keys from frontend
        const description =
            pickOptionalText(body, ["description", "desc", "criteriaDescription", "criteria_description"]) ?? null

        const id = await createRubricCriterion({
            template_id: templateIdStr,
            criterion: String(criterion),
            description,
            weight: toNumber(body?.weight ?? body?.points ?? body?.score),
            min_score: toNumber(body?.min_score ?? body?.minScore),
            max_score: toNumber(body?.max_score ?? body?.maxScore),
        })

        if (!id) return null
        return await getRubricCriterion(id)
    },

    async update(id: string, body: any) {
        if (!id) throw badRequest("id is required")
        const idStr = String(id).trim()
        if (!isUuid(idStr)) throw badRequest(`Invalid id (expected UUID): "${idStr}"`)

        // ✅ IMPORTANT: only update description if the key exists in the request body
        const updatedId = await updateRubricCriterion({
            id: idStr,
            criterion: body?.criterion ?? body?.title ?? body?.name ?? body?.label,
            description: pickOptionalText(body, ["description", "desc", "criteriaDescription", "criteria_description"]),
            weight: toNumber(body?.weight ?? body?.points ?? body?.score),
            min_score: toNumber(body?.min_score ?? body?.minScore),
            max_score: toNumber(body?.max_score ?? body?.maxScore),
        })

        if (!updatedId) return null
        return await getRubricCriterion(updatedId)
    },

    async delete(id: string) {
        if (!id) throw badRequest("id is required")
        const idStr = String(id).trim()
        if (!isUuid(idStr)) throw badRequest(`Invalid id (expected UUID): "${idStr}"`)

        await deleteRubricCriterion(idStr)
        return { ok: true }
    },
}
