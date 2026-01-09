/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

export type DbUserPublic = {
    id: string
    name: string
    email: string
    role: "student" | "staff" | "admin"
    status: "active" | "disabled"
    avatarKey: string | null
    createdAt: string
    updatedAt: string
}

export type DbStudentProfile = {
    userId: string
    program: string | null
    section: string | null
    createdAt: string
}

export type DbStaffProfile = {
    userId: string
    department: string | null
    createdAt: string
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

export async function listUsers(params: {
    q?: string
    role?: string
    status?: string
    limit?: number
    offset?: number
}) {
    const q = (params.q ?? "").trim()
    const role = (params.role ?? "").trim()
    const status = (params.status ?? "").trim()
    const limit = normLimit(params.limit, 50)
    const offset = normOffset(params.offset)

    const where: string[] = []
    const values: any[] = []
    let i = 1

    if (q) {
        where.push(`(u.name ilike $${i} or u.email ilike $${i})`)
        values.push(`%${q}%`)
        i++
    }
    if (role) {
        where.push(`u.role = $${i++}::thesis_role`)
        values.push(role)
    }
    if (status) {
        where.push(`u.status = $${i++}::user_status`)
        values.push(status)
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : ""

    const countQ = `select count(*)::int as count from users u ${whereSql}`
    const listQ = `
    select
      u.id,
      u.name,
      u.email,
      u.role,
      u.status,
      u.avatar_key as "avatarKey",
      u.created_at as "createdAt",
      u.updated_at as "updatedAt"
    from users u
    ${whereSql}
    order by u.created_at desc
    limit $${i} offset $${i + 1}
  `
    const [{ rows: countRows }, { rows }] = await Promise.all([
        db.query(countQ, values),
        db.query(listQ, [...values, limit, offset]),
    ])

    return { total: (countRows?.[0]?.count ?? 0) as number, users: rows as DbUserPublic[] }
}

export async function getUserById(id: string) {
    const q = `
    select
      u.id,
      u.name,
      u.email,
      u.role,
      u.status,
      u.avatar_key as "avatarKey",
      u.created_at as "createdAt",
      u.updated_at as "updatedAt"
    from users u
    where u.id = $1
    limit 1
  `
    const { rows } = await db.query(q, [id])
    return (rows[0] ?? null) as DbUserPublic | null
}

export async function updateUser(
    id: string,
    patch: Partial<{
        name: string
        email: string
        role: "student" | "staff" | "admin"
        status: "active" | "disabled"
        avatarKey: string | null
    }>
) {
    const sets: string[] = []
    const values: any[] = []
    let i = 1

    if (patch.name !== undefined) {
        sets.push(`name = $${i++}`)
        values.push(patch.name)
    }
    if (patch.email !== undefined) {
        sets.push(`email = $${i++}`)
        values.push(patch.email)
    }
    if (patch.role !== undefined) {
        sets.push(`role = $${i++}::thesis_role`)
        values.push(patch.role)
    }
    if (patch.status !== undefined) {
        sets.push(`status = $${i++}::user_status`)
        values.push(patch.status)
    }
    if (patch.avatarKey !== undefined) {
        sets.push(`avatar_key = $${i++}`)
        values.push(patch.avatarKey)
    }

    if (!sets.length) return null

    values.push(id)
    const q = `
    update users
    set ${sets.join(", ")}
    where id = $${i}
    returning
      id,
      name,
      email,
      role,
      status,
      avatar_key as "avatarKey",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `
    const { rows } = await db.query(q, values)
    return (rows[0] ?? null) as DbUserPublic | null
}

/** -------------------- Student Profile -------------------- */

export async function getStudentProfile(userId: string) {
    const q = `
    select
      s.user_id as "userId",
      s.program,
      s.section,
      s.created_at as "createdAt"
    from students s
    where s.user_id = $1
    limit 1
  `
    const { rows } = await db.query(q, [userId])
    return (rows[0] ?? null) as DbStudentProfile | null
}

export async function upsertStudentProfile(input: { userId: string; program?: string | null; section?: string | null }) {
    const q = `
    insert into students (user_id, program, section)
    values ($1, $2, $3)
    on conflict (user_id)
    do update set program = excluded.program, section = excluded.section
    returning
      user_id as "userId",
      program,
      section,
      created_at as "createdAt"
  `
    const { rows } = await db.query(q, [input.userId, input.program ?? null, input.section ?? null])
    return rows[0] as DbStudentProfile
}

/** -------------------- Staff Profile -------------------- */

export async function getStaffProfile(userId: string) {
    const q = `
    select
      sp.user_id as "userId",
      sp.department,
      sp.created_at as "createdAt"
    from staff_profiles sp
    where sp.user_id = $1
    limit 1
  `
    const { rows } = await db.query(q, [userId])
    return (rows[0] ?? null) as DbStaffProfile | null
}

export async function upsertStaffProfile(input: { userId: string; department?: string | null }) {
    const q = `
    insert into staff_profiles (user_id, department)
    values ($1, $2)
    on conflict (user_id)
    do update set department = excluded.department
    returning
      user_id as "userId",
      department,
      created_at as "createdAt"
  `
    const { rows } = await db.query(q, [input.userId, input.department ?? null])
    return rows[0] as DbStaffProfile
}
