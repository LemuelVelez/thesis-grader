/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

export type DbDefenseSchedule = {
    id: string
    groupId: string
    scheduledAt: string
    room: string | null
    status: string
    createdBy: string | null
    createdAt: string
    updatedAt: string
}

export type DbSchedulePanelist = {
    scheduleId: string
    staffId: string
}

export type DbSchedulePanelistWithUser = {
    scheduleId: string
    staffId: string
    staffName: string
    staffEmail: string
}

function normLimit(n: unknown, fallback = 50) {
    const x = Number(n)
    if (!Number.isFinite(x) || x <= 0) return fallback
    return Math.min(200, Math.floor(x))
}

function normOffset(n: unknown) {
    const x = Number(n)
    if (!Number.isFinite(x) || x < 0) return 0
    return Math.floor(x)
}

export async function listDefenseSchedules(params: {
    q?: string
    groupId?: string
    status?: string
    from?: string
    to?: string
    limit?: number
    offset?: number
}) {
    const q = (params.q ?? "").trim()
    const limit = normLimit(params.limit, 50)
    const offset = normOffset(params.offset)

    const where: string[] = []
    const values: any[] = []
    let i = 1

    if (q) {
        where.push(
            `(coalesce(ds.room,'') ilike $${i} or coalesce(ds.status,'') ilike $${i})`
        )
        values.push(`%${q}%`)
        i++
    }
    if (params.groupId) {
        where.push(`ds.group_id = $${i++}`)
        values.push(params.groupId)
    }
    if (params.status) {
        where.push(`ds.status = $${i++}`)
        values.push(params.status)
    }
    if (params.from) {
        where.push(`ds.scheduled_at >= $${i++}::timestamptz`)
        values.push(params.from)
    }
    if (params.to) {
        where.push(`ds.scheduled_at <= $${i++}::timestamptz`)
        values.push(params.to)
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : ""

    const countQ = `
    select count(*)::int as count
    from defense_schedules ds
    ${whereSql}
  `
    const listQ = `
    select
      ds.id,
      ds.group_id as "groupId",
      ds.scheduled_at as "scheduledAt",
      ds.room,
      ds.status,
      ds.created_by as "createdBy",
      ds.created_at as "createdAt",
      ds.updated_at as "updatedAt"
    from defense_schedules ds
    ${whereSql}
    order by ds.scheduled_at desc
    limit $${i} offset $${i + 1}
  `
    const countValues = values.slice()
    const listValues = values.slice()
    listValues.push(limit, offset)

    const [{ rows: countRows }, { rows: scheduleRows }] = await Promise.all([
        db.query(countQ, countValues),
        db.query(listQ, listValues),
    ])

    return {
        total: (countRows?.[0]?.count ?? 0) as number,
        schedules: scheduleRows as DbDefenseSchedule[],
    }
}

export async function getDefenseScheduleById(id: string) {
    const q = `
    select
      ds.id,
      ds.group_id as "groupId",
      ds.scheduled_at as "scheduledAt",
      ds.room,
      ds.status,
      ds.created_by as "createdBy",
      ds.created_at as "createdAt",
      ds.updated_at as "updatedAt"
    from defense_schedules ds
    where ds.id = $1
    limit 1
  `
    const { rows } = await db.query(q, [id])
    return (rows[0] ?? null) as DbDefenseSchedule | null
}

export async function createDefenseSchedule(input: {
    groupId: string
    scheduledAt: string
    room?: string | null
    status?: string
    createdBy?: string | null
}) {
    const q = `
    insert into defense_schedules (group_id, scheduled_at, room, status, created_by)
    values ($1, $2::timestamptz, $3, $4, $5)
    returning
      id,
      group_id as "groupId",
      scheduled_at as "scheduledAt",
      room,
      status,
      created_by as "createdBy",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `
    const { rows } = await db.query(q, [
        input.groupId,
        input.scheduledAt,
        input.room ?? null,
        input.status ?? "scheduled",
        input.createdBy ?? null,
    ])
    return rows[0] as DbDefenseSchedule
}

export async function updateDefenseSchedule(
    id: string,
    patch: Partial<{
        groupId: string
        scheduledAt: string
        room: string | null
        status: string
        createdBy: string | null
    }>
) {
    const sets: string[] = []
    const values: any[] = []
    let i = 1

    if (patch.groupId !== undefined) {
        sets.push(`group_id = $${i++}`)
        values.push(patch.groupId)
    }
    if (patch.scheduledAt !== undefined) {
        sets.push(`scheduled_at = $${i++}::timestamptz`)
        values.push(patch.scheduledAt)
    }
    if (patch.room !== undefined) {
        sets.push(`room = $${i++}`)
        values.push(patch.room)
    }
    if (patch.status !== undefined) {
        sets.push(`status = $${i++}`)
        values.push(patch.status)
    }
    if (patch.createdBy !== undefined) {
        sets.push(`created_by = $${i++}`)
        values.push(patch.createdBy)
    }

    if (!sets.length) {
        const current = await getDefenseScheduleById(id)
        if (!current) throw Object.assign(new Error("Schedule not found"), { status: 404 })
        return current
    }

    values.push(id)
    const q = `
    update defense_schedules
    set ${sets.join(", ")}
    where id = $${i}
    returning
      id,
      group_id as "groupId",
      scheduled_at as "scheduledAt",
      room,
      status,
      created_by as "createdBy",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `
    const { rows } = await db.query(q, values)
    return (rows[0] ?? null) as DbDefenseSchedule | null
}

export async function deleteDefenseSchedule(id: string) {
    const q = `delete from defense_schedules where id = $1 returning id`
    const { rows } = await db.query(q, [id])
    return (rows[0]?.id ?? null) as string | null
}

export async function listSchedulePanelists(scheduleId: string) {
    const q = `
    select
      sp.schedule_id as "scheduleId",
      sp.staff_id as "staffId",
      u.name as "staffName",
      u.email as "staffEmail"
    from schedule_panelists sp
    join users u on u.id = sp.staff_id
    where sp.schedule_id = $1
    order by u.name asc
  `
    const { rows } = await db.query(q, [scheduleId])
    return rows as DbSchedulePanelistWithUser[]
}

export async function addSchedulePanelist(scheduleId: string, staffId: string) {
    const q = `
    insert into schedule_panelists (schedule_id, staff_id)
    values ($1, $2)
    on conflict do nothing
    returning schedule_id as "scheduleId", staff_id as "staffId"
  `
    const { rows } = await db.query(q, [scheduleId, staffId])
    return (rows[0] ?? null) as DbSchedulePanelist | null
}

export async function removeSchedulePanelist(scheduleId: string, staffId: string) {
    const q = `
    delete from schedule_panelists
    where schedule_id = $1 and staff_id = $2
    returning schedule_id as "scheduleId", staff_id as "staffId"
  `
    const { rows } = await db.query(q, [scheduleId, staffId])
    return (rows[0] ?? null) as DbSchedulePanelist | null
}

export async function setSchedulePanelists(scheduleId: string, staffIds: string[]) {
    const client = await db.connect()
    try {
        await client.query("begin")

        await client.query(`delete from schedule_panelists where schedule_id = $1`, [scheduleId])

        const uniqueIds = Array.from(new Set(staffIds.filter(Boolean)))
        for (const sid of uniqueIds) {
            await client.query(
                `insert into schedule_panelists (schedule_id, staff_id) values ($1, $2)`,
                [scheduleId, sid]
            )
        }

        await client.query("commit")
        const { rows } = await client.query(
            `
      select
        sp.schedule_id as "scheduleId",
        sp.staff_id as "staffId",
        u.name as "staffName",
        u.email as "staffEmail"
      from schedule_panelists sp
      join users u on u.id = sp.staff_id
      where sp.schedule_id = $1
      order by u.name asc
    `,
            [scheduleId]
        )
        return rows as DbSchedulePanelistWithUser[]
    } catch (err) {
        await client.query("rollback")
        throw err
    } finally {
        client.release()
    }
}
