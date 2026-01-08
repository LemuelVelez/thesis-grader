import { db } from "@/lib/db"
import { sha256, randomToken } from "@/lib/security"

export const SESSION_COOKIE = "tg_session"

export type Role = "student" | "staff" | "admin"

export type PublicUser = {
  id: string
  name: string
  email: string
  role: Role
  status: "active" | "disabled"
  avatar_key: string | null
}

export async function getUserByEmail(email: string) {
  const q = `
    select id, name, email, role, status, password_hash, avatar_key
    from users
    where lower(email) = lower($1)
    limit 1
  `
  const { rows } = await db.query(q, [email])
  return rows[0] as
    | (PublicUser & { password_hash: string })
    | undefined
}

export async function getUserById(id: string) {
  const q = `
    select id, name, email, role, status, avatar_key
    from users
    where id = $1
    limit 1
  `
  const { rows } = await db.query(q, [id])
  return rows[0] as PublicUser | undefined
}

export async function createSession(userId: string, days = 7) {
  const raw = randomToken(32)
  const tokenHash = sha256(raw)
  const q = `
    insert into sessions (user_id, token_hash, expires_at)
    values ($1, $2, now() + ($3 || ' days')::interval)
    returning expires_at
  `
  const { rows } = await db.query(q, [userId, tokenHash, String(days)])
  return { token: raw, expiresAt: rows[0].expires_at as string }
}

export async function deleteSessionByRawToken(rawToken: string) {
  const tokenHash = sha256(rawToken)
  await db.query(`delete from sessions where token_hash = $1`, [tokenHash])
}

export async function deleteAllSessionsForUser(userId: string) {
  await db.query(`delete from sessions where user_id = $1`, [userId])
}

export async function getUserFromSession(rawToken: string) {
  const tokenHash = sha256(rawToken)
  const q = `
    select u.id, u.name, u.email, u.role, u.status, u.avatar_key
    from sessions s
    join users u on u.id = s.user_id
    where s.token_hash = $1
      and s.expires_at > now()
    limit 1
  `
  const { rows } = await db.query(q, [tokenHash])
  return rows[0] as PublicUser | undefined
}

export async function createPasswordReset(userId: string, minutes = 60) {
  const raw = randomToken(32)
  const tokenHash = sha256(raw)
  const q = `
    insert into password_resets (user_id, token_hash, expires_at)
    values ($1, $2, now() + ($3 || ' minutes')::interval)
    returning expires_at
  `
  const { rows } = await db.query(q, [userId, tokenHash, String(minutes)])
  return { token: raw, expiresAt: rows[0].expires_at as string }
}

export async function consumePasswordReset(rawToken: string) {
  const tokenHash = sha256(rawToken)
  const q = `
    update password_resets
    set used_at = now()
    where token_hash = $1
      and used_at is null
      and expires_at > now()
    returning user_id
  `
  const { rows } = await db.query(q, [tokenHash])
  return rows[0]?.user_id as string | undefined
}
