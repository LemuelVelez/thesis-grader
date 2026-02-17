"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

type EvaluationStatus = "pending" | "submitted" | "locked" | (string & {})

type EvaluationItem = {
    id: string
    schedule_id: string
    evaluator_id: string
    status: EvaluationStatus
    submitted_at: string | null
    locked_at: string | null
    created_at: string | null
}

type EvaluationScoreItem = {
    criterion_id: string
    criterion_name: string | null
    score: number | null
    comment: string | null
}

type DefenseScheduleOption = {
    id: string
    group_id: string
    group_title: string | null
    scheduled_at: string | null
    room: string | null
    status: string
}

type UserOption = {
    id: string
    name: string | null
    email: string | null
    role: string
}

type CriterionOption = {
    id: string
    name: string
}

type UserProfile = {
    id: string
    name: string | null
}

const CURRENT_USER_ENDPOINTS = ["/api/users/me", "/api/auth/me", "/api/me"] as const
const USERS_ENDPOINTS = ["/api/users"] as const
const SCHEDULES_ENDPOINTS = ["/api/defense-schedules"] as const
const CRITERIA_ENDPOINTS = [
    "/api/rubric-criteria",
    "/api/criteria",
    "/api/rubric-template-criteria",
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function toStringSafe(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function toNullableString(value: unknown): string | null {
    if (value === null || value === undefined) return null
    return toStringSafe(value)
}

function toNumberOrNull(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
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

function compact(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function statusVariant(status: string): "secondary" | "outline" | "default" | "destructive" {
    const normalized = status.toLowerCase()
    if (normalized === "submitted") return "default"
    if (normalized === "locked") return "destructive"
    if (normalized === "pending") return "secondary"
    return "outline"
}

function normalizeEvaluation(raw: unknown): EvaluationItem | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    if (!id) return null

    const scheduleId = toStringSafe(raw.schedule_id ?? raw.scheduleId)
    const evaluatorId = toStringSafe(raw.evaluator_id ?? raw.evaluatorId)
    if (!scheduleId || !evaluatorId) return null

    return {
        id,
        schedule_id: scheduleId,
        evaluator_id: evaluatorId,
        status: (toStringSafe(raw.status) ?? "pending") as EvaluationStatus,
        submitted_at: toNullableString(raw.submitted_at ?? raw.submittedAt),
        locked_at: toNullableString(raw.locked_at ?? raw.lockedAt),
        created_at: toNullableString(raw.created_at ?? raw.createdAt),
    }
}

function normalizeScore(raw: unknown): EvaluationScoreItem | null {
    if (!isRecord(raw)) return null

    const criterionId = toStringSafe(raw.criterion_id ?? raw.criterionId)
    if (!criterionId) return null

    const criterionName =
        toNullableString(raw.criterion_name ?? raw.criterionName) ??
        toNullableString(raw.criterion ?? raw.name ?? raw.title)

    return {
        criterion_id: criterionId,
        criterion_name: criterionName,
        score: toNumberOrNull(raw.score),
        comment: toNullableString(raw.comment),
    }
}

function normalizeSchedule(raw: unknown): DefenseScheduleOption | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    const groupId = toStringSafe(raw.group_id ?? raw.groupId)
    if (!id || !groupId) return null

    return {
        id,
        group_id: groupId,
        group_title:
            toNullableString(raw.group_title ?? raw.groupTitle) ??
            toNullableString(raw.title ?? raw.group_name ?? raw.groupName),
        scheduled_at: toNullableString(raw.scheduled_at ?? raw.scheduledAt),
        room: toNullableString(raw.room),
        status: toStringSafe(raw.status) ?? "scheduled",
    }
}

function normalizeUser(raw: unknown): UserOption | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    if (!id) return null

    return {
        id,
        name: toNullableString(raw.name),
        email: toNullableString(raw.email),
        role: toStringSafe(raw.role) ?? "panelist",
    }
}

function normalizeCriterion(raw: unknown): CriterionOption | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    if (!id) return null

    const name =
        toStringSafe(raw.criterion ?? raw.name ?? raw.title ?? raw.criterion_name ?? raw.criterionName) ??
        null

    if (!name) return null

    return {
        id,
        name,
    }
}

function extractItemPayload(payload: unknown): unknown | null {
    if (isRecord(payload) && payload.item !== undefined) return payload.item
    if (isRecord(payload) && payload.data !== undefined) return payload.data
    if (isRecord(payload) && isRecord(payload.result) && payload.result.item !== undefined) {
        return payload.result.item
    }
    return isRecord(payload) ? payload : null
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []
    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (isRecord(payload.data) && Array.isArray(payload.data.items)) return payload.data.items
    if (isRecord(payload.result) && Array.isArray(payload.result.items)) return payload.result.items
    return []
}

function extractObjectPayload(payload: unknown): Record<string, unknown> | null {
    if (!isRecord(payload)) return null

    if (isRecord(payload.user)) return payload.user
    if (isRecord(payload.item)) return payload.item

    if (isRecord(payload.data)) {
        if (isRecord(payload.data.user)) return payload.data.user
        return payload.data
    }

    return payload
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

async function fetchFirstSuccessfulObject(endpointList: readonly string[]): Promise<Record<string, unknown> | null> {
    for (const endpoint of endpointList) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            const payload = (await res.json().catch(() => null)) as unknown
            if (!res.ok) continue

            const extracted = extractObjectPayload(payload)
            if (extracted) return extracted
        } catch {
            // try next endpoint
        }
    }

    return null
}

async function fetchFirstSuccessfulArray(endpointList: readonly string[]): Promise<unknown[]> {
    for (const endpoint of endpointList) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            const payload = (await res.json().catch(() => null)) as unknown
            if (!res.ok) continue

            return extractArrayPayload(payload)
        } catch {
            // try next endpoint
        }
    }

    return []
}

async function resolveCurrentUserProfile(): Promise<UserProfile | null> {
    const source = await fetchFirstSuccessfulObject(CURRENT_USER_ENDPOINTS)
    if (!source) return null

    const id = toStringSafe(source.id ?? source.user_id ?? source.userId)
    if (!id) return null

    return {
        id,
        name: toNullableString(source.name),
    }
}

export default function PanelistEvaluationDetailsPage() {
    const params = useParams<{ id: string }>()
    const id = typeof params?.id === "string" ? params.id : ""

    const [item, setItem] = React.useState<EvaluationItem | null>(null)
    const [scores, setScores] = React.useState<EvaluationScoreItem[]>([])
    const [schedules, setSchedules] = React.useState<DefenseScheduleOption[]>([])
    const [users, setUsers] = React.useState<UserOption[]>([])
    const [criteria, setCriteria] = React.useState<CriterionOption[]>([])
    const [currentUser, setCurrentUser] = React.useState<UserProfile | null>(null)

    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [actionLoading, setActionLoading] = React.useState<"submit" | "lock" | null>(null)

    const [notes, setNotes] = React.useState("")

    const loadDetails = React.useCallback(
        async (options?: { showSuccessToast?: boolean; showErrorToast?: boolean }) => {
            const { showSuccessToast = false, showErrorToast = true } = options ?? {}

            if (!id) return
            setLoading(true)
            setError(null)

            try {
                const [itemRes, scoreRes, me, scheduleRows, userRows, criteriaRows] = await Promise.all([
                    fetch(`/api/evaluations/${id}`, { cache: "no-store" }),
                    fetch(`/api/evaluation-scores?evaluation_id=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(
                        () => null,
                    ),
                    resolveCurrentUserProfile(),
                    fetchFirstSuccessfulArray(SCHEDULES_ENDPOINTS),
                    fetchFirstSuccessfulArray(USERS_ENDPOINTS),
                    fetchFirstSuccessfulArray(CRITERIA_ENDPOINTS),
                ])

                const itemPayload = (await itemRes.json().catch(() => null)) as unknown
                if (!itemRes.ok) {
                    const msg = await readErrorMessage(itemRes, itemPayload)
                    setError(msg)
                    setItem(null)
                    setScores([])
                    setSchedules([])
                    setUsers([])
                    setCriteria([])
                    setCurrentUser(me)
                    return
                }

                const parsedItem = normalizeEvaluation(extractItemPayload(itemPayload))
                if (!parsedItem) {
                    const msg = "Evaluation response is invalid."
                    setError(msg)
                    setItem(null)
                    setScores([])
                    setSchedules([])
                    setUsers([])
                    setCriteria([])
                    setCurrentUser(me)
                    if (showErrorToast) {
                        toast.error("Unable to load evaluation", { description: msg })
                    }
                    return
                }

                setItem(parsedItem)
                setCurrentUser(me)

                if (scoreRes) {
                    const scorePayload = (await scoreRes.json().catch(() => null)) as unknown
                    if (scoreRes.ok) {
                        const parsedScores = extractArrayPayload(scorePayload)
                            .map(normalizeScore)
                            .filter((s): s is EvaluationScoreItem => s !== null)
                        setScores(parsedScores)
                    } else {
                        setScores([])
                    }
                } else {
                    setScores([])
                }

                setSchedules(
                    scheduleRows
                        .map(normalizeSchedule)
                        .filter((schedule): schedule is DefenseScheduleOption => schedule !== null),
                )

                setUsers(userRows.map(normalizeUser).filter((user): user is UserOption => user !== null))

                setCriteria(
                    criteriaRows
                        .map(normalizeCriterion)
                        .filter((criterion): criterion is CriterionOption => criterion !== null),
                )

                if (showSuccessToast) {
                    toast.success("Evaluation details refreshed")
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unable to load evaluation."
                setError(message)
                setItem(null)
                setScores([])
                setSchedules([])
                setUsers([])
                setCriteria([])

                if (showErrorToast) {
                    toast.error("Unable to load evaluation", { description: message })
                }
            } finally {
                setLoading(false)
            }
        },
        [id],
    )

    React.useEffect(() => {
        void loadDetails({ showErrorToast: false })
    }, [loadDetails])

    const scheduleById = React.useMemo(() => {
        const map = new Map<string, DefenseScheduleOption>()
        for (const schedule of schedules) {
            map.set(schedule.id.toLowerCase(), schedule)
        }
        return map
    }, [schedules])

    const userById = React.useMemo(() => {
        const map = new Map<string, UserOption>()
        for (const user of users) {
            map.set(user.id.toLowerCase(), user)
        }
        return map
    }, [users])

    const criterionById = React.useMemo(() => {
        const map = new Map<string, string>()
        for (const criterion of criteria) {
            map.set(criterion.id.toLowerCase(), criterion.name)
        }
        return map
    }, [criteria])

    const schedule = React.useMemo(() => {
        if (!item) return null
        return scheduleById.get(item.schedule_id.toLowerCase()) ?? null
    }, [item, scheduleById])

    const evaluator = React.useMemo(() => {
        if (!item) return null
        return userById.get(item.evaluator_id.toLowerCase()) ?? null
    }, [item, userById])

    const scheduleName = React.useMemo(
        () => compact(schedule?.group_title) ?? "Defense Schedule",
        [schedule?.group_title],
    )

    const scheduleMeta = React.useMemo(() => {
        const date = formatDateTime(schedule?.scheduled_at ?? null)
        const room = compact(schedule?.room)
        const status = compact(schedule?.status) ? toTitleCase(schedule!.status) : null
        const metaParts = [date, room, status].filter((part): part is string => !!part)
        return metaParts.length > 0 ? metaParts.join(" • ") : "—"
    }, [schedule])

    const evaluatorName = React.useMemo(() => {
        if (!item) return "Assigned Panelist"

        const direct = compact(evaluator?.name) ?? compact(evaluator?.email)
        if (direct) return direct

        const isCurrent =
            currentUser && currentUser.id.toLowerCase() === item.evaluator_id.toLowerCase()
        if (isCurrent) {
            return compact(currentUser?.name) ?? "Assigned Panelist"
        }

        return "Assigned Panelist"
    }, [currentUser, evaluator?.email, evaluator?.name, item])

    const evaluatorRole = React.useMemo(() => {
        if (!evaluator?.role) return "Panelist"
        return toTitleCase(evaluator.role)
    }, [evaluator?.role])

    const resolveCriterionName = React.useCallback(
        (score: EvaluationScoreItem, index: number) => {
            const inline = compact(score.criterion_name)
            if (inline) return inline

            const fromCriteria = criterionById.get(score.criterion_id.toLowerCase())
            if (fromCriteria) return fromCriteria

            return `Criterion ${index + 1}`
        },
        [criterionById],
    )

    const patchStatus = React.useCallback(
        async (mode: "submit" | "lock") => {
            if (!id) return
            setActionLoading(mode)
            setError(null)

            try {
                const endpoint = mode === "submit" ? `/api/evaluations/${id}/submit` : `/api/evaluations/${id}/lock`
                const res = await fetch(endpoint, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    const msg = await readErrorMessage(res, payload)
                    setError(msg)
                    toast.error("Unable to update evaluation", { description: msg })
                    return
                }

                toast.success(mode === "submit" ? "Evaluation submitted" : "Evaluation locked")
                await loadDetails({ showErrorToast: false })
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unable to update evaluation."
                setError(message)
                toast.error("Unable to update evaluation", { description: message })
            } finally {
                setActionLoading(null)
            }
        },
        [id, loadDetails],
    )

    return (
        <DashboardLayout
            title="Evaluation Details"
            description="Review criteria-based scores for the assigned thesis group and student evaluations."
        >
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/dashboard/panelist/evaluations">Back to Evaluations</Link>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void loadDetails({ showSuccessToast: true })}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                </div>

                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>Action failed</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                {loading ? (
                    <Card>
                        <CardContent className="pt-6">
                            <div className="h-24 animate-pulse rounded-md bg-muted/50" />
                        </CardContent>
                    </Card>
                ) : !item ? (
                    <Alert>
                        <AlertTitle>Evaluation not found</AlertTitle>
                        <AlertDescription>We couldn't locate this evaluation record.</AlertDescription>
                    </Alert>
                ) : (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex flex-wrap items-center gap-2">
                                    <span>Evaluation for {scheduleName}</span>
                                    <Badge variant={statusVariant(item.status)}>
                                        {toTitleCase(item.status)}
                                    </Badge>
                                </CardTitle>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    <Card>
                                        <CardContent className="pt-4">
                                            <p className="text-xs text-muted-foreground">Thesis Group Schedule</p>
                                            <p className="font-medium">{scheduleName}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">{scheduleMeta}</p>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardContent className="pt-4">
                                            <p className="text-xs text-muted-foreground">Assigned Evaluator</p>
                                            <p className="font-medium">{evaluatorName}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">{evaluatorRole}</p>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardContent className="pt-4">
                                            <p className="text-xs text-muted-foreground">Created</p>
                                            <p className="font-medium">{formatDateTime(item.created_at)}</p>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardContent className="pt-4">
                                            <p className="text-xs text-muted-foreground">Submitted</p>
                                            <p className="font-medium">{formatDateTime(item.submitted_at)}</p>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardContent className="pt-4">
                                            <p className="text-xs text-muted-foreground">Locked</p>
                                            <p className="font-medium">{formatDateTime(item.locked_at)}</p>
                                        </CardContent>
                                    </Card>
                                </div>

                                <Separator />

                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        onClick={() => void patchStatus("submit")}
                                        disabled={actionLoading !== null || item.status.toLowerCase() !== "pending"}
                                    >
                                        {actionLoading === "submit" ? "Submitting..." : "Submit Evaluation"}
                                    </Button>

                                    <Button
                                        variant="destructive"
                                        onClick={() => void patchStatus("lock")}
                                        disabled={actionLoading !== null || item.status.toLowerCase() === "locked"}
                                    >
                                        {actionLoading === "lock" ? "Locking..." : "Lock Evaluation"}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Criteria Notes</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Use this field for draft notes while reviewing (not persisted)."
                                    className="min-h-28"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Local note helper only. This is not submitted to the API.
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Evaluation Scores</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {scores.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        No score rows found for this evaluation.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {scores.map((score, index) => (
                                            <Card key={`${score.criterion_id}-${index}`}>
                                                <CardContent className="pt-4">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div>
                                                            <p className="text-xs text-muted-foreground">
                                                                Criterion
                                                            </p>
                                                            <p className="font-medium">
                                                                {resolveCriterionName(score, index)}
                                                            </p>
                                                        </div>

                                                        <Badge variant="outline">
                                                            Score: {score.score ?? "—"}
                                                        </Badge>
                                                    </div>

                                                    {score.comment ? (
                                                        <p className="mt-3 text-sm text-muted-foreground">
                                                            {score.comment}
                                                        </p>
                                                    ) : null}
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </DashboardLayout>
    )
}
