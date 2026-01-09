/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    createRubricTemplate,
    deleteRubricTemplate,
    getRubricTemplate,
    listRubricTemplates,
    updateRubricTemplate,
} from "@/models/rubric-template.model"

function toNumber(v: any): number | undefined {
    if (v === null || v === undefined || v === "") return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
}

function toBool(v: any): boolean | undefined {
    if (v === null || v === undefined || v === "") return undefined
    if (typeof v === "boolean") return v
    const s = String(v).toLowerCase()
    if (s === "true" || s === "1" || s === "yes") return true
    if (s === "false" || s === "0" || s === "no") return false
    return undefined
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

export const RubricTemplatesController = {
    async list(query?: any) {
        const activeOnly = toBool(query?.activeOnly ?? query?.active_only)
        return await listRubricTemplates({ activeOnly: !!activeOnly })
    },

    async getById(id: string) {
        if (!id) throw badRequest("id is required")
        const idStr = String(id).trim()
        if (!isUuid(idStr)) throw badRequest(`Invalid id (expected UUID): "${idStr}"`)

        const row = await getRubricTemplate(idStr)
        if (!row) throw notFound("Rubric template not found")
        return row
    },

    async create(body: any) {
        const name = body?.name ?? body?.title ?? body?.label
        if (!name) throw badRequest("name is required")

        const id = await createRubricTemplate({
            name: String(name),
            version: toNumber(body?.version),
            active: toBool(body?.active),
        })

        if (!id) return null
        return await getRubricTemplate(id)
    },

    async update(id: string, body: any) {
        if (!id) throw badRequest("id is required")
        const idStr = String(id).trim()
        if (!isUuid(idStr)) throw badRequest(`Invalid id (expected UUID): "${idStr}"`)

        const updatedId = await updateRubricTemplate({
            id: idStr,
            name: body?.name ?? body?.title ?? body?.label,
            version: toNumber(body?.version),
            active: toBool(body?.active),
        })

        if (!updatedId) return null
        return await getRubricTemplate(updatedId)
    },

    async delete(id: string) {
        if (!id) throw badRequest("id is required")
        const idStr = String(id).trim()
        if (!isUuid(idStr)) throw badRequest(`Invalid id (expected UUID): "${idStr}"`)

        await deleteRubricTemplate(idStr)
        return { ok: true }
    },
}
