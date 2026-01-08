/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

export type ThesisGroupRow = {
    id: string
    title: string
    program: string | null
    term: string | null
    created_at: string
    updated_at: string
    adviser_id: string | null
}

export async function listThesisGroupsModel(args: { q?: string; limit: number; offset: number }) {
    const q = String(args.q ?? "").trim()
    const limit = Math.min(Math.max(Math.trunc(args.limit), 1), 200)
    const offset = Math.max(Math.trunc(args.offset), 0)

    const where: string[] = []
    const params: any[] = []

    if (q) {
        params.push(`%${q}%`)
        const i = params.length
        where.push(`(g.title ilike $${i} or coalesce(g.program,'') ilike $${i} or coalesce(g.term,'') ilike $${i})`)
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : ""

    const countQ = `select count(*)::int as total from thesis_groups g ${whereSql}`
    const listQ = `
    select g.id, g.title, g.program, g.term, g.created_at, g.updated_at, g.adviser_id
    from thesis_groups g
    ${whereSql}
    order by g.created_at desc
    limit $${params.length + 1}
    offset $${params.length + 2}
  `

    const countRes = await db.query(countQ, params)
    const total = (countRes.rows[0]?.total as number | undefined) ?? 0

    const listRes = await db.query(listQ, [...params, limit, offset])
    return { total, groups: (listRes.rows as ThesisGroupRow[]) ?? [] }
}
