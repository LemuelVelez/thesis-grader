/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

export type DbAuditLog = {
    id: string
    actorId: string | null
    actorName: string | null
    actorEmail: string | null
    action: string | null
    entity: string | null
    entityId: string | null
    ip: string | null
    userAgent: string | null
    meta: any
    createdAt: string | null
}

type ResolvedAuditSchema = {
    table: string
    cols: Set<string>
    col: {
        id?: string
        createdAt?: string
        actorId?: string
        action?: string
        entity?: string
        entityId?: string
        ip?: string
        userAgent?: string
        meta?: string
    }
}

let cachedSchema: ResolvedAuditSchema | null = null

function ident(name: string) {
    // very strict identifier validation
    if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error(`Unsafe identifier: ${name}`)
    return `"${name}"`
}

async function resolveAuditSchema(): Promise<ResolvedAuditSchema> {
    if (cachedSchema) return cachedSchema

    const candidates = ["audit_logs", "audit_log", "audit_events", "audit"]

    const { rows: tableRows } = await db.query(
        `
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_type = 'BASE TABLE'
          and table_name = any($1::text[])
        order by array_position($1::text[], table_name) asc
        limit 1
      `,
        [candidates]
    )

    const table = String(tableRows?.[0]?.table_name ?? "")
    if (!table) {
        throw Object.assign(
            new Error(
                `Audit table not found. Expected one of: ${candidates.join(
                    ", "
                )}. Ensure your audit migration ran.`
            ),
            { status: 500 }
        )
    }

    const { rows: colRows } = await db.query(
        `
        select column_name
        from information_schema.columns
        where table_schema = 'public' and table_name = $1
      `,
        [table]
    )

    const cols = new Set<string>(colRows.map((r: any) => String(r.column_name)))

    const pick = (names: string[]) => names.find((n) => cols.has(n))

    const schema: ResolvedAuditSchema = {
        table,
        cols,
        col: {
            id: pick(["id"]),
            createdAt: pick(["created_at", "createdAt", "timestamp", "time", "at"]),
            actorId: pick(["actor_id", "user_id", "actorId", "userId"]),
            action: pick(["action", "event", "type", "operation"]),
            entity: pick(["entity", "resource", "table", "model"]),
            entityId: pick(["entity_id", "resource_id", "record_id", "target_id", "entityId"]),
            ip: pick(["ip", "ip_address", "ipAddress"]),
            userAgent: pick(["user_agent", "useragent", "userAgent"]),
            meta: pick(["metadata", "meta", "details", "data", "payload"]),
        },
    }

    cachedSchema = schema
    return schema
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

export async function listAuditLogs(params: {
    q?: string
    action?: string
    entity?: string
    actorId?: string
    from?: string
    to?: string
    limit?: number
    offset?: number
}) {
    const schema = await resolveAuditSchema()

    const q = (params.q ?? "").trim()
    const limit = normLimit(params.limit, 50)
    const offset = normOffset(params.offset)

    const where: string[] = []
    const values: any[] = []
    let i = 1

    const al = "al"

    const colId = schema.col.id ?? "id"
    const colCreatedAt = schema.col.createdAt
    const colActorId = schema.col.actorId
    const colAction = schema.col.action
    const colEntity = schema.col.entity
    const colEntityId = schema.col.entityId
    const colIp = schema.col.ip
    const colUserAgent = schema.col.userAgent
    const colMeta = schema.col.meta

    // joins
    const joinUsers =
        !!colActorId &&
        (() => {
            // users table assumed to exist in your app (already used elsewhere)
            return `left join users u on u.id = ${al}.${ident(colActorId)}`
        })()

    // filters
    if (q) {
        const like = `%${q}%`
        const parts: string[] = []
        if (colAction) parts.push(`${al}.${ident(colAction)}::text ilike $${i}`)
        if (colEntity) parts.push(`coalesce(${al}.${ident(colEntity)}::text,'') ilike $${i}`)
        if (colEntityId) parts.push(`coalesce(${al}.${ident(colEntityId)}::text,'') ilike $${i}`)
        if (joinUsers) parts.push(`coalesce(u.name,'') ilike $${i}`)
        if (joinUsers) parts.push(`coalesce(u.email,'') ilike $${i}`)

        if (parts.length) {
            where.push(`(${parts.join(" or ")})`)
            values.push(like)
            i++
        }
    }

    if (params.action && colAction) {
        where.push(`${al}.${ident(colAction)}::text = $${i++}`)
        values.push(params.action)
    }

    if (params.entity && colEntity) {
        where.push(`${al}.${ident(colEntity)}::text = $${i++}`)
        values.push(params.entity)
    }

    if (params.actorId && colActorId) {
        where.push(`${al}.${ident(colActorId)}::text = $${i++}`)
        values.push(params.actorId)
    }

    if (params.from && colCreatedAt) {
        where.push(`${al}.${ident(colCreatedAt)} >= $${i++}::timestamptz`)
        values.push(params.from)
    }

    if (params.to && colCreatedAt) {
        where.push(`${al}.${ident(colCreatedAt)} <= $${i++}::timestamptz`)
        values.push(params.to)
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : ""

    const fromSql = `from ${ident(schema.table)} ${al} ${joinUsers ? joinUsers : ""} ${whereSql}`

    const countQ = `select count(*)::int as count ${fromSql}`

    const metaSelect = colMeta ? `${al}.${ident(colMeta)} as meta` : `to_jsonb(${al}.*) as meta`

    const createdAtSelect = colCreatedAt ? `${al}.${ident(colCreatedAt)} as "createdAt"` : `null::timestamptz as "createdAt"`
    const actionSelect = colAction ? `${al}.${ident(colAction)}::text as action` : `null::text as action`
    const entitySelect = colEntity ? `${al}.${ident(colEntity)}::text as entity` : `null::text as entity`
    const entityIdSelect = colEntityId ? `${al}.${ident(colEntityId)}::text as "entityId"` : `null::text as "entityId"`
    const actorIdSelect = colActorId ? `${al}.${ident(colActorId)}::text as "actorId"` : `null::text as "actorId"`
    const ipSelect = colIp ? `${al}.${ident(colIp)}::text as ip` : `null::text as ip`
    const uaSelect = colUserAgent ? `${al}.${ident(colUserAgent)}::text as "userAgent"` : `null::text as "userAgent"`

    const orderBy = colCreatedAt
        ? `${al}.${ident(colCreatedAt)} desc`
        : `${al}.${ident(colId)} desc`

    const listQ = `
        select
          ${al}.${ident(colId)}::text as id,
          ${actorIdSelect},
          ${joinUsers ? `u.name as "actorName", u.email as "actorEmail",` : `null::text as "actorName", null::text as "actorEmail",`}
          ${actionSelect},
          ${entitySelect},
          ${entityIdSelect},
          ${ipSelect},
          ${uaSelect},
          ${metaSelect},
          ${createdAtSelect}
        ${fromSql}
        order by ${orderBy}
        limit $${i} offset $${i + 1}
    `

    const [{ rows: countRows }, { rows }] = await Promise.all([
        db.query(countQ, values),
        db.query(listQ, [...values, limit, offset]),
    ])

    return {
        total: (countRows?.[0]?.count ?? 0) as number,
        logs: rows as DbAuditLog[],
    }
}
