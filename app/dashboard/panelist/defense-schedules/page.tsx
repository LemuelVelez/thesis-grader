"use client"

import * as React from "react"
import Link from "next/link"
import { CalendarClock, CheckCircle2, Clock3, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type DefenseScheduleStatus =
    | "scheduled"
    | "ongoing"
    | "completed"
    | "cancelled"
    | (string & {})

type PanelistLite = {
    id: string
    name: string
    email: string | null
}

type DefenseScheduleRecord = {
    id: string
    group_id: string
    group_title: string | null
    scheduled_at: string
    room: string | null
    status: DefenseScheduleStatus
    rubric_template_id: string | null
    rubric_template_name: string | null
    created_by: string | null
    created_by_id: string | null
    created_by_name: string | null
    created_by_email: string | null
    created_at: string
    updated_at: string
    panelists: PanelistLite[]
}

type ApiListPayload = {
    items?: unknown
    item?: unknown
    error?: string
    message?: string
}

type ThesisGroupOption = {
    id: string
    title: string
}

type RubricTemplateOption = {
    id: string
    name: string
}

const STATUS_FILTERS = ["all", "scheduled", "ongoing", "completed", "cancelled"] as const

const READ_ENDPOINTS = [
    "/api/panelist/defense-schedules",
    "/api/panelist/schedules",
    "/api/defense-schedules",
    "/api/admin/defense-schedules",
] as const

const GROUP_ENDPOINTS = ["/api/thesis-groups", "/api/admin/thesis-groups"] as const
const RUBRIC_ENDPOINTS = [
    "/api/rubric-templates?active=true",
    "/api/admin/rubric-templates?active=true",
    "/api/rubric-templates",
    "/api/admin/rubric-templates",
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function pickString(source: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = source[key]
        if (typeof value === "string" && value.trim().length > 0) return value
    }
    return null
}

function pickNullableString(source: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = source[key]
        if (typeof value === "string") return value
        if (value === null) return null
    }
    return null
}

function toTitleCase(value: string): string {
    if (!value) return ""
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDateTime(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
}

function normalizePanelists(raw: unknown): PanelistLite[] {
    if (!Array.isArray(raw)) return []

    const output: PanelistLite[] = []

    for (const item of raw) {
        if (!isRecord(item)) continue

        const id =
            pickString(item, ["id", "staff_id", "staffId", "user_id", "userId"]) ?? ""

        const name =
            pickString(item, ["name", "full_name", "staff_name", "staffName", "email"]) ??
            "Unknown Panelist"

        const email = pickNullableString(item, ["email", "staff_email", "staffEmail"])

        output.push({ id, name, email })
    }

    return output
}

function extractList(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    const typed = payload as ApiListPayload
    if (Array.isArray(typed.items)) return typed.items
    if (typed.item !== undefined) return [typed.item]

    return []
}

function normalizeDefenseSchedule(raw: unknown): DefenseScheduleRecord | null {
    if (!isRecord(raw)) return null

    const id = pickString(raw, ["id"])
    if (!id) return null

    const groupObject = isRecord(raw.group) ? raw.group : null
    const rubricObject = isRecord(raw.rubric_template) ? raw.rubric_template : null
    const creatorObject =
        isRecord(raw.created_by_user)
            ? raw.created_by_user
            : isRecord(raw.creator)
                ? raw.creator
                : isRecord(raw.createdByUser)
                    ? raw.createdByUser
                    : null

    const groupId =
        pickString(raw, ["group_id", "groupId"]) ??
        (groupObject ? pickString(groupObject, ["id", "group_id", "groupId"]) : null) ??
        ""

    const groupTitle =
        pickNullableString(raw, ["group_title", "groupTitle"]) ??
        (groupObject ? pickNullableString(groupObject, ["title", "name"]) : null)

    const scheduledAt = pickString(raw, ["scheduled_at", "scheduledAt"])
    if (!scheduledAt) return null

    const status = (pickString(raw, ["status"]) ?? "scheduled") as DefenseScheduleStatus
    const room = pickNullableString(raw, ["room"])

    const rubricTemplateId =
        pickNullableString(raw, ["rubric_template_id", "rubricTemplateId"]) ??
        (rubricObject ? pickNullableString(rubricObject, ["id"]) : null)

    const rubricTemplateName =
        pickNullableString(raw, ["rubric_template_name", "rubricTemplateName"]) ??
        (rubricObject ? pickNullableString(rubricObject, ["name"]) : null)

    const createdById =
        pickNullableString(raw, ["created_by_id", "createdById", "created_by", "createdBy"]) ??
        (creatorObject ? pickNullableString(creatorObject, ["id", "user_id", "userId"]) : null)

    const createdByName =
        pickNullableString(raw, ["created_by_name", "createdByName", "creator_name", "creatorName"]) ??
        (creatorObject
            ? pickNullableString(creatorObject, ["name", "full_name", "display_name", "displayName"])
            : null)

    const createdByEmail =
        pickNullableString(raw, ["created_by_email", "createdByEmail", "creator_email", "creatorEmail"]) ??
        (creatorObject ? pickNullableString(creatorObject, ["email"]) : null)

    const createdByDisplay = createdByName ?? createdByEmail ?? createdById

    const createdAt = pickString(raw, ["created_at", "createdAt"]) ?? new Date().toISOString()
    const updatedAt = pickString(raw, ["updated_at", "updatedAt"]) ?? createdAt

    const primaryPanelists = normalizePanelists(raw.panelists)
    const secondaryPanelists = normalizePanelists(raw.schedule_panelists)
    const panelists = primaryPanelists.length > 0 ? primaryPanelists : secondaryPanelists

    return {
        id,
        group_id: groupId,
        group_title: groupTitle,
        scheduled_at: scheduledAt,
        room,
        status,
        rubric_template_id: rubricTemplateId,
        rubric_template_name: rubricTemplateName,
        created_by: createdByDisplay,
        created_by_id: createdById,
        created_by_name: createdByName,
        created_by_email: createdByEmail,
        created_at: createdAt,
        updated_at: updatedAt,
        panelists,
    }
}

function normalizeGroupOption(raw: unknown): ThesisGroupOption | null {
    if (!isRecord(raw)) return null
    const id = pickString(raw, ["id"])
    if (!id) return null
    const title = pickString(raw, ["title", "name"]) ?? id
    return { id, title }
}

function normalizeRubricOption(raw: unknown): RubricTemplateOption | null {
    if (!isRecord(raw)) return null
    const id = pickString(raw, ["id"])
    if (!id) return null
    const name = pickString(raw, ["name"]) ?? id
    return { id, name }
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
    const seen = new Set<string>()
    const out: T[] = []

    for (const item of items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        out.push(item)
    }

    return out
}

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { error?: string; message?: string }
        return data.error || data.message || `Request failed (${res.status})`
    } catch {
        return `Request failed (${res.status})`
    }
}

function statusBadgeClass(status: DefenseScheduleStatus): string {
    if (status === "completed") return "border-primary/40 bg-primary/10 text-foreground"
    if (status === "ongoing") return "border-chart-2/40 bg-chart-2/10 text-foreground"
    if (status === "cancelled") return "border-destructive/40 bg-destructive/10 text-destructive"
    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

async function fetchDefenseSchedules(): Promise<DefenseScheduleRecord[]> {
    const errors: string[] = []

    for (const endpoint of READ_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })

            if (res.ok) {
                const payload = (await res.json()) as unknown
                return extractList(payload)
                    .map(normalizeDefenseSchedule)
                    .filter((item): item is DefenseScheduleRecord => !!item)
            }

            if (res.status === 401 || res.status === 403 || res.status === 404) continue
            errors.push(await readErrorMessage(res))
        } catch (err) {
            errors.push(err instanceof Error ? err.message : "Network error")
        }
    }

    if (errors.length > 0) throw new Error(errors[0] ?? "Failed to fetch defense schedules.")
    return []
}

async function fetchThesisGroups(): Promise<ThesisGroupOption[]> {
    for (const endpoint of GROUP_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            if (!res.ok) {
                if (res.status === 401 || res.status === 403 || res.status === 404) continue
                continue
            }

            const payload = (await res.json()) as unknown
            const options = extractList(payload)
                .map(normalizeGroupOption)
                .filter((item): item is ThesisGroupOption => !!item)

            return uniqueById(options)
        } catch {
            // try next
        }
    }

    return []
}

async function fetchRubricTemplates(): Promise<RubricTemplateOption[]> {
    for (const endpoint of RUBRIC_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            if (!res.ok) {
                if (res.status === 401 || res.status === 403 || res.status === 404) continue
                continue
            }

            const payload = (await res.json()) as unknown
            const options = extractList(payload)
                .map(normalizeRubricOption)
                .filter((item): item is RubricTemplateOption => !!item)

            return uniqueById(options)
        } catch {
            // try next
        }
    }

    return []
}

export default function PanelistDefenseSchedulesPage() {
    const [schedules, setSchedules] = React.useState<DefenseScheduleRecord[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [groups, setGroups] = React.useState<ThesisGroupOption[]>([])
    const [rubrics, setRubrics] = React.useState<RubricTemplateOption[]>([])

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<(typeof STATUS_FILTERS)[number]>("all")

    const groupTitleById = React.useMemo(
        () => new Map(groups.map((group) => [group.id, group.title])),
        [groups],
    )

    const rubricNameById = React.useMemo(
        () => new Map(rubrics.map((rubric) => [rubric.id, rubric.name])),
        [rubrics],
    )

    const loadAll = React.useCallback(async (): Promise<boolean> => {
        setLoading(true)
        setError(null)

        try {
            const [rows, groupRows, rubricRows] = await Promise.all([
                fetchDefenseSchedules(),
                fetchThesisGroups(),
                fetchRubricTemplates(),
            ])

            setSchedules(rows)
            setGroups(groupRows)
            setRubrics(rubricRows)
            return true
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load defense schedules."
            setError(message)
            setSchedules([])
            return false
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void loadAll()
    }, [loadAll])

    const filteredSchedules = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        const base = schedules.filter((row) => {
            if (statusFilter !== "all" && row.status !== statusFilter) return false
            if (!q) return true

            const groupLabel = (row.group_title ?? groupTitleById.get(row.group_id) ?? row.group_id).toLowerCase()
            const rubricLabel =
                (row.rubric_template_name ??
                    (row.rubric_template_id ? rubricNameById.get(row.rubric_template_id) ?? "" : ""))?.toLowerCase() ??
                ""

            const panelistsText = row.panelists.map((p) => `${p.name} ${p.email ?? ""}`.toLowerCase()).join(" ")

            return (
                row.id.toLowerCase().includes(q) ||
                row.group_id.toLowerCase().includes(q) ||
                groupLabel.includes(q) ||
                (row.room ?? "").toLowerCase().includes(q) ||
                row.status.toLowerCase().includes(q) ||
                rubricLabel.includes(q) ||
                panelistsText.includes(q)
            )
        })

        return base.sort((a, b) => {
            const aTime = new Date(a.scheduled_at).getTime()
            const bTime = new Date(b.scheduled_at).getTime()
            return aTime - bTime
        })
    }, [groupTitleById, rubricNameById, schedules, search, statusFilter])

    const stats = React.useMemo(() => {
        const now = new Date()
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

        let upcoming = 0
        let today = 0
        let completed = 0

        for (const row of schedules) {
            const when = new Date(row.scheduled_at).getTime()
            if (!Number.isNaN(when)) {
                if (when >= now.getTime() && row.status !== "cancelled") upcoming += 1
                if (when >= startOfToday.getTime() && when <= endOfToday.getTime()) today += 1
            }
            if (row.status === "completed") completed += 1
        }

        return {
            total: schedules.length,
            upcoming,
            today,
            completed,
        }
    }, [schedules])

    const handleRefresh = React.useCallback(async () => {
        const ok = await loadAll()
        if (ok) toast.success("Defense schedules refreshed.")
        else toast.error("Could not refresh defense schedules.")
    }, [loadAll])

    return (
        <DashboardLayout
            title="My Defense Schedules"
            description="View your assigned defense schedules, status, and schedule details."
        >
            <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border bg-card p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Schedules</p>
                        <p className="mt-2 text-2xl font-semibold">{stats.total}</p>
                    </div>

                    <div className="rounded-lg border bg-card p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Upcoming</p>
                        <div className="mt-2 flex items-center gap-2">
                            <CalendarClock className="h-4 w-4 text-muted-foreground" />
                            <p className="text-2xl font-semibold">{stats.upcoming}</p>
                        </div>
                    </div>

                    <div className="rounded-lg border bg-card p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Today</p>
                        <div className="mt-2 flex items-center gap-2">
                            <Clock3 className="h-4 w-4 text-muted-foreground" />
                            <p className="text-2xl font-semibold">{stats.today}</p>
                        </div>
                    </div>

                    <div className="rounded-lg border bg-card p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Completed</p>
                        <div className="mt-2 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                            <p className="text-2xl font-semibold">{stats.completed}</p>
                        </div>
                    </div>
                </div>

                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <Input
                                placeholder="Search by group, room, status, rubric, schedule ID, or panelist"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full lg:max-w-xl"
                            />

                            <Button variant="outline" onClick={() => void handleRefresh()} disabled={loading}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Refresh
                            </Button>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by status</p>
                            <div className="flex flex-wrap gap-2">
                                {STATUS_FILTERS.map((status) => {
                                    const active = statusFilter === status
                                    return (
                                        <Button
                                            key={status}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setStatusFilter(status)}
                                        >
                                            {toTitleCase(status)}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Showing{" "}
                            <span className="font-semibold text-foreground">{filteredSchedules.length}</span> of{" "}
                            <span className="font-semibold text-foreground">{schedules.length}</span> schedule(s).
                        </p>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                <div className="overflow-x-auto rounded-lg border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-48">Schedule</TableHead>
                                <TableHead className="min-w-56">Group</TableHead>
                                <TableHead className="min-w-44">Date &amp; Time</TableHead>
                                <TableHead className="min-w-36">Room</TableHead>
                                <TableHead className="min-w-32">Status</TableHead>
                                <TableHead className="min-w-32">Panel Size</TableHead>
                                <TableHead className="min-w-32 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <TableRow key={`loading-${i}`}>
                                        <TableCell colSpan={7}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredSchedules.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                        No defense schedules found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredSchedules.map((row) => {
                                    const groupLabel =
                                        row.group_title || groupTitleById.get(row.group_id) || row.group_id || "Unassigned Group"

                                    const rubricLabel =
                                        row.rubric_template_name ||
                                        (row.rubric_template_id
                                            ? rubricNameById.get(row.rubric_template_id) ?? null
                                            : null)

                                    return (
                                        <TableRow key={row.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{row.id}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {rubricLabel ? `Rubric: ${rubricLabel}` : "Rubric: Not set"}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{groupLabel}</span>
                                                    {row.group_id ? (
                                                        <span className="text-xs text-muted-foreground">{row.group_id}</span>
                                                    ) : null}
                                                </div>
                                            </TableCell>

                                            <TableCell>{formatDateTime(row.scheduled_at)}</TableCell>
                                            <TableCell>{row.room || "TBA"}</TableCell>

                                            <TableCell>
                                                <Badge variant="outline" className={statusBadgeClass(row.status)}>
                                                    {toTitleCase(row.status)}
                                                </Badge>
                                            </TableCell>

                                            <TableCell>{row.panelists.length}</TableCell>

                                            <TableCell>
                                                <div className="flex justify-end">
                                                    <Button asChild variant="outline" size="sm">
                                                        <Link href={`/dashboard/panelist/defense-schedules/${row.id}`}>
                                                            View
                                                        </Link>
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </DashboardLayout>
    )
}
