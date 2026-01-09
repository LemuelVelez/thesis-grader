/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

export type RubricTemplateRow = {
    id: string
    name: string
    description: string | null
    version: number
    active: boolean
    created_at: string
    updated_at: string
}

export async function listRubricTemplates(args?: { activeOnly?: boolean }) {
    const activeOnly = !!args?.activeOnly
    const q = `
    select id, name, description, version, active, created_at, updated_at
    from rubric_templates
    ${activeOnly ? "where active = true" : ""}
    order by active desc, updated_at desc
  `
    const { rows } = await db.query(q, [])
    return (rows as RubricTemplateRow[]) ?? []
}

// ✅ used to return full row after create/update
export async function getRubricTemplate(id: string) {
    const q = `
    select id, name, description, version, active, created_at, updated_at
    from rubric_templates
    where id = $1
    limit 1
  `
    const { rows } = await db.query(q, [id])
    return (rows?.[0] as RubricTemplateRow | undefined) ?? undefined
}

export async function createRubricTemplate(args: {
    name: string
    description?: string | null
    version?: number
    active?: boolean
}) {
    const q = `
    insert into rubric_templates (name, description, version, active)
    values ($1, $2, $3, $4)
    returning id
  `
    const { rows } = await db.query(q, [
        args.name,
        args.description ?? null,
        args.version ?? 1,
        args.active ?? true,
    ])
    return rows[0]?.id as string | undefined
}

export async function updateRubricTemplate(args: {
    id: string
    name?: string
    description?: string | null
    version?: number
    active?: boolean
}) {
    const set: string[] = []
    const params: any[] = []

    params.push(args.id)
    const idIdx = params.length

    if (args.name !== undefined) {
        params.push(args.name)
        set.push(`name = $${params.length}`)
    }
    if (args.description !== undefined) {
        params.push(args.description) // can be null to clear
        set.push(`description = $${params.length}`)
    }
    if (args.version !== undefined) {
        params.push(args.version)
        set.push(`version = $${params.length}`)
    }
    if (args.active !== undefined) {
        params.push(args.active)
        set.push(`active = $${params.length}`)
    }

    if (!set.length) return

    const q = `
    update rubric_templates
    set ${set.join(", ")}
    where id = $${idIdx}
    returning id
  `
    const { rows } = await db.query(q, params)
    return rows[0]?.id as string | undefined
}

export async function deleteRubricTemplate(id: string) {
    const q = `delete from rubric_templates where id = $1`
    await db.query(q, [id])
}
