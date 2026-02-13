"use client"

import * as React from "react"

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

type DefenseScheduleItem = {
    id: string
    group_id: string | null
    group_title: string | null
    scheduled_at: string | null
    room: string | null
    status: string
    rubric_template_id: string | null
    panelists: string[]
    created_at: string | null
    updated_at: string | null
}

type StatusFilter = "all" | "scheduled" | "ongoing" | "completed" | "cancelled"

const STATUS_FILTERS = ["all", "scheduled", "ongoing", "completed", "cancelled"] as const

const SCHEDULE_ENDPOINT_CANDIDATES = [
    "/api/student/defense-schedules",
    "/api/student/defense-schedule",
    "/api/defense-schedules/me",
    "/api/defense-schedules",
    "/api/defense-schedule",
]

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

function formatDateTime(value: string | null): string {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload.schedules)) return payload.schedules
    if (Array.isArray(payload.defense_schedules)) return payload.defense_schedules

    if (isRecord(payload.data)) {
        if (Array.isArray(payload.data.items)) return payload.data.items
        if (Array.isArray(payload.data.schedules)) return payload.data.schedules
        if (Array.isArray(payload.data.defense_schedules)) return payload.data.defense_schedules
    }

    if (isRecord(payload.result)) {
        if (Array.isArray(payload.result.items)) return payload.result.items
        if (Array.isArray(payload.result.schedules)) return payload.result.schedules
        if (Array.isArray(payload.result.defense_schedules)) return payload.result.defense_schedules
    }

    return []
}

function normalizePanelists(source: Record<string, unknown>): string[] {
    const candidates: unknown[] = [
        source.panelists,
        source.schedule_panelists,
        source.schedulePanelists,
    ]

    const names: string[] = []

    for (const candidate of candidates) {
        if (!Array.isArray(candidate)) continue

        for (const raw of candidate) {
            if (typeof raw === "string") {
                const parsed = toStringSafe(raw)
                if (parsed) names.push(parsed)
                continue
            }

            if (!isRecord(raw)) continue
            const user = isRecord(raw.user) ? raw.user : null

            const name =
                toStringSafe(raw.name ?? raw.staff_name ?? raw.staffName ?? user?.name) ??
                toStringSafe(raw.staff_id ?? raw.staffId)

            if (name) names.push(name)
        }
    }

    return Array.from(new Set(names))
}

function normalizeSchedule(raw: unknown): DefenseScheduleItem | null {
    if (!isRecord(raw)) return null

    const source =
        (isRecord(raw.schedule) && raw.schedule) ||
        (isRecord(raw.defense_schedule) && raw.defense_schedule) ||
        raw

    const group = isRecord(source.group) ? source.group : null

    const id = toStringSafe(source.id ?? raw.id)
    if (!id) return null

    return {
        id,
        group_id: toNullableString(source.group_id ?? source.groupId ?? group?.id),
        group_title: toNullableString(source.group_title ?? source.groupTitle ?? group?.title),
        scheduled_at: toNullableString(source.scheduled_at ?? source.scheduledAt),
        room: toNullableString(source.room),
        status: toStringSafe(source.status) ?? "scheduled",
        rubric_template_id: toNullableString(source.rubric_template_id ?? source.rubricTemplateId),
        panelists: normalizePanelists(source),
        created_at: toNullableString(source.created_at ?? source.createdAt),
        updated_at: toNullableString(source.updated_at ?? source.updatedAt),
    }
}

function statusTone(status: string): string {
    const normalized = status.trim().toLowerCase()

    if (normalized === "scheduled") {
        return "border-blue-600/40 bg-blue-600/10 text-foreground"
    }

    if (normalized === "ongoing") {
        return "border-violet-600/40 bg-violet-600/10 text-foreground"
    }

    if (normalized === "completed") {
        return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
    }

    if (normalized === "cancelled") {
        return "border-destructive/40 bg-destructive/10 text-destructive"
    }

    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

async function readErrorMessage(res: Response, payload: unknown): Promise<string> {
    if (isRecord(payload)) {
        const message = toStringSafe(payload.error) ?? toStringSafe(payload.message)
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

export default function StudentDefenseSchedulePage() {
    const [items, setItems] = React.useState<DefenseScheduleItem[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [source, setSource] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")

    const loadSchedules = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        let latestError = "Unable to load defense schedule."
        let loaded = false

        for (const endpoint of SCHEDULE_ENDPOINT_CANDIDATES) {
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
                    .sort((a, b) => {
                        const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0
                        const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0
                        return ta - tb
                    })

                setItems(parsed)
                setSource(endpoint)
                loaded = true
                break
            } catch (err) {
                latestError =
                    err instanceof Error ? err.message : "Unable to load defense schedule."
            }
        }

        if (!loaded) {
            setItems([])
            setSource(null)
            setError(`${latestError} No defense-schedule endpoint responded successfully.`)
        }

        setLoading(false)
    }, [])

    React.useEffect(() => {
        void loadSchedules()
    }, [loadSchedules])

    const filtered = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return items.filter((item) => {
            const status = item.status.toLowerCase()
            if (statusFilter !== "all" && status !== statusFilter) {
                return false
            }

            if (!q) return true

            return (
                item.id.toLowerCase().includes(q) ||
                (item.group_id ?? "").toLowerCase().includes(q) ||
                (item.group_title ?? "").toLowerCase().includes(q) ||
                (item.room ?? "").toLowerCase().includes(q) ||
                item.panelists.join(", ").toLowerCase().includes(q) ||
                status.includes(q)
            )
        })
    }, [items, search, statusFilter])

    const summary = React.useMemo(() => {
        const now = Date.now()

        let scheduled = 0
        let ongoing = 0
        let completed = 0
        let cancelled = 0

        for (const item of items) {
            const s = item.status.toLowerCase()
            if (s === "scheduled") scheduled += 1
            else if (s === "ongoing") ongoing += 1
            else if (s === "completed") completed += 1
            else if (s === "cancelled") cancelled += 1
        }

        const upcoming = items.find((item) => {
            if (!item.scheduled_at) return false
            const t = new Date(item.scheduled_at).getTime()
            if (Number.isNaN(t)) return false
            const status = item.status.toLowerCase()
            return t >= now && status !== "completed" && status !== "cancelled"
        })

        return {
            total: items.length,
            scheduled,
            ongoing,
            completed,
            cancelled,
            upcoming,
        }
    }, [items])

    return (
        <DashboardLayout
            title="Defense Schedule"
            description="See your upcoming and historical thesis defense schedules."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by schedule ID, group, room, panelist, or status"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />

                            <Button variant="outline" onClick={() => void loadSchedules()} disabled={loading}>
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
                                            {status === "all" ? "All" : toTitleCase(status)}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Total</p>
                                <p className="text-lg font-semibold">{summary.total}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Scheduled</p>
                                <p className="text-lg font-semibold">{summary.scheduled}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Ongoing</p>
                                <p className="text-lg font-semibold">{summary.ongoing}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Completed</p>
                                <p className="text-lg font-semibold">{summary.completed}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Cancelled</p>
                                <p className="text-lg font-semibold">{summary.cancelled}</p>
                            </div>
                        </div>

                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Next Defense</p>
                            {summary.upcoming ? (
                                <div className="mt-1 space-y-1">
                                    <p className="text-sm font-semibold">
                                        {summary.upcoming.group_title ?? summary.upcoming.group_id ?? "Untitled Group"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatDateTime(summary.upcoming.scheduled_at)} • Room {summary.upcoming.room ?? "TBA"}
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm">No upcoming schedule found.</p>
                            )}
                        </div>

                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <p>
                                Showing <span className="font-semibold text-foreground">{filtered.length}</span> of{" "}
                                <span className="font-semibold text-foreground">{items.length}</span> schedule(s)
                            </p>
                            {source ? <p>Data source: {source}</p> : null}
                        </div>
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
                                <TableHead className="min-w-44">Schedule ID</TableHead>
                                <TableHead className="min-w-64">Group</TableHead>
                                <TableHead className="min-w-52">Date & Time</TableHead>
                                <TableHead className="min-w-32">Room</TableHead>
                                <TableHead className="min-w-48">Panelists</TableHead>
                                <TableHead className="min-w-32">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 7 }).map((_, i) => (
                                    <TableRow key={`defense-skeleton-${i}`}>
                                        <TableCell colSpan={6}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                        No defense schedules found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filtered.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">{item.id}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <span className="font-medium">
                                                    {item.group_title ?? "Untitled Group"}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    ID: {item.group_id ?? "—"}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{formatDateTime(item.scheduled_at)}</TableCell>
                                        <TableCell>{item.room ?? "—"}</TableCell>
                                        <TableCell>
                                            {item.panelists.length > 0 ? item.panelists.join(", ") : "—"}
                                        </TableCell>
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
