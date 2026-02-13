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

type EvaluationStatus = "pending" | "submitted" | "locked" | (string & {})

type SchedulePanelist = {
    staff_id: string
    name: string | null
    email: string | null
    expertise: string | null
}

type DefenseScheduleDetail = {
    id: string
    group_id: string
    group_title: string | null
    thesis_title: string | null
    scheduled_at: string
    room: string | null
    status: DefenseScheduleStatus
    rubric_template_id: string | null
    created_by: string | null
    created_at: string | null
    updated_at: string | null
    panelists: SchedulePanelist[]
}

type EvaluationItem = {
    id: string
    evaluator_id: string
    evaluator_name: string | null
    status: EvaluationStatus
    submitted_at: string | null
    locked_at: string | null
    created_at: string | null
}

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

function statusTone(status: string): string {
    const normalized = status.toLowerCase()

    if (normalized === "scheduled") return "border-primary/40 bg-primary/10 text-foreground"
    if (normalized === "ongoing") return "border-amber-500/40 bg-amber-500/10 text-foreground"
    if (normalized === "completed") return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
    if (normalized === "cancelled") return "border-destructive/40 bg-destructive/10 text-destructive"

    if (normalized === "pending") return "border-primary/40 bg-primary/10 text-foreground"
    if (normalized === "submitted") return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
    if (normalized === "locked") return "border-muted-foreground/40 bg-muted text-muted-foreground"

    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data

    if (isRecord(payload.data) && Array.isArray(payload.data.items)) {
        return payload.data.items
    }

    return []
}

function normalizePanelist(raw: unknown): SchedulePanelist | null {
    if (!isRecord(raw)) return null

    const staffId = toStringSafe(raw.staff_id ?? raw.staffId ?? raw.user_id ?? raw.userId)
    if (!staffId) return null

    return {
        staff_id: staffId,
        name: toNullableString(raw.name),
        email: toNullableString(raw.email),
        expertise: toNullableString(raw.expertise),
    }
}

function normalizeSchedule(raw: unknown): DefenseScheduleDetail | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    if (!id) return null

    const groupId = toStringSafe(raw.group_id ?? raw.groupId) ?? "—"
    const scheduledAt = toStringSafe(raw.scheduled_at ?? raw.scheduledAt) ?? ""
    const status = (toStringSafe(raw.status) ?? "scheduled") as DefenseScheduleStatus

    const rawPanelists = Array.isArray(raw.panelists)
        ? raw.panelists
        : Array.isArray(raw.schedule_panelists)
            ? raw.schedule_panelists
            : []

    const panelists = rawPanelists
        .map(normalizePanelist)
        .filter((item): item is SchedulePanelist => item !== null)

    return {
        id,
        group_id: groupId,
        group_title: toNullableString(raw.group_title ?? raw.groupTitle),
        thesis_title: toNullableString(raw.thesis_title ?? raw.thesisTitle ?? raw.title),
        scheduled_at: scheduledAt,
        room: toNullableString(raw.room),
        status,
        rubric_template_id: toNullableString(raw.rubric_template_id ?? raw.rubricTemplateId),
        created_by: toNullableString(raw.created_by ?? raw.createdBy),
        created_at: toNullableString(raw.created_at ?? raw.createdAt),
        updated_at: toNullableString(raw.updated_at ?? raw.updatedAt),
        panelists,
    }
}

function normalizeEvaluation(raw: unknown): EvaluationItem | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    const evaluatorId = toStringSafe(raw.evaluator_id ?? raw.evaluatorId)

    if (!id || !evaluatorId) return null

    return {
        id,
        evaluator_id: evaluatorId,
        evaluator_name: toNullableString(raw.evaluator_name ?? raw.evaluatorName ?? raw.name),
        status: (toStringSafe(raw.status) ?? "pending") as EvaluationStatus,
        submitted_at: toNullableString(raw.submitted_at ?? raw.submittedAt),
        locked_at: toNullableString(raw.locked_at ?? raw.lockedAt),
        created_at: toNullableString(raw.created_at ?? raw.createdAt),
    }
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

const SCHEDULE_ENDPOINTS = [
    "/api/panelist/defense-schedules",
    "/api/defense-schedules",
]

export default function PanelistDefenseScheduleDetailPage() {
    const params = useParams<{ id: string | string[] }>()
    const scheduleId = React.useMemo(() => {
        const raw = params?.id
        if (Array.isArray(raw)) return raw[0] ?? null
        return typeof raw === "string" && raw.trim().length > 0 ? raw : null
    }, [params])

    const [schedule, setSchedule] = React.useState<DefenseScheduleDetail | null>(null)
    const [evaluations, setEvaluations] = React.useState<EvaluationItem[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [sourceEndpoint, setSourceEndpoint] = React.useState<string | null>(null)

    const loadSchedule = React.useCallback(async () => {
        if (!scheduleId) {
            setLoading(false)
            setError("Missing schedule ID.")
            setSchedule(null)
            setEvaluations([])
            return
        }

        setLoading(true)
        setError(null)

        let foundSchedule: DefenseScheduleDetail | null = null
        let scheduleSource: string | null = null
        let latestScheduleError = "Unable to load schedule details."

        for (const base of SCHEDULE_ENDPOINTS) {
            try {
                const endpoint = `${base}/${encodeURIComponent(scheduleId)}`
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestScheduleError = await readErrorMessage(res, payload)
                    continue
                }

                const itemPayload = isRecord(payload) ? payload.item ?? payload.data ?? payload : payload
                const parsed = normalizeSchedule(itemPayload)

                if (parsed) {
                    foundSchedule = parsed
                    scheduleSource = endpoint
                    break
                }
            } catch (err) {
                latestScheduleError =
                    err instanceof Error ? err.message : "Unable to load schedule details."
            }
        }

        let loadedEvaluations: EvaluationItem[] = []
        let evaluationError: string | null = null

        try {
            const evalRes = await fetch(`/api/evaluations/schedule/${encodeURIComponent(scheduleId)}`, {
                cache: "no-store",
            })
            const evalPayload = (await evalRes.json().catch(() => null)) as unknown

            if (!evalRes.ok) {
                evaluationError = await readErrorMessage(evalRes, evalPayload)
            } else {
                loadedEvaluations = extractArrayPayload(evalPayload)
                    .map(normalizeEvaluation)
                    .filter((item): item is EvaluationItem => item !== null)
            }
        } catch (err) {
            evaluationError =
                err instanceof Error ? err.message : "Unable to load evaluations for this schedule."
        }

        setSchedule(foundSchedule)
        setSourceEndpoint(scheduleSource)
        setEvaluations(loadedEvaluations)

        if (!foundSchedule && loadedEvaluations.length === 0) {
            setError(
                `${latestScheduleError}${evaluationError ? ` Also failed to load evaluations: ${evaluationError}` : ""
                }`,
            )
        } else if (evaluationError) {
            setError(`Schedule loaded, but evaluations could not be loaded: ${evaluationError}`)
        } else {
            setError(null)
        }

        setLoading(false)
    }, [scheduleId])

    React.useEffect(() => {
        void loadSchedule()
    }, [loadSchedule])

    return (
        <DashboardLayout
            title="Defense Schedule Details"
            description="Review schedule information, assigned panelists, and evaluation progress."
        >
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/dashboard/panelist/defense-schedules">Back to Schedules</Link>
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
                        <div className="h-24 animate-pulse rounded-lg border bg-muted/40" />
                        <div className="h-24 animate-pulse rounded-lg border bg-muted/40" />
                        <div className="h-24 animate-pulse rounded-lg border bg-muted/40" />
                    </div>
                ) : !schedule ? (
                    <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                        Schedule details are not available for this ID.
                    </div>
                ) : (
                    <>
                        <div className="rounded-lg border bg-card p-4">
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Schedule ID</p>
                                        <p className="font-semibold">{schedule.id}</p>
                                    </div>

                                    <span
                                        className={[
                                            "inline-flex w-fit rounded-md border px-2 py-1 text-xs font-medium",
                                            statusTone(schedule.status),
                                        ].join(" ")}
                                    >
                                        {toTitleCase(schedule.status)}
                                    </span>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    <div className="rounded-md border p-3">
                                        <p className="text-xs text-muted-foreground">Group / Thesis</p>
                                        <p className="font-medium">
                                            {schedule.group_title ?? schedule.thesis_title ?? "Untitled Group"}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Group ID: {schedule.group_id}</p>
                                    </div>

                                    <div className="rounded-md border p-3">
                                        <p className="text-xs text-muted-foreground">Date & Time</p>
                                        <p className="font-medium">{formatDateTime(schedule.scheduled_at)}</p>
                                    </div>

                                    <div className="rounded-md border p-3">
                                        <p className="text-xs text-muted-foreground">Room</p>
                                        <p className="font-medium">{schedule.room ?? "TBA"}</p>
                                    </div>

                                    <div className="rounded-md border p-3">
                                        <p className="text-xs text-muted-foreground">Rubric Template</p>
                                        <p className="font-medium">{schedule.rubric_template_id ?? "Not assigned"}</p>
                                    </div>

                                    <div className="rounded-md border p-3">
                                        <p className="text-xs text-muted-foreground">Created By</p>
                                        <p className="font-medium">{schedule.created_by ?? "—"}</p>
                                    </div>

                                    <div className="rounded-md border p-3">
                                        <p className="text-xs text-muted-foreground">Last Updated</p>
                                        <p className="font-medium">{formatDateTime(schedule.updated_at)}</p>
                                    </div>
                                </div>

                                {sourceEndpoint ? (
                                    <p className="text-xs text-muted-foreground">Data source: {sourceEndpoint}</p>
                                ) : null}
                            </div>
                        </div>

                        <div className="rounded-lg border bg-card p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-sm font-semibold">Assigned Panelists</h2>
                                <span className="text-xs text-muted-foreground">
                                    {schedule.panelists.length} panelist(s)
                                </span>
                            </div>

                            {schedule.panelists.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No panelists are attached to this schedule.</p>
                            ) : (
                                <div className="overflow-x-auto rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="min-w-44">Panelist ID</TableHead>
                                                <TableHead className="min-w-56">Name</TableHead>
                                                <TableHead className="min-w-64">Email</TableHead>
                                                <TableHead className="min-w-56">Expertise</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {schedule.panelists.map((panelist) => (
                                                <TableRow key={panelist.staff_id}>
                                                    <TableCell className="font-medium">{panelist.staff_id}</TableCell>
                                                    <TableCell>{panelist.name ?? "—"}</TableCell>
                                                    <TableCell>{panelist.email ?? "—"}</TableCell>
                                                    <TableCell>{panelist.expertise ?? "—"}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </div>

                        <div className="rounded-lg border bg-card p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-sm font-semibold">Evaluations</h2>
                                <span className="text-xs text-muted-foreground">
                                    {evaluations.length} evaluation(s)
                                </span>
                            </div>

                            <div className="overflow-x-auto rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="min-w-40">Evaluation ID</TableHead>
                                            <TableHead className="min-w-56">Evaluator</TableHead>
                                            <TableHead className="min-w-32">Status</TableHead>
                                            <TableHead className="min-w-44">Submitted At</TableHead>
                                            <TableHead className="min-w-44">Locked At</TableHead>
                                            <TableHead className="min-w-44">Created At</TableHead>
                                        </TableRow>
                                    </TableHeader>

                                    <TableBody>
                                        {evaluations.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                                    No evaluations found for this schedule.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            evaluations.map((evaluation) => (
                                                <TableRow key={evaluation.id}>
                                                    <TableCell className="font-medium">{evaluation.id}</TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span>{evaluation.evaluator_name ?? "Unknown Evaluator"}</span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {evaluation.evaluator_id}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span
                                                            className={[
                                                                "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                                statusTone(evaluation.status),
                                                            ].join(" ")}
                                                        >
                                                            {toTitleCase(evaluation.status)}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {formatDateTime(evaluation.submitted_at)}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {formatDateTime(evaluation.locked_at)}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {formatDateTime(evaluation.created_at)}
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
