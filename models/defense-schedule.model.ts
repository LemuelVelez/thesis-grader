/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

export type DefenseScheduleRow = {
    id: string
    group_id: string
    scheduled_at: string
    room: string | null
    status: string
    created_by: string | null
    created_at: string
    updated_at: string
}

export type DefenseScheduleWithGroupRow = DefenseScheduleRow & {
    group_title: string
    program: string | null
    term: string | null
}

function clampLimit(n: number, min = 1, max = 200) {
    return Math.min(Math.max(Math.trunc(n), min), max)
}

function clampOffset(n: number) {
    return Math.max(Math.trunc(n), 0)
}

export async function createDefenseSchedule(args: {
    group_id: string
    scheduled_at: string | Date
    room?: string | null
    status?: string
    created_by?: string | null
}) {
    const q = `
    insert into defense_schedules (group_id, scheduled_at, room, status, created_by)
    values ($1, $2, $3, $4, $5)
    returning id
  `
    const { rows } = await db.query(q, [
        args.group_id,
        args.scheduled_at,
        args.room ?? null,
        args.status ?? "scheduled",
        args.created_by ?? null,
    ])
    return rows[0]?.id as string | undefined
}

export async function getDefenseScheduleById(id: string) {
    const q = `
    select id, group_id, scheduled_at, room, status, created_by, created_at, updated_at
    from defense_schedules
    where id = $1
    limit 1
  `
    const { rows } = await db.query(q, [id])
    return rows[0] as DefenseScheduleRow | undefined
}

export async function updateDefenseSchedule(args: {
    id: string
    scheduled_at?: string | Date
    room?: string | null
    status?: string
}) {
    const set: string[] = []
    const params: any[] = []

    params.push(args.id)
    const idIdx = params.length

    if (args.scheduled_at !== undefined) {
        params.push(args.scheduled_at)
        set.push(`scheduled_at = $${params.length}`)
    }
    if (args.room !== undefined) {
        params.push(args.room)
        set.push(`room = $${params.length}`)
    }
    if (args.status !== undefined) {
        params.push(args.status)
        set.push(`status = $${params.length}`)
    }

    if (!set.length) return

    const q = `
    update defense_schedules
    set ${set.join(", ")}
    where id = $${idIdx}
    returning id
  `
    const { rows } = await db.query(q, params)
    return rows[0]?.id as string | undefined
}

export async function deleteDefenseSchedule(id: string) {
    const q = `delete from defense_schedules where id = $1`
    await db.query(q, [id])
}

export async function listDefenseSchedules(args: {
    q?: string
    from?: string // YYYY-MM-DD
    to?: string   // YYYY-MM-DD
    group_id?: string
    status?: string
    limit: number
    offset: number
}) {
    const qText = String(args.q ?? "").trim()
    const limit = clampLimit(args.limit, 1, 500)
    const offset = clampOffset(args.offset)

    const where: string[] = []
    const params: any[] = []

    if (args.group_id) {
        params.push(args.group_id)
        where.push(`d.group_id = $${params.length}`)
    }

    if (args.status?.trim()) {
        params.push(args.status.trim())
        where.push(`d.status = $${params.length}`)
    }

    if (args.from?.trim()) {
        params.push(args.from.trim())
        where.push(`d.scheduled_at >= $${params.length}::date`)
    }

    if (args.to?.trim()) {
        params.push(args.to.trim())
        where.push(`d.scheduled_at < ($${params.length}::date + interval '1 day')`)
    }

    if (qText) {
        params.push(`%${qText}%`)
        const i = params.length
        where.push(
            `(g.title ilike $${i} or coalesce(g.program,'') ilike $${i} or coalesce(g.term,'') ilike $${i} or coalesce(d.room,'') ilike $${i})`
        )
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : ""

    const countQ = `
    select count(*)::int as total
    from defense_schedules d
    join thesis_groups g on g.id = d.group_id
    ${whereSql}
  `
    const listQ = `
    select
      d.id, d.group_id, d.scheduled_at, d.room, d.status, d.created_by, d.created_at, d.updated_at,
      g.title as group_title, g.program, g.term
    from defense_schedules d
    join thesis_groups g on g.id = d.group_id
    ${whereSql}
    order by d.scheduled_at desc
    limit $${params.length + 1}
    offset $${params.length + 2}
  `

    const countRes = await db.query(countQ, params)
    const total = (countRes.rows[0]?.total as number | undefined) ?? 0

    const listRes = await db.query(listQ, [...params, limit, offset])
    return { total, schedules: (listRes.rows as DefenseScheduleWithGroupRow[]) ?? [] }
}
