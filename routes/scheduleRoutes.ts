/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"

import { db } from "@/lib/db"
import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth"

type Role = "student" | "staff" | "admin"

async function requireUser(allowed: Role[]) {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) {
        return { user: null, error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) }
    }

    const user = await getUserFromSession(token)
    if (!user) {
        return { user: null, error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) }
    }

    const role = String(user.role || "").toLowerCase() as Role
    if (!allowed.includes(role)) {
        return { user: null, error: NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 }) }
    }

    return { user, error: null as any }
}

function clampInt(v: string | null, def: number, min: number, max: number) {
    const n = Number(v)
    if (!Number.isFinite(n)) return def
    return Math.max(min, Math.min(max, Math.trunc(n)))
}

function asDateStartISO(yyyyMmDd: string) {
    return new Date(`${yyyyMmDd}T00:00:00.000Z`).toISOString()
}

function asDateEndISOExclusive(yyyyMmDd: string) {
    const d = new Date(`${yyyyMmDd}T00:00:00.000Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString()
}

async function insertAudit(params: {
    actorId: string
    action: string
    entity: string
    entityId?: string | null
    details?: any
}) {
    try {
        await db.query(
            `
      insert into audit_logs (actor_id, action, entity, entity_id, details)
      values ($1, $2, $3, $4, $5::jsonb)
      `,
            [
                params.actorId,
                params.action,
                params.entity,
                params.entityId ?? null,
                JSON.stringify(params.details ?? {}),
            ]
        )
    } catch {
        // do not block core flow if audit insert fails
    }
}

async function canStaffManageSchedule(scheduleId: string, staffId: string) {
    const r = await db.query(
        `
    select
      exists(select 1 from defense_schedules ds where ds.id = $1 and ds.created_by = $2) as created,
      exists(select 1 from schedule_panelists sp where sp.schedule_id = $1 and sp.staff_id = $2) as assigned
    `,
        [scheduleId, staffId]
    )
    const row = r.rows?.[0]
    return Boolean(row?.created || row?.assigned)
}

export async function GET(req: NextRequest) {
    const auth = await requireUser(["staff", "admin"])
    if (auth.error) return auth.error

    const role = String(auth.user?.role ?? "").toLowerCase() as Role

    try {
        const url = new URL(req.url)
        const resource = (url.searchParams.get("resource") || "").toLowerCase()

        // -------------------------
        // schedules
        // -------------------------
        if (resource === "schedules") {
            const id = url.searchParams.get("id")
            if (id) {
                const args: any[] = [id]
                let whereExtra = ""

                // Staff visibility is scoped: can only view schedules they created or are assigned to.
                if (role === "staff") {
                    args.push(auth.user!.id)
                    whereExtra = `
            and (
              s.created_by = $2
              or exists (select 1 from schedule_panelists sp where sp.schedule_id = s.id and sp.staff_id = $2)
            )
          `
                }

                const r = await db.query(
                    `
          select
            s.id,
            s.group_id as "groupId",
            s.scheduled_at as "scheduledAt",
            s.room,
            s.status,
            s.created_by as "createdBy",
            s.created_at as "createdAt",
            s.updated_at as "updatedAt",
            g.title as "groupTitle",
            g.program as "program",
            g.term as "term"
          from defense_schedules s
          left join thesis_groups g on g.id = s.group_id
          where s.id = $1
          ${whereExtra}
          limit 1
          `,
                    args
                )

                if (!r.rows?.[0]) {
                    return NextResponse.json({ ok: false, message: "Schedule not found" }, { status: 404 })
                }
                return NextResponse.json({ ok: true, schedule: r.rows[0] })
            }

            const limit = clampInt(url.searchParams.get("limit"), 20, 1, 200)
            const offset = clampInt(url.searchParams.get("offset"), 0, 0, 10_000)

            const q = (url.searchParams.get("q") || "").trim()
            const status = (url.searchParams.get("status") || "").trim()
            const from = (url.searchParams.get("from") || "").trim()
            const to = (url.searchParams.get("to") || "").trim()

            const where: string[] = []
            const args: any[] = []
            let idx = 1

            if (status) {
                where.push(`lower(s.status) = lower($${idx++})`)
                args.push(status)
            }

            if (from) {
                where.push(`s.scheduled_at >= $${idx++}`)
                args.push(asDateStartISO(from))
            }

            if (to) {
                where.push(`s.scheduled_at < $${idx++}`)
                args.push(asDateEndISOExclusive(to))
            }

            if (q) {
                where.push(`(
          coalesce(s.room,'') ilike $${idx} or
          coalesce(s.status,'') ilike $${idx} or
          coalesce(g.title,'') ilike $${idx}
        )`)
                args.push(`%${q}%`)
                idx++
            }

            // Staff visibility is scoped: only schedules they created or assigned to.
            if (role === "staff") {
                where.push(`(
          s.created_by = $${idx}
          or exists (select 1 from schedule_panelists sp where sp.schedule_id = s.id and sp.staff_id = $${idx})
        )`)
                args.push(auth.user!.id)
                idx++
            }

            const whereSql = where.length ? `where ${where.join(" and ")}` : ""

            const totalRes = await db.query(
                `
        select count(*)::int as total
        from defense_schedules s
        left join thesis_groups g on g.id = s.group_id
        ${whereSql}
        `,
                args
            )

            const rowsRes = await db.query(
                `
        select
          s.id,
          s.group_id as "groupId",
          s.scheduled_at as "scheduledAt",
          s.room,
          s.status,
          s.created_by as "createdBy",
          s.created_at as "createdAt",
          s.updated_at as "updatedAt",
          g.title as "groupTitle",
          g.program as "program",
          g.term as "term"
        from defense_schedules s
        left join thesis_groups g on g.id = s.group_id
        ${whereSql}
        order by s.scheduled_at desc
        limit $${idx} offset $${idx + 1}
        `,
                [...args, limit, offset]
            )

            return NextResponse.json({
                ok: true,
                total: totalRes.rows?.[0]?.total ?? 0,
                schedules: rowsRes.rows ?? [],
            })
        }

        // -------------------------
        // panelists
        // -------------------------
        if (resource === "panelists") {
            const scheduleId = (url.searchParams.get("scheduleId") || "").trim()
            if (!scheduleId) {
                return NextResponse.json({ ok: false, message: "scheduleId is required" }, { status: 400 })
            }

            // Staff visibility is scoped.
            if (role === "staff") {
                const ok = await canStaffManageSchedule(scheduleId, auth.user!.id)
                if (!ok) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
            }

            const r = await db.query(
                `
        select
          p.schedule_id as "scheduleId",
          p.staff_id as "staffId",
          coalesce(u.name, u.email) as "staffName",
          u.email as "staffEmail"
        from schedule_panelists p
        join users u on u.id = p.staff_id
        where p.schedule_id = $1
        order by "staffName" asc
        `,
                [scheduleId]
            )

            return NextResponse.json({ ok: true, panelists: r.rows ?? [] })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (e: any) {
        return NextResponse.json({ ok: false, message: e?.message ?? "Server error" }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    const auth = await requireUser(["staff", "admin"])
    if (auth.error) return auth.error

    const role = String(auth.user?.role ?? "").toLowerCase() as Role

    try {
        const url = new URL(req.url)
        const resource = (url.searchParams.get("resource") || "").toLowerCase()
        const body = await req.json().catch(() => ({}))

        if (resource === "schedules") {
            const groupId = String(body.groupId || "").trim()
            const scheduledAt = String(body.scheduledAt || "").trim()
            const room = body.room ?? null
            const status = String(body.status || "scheduled").trim()
            const createdBy = body.createdBy ?? auth.user?.id ?? null
            const reason = String(body.reason || "").trim()

            if (!groupId || !scheduledAt) {
                return NextResponse.json({ ok: false, message: "groupId and scheduledAt are required" }, { status: 400 })
            }
            if (role === "admin" && !reason) {
                return NextResponse.json({ ok: false, message: "reason is required for admin overrides" }, { status: 400 })
            }

            const r = await db.query(
                `
        insert into defense_schedules (group_id, scheduled_at, room, status, created_by)
        values ($1, $2, $3, $4, $5)
        returning id
        `,
                [groupId, scheduledAt, room, status, createdBy]
            )

            const newId = r.rows?.[0]?.id

            await insertAudit({
                actorId: auth.user!.id,
                action: "schedule.create",
                entity: "defense_schedules",
                entityId: newId ?? null,
                details: { groupId, scheduledAt, room, status, reason: reason || undefined },
            })

            return NextResponse.json({ ok: true, id: newId })
        }

        if (resource === "panelists") {
            const scheduleId = String(body.scheduleId || "").trim()
            const staffId = String(body.staffId || "").trim()
            const reason = String(body.reason || "").trim()

            if (!scheduleId || !staffId) {
                return NextResponse.json({ ok: false, message: "scheduleId and staffId are required" }, { status: 400 })
            }
            if (role === "admin" && !reason) {
                return NextResponse.json({ ok: false, message: "reason is required for admin overrides" }, { status: 400 })
            }

            // Staff can only manage schedules they created or assigned to.
            if (role === "staff") {
                const ok = await canStaffManageSchedule(scheduleId, auth.user!.id)
                if (!ok) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
            }

            // ensure staff exists + is staff
            const u = await db.query(`select id, role from users where id = $1 limit 1`, [staffId])
            const uRole = String(u.rows?.[0]?.role || "").toLowerCase()
            if (!u.rows?.[0] || uRole !== "staff") {
                return NextResponse.json({ ok: false, message: "Selected user must be STAFF" }, { status: 400 })
            }

            await db.query(
                `
        insert into schedule_panelists (schedule_id, staff_id)
        values ($1, $2)
        on conflict do nothing
        `,
                [scheduleId, staffId]
            )

            await insertAudit({
                actorId: auth.user!.id,
                action: "schedule.panelist.add",
                entity: "schedule_panelists",
                entityId: scheduleId,
                details: { staffId, reason: reason || undefined },
            })

            return NextResponse.json({ ok: true })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (e: any) {
        return NextResponse.json({ ok: false, message: e?.message ?? "Server error" }, { status: 500 })
    }
}

export async function PATCH(req: NextRequest) {
    const auth = await requireUser(["staff", "admin"])
    if (auth.error) return auth.error

    const role = String(auth.user?.role ?? "").toLowerCase() as Role

    try {
        const url = new URL(req.url)
        const resource = (url.searchParams.get("resource") || "").toLowerCase()
        const id = (url.searchParams.get("id") || "").trim()
        const body = await req.json().catch(() => ({}))

        if (resource !== "schedules") {
            return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
        }

        const reason = String(body.reason || "").trim()
        if (role === "admin" && !reason) {
            return NextResponse.json({ ok: false, message: "reason is required for admin overrides" }, { status: 400 })
        }

        const scheduledAt = body.scheduledAt ? String(body.scheduledAt).trim() : null
        const room = Object.prototype.hasOwnProperty.call(body, "room") ? body.room : undefined
        const status = body.status ? String(body.status).trim() : null

        if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })

        // Staff can only manage schedules they created or assigned to.
        if (role === "staff") {
            const ok = await canStaffManageSchedule(id, auth.user!.id)
            if (!ok) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
        }

        await db.query(
            `
      update defense_schedules
      set
        scheduled_at = coalesce($2, scheduled_at),
        room = case when $3::text is null then room else $3 end,
        status = coalesce($4, status),
        updated_at = now()
      where id = $1
      `,
            [id, scheduledAt, room, status]
        )

        await insertAudit({
            actorId: auth.user!.id,
            action: "schedule.update",
            entity: "defense_schedules",
            entityId: id,
            details: { patch: { scheduledAt, room, status }, reason: reason || undefined },
        })

        return NextResponse.json({ ok: true })
    } catch (e: any) {
        return NextResponse.json({ ok: false, message: e?.message ?? "Server error" }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest) {
    const auth = await requireUser(["staff", "admin"])
    if (auth.error) return auth.error

    const role = String(auth.user?.role ?? "").toLowerCase() as Role

    try {
        const url = new URL(req.url)
        const resource = (url.searchParams.get("resource") || "").toLowerCase()

        if (resource === "schedules") {
            const id = (url.searchParams.get("id") || "").trim()
            const reason = (url.searchParams.get("reason") || "").trim()
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })
            if (role === "admin" && !reason) {
                return NextResponse.json({ ok: false, message: "reason is required for admin overrides" }, { status: 400 })
            }

            if (role === "staff") {
                const ok = await canStaffManageSchedule(id, auth.user!.id)
                if (!ok) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
            }

            await db.query(`delete from schedule_panelists where schedule_id = $1`, [id])
            await db.query(`delete from defense_schedules where id = $1`, [id])

            await insertAudit({
                actorId: auth.user!.id,
                action: "schedule.delete",
                entity: "defense_schedules",
                entityId: id,
                details: { reason: reason || undefined },
            })

            return NextResponse.json({ ok: true })
        }

        if (resource === "panelists") {
            const scheduleId = (url.searchParams.get("scheduleId") || "").trim()
            const staffId = (url.searchParams.get("staffId") || "").trim()
            const reason = (url.searchParams.get("reason") || "").trim()

            if (!scheduleId || !staffId) {
                return NextResponse.json({ ok: false, message: "scheduleId and staffId are required" }, { status: 400 })
            }
            if (role === "admin" && !reason) {
                return NextResponse.json({ ok: false, message: "reason is required for admin overrides" }, { status: 400 })
            }

            if (role === "staff") {
                const ok = await canStaffManageSchedule(scheduleId, auth.user!.id)
                if (!ok) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
            }

            await db.query(`delete from schedule_panelists where schedule_id = $1 and staff_id = $2`, [scheduleId, staffId])

            await insertAudit({
                actorId: auth.user!.id,
                action: "schedule.panelist.remove",
                entity: "schedule_panelists",
                entityId: scheduleId,
                details: { staffId, reason: reason || undefined },
            })

            return NextResponse.json({ ok: true })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (e: any) {
        return NextResponse.json({ ok: false, message: e?.message ?? "Server error" }, { status: 500 })
    }
}
