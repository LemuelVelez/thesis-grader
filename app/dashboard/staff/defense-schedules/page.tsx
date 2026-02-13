"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

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
    group_id: string | null
    group_title: string | null
    scheduled_at: string | null
    room: string | null
    status: DefenseScheduleStatus
    panelists_count: number
    created_at: string | null
    updated_at: string | null
}

const STATUS_FILTERS = [
    "all",
    "scheduled",
    "ongoing",
    "completed",
    "cancelled",
] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const ENDPOINT_CANDIDATES = [
    "/api/staff/defense-schedules",
    "/api/defense-schedules",
    "/api/defense_schedule",
    "/api/schedules",
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

function toNonNegativeInt(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        return Math.floor(value)
    }

    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed)
    }

    return 0
}

function formatDateTime(value: string | null): string {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function statusTone(status: string): string {
    const normalized = status.toLowerCase()

    if (normalized === "scheduled") {
        return "border-sky-600/40 bg-sky-600/10 text-foreground"
    }

    if (normalized === "ongoing") {
        return "border-amber-600/40 bg-amber-600/10 text-foreground"
    }

    if (normalized === "completed") {
        return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
    }

    if (normalized === "cancelled") {
        return "border-destructive/40 bg-destructive/10 text-destructive"
    }

    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

function normalizeDefenseSchedule(raw: unknown): DefenseScheduleItem | null {
    if (!isRecord(raw)) return null

    const group = isRecord(raw.group) ? raw.group : null
    const id = toStringSafe(raw.id ?? raw.schedule_id ?? raw.scheduleId)
    if (!id) return null

    const group_id =
        toNullableString(raw.group_id ?? raw.groupId ?? group?.id) ??
        null

    const group_title =
        toNullableString(raw.group_title ?? raw.groupTitle ?? group?.title) ??
        null

    const scheduled_at =
        toNullableString(raw.scheduled_at ?? raw.scheduledAt ?? raw.datetime ?? raw.date) ??
        null

    const room = toNullableString(raw.room)
    const status = (toStringSafe(raw.status) ?? "scheduled") as DefenseScheduleStatus

    const panelists_count =
        toNonNegativeInt(raw.panelists_count ?? raw.panelist_count) ||
        (Array.isArray(raw.panelists) ? raw.panelists.length : 0)

    const created_at =
        toNullableString(raw.created_at ?? raw.createdAt) ??
        null

    const updated_at =
        toNullableString(raw.updated_at ?? raw.updatedAt) ??
        null

    return {
        id,
        group_id,
        group_title,
        scheduled_at,
        room,
        status,
        panelists_count,
        created_at,
        updated_at,
    }
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

export default function StaffDefenseSchedulesPage() {
    const router = useRouter()

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
                    .map(normalizeDefenseSchedule)
                    .filter((item): item is DefenseScheduleItem => item !== null)

                setSchedules(parsed)
                setSourceEndpoint(endpoint)
                loaded = true
                break
            } catch (err) {
                latestError =
                    err instanceof Error ? err.message : "Unable to load defense schedules."
            }
        }

        if (!loaded) {
            setSchedules([])
            setSourceEndpoint(null)
            setError(
                `${latestError} No defense schedules endpoint responded successfully. ` +
                `Please ensure a defense schedules API is available.`,
            )
        }

        setLoading(false)
    }, [])

    React.useEffect(() => {
        void loadSchedules()
    }, [loadSchedules])

    const filteredSchedules = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return schedules.filter((item) => {
            if (statusFilter !== "all" && item.status.toLowerCase() !== statusFilter) {
                return false
            }

            if (!q) return true

            return (
                item.id.toLowerCase().includes(q) ||
                (item.group_title ?? "").toLowerCase().includes(q) ||
                (item.group_id ?? "").toLowerCase().includes(q) ||
                (item.room ?? "").toLowerCase().includes(q) ||
                item.status.toLowerCase().includes(q) ||
                (item.scheduled_at ?? "").toLowerCase().includes(q)
            )
        })
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
            description="Manage and monitor scheduled thesis defenses."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by group, room, schedule ID, date, or status"
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
                                <TableHead className="min-w-56">Schedule</TableHead>
                                <TableHead className="min-w-56">Group</TableHead>
                                <TableHead className="min-w-52">Date & Time</TableHead>
                                <TableHead className="min-w-36">Room</TableHead>
                                <TableHead className="min-w-28">Panelists</TableHead>
                                <TableHead className="min-w-28">Status</TableHead>
                                <TableHead className="min-w-28">Action</TableHead>
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
                                filteredSchedules.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">Schedule #{item.id.slice(0, 8)}</span>
                                                <span className="text-xs text-muted-foreground">ID: {item.id}</span>
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">
                                                    {item.group_title ?? "Untitled Group"}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    Group ID: {item.group_id ?? "—"}
                                                </span>
                                            </div>
                                        </TableCell>

                                        <TableCell>{formatDateTime(item.scheduled_at)}</TableCell>
                                        <TableCell>{item.room ?? "—"}</TableCell>
                                        <TableCell>{item.panelists_count}</TableCell>

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

                                        <TableCell>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() =>
                                                    router.push(`/dashboard/staff/defense-schedules/${encodeURIComponent(item.id)}`)
                                                }
                                            >
                                                View
                                            </Button>
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
