"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
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
    created_by_name: string | null
    created_by_email: string | null
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

const READ_ENDPOINTS = [
    "/api/panelist/defense-schedules",
    "/api/panelist/schedules/defense",
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

function extractSingle(payload: unknown): unknown {
    if (!isRecord(payload)) return payload
    const typed = payload as ApiPayload

    if (typed.item !== undefined) return typed.item
    if (Array.isArray(typed.items) && typed.items.length > 0) return typed.items[0]

    if (isRecord(payload.data)) {
        const data = payload.data
        if (data.item !== undefined) return data.item
        if (Array.isArray(data.items) && data.items.length > 0) return data.items[0]
    }

    return payload
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

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { error?: string; message?: string }
        return data.error || data.message || `Request failed (${res.status})`
    } catch {
        return `Request failed (${res.status})`
    }
}

async function fetchDefenseScheduleById(id: string): Promise<DefenseScheduleRecord> {
    const errors: string[] = []

    for (const base of READ_ENDPOINTS) {
        const endpoint = `${base}/${encodeURIComponent(id)}`

        try {
            const res = await fetch(endpoint, { cache: "no-store" })

            if (res.ok) {
                const payload = (await res.json()) as unknown
                const single = extractSingle(payload)
                const schedule = normalizeDefenseSchedule(single)

                if (schedule) return schedule
                errors.push("Received invalid defense schedule payload.")
                continue
            }

            if (res.status === 401 || res.status === 403 || res.status === 404) continue
            errors.push(await readErrorMessage(res))
        } catch (err) {
            errors.push(err instanceof Error ? err.message : "Network error")
        }
    }

    throw new Error(errors[0] ?? "Defense schedule not found.")
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

function timeUntil(value: string): string {
    const target = new Date(value).getTime()
    if (Number.isNaN(target)) return "Date unavailable"

    const diff = target - Date.now()
    if (diff <= 0) return "Started or completed"

    const totalMinutes = Math.floor(diff / 60000)
    const days = Math.floor(totalMinutes / (60 * 24))
    const hours = Math.floor((totalMinutes - days * 24 * 60) / 60)
    const minutes = totalMinutes % 60

    const parts: string[] = []
    if (days > 0) parts.push(`${days}d`)
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0 && days === 0) parts.push(`${minutes}m`)

    return parts.length > 0 ? `Starts in ${parts.join(" ")}` : "Starting soon"
}

export default function PanelistDefenseScheduleDetailsPage() {
    const params = useParams<{ id?: string | string[] }>()

    const scheduleId = React.useMemo(() => {
        const raw = params?.id
        if (Array.isArray(raw)) return raw[0] ?? ""
        return raw ?? ""
    }, [params])

    const [schedule, setSchedule] = React.useState<DefenseScheduleRecord | null>(null)
    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const loadSchedule = React.useCallback(
        async (withToast = false) => {
            if (!scheduleId) {
                setSchedule(null)
                setError("Invalid defense schedule ID.")
                setLoading(false)
                return
            }

            if (withToast) setRefreshing(true)
            else setLoading(true)

            setError(null)

            try {
                const row = await fetchDefenseScheduleById(scheduleId)
                setSchedule(row)
                if (withToast) toast.success("Defense schedule refreshed.")
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Failed to load defense schedule."
                setError(message)
                setSchedule(null)
                toast.error(message)
            } finally {
                if (withToast) setRefreshing(false)
                else setLoading(false)
            }
        },
        [scheduleId],
    )

    React.useEffect(() => {
        void loadSchedule(false)
    }, [loadSchedule])

    const handleCopyId = React.useCallback(async () => {
        if (!schedule?.id) return

        try {
            await navigator.clipboard.writeText(schedule.id)
            toast.success("Schedule ID copied.")
        } catch {
            toast.error("Unable to copy schedule ID.")
        }
    }, [schedule?.id])

    const resolvedGroupTitle = schedule?.group_title || schedule?.group_id || "Unassigned Group"
    const resolvedRubric = schedule?.rubric_template_name || "Not set"

    return (
        <DashboardLayout
            title="Defense Schedule Details"
            description="Review your assigned schedule, panel composition, and defense timing."
        >
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/dashboard/panelist/defense-schedules">Back to Schedules</Link>
                    </Button>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void loadSchedule(true)}
                            disabled={refreshing}
                        >
                            {refreshing ? "Refreshing..." : "Refresh"}
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleCopyId()}
                            disabled={!schedule}
                        >
                            Copy Schedule ID
                        </Button>
                    </div>
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
                ) : !schedule ? (
                    <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                        Defense schedule not found.
                    </div>
                ) : (
                    <>
                        <Card className="shadow-sm">
                            <CardHeader className="pb-3">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="space-y-1">
                                        <CardDescription>Schedule ID</CardDescription>
                                        <CardTitle className="text-base">{schedule.id}</CardTitle>
                                        <p className="text-sm text-muted-foreground">
                                            {timeUntil(schedule.scheduled_at)}
                                        </p>
                                    </div>

                                    <Badge
                                        variant="outline"
                                        className={statusBadgeClass(schedule.status)}
                                    >
                                        {toTitleCase(schedule.status)}
                                    </Badge>
                                </div>
                            </CardHeader>
                        </Card>

                        <div className="grid gap-4 md:grid-cols-2">
                            <Card className="shadow-sm">
                                <CardHeader className="pb-2">
                                    <CardDescription>Thesis Group</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-1">
                                    <p className="font-medium">{resolvedGroupTitle}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {schedule.group_id || "No group ID"}
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm">
                                <CardHeader className="pb-2">
                                    <CardDescription>Schedule Time</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-1">
                                    <p className="font-medium">{formatDateTime(schedule.scheduled_at)}</p>
                                    <p className="text-sm text-muted-foreground">
                                        Room: {schedule.room || "TBA"}
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm">
                                <CardHeader className="pb-2">
                                    <CardDescription>Rubric Template</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <p className="font-medium">{resolvedRubric}</p>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm">
                                <CardHeader className="pb-2">
                                    <CardDescription>Audit Info</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-1 text-sm">
                                    <p className="text-muted-foreground">
                                        Created: {formatDateTime(schedule.created_at)}
                                    </p>
                                    <p className="text-muted-foreground">
                                        Updated: {formatDateTime(schedule.updated_at)}
                                    </p>
                                    <p className="text-muted-foreground">
                                        Created by:{" "}
                                        {schedule.created_by_name ||
                                            schedule.created_by_email ||
                                            "System"}
                                    </p>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="shadow-sm">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Panel Members</CardTitle>
                                <CardDescription>
                                    Assigned panelists for this defense schedule.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="min-w-56">Name</TableHead>
                                                <TableHead className="min-w-64">Email</TableHead>
                                                <TableHead className="min-w-56">User ID</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {schedule.panelists.length === 0 ? (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={3}
                                                        className="h-16 text-center text-muted-foreground"
                                                    >
                                                        No panelists assigned.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                schedule.panelists.map((panelist) => (
                                                    <TableRow
                                                        key={`${panelist.id}-${panelist.name}`}
                                                    >
                                                        <TableCell className="font-medium">
                                                            {panelist.name}
                                                        </TableCell>
                                                        <TableCell>
                                                            {panelist.email || "—"}
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground">
                                                            {panelist.id || "—"}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </DashboardLayout>
    )
}
