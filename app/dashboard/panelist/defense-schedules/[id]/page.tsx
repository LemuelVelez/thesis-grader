"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
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
    created_by_id: string | null
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

type ThesisGroupOption = {
    id: string
    title: string
}

type RubricTemplateOption = {
    id: string
    name: string
}

type UserDirectoryOption = {
    id: string
    name: string
    email: string | null
}

const READ_BASE_ENDPOINTS = [
    "/api/panelist/defense-schedules",
    "/api/panelist/schedules",
    "/api/defense-schedules",
    "/api/admin/defense-schedules",
] as const

const STATUS_ENDPOINTS = [
    "/api/panelist/defense-schedules",
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

const USER_ENDPOINTS = ["/api/users", "/api/admin"] as const
const STATUS_ACTIONS: DefenseScheduleStatus[] = ["scheduled", "ongoing", "completed", "cancelled"]

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

function extractList(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    const typed = payload as ApiPayload
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

function normalizeUserOption(raw: unknown): UserDirectoryOption | null {
    if (!isRecord(raw)) return null

    const id = pickString(raw, ["id", "user_id", "userId"])
    if (!id) return null

    const name = pickString(raw, ["name", "full_name", "display_name", "displayName", "email"]) ?? id
    const email = pickNullableString(raw, ["email"])

    return { id, name, email }
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

async function fetchDefenseScheduleById(id: string): Promise<DefenseScheduleRecord> {
    const errors: string[] = []

    for (const base of READ_BASE_ENDPOINTS) {
        const endpoint = `${base}/${encodeURIComponent(id)}`
        try {
            const res = await fetch(endpoint, { cache: "no-store" })

            if (res.ok) {
                const payload = (await res.json()) as unknown
                const normalized = normalizeDefenseSchedule(extractSingle(payload))
                if (normalized) return normalized
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

async function updateDefenseScheduleStatus(
    id: string,
    status: DefenseScheduleStatus,
): Promise<DefenseScheduleRecord | null> {
    const errors: string[] = []

    const endpoints = STATUS_ENDPOINTS.flatMap((base) => [
        `${base}/${encodeURIComponent(id)}/status`,
        `${base}/${encodeURIComponent(id)}`,
    ])

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            })

            if (res.ok) {
                const payload = (await res.json()) as unknown
                const normalized = normalizeDefenseSchedule(extractSingle(payload))
                return normalized
            }

            if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 405) continue
            errors.push(await readErrorMessage(res))
        } catch (err) {
            errors.push(err instanceof Error ? err.message : "Network error")
        }
    }

    if (errors.length > 0) {
        throw new Error(errors[0] ?? "Failed to update defense schedule status.")
    }

    return null
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

async function fetchUsers(): Promise<UserDirectoryOption[]> {
    const collected: UserDirectoryOption[] = []

    for (const endpoint of USER_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            if (!res.ok) {
                if (res.status === 401 || res.status === 403 || res.status === 404) continue
                continue
            }

            const payload = (await res.json()) as unknown
            const options = extractList(payload)
                .map(normalizeUserOption)
                .filter((item): item is UserDirectoryOption => !!item)

            collected.push(...options)
        } catch {
            // try next
        }
    }

    return uniqueById(collected)
}

async function fetchCurrentUserId(): Promise<string | null> {
    try {
        const res = await fetch("/api/auth/me", { cache: "no-store" })
        if (!res.ok) return null

        const payload = (await res.json()) as unknown
        if (!isRecord(payload)) return null

        const data = (payload.item && isRecord(payload.item) ? payload.item : payload) as Record<string, unknown>
        return pickString(data, ["id", "user_id", "userId"])
    } catch {
        return null
    }
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
    const [error, setError] = React.useState<string | null>(null)

    const [groups, setGroups] = React.useState<ThesisGroupOption[]>([])
    const [rubrics, setRubrics] = React.useState<RubricTemplateOption[]>([])
    const [users, setUsers] = React.useState<UserDirectoryOption[]>([])
    const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)

    const [busyStatus, setBusyStatus] = React.useState<DefenseScheduleStatus | null>(null)

    const groupTitleById = React.useMemo(
        () => new Map(groups.map((group) => [group.id, group.title])),
        [groups],
    )

    const rubricNameById = React.useMemo(
        () => new Map(rubrics.map((rubric) => [rubric.id, rubric.name])),
        [rubrics],
    )

    const userById = React.useMemo(
        () => new Map(users.map((user) => [user.id, user])),
        [users],
    )

    const loadAll = React.useCallback(async (): Promise<boolean> => {
        if (!scheduleId) {
            setError("Invalid defense schedule ID.")
            setSchedule(null)
            setLoading(false)
            return false
        }

        setLoading(true)
        setError(null)

        try {
            const [row, groupRows, rubricRows, userRows, myId] = await Promise.all([
                fetchDefenseScheduleById(scheduleId),
                fetchThesisGroups(),
                fetchRubricTemplates(),
                fetchUsers(),
                fetchCurrentUserId(),
            ])

            setSchedule(row)
            setGroups(groupRows)
            setRubrics(rubricRows)
            setUsers(userRows)
            setCurrentUserId(myId)
            return true
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load defense schedule."
            setError(message)
            setSchedule(null)
            return false
        } finally {
            setLoading(false)
        }
    }, [scheduleId])

    React.useEffect(() => {
        void loadAll()
    }, [loadAll])

    const resolvedGroupTitle = React.useMemo(() => {
        if (!schedule) return "Unassigned Group"
        return schedule.group_title || groupTitleById.get(schedule.group_id) || schedule.group_id || "Unassigned Group"
    }, [groupTitleById, schedule])

    const resolvedRubricName = React.useMemo(() => {
        if (!schedule) return "Not set"
        return (
            schedule.rubric_template_name ||
            (schedule.rubric_template_id ? rubricNameById.get(schedule.rubric_template_id) : null) ||
            schedule.rubric_template_id ||
            "Not set"
        )
    }, [rubricNameById, schedule])

    const resolvedCreator = React.useMemo(() => {
        if (!schedule) return "System"

        if (schedule.created_by_name) return schedule.created_by_name
        if (schedule.created_by_email) return schedule.created_by_email

        const creatorId = schedule.created_by_id
        if (creatorId) {
            const user = userById.get(creatorId)
            if (user?.name) return user.name
            if (user?.email) return user.email
            return creatorId
        }

        if (schedule.created_by) return schedule.created_by
        return "System"
    }, [schedule, userById])

    const isAssignedToCurrentUser = React.useMemo(() => {
        if (!schedule || !currentUserId) return false
        return schedule.panelists.some((panelist) => panelist.id === currentUserId)
    }, [schedule, currentUserId])

    const handleRefresh = React.useCallback(async () => {
        const ok = await loadAll()
        if (ok) toast.success("Defense schedule refreshed.")
        else toast.error("Could not refresh defense schedule.")
    }, [loadAll])

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

                toast.success(`Status updated to ${toTitleCase(nextStatus)}.`)
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to update status."
                setError(message)
                toast.error(message)
            } finally {
                setBusyStatus(null)
            }
        },
        [busyStatus, schedule],
    )

    return (
        <DashboardLayout
            title="Defense Schedule Details"
            description="Review schedule details, panel lineup, and status updates."
        >
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/dashboard/panelist/defense-schedules">Back to My Schedules</Link>
                    </Button>

                    <Button variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={loading}>
                        <RefreshCw className="mr-2 h-4 w-4" />
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

                                <Badge variant="outline" className={statusBadgeClass(schedule.status)}>
                                    {toTitleCase(schedule.status)}
                                </Badge>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-lg border bg-card p-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Group</p>
                                <p className="mt-1 font-medium">{resolvedGroupTitle}</p>
                                {schedule.group_id ? (
                                    <p className="mt-1 text-sm text-muted-foreground">{schedule.group_id}</p>
                                ) : null}
                            </div>

                            <div className="rounded-lg border bg-card p-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Schedule</p>
                                <p className="mt-1 font-medium">{formatDateTime(schedule.scheduled_at)}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Room: {schedule.room || "TBA"}
                                </p>
                            </div>

                            <div className="rounded-lg border bg-card p-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Rubric Template</p>
                                <p className="mt-1 font-medium">{resolvedRubricName}</p>
                            </div>

                            <div className="rounded-lg border bg-card p-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Created By</p>
                                <p className="mt-1 font-medium">{resolvedCreator}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Created: {formatDateTime(schedule.created_at)}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-lg border bg-card p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                        My Participation
                                    </p>
                                    <p className="mt-1 text-sm">
                                        {isAssignedToCurrentUser
                                            ? "You are assigned as a panelist for this defense schedule."
                                            : "You are viewing this schedule but your panelist assignment was not detected."}
                                    </p>
                                </div>
                                <Badge variant={isAssignedToCurrentUser ? "default" : "outline"}>
                                    {isAssignedToCurrentUser ? "Assigned" : "Not Assigned"}
                                </Badge>
                            </div>
                        </div>

                        <div className="rounded-lg border bg-card p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Update Status
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Use these quick actions to keep progress current.
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
                                            {busyStatus === status ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Updating...
                                                </>
                                            ) : (
                                                toTitleCase(status)
                                            )}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="rounded-lg border bg-card p-4">
                            <div className="mb-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Panelists
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {schedule.panelists.length} assigned
                                </p>
                            </div>

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
                                            schedule.panelists.map((panelist) => {
                                                const isMe = !!currentUserId && panelist.id === currentUserId
                                                return (
                                                    <TableRow key={`${panelist.id}-${panelist.name}`}>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium">{panelist.name}</span>
                                                                {isMe ? <Badge variant="secondary">You</Badge> : null}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>{panelist.email || "—"}</TableCell>
                                                        <TableCell className="text-muted-foreground">
                                                            {panelist.id || "—"}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })
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
