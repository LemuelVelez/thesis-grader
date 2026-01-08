/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Reports summary types + helpers.
 *
 * Fixes TS errors by ensuring:
 * - ReportsSummary includes `filters`
 * - defenses includes `byRoom` and `byMonth`
 * - audit includes `topActors`
 * - getReportsSummary(...) accepts `program` and `term`
 * - exports `buildAuditExportCsv` used by /api/admin/reports/audit-export
 *
 * NOTE:
 * The implementation below returns safe defaults (zeros/empty arrays).
 * You can later wire real DB queries while keeping the same return shapes.
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
    /**
     * Top active staff/admin users in the audit logs.
     * (UI expects this.)
     */
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
    /**
     * Echo of currently-applied filters.
     * (UI expects this.)
     */
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

    // If both provided, trust caller.
    if (fromIn && toIn) {
        return { from: fromIn, to: toIn }
    }

    const today = new Date()
    const toDate = toIn ? parseISODate(toIn) : startOfDay(today)
    const fromDate = fromIn ? parseISODate(fromIn) : addDays(startOfDay(toDate), -(days - 1)) // inclusive

    return { from: toISODate(fromDate), to: toISODate(toDate) }
}

export type GetReportsSummaryArgs = ResolveDateRangeArgs & ReportsFilters

/**
 * Main entry used by:
 * - /api/admin/reports/summary
 * - /api/admin/reports/print
 *
 * This accepts `program` and `term` and returns a summary object
 * containing the fields the UI is using (filters, defenses.byRoom/byMonth, audit.topActors).
 */
export async function getReportsSummary(args: GetReportsSummaryArgs): Promise<ReportsSummary> {
    const range = resolveDateRange(args)

    const filters: ReportsFilters = {
        program: args.program?.trim() ? args.program.trim() : undefined,
        term: args.term?.trim() ? args.term.trim() : undefined,
    }

    // ✅ Safe defaults so UI never crashes while you wire real queries.
    const summary: ReportsSummary = {
        range,
        filters,

        users: {
            total: 0,
            byStatus: { active: 0, disabled: 0 },
            byRole: { student: 0, staff: 0, admin: 0 },
        },

        thesis: {
            groups_total: 0,
            memberships_total: 0,
            unassigned_adviser: 0,
            byProgram: [],
        },

        defenses: {
            total_in_range: 0,
            byStatus: [],
            byRoom: [],
            byMonth: [],
        },

        evaluations: {
            panel: { total_in_range: 0, byStatus: [] },
            student: { total_in_range: 0, byStatus: [] },
        },

        audit: {
            total_in_range: 0,
            topActions: [],
            topActors: [],
            daily: [],
        },
    }

    return summary
}

/* ------------------------- Audit CSV Export ------------------------- */

export type AuditExportRow = {
    created_at: string // ISO string or YYYY-MM-DD HH:mm:ss
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
    /**
     * Optional: allow callers/tests to provide rows.
     * If omitted, this returns a CSV with just headers (safe default).
     */
    rows?: AuditExportRow[]
}

/**
 * Used by /api/admin/reports/audit-export
 * Returns a { range, csv } payload.
 */
export async function buildAuditExportCsv(
    args: BuildAuditExportCsvArgs
): Promise<{ range: DateRange; csv: string }> {
    const range = resolveDateRange(args)
    const rows = Array.isArray(args.rows) ? args.rows : []

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

    for (const r of rows) {
        const line = [
            r.created_at ?? "",
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

    // Add newline at end to be friendly with Excel/etc.
    const csv = lines.join("\n") + "\n"
    return { range, csv }
}

/* ------------------------- small utils ------------------------- */

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
    // YYYY-MM-DD in local time
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

function parseISODate(s: string) {
    // Accept YYYY-MM-DD; if invalid, fallback to today
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

/**
 * CSV cell escaping:
 * - Wrap in quotes if it contains comma, quote, or newline
 * - Double any quotes inside the cell
 */
function csvCell(v: any) {
    const s = v === null || v === undefined ? "" : String(v)
    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`
    }
    return s
}
