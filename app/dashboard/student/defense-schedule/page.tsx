"use client"

import * as React from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
    created_at: string
    updated_at: string
    panelists: PanelistLite[]
}

type ApiPayload = {
    item?: unknown
    items?: unknown
    error?: string
    message?: string
}

const STUDENT_ENDPOINTS = [
    "/api/student/defense-schedule",
    "/api/student/defense-schedules/current",
    "/api/student/defense-schedules",
    "/api/defense-schedules?scope=student",
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

    const id = pickString(payload, ["id"])
    const scheduledAt = pickString(payload, ["scheduled_at", "scheduledAt"])
    if (id && scheduledAt) return [payload]

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

async function fetchStudentDefenseSchedules(): Promise<DefenseScheduleRecord[]> {
    const errors: string[] = []
    let hadSuccess = false

    for (const endpoint of STUDENT_ENDPOINTS) {
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

            if (res.status === 401 || res.status === 403 || res.status === 404) continue
            errors.push(await readErrorMessage(res))
        } catch (err) {
            errors.push(err instanceof Error ? err.message : "Network error")
        }
    }

    if (hadSuccess) return []
    if (errors.length > 0) throw new Error(errors[0] ?? "Failed to load your defense schedule.")

    return []
}

function choosePrimarySchedule(rows: DefenseScheduleRecord[]): DefenseScheduleRecord | null {
    if (rows.length === 0) return null

    const now = Date.now()

    const upcoming = rows
        .filter((row) => {
            const time = new Date(row.scheduled_at).getTime()
            if (Number.isNaN(time)) return false
            return time >= now && row.status !== "completed" && row.status !== "cancelled"
        })
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

    if (upcoming.length > 0) return upcoming[0] ?? null

    const ongoing = rows
        .filter((row) => row.status === "ongoing")
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

    if (ongoing.length > 0) return ongoing[0] ?? null

    const latest = [...rows].sort(
        (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
    )

    return latest[0] ?? null
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

function statusBadgeClass(status: DefenseScheduleStatus): string {
    if (status === "completed") return "border-primary/40 bg-primary/10 text-foreground"
    if (status === "ongoing") return "border-chart-2/40 bg-chart-2/10 text-foreground"
    if (status === "cancelled") return "border-destructive/40 bg-destructive/10 text-destructive"
    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

function countdownLabel(value: string): string {
    const target = new Date(value).getTime()
    if (Number.isNaN(target)) return "Date unavailable"

    const diff = target - Date.now()
    if (diff <= 0) return "In progress or already completed"

    const totalMinutes = Math.floor(diff / 60000)
    const days = Math.floor(totalMinutes / (60 * 24))
    const hours = Math.floor((totalMinutes - days * 24 * 60) / 60)
    const minutes = totalMinutes % 60

    const parts: string[] = []
    if (days > 0) parts.push(`${days} day${days > 1 ? "s" : ""}`)
    if (hours > 0) parts.push(`${hours} hour${hours > 1 ? "s" : ""}`)
    if (minutes > 0 && days === 0) parts.push(`${minutes} minute${minutes > 1 ? "s" : ""}`)

    if (parts.length === 0) return "Starting soon"
    return `Starts in ${parts.join(", ")}`
}

function panelistPreview(panelists: PanelistLite[]): string {
    if (panelists.length === 0) return "No panelists announced yet"
    if (panelists.length <= 2) return panelists.map((p) => p.name).join(", ")
    return `${panelists[0]?.name}, ${panelists[1]?.name} +${panelists.length - 2} more`
}

export default function StudentDefenseSchedulePage() {
    const [schedules, setSchedules] = React.useState<DefenseScheduleRecord[]>([])
    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const loadSchedules = React.useCallback(async (withToast = false) => {
        if (withToast) setRefreshing(true)
        else setLoading(true)

        setError(null)

        try {
            const rows = await fetchStudentDefenseSchedules()
            setSchedules(rows)
            if (withToast) toast.success("Defense schedule refreshed.")
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to load your defense schedule."
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

    const primarySchedule = React.useMemo(() => choosePrimarySchedule(schedules), [schedules])

    const sortedHistory = React.useMemo(() => {
        return [...schedules].sort(
            (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
        )
    }, [schedules])

    const completedCount = React.useMemo(
        () => schedules.filter((row) => row.status === "completed").length,
        [schedules],
    )

    const ongoingCount = React.useMemo(
        () => schedules.filter((row) => row.status === "ongoing").length,
        [schedules],
    )

    return (
        <DashboardLayout
            title="My Defense Schedule"
            description="View your latest defense details, timing, room, and panel information."
        >
            <div className="space-y-4">
                <div className="flex justify-end">
                    <Button
                        variant="outline"
                        onClick={() => void loadSchedules(true)}
                        disabled={refreshing}
                    >
                        {refreshing ? "Refreshing..." : "Refresh"}
                    </Button>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                {loading ? (
                    <div className="space-y-3">
                        <div className="h-28 animate-pulse rounded-lg border bg-muted/40" />
                        <div className="h-28 animate-pulse rounded-lg border bg-muted/40" />
                        <div className="h-40 animate-pulse rounded-lg border bg-muted/40" />
                    </div>
                ) : !primarySchedule ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>No defense schedule yet</CardTitle>
                            <CardDescription>
                                Your defense schedule is not available right now. Please check again
                                later or contact your adviser/staff coordinator.
                            </CardDescription>
                        </CardHeader>
                    </Card>
                ) : (
                    <>
                        <Card className="shadow-sm">
                            <CardHeader className="pb-3">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="space-y-1">
                                        <CardDescription>Current / Next Defense</CardDescription>
                                        <CardTitle className="text-base">
                                            {primarySchedule.group_title ||
                                                primarySchedule.group_id ||
                                                "Thesis Group"}
                                        </CardTitle>
                                        <p className="text-sm text-muted-foreground">
                                            {countdownLabel(primarySchedule.scheduled_at)}
                                        </p>
                                    </div>

                                    <Badge
                                        variant="outline"
                                        className={statusBadgeClass(primarySchedule.status)}
                                    >
                                        {toTitleCase(primarySchedule.status)}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                        Schedule
                                    </p>
                                    <p className="mt-1 font-medium">
                                        {formatDateTime(primarySchedule.scheduled_at)}
                                    </p>
                                </div>

                                <div className="rounded-lg border p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                        Room
                                    </p>
                                    <p className="mt-1 font-medium">
                                        {primarySchedule.room || "TBA"}
                                    </p>
                                </div>

                                <div className="rounded-lg border p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                        Rubric
                                    </p>
                                    <p className="mt-1 font-medium">
                                        {primarySchedule.rubric_template_name || "Not set"}
                                    </p>
                                </div>

                                <div className="rounded-lg border p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                        Panelists
                                    </p>
                                    <p className="mt-1 font-medium">
                                        {panelistPreview(primarySchedule.panelists)}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid gap-4 sm:grid-cols-3">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm text-muted-foreground">
                                        Total Schedules
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-2xl font-semibold">{schedules.length}</p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm text-muted-foreground">
                                        Ongoing
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-2xl font-semibold">{ongoingCount}</p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm text-muted-foreground">
                                        Completed
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-2xl font-semibold">{completedCount}</p>
                                </CardContent>
                            </Card>
                        </div>

                        {sortedHistory.length > 1 ? (
                            <Card className="shadow-sm">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Schedule History</CardTitle>
                                    <CardDescription>
                                        Your recent and previous defense schedule records.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="min-w-56">Group</TableHead>
                                                    <TableHead className="min-w-52">Date &amp; Time</TableHead>
                                                    <TableHead className="min-w-40">Room</TableHead>
                                                    <TableHead className="min-w-36">Status</TableHead>
                                                    <TableHead className="min-w-64">Panel</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {sortedHistory.map((row) => (
                                                    <TableRow key={row.id}>
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span className="font-medium">
                                                                    {row.group_title ||
                                                                        row.group_id ||
                                                                        "Thesis Group"}
                                                                </span>
                                                                <span className="text-xs text-muted-foreground">
                                                                    {row.id}
                                                                </span>
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
                                                            {panelistPreview(row.panelists)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : null}
                    </>
                )}
            </div>
        </DashboardLayout>
    )
}
