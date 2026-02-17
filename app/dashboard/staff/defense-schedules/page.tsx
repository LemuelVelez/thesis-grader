"use client"

import * as React from "react"
import Link from "next/link"
import DashboardLayout from "@/components/dashboard-layout"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
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

type StatusFilter = "all" | "scheduled" | "ongoing" | "completed" | "cancelled"

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
    created_by_name: string | null
    created_by_email: string | null
    created_at: string
    updated_at: string
    panelists: PanelistLite[]
}

type ApiPayload = {
    items?: unknown
    item?: unknown
    error?: string
    message?: string
}

const STATUS_FILTERS: StatusFilter[] = ["all", "scheduled", "ongoing", "completed", "cancelled"]

const LIST_ENDPOINTS = [
    "/api/staff/defense-schedules",
    "/api/staff/schedules/defense",
    "/api/defense-schedules?scope=staff",
    "/api/defense-schedules",
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
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

function extractList(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    const typed = payload as ApiPayload
    if (Array.isArray(typed.items)) return typed.items
    if (typed.item !== undefined) return [typed.item]

    if (isRecord(payload.data)) {
        const data = payload.data
        if (Array.isArray(data.items)) return data.items
        if (data.item !== undefined) return [data.item]
    }

    return []
}

function normalizePanelists(raw: unknown): PanelistLite[] {
    if (!Array.isArray(raw)) return []

    return raw
        .map((item) => {
            if (!isRecord(item)) return null
            const id = pickString(item, ["id", "staff_id", "user_id", "userId"]) ?? ""
            const name =
                pickString(item, ["name", "full_name", "staff_name", "display_name", "email"]) ??
                "Unknown Panelist"
            const email = pickNullableString(item, ["email", "staff_email"])
            return { id, name, email }
        })
        .filter((item): item is PanelistLite => !!item)
}

function normalizeDefenseSchedule(raw: unknown): DefenseScheduleRecord | null {
    if (!isRecord(raw)) return null

    const id = pickString(raw, ["id"])
    const scheduledAt = pickString(raw, ["scheduled_at", "scheduledAt"])
    if (!id || !scheduledAt) return null

    const groupObject = isRecord(raw.group) ? raw.group : null
    const rubricObject = isRecord(raw.rubric_template) ? raw.rubric_template : null
    const creatorObject = isRecord(raw.created_by_user)
        ? raw.created_by_user
        : isRecord(raw.creator)
            ? raw.creator
            : null

    const primaryPanelists = normalizePanelists(raw.panelists)
    const secondaryPanelists = normalizePanelists(raw.schedule_panelists)
    const panelists = primaryPanelists.length > 0 ? primaryPanelists : secondaryPanelists

    return {
        id,
        group_id:
            pickString(raw, ["group_id", "groupId"]) ??
            (groupObject ? pickString(groupObject, ["id"]) : null) ??
            "",
        group_title:
            pickNullableString(raw, ["group_title", "groupTitle"]) ??
            (groupObject ? pickNullableString(groupObject, ["title", "name"]) : null),
        scheduled_at: scheduledAt,
        room: pickNullableString(raw, ["room"]),
        status: (pickString(raw, ["status"]) ?? "scheduled") as DefenseScheduleStatus,
        rubric_template_id:
            pickNullableString(raw, ["rubric_template_id", "rubricTemplateId"]) ??
            (rubricObject ? pickNullableString(rubricObject, ["id"]) : null),
        rubric_template_name:
            pickNullableString(raw, ["rubric_template_name", "rubricTemplateName"]) ??
            (rubricObject ? pickNullableString(rubricObject, ["name"]) : null),
        created_by_name:
            pickNullableString(raw, ["created_by_name", "createdByName"]) ??
            (creatorObject
                ? pickNullableString(creatorObject, ["name", "full_name", "display_name"])
                : null),
        created_by_email:
            pickNullableString(raw, ["created_by_email", "createdByEmail"]) ??
            (creatorObject ? pickNullableString(creatorObject, ["email"]) : null),
        created_at: pickString(raw, ["created_at", "createdAt"]) ?? new Date().toISOString(),
        updated_at:
            pickString(raw, ["updated_at", "updatedAt"]) ??
            pickString(raw, ["created_at", "createdAt"]) ??
            new Date().toISOString(),
        panelists,
    }
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

async function fetchDefenseSchedules(): Promise<DefenseScheduleRecord[]> {
    const errors: string[] = []
    let hadSuccess = false

    for (const endpoint of LIST_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })

            if (res.ok) {
                hadSuccess = true
                const payload = (await res.json()) as unknown
                const rows = extractList(payload)
                    .map(normalizeDefenseSchedule)
                    .filter((item): item is DefenseScheduleRecord => !!item)

                if (rows.length > 0) return uniqueById(rows)
                continue
            }

            if (res.status === 401 || res.status === 403 || res.status === 404) {
                continue
            }

            errors.push(await readErrorMessage(res))
        } catch (err) {
            errors.push(err instanceof Error ? err.message : "Network error")
        }
    }

    if (hadSuccess) return []
    if (errors.length > 0) throw new Error(errors[0] ?? "Failed to load defense schedules.")

    return []
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

function isToday(value: string): boolean {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return false

    const now = new Date()
    return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
    )
}

function statusBadgeClass(status: DefenseScheduleStatus): string {
    if (status === "completed") return "border-primary/40 bg-primary/10 text-foreground"
    if (status === "ongoing") return "border-chart-2/40 bg-chart-2/10 text-foreground"
    if (status === "cancelled") return "border-destructive/40 bg-destructive/10 text-destructive"
    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

function panelistPreview(panelists: PanelistLite[]): string {
    if (panelists.length === 0) return "No panelists yet"
    if (panelists.length <= 2) return panelists.map((p) => p.name).join(", ")
    return `${panelists[0]?.name}, ${panelists[1]?.name} +${panelists.length - 2} more`
}

export default function StaffDefenseSchedulesPage() {
    const [schedules, setSchedules] = React.useState<DefenseScheduleRecord[]>([])
    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")

    const loadSchedules = React.useCallback(async (withToast = false) => {
        if (withToast) setRefreshing(true)
        else setLoading(true)

        setError(null)

        try {
            const rows = await fetchDefenseSchedules()
            setSchedules(rows)
            if (withToast) toast.success("Defense schedules refreshed.")
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to load defense schedules."
            setError(message)
            setSchedules([])
            toast.error(message)
        } finally {
            if (withToast) setRefreshing(false)
            else setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void loadSchedules(false)
    }, [loadSchedules])

    const filteredSchedules = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        const rows = schedules.filter((row) => {
            if (statusFilter !== "all" && row.status !== statusFilter) return false
            if (!q) return true

            return (
                row.id.toLowerCase().includes(q) ||
                row.group_id.toLowerCase().includes(q) ||
                (row.group_title ?? "").toLowerCase().includes(q) ||
                (row.room ?? "").toLowerCase().includes(q) ||
                row.status.toLowerCase().includes(q) ||
                (row.rubric_template_name ?? "").toLowerCase().includes(q) ||
                (row.created_by_name ?? "").toLowerCase().includes(q) ||
                (row.created_by_email ?? "").toLowerCase().includes(q) ||
                row.panelists.some(
                    (panelist) =>
                        panelist.name.toLowerCase().includes(q) ||
                        (panelist.email ?? "").toLowerCase().includes(q),
                )
            )
        })

        return rows.sort((a, b) => {
            const aTime = new Date(a.scheduled_at).getTime()
            const bTime = new Date(b.scheduled_at).getTime()
            return bTime - aTime
        })
    }, [schedules, search, statusFilter])

    const metrics = React.useMemo(() => {
        const now = Date.now()
        const total = schedules.length
        const upcoming = schedules.filter((row) => {
            const time = new Date(row.scheduled_at).getTime()
            if (Number.isNaN(time)) return false
            return time >= now && row.status !== "completed" && row.status !== "cancelled"
        }).length
        const today = schedules.filter((row) => isToday(row.scheduled_at)).length
        const noPanelists = schedules.filter((row) => row.panelists.length === 0).length
        return { total, upcoming, today, noPanelists }
    }, [schedules])

    return (
        <DashboardLayout
            title="Defense Schedules"
            description="Monitor thesis defense schedules from the staff perspective."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex w-full flex-col gap-3 md:flex-row">
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by group, room, status, creator, rubric, or panelist"
                                className="md:max-w-xl"
                            />

                            <Select
                                value={statusFilter}
                                onValueChange={(value) => setStatusFilter(value as StatusFilter)}
                            >
                                <SelectTrigger className="w-full md:w-56">
                                    <SelectValue placeholder="Filter by status" />
                                </SelectTrigger>
                                <SelectContent>
                                    {STATUS_FILTERS.map((status) => (
                                        <SelectItem key={status} value={status}>
                                            {toTitleCase(status)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            variant="outline"
                            onClick={() => void loadSchedules(true)}
                            disabled={refreshing}
                        >
                            {refreshing ? "Refreshing..." : "Refresh"}
                        </Button>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">Total</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold">{metrics.total}</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">Upcoming</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold">{metrics.upcoming}</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">Today</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold">{metrics.today}</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">
                                Without Panel
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold">{metrics.noPanelists}</p>
                        </CardContent>
                    </Card>
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
                                <TableHead className="min-w-44">Schedule</TableHead>
                                <TableHead className="min-w-56">Group</TableHead>
                                <TableHead className="min-w-52">Date &amp; Time</TableHead>
                                <TableHead className="min-w-36">Room</TableHead>
                                <TableHead className="min-w-36">Status</TableHead>
                                <TableHead className="min-w-56">Created By</TableHead>
                                <TableHead className="min-w-64">Panel</TableHead>
                                <TableHead className="min-w-32 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 6 }).map((_, index) => (
                                    <TableRow key={`staff-skeleton-${index}`}>
                                        <TableCell colSpan={8}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredSchedules.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={8}
                                        className="h-24 text-center text-muted-foreground"
                                    >
                                        No defense schedules found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredSchedules.map((row) => {
                                    const groupTitle = row.group_title || row.group_id || "Unassigned Group"
                                    const creator = row.created_by_name || row.created_by_email || "System"

                                    return (
                                        <TableRow key={row.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{row.id}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        Rubric: {row.rubric_template_name || "Not set"}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{groupTitle}</span>
                                                    {row.group_id ? (
                                                        <span className="text-xs text-muted-foreground">
                                                            {row.group_id}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </TableCell>

                                            <TableCell>{formatDateTime(row.scheduled_at)}</TableCell>
                                            <TableCell>{row.room || "TBA"}</TableCell>

                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={statusBadgeClass(row.status)}
                                                >
                                                    {toTitleCase(row.status)}
                                                </Badge>
                                            </TableCell>

                                            <TableCell className="text-sm text-muted-foreground">
                                                {creator}
                                            </TableCell>

                                            <TableCell className="text-sm text-muted-foreground">
                                                {panelistPreview(row.panelists)}
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex justify-end">
                                                    <Button asChild size="sm" variant="outline">
                                                        <Link href={`/dashboard/staff/defense-schedules/${row.id}`}>
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

                <p className="text-sm text-muted-foreground">
                    Showing{" "}
                    <span className="font-semibold text-foreground">
                        {filteredSchedules.length}
                    </span>{" "}
                    of <span className="font-semibold text-foreground">{schedules.length}</span>{" "}
                    schedule(s).
                </p>
            </div>
        </DashboardLayout>
    )
}
