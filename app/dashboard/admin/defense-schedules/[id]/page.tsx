"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
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

type ApiPayload = {
    item?: unknown
    items?: unknown
    error?: string
    message?: string
}

const READ_ENDPOINTS = ["/api/defense-schedules", "/api/admin/defense-schedules"] as const
const STATUS_ACTIONS: DefenseScheduleStatus[] = ["scheduled", "ongoing", "completed", "cancelled"]

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

function formatDateTime(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
}

function toTitleCase(value: string): string {
    if (!value) return ""
    return value.charAt(0).toUpperCase() + value.slice(1)
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

function extractSingle(payload: unknown): unknown {
    if (!isRecord(payload)) return payload

    const typed = payload as ApiPayload

    if (typed.item !== undefined) return typed.item
    if (Array.isArray(typed.items) && typed.items.length > 0) return typed.items[0]

    return payload
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

async function fetchDefenseScheduleById(id: string): Promise<DefenseScheduleRecord> {
    const errors: string[] = []

    for (const base of READ_ENDPOINTS) {
        const endpoint = `${base}/${encodeURIComponent(id)}`

        try {
            const res = await fetch(endpoint, { cache: "no-store" })

            if (res.ok) {
                const payload = (await res.json()) as unknown
                const single = extractSingle(payload)
                const normalized = normalizeDefenseSchedule(single)

                if (normalized) return normalized
                errors.push("Received invalid defense schedule payload.")
                continue
            }

            if (res.status !== 404) {
                errors.push(await readErrorMessage(res))
            }
        } catch (err) {
            errors.push(err instanceof Error ? err.message : "Network error")
        }
    }

    throw new Error(errors[0] ?? "Defense schedule not found.")
}

async function updateDefenseScheduleStatus(
    id: string,
    nextStatus: DefenseScheduleStatus,
): Promise<DefenseScheduleRecord | null> {
    const errors: string[] = []

    const statusEndpoints = [
        `/api/defense-schedules/${encodeURIComponent(id)}/status`,
        `/api/admin/defense-schedules/${encodeURIComponent(id)}/status`,
        `/api/defense-schedules/${encodeURIComponent(id)}`,
        `/api/admin/defense-schedules/${encodeURIComponent(id)}`,
    ] as const

    for (const endpoint of statusEndpoints) {
        try {
            const res = await fetch(endpoint, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: nextStatus }),
            })

            if (res.ok) {
                const payload = (await res.json()) as unknown
                const single = extractSingle(payload)
                const normalized = normalizeDefenseSchedule(single)
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
        throw new Error(errors[0] ?? "Failed to update schedule status.")
    }

    return null
}

export default function AdminDefenseScheduleDetailsPage() {
    const params = useParams<{ id?: string | string[] }>()
    const scheduleId = React.useMemo(() => {
        const raw = params?.id
        if (Array.isArray(raw)) return raw[0] ?? ""
        return raw ?? ""
    }, [params])

    const [schedule, setSchedule] = React.useState<DefenseScheduleRecord | null>(null)
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [busyStatus, setBusyStatus] = React.useState<DefenseScheduleStatus | null>(null)

    const loadSchedule = React.useCallback(async () => {
        if (!scheduleId) {
            setError("Invalid defense schedule ID.")
            setSchedule(null)
            setLoading(false)
            return
        }

        setLoading(true)
        setError(null)

        try {
            const row = await fetchDefenseScheduleById(scheduleId)
            setSchedule(row)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load defense schedule.")
            setSchedule(null)
        } finally {
            setLoading(false)
        }
    }, [scheduleId])

    React.useEffect(() => {
        void loadSchedule()
    }, [loadSchedule])

    const handleSetStatus = React.useCallback(
        async (nextStatus: DefenseScheduleStatus) => {
            if (!schedule || busyStatus) return

            setBusyStatus(nextStatus)
            setError(null)

            try {
                const updated = await updateDefenseScheduleStatus(schedule.id, nextStatus)

                if (updated) {
                    setSchedule(updated)
                } else {
                    setSchedule((prev) =>
                        prev
                            ? {
                                ...prev,
                                status: nextStatus,
                                updated_at: new Date().toISOString(),
                            }
                            : prev,
                    )
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to update status.")
            } finally {
                setBusyStatus(null)
            }
        },
        [schedule, busyStatus],
    )

    return (
        <DashboardLayout
            title="Defense Schedule Details"
            description="Review schedule information and update defense status."
        >
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/dashboard/admin/defense-schedules">Back to Defense Schedules</Link>
                    </Button>

                    <Button variant="outline" size="sm" onClick={() => void loadSchedule()} disabled={loading}>
                        Refresh
                    </Button>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                {loading ? (
                    <div className="space-y-3">
                        <div className="h-28 animate-pulse rounded-lg border bg-muted/50" />
                        <div className="h-28 animate-pulse rounded-lg border bg-muted/50" />
                        <div className="h-40 animate-pulse rounded-lg border bg-muted/50" />
                    </div>
                ) : !schedule ? (
                    <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                        Defense schedule not found.
                    </div>
                ) : (
                    <>
                        <div className="rounded-lg border bg-card p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="space-y-1">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                        Schedule ID
                                    </p>
                                    <p className="font-semibold">{schedule.id}</p>
                                    <p className="text-sm text-muted-foreground">
                                        Updated: {formatDateTime(schedule.updated_at)}
                                    </p>
                                </div>

                                <div>
                                    <span
                                        className={[
                                            "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                            statusPillClass(schedule.status),
                                        ].join(" ")}
                                    >
                                        {toTitleCase(schedule.status)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-lg border bg-card p-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Group
                                </p>
                                <p className="mt-1 font-medium">
                                    {schedule.group_title || schedule.group_id || "Unassigned Group"}
                                </p>
                                {schedule.group_id ? (
                                    <p className="mt-1 text-sm text-muted-foreground">{schedule.group_id}</p>
                                ) : null}
                            </div>

                            <div className="rounded-lg border bg-card p-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Schedule
                                </p>
                                <p className="mt-1 font-medium">{formatDateTime(schedule.scheduled_at)}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Room: {schedule.room || "TBA"}
                                </p>
                            </div>

                            <div className="rounded-lg border bg-card p-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Rubric Template
                                </p>
                                <p className="mt-1 font-medium">
                                    {schedule.rubric_template_name || schedule.rubric_template_id || "Not set"}
                                </p>
                            </div>

                            <div className="rounded-lg border bg-card p-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Created By
                                </p>
                                <p className="mt-1 font-medium">{schedule.created_by || "Unknown"}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Created: {formatDateTime(schedule.created_at)}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-lg border bg-card p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Update Status
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {STATUS_ACTIONS.map((status) => {
                                    const active = schedule.status === status
                                    const disabled = !!busyStatus

                                    return (
                                        <Button
                                            key={status}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            disabled={disabled}
                                            onClick={() => void handleSetStatus(status)}
                                        >
                                            {busyStatus === status ? "Updating..." : toTitleCase(status)}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="rounded-lg border bg-card p-4">
                            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Panelists
                            </p>

                            <div className="overflow-x-auto rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="min-w-56">Name</TableHead>
                                            <TableHead className="min-w-56">Email</TableHead>
                                            <TableHead className="min-w-48">ID</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {schedule.panelists.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={3} className="h-16 text-center text-muted-foreground">
                                                    No panelists assigned.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            schedule.panelists.map((panelist) => (
                                                <TableRow key={`${panelist.id}-${panelist.name}`}>
                                                    <TableCell className="font-medium">{panelist.name}</TableCell>
                                                    <TableCell>{panelist.email || "—"}</TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {panelist.id || "—"}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    )
}
