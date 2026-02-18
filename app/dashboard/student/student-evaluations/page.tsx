"use client"

import * as React from "react"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"

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

type RatingScale = {
    min: number
    max: number
    minLabel?: string
    maxLabel?: string
}

type NormalizedQuestion = {
    id: string
    type: "rating" | "text" | "unknown"
    label: string
    required: boolean
    placeholder?: string
    maxLength?: number
    scale?: RatingScale
}

type NormalizedSection = {
    id: string
    title: string
    questions: NormalizedQuestion[]
}

type NormalizedSchema = {
    title: string
    description?: string
    sections: NormalizedSection[]
}

const STATUS_FILTERS = ["all", "pending", "submitted", "locked"] as const

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
                // Count question-like nodes (including rating/text/etc). Keep broad but safe.
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

/* ------------------------------ FORM NORMALIZER ----------------------------- */

function safeString(value: unknown): string {
    return typeof value === "string" ? value : ""
}

function toInt(value: unknown, fallback: number) {
    const n = typeof value === "number" ? value : Number(value)
    return Number.isFinite(n) ? Math.floor(n) : fallback
}

function normalizeStudentFeedbackSchema(raw: Record<string, unknown> | null): NormalizedSchema | null {
    if (!raw) return null

    const title = safeString(raw.title ?? raw.name ?? raw.label) || "Student Feedback"
    const description = safeString(raw.description) || ""

    const normalizeQuestion = (q: unknown): NormalizedQuestion | null => {
        if (!isRecord(q)) return null
        const id = safeString(q.id ?? q.key ?? q.name ?? q.field ?? q.questionId).trim()
        const label = safeString(q.label ?? q.title ?? q.question).trim()
        if (!id || !label) return null

        const typeRaw = safeString(q.type).toLowerCase()
        const type: NormalizedQuestion["type"] =
            typeRaw === "rating" ? "rating" : typeRaw === "text" ? "text" : "unknown"

        const required = q.required === true

        const placeholder = safeString(q.placeholder).trim()
        const maxLength = isRecord(q) ? (typeof q.maxLength === "number" ? q.maxLength : undefined) : undefined

        let scale: RatingScale | undefined
        if (type === "rating") {
            const sc = isRecord(q.scale) ? q.scale : null
            const min = toInt(sc?.min, 1)
            const max = toInt(sc?.max, 5)
            const minLabel = safeString(sc?.minLabel).trim() || undefined
            const maxLabel = safeString(sc?.maxLabel).trim() || undefined
            const nMin = Math.min(min, max)
            const nMax = Math.max(min, max)
            scale = { min: nMin, max: nMax, minLabel, maxLabel }
        }

        const out: NormalizedQuestion = {
            id,
            type,
            label,
            required,
        }
        if (placeholder) out.placeholder = placeholder
        if (typeof maxLength === "number" && Number.isFinite(maxLength)) out.maxLength = maxLength
        if (scale) out.scale = scale

        return out
    }

    const normalizeSection = (s: unknown, idx: number): NormalizedSection | null => {
        if (!isRecord(s)) return null
        const id = safeString(s.id) || `section_${idx + 1}`
        const sTitle = safeString(s.title).trim() || `Section ${idx + 1}`
        const questionsRaw = Array.isArray(s.questions) ? s.questions : Array.isArray(s.fields) ? s.fields : []
        const questions = questionsRaw.map(normalizeQuestion).filter((x): x is NormalizedQuestion => x !== null)
        if (questions.length === 0) return null
        return { id, title: sTitle, questions }
    }

    // Primary: sections[] shape (matches admin builder)
    const sectionsRaw = Array.isArray(raw.sections) ? raw.sections : null
    if (sectionsRaw && sectionsRaw.length > 0) {
        const sections = sectionsRaw
            .map((s, i) => normalizeSection(s, i))
            .filter((x): x is NormalizedSection => x !== null)

        if (sections.length > 0) {
            const out: NormalizedSchema = { title, sections }
            if (description) out.description = description
            return out
        }
    }

    // Secondary: questions[] / fields[] at top-level
    const topQuestionsRaw = Array.isArray(raw.questions) ? raw.questions : Array.isArray(raw.fields) ? raw.fields : null
    if (topQuestionsRaw && topQuestionsRaw.length > 0) {
        const questions = topQuestionsRaw.map(normalizeQuestion).filter((x): x is NormalizedQuestion => x !== null)
        if (questions.length > 0) {
            const out: NormalizedSchema = {
                title,
                sections: [{ id: "main", title: "Feedback", questions }],
            }
            if (description) out.description = description
            return out
        }
    }

    return null
}

function stringifyAnswer(value: unknown): string {
    if (value === null || value === undefined) return "—"
    if (typeof value === "string") return value.trim().length > 0 ? value : "—"
    if (typeof value === "number" || typeof value === "boolean") return String(value)
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

function shallowCloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

function AnswerPill({
    required,
    answered,
}: {
    required: boolean
    answered: boolean
}) {
    if (!required) {
        return <Badge variant="secondary">Optional</Badge>
    }
    return answered ? (
        <Badge className="bg-emerald-600 text-white">Answered</Badge>
    ) : (
        <Badge className="bg-destructive text-white">Required</Badge>
    )
}

export default function StudentEvaluationsPage() {
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

    const normalizedSchema = React.useMemo(() => normalizeStudentFeedbackSchema(schema), [schema])

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
                        const ta = (a.updated_at ?? a.created_at) ? new Date(a.updated_at ?? a.created_at!).getTime() : 0
                        const tb = (b.updated_at ?? b.created_at) ? new Date(b.updated_at ?? b.created_at!).getTime() : 0
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

    /* ------------------------------ DIALOG STATE ------------------------------ */

    const [dialogOpen, setDialogOpen] = React.useState(false)
    const [dialogMode, setDialogMode] = React.useState<"answer" | "preview">("answer")
    const [activeItemId, setActiveItemId] = React.useState<string | null>(null)

    const activeItem = React.useMemo(
        () => (activeItemId ? evaluations.find((x) => x.id === activeItemId) ?? null : null),
        [activeItemId, evaluations],
    )

    const [draftAnswers, setDraftAnswers] = React.useState<Record<string, unknown>>({})
    const baselineRef = React.useRef<string>("{}")

    React.useEffect(() => {
        const base = activeItem?.answers ?? {}
        const cloned = shallowCloneJson(base)
        setDraftAnswers(cloned)
        baselineRef.current = JSON.stringify(cloned ?? {})
    }, [activeItem?.id]) // eslint-disable-line react-hooks/exhaustive-deps

    const isLockedLike = React.useMemo(() => {
        const s = (activeItem?.status ?? "").toLowerCase()
        return s === "locked"
    }, [activeItem?.status])

    const isSubmittedLike = React.useMemo(() => {
        const s = (activeItem?.status ?? "").toLowerCase()
        return s === "submitted" || s === "locked"
    }, [activeItem?.status])

    const dirty = React.useMemo(() => {
        try {
            return JSON.stringify(draftAnswers ?? {}) !== baselineRef.current
        } catch {
            return true
        }
    }, [draftAnswers])

    const openAnswerDialog = React.useCallback((id: string) => {
        setActiveItemId(id)
        setDialogMode("answer")
        setDialogOpen(true)
    }, [])

    const openPreviewDialog = React.useCallback((id: string) => {
        setActiveItemId(id)
        setDialogMode("preview")
        setDialogOpen(true)
    }, [])

    const updateAnswer = React.useCallback((key: string, value: unknown) => {
        setDraftAnswers((prev) => ({ ...(prev ?? {}), [key]: value }))
    }, [])

    const [saving, setSaving] = React.useState(false)
    const [submitting, setSubmitting] = React.useState(false)

    const patchFirstOk = React.useCallback(
        async (endpoints: string[], body: Record<string, unknown>) => {
            let latestError = "Request failed."

            for (const endpoint of endpoints) {
                try {
                    const res = await fetch(endpoint, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                    })
                    const payload = (await res.json().catch(() => null)) as unknown
                    if (!res.ok) {
                        latestError = await readErrorMessage(res, payload)
                        continue
                    }
                    return { ok: true as const, payload }
                } catch (err) {
                    latestError = err instanceof Error ? err.message : latestError
                }
            }

            return { ok: false as const, error: latestError }
        },
        [],
    )

    const postFirstOk = React.useCallback(
        async (endpoints: string[], body?: Record<string, unknown>) => {
            let latestError = "Request failed."

            for (const endpoint of endpoints) {
                try {
                    const res = await fetch(endpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: body ? JSON.stringify(body) : undefined,
                    })
                    const payload = (await res.json().catch(() => null)) as unknown
                    if (!res.ok) {
                        latestError = await readErrorMessage(res, payload)
                        continue
                    }
                    return { ok: true as const, payload }
                } catch (err) {
                    latestError = err instanceof Error ? err.message : latestError
                }
            }

            return { ok: false as const, error: latestError }
        },
        [],
    )

    const applyLocalUpdate = React.useCallback((id: string, patch: Partial<StudentEvaluationItem>) => {
        setEvaluations((prev) =>
            prev.map((it) => (it.id === id ? { ...it, ...patch, updated_at: new Date().toISOString() } : it)),
        )
    }, [])

    const onSaveDraft = React.useCallback(async () => {
        if (!activeItem) return
        if (isLockedLike) {
            toast.error("This feedback is locked.")
            return
        }
        if (!dirty) {
            toast.message("No changes to save.")
            return
        }

        setSaving(true)
        try {
            const id = activeItem.id
            const candidates = [
                `/api/student-evaluations/${id}`,
                `/api/student-evaluations/${id}/answers`,
                `/api/student-evaluations/${id}/draft`,
                `/api/student-evaluations/${id}/response`,
            ]

            const res = await patchFirstOk(candidates, { answers: draftAnswers })
            if (!res.ok) throw new Error(res.error)

            applyLocalUpdate(id, { answers: shallowCloneJson(draftAnswers) })
            baselineRef.current = JSON.stringify(draftAnswers ?? {})
            toast.success("Draft saved.")
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to save draft."
            toast.error(msg)
        } finally {
            setSaving(false)
        }
    }, [activeItem, applyLocalUpdate, dirty, draftAnswers, isLockedLike, patchFirstOk])

    const onSubmit = React.useCallback(async () => {
        if (!activeItem) return
        if (isLockedLike) {
            toast.error("This feedback is locked.")
            return
        }

        // Validate required fields (best-effort based on schema)
        const completion = computeCompletion(draftAnswers)
        if (completion.required > 0 && completion.answered < completion.required) {
            toast.error("Please answer all required items before submitting.")
            return
        }

        setSubmitting(true)
        try {
            const id = activeItem.id

            // First try a dedicated submit endpoint; otherwise fallback to PATCH status.
            const submitCandidates = [
                `/api/student-evaluations/${id}/submit`,
                `/api/student-evaluations/${id}/finalize`,
                `/api/student-evaluations/${id}/lock`,
            ]

            const postRes = await postFirstOk(submitCandidates, { answers: draftAnswers })
            if (!postRes.ok) {
                const patchRes = await patchFirstOk(
                    [
                        `/api/student-evaluations/${id}`,
                        `/api/student-evaluations/${id}/submit`,
                        `/api/student-evaluations/${id}/status`,
                    ],
                    { answers: draftAnswers, status: "submitted" },
                )
                if (!patchRes.ok) throw new Error(patchRes.error)
            }

            applyLocalUpdate(id, {
                answers: shallowCloneJson(draftAnswers),
                status: "submitted",
                submitted_at: new Date().toISOString(),
            })
            baselineRef.current = JSON.stringify(draftAnswers ?? {})
            toast.success("Submitted successfully.")
            setDialogMode("preview")
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to submit feedback."
            toast.error(msg)
        } finally {
            setSubmitting(false)
        }
    }, [activeItem, applyLocalUpdate, computeCompletion, draftAnswers, isLockedLike, patchFirstOk, postFirstOk])

    /* ------------------------------ RENDER HELPERS ------------------------------ */

    const dialogCompletion = React.useMemo(
        () => computeCompletion(draftAnswers),
        [computeCompletion, draftAnswers],
    )

    const dialogScore = React.useMemo(
        () => computeScoreSummary(draftAnswers, ratingQuestions),
        [draftAnswers, ratingQuestions],
    )

    const dialogScorePct = Math.max(0, Math.min(100, dialogScore.percentage))
    const dialogCompletionPct = Math.max(0, Math.min(100, dialogCompletion.percent))

    const dialogTitle = React.useMemo(() => {
        const primaryTitle = activeItem?.title ?? activeItem?.group_title ?? "Student Feedback"
        return primaryTitle
    }, [activeItem?.group_title, activeItem?.title])

    const canEditDialog = dialogMode === "answer" && !isLockedLike && !isSubmittedLike

    const renderFormBody = () => {
        if (!normalizedSchema) {
            return (
                <div className="rounded-lg border bg-muted/10 p-4">
                    <p className="text-sm font-semibold">Form schema is not available</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Once an active feedback form is published, it will appear here automatically.
                    </p>
                </div>
            )
        }

        return (
            <div className="space-y-4">
                {normalizedSchema.sections.map((section, sIdx) => (
                    <div key={section.id} className="rounded-lg border bg-card">
                        <div className="space-y-1 border-b p-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">{sIdx + 1}</Badge>
                                <p className="text-sm font-semibold">{section.title}</p>
                                <Badge variant="outline">{section.questions.length} item(s)</Badge>
                            </div>
                        </div>

                        <div className="space-y-4 p-4">
                            {section.questions.map((q, qIdx) => {
                                const current = (draftAnswers ?? {})[q.id]
                                const answered = !isMissingAnswer(current)

                                const isRating = q.type === "rating"
                                const scale = q.scale ?? { min: 1, max: 5, minLabel: "Low", maxLabel: "High" }
                                const options = isRating ? Array.from({ length: Math.max(0, scale.max - scale.min + 1) }, (_, i) => scale.min + i) : []

                                return (
                                    <div key={q.id} className="rounded-lg border bg-background p-4">
                                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                            <div className="min-w-0 space-y-1">
                                                <p className="text-sm font-medium">
                                                    {sIdx + 1}.{qIdx + 1} {q.label}
                                                </p>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Badge variant="outline" className="capitalize">
                                                        {q.type}
                                                    </Badge>
                                                    <Badge variant="secondary" className="font-mono">
                                                        {q.id}
                                                    </Badge>
                                                    <AnswerPill required={q.required} answered={answered} />
                                                </div>
                                            </div>

                                            {isRating ? (
                                                <Badge variant="secondary">
                                                    Scale {scale.min}–{scale.max}
                                                </Badge>
                                            ) : null}
                                        </div>

                                        <Separator className="my-3" />

                                        {isRating ? (
                                            <div className="space-y-3">
                                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                                    <span>{scale.minLabel ?? "Low"}</span>
                                                    <span>{scale.maxLabel ?? "High"}</span>
                                                </div>

                                                <RadioGroup
                                                    value={toFiniteNumber(current)?.toString() ?? ""}
                                                    onValueChange={(v: any) => updateAnswer(q.id, Number(v))}
                                                    className="grid gap-2 sm:grid-cols-5"
                                                    disabled={!canEditDialog}
                                                >
                                                    {options.map((n) => (
                                                        <div
                                                            key={`${q.id}-${n}`}
                                                            className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <RadioGroupItem value={String(n)} id={`${q.id}-${n}`} />
                                                                <Label htmlFor={`${q.id}-${n}`} className="text-sm font-medium">
                                                                    {n}
                                                                </Label>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </RadioGroup>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <Label className="text-xs text-muted-foreground">Your answer</Label>
                                                <Textarea
                                                    value={typeof current === "string" ? current : (current === null || current === undefined ? "" : String(current))}
                                                    onChange={(e) => updateAnswer(q.id, e.target.value)}
                                                    placeholder={q.placeholder ?? "Type your answer..."}
                                                    className="min-h-24"
                                                    disabled={!canEditDialog}
                                                />
                                                {typeof q.maxLength === "number" ? (
                                                    <p className="text-xs text-muted-foreground">
                                                        Max {q.maxLength} characters
                                                    </p>
                                                ) : null}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    const renderPreviewBody = () => {
        const previewAnswers = activeItem?.answers ?? draftAnswers ?? {}
        const score = computeScoreSummary(previewAnswers, ratingQuestions)
        const scorePct = Math.max(0, Math.min(100, score.percentage))
        const completion = computeCompletion(previewAnswers)
        const completionPct = Math.max(0, Math.min(100, completion.percent))

        return (
            <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border bg-card p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="space-y-1">
                                <p className="text-sm font-semibold">Completion</p>
                                <p className="text-xs text-muted-foreground">
                                    {completion.required > 0
                                        ? `${completion.answered}/${completion.required} required answered`
                                        : "Required items not defined in schema"}
                                </p>
                            </div>
                            <Badge variant="secondary">{Math.round(completionPct)}%</Badge>
                        </div>
                        <div className="mt-3 h-2 w-full rounded-full bg-muted">
                            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round(completionPct)}%` }} />
                        </div>
                    </div>

                    <div className="rounded-lg border bg-card p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="space-y-1">
                                <p className="text-sm font-semibold">Rating score</p>
                                <p className="text-xs text-muted-foreground">
                                    {score.max_score > 0 ? `${score.total_score}/${score.max_score} total` : "No rating questions"}
                                </p>
                            </div>
                            <Badge variant="secondary">{score.max_score > 0 ? `${Math.round(scorePct)}%` : "—"}</Badge>
                        </div>
                        <div className="mt-3 h-2 w-full rounded-full bg-muted">
                            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round(scorePct)}%` }} />
                        </div>
                    </div>
                </div>

                <Tabs defaultValue="answers">
                    <TabsList className="flex w-full flex-wrap justify-start gap-2">
                        <TabsTrigger value="answers">Answers</TabsTrigger>
                        <TabsTrigger value="raw">Raw JSON</TabsTrigger>
                    </TabsList>

                    <TabsContent value="answers" className="mt-4 space-y-3">
                        {normalizedSchema ? (
                            normalizedSchema.sections.map((section, sIdx) => (
                                <div key={section.id} className="rounded-lg border bg-card">
                                    <div className="flex flex-wrap items-center gap-2 border-b p-4">
                                        <Badge variant="secondary">{sIdx + 1}</Badge>
                                        <p className="text-sm font-semibold">{section.title}</p>
                                    </div>

                                    <div className="space-y-3 p-4">
                                        {section.questions.map((q, qIdx) => {
                                            const value = (previewAnswers ?? {})[q.id]
                                            const answered = !isMissingAnswer(value)

                                            return (
                                                <div key={q.id} className="rounded-lg border bg-background p-4">
                                                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                                        <div className="min-w-0 space-y-1">
                                                            <p className="text-sm font-medium">
                                                                {sIdx + 1}.{qIdx + 1} {q.label}
                                                            </p>
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <Badge variant="outline" className="capitalize">
                                                                    {q.type}
                                                                </Badge>
                                                                <Badge variant="secondary" className="font-mono">
                                                                    {q.id}
                                                                </Badge>
                                                                <AnswerPill required={q.required} answered={answered} />
                                                            </div>
                                                        </div>

                                                        {q.type === "rating" ? (
                                                            <Badge variant="secondary">
                                                                {answered ? `Selected: ${stringifyAnswer(value)}` : "No rating"}
                                                            </Badge>
                                                        ) : null}
                                                    </div>

                                                    <Separator className="my-3" />

                                                    <div className="whitespace-pre-wrap rounded-md border bg-muted/10 p-3 text-sm">
                                                        {stringifyAnswer(value)}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="rounded-lg border bg-muted/10 p-4">
                                <p className="text-sm font-semibold">Preview</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Showing saved answers even without a structured schema.
                                </p>
                                <div className="mt-3 whitespace-pre-wrap rounded-md border bg-background p-3 text-xs">
                                    {stringifyAnswer(previewAnswers)}
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="raw" className="mt-4">
                        <div className="rounded-lg border bg-card p-4">
                            <p className="text-sm font-semibold">Answers JSON</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Useful for troubleshooting or exporting.
                            </p>
                            <div className="mt-3 max-h-105 overflow-auto whitespace-pre rounded-md border bg-background p-3 text-xs">
                                {JSON.stringify(previewAnswers ?? {}, null, 2)}
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        )
    }

    return (
        <DashboardLayout
            title="Student Feedback"
            description="Complete your active feedback form and view scoring insights from rating questions to help improve the defense experience."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="space-y-1">
                                <p className="text-sm font-semibold">{schemaTitle}</p>
                                <p className="text-xs text-muted-foreground">
                                    {schemaQuestionCount > 0 ? (
                                        <>
                                            {schemaQuestionCount} question(s) •{" "}
                                            {requiredKeys.length} required •{" "}
                                            {ratingQuestions.length} rating item(s)
                                        </>
                                    ) : (
                                        <>
                                            Active form schema will appear here once available.
                                        </>
                                    )}
                                </p>
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <Input
                                    placeholder="Search by thesis/group, room, program, term, status, or score"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full md:max-w-xl"
                                />

                                <Button
                                    variant="outline"
                                    onClick={() => void loadAll({ toastOnDone: true })}
                                    disabled={loading || refreshing}
                                >
                                    Refresh
                                </Button>
                            </div>
                        </div>

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
                            <p>
                                Scores update from rating items in the active form (non-rating questions don’t affect the score).
                            </p>
                        </div>
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
                                <TableHead className="min-w-72">Thesis / Group</TableHead>
                                <TableHead className="min-w-64">Defense Schedule</TableHead>
                                <TableHead className="min-w-32">Status</TableHead>
                                <TableHead className="min-w-56">Completion</TableHead>
                                <TableHead className="min-w-56">Score</TableHead>
                                <TableHead className="min-w-40">Action</TableHead>
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
                                    const canAnswer = s === "pending"
                                    const canPreview = s === "submitted" || s === "locked"

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
                                                        "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                        statusTone(item.status),
                                                    ].join(" ")}
                                                >
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
                                                    {canAnswer ? (
                                                        <Button size="sm" onClick={() => openAnswerDialog(item.id)}>
                                                            Answer
                                                        </Button>
                                                    ) : null}

                                                    {canPreview ? (
                                                        <Button size="sm" variant="outline" onClick={() => openPreviewDialog(item.id)}>
                                                            Preview
                                                        </Button>
                                                    ) : null}

                                                    {!canAnswer && !canPreview ? (
                                                        <Button size="sm" variant="outline" onClick={() => openPreviewDialog(item.id)}>
                                                            View
                                                        </Button>
                                                    ) : null}
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
                    <div className="rounded-lg border bg-card p-4">
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                                <p className="text-sm font-semibold">Tip</p>
                                <p className="text-xs text-muted-foreground">
                                    Use <span className="font-semibold text-foreground">Answer</span> to fill out your feedback in-place.
                                    You can save a draft anytime before submitting.
                                </p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-semibold">About scoring</p>
                                <p className="text-xs text-muted-foreground">
                                    The score preview is computed from rating questions in the active form. Text/choice answers won’t change the score.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : null}

                <Dialog
                    open={dialogOpen}
                    onOpenChange={(open) => {
                        setDialogOpen(open)
                        if (!open) {
                            setActiveItemId(null)
                            setSaving(false)
                            setSubmitting(false)
                        }
                    }}
                >
                    <DialogContent className="max-w-4xl">
                        <DialogHeader>
                            <DialogTitle className="flex flex-wrap items-center gap-2">
                                <span className="min-w-0 truncate">{dialogTitle}</span>
                                {activeItem ? (
                                    <span
                                        className={[
                                            "inline-flex shrink-0 rounded-md border px-2 py-1 text-xs font-medium",
                                            statusTone(activeItem.status),
                                        ].join(" ")}
                                    >
                                        {toTitleCase(activeItem.status)}
                                    </span>
                                ) : null}
                                {dialogMode === "answer" && dirty ? (
                                    <Badge className="bg-destructive text-white">Unsaved</Badge>
                                ) : null}
                            </DialogTitle>
                            <DialogDescription>
                                {activeItem ? (
                                    <>
                                        {activeItem.program ? `${activeItem.program} • ` : ""}
                                        {activeItem.term ? `${activeItem.term} • ` : ""}
                                        {formatScheduleSummary(activeItem)}
                                    </>
                                ) : (
                                    "Open a feedback form to continue."
                                )}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 lg:grid-cols-12">
                            <div className="space-y-3 lg:col-span-4">
                                <div className="rounded-lg border bg-card p-4">
                                    <div className="space-y-2">
                                        <p className="text-sm font-semibold">
                                            {dialogMode === "answer" ? "Live progress" : "Summary"}
                                        </p>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">Completion</span>
                                                <span className="font-semibold">
                                                    {dialogCompletion.required > 0
                                                        ? `${dialogCompletion.answered}/${dialogCompletion.required}`
                                                        : "—"}
                                                </span>
                                            </div>
                                            <div className="h-2 w-full rounded-full bg-muted">
                                                <div
                                                    className="h-2 rounded-full bg-primary"
                                                    style={{ width: `${Math.round(dialogCompletionPct)}%` }}
                                                />
                                            </div>
                                        </div>

                                        <Separator />

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">Rating score</span>
                                                <span className="font-semibold">
                                                    {dialogScore.max_score > 0 ? `${Math.round(dialogScorePct)}%` : "—"}
                                                </span>
                                            </div>
                                            <div className="h-2 w-full rounded-full bg-muted">
                                                <div
                                                    className="h-2 rounded-full bg-primary"
                                                    style={{ width: `${Math.round(dialogScorePct)}%` }}
                                                />
                                            </div>
                                            {dialogScore.max_score > 0 ? (
                                                <p className="text-xs text-muted-foreground">
                                                    {dialogScore.total_score}/{dialogScore.max_score} total from {dialogScore.rating_questions} rating item(s)
                                                </p>
                                            ) : (
                                                <p className="text-xs text-muted-foreground">
                                                    No rating questions detected in the active schema.
                                                </p>
                                            )}
                                        </div>

                                        {dialogMode === "answer" && dialogCompletion.required > 0 && dialogCompletion.missing.length > 0 ? (
                                            <>
                                                <Separator />
                                                <div className="space-y-2">
                                                    <p className="text-xs font-medium text-muted-foreground">Missing required</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {dialogCompletion.missing.slice(0, 8).map((k) => (
                                                            <Badge key={k} variant="secondary" className="font-mono">
                                                                {k}
                                                            </Badge>
                                                        ))}
                                                        {dialogCompletion.missing.length > 8 ? (
                                                            <Badge variant="secondary">+{dialogCompletion.missing.length - 8} more</Badge>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="rounded-lg border bg-card p-4">
                                    <p className="text-sm font-semibold">Actions</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {dialogMode === "answer"
                                            ? "Save draft anytime, then submit when ready."
                                            : "Preview your submitted answers and computed score."}
                                    </p>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Button
                                            variant={dialogMode === "answer" ? "default" : "outline"}
                                            onClick={() => setDialogMode("answer")}
                                            disabled={!activeItem || isSubmittedLike}
                                        >
                                            Answer
                                        </Button>

                                        <Button
                                            variant={dialogMode === "preview" ? "default" : "outline"}
                                            onClick={() => setDialogMode("preview")}
                                            disabled={!activeItem}
                                        >
                                            Preview
                                        </Button>
                                    </div>

                                    {activeItem && isSubmittedLike ? (
                                        <div className="mt-3 rounded-md border bg-muted/10 p-3 text-xs text-muted-foreground">
                                            Submitted: {formatDateTime(activeItem.submitted_at)}{" "}
                                            {activeItem.locked_at ? `• Locked: ${formatDateTime(activeItem.locked_at)}` : ""}
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <div className="lg:col-span-8">
                                <ScrollArea className="h-[70vh] rounded-lg border bg-card">
                                    <div className="p-4">
                                        {dialogMode === "answer" ? renderFormBody() : renderPreviewBody()}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>

                        <DialogFooter className="gap-2 sm:gap-0">
                            <DialogClose asChild>
                                <Button variant="outline" className="mx-2">
                                    Close
                                </Button>
                            </DialogClose>

                            {dialogMode === "answer" ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => void onSaveDraft()}
                                        disabled={!activeItem || saving || submitting || isLockedLike || isSubmittedLike}
                                    >
                                        {saving ? "Saving…" : "Save draft"}
                                    </Button>

                                    <Button
                                        onClick={() => void onSubmit()}
                                        disabled={!activeItem || submitting || saving || isLockedLike || isSubmittedLike}
                                    >
                                        {submitting ? "Submitting…" : "Submit"}
                                    </Button>
                                </div>
                            ) : null}
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </DashboardLayout>
    )
}
