
import { db } from "@/lib/db"

export type GroupMemberRow = {
    group_id: string
    student_id: string
}

export type GroupMemberUserRow = {
    group_id: string
    student_id: string
    student_name: string
    student_email: string
    student_status: string
    created_at: string
}

function clampLimit(n: number, min = 1, max = 200) {
    return Math.min(Math.max(Math.trunc(n), min), max)
}

function clampOffset(n: number) {
    return Math.max(Math.trunc(n), 0)
}

export async function addGroupMember(args: { group_id: string; student_id: string }) {
    const q = `
    insert into group_members (group_id, student_id)
    values ($1, $2)
    on conflict do nothing
  `
    await db.query(q, [args.group_id, args.student_id])
}

export async function removeGroupMember(args: { group_id: string; student_id: string }) {
    const q = `delete from group_members where group_id = $1 and student_id = $2`
    await db.query(q, [args.group_id, args.student_id])
}

export async function listGroupMembers(args: { group_id: string; limit: number; offset: number }) {
    const limit = clampLimit(args.limit, 1, 500)
    const offset = clampOffset(args.offset)

    const q = `
    select
      gm.group_id,
      gm.student_id,
      u.name as student_name,
      u.email as student_email,
      u.status::text as student_status,
      u.created_at
    from group_members gm
    join users u on u.id = gm.student_id
    where gm.group_id = $1
    order by u.name asc
    limit $2
    offset $3
  `
    const { rows } = await db.query(q, [args.group_id, limit, offset])
    return (rows as GroupMemberUserRow[]) ?? []
}

export async function countGroupMembers(group_id: string) {
    const q = `select count(*)::int as total from group_members where group_id = $1`
    const { rows } = await db.query(q, [group_id])
    return (rows[0]?.total as number | undefined) ?? 0
}
