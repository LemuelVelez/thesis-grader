"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { ArrowLeft, RefreshCw, CheckCircle2, Lock, Clock3, ClipboardList } from "lucide-react"

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

// Keep student evaluation flows separate — do NOT fall back to /api/evaluations here.
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

function iconForStatus(status: string) {
    const s = status.trim().toLowerCase()
    if (s === "locked") return <Lock className="h-4 w-4" />
    if (s === "submitted") return <CheckCircle2 className="h-4 w-4" />
    if (s === "pending") return <Clock3 className="h-4 w-4" />
    return <ClipboardList className="h-4 w-4" />
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

function extractSchemaObject(payload: unknown): Record<string, unknown> | null {
    if (!payload) return null
    if (isRecord(payload)) {
        const candidate = (payload.schema as unknown) ?? payload.item ?? payload.data ?? payload.result ?? payload
        return isRecord(candidate)
            ? (candidate as Record<string, unknown>)
            : isRecord(payload)
                ? (payload as Record<string, unknown>)
                : null
    }
    return null
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

                    const label = toNullableString(node.label ?? node.title ?? node.question) ?? null

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

function computeScoreSummary(answers: Record<string, unknown> | null, ratingQuestions: RatingQuestion[]): ScoreSummary {
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
        const maxLength = typeof (q as any).maxLength === "number" ? (q as any).maxLength : undefined

        let scale: RatingScale | undefined
        if (type === "rating") {
            const sc = isRecord((q as any).scale) ? ((q as any).scale as Record<string, unknown>) : null
            const min = toInt(sc?.min, 1)
            const max = toInt(sc?.max, 5)
            const minLabel = safeString(sc?.minLabel).trim() || undefined
            const maxLabel = safeString(sc?.maxLabel).trim() || undefined
            const nMin = Math.min(min, max)
            const nMax = Math.max(min, max)
            scale = { min: nMin, max: nMax, minLabel, maxLabel }
        }

        const out: NormalizedQuestion = { id, type, label, required }
        if (placeholder) out.placeholder = placeholder
        if (typeof maxLength === "number" && Number.isFinite(maxLength)) out.maxLength = maxLength
        if (scale) out.scale = scale

        return out
    }

    const normalizeSection = (s: unknown, idx: number): NormalizedSection | null => {
        if (!isRecord(s)) return null
        const id = safeString(s.id) || `section_${idx + 1}`
        const sTitle = safeString(s.title).trim() || `Section ${idx + 1}`

        const questionsRaw = Array.isArray((s as any).questions)
            ? (s as any).questions
            : Array.isArray((s as any).fields)
                ? (s as any).fields
                : []

        const questions = (questionsRaw as unknown[])
            .map(normalizeQuestion)
            .filter((x: NormalizedQuestion | null): x is NormalizedQuestion => x !== null)

        if (questions.length === 0) return null
        return { id, title: sTitle, questions }
    }

    const sectionsRaw = Array.isArray(raw.sections) ? raw.sections : null
    if (sectionsRaw && sectionsRaw.length > 0) {
        const sections = sectionsRaw
            .map((s, i) => normalizeSection(s, i))
            .filter((x: NormalizedSection | null): x is NormalizedSection => x !== null)

        if (sections.length > 0) {
            const out: NormalizedSchema = { title, sections }
            if (description) out.description = description
            return out
        }
    }

    const topQuestionsRaw = Array.isArray(raw.questions) ? raw.questions : Array.isArray(raw.fields) ? raw.fields : null
    if (topQuestionsRaw && topQuestionsRaw.length > 0) {
        const questions = (topQuestionsRaw as unknown[])
            .map(normalizeQuestion)
            .filter((x: NormalizedQuestion | null): x is NormalizedQuestion => x !== null)

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

function AnswerPill({ required, answered }: { required: boolean; answered: boolean }) {
    if (!required) {
        return <Badge variant="secondary">Optional</Badge>
    }
    return answered ? <Badge className="bg-emerald-600 text-white">Answered</Badge> : <Badge className="bg-destructive text-white">Required</Badge>
}

export default function StudentEvaluationDetailPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()

    const evaluationId = typeof params?.id === "string" ? params.id : ""

    const [item, setItem] = React.useState<StudentEvaluationItem | null>(null)
    const [schema, setSchema] = React.useState<Record<string, unknown> | null>(null)

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const ratingQuestions = React.useMemo(() => collectRatingQuestions(schema), [schema])
    const requiredKeys = React.useMemo(() => collectRequiredKeys(schema), [schema])
    const normalizedSchema = React.useMemo(() => normalizeStudentFeedbackSchema(schema), [schema])

    const [mode, setMode] = React.useState<"answer" | "preview">("answer")

    const [draftAnswers, setDraftAnswers] = React.useState<Record<string, unknown>>({})
    const baselineRef = React.useRef<string>("{}")

    const status = (item?.status ?? "pending").toLowerCase()
    const isLockedLike = status === "locked"
    const isSubmittedLike = status === "submitted" || status === "locked"

    const dirty = React.useMemo(() => {
        try {
            return JSON.stringify(draftAnswers ?? {}) !== baselineRef.current
        } catch {
            return true
        }
    }, [draftAnswers])

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

    const completion = React.useMemo(() => computeCompletion(draftAnswers), [computeCompletion, draftAnswers])
    const completionPct = Math.max(0, Math.min(100, completion.percent))

    const score = React.useMemo(() => computeScoreSummary(draftAnswers, ratingQuestions), [draftAnswers, ratingQuestions])
    const scorePct = Math.max(0, Math.min(100, score.percentage))

    const title = item?.title ?? item?.group_title ?? "Student Feedback"
    const scheduleLabel = React.useMemo(() => {
        if (!item) return "—"
        const when = formatDateTime(item.scheduled_at)
        const room = item.room ? ` • ${item.room}` : ""
        return `${when}${room}`
    }, [item])

    const canEdit = mode === "answer" && !isLockedLike && !isSubmittedLike

    const updateAnswer = React.useCallback((key: string, value: unknown) => {
        setDraftAnswers((prev) => ({ ...(prev ?? {}), [key]: value }))
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

    const loadItem = React.useCallback(async () => {
        if (!evaluationId) throw new Error("Invalid evaluation id.")

        const detailCandidates = [
            `/api/student-evaluations/${evaluationId}`,
            `/api/student-evaluations/${evaluationId}/me`,
            `/api/student-evaluations/${evaluationId}/item`,
            `/api/student-evaluations/${evaluationId}/detail`,
        ]

        const res = await fetchFirstOk<unknown>(detailCandidates, { cache: "no-store" })
        if (!res.ok) {
            setItem(null)
            throw new Error(res.error)
        }

        const normalized = normalizeEvaluation((res.payload as any)?.item ?? (res.payload as any)?.data ?? (res.payload as any)?.result ?? res.payload)

        if (!normalized) {
            setItem(null)
            throw new Error("We couldn’t read this feedback form.")
        }

        setItem(normalized)

        const base = normalized.answers ?? {}
        const cloned = shallowCloneJson(base)
        setDraftAnswers(cloned)
        baselineRef.current = JSON.stringify(cloned ?? {})

        const s = (normalized.status ?? "pending").toLowerCase()
        setMode(s === "pending" ? "answer" : "preview")
    }, [evaluationId])

    const loadAll = React.useCallback(
        async (opts?: { toastOnDone?: boolean }) => {
            const showToast = !!opts?.toastOnDone

            setRefreshing(showToast)
            setLoading((prev) => (showToast ? prev : true))
            setError(null)

            try {
                await Promise.all([loadSchema(), loadItem()])
                if (showToast) toast.success("Feedback form refreshed.")
            } catch (err) {
                const msg = err instanceof Error ? err.message : "We couldn’t load this feedback form."
                setError(msg)
                if (showToast) toast.error(msg)
            } finally {
                setLoading(false)
                setRefreshing(false)
            }
        },
        [loadItem, loadSchema],
    )

    React.useEffect(() => {
        void loadAll()
    }, [loadAll])

    const patchFirstOk = React.useCallback(async (endpoints: string[], body: Record<string, unknown>) => {
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
    }, [])

    const postFirstOk = React.useCallback(async (endpoints: string[], body?: Record<string, unknown>) => {
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
    }, [])

    const [saving, setSaving] = React.useState(false)
    const [submitting, setSubmitting] = React.useState(false)

    const applyLocalUpdate = React.useCallback((patch: Partial<StudentEvaluationItem>) => {
        setItem((prev) => {
            if (!prev) return prev
            return { ...prev, ...patch, updated_at: new Date().toISOString() }
        })
    }, [])

    const onSaveDraft = React.useCallback(async () => {
        if (!item) return
        if (isLockedLike) {
            toast.error("This feedback is locked.")
            return
        }
        if (isSubmittedLike) {
            toast.error("This feedback is already submitted.")
            return
        }
        if (!dirty) {
            toast.message("No changes to save.")
            return
        }

        setSaving(true)
        try {
            const id = item.id
            const candidates = [
                `/api/student-evaluations/${id}`,
                `/api/student-evaluations/${id}/answers`,
                `/api/student-evaluations/${id}/draft`,
                `/api/student-evaluations/${id}/response`,
            ]

            const res = await patchFirstOk(candidates, { answers: draftAnswers })
            if (!res.ok) throw new Error(res.error)

            applyLocalUpdate({ answers: shallowCloneJson(draftAnswers) })
            baselineRef.current = JSON.stringify(draftAnswers ?? {})
            toast.success("Draft saved.")
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to save draft."
            toast.error(msg)
        } finally {
            setSaving(false)
        }
    }, [applyLocalUpdate, dirty, draftAnswers, isLockedLike, isSubmittedLike, item, patchFirstOk])

    const onSubmit = React.useCallback(async () => {
        if (!item) return
        if (isLockedLike) {
            toast.error("This feedback is locked.")
            return
        }
        if (isSubmittedLike) {
            toast.error("This feedback is already submitted.")
            return
        }

        const comp = computeCompletion(draftAnswers)
        if (comp.required > 0 && comp.answered < comp.required) {
            toast.error("Please answer all required items before submitting.")
            return
        }

        setSubmitting(true)
        try {
            const id = item.id

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

            applyLocalUpdate({
                answers: shallowCloneJson(draftAnswers),
                status: "submitted",
                submitted_at: new Date().toISOString(),
            })
            baselineRef.current = JSON.stringify(draftAnswers ?? {})
            toast.success("Submitted successfully.")
            setMode("preview")
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to submit feedback."
            toast.error(msg)
        } finally {
            setSubmitting(false)
        }
    }, [applyLocalUpdate, computeCompletion, draftAnswers, isLockedLike, isSubmittedLike, item, patchFirstOk, postFirstOk])

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
                                const options = isRating
                                    ? Array.from({ length: Math.max(0, scale.max - scale.min + 1) }, (_, i) => scale.min + i)
                                    : []

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
                                                    onValueChange={(v) => updateAnswer(q.id, Number(v))}
                                                    disabled={!canEdit}
                                                    className="flex flex-wrap gap-2"
                                                >
                                                    {options.map((n) => (
                                                        <Label
                                                            key={`${q.id}-${n}`}
                                                            htmlFor={`${q.id}-${n}`}
                                                            className={[
                                                                "flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium",
                                                                !canEdit ? "cursor-not-allowed opacity-70" : "",
                                                            ].join(" ")}
                                                        >
                                                            <RadioGroupItem value={String(n)} id={`${q.id}-${n}`} />
                                                            {n}
                                                        </Label>
                                                    ))}
                                                </RadioGroup>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <Label className="text-xs text-muted-foreground">Your answer</Label>
                                                <Textarea
                                                    value={
                                                        typeof current === "string"
                                                            ? current
                                                            : current === null || current === undefined
                                                                ? ""
                                                                : String(current)
                                                    }
                                                    onChange={(e) => updateAnswer(q.id, e.target.value)}
                                                    placeholder={q.placeholder ?? "Type your answer..."}
                                                    className="min-h-24"
                                                    disabled={!canEdit}
                                                />
                                                {typeof q.maxLength === "number" ? (
                                                    <p className="text-xs text-muted-foreground">Max {q.maxLength} characters</p>
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
        const previewAnswers = item?.answers ?? draftAnswers ?? {}
        const previewScore = computeScoreSummary(previewAnswers, ratingQuestions)
        const previewScorePct = Math.max(0, Math.min(100, previewScore.percentage))
        const previewCompletion = computeCompletion(previewAnswers)
        const previewCompletionPct = Math.max(0, Math.min(100, previewCompletion.percent))

        return (
            <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border bg-card p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="space-y-1">
                                <p className="text-sm font-semibold">Completion</p>
                                <p className="text-xs text-muted-foreground">
                                    {previewCompletion.required > 0
                                        ? `${previewCompletion.answered}/${previewCompletion.required} required answered`
                                        : "Required items not defined in schema"}
                                </p>
                            </div>
                            <Badge variant="secondary">{Math.round(previewCompletionPct)}%</Badge>
                        </div>
                        <div className="mt-3 h-2 w-full rounded-full bg-muted">
                            <div
                                className="h-2 rounded-full bg-primary"
                                style={{ width: `${Math.round(previewCompletionPct)}%` }}
                            />
                        </div>
                    </div>

                    <div className="rounded-lg border bg-card p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="space-y-1">
                                <p className="text-sm font-semibold">Rating score</p>
                                <p className="text-xs text-muted-foreground">
                                    {previewScore.max_score > 0 ? `${previewScore.total_score}/${previewScore.max_score} total` : "No rating questions"}
                                </p>
                            </div>
                            <Badge variant="secondary">
                                {previewScore.max_score > 0 ? `${Math.round(previewScorePct)}%` : "—"}
                            </Badge>
                        </div>
                        <div className="mt-3 h-2 w-full rounded-full bg-muted">
                            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round(previewScorePct)}%` }} />
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
                            <p className="mt-1 text-xs text-muted-foreground">Useful for troubleshooting or exporting.</p>
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
        <DashboardLayout title="Student Feedback" description="Open a feedback form, save your draft, and submit when ready.">
            <div className="space-y-4">
                <Card>
                    <CardHeader className="space-y-2">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => router.push("/dashboard/student/student-evaluations")}
                                        className="gap-2"
                                    >
                                        <ArrowLeft className="h-4 w-4" />
                                        Back
                                    </Button>

                                    {item ? (
                                        <span
                                            className={[
                                                "inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium",
                                                statusTone(item.status),
                                            ].join(" ")}
                                        >
                                            {iconForStatus(item.status)}
                                            {item.status.trim().length ? item.status : "pending"}
                                        </span>
                                    ) : null}

                                    {mode === "answer" && dirty ? <Badge className="bg-destructive text-white">Unsaved</Badge> : null}
                                </div>

                                <div className="space-y-1">
                                    <CardTitle className="text-base">{loading ? "Loading…" : title}</CardTitle>
                                    <CardDescription>
                                        {item ? (
                                            <>
                                                {item.program ? `${item.program} • ` : ""}
                                                {item.term ? `${item.term} • ` : ""}
                                                {scheduleLabel}
                                            </>
                                        ) : (
                                            <>Open a feedback form to continue.</>
                                        )}
                                    </CardDescription>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">

                                <Button
                                    variant="outline"
                                    onClick={() => void loadAll({ toastOnDone: true })}
                                    disabled={loading || refreshing}
                                    className="gap-2"
                                >
                                    <RefreshCw className={["h-4 w-4", refreshing ? "animate-spin" : ""].join(" ")} />
                                    Refresh
                                </Button>
                            </div>
                        </div>

                        {error ? (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                                {error}
                            </div>
                        ) : null}
                    </CardHeader>

                    <CardContent>
                        {loading ? (
                            <div className="space-y-3">
                                <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                <div className="h-24 w-full animate-pulse rounded-md bg-muted/50" />
                            </div>
                        ) : (
                            <div className="grid gap-4 lg:grid-cols-12">
                                <div className="space-y-4 lg:col-span-4">
                                    <Card>
                                        <CardHeader className="space-y-1">
                                            <CardTitle className="text-base">Progress</CardTitle>
                                            <CardDescription>Track required completion and rating score.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-muted-foreground">Completion</span>
                                                    <span className="font-semibold">
                                                        {completion.required > 0 ? `${completion.answered}/${completion.required}` : "—"}
                                                    </span>
                                                </div>
                                                <div className="h-2 w-full rounded-full bg-muted">
                                                    <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round(completionPct)}%` }} />
                                                </div>

                                                {completion.required > 0 && completion.missing.length > 0 && mode === "answer" ? (
                                                    <div className="rounded-md border bg-muted/10 p-3">
                                                        <p className="text-xs font-medium text-muted-foreground">Missing required</p>
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            {completion.missing.slice(0, 10).map((k) => (
                                                                <Badge key={k} variant="secondary" className="font-mono">
                                                                    {k}
                                                                </Badge>
                                                            ))}
                                                            {completion.missing.length > 10 ? (
                                                                <Badge variant="secondary">+{completion.missing.length - 10} more</Badge>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>

                                            <Separator />

                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-muted-foreground">Rating score</span>
                                                    <span className="font-semibold">{score.max_score > 0 ? `${Math.round(scorePct)}%` : "—"}</span>
                                                </div>
                                                <div className="h-2 w-full rounded-full bg-muted">
                                                    <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round(scorePct)}%` }} />
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    {score.max_score > 0
                                                        ? `${score.total_score}/${score.max_score} total from ${score.rating_questions} rating item(s)`
                                                        : "No rating questions detected in the active schema."}
                                                </p>
                                            </div>

                                            {item && isSubmittedLike ? (
                                                <>
                                                    <Separator />
                                                    <div className="rounded-md border bg-muted/10 p-3 text-xs text-muted-foreground">
                                                        Submitted: {formatDateTime(item.submitted_at)}{" "}
                                                        {item.locked_at ? `• Locked: ${formatDateTime(item.locked_at)}` : ""}
                                                    </div>
                                                </>
                                            ) : null}
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader className="space-y-1">
                                            <CardTitle className="text-base">Actions</CardTitle>
                                            <CardDescription>Save a draft anytime, then submit when ready.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            <Tabs value={mode} onValueChange={(v) => setMode(v as "answer" | "preview")}>
                                                <TabsList className="grid w-full grid-cols-2">
                                                    <TabsTrigger value="answer">Answer</TabsTrigger>
                                                    <TabsTrigger value="preview">Preview</TabsTrigger>
                                                </TabsList>
                                            </Tabs>

                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    variant="outline"
                                                    onClick={() => void onSaveDraft()}
                                                    disabled={!item || saving || submitting || isLockedLike || isSubmittedLike}
                                                >
                                                    {saving ? "Saving…" : "Save draft"}
                                                </Button>

                                                <Button
                                                    onClick={() => void onSubmit()}
                                                    disabled={!item || submitting || saving || isLockedLike || isSubmittedLike}
                                                >
                                                    {submitting ? "Submitting…" : "Submit"}
                                                </Button>
                                            </div>

                                            {isSubmittedLike ? (
                                                <div className="rounded-md border bg-muted/10 p-3 text-xs text-muted-foreground">
                                                    This form has already been submitted.
                                                </div>
                                            ) : null}
                                        </CardContent>
                                    </Card>
                                </div>

                                <div className="lg:col-span-8">
                                    <Card>
                                        <CardHeader className="space-y-1">
                                            <CardTitle className="text-base">{mode === "answer" ? "Feedback form" : "Preview"}</CardTitle>
                                            <CardDescription>
                                                {mode === "answer"
                                                    ? "Fill out your responses. You can save draft anytime."
                                                    : "Review saved answers and computed score summary."}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <ScrollArea className="h-[70vh] rounded-lg border bg-card">
                                                <div className="p-4">{mode === "answer" ? renderFormBody() : renderPreviewBody()}</div>
                                            </ScrollArea>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
