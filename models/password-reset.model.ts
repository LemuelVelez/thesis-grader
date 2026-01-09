/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

export type PasswordResetRow = {
    id: string
    user_id: string
    token_hash: string
    expires_at: string
    used_at: string | null
    created_at: string
}

export async function createPasswordReset(args: { user_id: string; token_hash: string; expires_at: string | Date }) {
    const q = `
    insert into password_resets (user_id, token_hash, expires_at)
    values ($1, $2, $3)
    returning id
  `
    const { rows } = await db.query(q, [args.user_id, args.token_hash, args.expires_at])
    return rows[0]?.id as string | undefined
}

export async function findPasswordResetByTokenHash(token_hash: string) {
    const q = `
    select id, user_id, token_hash, expires_at, used_at, created_at
    from password_resets
    where token_hash = $1
    limit 1
  `
    const { rows } = await db.query(q, [token_hash])
    return rows[0] as PasswordResetRow | undefined
}

export async function markPasswordResetUsed(id: string) {
    const q = `
    update password_resets
    set used_at = now()
    where id = $1 and used_at is null
    returning id
  `
    const { rows } = await db.query(q, [id])
    return rows[0]?.id as string | undefined
}

export async function deletePasswordResetById(id: string) {
    const q = `delete from password_resets where id = $1`
    await db.query(q, [id])
}

export async function deletePasswordResetsByUserId(user_id: string) {
    const q = `delete from password_resets where user_id = $1`
    await db.query(q, [user_id])
}

export async function purgeExpiredOrUsedPasswordResets(now: string | Date = new Date()) {
    const q = `
    delete from password_resets
    where expires_at < $1
       or used_at is not null
  `
    const res = await db.query(q, [now])
    return (res as any)?.rowCount as number | undefined
}
