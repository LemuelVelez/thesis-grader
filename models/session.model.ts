/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

export type SessionRow = {
    id: string
    user_id: string
    token_hash: string
    expires_at: string
    created_at: string
}

export async function createSession(args: { user_id: string; token_hash: string; expires_at: string | Date }) {
    const q = `
    insert into sessions (user_id, token_hash, expires_at)
    values ($1, $2, $3)
    returning id
  `
    const { rows } = await db.query(q, [args.user_id, args.token_hash, args.expires_at])
    return rows[0]?.id as string | undefined
}

export async function findSessionByTokenHash(token_hash: string) {
    const q = `
    select id, user_id, token_hash, expires_at, created_at
    from sessions
    where token_hash = $1
    limit 1
  `
    const { rows } = await db.query(q, [token_hash])
    return rows[0] as SessionRow | undefined
}

export async function deleteSessionById(id: string) {
    const q = `delete from sessions where id = $1`
    await db.query(q, [id])
}

export async function deleteSessionByTokenHash(token_hash: string) {
    const q = `delete from sessions where token_hash = $1`
    await db.query(q, [token_hash])
}

export async function deleteSessionsByUserId(user_id: string) {
    const q = `delete from sessions where user_id = $1`
    await db.query(q, [user_id])
}

export async function purgeExpiredSessions(now: string | Date = new Date()) {
    const q = `delete from sessions where expires_at < $1`
    const res = await db.query(q, [now])
    // node-postgres returns rowCount; keep it defensive
    return (res as any)?.rowCount as number | undefined
}
