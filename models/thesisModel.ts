/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

export type DbThesisGroup = {
    id: string
    title: string
    adviserId: string | null
    program: string | null
    term: string | null
    createdAt: string
    updatedAt: string
}

export type DbGroupMember = {
    groupId: string
    studentId: string
}

export type DbGroupMemberWithUser = {
    groupId: string
    studentId: string
    studentName: string
    studentEmail: string
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

export async function listThesisGroups(params: {
    q?: string
    limit?: number
    offset?: number
}) {
    const q = (params.q ?? "").trim()
    const limit = normLimit(params.limit, 50)
    const offset = normOffset(params.offset)

    const whereQ = q ? `%${q}%` : null

    const countQ = `
    select count(*)::int as count
    from thesis_groups g
    where ($1::text is null)
       or (g.title ilike $1)
       or (coalesce(g.program,'') ilike $1)
       or (coalesce(g.term,'') ilike $1)
  `
    const listQ = `
    select
      g.id,
      g.title,
      g.adviser_id as "adviserId",
      g.program,
      g.term,
      g.created_at as "createdAt",
      g.updated_at as "updatedAt"
    from thesis_groups g
    where ($1::text is null)
       or (g.title ilike $1)
       or (coalesce(g.program,'') ilike $1)
       or (coalesce(g.term,'') ilike $1)
    order by g.created_at desc
    limit $2 offset $3
  `
    const [{ rows: countRows }, { rows: groupRows }] = await Promise.all([
        db.query(countQ, [whereQ]),
        db.query(listQ, [whereQ, limit, offset]),
    ])

    return {
        total: (countRows?.[0]?.count ?? 0) as number,
        groups: groupRows as DbThesisGroup[],
    }
}

export async function getThesisGroupById(id: string) {
    const q = `
    select
      g.id,
      g.title,
      g.adviser_id as "adviserId",
      g.program,
      g.term,
      g.created_at as "createdAt",
      g.updated_at as "updatedAt"
    from thesis_groups g
    where g.id = $1
    limit 1
  `
    const { rows } = await db.query(q, [id])
    return (rows[0] ?? null) as DbThesisGroup | null
}

export async function createThesisGroup(input: {
    title: string
    adviserId?: string | null
    program?: string | null
    term?: string | null
}) {
    const q = `
    insert into thesis_groups (title, adviser_id, program, term)
    values ($1, $2, $3, $4)
    returning
      id,
      title,
      adviser_id as "adviserId",
      program,
      term,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `
    const { rows } = await db.query(q, [
        input.title,
        input.adviserId ?? null,
        input.program ?? null,
        input.term ?? null,
    ])
    return rows[0] as DbThesisGroup
}

export async function updateThesisGroup(
    id: string,
    patch: Partial<{
        title: string
        adviserId: string | null
        program: string | null
        term: string | null
    }>
) {
    const sets: string[] = []
    const values: any[] = []
    let i = 1

    if (patch.title !== undefined) {
        sets.push(`title = $${i++}`)
        values.push(patch.title)
    }
    if (patch.adviserId !== undefined) {
        sets.push(`adviser_id = $${i++}`)
        values.push(patch.adviserId)
    }
    if (patch.program !== undefined) {
        sets.push(`program = $${i++}`)
        values.push(patch.program)
    }
    if (patch.term !== undefined) {
        sets.push(`term = $${i++}`)
        values.push(patch.term)
    }

    if (!sets.length) {
        const current = await getThesisGroupById(id)
        if (!current) throw Object.assign(new Error("Group not found"), { status: 404 })
        return current
    }

    values.push(id)
    const q = `
    update thesis_groups
    set ${sets.join(", ")}
    where id = $${i}
    returning
      id,
      title,
      adviser_id as "adviserId",
      program,
      term,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `
    const { rows } = await db.query(q, values)
    return (rows[0] ?? null) as DbThesisGroup | null
}

export async function deleteThesisGroup(id: string) {
    const q = `delete from thesis_groups where id = $1 returning id`
    const { rows } = await db.query(q, [id])
    return (rows[0]?.id ?? null) as string | null
}

export async function listGroupMembers(groupId: string) {
    const q = `
    select
      gm.group_id as "groupId",
      gm.student_id as "studentId",
      u.name as "studentName",
      u.email as "studentEmail"
    from group_members gm
    join users u on u.id = gm.student_id
    where gm.group_id = $1
    order by u.name asc
  `
    const { rows } = await db.query(q, [groupId])
    return rows as DbGroupMemberWithUser[]
}

export async function addGroupMember(groupId: string, studentId: string) {
    const q = `
    insert into group_members (group_id, student_id)
    values ($1, $2)
    on conflict do nothing
    returning group_id as "groupId", student_id as "studentId"
  `
    const { rows } = await db.query(q, [groupId, studentId])
    return (rows[0] ?? null) as DbGroupMember | null
}

export async function removeGroupMember(groupId: string, studentId: string) {
    const q = `
    delete from group_members
    where group_id = $1 and student_id = $2
    returning group_id as "groupId", student_id as "studentId"
  `
    const { rows } = await db.query(q, [groupId, studentId])
    return (rows[0] ?? null) as DbGroupMember | null
}

export async function setGroupMembers(groupId: string, studentIds: string[]) {
    const client = await db.connect()
    try {
        await client.query("begin")

        await client.query(`delete from group_members where group_id = $1`, [groupId])

        const uniqueIds = Array.from(new Set(studentIds.filter(Boolean)))
        for (const sid of uniqueIds) {
            await client.query(
                `insert into group_members (group_id, student_id) values ($1, $2)`,
                [groupId, sid]
            )
        }

        await client.query("commit")
        const { rows } = await client.query(
            `
      select
        gm.group_id as "groupId",
        gm.student_id as "studentId",
        u.name as "studentName",
        u.email as "studentEmail"
      from group_members gm
      join users u on u.id = gm.student_id
      where gm.group_id = $1
      order by u.name asc
    `,
            [groupId]
        )
        return rows as DbGroupMemberWithUser[]
    } catch (err) {
        await client.query("rollback")
        throw err
    } finally {
        client.release()
    }
}
