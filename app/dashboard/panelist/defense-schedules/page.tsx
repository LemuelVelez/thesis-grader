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

type DefenseScheduleItem = {
    id: string
    group_id: string
    group_title: string | null
    thesis_title: string | null
    scheduled_at: string
    room: string | null
    status: DefenseScheduleStatus
    rubric_template_id: string | null
    created_at: string | null
    updated_at: string | null
}

const STATUS_FILTERS = ["all", "scheduled", "ongoing", "completed", "cancelled"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function toStringSafe(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function toNullableString(value: unknown): string | null {
    if (value === null) return null
    return toStringSafe(value)
}

function toTitleCase(value: string): string {
    if (!value) return value
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDateTime(value: string): string {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function toEpoch(value: string): number {
    const d = new Date(value)
    const ms = d.getTime()
    return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms
}

function statusTone(status: string): string {
    const normalized = status.toLowerCase()

    if (normalized === "scheduled") {
        return "border-primary/40 bg-primary/10 text-foreground"
    }

    if (normalized === "ongoing") {
        return "border-amber-500/40 bg-amber-500/10 text-foreground"
    }

    if (normalized === "completed") {
        return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
    }

    if (normalized === "cancelled") {
        return "border-destructive/40 bg-destructive/10 text-destructive"
    }

    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

function normalizeSchedule(raw: unknown): DefenseScheduleItem | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    if (!id) return null

    const groupId = toStringSafe(raw.group_id ?? raw.groupId) ?? "—"
    const scheduledAt = toStringSafe(raw.scheduled_at ?? raw.scheduledAt) ?? ""
    const status = (toStringSafe(raw.status) ?? "scheduled") as DefenseScheduleStatus

    return {
        id,
        group_id: groupId,
        group_title: toNullableString(raw.group_title ?? raw.groupTitle),
        thesis_title: toNullableString(raw.thesis_title ?? raw.thesisTitle ?? raw.title),
        scheduled_at: scheduledAt,
        room: toNullableString(raw.room),
        status,
        rubric_template_id: toNullableString(raw.rubric_template_id ?? raw.rubricTemplateId),
        created_at: toNullableString(raw.created_at ?? raw.createdAt),
        updated_at: toNullableString(raw.updated_at ?? raw.updatedAt),
    }
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload

    if (!isRecord(payload)) return []

    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data

    if (isRecord(payload.data) && Array.isArray(payload.data.items)) {
        return payload.data.items
    }

    if (isRecord(payload.result) && Array.isArray(payload.result.items)) {
        return payload.result.items
    }

    return []
}

async function readErrorMessage(res: Response, payload: unknown): Promise<string> {
    if (isRecord(payload)) {
        const error = toStringSafe(payload.error)
        if (error) return error

        const message = toStringSafe(payload.message)
        if (message) return message
    }

    try {
        const text = await res.text()
        if (text.trim().length > 0) return text
    } catch {
        // ignore
    }

    return `Request failed (${res.status})`
}

const ENDPOINT_CANDIDATES = [
    "/api/panelist/defense-schedules",
    "/api/panelist/defense-schedules/mine",
    "/api/defense-schedules?mine=1",
    "/api/defense-schedules",
]

export default function PanelistDefenseSchedulesPage() {
    const [schedules, setSchedules] = React.useState<DefenseScheduleItem[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [sourceEndpoint, setSourceEndpoint] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")

    const loadSchedules = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        let loaded = false
        let latestError = "Unable to load defense schedules."

        for (const endpoint of ENDPOINT_CANDIDATES) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const parsed = extractArrayPayload(payload)
                    .map(normalizeSchedule)
                    .filter((item): item is DefenseScheduleItem => item !== null)

                setSchedules(parsed)
                setSourceEndpoint(endpoint)
                loaded = true
                break
            } catch (err) {
                latestError = err instanceof Error ? err.message : "Unable to load defense schedules."
            }
        }

        if (!loaded) {
            setSchedules([])
            setSourceEndpoint(null)
            setError(
                `${latestError} No schedule endpoint responded successfully. ` +
                `Please ensure a panelist schedules API is available.`,
            )
        }

        setLoading(false)
    }, [])

    React.useEffect(() => {
        void loadSchedules()
    }, [loadSchedules])

    const filteredSchedules = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return [...schedules]
            .filter((item) => {
                if (statusFilter !== "all" && item.status.toLowerCase() !== statusFilter) {
                    return false
                }

                if (!q) return true

                return (
                    item.id.toLowerCase().includes(q) ||
                    item.group_id.toLowerCase().includes(q) ||
                    (item.group_title ?? "").toLowerCase().includes(q) ||
                    (item.thesis_title ?? "").toLowerCase().includes(q) ||
                    (item.room ?? "").toLowerCase().includes(q)
                )
            })
            .sort((a, b) => toEpoch(a.scheduled_at) - toEpoch(b.scheduled_at))
    }, [schedules, search, statusFilter])

    const totals = React.useMemo(() => {
        let scheduled = 0
        let ongoing = 0
        let completed = 0
        let cancelled = 0

        for (const item of schedules) {
            const s = item.status.toLowerCase()
            if (s === "scheduled") scheduled += 1
            else if (s === "ongoing") ongoing += 1
            else if (s === "completed") completed += 1
            else if (s === "cancelled") cancelled += 1
        }

        return {
            all: schedules.length,
            scheduled,
            ongoing,
            completed,
            cancelled,
        }
    }, [schedules])

    return (
        <DashboardLayout
            title="Defense Schedules"
            description="View your assigned defense schedules and open each schedule for full details."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by group, thesis title, room, or schedule ID"
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
                                    const label = status === "all" ? "All" : toTitleCase(status)

                                    return (
                                        <Button
                                            key={status}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setStatusFilter(status)}
                                        >
                                            {label}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">All</p>
                                <p className="text-lg font-semibold">{totals.all}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Scheduled</p>
                                <p className="text-lg font-semibold">{totals.scheduled}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Ongoing</p>
                                <p className="text-lg font-semibold">{totals.ongoing}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Completed</p>
                                <p className="text-lg font-semibold">{totals.completed}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Cancelled</p>
                                <p className="text-lg font-semibold">{totals.cancelled}</p>
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Showing{" "}
                            <span className="font-semibold text-foreground">{filteredSchedules.length}</span> of{" "}
                            <span className="font-semibold text-foreground">{schedules.length}</span> schedule(s).
                        </p>

                        {sourceEndpoint ? (
                            <p className="text-xs text-muted-foreground">Data source: {sourceEndpoint}</p>
                        ) : null}
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
                                <TableHead className="min-w-40">Schedule</TableHead>
                                <TableHead className="min-w-72">Group / Thesis</TableHead>
                                <TableHead className="min-w-40">Room</TableHead>
                                <TableHead className="min-w-32">Status</TableHead>
                                <TableHead className="min-w-48">Date & Time</TableHead>
                                <TableHead className="min-w-36 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <TableRow key={`skeleton-${i}`}>
                                        <TableCell colSpan={6}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredSchedules.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                        No defense schedules found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredSchedules.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{item.id}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    Group ID: {item.group_id}
                                                </span>
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">
                                                    {item.group_title ?? item.thesis_title ?? "Untitled Group"}
                                                </span>
                                                {item.group_title && item.thesis_title ? (
                                                    <span className="text-xs text-muted-foreground">
                                                        {item.thesis_title}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </TableCell>

                                        <TableCell>{item.room ?? "TBA"}</TableCell>

                                        <TableCell>
                                            <span
                                                className={[
                                                    "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                    statusTone(item.status),
                                                ].join(" ")}
                                            >
                                                {toTitleCase(item.status)}
                                            </span>
                                        </TableCell>

                                        <TableCell className="text-muted-foreground">
                                            {item.scheduled_at ? formatDateTime(item.scheduled_at) : "TBA"}
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex items-center justify-end">
                                                <Button asChild variant="outline" size="sm">
                                                    <Link href={`/dashboard/panelist/defense-schedules/${item.id}`}>
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
