import { db } from "@/lib/db"
import type { PublicUser } from "@/lib/auth"
import { isValidEmail } from "@/lib/security"

export type ThesisGroupRow = {
    id: string
    title: string
    program: string | null
    term: string | null
    created_at: string
    updated_at: string
    adviser_name: string | null
    adviser_email: string | null
    members_count: number
    next_defense_at: string | null
}

export async function getThesisDashboardStats() {
    const statsRes = await db.query(`
    select
      (select count(*)::int from thesis_groups) as groups_total,
      (select count(*)::int from group_members) as memberships_total,
      (select count(*)::int from defense_schedules where scheduled_at > now() and scheduled_at < now() + interval '30 days') as upcoming_30d
  `)

    const row = statsRes.rows[0] as { groups_total: number; memberships_total: number; upcoming_30d: number } | undefined
    return {
        groups_total: row?.groups_total ?? 0,
        memberships_total: row?.memberships_total ?? 0,
        upcoming_30d: row?.upcoming_30d ?? 0,
    }
}

export async function listThesisGroups(args: { q?: string; limit: number; offset: number }) {
    const q = String(args.q ?? "").trim()
    const limit = Math.min(Math.max(Math.trunc(args.limit), 1), 200)
    const offset = Math.max(Math.trunc(args.offset), 0)

    const where: string[] = []
    const params: Array<string | number> = []

    if (q) {
        params.push(`%${q}%`)
        const i = params.length
        where.push(
            `(g.title ilike $${i}
        or coalesce(g.program,'') ilike $${i}
        or coalesce(g.term,'') ilike $${i}
        or coalesce(a.name,'') ilike $${i}
        or coalesce(a.email,'') ilike $${i})`
        )
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : ""

    const countQ = `
    select count(*)::int as total
    from thesis_groups g
    left join users a on a.id = g.adviser_id
    ${whereSql}
  `
    const countRes = await db.query(countQ, params)
    const total = (countRes.rows[0]?.total as number | undefined) ?? 0

    const listQ = `
    select
      g.id,
      g.title,
      g.program,
      g.term,
      g.created_at,
      g.updated_at,
      a.name as adviser_name,
      a.email as adviser_email,
      coalesce(m.members_count, 0)::int as members_count,
      d.next_defense_at
    from thesis_groups g
    left join users a on a.id = g.adviser_id
    left join (
      select group_id, count(*)::int as members_count
      from group_members
      group by group_id
    ) m on m.group_id = g.id
    left join (
      select group_id, min(scheduled_at) as next_defense_at
      from defense_schedules
      where scheduled_at > now()
      group by group_id
    ) d on d.group_id = g.id
    ${whereSql}
    order by g.created_at desc
    limit $${params.length + 1}
    offset $${params.length + 2}
  `
    const listRes = await db.query(listQ, [...params, limit, offset])
    const groups = (listRes.rows as ThesisGroupRow[]) ?? []

    return { ok: true as const, total, groups }
}

export async function resolveAdviserIdByEmail(email: string) {
    const em = String(email ?? "").trim()
    if (!em) return { ok: true as const, adviserId: null as string | null }

    if (!isValidEmail(em)) {
        return { ok: false as const, message: "Invalid adviser email." }
    }

    const q = `
    select id, role
    from users
    where lower(email) = lower($1)
    limit 1
  `
    const { rows } = await db.query(q, [em])
    const row = rows[0] as { id: string; role: "student" | "staff" | "admin" } | undefined

    if (!row) return { ok: false as const, message: "Adviser email not found." }
    if (row.role !== "staff" && row.role !== "admin") {
        return { ok: false as const, message: "Adviser must be a staff or admin user." }
    }

    return { ok: true as const, adviserId: row.id }
}

export async function createThesisGroup(
    input: { title: string; program?: string | null; term?: string | null; adviserEmail?: string | null },
    actor: PublicUser
) {
    const title = String(input.title ?? "").trim()
    const program = String(input.program ?? "").trim()
    const term = String(input.term ?? "").trim()
    const adviserEmail = String(input.adviserEmail ?? "").trim()

    if (!title) return { ok: false as const, message: "Title is required." }

    let adviserId: string | null = null
    if (adviserEmail) {
        const resolved = await resolveAdviserIdByEmail(adviserEmail)
        if (!resolved.ok) return { ok: false as const, message: resolved.message }
        adviserId = resolved.adviserId
    }

    try {
        const insertQ = `
        insert into thesis_groups (title, adviser_id, program, term)
        values ($1, $2, $3, $4)
        returning id
      `
        const { rows } = await db.query(insertQ, [title, adviserId, program || null, term || null])
        const groupId = rows[0]?.id as string | undefined

        await db.query(
            `
          insert into audit_logs (actor_id, action, entity, entity_id, details)
          values ($1, 'thesis_group_created', 'thesis_groups', $2, $3::jsonb)
        `,
            [
                actor.id,
                groupId ?? null,
                JSON.stringify({
                    title,
                    program: program || null,
                    term: term || null,
                    adviserEmail: adviserEmail || null,
                }),
            ]
        )

        return { ok: true as const, groupId: groupId ?? null }
    } catch (err) {
        console.error("createThesisGroup failed:", err)
        return { ok: false as const, message: "Failed to create thesis group." }
    }
}

export async function deleteThesisGroup(id: string, actor: PublicUser) {
    const gid = String(id ?? "").trim()
    if (!gid) return { ok: false as const, message: "Missing group id." }

    try {
        const delQ = `delete from thesis_groups where id = $1 returning id`
        const { rows } = await db.query(delQ, [gid])
        const deleted = rows[0]?.id as string | undefined
        if (!deleted) return { ok: false as const, message: "Thesis group not found." }

        await db.query(
            `
          insert into audit_logs (actor_id, action, entity, entity_id, details)
          values ($1, 'thesis_group_deleted', 'thesis_groups', $2, $3::jsonb)
        `,
            [actor.id, gid, JSON.stringify({})]
        )

        return { ok: true as const }
    } catch (err) {
        console.error("deleteThesisGroup failed:", err)
        return { ok: false as const, message: "Failed to delete thesis group." }
    }
}
