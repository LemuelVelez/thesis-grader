/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

export type AuditLogRow = {
    id: string
    actor_id: string | null
    action: string
    entity: string
    entity_id: string | null
    details: any
    created_at: string
}

export async function insertAuditLog(args: {
    actor_id: string | null
    action: string
    entity: string
    entity_id: string | null
    details?: any
}) {
    const q = `
    insert into audit_logs (actor_id, action, entity, entity_id, details)
    values ($1, $2, $3, $4, $5::jsonb)
    returning id
  `
    const { rows } = await db.query(q, [
        args.actor_id,
        args.action,
        args.entity,
        args.entity_id,
        JSON.stringify(args.details ?? {}),
    ])
    return rows[0]?.id as string | undefined
}

export async function listAuditLogsInRange(args: { from: string; to: string; limit: number; offset: number }) {
    const limit = Math.min(Math.max(Math.trunc(args.limit), 1), 500)
    const offset = Math.max(Math.trunc(args.offset), 0)

    const q = `
    select
      a.id, a.actor_id, a.action, a.entity, a.entity_id, a.details, a.created_at
    from audit_logs a
    where a.created_at >= $1::date
      and a.created_at < ($2::date + interval '1 day')
    order by a.created_at desc
    limit $3
    offset $4
  `
    const { rows } = await db.query(q, [args.from, args.to, limit, offset])
    return (rows as AuditLogRow[]) ?? []
}
