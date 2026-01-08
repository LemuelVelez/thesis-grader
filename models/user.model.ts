/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

export type DbUser = {
    id: string
    name: string
    email: string
    role: "student" | "staff" | "admin"
    status: "active" | "disabled"
    avatar_key: string | null
    created_at: string
    updated_at: string
}

export type DbUserWithPassword = DbUser & { password_hash: string }

export async function findUserByEmail(email: string) {
    const q = `
    select id, name, email, role, status, password_hash, avatar_key, created_at, updated_at
    from users
    where lower(email) = lower($1)
    limit 1
  `
    const { rows } = await db.query(q, [email])
    return rows[0] as DbUserWithPassword | undefined
}

export async function findUserById(id: string) {
    const q = `
    select id, name, email, role, status, avatar_key, created_at, updated_at
    from users
    where id = $1
    limit 1
  `
    const { rows } = await db.query(q, [id])
    return rows[0] as DbUser | undefined
}

export async function listUsers(args: { q?: string; limit: number; offset: number }) {
    const q = String(args.q ?? "").trim()
    const limit = Math.min(Math.max(Math.trunc(args.limit), 1), 200)
    const offset = Math.max(Math.trunc(args.offset), 0)

    const where: string[] = []
    const params: any[] = []

    if (q) {
        params.push(`%${q}%`)
        where.push(`(name ilike $${params.length} or email ilike $${params.length})`)
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : ""

    const countQ = `select count(*)::int as total from users ${whereSql}`
    const listQ = `
    select id, name, email, role, status, avatar_key, created_at, updated_at
    from users
    ${whereSql}
    order by created_at desc
    limit $${params.length + 1}
    offset $${params.length + 2}
  `

    const countRes = await db.query(countQ, params)
    const total = (countRes.rows[0]?.total as number | undefined) ?? 0

    const listRes = await db.query(listQ, [...params, limit, offset])
    return { total, users: (listRes.rows as DbUser[]) ?? [] }
}
