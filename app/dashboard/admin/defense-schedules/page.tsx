"use client"

import * as React from "react"
import Link from "next/link"

import DashboardLayout from "@/components/dashboard-layout"
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

const STATUS_FILTERS: Array<"all" | "scheduled" | "ongoing" | "completed" | "cancelled"> = [
    "all",
    "scheduled",
    "ongoing",
    "completed",
    "cancelled",
]

const LIST_ENDPOINTS = ["/api/defense-schedules", "/api/admin/defense-schedules"] as const

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function asString(value: unknown): string | null {
    return typeof value === "string" ? value : null
}

function pickString(source: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = source[key]
        if (typeof value === "string" && value.trim().length > 0) {
            return value
        }
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

    const out: PanelistLite[] = []

    for (const item of raw) {
        if (!isRecord(item)) continue

        const id =
            pickString(item, ["id", "staff_id", "staffId", "user_id", "userId"]) ?? ""

        const name =
            pickString(item, ["name", "full_name", "staff_name", "staffName", "email"]) ??
            "Unknown Panelist"

        const email = pickNullableString(item, ["email", "staff_email", "staffEmail"])

        out.push({ id, name, email })
    }

    return out
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

    const createdBy = pickNullableString(raw, ["created_by", "createdBy"])

    const createdAt =
        pickString(raw, ["created_at", "createdAt"]) ??
        new Date().toISOString()

    const updatedAt =
        pickString(raw, ["updated_at", "updatedAt"]) ??
        createdAt

    const panelists =
        normalizePanelists(raw.panelists) ||
        normalizePanelists(raw.schedule_panelists)

    return {
        id,
        group_id: groupId,
        group_title: groupTitle,
        scheduled_at: scheduledAt,
        room,
        status,
        rubric_template_id: rubricTemplateId,
        rubric_template_name: rubricTemplateName,
        created_by: createdBy,
        created_at: createdAt,
        updated_at: updatedAt,
        panelists,
    }
}

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { error?: string; message?: string }
        return data.error || data.message || `Request failed (${res.status})`
    } catch {
        return `Request failed (${res.status})`
    }
}

function statusPillClass(status: DefenseScheduleStatus): string {
    if (status === "completed") {
        return "border-primary/40 bg-primary/10 text-foreground"
    }

    if (status === "ongoing") {
        return "border-chart-2/40 bg-chart-2/10 text-foreground"
    }

    if (status === "cancelled") {
        return "border-destructive/40 bg-destructive/10 text-destructive"
    }

    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

async function fetchDefenseSchedules(): Promise<DefenseScheduleRecord[]> {
    const errors: string[] = []

    for (const endpoint of LIST_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })

            if (res.ok) {
                const payload = (await res.json()) as unknown
                const normalized = extractList(payload)
                    .map(normalizeDefenseSchedule)
                    .filter((item): item is DefenseScheduleRecord => !!item)

                return normalized
            }

            if (res.status !== 404) {
                errors.push(await readErrorMessage(res))
            }
        } catch (err) {
            errors.push(err instanceof Error ? err.message : "Network error")
        }
    }

    if (errors.length > 0) {
        throw new Error(errors[0] ?? "Failed to fetch defense schedules.")
    }

    return []
}

export default function AdminDefenseSchedulesPage() {
    const [schedules, setSchedules] = React.useState<DefenseScheduleRecord[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<(typeof STATUS_FILTERS)[number]>("all")

    const loadSchedules = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const rows = await fetchDefenseSchedules()
            setSchedules(rows)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch defense schedules.")
            setSchedules([])
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void loadSchedules()
    }, [loadSchedules])

    const filteredSchedules = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        const base = schedules.filter((row) => {
            if (statusFilter !== "all" && row.status !== statusFilter) return false

            if (!q) return true

            const panelistNames = row.panelists.map((p) => p.name.toLowerCase()).join(" ")

            return (
                row.id.toLowerCase().includes(q) ||
                row.group_id.toLowerCase().includes(q) ||
                (row.group_title ?? "").toLowerCase().includes(q) ||
                (row.room ?? "").toLowerCase().includes(q) ||
                row.status.toLowerCase().includes(q) ||
                panelistNames.includes(q)
            )
        })

        return base.sort((a, b) => {
            const aTime = new Date(a.scheduled_at).getTime()
            const bTime = new Date(b.scheduled_at).getTime()
            return bTime - aTime
        })
    }, [schedules, search, statusFilter])

    return (
        <DashboardLayout
            title="Defense Schedules"
            description="View and manage all thesis defense schedules."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by schedule ID, group, room, status, or panelist"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />

                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={() => void loadSchedules()} disabled={loading}>
                                    Refresh
                                </Button>
                            </div>
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
                                <TableHead className="min-w-48">Schedule ID</TableHead>
                                <TableHead className="min-w-56">Group</TableHead>
                                <TableHead className="min-w-44">Date &amp; Time</TableHead>
                                <TableHead className="min-w-28">Room</TableHead>
                                <TableHead className="min-w-28">Status</TableHead>
                                <TableHead className="min-w-40">Updated</TableHead>
                                <TableHead className="min-w-32 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <TableRow key={`skeleton-${i}`}>
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
                                filteredSchedules.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{row.id}</span>
                                                {row.rubric_template_name ? (
                                                    <span className="text-xs text-muted-foreground">
                                                        Rubric: {row.rubric_template_name}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">
                                                    {row.group_title || row.group_id || "Unassigned Group"}
                                                </span>
                                                {row.group_id ? (
                                                    <span className="text-xs text-muted-foreground">{row.group_id}</span>
                                                ) : null}
                                            </div>
                                        </TableCell>

                                        <TableCell>{formatDateTime(row.scheduled_at)}</TableCell>

                                        <TableCell>{row.room || "TBA"}</TableCell>

                                        <TableCell>
                                            <span
                                                className={[
                                                    "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                    statusPillClass(row.status),
                                                ].join(" ")}
                                            >
                                                {toTitleCase(row.status)}
                                            </span>
                                        </TableCell>

                                        <TableCell className="text-muted-foreground">
                                            {formatDateTime(row.updated_at)}
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex items-center justify-end gap-2">
                                                <Button asChild variant="outline" size="sm">
                                                    <Link href={`/dashboard/admin/defense-schedules/${row.id}`}>
                                                        View
                                                    </Link>
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </DashboardLayout>
    )
}
