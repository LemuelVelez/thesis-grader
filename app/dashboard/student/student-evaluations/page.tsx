"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { toast } from "sonner"
import {
    ArrowRight,
    RefreshCw,
    Search,
    ClipboardList,
    CheckCircle2,
    Lock,
    Clock3,
} from "lucide-react"

type StudentEvaluationItem = {
    id: string
    status: string
    title: string | null
    group_title: string | null
    scheduled_at: string | null
    room: string | null
    program: string | null
    term: string | null
    created_at: string | null
    updated_at: string | null
    submitted_at: string | null
    locked_at: string | null
    answers: Record<string, unknown> | null
}

type StatusFilter = "all" | "pending" | "submitted" | "locked"

type RatingQuestion = {
    id: string
    label: string | null
    min: number
    max: number
}

type ScoreSummary = {
    total_score: number
    max_score: number
    percentage: number
    rating_questions: number
}

const STATUS_FILTERS = ["all", "pending", "submitted", "locked"] as const

const BTN_CURSOR = "cursor-pointer"

// Keep student evaluation flows separate — do NOT fall back to /api/evaluations here.
const EVALUATION_ENDPOINT_CANDIDATES = [
    "/api/student-evaluations/my",
    "/api/student-evaluations/me",
    "/api/student-evaluations",
]

const SCHEMA_ENDPOINT_CANDIDATES = [
    "/api/student-evaluations/schema",
    "/api/student-evaluations/form/schema",
    "/api/student-evaluations/active-form",
    "/api/students/me/student-evaluations/schema",
    "/api/students/current/student-evaluations/schema",
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

function statusTone(status: string): string {
    const normalized = status.trim().toLowerCase()

    if (normalized === "submitted") {
        return "border-blue-600/40 bg-blue-600/10 text-foreground"
    }

    if (normalized === "locked") {
        return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
    }

    if (normalized === "pending") {
        return "border-amber-600/40 bg-amber-600/10 text-foreground"
    }

    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

function toJsonObject(value: unknown): Record<string, unknown> | null {
    if (isRecord(value)) return value
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown
            if (isRecord(parsed)) return parsed
        } catch {
            // ignore
        }
    }
    return null
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload.evaluations)) return payload.evaluations
    if (Array.isArray(payload.student_evaluations)) return payload.student_evaluations

    if (isRecord(payload.data)) {
        if (Array.isArray(payload.data.items)) return payload.data.items
        if (Array.isArray(payload.data.evaluations)) return payload.data.evaluations
        if (Array.isArray(payload.data.student_evaluations)) return payload.data.student_evaluations
    }

    if (isRecord(payload.result)) {
        if (Array.isArray(payload.result.items)) return payload.result.items
        if (Array.isArray(payload.result.evaluations)) return payload.result.evaluations
        if (Array.isArray(payload.result.student_evaluations)) return payload.result.student_evaluations
    }

    return []
}

function normalizeEvaluation(raw: unknown): StudentEvaluationItem | null {
    if (!isRecord(raw)) return null

    const source =
        (isRecord(raw.student_evaluation) && raw.student_evaluation) ||
        (isRecord(raw.evaluation) && raw.evaluation) ||
        raw

    const schedule = isRecord(source.schedule) ? source.schedule : null
    const group = isRecord(source.group) ? source.group : null

    const id = toStringSafe(source.id ?? raw.id)
    if (!id) return null

    return {
        id,
        status: toStringSafe(source.status ?? raw.status) ?? "pending",
        title:
            toNullableString(
                source.title ??
                source.topic ??
                source.thesis_title ??
                source.thesisTitle ??
                group?.title ??
                schedule?.title,
            ) ?? null,
        group_title: toNullableString(source.group_title ?? source.groupTitle ?? group?.title),
        scheduled_at: toNullableString(source.scheduled_at ?? source.scheduledAt ?? schedule?.scheduled_at),
        room: toNullableString(source.room ?? schedule?.room),
        program: toNullableString(source.program ?? group?.program),
        term: toNullableString(source.term ?? group?.term),
        created_at: toNullableString(source.created_at ?? source.createdAt ?? raw.created_at),
        updated_at: toNullableString(source.updated_at ?? source.updatedAt ?? raw.updated_at),
        submitted_at: toNullableString(source.submitted_at ?? source.submittedAt ?? raw.submitted_at),
        locked_at: toNullableString(source.locked_at ?? source.lockedAt ?? raw.locked_at),
        answers: toJsonObject(source.answers ?? raw.answers),
    }
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

async function fetchFirstOk<T>(
    endpoints: string[],
    init?: RequestInit,
): Promise<{ ok: true; payload: T } | { ok: false; error: string }> {
    let latestError = "Request failed."

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, init)
            const payload = (await res.json().catch(() => null)) as unknown

            if (!res.ok) {
                latestError = await readErrorMessage(res, payload)
                continue
            }

            return { ok: true, payload: payload as T }
        } catch (err) {
            latestError = err instanceof Error ? err.message : latestError
        }
    }

    return { ok: false, error: latestError }
}

function formatScheduleSummary(item: StudentEvaluationItem): string {
    const when = formatDateTime(item.scheduled_at)
    const room = item.room ? ` • ${item.room}` : ""
    return `${when}${room}`
}

function isMissingAnswer(value: unknown): boolean {
    if (value === undefined || value === null) return true
    if (typeof value === "string") return value.trim().length === 0
    if (Array.isArray(value)) return value.length === 0
    if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0
    return false
}

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const t = value.trim()
        if (!t) return null
        const n = Number(t)
        return Number.isFinite(n) ? n : null
    }
    return null
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n))
}

function pickQuestionId(raw: Record<string, unknown>): string | null {
    return (
        toStringSafe(raw.id) ||
        toStringSafe(raw.key) ||
        toStringSafe(raw.name) ||
        toStringSafe(raw.field) ||
        toStringSafe(raw.questionId) ||
        null
    )
}

function collectRequiredKeys(schema: unknown): string[] {
    const keys = new Set<string>()

    const walk = (node: unknown) => {
        if (node === null || node === undefined) return

        if (Array.isArray(node)) {
            for (const it of node) walk(it)
            return
        }

        if (!isRecord(node)) return

        if (Array.isArray(node.required)) {
            for (const k of node.required) {
                if (typeof k === "string" && k.trim()) keys.add(k.trim())
            }
        }

        const candidates: unknown[] = []
        if (Array.isArray(node.questions)) candidates.push(...node.questions)
        if (Array.isArray(node.fields)) candidates.push(...node.fields)

        for (const it of candidates) {
            if (!isRecord(it)) continue
            if (it.required !== true) continue
            const id = pickQuestionId(it)
            if (id) keys.add(id)
        }

        for (const v of Object.values(node)) walk(v)
    }

    walk(schema)
    return Array.from(keys)
}

function collectRatingQuestions(schema: unknown): RatingQuestion[] {
    const out: RatingQuestion[] = []
    const seen = new Set<string>()

    const walk = (node: unknown) => {
        if (node === null || node === undefined) return

        if (Array.isArray(node)) {
            for (const it of node) walk(it)
            return
        }

        if (!isRecord(node)) return

        const type = toStringSafe(node.type)?.toLowerCase() ?? null
        if (type === "rating") {
            const id = pickQuestionId(node)
            if (id) {
                const key = id.trim().toLowerCase()
                if (!seen.has(key)) {
                    seen.add(key)

                    const label =
                        toNullableString(node.label ?? node.title ?? node.question) ?? null

                    const scaleObj = isRecord(node.scale) ? node.scale : null
                    const min = toFiniteNumber(scaleObj?.min) ?? 1
                    const max = toFiniteNumber(scaleObj?.max) ?? 5
                    const normalizedMin = Math.min(min, max)
                    const normalizedMax = Math.max(min, max)

                    out.push({
                        id,
                        label,
                        min: normalizedMin,
                        max: normalizedMax,
                    })
                }
            }
        }

        for (const v of Object.values(node)) walk(v)
    }

    walk(schema)
    return out
}

function computeScoreSummary(
    answers: Record<string, unknown> | null,
    ratingQuestions: RatingQuestion[],
): ScoreSummary {
    if (!answers || ratingQuestions.length === 0) {
        return { total_score: 0, max_score: 0, percentage: 0, rating_questions: 0 }
    }

    let total = 0
    let maxTotal = 0

    for (const q of ratingQuestions) {
        maxTotal += q.max
        const n = toFiniteNumber(answers[q.id])
        const scored = n === null ? 0 : clamp(n, q.min, q.max)
        total += scored
    }

    const percentage = maxTotal > 0 ? (total / maxTotal) * 100 : 0

    return {
        total_score: total,
        max_score: maxTotal,
        percentage,
        rating_questions: ratingQuestions.length,
    }
}

function extractSchemaObject(payload: unknown): Record<string, unknown> | null {
    if (!payload) return null
    if (isRecord(payload)) {
        const candidate = (payload.schema as unknown) ?? payload.item ?? payload.data ?? payload.result ?? payload
        return isRecord(candidate) ? (candidate as Record<string, unknown>) : isRecord(payload) ? (payload as Record<string, unknown>) : null
    }
    return null
}

function getSchemaTitle(schema: Record<string, unknown> | null): string {
    if (!schema) return "Active feedback form"
    return (
        toStringSafe(schema.title) ||
        toStringSafe(schema.name) ||
        toStringSafe(schema.label) ||
        "Active feedback form"
    )
}

function countQuestions(schema: Record<string, unknown> | null): number {
    if (!schema) return 0
    const seen = new Set<string>()
    let count = 0

    const walk = (node: unknown) => {
        if (node === null || node === undefined) return
        if (Array.isArray(node)) {
            for (const it of node) walk(it)
            return
        }
        if (!isRecord(node)) return

        const maybeType = toStringSafe(node.type)?.toLowerCase() ?? null
        const maybeId = pickQuestionId(node)
        if (maybeId) {
            const k = maybeId.trim().toLowerCase()
            if (!seen.has(k)) {
                if (maybeType || node.label || node.title || node.question) {
                    seen.add(k)
                    count += 1
                }
            }
        }

        for (const v of Object.values(node)) walk(v)
    }

    walk(schema)
    return count
}

function iconForStatus(status: string) {
    const s = status.trim().toLowerCase()
    if (s === "locked") return <Lock className="h-4 w-4" />
    if (s === "submitted") return <CheckCircle2 className="h-4 w-4" />
    if (s === "pending") return <Clock3 className="h-4 w-4" />
    return <ClipboardList className="h-4 w-4" />
}

export default function StudentEvaluationsPage() {
    const router = useRouter()

    const [evaluations, setEvaluations] = React.useState<StudentEvaluationItem[]>([])
    const [schema, setSchema] = React.useState<Record<string, unknown> | null>(null)

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")

    const requiredKeys = React.useMemo(() => collectRequiredKeys(schema), [schema])
    const ratingQuestions = React.useMemo(() => collectRatingQuestions(schema), [schema])

    const schemaTitle = React.useMemo(() => getSchemaTitle(schema), [schema])
    const schemaQuestionCount = React.useMemo(() => countQuestions(schema), [schema])

    const computeCompletion = React.useCallback(
        (answers: Record<string, unknown> | null) => {
            const uniqueReq = Array.from(new Set(requiredKeys))
            if (uniqueReq.length === 0) return { required: 0, answered: 0, percent: 0, missing: [] as string[] }

            const missing: string[] = []
            const answered = uniqueReq.reduce((acc, k) => {
                const v = answers ? answers[k] : undefined
                const ok = !isMissingAnswer(v)
                if (!ok) missing.push(k)
                return acc + (ok ? 1 : 0)
            }, 0)

            const percent = uniqueReq.length > 0 ? (answered / uniqueReq.length) * 100 : 0
            return { required: uniqueReq.length, answered, percent, missing }
        },
        [requiredKeys],
    )

    const loadEvaluations = React.useCallback(async () => {
        let latestError = "We couldn’t load your feedback forms."
        let loaded = false

        for (const endpoint of EVALUATION_ENDPOINT_CANDIDATES) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const parsed = extractArrayPayload(payload)
                    .map(normalizeEvaluation)
                    .filter((item): item is StudentEvaluationItem => item !== null)
                    .sort((a, b) => {
                        const ta = (a.updated_at ?? a.created_at)
                            ? new Date(a.updated_at ?? a.created_at!).getTime()
                            : 0
                        const tb = (b.updated_at ?? b.created_at)
                            ? new Date(b.updated_at ?? b.created_at!).getTime()
                            : 0
                        return tb - ta
                    })

                setEvaluations(parsed)
                loaded = true
                break
            } catch (err) {
                latestError = err instanceof Error ? err.message : latestError
            }
        }

        if (!loaded) {
            setEvaluations([])
            throw new Error(latestError)
        }
    }, [])

    const loadSchema = React.useCallback(async () => {
        const res = await fetchFirstOk<unknown>(SCHEMA_ENDPOINT_CANDIDATES, { cache: "no-store" })
        if (!res.ok) {
            setSchema(null)
            throw new Error(res.error)
        }

        const parsed = extractSchemaObject(res.payload)
        setSchema(parsed)
    }, [])

    const loadAll = React.useCallback(
        async (opts?: { toastOnDone?: boolean }) => {
            const showToast = !!opts?.toastOnDone

            setRefreshing(showToast)
            setLoading((prev) => (showToast ? prev : true))
            setError(null)

            try {
                await Promise.all([loadSchema(), loadEvaluations()])
                if (showToast) toast.success("Feedback workspace refreshed.")
            } catch (err) {
                const msg = err instanceof Error ? err.message : "We couldn’t load your feedback workspace."
                setError(msg)
                if (showToast) toast.error(msg)
            } finally {
                setLoading(false)
                setRefreshing(false)
            }
        },
        [loadEvaluations, loadSchema],
    )

    React.useEffect(() => {
        void loadAll()
    }, [loadAll])

    const filtered = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return evaluations.filter((item) => {
            const s = item.status.toLowerCase()
            if (statusFilter !== "all" && s !== statusFilter) return false
            if (!q) return true

            const score = computeScoreSummary(item.answers, ratingQuestions)
            const scoreLabel = score.max_score > 0 ? `${Math.round(score.percentage)}%` : ""

            return (
                (item.title ?? "").toLowerCase().includes(q) ||
                (item.group_title ?? "").toLowerCase().includes(q) ||
                (item.room ?? "").toLowerCase().includes(q) ||
                (item.program ?? "").toLowerCase().includes(q) ||
                (item.term ?? "").toLowerCase().includes(q) ||
                s.includes(q) ||
                scoreLabel.toLowerCase().includes(q)
            )
        })
    }, [evaluations, search, statusFilter, ratingQuestions])

    const totals = React.useMemo(() => {
        let pending = 0
        let submitted = 0
        let locked = 0

        for (const item of evaluations) {
            const status = item.status.toLowerCase()
            if (status === "pending") pending += 1
            else if (status === "submitted") submitted += 1
            else if (status === "locked") locked += 1
        }

        return { total: evaluations.length, pending, submitted, locked }
    }, [evaluations])

    const statusCounts = React.useMemo(() => {
        return {
            all: totals.total,
            pending: totals.pending,
            submitted: totals.submitted,
            locked: totals.locked,
        } satisfies Record<StatusFilter, number>
    }, [totals])

    const openEvaluation = React.useCallback(
        (id: string) => {
            router.push(`/dashboard/student/student-evaluations/${id}`)
        },
        [router],
    )

    return (
        <DashboardLayout
            title="Student Feedback"
            description="Complete your active feedback form and review your progress and rating score insights."
        >
            <div className="space-y-4">
                <Card>
                    <CardHeader className="space-y-2">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-1">
                                <CardTitle className="text-base">{schemaTitle}</CardTitle>
                                <CardDescription>
                                    {schemaQuestionCount > 0 ? (
                                        <>
                                            {schemaQuestionCount} question(s) • {requiredKeys.length} required •{" "}
                                            {ratingQuestions.length} rating item(s)
                                        </>
                                    ) : (
                                        <>Active form schema will appear here once available.</>
                                    )}
                                </CardDescription>
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <div className="relative w-full md:w-96">
                                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by thesis/group, room, program, term, status, or score"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>

                                <Button
                                    variant="outline"
                                    onClick={() => void loadAll({ toastOnDone: true })}
                                    disabled={loading || refreshing}
                                    className={["gap-2", BTN_CURSOR].join(" ")}
                                >
                                    <RefreshCw className={["h-4 w-4", refreshing ? "animate-spin" : ""].join(" ")} />
                                    Refresh
                                </Button>
                            </div>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by status</p>
                            <div className="flex flex-wrap gap-2">
                                {STATUS_FILTERS.map((status) => {
                                    const active = statusFilter === status
                                    const count = statusCounts[status]
                                    return (
                                        <Button
                                            key={status}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setStatusFilter(status)}
                                            className={BTN_CURSOR}
                                        >
                                            {status === "all" ? "All" : toTitleCase(status)}
                                            <span className="ml-2 rounded-md border bg-background px-1.5 py-0.5 text-[11px] font-semibold">
                                                {count}
                                            </span>
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-3">
                        {error ? (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                                {error}
                            </div>
                        ) : null}

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Total</p>
                                <p className="text-lg font-semibold">{totals.total}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Pending</p>
                                <p className="text-lg font-semibold">{totals.pending}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Submitted</p>
                                <p className="text-lg font-semibold">{totals.submitted}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Locked</p>
                                <p className="text-lg font-semibold">{totals.locked}</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <p>
                                Showing{" "}
                                <span className="font-semibold text-foreground">{filtered.length}</span> of{" "}
                                <span className="font-semibold text-foreground">{evaluations.length}</span> feedback form(s).
                            </p>
                            <p>Scores update from rating items in the active form (non-rating answers don’t affect the score).</p>
                        </div>
                    </CardContent>
                </Card>

                <div className="overflow-x-auto rounded-lg border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-72">Thesis / Group</TableHead>
                                <TableHead className="min-w-64">Defense Schedule</TableHead>
                                <TableHead className="min-w-32">Status</TableHead>
                                <TableHead className="min-w-56">Completion</TableHead>
                                <TableHead className="min-w-56">Score</TableHead>
                                <TableHead className="min-w-44">Action</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <TableRow key={`student-feedback-skeleton-${i}`}>
                                        <TableCell colSpan={6}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                        No feedback forms found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filtered.map((item) => {
                                    const completion = computeCompletion(item.answers)
                                    const completionPct = Math.max(0, Math.min(100, completion.percent))

                                    const score = computeScoreSummary(item.answers, ratingQuestions)
                                    const scorePct = Math.max(0, Math.min(100, score.percentage))
                                    const scoreLabel = score.max_score > 0 ? `${Math.round(scorePct)}%` : "—"

                                    const primaryTitle = item.title ?? item.group_title ?? "Untitled feedback form"
                                    const s = item.status.toLowerCase()
                                    const primaryActionLabel = s === "pending" ? "Continue" : "Open"

                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-medium">{primaryTitle}</span>
                                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                        {item.program ? <span>{item.program}</span> : null}
                                                        {item.term ? <span>• {item.term}</span> : null}
                                                    </div>
                                                </div>
                                            </TableCell>

                                            <TableCell className="text-muted-foreground">
                                                {formatScheduleSummary(item)}
                                            </TableCell>

                                            <TableCell>
                                                <span
                                                    className={[
                                                        "inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium",
                                                        statusTone(item.status),
                                                    ].join(" ")}
                                                >
                                                    {iconForStatus(item.status)}
                                                    {toTitleCase(item.status)}
                                                </span>
                                            </TableCell>

                                            <TableCell>
                                                {completion.required === 0 ? (
                                                    <div className="text-xs text-muted-foreground">—</div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="text-muted-foreground">Required</span>
                                                            <span className="font-semibold">
                                                                {completion.answered}/{completion.required}
                                                            </span>
                                                        </div>
                                                        <div className="h-2 w-full rounded-full bg-muted">
                                                            <div
                                                                className="h-2 rounded-full bg-primary"
                                                                style={{ width: `${Math.round(completionPct)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </TableCell>

                                            <TableCell>
                                                {score.max_score === 0 ? (
                                                    <div className="text-xs text-muted-foreground">—</div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="text-muted-foreground">Rating score</span>
                                                            <span className="font-semibold">{scoreLabel}</span>
                                                        </div>
                                                        <div className="h-2 w-full rounded-full bg-muted">
                                                            <div
                                                                className="h-2 rounded-full bg-primary"
                                                                style={{ width: `${Math.round(scorePct)}%` }}
                                                            />
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {score.total_score}/{score.max_score} total
                                                        </div>
                                                    </div>
                                                )}
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        onClick={() => openEvaluation(item.id)}
                                                        className={["gap-2", BTN_CURSOR].join(" ")}
                                                    >
                                                        {primaryActionLabel}
                                                        <ArrowRight className="h-4 w-4" />
                                                    </Button>

                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className={BTN_CURSOR}
                                                        onClick={() => {
                                                            navigator.clipboard
                                                                .writeText(item.id)
                                                                .then(() => toast.success("Copied evaluation ID."))
                                                                .catch(() => toast.error("Failed to copy."))
                                                        }}
                                                    >
                                                        Copy ID
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

                {!loading ? (
                    <Card>
                        <CardHeader className="space-y-1">
                            <CardTitle className="text-base">Tips</CardTitle>
                            <CardDescription>
                                Open a feedback form to save a draft anytime, then submit when you’re ready.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-sm font-semibold">Drafts</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Use <span className="font-semibold text-foreground">Save draft</span> to avoid losing progress.
                                </p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-sm font-semibold">Scoring</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Only rating questions affect the score; text answers won’t change it.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ) : null}
            </div>
        </DashboardLayout>
    )
}
