/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"

import { env } from "@/lib/env"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function isUuid(v: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

async function requireStaffOrAdmin(req: NextRequest) {
    // resilient to different requireRole signatures
    try {
        return await (requireRole as any)(req, ["staff", "admin"])
    } catch {
        return await (requireRole as any)(["staff", "admin"])
    }
}

type GroupDetailsRow = {
    id: string
    title: string
    program: string | null
    term: string | null
    created_at: string
    updated_at: string
    adviser_id: string | null
    adviser_name: string | null
    adviser_email: string | null
}

type MemberRow = {
    id: string
    name: string
    email: string
    program: string | null
    section: string | null
    status: "active" | "disabled"
}

type ScheduleRow = {
    id: string
    scheduled_at: string
    room: string | null
    status: string
    panelists_count: number
}

async function readParams(ctx: { params: { id: string } | Promise<{ id: string }> }) {
    return await Promise.resolve(ctx.params as any)
}

export async function GET(req: NextRequest, ctx: { params: { id: string } | Promise<{ id: string }> }) {
    try {
        if (!env.DATABASE_URL) {
            return NextResponse.json(
                { ok: false, message: "Database is not configured (DATABASE_URL missing)." },
                { status: 500 }
            )
        }

        const auth = await requireStaffOrAdmin(req)
        if (!auth?.ok) {
            return NextResponse.json(
                { ok: false, message: auth?.message ?? "Forbidden" },
                { status: auth?.status ?? 403 }
            )
        }

        const p = await readParams(ctx)
        const groupId = String(p?.id ?? "").trim()
        if (!groupId || !isUuid(groupId)) {
            return NextResponse.json({ ok: false, message: "Invalid group id." }, { status: 400 })
        }

        // 1) Group core details + adviser info
        const groupQ = `
      select
        g.id,
        g.title,
        g.program,
        g.term,
        g.created_at,
        g.updated_at,
        g.adviser_id,
        a.name as adviser_name,
        a.email as adviser_email
      from thesis_groups g
      left join users a on a.id = g.adviser_id
      where g.id = $1
      limit 1
    `
        const groupRes = await db.query(groupQ, [groupId])
        const group = groupRes.rows[0] as GroupDetailsRow | undefined
        if (!group) {
            return NextResponse.json({ ok: false, message: "Thesis group not found." }, { status: 404 })
        }

        // 2) Members (students) + student profile (program/section)
        const membersQ = `
      select
        u.id,
        u.name,
        u.email,
        u.status,
        s.program,
        s.section
      from group_members gm
      join users u on u.id = gm.student_id
      left join students s on s.user_id = u.id
      where gm.group_id = $1
      order by u.name asc
    `
        const membersRes = await db.query(membersQ, [groupId])
        const members = (membersRes.rows as MemberRow[]) ?? []

        // 3) Defense schedules for this group (latest first) + panelists count
        const schedulesQ = `
      select
        ds.id,
        ds.scheduled_at,
        ds.room,
        ds.status,
        coalesce(p.panelists_count, 0)::int as panelists_count
      from defense_schedules ds
      left join (
        select schedule_id, count(*)::int as panelists_count
        from schedule_panelists
        group by schedule_id
      ) p on p.schedule_id = ds.id
      where ds.group_id = $1
      order by ds.scheduled_at desc
      limit 50
    `
        const schedulesRes = await db.query(schedulesQ, [groupId])
        const schedules = (schedulesRes.rows as ScheduleRow[]) ?? []

        return NextResponse.json({
            ok: true,
            group,
            members,
            schedules,
        })
    } catch (err: any) {
        console.error("GET /api/staff/thesis-groups/[id] failed:", err)
        return NextResponse.json({ ok: false, message: "Internal Server Error" }, { status: 500 })
    }
}
