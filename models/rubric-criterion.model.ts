/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

export type RubricCriterionRow = {
    id: string
    template_id: string
    criterion: string
    description: string | null
    weight: string // numeric comes back as string in pg by default
    min_score: number
    max_score: number
    created_at: string
}

export async function listRubricCriteria(template_id: string) {
    const q = `
    select id, template_id, criterion, description, weight, min_score, max_score, created_at
    from rubric_criteria
    where template_id = $1
    order by created_at asc
  `
    const { rows } = await db.query(q, [template_id])
    return (rows as RubricCriterionRow[]) ?? []
}

export async function createRubricCriterion(args: {
    template_id: string
    criterion: string
    description?: string | null
    weight?: number
    min_score?: number
    max_score?: number
}) {
    const q = `
    insert into rubric_criteria (template_id, criterion, description, weight, min_score, max_score)
    values ($1, $2, $3, $4, $5, $6)
    returning id
  `
    const { rows } = await db.query(q, [
        args.template_id,
        args.criterion,
        args.description ?? null,
        args.weight ?? 1,
        args.min_score ?? 1,
        args.max_score ?? 5,
    ])
    return rows[0]?.id as string | undefined
}

export async function updateRubricCriterion(args: {
    id: string
    criterion?: string
    description?: string | null
    weight?: number
    min_score?: number
    max_score?: number
}) {
    const set: string[] = []
    const params: any[] = []

    params.push(args.id)
    const idIdx = params.length

    if (args.criterion !== undefined) {
        params.push(args.criterion)
        set.push(`criterion = $${params.length}`)
    }
    if (args.description !== undefined) {
        params.push(args.description)
        set.push(`description = $${params.length}`)
    }
    if (args.weight !== undefined) {
        params.push(args.weight)
        set.push(`weight = $${params.length}`)
    }
    if (args.min_score !== undefined) {
        params.push(args.min_score)
        set.push(`min_score = $${params.length}`)
    }
    if (args.max_score !== undefined) {
        params.push(args.max_score)
        set.push(`max_score = $${params.length}`)
    }

    if (!set.length) return

    const q = `
    update rubric_criteria
    set ${set.join(", ")}
    where id = $${idIdx}
    returning id
  `
    const { rows } = await db.query(q, params)
    return rows[0]?.id as string | undefined
}

export async function deleteRubricCriterion(id: string) {
    const q = `delete from rubric_criteria where id = $1`
    await db.query(q, [id])
}
