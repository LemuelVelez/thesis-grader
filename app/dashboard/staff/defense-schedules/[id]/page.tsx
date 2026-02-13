"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"

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

type MemberStatus = "active" | "disabled" | (string & {})
type EvaluationStatus = "pending" | "submitted" | "locked" | (string & {})

type DefenseScheduleItem = {
    id: string
    group_id: string | null
    group_title: string | null
    scheduled_at: string | null
    room: string | null
    status: DefenseScheduleStatus
    panelists_count: number
    created_by: string | null
    rubric_template_id: string | null
    created_at: string | null
    updated_at: string | null
}

type PanelistMember = {
    id: string
    name: string
    email: string | null
    status: MemberStatus
    expertise: string | null
}

type EvaluationItem = {
    id: string
    evaluator_id: string | null
    evaluator_name: string
    status: EvaluationStatus
    submitted_at: string | null
    locked_at: string | null
    created_at: string | null
}

const SCHEDULE_ENDPOINT_CANDIDATES = [
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

function statusTone(status: string): string {
    const normalized = status.toLowerCase()

    if (normalized === "scheduled" || normalized === "pending") {
        return "border-sky-600/40 bg-sky-600/10 text-foreground"
    }

    if (normalized === "ongoing") {
        return "border-amber-600/40 bg-amber-600/10 text-foreground"
    }

    if (normalized === "completed" || normalized === "submitted" || normalized === "locked") {
        return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
    }

    if (normalized === "cancelled" || normalized === "disabled") {
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

    const created_by = toNullableString(raw.created_by ?? raw.createdBy)
    const rubric_template_id = toNullableString(raw.rubric_template_id ?? raw.rubricTemplateId)
    const created_at = toNullableString(raw.created_at ?? raw.createdAt)
    const updated_at = toNullableString(raw.updated_at ?? raw.updatedAt)

    return {
        id,
        group_id,
        group_title,
        scheduled_at,
        room,
        status,
        panelists_count,
        created_by,
        rubric_template_id,
        created_at,
        updated_at,
    }
}

function normalizePanelistMember(raw: unknown): PanelistMember | null {
    if (!isRecord(raw)) return null

    const user = isRecord(raw.user) ? raw.user : raw
    const profile =
        isRecord(raw.profile)
            ? raw.profile
            : isRecord(raw.panelist_profile)
                ? raw.panelist_profile
                : raw

    const id =
        toStringSafe(user.id ?? raw.id ?? raw.staff_id ?? raw.user_id ?? raw.panelist_id)
    if (!id) return null

    const name =
        toStringSafe(user.name ?? raw.name ?? raw.full_name ?? raw.fullName) ??
        `Panelist ${id.slice(0, 8)}`

    const email = toNullableString(user.email ?? raw.email)
    const expertise =
        toNullableString(profile.expertise ?? raw.expertise ?? raw.specialization)

    const status = (toStringSafe(user.status ?? raw.status) ?? "active") as MemberStatus

    return {
        id,
        name,
        email,
        expertise,
        status,
    }
}

function normalizeEvaluation(raw: unknown): EvaluationItem | null {
    if (!isRecord(raw)) return null

    const evaluator = isRecord(raw.evaluator) ? raw.evaluator : null

    const id = toStringSafe(raw.id ?? raw.evaluation_id ?? raw.evaluationId)
    if (!id) return null

    const evaluator_id =
        toNullableString(raw.evaluator_id ?? raw.evaluatorId ?? evaluator?.id)

    const evaluator_name =
        toStringSafe(raw.evaluator_name ?? raw.evaluatorName ?? evaluator?.name) ??
        (evaluator_id ? `Evaluator ${evaluator_id.slice(0, 8)}` : "Unknown Evaluator")

    const status = (toStringSafe(raw.status) ?? "pending") as EvaluationStatus
    const submitted_at = toNullableString(raw.submitted_at ?? raw.submittedAt)
    const locked_at = toNullableString(raw.locked_at ?? raw.lockedAt)
    const created_at = toNullableString(raw.created_at ?? raw.createdAt)

    return {
        id,
        evaluator_id,
        evaluator_name,
        status,
        submitted_at,
        locked_at,
        created_at,
    }
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload.schedules)) return payload.schedules
    if (Array.isArray(payload.panelists)) return payload.panelists
    if (Array.isArray(payload.evaluations)) return payload.evaluations

    if (isRecord(payload.data)) {
        if (Array.isArray(payload.data.items)) return payload.data.items
        if (Array.isArray(payload.data.schedules)) return payload.data.schedules
        if (Array.isArray(payload.data.panelists)) return payload.data.panelists
        if (Array.isArray(payload.data.evaluations)) return payload.data.evaluations
    }

    if (isRecord(payload.result)) {
        if (Array.isArray(payload.result.items)) return payload.result.items
        if (Array.isArray(payload.result.schedules)) return payload.result.schedules
        if (Array.isArray(payload.result.panelists)) return payload.result.panelists
        if (Array.isArray(payload.result.evaluations)) return payload.result.evaluations
    }

    return []
}

function extractObjectPayload(payload: unknown): Record<string, unknown> | null {
    if (isRecord(payload.item)) return payload.item
    if (isRecord(payload.schedule)) return payload.schedule
    if (isRecord(payload.data)) return payload.data
    if (isRecord(payload.result)) return payload.result
    if (isRecord(payload)) return payload
    return null
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

function buildWhereQuery(where: Record<string, string>): string {
    return encodeURIComponent(JSON.stringify(where))
}

export default function StaffDefenseScheduleDetailsPage() {
    const router = useRouter()
    const params = useParams<{ id: string | string[] }>()

    const idParam = params?.id
    const scheduleId =
        typeof idParam === "string" ? idParam : Array.isArray(idParam) ? (idParam[0] ?? "") : ""

    const [schedule, setSchedule] = React.useState<DefenseScheduleItem | null>(null)
    const [panelists, setPanelists] = React.useState<PanelistMember[]>([])
    const [evaluations, setEvaluations] = React.useState<EvaluationItem[]>([])

    const [loadingSchedule, setLoadingSchedule] = React.useState(true)
    const [loadingPanelists, setLoadingPanelists] = React.useState(true)
    const [loadingEvaluations, setLoadingEvaluations] = React.useState(true)

    const [scheduleError, setScheduleError] = React.useState<string | null>(null)
    const [panelistsError, setPanelistsError] = React.useState<string | null>(null)
    const [evaluationsError, setEvaluationsError] = React.useState<string | null>(null)

    const [scheduleSource, setScheduleSource] = React.useState<string | null>(null)
    const [panelistsSource, setPanelistsSource] = React.useState<string | null>(null)
    const [evaluationsSource, setEvaluationsSource] = React.useState<string | null>(null)

    const loadSchedule = React.useCallback(async () => {
        if (!scheduleId) {
            setSchedule(null)
            setScheduleSource(null)
            setScheduleError("Missing schedule id.")
            setLoadingSchedule(false)
            return
        }

        setLoadingSchedule(true)
        setScheduleError(null)

        let loaded = false
        let latestError = "Unable to load schedule details."

        const candidateUrls: string[] = []

        for (const base of SCHEDULE_ENDPOINT_CANDIDATES) {
            candidateUrls.push(`${base}/${encodeURIComponent(scheduleId)}`)
            candidateUrls.push(`${base}?id=${encodeURIComponent(scheduleId)}`)
            candidateUrls.push(`${base}?where=${buildWhereQuery({ id: scheduleId })}`)
        }

        for (const endpoint of candidateUrls) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const objectPayload = extractObjectPayload(payload)
                const fromObject = normalizeDefenseSchedule(objectPayload)
                if (fromObject && fromObject.id === scheduleId) {
                    setSchedule(fromObject)
                    setScheduleSource(endpoint)
                    loaded = true
                    break
                }

                const fromArray = extractArrayPayload(payload)
                    .map(normalizeDefenseSchedule)
                    .filter((item): item is DefenseScheduleItem => item !== null)
                    .find((item) => item.id === scheduleId)

                if (fromArray) {
                    setSchedule(fromArray)
                    setScheduleSource(endpoint)
                    loaded = true
                    break
                }
            } catch (err) {
                latestError =
                    err instanceof Error ? err.message : "Unable to load schedule details."
            }
        }

        if (!loaded) {
            setSchedule(null)
            setScheduleSource(null)
            setScheduleError(
                `${latestError} No schedule details endpoint responded successfully. ` +
                `Please ensure a defense schedules API is available.`,
            )
        }

        setLoadingSchedule(false)
    }, [scheduleId])

    const loadPanelists = React.useCallback(async () => {
        if (!scheduleId) {
            setPanelists([])
            setPanelistsSource(null)
            setPanelistsError("Missing schedule id.")
            setLoadingPanelists(false)
            return
        }

        setLoadingPanelists(true)
        setPanelistsError(null)

        let loaded = false
        let latestError = "Unable to load panelists."

        const endpoints = [
            `/api/staff/defense-schedules/${encodeURIComponent(scheduleId)}/panelists`,
            `/api/defense-schedules/${encodeURIComponent(scheduleId)}/panelists`,
            `/api/schedule-panelists/schedule/${encodeURIComponent(scheduleId)}`,
            `/api/schedule-panelists?where=${buildWhereQuery({ schedule_id: scheduleId })}`,
        ]

        for (const endpoint of endpoints) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const parsed = extractArrayPayload(payload)
                    .map(normalizePanelistMember)
                    .filter((item): item is PanelistMember => item !== null)

                setPanelists(parsed)
                setPanelistsSource(endpoint)
                loaded = true
                break
            } catch (err) {
                latestError =
                    err instanceof Error ? err.message : "Unable to load panelists."
            }
        }

        if (!loaded) {
            setPanelists([])
            setPanelistsSource(null)
            setPanelistsError(
                `${latestError} Panelists endpoints were not available for this schedule.`,
            )
        }

        setLoadingPanelists(false)
    }, [scheduleId])

    const loadEvaluations = React.useCallback(async () => {
        if (!scheduleId) {
            setEvaluations([])
            setEvaluationsSource(null)
            setEvaluationsError("Missing schedule id.")
            setLoadingEvaluations(false)
            return
        }

        setLoadingEvaluations(true)
        setEvaluationsError(null)

        let loaded = false
        let latestError = "Unable to load evaluations."

        const endpoints = [
            `/api/evaluations/schedule/${encodeURIComponent(scheduleId)}`,
            `/api/evaluations?where=${buildWhereQuery({ schedule_id: scheduleId })}`,
            `/api/evaluations?schedule_id=${encodeURIComponent(scheduleId)}`,
        ]

        for (const endpoint of endpoints) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const parsed = extractArrayPayload(payload)
                    .map(normalizeEvaluation)
                    .filter((item): item is EvaluationItem => item !== null)

                setEvaluations(parsed)
                setEvaluationsSource(endpoint)
                loaded = true
                break
            } catch (err) {
                latestError =
                    err instanceof Error ? err.message : "Unable to load evaluations."
            }
        }

        if (!loaded) {
            setEvaluations([])
            setEvaluationsSource(null)
            setEvaluationsError(
                `${latestError} Evaluations endpoints were not available for this schedule.`,
            )
        }

        setLoadingEvaluations(false)
    }, [scheduleId])

    const refreshAll = React.useCallback(async () => {
        await Promise.all([loadSchedule(), loadPanelists(), loadEvaluations()])
    }, [loadSchedule, loadPanelists, loadEvaluations])

    React.useEffect(() => {
        void refreshAll()
    }, [refreshAll])

    const summary = React.useMemo(() => {
        const counts = {
            pending: 0,
            submitted: 0,
            locked: 0,
            other: 0,
        }

        for (const item of evaluations) {
            const s = item.status.toLowerCase()
            if (s === "pending") counts.pending += 1
            else if (s === "submitted") counts.submitted += 1
            else if (s === "locked") counts.locked += 1
            else counts.other += 1
        }

        return counts
    }, [evaluations])

    return (
        <DashboardLayout
            title="Defense Schedule Details"
            description={scheduleId ? `Review schedule ${scheduleId}` : "Review defense schedule details"}
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-1">
                            <p className="text-sm font-medium">
                                {schedule ? `Schedule #${schedule.id.slice(0, 8)}` : "Schedule"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {scheduleId ? `ID: ${scheduleId}` : "No schedule ID provided"}
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={() => router.push("/dashboard/staff/defense-schedules")}
                            >
                                Back
                            </Button>
                            <Button onClick={() => void refreshAll()}>
                                Refresh
                            </Button>
                        </div>
                    </div>
                </div>

                {scheduleError ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {scheduleError}
                    </div>
                ) : null}

                <div className="rounded-lg border bg-card p-4">
                    <h3 className="text-sm font-semibold">Schedule Info</h3>
                    {scheduleSource ? (
                        <p className="mt-1 text-xs text-muted-foreground">Data source: {scheduleSource}</p>
                    ) : null}

                    {loadingSchedule ? (
                        <div className="mt-3 h-20 animate-pulse rounded-md bg-muted/50" />
                    ) : schedule ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Group</p>
                                <p className="text-sm font-medium">{schedule.group_title ?? "Untitled Group"}</p>
                                <p className="text-xs text-muted-foreground">ID: {schedule.group_id ?? "—"}</p>
                            </div>

                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Date & Time</p>
                                <p className="text-sm font-medium">{formatDateTime(schedule.scheduled_at)}</p>
                            </div>

                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Room</p>
                                <p className="text-sm font-medium">{schedule.room ?? "—"}</p>
                            </div>

                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Status</p>
                                <span
                                    className={[
                                        "mt-1 inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                        statusTone(schedule.status),
                                    ].join(" ")}
                                >
                                    {toTitleCase(schedule.status)}
                                </span>
                            </div>

                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Panelists</p>
                                <p className="text-sm font-medium">{panelists.length || schedule.panelists_count}</p>
                            </div>

                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Rubric Template ID</p>
                                <p className="text-sm font-medium break-all">{schedule.rubric_template_id ?? "—"}</p>
                            </div>
                        </div>
                    ) : (
                        <p className="mt-3 text-sm text-muted-foreground">
                            Schedule details are unavailable.
                        </p>
                    )}
                </div>

                <div className="rounded-lg border bg-card p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-semibold">Assigned Panelists</h3>
                            {panelistsSource ? (
                                <p className="text-xs text-muted-foreground">Data source: {panelistsSource}</p>
                            ) : null}
                        </div>
                    </div>

                    {panelistsError ? (
                        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                            {panelistsError}
                        </div>
                    ) : null}

                    <div className="overflow-x-auto rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="min-w-56">Panelist</TableHead>
                                    <TableHead className="min-w-56">Email</TableHead>
                                    <TableHead className="min-w-48">Expertise</TableHead>
                                    <TableHead className="min-w-28">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingPanelists ? (
                                    Array.from({ length: 3 }).map((_, i) => (
                                        <TableRow key={`panelist-skeleton-${i}`}>
                                            <TableCell colSpan={4}>
                                                <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : panelists.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                                            No panelists found for this schedule.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    panelists.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{item.name}</span>
                                                    <span className="text-xs text-muted-foreground">ID: {item.id}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {item.email ?? "—"}
                                            </TableCell>
                                            <TableCell>{item.expertise ?? "—"}</TableCell>
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

                <div className="rounded-lg border bg-card p-4">
                    <div className="mb-3 space-y-1">
                        <h3 className="text-sm font-semibold">Evaluations</h3>
                        {evaluationsSource ? (
                            <p className="text-xs text-muted-foreground">Data source: {evaluationsSource}</p>
                        ) : null}
                    </div>

                    <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Pending</p>
                            <p className="text-lg font-semibold">{summary.pending}</p>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Submitted</p>
                            <p className="text-lg font-semibold">{summary.submitted}</p>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Locked</p>
                            <p className="text-lg font-semibold">{summary.locked}</p>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Other</p>
                            <p className="text-lg font-semibold">{summary.other}</p>
                        </div>
                    </div>

                    {evaluationsError ? (
                        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                            {evaluationsError}
                        </div>
                    ) : null}

                    <div className="overflow-x-auto rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="min-w-56">Evaluator</TableHead>
                                    <TableHead className="min-w-28">Status</TableHead>
                                    <TableHead className="min-w-52">Submitted</TableHead>
                                    <TableHead className="min-w-52">Locked</TableHead>
                                    <TableHead className="min-w-52">Created</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingEvaluations ? (
                                    Array.from({ length: 4 }).map((_, i) => (
                                        <TableRow key={`evaluation-skeleton-${i}`}>
                                            <TableCell colSpan={5}>
                                                <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : evaluations.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                                            No evaluations found for this schedule.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    evaluations.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{item.evaluator_name}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        ID: {item.evaluator_id ?? "—"}
                                                    </span>
                                                </div>
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

                                            <TableCell>{formatDateTime(item.submitted_at)}</TableCell>
                                            <TableCell>{formatDateTime(item.locked_at)}</TableCell>
                                            <TableCell>{formatDateTime(item.created_at)}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
