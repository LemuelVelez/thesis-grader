"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

type StudentEvaluationDetail = {
    id: string
    schedule_id: string | null
    student_id: string | null
    status: string
    title: string | null
    group_title: string | null
    scheduled_at: string | null
    room: string | null
    program: string | null
    term: string | null
    created_at: string | null
    submitted_at: string | null
    locked_at: string | null
    answers: Record<string, unknown> | null
    notes: string | null
}

type RatingQuestion = {
    id: string
    label: string | null
    min: number
    max: number
    required: boolean
    description: string | null
}

type ChoiceOption = { value: string; label: string }

type FeedbackQuestion = {
    id: string
    type: "rating" | "text" | "textarea" | "number" | "boolean" | "choice" | "multichoice" | "unknown"
    label: string
    description: string | null
    required: boolean
    placeholder: string | null
    options: ChoiceOption[] | null
    scale: { min: number; max: number } | null
}

type FeedbackSection = {
    id: string
    title: string
    description: string | null
    questions: FeedbackQuestion[]
}

type ScoreSummary = {
    total_score: number
    max_score: number
    percentage: number
    rating_questions: number
    breakdown: Record<string, { score: number; value: number | null; min: number; max: number; label: string | null }>
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
            // ignore invalid JSON string
        }
    }

    return null
}

function normalizeDetail(raw: unknown): StudentEvaluationDetail | null {
    if (!isRecord(raw)) return null

    const source =
        (isRecord(raw.item) && raw.item) ||
        (isRecord(raw.student_evaluation) && raw.student_evaluation) ||
        (isRecord(raw.evaluation) && raw.evaluation) ||
        raw

    const schedule = isRecord(source.schedule) ? source.schedule : null
    const group = isRecord(source.group) ? source.group : null

    const id = toStringSafe(source.id ?? raw.id)
    if (!id) return null

    return {
        id,
        schedule_id: toNullableString(source.schedule_id ?? source.scheduleId ?? schedule?.id),
        student_id: toNullableString(source.student_id ?? source.studentId),
        status: toStringSafe(source.status ?? raw.status) ?? "pending",
        title:
            toNullableString(
                source.title ??
                source.topic ??
                source.thesis_title ??
                source.thesisTitle ??
                schedule?.title ??
                group?.title,
            ) ?? null,
        group_title: toNullableString(source.group_title ?? source.groupTitle ?? group?.title),
        scheduled_at: toNullableString(source.scheduled_at ?? source.scheduledAt ?? schedule?.scheduled_at),
        room: toNullableString(source.room ?? schedule?.room),
        program: toNullableString(source.program ?? group?.program),
        term: toNullableString(source.term ?? group?.term),
        created_at: toNullableString(source.created_at ?? source.createdAt),
        submitted_at: toNullableString(source.submitted_at ?? source.submittedAt),
        locked_at: toNullableString(source.locked_at ?? source.lockedAt),
        answers: toJsonObject(source.answers),
        notes: toNullableString(source.notes ?? source.comment ?? source.remarks),
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

function extractDetailFromPayload(payload: unknown): StudentEvaluationDetail | null {
    if (isRecord(payload)) {
        const directCandidates: unknown[] = [
            payload.item,
            payload.student_evaluation,
            payload.evaluation,
            payload.data,
            isRecord(payload.data) ? payload.data.item : null,
            isRecord(payload.data) ? payload.data.student_evaluation : null,
            isRecord(payload.data) ? payload.data.evaluation : null,
            payload.result,
            isRecord(payload.result) ? payload.result.item : null,
            isRecord(payload.result) ? payload.result.student_evaluation : null,
            isRecord(payload.result) ? payload.result.evaluation : null,
        ]

        for (const candidate of directCandidates) {
            const parsed = normalizeDetail(candidate)
            if (parsed) return parsed
        }

        const fallback = normalizeDetail(payload)
        if (fallback) return fallback
    }

    return null
}

function humanizeKey(key: string): string {
    const withSpaces = key
        .replace(/[_-]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .trim()

    if (!withSpaces) return key

    return withSpaces
        .split(/\s+/g)
        .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
        .join(" ")
}

function formatAnswerValue(value: unknown): string {
    if (value === null || value === undefined) return "—"
    if (typeof value === "string") return value.trim().length ? value : "—"
    if (typeof value === "number" || typeof value === "boolean") return String(value)
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
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

function normalizeOptions(raw: unknown): ChoiceOption[] | null {
    if (!raw) return null

    if (Array.isArray(raw)) {
        const out: ChoiceOption[] = []
        for (const item of raw) {
            if (typeof item === "string" && item.trim()) {
                out.push({ value: item, label: item })
            } else if (isRecord(item)) {
                const v = toStringSafe(item.value ?? item.id ?? item.key ?? item.name)
                const l = toStringSafe(item.label ?? item.title ?? item.name ?? item.value)
                if (v) out.push({ value: v, label: l ?? v })
            }
        }
        return out.length ? out : null
    }

    // JSON schema-ish enum
    if (isRecord(raw) && Array.isArray(raw.enum)) {
        return normalizeOptions(raw.enum)
    }

    return null
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

function pickLabel(raw: Record<string, unknown>): string {
    return (
        toStringSafe(raw.label) ||
        toStringSafe(raw.title) ||
        toStringSafe(raw.question) ||
        toStringSafe(raw.name) ||
        "Untitled question"
    )
}

function normalizeQuestion(raw: unknown): FeedbackQuestion | null {
    if (!isRecord(raw)) return null

    const id = pickQuestionId(raw)
    if (!id) return null

    const typeRaw = toStringSafe(raw.type)?.toLowerCase() ?? "unknown"
    const required = raw.required === true

    const description = toNullableString(raw.description ?? raw.help ?? raw.hint)
    const placeholder = toNullableString(raw.placeholder)

    const scaleObj = isRecord(raw.scale) ? raw.scale : null
    const scaleMin = toFiniteNumber(scaleObj?.min) ?? null
    const scaleMax = toFiniteNumber(scaleObj?.max) ?? null

    const options =
        normalizeOptions(raw.options) ??
        normalizeOptions(raw.choices) ??
        normalizeOptions(raw.items) ??
        null

    let type: FeedbackQuestion["type"] = "unknown"

    if (typeRaw === "rating") type = "rating"
    else if (typeRaw === "textarea" || typeRaw === "multiline") type = "textarea"
    else if (typeRaw === "text" || typeRaw === "string") type = "text"
    else if (typeRaw === "number" || typeRaw === "numeric" || typeRaw === "integer") type = "number"
    else if (typeRaw === "boolean" || typeRaw === "yesno") type = "boolean"
    else if (typeRaw === "choice" || typeRaw === "select" || typeRaw === "radio") type = "choice"
    else if (typeRaw === "multichoice" || typeRaw === "checkbox" || typeRaw === "multi-select") type = "multichoice"

    // Infer types if not explicit
    if (type === "unknown") {
        if (scaleMin !== null || scaleMax !== null) type = "rating"
        else if (options?.length) type = raw.multiple === true ? "multichoice" : "choice"
        else if (raw.multiline === true) type = "textarea"
    }

    const min = scaleMin ?? 1
    const max = scaleMax ?? 5
    const normalizedMin = Math.min(min, max)
    const normalizedMax = Math.max(min, max)

    return {
        id,
        type,
        label: pickLabel(raw),
        description,
        required,
        placeholder,
        options,
        scale: type === "rating" ? { min: normalizedMin, max: normalizedMax } : null,
    }
}

function collectFromSectionsNode(node: unknown): FeedbackSection[] | null {
    if (!isRecord(node)) return null
    const sectionsRaw = node.sections
    if (!Array.isArray(sectionsRaw)) return null

    const sections: FeedbackSection[] = []

    for (const sec of sectionsRaw) {
        if (!isRecord(sec)) continue
        const title = toStringSafe(sec.title ?? sec.name ?? sec.label) ?? "Section"
        const description = toNullableString(sec.description)

        const questionsRaw = Array.isArray(sec.questions) ? sec.questions : Array.isArray(sec.fields) ? sec.fields : []
        const questions = (questionsRaw ?? [])
            .map(normalizeQuestion)
            .filter((q): q is FeedbackQuestion => q !== null)

        if (questions.length === 0) continue

        const id = toStringSafe(sec.id ?? sec.key ?? sec.name) ?? title.toLowerCase().replace(/\s+/g, "-")

        sections.push({
            id,
            title,
            description,
            questions,
        })
    }

    return sections.length ? sections : null
}

function collectFromQuestionsNode(node: unknown): FeedbackSection[] | null {
    if (!isRecord(node)) return null

    const list =
        (Array.isArray(node.questions) && node.questions) ||
        (Array.isArray(node.fields) && node.fields) ||
        null

    if (!list) return null

    const questions = list.map(normalizeQuestion).filter((q): q is FeedbackQuestion => q !== null)
    if (questions.length === 0) return null

    return [
        {
            id: "feedback",
            title: toStringSafe(node.title) ?? "Feedback Form",
            description: toNullableString(node.description),
            questions,
        },
    ]
}

function collectFromJsonSchema(node: unknown): FeedbackSection[] | null {
    if (!isRecord(node)) return null
    const props = isRecord(node.properties) ? node.properties : null
    if (!props) return null

    const requiredList = Array.isArray(node.required) ? node.required : []
    const requiredSet = new Set(requiredList.filter((v): v is string => typeof v === "string"))

    const questions: FeedbackQuestion[] = []

    for (const [key, value] of Object.entries(props)) {
        if (!isRecord(value)) continue

        const label = toStringSafe(value.title ?? value.label) ?? humanizeKey(key)
        const description = toNullableString(value.description)
        const placeholder = toNullableString(value.placeholder)
        const enumOptions = normalizeOptions(value)

        const valueType = toStringSafe(value.type)?.toLowerCase() ?? "unknown"

        let qType: FeedbackQuestion["type"] = "unknown"
        if (valueType === "boolean") qType = "boolean"
        else if (valueType === "number" || valueType === "integer") qType = "number"
        else if (enumOptions?.length) qType = "choice"
        else qType = valueType === "string" ? "text" : "unknown"

        questions.push({
            id: key,
            type: qType,
            label,
            description,
            required: requiredSet.has(key),
            placeholder,
            options: enumOptions,
            scale: null,
        })
    }

    if (!questions.length) return null

    return [
        {
            id: "feedback",
            title: toStringSafe(node.title) ?? "Feedback Form",
            description: toNullableString(node.description),
            questions,
        },
    ]
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
                    const desc = toNullableString(node.description ?? node.help ?? node.hint) ?? null

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
                        required: node.required === true,
                        description: desc,
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
    answers: Record<string, unknown>,
    ratingQuestions: RatingQuestion[],
    labelById: Record<string, string>,
): ScoreSummary {
    let total = 0
    let maxTotal = 0

    const breakdown: ScoreSummary["breakdown"] = {}

    for (const q of ratingQuestions) {
        maxTotal += q.max

        const raw = answers[q.id]
        const n = toFiniteNumber(raw)
        const scored = n === null ? 0 : clamp(n, q.min, q.max)

        total += scored

        breakdown[q.id] = {
            score: scored,
            value: n,
            min: q.min,
            max: q.max,
            label: q.label ?? labelById[q.id] ?? null,
        }
    }

    const percentage = maxTotal > 0 ? (total / maxTotal) * 100 : 0

    return {
        total_score: total,
        max_score: maxTotal,
        percentage,
        rating_questions: ratingQuestions.length,
        breakdown,
    }
}

async function fetchFirstOk<T>(
    endpoints: string[],
    init?: RequestInit,
): Promise<{ ok: true; endpoint: string; payload: T; res: Response } | { ok: false; error: string }> {
    let latestError = "Request failed."

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, init)
            const payload = (await res.json().catch(() => null)) as unknown

            if (!res.ok) {
                latestError = await readErrorMessage(res, payload)
                continue
            }

            return { ok: true, endpoint, payload: payload as T, res }
        } catch (err) {
            latestError = err instanceof Error ? err.message : latestError
        }
    }

    return { ok: false, error: latestError }
}

export default function StudentEvaluationDetailPage() {
    const params = useParams()

    const evaluationId = React.useMemo(() => {
        const raw = params?.id
        if (Array.isArray(raw)) return raw[0] ?? ""
        return typeof raw === "string" ? raw : ""
    }, [params])

    const [item, setItem] = React.useState<StudentEvaluationDetail | null>(null)
    const [schema, setSchema] = React.useState<Record<string, unknown> | null>(null)

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const [draftAnswers, setDraftAnswers] = React.useState<Record<string, unknown>>({})
    const [dirty, setDirty] = React.useState(false)

    const [saving, setSaving] = React.useState(false)
    const [submitting, setSubmitting] = React.useState(false)
    const [confirmSubmit, setConfirmSubmit] = React.useState(false)

    const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(null)
    const lastSavedSnapshotRef = React.useRef<string>("")

    const [activeTab, setActiveTab] = React.useState<"form" | "summary">("form")

    const questionAnchorIdsRef = React.useRef<Record<string, string>>({})

    const editable = React.useMemo(() => {
        const s = (item?.status ?? "pending").toLowerCase()
        return s === "pending"
    }, [item?.status])

    const loadSchema = React.useCallback(async (opts?: { toastOnDone?: boolean }) => {
        const showToast = !!opts?.toastOnDone

        const schemaCandidates = [
            "/api/student-evaluations/schema",
            "/api/student-evaluations/form/schema",
            "/api/student-evaluations/active-form",
            "/api/students/me/student-evaluations/schema",
            "/api/students/current/student-evaluations/schema",
        ]

        const res = await fetchFirstOk<Record<string, unknown>>(schemaCandidates, { cache: "no-store" })
        if (!res.ok) {
            setSchema(null)
            if (showToast) toast.error(res.error)
            return null
        }

        const payload = res.payload
        const maybeSchema = (isRecord(payload) ? (payload.schema as unknown) : null) ?? payload
        const parsed = isRecord(maybeSchema) ? (maybeSchema as Record<string, unknown>) : null

        setSchema(parsed)
        return parsed
    }, [])

    const loadDetail = React.useCallback(
        async (opts?: { toastOnDone?: boolean }) => {
            const showToast = !!opts?.toastOnDone

            if (!evaluationId) {
                setItem(null)
                setError("Missing feedback form reference.")
                setLoading(false)
                return
            }

            setError(null)
            setRefreshing(showToast)
            setLoading((prev) => (showToast ? prev : true))

            const endpointCandidates = [
                `/api/student-evaluations/${evaluationId}`,
                `/api/student-evaluations/me/${evaluationId}`,
                `/api/student-evaluations/my/${evaluationId}`,
                `/api/evaluations/${evaluationId}`,
            ]

            const result = await fetchFirstOk<unknown>(endpointCandidates, { cache: "no-store" })

            if (!result.ok) {
                setItem(null)
                setError(result.error)
                if (showToast) toast.error(result.error)
                setLoading(false)
                setRefreshing(false)
                return
            }

            const parsed = extractDetailFromPayload(result.payload)
            if (!parsed) {
                const msg = "We couldn’t load this feedback form."
                setItem(null)
                setError(msg)
                if (showToast) toast.error(msg)
                setLoading(false)
                setRefreshing(false)
                return
            }

            setItem(parsed)
            if (showToast) toast.success("Feedback form refreshed.")

            setLoading(false)
            setRefreshing(false)
        },
        [evaluationId],
    )

    React.useEffect(() => {
        let alive = true
            ; (async () => {
                setLoading(true)
                await Promise.all([loadDetail(), loadSchema()])
                if (alive) setLoading(false)
            })()
        return () => {
            alive = false
        }
    }, [loadDetail, loadSchema])

    React.useEffect(() => {
        const next = item?.answers ? { ...item.answers } : {}
        setDraftAnswers(next)
        setDirty(false)
        lastSavedSnapshotRef.current = JSON.stringify(next)
        setLastSavedAt(item?.updated_at ?? null)
    }, [item?.id]) // only when switching items

    const headerTitle = item?.title ?? item?.group_title ?? "Student Feedback"

    const scheduleLine = React.useMemo(() => {
        if (!item) return "—"
        const when = formatDateTime(item.scheduled_at)
        const room = item.room ? ` • ${item.room}` : ""
        return `${when}${room}`
    }, [item])

    const sections = React.useMemo(() => {
        if (!schema) return [] as FeedbackSection[]

        return (
            collectFromSectionsNode(schema) ??
            collectFromQuestionsNode(schema) ??
            collectFromJsonSchema(schema) ??
            []
        )
    }, [schema])

    const questionIndex = React.useMemo(() => {
        const idx: Record<string, FeedbackQuestion> = {}
        for (const sec of sections) {
            for (const q of sec.questions) idx[q.id] = q
        }
        return idx
    }, [sections])

    const labelById = React.useMemo(() => {
        const out: Record<string, string> = {}
        for (const [id, q] of Object.entries(questionIndex)) out[id] = q.label
        return out
    }, [questionIndex])

    const requiredKeys = React.useMemo(() => collectRequiredKeys(schema), [schema])

    const ratingQuestions = React.useMemo(() => collectRatingQuestions(schema), [schema])

    const score = React.useMemo(() => {
        return computeScoreSummary(draftAnswers, ratingQuestions, labelById)
    }, [draftAnswers, ratingQuestions, labelById])

    const requiredProgress = React.useMemo(() => {
        const uniqueReq = Array.from(new Set(requiredKeys))
        if (uniqueReq.length === 0) return { required: 0, answered: 0, missing: [] as string[] }

        const missing = uniqueReq.filter((k) => isMissingAnswer(draftAnswers[k]))
        const answered = uniqueReq.length - missing.length
        return { required: uniqueReq.length, answered, missing }
    }, [requiredKeys, draftAnswers])

    const onCopy = React.useCallback(async (value: unknown) => {
        const text = formatAnswerValue(value)
        try {
            await navigator.clipboard.writeText(text)
            toast.success("Copied to clipboard.")
        } catch {
            toast.error("Copy failed. Please try again.")
        }
    }, [])

    const setAnswer = React.useCallback((key: string, value: unknown) => {
        setDraftAnswers((prev) => {
            const next = { ...prev, [key]: value }
            return next
        })
        setDirty(true)
    }, [])

    const clearAnswer = React.useCallback((key: string) => {
        setDraftAnswers((prev) => {
            const next = { ...prev }
            next[key] = null
            return next
        })
        setDirty(true)
    }, [])

    const scrollToQuestion = React.useCallback((id: string) => {
        const anchorId = questionAnchorIdsRef.current[id] ?? `q-${id}`
        const el = document.getElementById(anchorId)
        if (!el) return
        el.scrollIntoView({ behavior: "smooth", block: "start" })
    }, [])

    const saveDraft = React.useCallback(
        async (opts?: { toastOnDone?: boolean; silent?: boolean }) => {
            if (!evaluationId) return
            if (!editable) {
                if (!opts?.silent) toast.error("This feedback can no longer be edited.")
                return
            }

            const snapshot = JSON.stringify(draftAnswers)
            if (!dirty && snapshot === lastSavedSnapshotRef.current) {
                if (opts?.toastOnDone) toast.success("No changes to save.")
                return
            }

            setSaving(true)
            const showToast = !!opts?.toastOnDone && !opts?.silent

            const endpointCandidates = [
                `/api/student-evaluations/${evaluationId}`,
                `/api/student-evaluations/me/${evaluationId}`,
                `/api/student-evaluations/my/${evaluationId}`,
            ]

            const result = await fetchFirstOk<unknown>(endpointCandidates, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answers: draftAnswers }),
            })

            if (!result.ok) {
                setSaving(false)
                if (!opts?.silent) toast.error(result.error)
                return
            }

            const updated = extractDetailFromPayload(result.payload)
            if (updated) {
                setItem(updated)
                setLastSavedAt(new Date().toISOString())
            } else {
                setLastSavedAt(new Date().toISOString())
            }

            lastSavedSnapshotRef.current = snapshot
            setDirty(false)
            setSaving(false)

            if (showToast) toast.success("Saved.")
        },
        [draftAnswers, dirty, editable, evaluationId],
    )

    // Debounced autosave (quiet) to improve UX while typing
    React.useEffect(() => {
        if (!editable) return
        if (!dirty) return

        const snapshot = JSON.stringify(draftAnswers)
        if (snapshot === lastSavedSnapshotRef.current) return

        const t = window.setTimeout(() => {
            void saveDraft({ silent: true })
        }, 1200)

        return () => window.clearTimeout(t)
    }, [draftAnswers, dirty, editable, saveDraft])

    const submitForm = React.useCallback(async () => {
        if (!evaluationId) return
        if (!editable) {
            toast.error("This feedback can no longer be submitted.")
            return
        }

        if (requiredProgress.missing.length > 0) {
            toast.error("Please complete the required questions before submitting.")
            return
        }

        setSubmitting(true)

        // Ensure latest answers are saved before submit
        await saveDraft({ silent: true })

        const endpointCandidates = [
            `/api/student-evaluations/${evaluationId}/submit`,
            `/api/student-evaluations/me/${evaluationId}/submit`,
            `/api/student-evaluations/my/${evaluationId}/submit`,
        ]

        const result = await fetchFirstOk<unknown>(endpointCandidates, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        })

        if (!result.ok) {
            setSubmitting(false)
            toast.error(result.error)
            return
        }

        const updated = extractDetailFromPayload(result.payload)
        if (updated) setItem(updated)

        setConfirmSubmit(false)
        setSubmitting(false)
        toast.success("Submitted successfully.")
    }, [editable, evaluationId, requiredProgress.missing.length, saveDraft])

    const extraAnswers = React.useMemo(() => {
        const known = new Set(Object.keys(questionIndex))
        const entries = Object.entries(draftAnswers).filter(([k]) => !known.has(k))
        return entries.sort(([a], [b]) => a.localeCompare(b))
    }, [draftAnswers, questionIndex])

    const renderChoiceButtons = React.useCallback(
        (q: FeedbackQuestion, value: unknown) => {
            const options = q.options ?? []
            const current = typeof value === "string" ? value : null

            return (
                <div className="flex flex-wrap gap-2">
                    {options.map((opt) => {
                        const active = current === opt.value
                        return (
                            <Button
                                key={opt.value}
                                type="button"
                                size="sm"
                                variant={active ? "default" : "outline"}
                                disabled={!editable}
                                onClick={() => setAnswer(q.id, opt.value)}
                            >
                                {opt.label}
                            </Button>
                        )
                    })}
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={!editable || isMissingAnswer(value)}
                        onClick={() => clearAnswer(q.id)}
                    >
                        Clear
                    </Button>
                </div>
            )
        },
        [clearAnswer, editable, setAnswer],
    )

    const renderMultiChoiceButtons = React.useCallback(
        (q: FeedbackQuestion, value: unknown) => {
            const options = q.options ?? []
            const current = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
            const set = new Set(current)

            return (
                <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                        {options.map((opt) => {
                            const active = set.has(opt.value)
                            return (
                                <Button
                                    key={opt.value}
                                    type="button"
                                    size="sm"
                                    variant={active ? "default" : "outline"}
                                    disabled={!editable}
                                    onClick={() => {
                                        const next = new Set(set)
                                        if (next.has(opt.value)) next.delete(opt.value)
                                        else next.add(opt.value)
                                        setAnswer(q.id, Array.from(next))
                                    }}
                                >
                                    {opt.label}
                                </Button>
                            )
                        })}
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={!editable || current.length === 0}
                            onClick={() => clearAnswer(q.id)}
                        >
                            Clear
                        </Button>
                        {current.length > 0 ? (
                            <span className="text-xs text-muted-foreground">{current.length} selected</span>
                        ) : null}
                    </div>
                </div>
            )
        },
        [clearAnswer, editable, setAnswer],
    )

    const renderRatingButtons = React.useCallback(
        (q: FeedbackQuestion, value: unknown) => {
            const scale = q.scale ?? { min: 1, max: 5 }
            const min = scale.min
            const max = scale.max
            const span = Math.abs(max - min)

            const current = toFiniteNumber(value)
            const canRenderButtons = span <= 10

            if (!canRenderButtons) {
                return (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="flex-1">
                            <Input
                                type="number"
                                value={current ?? ""}
                                disabled={!editable}
                                placeholder={`Enter a number (${min}-${max})`}
                                onChange={(e) => {
                                    const n = toFiniteNumber(e.target.value)
                                    if (n === null) setAnswer(q.id, null)
                                    else setAnswer(q.id, clamp(n, min, max))
                                }}
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                                Range: {min} to {max}
                            </p>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            disabled={!editable || current === null}
                            onClick={() => clearAnswer(q.id)}
                        >
                            Clear
                        </Button>
                    </div>
                )
            }

            const values = Array.from({ length: span + 1 }, (_, i) => min + i)

            return (
                <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                        {values.map((v) => {
                            const active = current === v
                            return (
                                <Button
                                    key={v}
                                    type="button"
                                    size="sm"
                                    variant={active ? "default" : "outline"}
                                    disabled={!editable}
                                    onClick={() => setAnswer(q.id, v)}
                                >
                                    {v}
                                </Button>
                            )
                        })}
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={!editable || current === null}
                            onClick={() => clearAnswer(q.id)}
                        >
                            Clear
                        </Button>
                    </div>

                    <div className="text-xs text-muted-foreground">
                        Scale: {min} (lowest) to {max} (highest)
                    </div>
                </div>
            )
        },
        [clearAnswer, editable, setAnswer],
    )

    const renderBooleanButtons = React.useCallback(
        (q: FeedbackQuestion, value: unknown) => {
            const current = typeof value === "boolean" ? value : null
            const yesActive = current === true
            const noActive = current === false

            return (
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant={yesActive ? "default" : "outline"}
                        disabled={!editable}
                        onClick={() => setAnswer(q.id, true)}
                    >
                        Yes
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant={noActive ? "default" : "outline"}
                        disabled={!editable}
                        onClick={() => setAnswer(q.id, false)}
                    >
                        No
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={!editable || current === null}
                        onClick={() => clearAnswer(q.id)}
                    >
                        Clear
                    </Button>
                </div>
            )
        },
        [clearAnswer, editable, setAnswer],
    )

    const renderQuestionField = React.useCallback(
        (q: FeedbackQuestion) => {
            const value = draftAnswers[q.id]
            const requiredBadge = q.required ? (
                <span className="rounded-md border bg-background px-2 py-1 text-xs font-medium text-muted-foreground">
                    Required
                </span>
            ) : null

            const missing = q.required && isMissingAnswer(value)

            const anchorId = `q-${q.id}`
            questionAnchorIdsRef.current[q.id] = anchorId

            return (
                <div
                    key={q.id}
                    id={anchorId}
                    className={[
                        "rounded-lg border bg-card p-4",
                        missing ? "border-amber-600/40 bg-amber-600/5" : "",
                    ].join(" ")}
                >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold">{q.label}</p>
                                {requiredBadge}
                                {missing ? (
                                    <span className="rounded-md border border-amber-600/30 bg-amber-600/10 px-2 py-1 text-xs font-medium text-foreground">
                                        Missing
                                    </span>
                                ) : null}
                            </div>
                            {q.description ? (
                                <p className="text-sm text-muted-foreground">{q.description}</p>
                            ) : null}
                        </div>

                        <div className="text-xs text-muted-foreground">
                            <span className="rounded-md border bg-background px-2 py-1">
                                {toTitleCase(q.type)}
                            </span>
                        </div>
                    </div>

                    <div className="mt-4">
                        {q.type === "rating" ? renderRatingButtons(q, value) : null}
                        {q.type === "boolean" ? renderBooleanButtons(q, value) : null}
                        {q.type === "choice" ? renderChoiceButtons(q, value) : null}
                        {q.type === "multichoice" ? renderMultiChoiceButtons(q, value) : null}

                        {q.type === "text" ? (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <Input
                                    value={typeof value === "string" ? value : ""}
                                    disabled={!editable}
                                    placeholder={q.placeholder ?? "Type your answer..."}
                                    onChange={(e) => setAnswer(q.id, e.target.value)}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={!editable || isMissingAnswer(value)}
                                    onClick={() => clearAnswer(q.id)}
                                >
                                    Clear
                                </Button>
                            </div>
                        ) : null}

                        {q.type === "textarea" ? (
                            <div className="space-y-2">
                                <Textarea
                                    value={typeof value === "string" ? value : ""}
                                    disabled={!editable}
                                    placeholder={q.placeholder ?? "Write your response..."}
                                    onChange={(e) => setAnswer(q.id, e.target.value)}
                                    className="min-h-28"
                                />
                                <div className="flex items-center justify-between">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={!editable || isMissingAnswer(value)}
                                        onClick={() => clearAnswer(q.id)}
                                    >
                                        Clear
                                    </Button>
                                    <span className="text-xs text-muted-foreground">
                                        {typeof value === "string" ? value.length : 0} chars
                                    </span>
                                </div>
                            </div>
                        ) : null}

                        {q.type === "number" ? (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <Input
                                    type="number"
                                    value={toFiniteNumber(value) ?? ""}
                                    disabled={!editable}
                                    placeholder={q.placeholder ?? "Enter a number..."}
                                    onChange={(e) => {
                                        const n = toFiniteNumber(e.target.value)
                                        setAnswer(q.id, n === null ? null : n)
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={!editable || isMissingAnswer(value)}
                                    onClick={() => clearAnswer(q.id)}
                                >
                                    Clear
                                </Button>
                            </div>
                        ) : null}

                        {q.type === "unknown" ? (
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    This question type isn’t recognized. You can still answer using a text field.
                                </p>
                                <Input
                                    value={typeof value === "string" ? value : ""}
                                    disabled={!editable}
                                    placeholder={q.placeholder ?? "Type your answer..."}
                                    onChange={(e) => setAnswer(q.id, e.target.value)}
                                />
                            </div>
                        ) : null}
                    </div>
                </div>
            )
        },
        [
            clearAnswer,
            draftAnswers,
            editable,
            renderBooleanButtons,
            renderChoiceButtons,
            renderMultiChoiceButtons,
            renderRatingButtons,
            setAnswer,
        ],
    )

    const answerEntriesForSummary = React.useMemo(() => {
        const entries = Object.entries(draftAnswers).sort(([a], [b]) => a.localeCompare(b))
        return entries
    }, [draftAnswers])

    const scorePercent = Math.max(0, Math.min(100, score.percentage))
    const scorePercentLabel =
        score.max_score > 0 ? `${Math.round(scorePercent)}%` : "—"

    const scoreBarWidthStyle = React.useMemo(() => {
        return { width: `${scorePercent}%` }
    }, [scorePercent])

    return (
        <DashboardLayout
            title="Student Feedback"
            description="Complete your active feedback form and view your live score summary based on rating questions."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1">
                            <p className="text-base font-semibold">{headerTitle}</p>
                            <p className="text-sm text-muted-foreground">{scheduleLine}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {item?.program ? <span>{item.program}</span> : null}
                                {item?.term ? <span>• {item.term}</span> : null}
                                <span
                                    className={[
                                        "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                        statusTone(item?.status ?? "pending"),
                                    ].join(" ")}
                                >
                                    {toTitleCase(item?.status ?? "pending")}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button asChild variant="outline">
                                <Link href="/dashboard/student/student-evaluations">Back</Link>
                            </Button>

                            <Button
                                variant="outline"
                                onClick={() => void Promise.all([loadDetail({ toastOnDone: true }), loadSchema({ toastOnDone: true })])}
                                disabled={loading || refreshing || saving || submitting}
                            >
                                Refresh
                            </Button>

                            <Button
                                onClick={() => void saveDraft({ toastOnDone: true })}
                                disabled={!editable || saving || loading || submitting}
                            >
                                {saving ? "Saving..." : "Save"}
                            </Button>
                        </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Created</p>
                            <p className="text-sm">{formatDateTime(item?.created_at ?? null)}</p>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Submitted</p>
                            <p className="text-sm">{formatDateTime(item?.submitted_at ?? null)}</p>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Locked</p>
                            <p className="text-sm">{formatDateTime(item?.locked_at ?? null)}</p>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Last saved</p>
                            <p className="text-sm">{formatDateTime(lastSavedAt)}</p>
                        </div>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                            <p className="text-sm font-medium">Feedback workspace</p>
                            <p className="text-xs text-muted-foreground">
                                Use the form to answer the active questions. Your score updates live based on rating items.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant={activeTab === "form" ? "default" : "outline"}
                                onClick={() => setActiveTab("form")}
                            >
                                Form
                            </Button>
                            <Button
                                size="sm"
                                variant={activeTab === "summary" ? "default" : "outline"}
                                onClick={() => setActiveTab("summary")}
                            >
                                Summary
                            </Button>
                        </div>
                    </div>
                </div>

                {activeTab === "form" ? (
                    <div className="grid gap-4 lg:grid-cols-12">
                        <div className="lg:col-span-8">
                            <div className="rounded-lg border bg-card p-4">
                                {loading ? (
                                    <div className="space-y-2">
                                        {Array.from({ length: 8 }).map((_, i) => (
                                            <div
                                                key={`form-skeleton-${i}`}
                                                className="h-10 w-full animate-pulse rounded-md bg-muted/50"
                                            />
                                        ))}
                                    </div>
                                ) : !item ? (
                                    <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
                                        No feedback data found.
                                    </div>
                                ) : !schema || sections.length === 0 ? (
                                    <div className="space-y-3">
                                        <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
                                            No active feedback form schema found to render.
                                        </div>

                                        <div className="rounded-md border bg-background p-4">
                                            <p className="text-sm font-medium">Available answers</p>
                                            <p className="text-xs text-muted-foreground">
                                                You can still review what’s currently stored.
                                            </p>

                                            <div className="mt-3">
                                                <ScrollArea className="h-72 rounded-md border">
                                                    <pre className="p-3 text-xs whitespace-pre-wrap wrap-break-word">
                                                        {JSON.stringify(draftAnswers, null, 2)}
                                                    </pre>
                                                </ScrollArea>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {sections.map((sec) => (
                                            <div key={sec.id} className="space-y-2">
                                                <div className="rounded-lg border bg-background p-4">
                                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                        <div className="space-y-1">
                                                            <p className="text-sm font-semibold">{sec.title}</p>
                                                            {sec.description ? (
                                                                <p className="text-sm text-muted-foreground">{sec.description}</p>
                                                            ) : null}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {sec.questions.length} question(s)
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-3">
                                                    {sec.questions.map((q) => renderQuestionField(q))}
                                                </div>
                                            </div>
                                        ))}

                                        {extraAnswers.length > 0 ? (
                                            <div className="rounded-lg border bg-background p-4">
                                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="space-y-1">
                                                        <p className="text-sm font-semibold">Additional stored fields</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            These exist in your saved answers but aren’t part of the current active form layout.
                                                        </p>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">{extraAnswers.length} field(s)</div>
                                                </div>

                                                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                                                    {extraAnswers.map(([key, value]) => (
                                                        <div key={key} className="rounded-md border bg-card p-3">
                                                            <p className="text-xs text-muted-foreground">Key</p>
                                                            <p className="text-sm font-semibold">{humanizeKey(key)}</p>

                                                            <div className="mt-2 rounded-md border bg-background">
                                                                <ScrollArea className="max-h-36">
                                                                    <pre className="p-3 text-xs whitespace-pre-wrap wrap-break-word">
                                                                        {formatAnswerValue(value)}
                                                                    </pre>
                                                                </ScrollArea>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="lg:col-span-4">
                            <div className="space-y-4 lg:sticky lg:top-4">
                                <div className="rounded-lg border bg-card p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold">Live score</p>
                                            <p className="text-xs text-muted-foreground">
                                                Based on rating questions in the active form schema.
                                            </p>
                                        </div>

                                        <span className="rounded-md border bg-background px-2 py-1 text-xs font-semibold">
                                            {scorePercentLabel}
                                        </span>
                                    </div>

                                    <div className="mt-3 space-y-2">
                                        <div className="h-2 w-full rounded-full bg-muted">
                                            <div className="h-2 rounded-full bg-primary" style={scoreBarWidthStyle} />
                                        </div>

                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <div className="rounded-md border bg-background p-3">
                                                <p className="text-xs text-muted-foreground">Total</p>
                                                <p className="text-lg font-semibold">{score.total_score}</p>
                                            </div>
                                            <div className="rounded-md border bg-background p-3">
                                                <p className="text-xs text-muted-foreground">Max</p>
                                                <p className="text-lg font-semibold">{score.max_score}</p>
                                            </div>
                                        </div>

                                        <div className="rounded-md border bg-background p-3">
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs text-muted-foreground">Rating questions</p>
                                                <p className="text-xs font-semibold">{score.rating_questions}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-lg border bg-card p-4">
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold">Completion</p>
                                        <p className="text-xs text-muted-foreground">
                                            Required answers: {requiredProgress.answered}/{requiredProgress.required}
                                        </p>
                                    </div>

                                    {requiredProgress.required > 0 ? (
                                        <div className="mt-3 space-y-2">
                                            <div className="h-2 w-full rounded-full bg-muted">
                                                <div
                                                    className="h-2 rounded-full bg-primary"
                                                    style={{
                                                        width: `${Math.round(
                                                            (requiredProgress.answered / requiredProgress.required) * 100,
                                                        )}%`,
                                                    }}
                                                />
                                            </div>

                                            {requiredProgress.missing.length > 0 ? (
                                                <div className="rounded-md border border-amber-600/30 bg-amber-600/10 p-3">
                                                    <p className="text-xs font-medium">Missing required</p>
                                                    <div className="mt-2 flex flex-col gap-1">
                                                        {requiredProgress.missing.slice(0, 6).map((k) => (
                                                            <Button
                                                                key={k}
                                                                size="sm"
                                                                variant="ghost"
                                                                className="justify-start"
                                                                onClick={() => scrollToQuestion(k)}
                                                            >
                                                                {labelById[k] ?? humanizeKey(k)}
                                                            </Button>
                                                        ))}
                                                        {requiredProgress.missing.length > 6 ? (
                                                            <p className="mt-1 text-xs text-muted-foreground">
                                                                +{requiredProgress.missing.length - 6} more…
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
                                                    All required items are complete.
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="mt-3 rounded-md border bg-background p-3 text-xs text-muted-foreground">
                                            No required fields detected in the active form schema.
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-lg border bg-card p-4">
                                    <div className="space-y-2">
                                        <p className="text-sm font-semibold">Actions</p>
                                        <p className="text-xs text-muted-foreground">
                                            Save anytime. Submit when you’re done.
                                        </p>
                                    </div>

                                    <div className="mt-3 space-y-2">
                                        <Button
                                            className="w-full"
                                            onClick={() => void saveDraft({ toastOnDone: true })}
                                            disabled={!editable || saving || loading || submitting}
                                        >
                                            {saving ? "Saving..." : dirty ? "Save changes" : "Save"}
                                        </Button>

                                        {!confirmSubmit ? (
                                            <Button
                                                className="w-full"
                                                variant="outline"
                                                onClick={() => setConfirmSubmit(true)}
                                                disabled={!editable || loading || saving || submitting}
                                            >
                                                Submit
                                            </Button>
                                        ) : (
                                            <div className="rounded-md border bg-background p-3">
                                                <p className="text-sm font-medium">Confirm submit</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Submitting will finalize your feedback.
                                                </p>

                                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => setConfirmSubmit(false)}
                                                        disabled={submitting}
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        onClick={() => void submitForm()}
                                                        disabled={submitting || requiredProgress.missing.length > 0}
                                                    >
                                                        {submitting ? "Submitting..." : "Confirm"}
                                                    </Button>
                                                </div>

                                                {requiredProgress.missing.length > 0 ? (
                                                    <p className="mt-2 text-xs text-muted-foreground">
                                                        Complete required items before confirming.
                                                    </p>
                                                ) : null}
                                            </div>
                                        )}
                                    </div>

                                    {!editable ? (
                                        <div className="mt-3 rounded-md border bg-background p-3 text-xs text-muted-foreground">
                                            This feedback is already finalized.
                                        </div>
                                    ) : null}
                                </div>

                                {Object.keys(score.breakdown).length > 0 ? (
                                    <div className="rounded-lg border bg-card p-4">
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold">Rating breakdown</p>
                                            <p className="text-xs text-muted-foreground">
                                                Tap a row to jump to the question.
                                            </p>
                                        </div>

                                        <div className="mt-3 rounded-md border bg-background">
                                            <ScrollArea className="h-64">
                                                <div className="divide-y">
                                                    {Object.entries(score.breakdown)
                                                        .sort(([a], [b]) => a.localeCompare(b))
                                                        .map(([id, info]) => {
                                                            const label = info.label ?? labelById[id] ?? humanizeKey(id)
                                                            const hasValue = info.value !== null && info.value !== undefined
                                                            return (
                                                                <button
                                                                    key={id}
                                                                    type="button"
                                                                    onClick={() => scrollToQuestion(id)}
                                                                    className="w-full px-3 py-2 text-left hover:bg-muted/40"
                                                                >
                                                                    <div className="flex items-start justify-between gap-3">
                                                                        <div className="space-y-1">
                                                                            <p className="text-xs text-muted-foreground">Question</p>
                                                                            <p className="text-sm font-medium">{label}</p>
                                                                        </div>

                                                                        <div className="text-right">
                                                                            <p className="text-xs text-muted-foreground">Score</p>
                                                                            <p className="text-sm font-semibold">
                                                                                {info.score}/{info.max}
                                                                            </p>
                                                                            <p className="text-xs text-muted-foreground">
                                                                                {hasValue ? `Value: ${info.value}` : "No answer"}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </button>
                                                            )
                                                        })}
                                                </div>
                                            </ScrollArea>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-lg border bg-card p-4">
                        <div className="mb-3 space-y-1">
                            <p className="text-sm font-medium">Your Responses</p>
                            <p className="text-xs text-muted-foreground">
                                A summary of your currently saved answers (including drafts).
                            </p>
                        </div>

                        {loading ? (
                            <div className="space-y-2">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div
                                        key={`answer-skeleton-${i}`}
                                        className="h-10 w-full animate-pulse rounded-md bg-muted/50"
                                    />
                                ))}
                            </div>
                        ) : answerEntriesForSummary.length === 0 ? (
                            <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
                                No responses found for this feedback form.
                            </div>
                        ) : (
                            <div className="grid gap-2 lg:grid-cols-2">
                                {answerEntriesForSummary.map(([key, value]) => {
                                    const label = labelById[key] ?? humanizeKey(key)
                                    const rendered = formatAnswerValue(value)

                                    return (
                                        <div key={key} className="rounded-lg border bg-background p-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="space-y-1">
                                                    <p className="text-xs text-muted-foreground">Question / Field</p>
                                                    <p className="text-sm font-semibold">{label}</p>
                                                </div>

                                                <Button size="sm" variant="outline" onClick={() => void onCopy(value)}>
                                                    Copy
                                                </Button>
                                            </div>

                                            <div className="mt-3 rounded-md border bg-card">
                                                <ScrollArea className="max-h-52">
                                                    <pre className="whitespace-pre-wrap wrap-break-word p-3 text-sm">
                                                        {rendered}
                                                    </pre>
                                                </ScrollArea>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {item?.notes ? (
                            <div className="mt-4 rounded-lg border bg-background p-4">
                                <p className="text-sm font-semibold">Notes</p>
                                <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap wrap-break-word">
                                    {item.notes}
                                </p>
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}
