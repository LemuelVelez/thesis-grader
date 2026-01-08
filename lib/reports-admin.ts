/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

/**
 * Reports summary types + helpers backed by real DB queries.
 *
 * Supports:
 * - filters: program, term
 * - defenses: byStatus, byRoom, byMonth
 * - audit: topActions, topActors, daily
 * - audit-export: builds CSV from audit_logs table
 */

export type DateRange = {
    from: string // YYYY-MM-DD
    to: string // YYYY-MM-DD
}

export type ReportsFilters = {
    program?: string
    term?: string
}

export type ReportsUsersSummary = {
    total: number
    byStatus: {
        active: number
        disabled: number
    }
    byRole: {
        student: number
        staff: number
        admin: number
    }
}

export type ReportsThesisSummary = {
    groups_total: number
    memberships_total: number
    unassigned_adviser: number
    byProgram: { program: string; count: number }[]
}

export type ReportsDefensesSummary = {
    total_in_range: number
    byStatus: { status: string; count: number }[]
    byRoom: { room: string; count: number }[]
    byMonth: { month: string; count: number }[]
}

export type ReportsEvaluationsBucket = {
    total_in_range: number
    byStatus: { status: string; count: number }[]
}

export type ReportsEvaluationsSummary = {
    panel: ReportsEvaluationsBucket
    student: ReportsEvaluationsBucket
}

export type ReportsAuditSummary = {
    total_in_range: number
    topActions: { action: string; count: number }[]
    topActors: {
        actor_id: string
        actor_name?: string | null
        actor_email?: string | null
        role: string
        count: number
    }[]
    daily: { day: string; count: number }[]
}

export type ReportsSummary = {
    range: DateRange
    filters: ReportsFilters

    users: ReportsUsersSummary
    thesis: ReportsThesisSummary
    defenses: ReportsDefensesSummary
    evaluations: ReportsEvaluationsSummary
    audit: ReportsAuditSummary
}

export type ResolveDateRangeArgs = Partial<DateRange> & {
    days?: number
}

/**
 * Returns a normalized date range (YYYY-MM-DD).
 * - If both from/to are provided, they are used as-is.
 * - Otherwise it builds a "last N days" window ending today.
 */
export function resolveDateRange(args: ResolveDateRangeArgs): DateRange {
    const daysRaw = typeof args.days === "number" && Number.isFinite(args.days) ? Math.trunc(args.days) : 30
    const days = clampInt(daysRaw, 1, 365)

    const fromIn = (args.from ?? "").trim()
    const toIn = (args.to ?? "").trim()

    if (fromIn && toIn) return { from: fromIn, to: toIn }

    const today = new Date()
    const toDate = toIn ? parseISODate(toIn) : startOfDay(today)
    const fromDate = fromIn ? parseISODate(fromIn) : addDays(startOfDay(toDate), -(days - 1))

    return { from: toISODate(fromDate), to: toISODate(toDate) }
}

export type GetReportsSummaryArgs = ResolveDateRangeArgs & ReportsFilters

export async function getReportsSummary(args: GetReportsSummaryArgs): Promise<ReportsSummary> {
    const range = resolveDateRange(args)

    const filters: ReportsFilters = {
        program: args.program?.trim() ? args.program.trim() : undefined,
        term: args.term?.trim() ? args.term.trim() : undefined,
    }

    // USERS (global)
    const usersQ = `
      select
        count(*)::int as total,
        count(*) filter (where status = 'active')::int as active,
        count(*) filter (where status = 'disabled')::int as disabled,
        count(*) filter (where role = 'student')::int as student,
        count(*) filter (where role = 'staff')::int as staff,
        count(*) filter (where role = 'admin')::int as admin
      from users
    `
    const usersRes = await db.query(usersQ)
    const u0 = usersRes.rows[0] ?? {}

    // THESIS FILTERS (program/term) applied to thesis_groups + downstream joins
    const thesisFilter = buildThesisGroupFilters(filters, "g")

    // Thesis totals
    const thesisTotalsQ = `
      select
        count(*)::int as groups_total,
        count(*) filter (where g.adviser_id is null)::int as unassigned_adviser
      from thesis_groups g
      ${thesisFilter.whereSql}
    `
    const thesisTotalsRes = await db.query(thesisTotalsQ, thesisFilter.params)
    const t0 = thesisTotalsRes.rows[0] ?? {}

    // Thesis memberships total
    const thesisMembershipsQ = `
      select count(*)::int as memberships_total
      from group_members gm
      join thesis_groups g on g.id = gm.group_id
      ${thesisFilter.whereSql}
    `
    const thesisMembershipsRes = await db.query(thesisMembershipsQ, thesisFilter.params)
    const t1 = thesisMembershipsRes.rows[0] ?? {}

    // Thesis byProgram (top 20)
    const thesisByProgramQ = `
      select
        coalesce(nullif(trim(g.program), ''), '(unspecified)') as program,
        count(*)::int as count
      from thesis_groups g
      ${thesisFilter.whereSql}
      group by 1
      order by count desc, program asc
      limit 20
    `
    const thesisByProgramRes = await db.query(thesisByProgramQ, thesisFilter.params)

    // DEFENSES: range + filters
    const defensesFilter = buildDefenseFilters(range, filters)

    const defensesTotalQ = `
      select count(*)::int as total_in_range
      from defense_schedules s
      join thesis_groups g on g.id = s.group_id
      ${defensesFilter.whereSql}
    `
    const defensesTotalRes = await db.query(defensesTotalQ, defensesFilter.params)
    const d0 = defensesTotalRes.rows[0] ?? {}

    const defensesByStatusQ = `
      select
        coalesce(nullif(trim(s.status), ''), '(unspecified)') as status,
        count(*)::int as count
      from defense_schedules s
      join thesis_groups g on g.id = s.group_id
      ${defensesFilter.whereSql}
      group by 1
      order by count desc, status asc
    `
    const defensesByStatusRes = await db.query(defensesByStatusQ, defensesFilter.params)

    const defensesByRoomQ = `
      select
        coalesce(nullif(trim(s.room), ''), '(unspecified)') as room,
        count(*)::int as count
      from defense_schedules s
      join thesis_groups g on g.id = s.group_id
      ${defensesFilter.whereSql}
      group by 1
      order by count desc, room asc
      limit 20
    `
    const defensesByRoomRes = await db.query(defensesByRoomQ, defensesFilter.params)

    const defensesByMonthQ = `
      select
        to_char(date_trunc('month', s.scheduled_at), 'YYYY-MM') as month,
        count(*)::int as count
      from defense_schedules s
      join thesis_groups g on g.id = s.group_id
      ${defensesFilter.whereSql}
      group by 1
      order by month asc
    `
    const defensesByMonthRes = await db.query(defensesByMonthQ, defensesFilter.params)

    // EVALUATIONS (range = created_at)
    const evalPanelFilter = buildEvaluationsFilters("e.created_at", range, filters, "g")

    const evalPanelTotalQ = `
      select count(*)::int as total_in_range
      from evaluations e
      join defense_schedules s on s.id = e.schedule_id
      join thesis_groups g on g.id = s.group_id
      ${evalPanelFilter.whereSql}
    `
    const evalPanelTotalRes = await db.query(evalPanelTotalQ, evalPanelFilter.params)
    const ep0 = evalPanelTotalRes.rows[0] ?? {}

    const evalPanelByStatusQ = `
      select
        coalesce(nullif(trim(e.status), ''), '(unspecified)') as status,
        count(*)::int as count
      from evaluations e
      join defense_schedules s on s.id = e.schedule_id
      join thesis_groups g on g.id = s.group_id
      ${evalPanelFilter.whereSql}
      group by 1
      order by count desc, status asc
    `
    const evalPanelByStatusRes = await db.query(evalPanelByStatusQ, evalPanelFilter.params)

    // STUDENT EVALUATIONS (range = created_at)
    const evalStudentFilter = buildEvaluationsFilters("se.created_at", range, filters, "g")

    const evalStudentTotalQ = `
      select count(*)::int as total_in_range
      from student_evaluations se
      join defense_schedules s on s.id = se.schedule_id
      join thesis_groups g on g.id = s.group_id
      ${evalStudentFilter.whereSql}
    `
    const evalStudentTotalRes = await db.query(evalStudentTotalQ, evalStudentFilter.params)
    const es0 = evalStudentTotalRes.rows[0] ?? {}

    const evalStudentByStatusQ = `
      select
        se.status::text as status,
        count(*)::int as count
      from student_evaluations se
      join defense_schedules s on s.id = se.schedule_id
      join thesis_groups g on g.id = s.group_id
      ${evalStudentFilter.whereSql}
      group by 1
      order by count desc, status asc
    `
    const evalStudentByStatusRes = await db.query(evalStudentByStatusQ, evalStudentFilter.params)

    // AUDIT (global; range = created_at)
    const auditFilter = buildDateRangeOnlyFilters("a.created_at", range)

    const auditTotalQ = `
      select count(*)::int as total_in_range
      from audit_logs a
      ${auditFilter.whereSql}
    `
    const auditTotalRes = await db.query(auditTotalQ, auditFilter.params)
    const a0 = auditTotalRes.rows[0] ?? {}

    const auditTopActionsQ = `
      select a.action as action, count(*)::int as count
      from audit_logs a
      ${auditFilter.whereSql}
      group by a.action
      order by count desc, action asc
      limit 20
    `
    const auditTopActionsRes = await db.query(auditTopActionsQ, auditFilter.params)

    const auditDailyQ = `
      select to_char(a.created_at::date, 'YYYY-MM-DD') as day, count(*)::int as count
      from audit_logs a
      ${auditFilter.whereSql}
      group by 1
      order by day asc
    `
    const auditDailyRes = await db.query(auditDailyQ, auditFilter.params)

    const auditTopActorsQ = `
      select
        a.actor_id as actor_id,
        u.name as actor_name,
        u.email as actor_email,
        u.role::text as role,
        count(*)::int as count
      from audit_logs a
      join users u on u.id = a.actor_id
      ${auditFilter.whereSql}
        and u.role in ('staff','admin')
      group by a.actor_id, u.name, u.email, u.role
      order by count desc, u.name asc
      limit 20
    `
    const auditTopActorsRes = await db.query(auditTopActorsQ, auditFilter.params)

    const summary: ReportsSummary = {
        range,
        filters,

        users: {
            total: u0.total ?? 0,
            byStatus: { active: u0.active ?? 0, disabled: u0.disabled ?? 0 },
            byRole: { student: u0.student ?? 0, staff: u0.staff ?? 0, admin: u0.admin ?? 0 },
        },

        thesis: {
            groups_total: t0.groups_total ?? 0,
            memberships_total: t1.memberships_total ?? 0,
            unassigned_adviser: t0.unassigned_adviser ?? 0,
            byProgram: (thesisByProgramRes.rows ?? []).map((r: any) => ({
                program: String(r.program),
                count: Number(r.count ?? 0),
            })),
        },

        defenses: {
            total_in_range: d0.total_in_range ?? 0,
            byStatus: (defensesByStatusRes.rows ?? []).map((r: any) => ({
                status: String(r.status),
                count: Number(r.count ?? 0),
            })),
            byRoom: (defensesByRoomRes.rows ?? []).map((r: any) => ({
                room: String(r.room),
                count: Number(r.count ?? 0),
            })),
            byMonth: (defensesByMonthRes.rows ?? []).map((r: any) => ({
                month: String(r.month),
                count: Number(r.count ?? 0),
            })),
        },

        evaluations: {
            panel: {
                total_in_range: ep0.total_in_range ?? 0,
                byStatus: (evalPanelByStatusRes.rows ?? []).map((r: any) => ({
                    status: String(r.status),
                    count: Number(r.count ?? 0),
                })),
            },
            student: {
                total_in_range: es0.total_in_range ?? 0,
                byStatus: (evalStudentByStatusRes.rows ?? []).map((r: any) => ({
                    status: String(r.status),
                    count: Number(r.count ?? 0),
                })),
            },
        },

        audit: {
            total_in_range: a0.total_in_range ?? 0,
            topActions: (auditTopActionsRes.rows ?? []).map((r: any) => ({
                action: String(r.action),
                count: Number(r.count ?? 0),
            })),
            topActors: (auditTopActorsRes.rows ?? []).map((r: any) => ({
                actor_id: String(r.actor_id),
                actor_name: r.actor_name ?? null,
                actor_email: r.actor_email ?? null,
                role: String(r.role ?? ""),
                count: Number(r.count ?? 0),
            })),
            daily: (auditDailyRes.rows ?? []).map((r: any) => ({
                day: String(r.day),
                count: Number(r.count ?? 0),
            })),
        },
    }

    return summary
}

/* ------------------------- Audit CSV Export ------------------------- */

export type AuditExportRow = {
    created_at: string
    actor_id?: string | null
    actor_name?: string | null
    actor_email?: string | null
    role?: string | null
    action: string
    entity_type?: string | null
    entity_id?: string | null
    metadata?: any
}

export type BuildAuditExportCsvArgs = ResolveDateRangeArgs & {
    // optional future filters; audit export currently is global
}

export async function buildAuditExportCsv(
    args: BuildAuditExportCsvArgs
): Promise<{ range: DateRange; csv: string }> {
    const range = resolveDateRange(args)

    const filter = buildDateRangeOnlyFilters("a.created_at", range)

    const q = `
      select
        a.created_at,
        a.actor_id,
        u.name as actor_name,
        u.email as actor_email,
        u.role::text as role,
        a.action,
        a.entity as entity_type,
        a.entity_id,
        a.details as metadata
      from audit_logs a
      left join users u on u.id = a.actor_id
      ${filter.whereSql}
      order by a.created_at desc
    `
    const { rows } = await db.query(q, filter.params)

    const headers = [
        "created_at",
        "actor_id",
        "actor_name",
        "actor_email",
        "role",
        "action",
        "entity_type",
        "entity_id",
        "metadata",
    ]

    const lines: string[] = []
    lines.push(headers.join(","))

    for (const r of rows ?? []) {
        const createdAt =
            r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? "")

        const line = [
            createdAt,
            r.actor_id ?? "",
            r.actor_name ?? "",
            r.actor_email ?? "",
            r.role ?? "",
            r.action ?? "",
            r.entity_type ?? "",
            r.entity_id ?? "",
            r.metadata === undefined ? "" : safeJson(r.metadata),
        ].map(csvCell)

        lines.push(line.join(","))
    }

    return { range, csv: lines.join("\n") + "\n" }
}

/* ------------------------- SQL filter builders ------------------------- */

function buildThesisGroupFilters(filters: ReportsFilters, alias: string) {
    const where: string[] = []
    const params: any[] = []

    if (filters.program) {
        params.push(filters.program)
        where.push(`${alias}.program = $${params.length}`)
    }
    if (filters.term) {
        params.push(filters.term)
        where.push(`${alias}.term = $${params.length}`)
    }

    return {
        whereSql: where.length ? `where ${where.join(" and ")}` : "",
        params,
    }
}

function buildDefenseFilters(range: DateRange, filters: ReportsFilters) {
    const where: string[] = []
    const params: any[] = []

    // range on scheduled_at
    params.push(range.from)
    where.push(`s.scheduled_at >= $${params.length}::date`)
    params.push(range.to)
    where.push(`s.scheduled_at < ($${params.length}::date + interval '1 day')`)

    if (filters.program) {
        params.push(filters.program)
        where.push(`g.program = $${params.length}`)
    }
    if (filters.term) {
        params.push(filters.term)
        where.push(`g.term = $${params.length}`)
    }

    return {
        whereSql: `where ${where.join(" and ")}`,
        params,
    }
}

function buildEvaluationsFilters(dateColumn: string, range: DateRange, filters: ReportsFilters, groupAlias: string) {
    const where: string[] = []
    const params: any[] = []

    params.push(range.from)
    where.push(`${dateColumn} >= $${params.length}::date`)
    params.push(range.to)
    where.push(`${dateColumn} < ($${params.length}::date + interval '1 day')`)

    if (filters.program) {
        params.push(filters.program)
        where.push(`${groupAlias}.program = $${params.length}`)
    }
    if (filters.term) {
        params.push(filters.term)
        where.push(`${groupAlias}.term = $${params.length}`)
    }

    return { whereSql: `where ${where.join(" and ")}`, params }
}

function buildDateRangeOnlyFilters(dateColumn: string, range: DateRange) {
    const where: string[] = []
    const params: any[] = []

    params.push(range.from)
    where.push(`${dateColumn} >= $${params.length}::date`)
    params.push(range.to)
    where.push(`${dateColumn} < ($${params.length}::date + interval '1 day')`)

    return { whereSql: `where ${where.join(" and ")}`, params }
}

/* ------------------------- misc utils ------------------------- */

function clampInt(n: number, min: number, max: number) {
    return Math.min(Math.max(n, min), max)
}

function startOfDay(d: Date) {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
}

function addDays(d: Date, days: number) {
    const x = new Date(d)
    x.setDate(x.getDate() + days)
    return x
}

function toISODate(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

function parseISODate(s: string) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
    if (!m) return startOfDay(new Date())
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    const dt = new Date(y, mo - 1, d)
    if (!Number.isFinite(dt.getTime())) return startOfDay(new Date())
    return startOfDay(dt)
}

function safeJson(v: any) {
    try {
        return JSON.stringify(v)
    } catch {
        return String(v ?? "")
    }
}

function csvCell(v: any) {
    const s = v === null || v === undefined ? "" : String(v)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
}
