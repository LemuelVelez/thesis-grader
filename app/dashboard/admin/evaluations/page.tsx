"use client"

import * as React from "react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"

import { AdminEvaluationsForm } from "@/components/evaluation/admin-evaluations-form"
import { useAdminEvaluationsPage, type AdminEvaluationsPageState } from "@/components/evaluation/admin-evaluations-hook"
import {
    AdminEvaluationsError,
    AdminEvaluationsGroupedTable,
    AdminEvaluationsStats,
    AdminEvaluationsToolbar,
} from "@/components/evaluation/admin-evaluations-table"
import { statusBadgeClass } from "@/components/evaluation/admin-evaluations-model"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

type PreviewResponse = {
    preview?: unknown
    message?: string
    error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function getString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function getNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const t = value.trim()
        if (!t) return null
        const n = Number(t)
        return Number.isFinite(n) ? n : null
    }
    return null
}

function formatPercent(value: unknown): string {
    const n = getNumber(value)
    if (n === null) return "—"
    return `${Math.round(n * 10) / 10}%`
}

function formatMaybeScore(value: unknown): string {
    const n = getNumber(value)
    if (n === null) return "—"
    return String(Math.round(n * 100) / 100)
}

function extractApiMessage(payload: unknown): string {
    if (!isRecord(payload)) return ""
    const msg = getString(payload.message)
    const err = getString(payload.error)
    return msg || err || ""
}

function prettyValue(value: unknown): string {
    if (value === null) return "null"
    if (value === undefined) return "—"
    if (typeof value === "string") return value
    if (typeof value === "number" || typeof value === "boolean") return String(value)
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

function humanizeQuestionLabel(input: string): string {
    const raw = input.trim()
    if (!raw) return "Question"

    // prefer last segment for dotted paths
    const last = raw.includes(".") ? raw.split(".").filter(Boolean).slice(-1)[0] ?? raw : raw

    // split camelCase
    const withSpaces = last.replace(/([a-z])([A-Z])/g, "$1 $2")

    // normalize separators
    let s = withSpaces.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()

    // remove noisy prefixes
    s = s.replace(/^(question|q|ans|answer)\s*[:\-]?\s*/i, "")
    s = s.replace(/^(q)\s*(\d+)\s*/i, "Q$2 ")
    s = s.replace(/^\d+\s*[:\-]?\s*/i, "")

    // title-case
    const small = new Set(["a", "an", "and", "or", "of", "to", "in", "on", "for", "with"])
    const words = s.split(" ").filter(Boolean)
    const titled = words
        .map((w, i) => {
            const lower = w.toLowerCase()
            if (i !== 0 && small.has(lower)) return lower
            return lower.charAt(0).toUpperCase() + lower.slice(1)
        })
        .join(" ")

    return titled || "Question"
}

type NormalizedAnswer = {
    question: string
    answer: unknown
    score?: unknown
    max?: unknown
}

function normalizeStudentAnswers(answers: unknown): NormalizedAnswer[] {
    if (!answers) return []

    if (Array.isArray(answers)) {
        return answers
            .map<NormalizedAnswer | null>((raw): NormalizedAnswer | null => {
                if (!isRecord(raw)) return null

                const q =
                    getString(raw.question) ??
                    getString(raw.label) ??
                    getString(raw.prompt) ??
                    getString(raw.title) ??
                    getString(raw.name) ??
                    null

                const a: unknown =
                    raw.answer ??
                    raw.value ??
                    raw.response ??
                    raw.selected ??
                    raw.text ??
                    raw.result ??
                    null

                const score: unknown | undefined = raw.score ?? raw.points ?? raw.rating ?? undefined
                const max: unknown | undefined = raw.max ?? raw.max_score ?? raw.out_of ?? undefined

                return {
                    question: q ?? "Question",
                    answer: a,
                    score,
                    max,
                }
            })
            .filter((x): x is NormalizedAnswer => x !== null)
    }

    if (isRecord(answers)) {
        return Object.entries(answers).map(([k, v]) => {
            if (isRecord(v)) {
                const q =
                    getString(v.question) ??
                    getString(v.label) ??
                    getString(v.prompt) ??
                    getString(v.title) ??
                    getString(v.name) ??
                    null

                const a: unknown = v.answer ?? v.value ?? v.response ?? v.selected ?? v.text ?? v.result ?? v
                const score: unknown | undefined = v.score ?? v.points ?? v.rating ?? undefined
                const max: unknown | undefined = v.max ?? v.max_score ?? v.out_of ?? undefined

                return {
                    question: q ?? humanizeQuestionLabel(k),
                    answer: a,
                    score,
                    max,
                }
            }

            return {
                question: humanizeQuestionLabel(k),
                answer: v,
            }
        })
    }

    return [
        {
            question: "Answer",
            answer: answers,
        },
    ]
}

type StatusCounts = {
    total: number
    pending: number
    submitted: number
    locked: number
}

function normalizeTriStatus(value: unknown): "pending" | "submitted" | "locked" {
    const s = (getString(value) ?? "").toLowerCase()
    if (s === "submitted") return "submitted"
    if (s === "locked") return "locked"
    return "pending"
}

function computeStatusCounts(items: unknown[]): StatusCounts {
    const counts: StatusCounts = { total: items.length, pending: 0, submitted: 0, locked: 0 }
    for (const raw of items) {
        const row = isRecord(raw) ? raw : null
        const st = normalizeTriStatus(row?.status)
        if (st === "submitted") counts.submitted += 1
        else if (st === "locked") counts.locked += 1
        else counts.pending += 1
    }
    return counts
}

function readStatusCountsFromStudentBlock(studentBlock: Record<string, unknown> | null, studentItems: unknown[]): StatusCounts {
    const fallback = computeStatusCounts(studentItems)
    const rawCounts = studentBlock && isRecord(studentBlock.statusCounts) ? (studentBlock.statusCounts as Record<string, unknown>) : null
    if (!rawCounts) return fallback

    const total = getNumber(rawCounts.total)
    const pending = getNumber(rawCounts.pending)
    const submitted = getNumber(rawCounts.submitted)
    const locked = getNumber(rawCounts.locked)

    const safe: StatusCounts = {
        total: total !== null ? total : fallback.total,
        pending: pending !== null ? pending : fallback.pending,
        submitted: submitted !== null ? submitted : fallback.submitted,
        locked: locked !== null ? locked : fallback.locked,
    }

    // If backend didn't send totals (or sent zeros), keep the fallback.
    if (safe.total === 0 && fallback.total > 0) return fallback
    return safe
}

function pickPanelistPreviewItem(panelistItems: unknown[], selectedEvaluationId: string | null): Record<string, unknown> | null {
    if (!selectedEvaluationId) return null
    const target = selectedEvaluationId.toLowerCase()

    for (const raw of panelistItems) {
        const row = isRecord(raw) ? raw : null
        if (!row) continue

        const evaluation = isRecord(row.evaluation) ? (row.evaluation as Record<string, unknown>) : null
        const candidate =
            getString(evaluation?.id) ??
            getString(row.id) ??
            getString(row.evaluation_id) ??
            null

        if (candidate && candidate.toLowerCase() === target) return row
    }

    return null
}

/**
 * IMPORTANT FIX:
 * Some admin list variants may store a different "id" for the selected row (e.g. assignment id)
 * while student preview items use student_evaluation_id.
 *
 * We now:
 * 1) Prefer exact id match (student_evaluation_id / id),
 * 2) Fall back to matching by student user id (assignee) when id mismatches.
 */
function pickStudentPreviewItem(
    studentItems: unknown[],
    selectedEvaluationId: string | null,
    selectedStudentId: string | null,
): Record<string, unknown> | null {
    const evalId = selectedEvaluationId ? selectedEvaluationId.toLowerCase() : null
    const studentId = selectedStudentId ? selectedStudentId.toLowerCase() : null

    let fallbackByStudent: Record<string, unknown> | null = null

    for (const raw of studentItems) {
        const row = isRecord(raw) ? raw : null
        if (!row) continue

        // Admin rows can use: student_evaluation_id OR id. Prefer explicit student_evaluation_id when present.
        const candidateEvalId =
            (getString(row.student_evaluation_id)?.toLowerCase() ??
                getString(row.studentEvaluationId)?.toLowerCase() ??
                getString(row.id)?.toLowerCase() ??
                null)

        const candidateStudentId =
            getString(row.student_id)?.toLowerCase() ??
            getString(row.evaluator_id)?.toLowerCase() ??
            getString(row.user_id)?.toLowerCase() ??
            null

        if (evalId && candidateEvalId && candidateEvalId === evalId) return row

        if (studentId && candidateStudentId && candidateStudentId === studentId) {
            // keep best-effort fallback for the selected student
            fallbackByStudent = row
        }
    }

    return fallbackByStudent
}

/* ----------------------- STUDENT FEEDBACK SYNC (ADMIN UX) ----------------------- */

function isUuidLike(value: string): boolean {
    const v = value.trim()
    // permissive UUID check (v1-v5)
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

type StudentFeedbackScheduleResponse = {
    scheduleId?: string
    count?: number
    statusCounts?: {
        total?: number
        pending?: number
        submitted?: number
        locked?: number
    }
    message?: string
    error?: string
}

type StudentFeedbackAssignMeta = {
    usedFormId?: string | null
    usedFormTitle?: string | null
    usedFormVersion?: number | null
    repinned?: boolean
    warning?: string | null
    useActiveForm?: boolean
    forceActiveForm?: boolean
}

type StudentFeedbackAssignResponse = {
    scheduleId?: string
    groupId?: string
    formId?: string | null
    counts?: { created?: number; updated?: number; existing?: number }
    meta?: StudentFeedbackAssignMeta
    message?: string
    error?: string
    code?: string
}

type StudentFeedbackFormLite = {
    id: string
    key: string | null
    version: number | null
    title: string
    description: string | null
    active: boolean
}

type StudentFeedbackFormsListResponse = {
    items?: unknown
    count?: unknown
    warning?: unknown
    message?: unknown
    error?: unknown
}

type StudentFeedbackSchemaResponse = {
    seedAnswersTemplate?: unknown
    item?: unknown
    schema?: unknown
    warning?: unknown
    message?: unknown
    error?: unknown
}

type EvaluationPreviewScheduleMeta = {
    scheduleId: string | null
    groupTitle: string | null
    pinnedFormId: string | null
}

function normalizeStudentFeedbackForm(raw: unknown): StudentFeedbackFormLite | null {
    if (!isRecord(raw)) return null
    const id = getString(raw.id)
    if (!id) return null

    const title = getString(raw.title) ?? "Student Feedback Form"
    const key = getString(raw.key) ?? null
    const version = getNumber(raw.version)
    const description = raw.description === null ? null : (getString(raw.description) ?? null)
    const active = Boolean(raw.active)

    return {
        id,
        key,
        version,
        title,
        description,
        active,
    }
}

function safeTryRefreshCtx(ctx: AdminEvaluationsPageState) {
    const anyCtx = ctx as any

    const candidates: Array<{ fn: unknown; name: string }> = [
        { name: "refresh", fn: anyCtx.refresh },
        { name: "refetch", fn: anyCtx.refetch },
        { name: "reload", fn: anyCtx.reload },
        { name: "revalidate", fn: anyCtx.revalidate },
        { name: "invalidate", fn: anyCtx.invalidate },
        { name: "load", fn: anyCtx.load },
        { name: "fetchAll", fn: anyCtx.fetchAll },
        { name: "refreshAll", fn: anyCtx.refreshAll },
        { name: "mutate", fn: anyCtx.mutate },
        { name: "refreshData", fn: anyCtx.refreshData },
    ]

    for (const c of candidates) {
        if (typeof c.fn !== "function") continue
        try {
            c.fn()
            return
        } catch {
            // try next
        }
    }
}

function StudentFeedbackSyncCard({ ctx }: { ctx: AdminEvaluationsPageState }) {
    const anyCtx = ctx as any

    const guessedScheduleId: string | null =
        anyCtx?.selectedSchedule?.id ??
        anyCtx?.selectedScheduleId ??
        anyCtx?.selectedScheduleForAssignment?.id ??
        anyCtx?.scheduleId ??
        null

    const [scheduleId, setScheduleId] = React.useState<string>(guessedScheduleId ?? "")
    const [overwritePending, setOverwritePending] = React.useState(false)

    // NEW (ACTIVE FORM UX)
    const [forceActiveForm, setForceActiveForm] = React.useState(false)
    const [forms, setForms] = React.useState<StudentFeedbackFormLite[]>([])
    const [formsWarning, setFormsWarning] = React.useState<string | null>(null)
    const [loadingForms, setLoadingForms] = React.useState(false)

    const [seedAnswersTemplate, setSeedAnswersTemplate] = React.useState<Record<string, unknown> | null>(null)
    const [loadingSchema, setLoadingSchema] = React.useState(false)

    const [scheduleMeta, setScheduleMeta] = React.useState<EvaluationPreviewScheduleMeta>({
        scheduleId: null,
        groupTitle: null,
        pinnedFormId: null,
    })
    const [loadingScheduleMeta, setLoadingScheduleMeta] = React.useState(false)

    const [checking, setChecking] = React.useState(false)
    const [assigning, setAssigning] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [info, setInfo] = React.useState<StudentFeedbackScheduleResponse | null>(null)
    const [lastAssignMeta, setLastAssignMeta] = React.useState<StudentFeedbackAssignMeta | null>(null)

    React.useEffect(() => {
        if (!scheduleId && guessedScheduleId) setScheduleId(guessedScheduleId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [guessedScheduleId])

    const canUseSchedule = scheduleId.trim().length > 0 && isUuidLike(scheduleId)

    const formsById = React.useMemo(() => {
        const m = new Map<string, StudentFeedbackFormLite>()
        for (const f of forms) m.set(f.id, f)
        return m
    }, [forms])

    const activeForm = React.useMemo(() => {
        const act = forms.find((f) => f.active)
        return act ?? null
    }, [forms])

    const pinnedForm = React.useMemo(() => {
        if (!scheduleMeta.pinnedFormId) return null
        return formsById.get(scheduleMeta.pinnedFormId) ?? null
    }, [formsById, scheduleMeta.pinnedFormId])

    const pinnedVsActiveMismatch = React.useMemo(() => {
        if (!canUseSchedule) return false
        if (!activeForm?.id) return false
        if (!scheduleMeta.pinnedFormId) return false
        return scheduleMeta.pinnedFormId !== activeForm.id
    }, [activeForm?.id, canUseSchedule, scheduleMeta.pinnedFormId])

    const loadForms = React.useCallback(async () => {
        setLoadingForms(true)
        setFormsWarning(null)

        try {
            const res = await fetch(`/api/admin/student-feedback/forms`, { cache: "no-store" })
            let payload: unknown = {}
            try {
                payload = await res.json()
            } catch {
                payload = {}
            }

            if (!res.ok) {
                const msg = extractApiMessage(payload) || `Request failed (${res.status})`
                throw new Error(msg)
            }

            const p = payload as StudentFeedbackFormsListResponse
            const warning = getString(p.warning) ?? null
            if (warning) setFormsWarning(warning)

            const rawItems = (isRecord(payload) && Array.isArray((payload as any).items)) ? ((payload as any).items as unknown[]) : []
            const normalized = rawItems
                .map((it) => normalizeStudentFeedbackForm(it))
                .filter((x): x is StudentFeedbackFormLite => x !== null)

            setForms(normalized)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load student feedback forms."
            setForms([])
            setFormsWarning(null)
            toast.error("Forms load failed", { description: message })
        } finally {
            setLoadingForms(false)
        }
    }, [])

    const loadSchemaSeed = React.useCallback(async () => {
        setLoadingSchema(true)
        try {
            const res = await fetch(`/api/admin/student-feedback/schema`, { cache: "no-store" })
            let payload: unknown = {}
            try {
                payload = await res.json()
            } catch {
                payload = {}
            }

            if (!res.ok) {
                const msg = extractApiMessage(payload) || `Request failed (${res.status})`
                throw new Error(msg)
            }

            const p = payload as StudentFeedbackSchemaResponse
            const seed = p.seedAnswersTemplate
            if (isRecord(seed)) {
                setSeedAnswersTemplate(seed as Record<string, unknown>)
            } else {
                // keep null so assignment can still proceed (backend may handle defaults)
                setSeedAnswersTemplate(null)
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load seed answers template."
            setSeedAnswersTemplate(null)
            toast.error("Schema load failed", { description: message })
        } finally {
            setLoadingSchema(false)
        }
    }, [])

    const loadScheduleMeta = React.useCallback(async () => {
        const id = scheduleId.trim()
        if (!isUuidLike(id)) return

        setLoadingScheduleMeta(true)
        try {
            const qs = new URLSearchParams({
                includeStudentAnswers: "false",
                includePanelistScores: "false",
                includePanelistComments: "false",
            })

            const res = await fetch(`/api/admin/evaluation-previews/${id}?${qs.toString()}`, {
                cache: "no-store",
            })

            let payload: unknown = {}
            try {
                payload = await res.json()
            } catch {
                payload = {}
            }

            if (!res.ok) {
                const msg = extractApiMessage(payload) || `Request failed (${res.status})`
                throw new Error(msg)
            }

            const preview = isRecord(payload) && isRecord((payload as any).preview) ? ((payload as any).preview as Record<string, unknown>) : null
            const schedule = preview && isRecord(preview.schedule) ? (preview.schedule as Record<string, unknown>) : null

            const pinnedFormId =
                getString(schedule?.student_feedback_form_id) ??
                getString(schedule?.studentFeedbackFormId) ??
                null

            const groupTitle =
                getString(schedule?.group_title) ??
                getString(schedule?.groupTitle) ??
                null

            setScheduleMeta({
                scheduleId: id,
                groupTitle,
                pinnedFormId,
            })
        } catch {
            // best-effort only; do not block assignment UX
            setScheduleMeta((prev) => ({
                ...prev,
                scheduleId: id,
            }))
        } finally {
            setLoadingScheduleMeta(false)
        }
    }, [scheduleId])

    React.useEffect(() => {
        // Initial load for best UX
        void loadForms()
        void loadSchemaSeed()
    }, [loadForms, loadSchemaSeed])

    React.useEffect(() => {
        if (!canUseSchedule) return
        void loadScheduleMeta()
    }, [canUseSchedule, loadScheduleMeta])

    const doCheck = React.useCallback(async () => {
        const id = scheduleId.trim()
        if (!isUuidLike(id)) {
            setError("Please enter a valid Schedule ID (UUID).")
            setInfo(null)
            toast.error("Invalid Schedule ID", { description: "Schedule ID must be a valid UUID." })
            return
        }

        setChecking(true)
        setError(null)

        try {
            const res = await fetch(`/api/admin/student-feedback/schedule/${id}`, { cache: "no-store" })
            let payload: unknown = {}
            try {
                payload = await res.json()
            } catch {
                payload = {}
            }

            if (!res.ok) {
                const msg = extractApiMessage(payload) || `Request failed (${res.status})`
                throw new Error(msg)
            }

            setInfo(payload as StudentFeedbackScheduleResponse)

            // Also refresh pinned form metadata (best UX for “active form assignment”)
            void loadScheduleMeta()
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to check student feedback assignments."
            setError(message)
            setInfo(null)
            toast.error("Check failed", { description: message })
        } finally {
            setChecking(false)
        }
    }, [loadScheduleMeta, scheduleId])

    const doAssign = React.useCallback(async () => {
        const id = scheduleId.trim()
        if (!isUuidLike(id)) {
            toast.error("Invalid Schedule ID", { description: "Schedule ID must be a valid UUID." })
            return
        }

        setAssigning(true)
        setError(null)

        try {
            const res = await fetch(`/api/admin/student-feedback/schedule/${id}/assign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    // IMPORTANT: assignment should use ACTIVE feedback form (backend defaults true, we send explicitly for clarity)
                    useActiveForm: true,
                    forceActiveForm,
                    overwritePending,
                    // Best UX: seed answers template so students always see the active form structure immediately
                    ...(seedAnswersTemplate ? { seedAnswers: seedAnswersTemplate } : {}),
                }),
            })

            let payload: unknown = {}
            try {
                payload = await res.json()
            } catch {
                payload = {}
            }

            if (!res.ok) {
                const msg = extractApiMessage(payload) || `Request failed (${res.status})`
                throw new Error(msg)
            }

            const p = payload as StudentFeedbackAssignResponse
            const created = p.counts?.created ?? 0
            const updated = p.counts?.updated ?? 0
            const existing = p.counts?.existing ?? 0

            const meta = (p.meta && isRecord(p.meta) ? (p.meta as StudentFeedbackAssignMeta) : null) ?? null
            setLastAssignMeta(meta)

            const usedTitle = meta?.usedFormTitle ?? null
            const usedVersion = meta?.usedFormVersion ?? null
            const repinned = Boolean(meta?.repinned)
            const warning = meta?.warning ?? null

            const parts: string[] = []
            parts.push(`Created: ${created}`)
            parts.push(`Updated: ${updated}`)
            parts.push(`Existing: ${existing}`)

            if (usedTitle) parts.push(`Form: ${usedTitle}${typeof usedVersion === "number" ? ` (v${usedVersion})` : ""}`)
            else if (activeForm?.title) parts.push(`Form: ${activeForm.title}${typeof activeForm.version === "number" ? ` (v${activeForm.version})` : ""}`)

            if (repinned) parts.push("Pinned schedule → active form")
            if (warning) parts.push(warning)

            toast.success("Student feedback assigned (Active Form)", {
                description: parts.join(" • "),
            })

            // Refresh admin page datasets (best-effort) and re-check counts for immediate UI accuracy.
            safeTryRefreshCtx(ctx)
            await doCheck()
            await loadScheduleMeta()
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to assign student feedback."
            setError(message)
            toast.error("Assign failed", { description: message })
        } finally {
            setAssigning(false)
        }
    }, [activeForm?.title, activeForm?.version, ctx, doCheck, forceActiveForm, loadScheduleMeta, overwritePending, scheduleId, seedAnswersTemplate])

    const count = info?.count ?? info?.statusCounts?.total ?? 0
    const pending = info?.statusCounts?.pending ?? 0
    const submitted = info?.statusCounts?.submitted ?? 0
    const locked = info?.statusCounts?.locked ?? 0

    const showMissing = canUseSchedule && !checking && !error && (count ?? 0) === 0

    return (
        <Card>
            <CardHeader className="space-y-1">
                <CardTitle className="text-base">Student Feedback Assignment (Active Form)</CardTitle>
                <CardDescription>
                    Assign student feedback evaluations using the <span className="font-medium text-foreground">currently active</span> feedback form. This keeps student evaluations consistent per schedule (no mixed versions).
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
                {formsWarning ? (
                    <Alert>
                        <AlertTitle>Forms storage warning</AlertTitle>
                        <AlertDescription>{formsWarning}</AlertDescription>
                    </Alert>
                ) : null}

                {!loadingForms && forms.length === 0 ? (
                    <Alert variant="destructive">
                        <AlertTitle>No active feedback form detected</AlertTitle>
                        <AlertDescription>
                            Student evaluation assignment requires an <span className="font-medium">active</span> feedback form.
                            Please create/activate a feedback form in the admin feedback forms area, then return here to assign evaluations.
                        </AlertDescription>
                    </Alert>
                ) : null}

                <div className="grid gap-3 md:grid-cols-3">
                    <div className="md:col-span-2 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <Label htmlFor="scheduleId">Schedule ID</Label>
                            <div className="flex items-center gap-2">
                                {guessedScheduleId ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setScheduleId(guessedScheduleId)
                                            toast.message("Using selected schedule", { description: "Schedule ID was filled from your current admin selection." })
                                        }}
                                        disabled={assigning || checking}
                                    >
                                        Use selected
                                    </Button>
                                ) : null}
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        void loadForms()
                                        void loadSchemaSeed()
                                        if (canUseSchedule) void loadScheduleMeta()
                                        toast.message("Refreshing active form data", { description: "Reloading active feedback form and seed template." })
                                    }}
                                    disabled={assigning || checking || loadingForms || loadingSchema}
                                >
                                    Refresh forms
                                </Button>
                            </div>
                        </div>

                        <Input
                            id="scheduleId"
                            value={scheduleId}
                            onChange={(e) => setScheduleId(e.target.value)}
                            placeholder="Paste defense schedule UUID..."
                        />

                        {!scheduleId.trim() ? (
                            <p className="text-xs text-muted-foreground">
                                Tip: open any evaluation preview, copy the <span className="font-medium text-foreground">Schedule ID</span>, then paste here.
                            </p>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-2">
                            {loadingForms ? (
                                <div className="h-6 w-44 animate-pulse rounded-md bg-muted/60" />
                            ) : activeForm ? (
                                <Badge variant="secondary">
                                    Active Form: {activeForm.title}{typeof activeForm.version === "number" ? ` (v${activeForm.version})` : ""}
                                </Badge>
                            ) : (
                                <Badge variant="destructive">Active Form: Not found</Badge>
                            )}

                            {loadingScheduleMeta ? (
                                <div className="h-6 w-40 animate-pulse rounded-md bg-muted/60" />
                            ) : scheduleMeta.groupTitle ? (
                                <Badge variant="secondary">Group: {scheduleMeta.groupTitle}</Badge>
                            ) : null}

                            {loadingScheduleMeta ? null : scheduleMeta.pinnedFormId ? (
                                pinnedForm ? (
                                    <Badge variant={pinnedForm.active ? "secondary" : "outline"}>
                                        Pinned Form: {pinnedForm.title}{typeof pinnedForm.version === "number" ? ` (v${pinnedForm.version})` : ""}
                                    </Badge>
                                ) : (
                                    <Badge variant="outline">Pinned Form ID: {scheduleMeta.pinnedFormId}</Badge>
                                )
                            ) : canUseSchedule ? (
                                <Badge variant="outline">Pinned Form: (none yet)</Badge>
                            ) : null}

                            {pinnedVsActiveMismatch ? (
                                <Badge variant="destructive">Pinned ≠ Active</Badge>
                            ) : null}
                        </div>

                        {pinnedVsActiveMismatch ? (
                            <Alert>
                                <AlertTitle>Schedule is pinned to a different form</AlertTitle>
                                <AlertDescription>
                                    This schedule is pinned to a different feedback form than the current active form. When you click{" "}
                                    <span className="font-medium text-foreground">Assign now</span>, the system will repin to the active form{" "}
                                    <span className="font-medium text-foreground">only if it’s safe</span> (no submitted/locked student feedback yet).
                                    If there are already submitted/locked evaluations, it will keep the pinned form to prevent mixed-version data.
                                </AlertDescription>
                            </Alert>
                        ) : null}

                        {lastAssignMeta?.warning ? (
                            <Alert>
                                <AlertTitle>Assignment notice</AlertTitle>
                                <AlertDescription>{lastAssignMeta.warning}</AlertDescription>
                            </Alert>
                        ) : null}
                    </div>

                    <div className="space-y-2">
                        <Label className="block">Options</Label>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between rounded-md border p-3">
                                <div className="space-y-0.5">
                                    <p className="text-sm font-medium">Overwrite pending</p>
                                    <p className="text-xs text-muted-foreground">Re-seed pending feedback only</p>
                                </div>
                                <Switch
                                    checked={overwritePending}
                                    onCheckedChange={(v) => setOverwritePending(Boolean(v))}
                                />
                            </div>

                            <div className="flex items-center justify-between rounded-md border p-3">
                                <div className="space-y-0.5">
                                    <p className="text-sm font-medium">Force active form</p>
                                    <p className="text-xs text-muted-foreground">Fail if schedule has submitted/locked</p>
                                </div>
                                <Switch
                                    checked={forceActiveForm}
                                    onCheckedChange={(v) => setForceActiveForm(Boolean(v))}
                                />
                            </div>

                            {forceActiveForm ? (
                                <Alert variant="destructive">
                                    <AlertTitle>Force mode enabled</AlertTitle>
                                    <AlertDescription>
                                        If this schedule already has <span className="font-medium">submitted/locked</span> student feedback,
                                        assignment will fail (409) instead of falling back to the pinned form. Use only when you intend
                                        to keep strict “active form only” consistency.
                                    </AlertDescription>
                                </Alert>
                            ) : null}

                            <div className="rounded-md border p-3">
                                <p className="text-sm font-medium">Seed template</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {loadingSchema ? "Loading seed answers template..." : seedAnswersTemplate ? "Ready (active schema template loaded)" : "Not loaded (assignment may still work)"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>Student feedback assignment failed</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                {canUseSchedule && info && !checking ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">Total: {count}</Badge>
                        <Badge variant="secondary">Pending: {pending}</Badge>
                        <Badge variant="secondary">Submitted: {submitted}</Badge>
                        <Badge variant="secondary">Locked: {locked}</Badge>
                    </div>
                ) : null}

                {showMissing ? (
                    <Alert>
                        <AlertTitle>No student feedback assignments found</AlertTitle>
                        <AlertDescription>
                            Students <span className="font-medium text-foreground">cannot submit feedback</span> unless a feedback form is assigned to them for this schedule.
                            Click <span className="font-medium text-foreground">Assign now</span> to create the missing assignments using the active form.
                        </AlertDescription>
                    </Alert>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => void doCheck()}
                        disabled={!canUseSchedule || checking || assigning}
                    >
                        {checking ? "Checking..." : "Check assignments"}
                    </Button>

                    <Button
                        onClick={() => void doAssign()}
                        disabled={!canUseSchedule || assigning || checking || (forms.length > 0 && !activeForm)}
                    >
                        {assigning ? "Assigning..." : "Assign now"}
                    </Button>

                    <Button
                        variant="ghost"
                        onClick={() => {
                            safeTryRefreshCtx(ctx)
                            toast.message("Refreshing page data", {
                                description: "If student feedback still shows missing, click “Check assignments” to verify the backend state.",
                            })
                        }}
                        disabled={checking || assigning}
                    >
                        Refresh page data
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

function AdminEvaluationPreviewDialog({ ctx }: { ctx: AdminEvaluationsPageState }) {
    const {
        viewOpen,
        setViewOpen,

        selectedViewEvaluation,
        selectedViewSchedule,
        selectedViewEvaluator,

        openEditForm,
        runAction,
        busyKey,

        formatDateTime,
        compactString,
        toTitleCase,
        normalizeStatus,
        roleLabel,
        resolveGroupNameFromSchedule,
    } = ctx

    const scheduleId = selectedViewEvaluation?.schedule_id ?? null
    const selectedKind = selectedViewEvaluation?.kind ?? null
    const selectedEvaluationId = selectedViewEvaluation?.id ?? null
    const selectedAssigneeId = selectedViewEvaluation?.evaluator_id ?? null

    const [includeStudentAnswers, setIncludeStudentAnswers] = React.useState(true)
    const [includePanelistScores, setIncludePanelistScores] = React.useState(true)
    const [includePanelistComments, setIncludePanelistComments] = React.useState(true)

    const [loadingPreview, setLoadingPreview] = React.useState(false)
    const [previewError, setPreviewError] = React.useState<string | null>(null)
    const [previewData, setPreviewData] = React.useState<PreviewResponse | null>(null)

    React.useEffect(() => {
        if (!viewOpen) return
        // sensible defaults per flow
        if (selectedKind === "panelist") {
            setIncludePanelistScores(true)
            setIncludePanelistComments(true)
        } else {
            setIncludeStudentAnswers(true)
        }
    }, [selectedKind, viewOpen])

    const fetchPreview = React.useCallback(
        async (signal?: AbortSignal) => {
            if (!scheduleId) return

            setLoadingPreview(true)
            setPreviewError(null)

            try {
                const qs = new URLSearchParams({
                    includeStudentAnswers: String(includeStudentAnswers),
                    includePanelistScores: String(includePanelistScores),
                    includePanelistComments: String(includePanelistComments),
                })

                const res = await fetch(`/api/admin/evaluation-previews/${scheduleId}?${qs.toString()}`, {
                    cache: "no-store",
                    signal,
                })

                let payload: unknown = {}
                try {
                    payload = await res.json()
                } catch {
                    payload = {}
                }

                if (!res.ok) {
                    const msg = extractApiMessage(payload) || `Request failed (${res.status})`
                    throw new Error(msg)
                }

                setPreviewData(payload as PreviewResponse)
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return
                const message = err instanceof Error ? err.message : "Failed to load preview."
                setPreviewError(message)
                toast.error("Preview failed", { description: message })
            } finally {
                setLoadingPreview(false)
            }
        },
        [includePanelistComments, includePanelistScores, includeStudentAnswers, scheduleId],
    )

    React.useEffect(() => {
        if (!viewOpen || !scheduleId) return
        const controller = new AbortController()
        void fetchPreview(controller.signal)
        return () => controller.abort()
    }, [fetchPreview, scheduleId, viewOpen])

    React.useEffect(() => {
        if (!viewOpen) {
            setPreviewError(null)
            setPreviewData(null)
            setLoadingPreview(false)
        }
    }, [viewOpen])

    const preview = previewData && isRecord(previewData.preview) ? (previewData.preview as Record<string, unknown>) : null

    const studentBlock = preview && isRecord(preview.student) ? (preview.student as Record<string, unknown>) : null
    const studentItems = studentBlock && Array.isArray(studentBlock.items) ? (studentBlock.items as unknown[]) : []

    const panelistBlock = preview && isRecord(preview.panelist) ? (preview.panelist as Record<string, unknown>) : null
    const panelistItems = panelistBlock && Array.isArray(panelistBlock.items) ? (panelistBlock.items as unknown[]) : []

    const studentCounts = React.useMemo(() => {
        return readStatusCountsFromStudentBlock(studentBlock, studentItems)
    }, [studentBlock, studentItems])

    const currentStatus = selectedViewEvaluation ? normalizeStatus(selectedViewEvaluation.status) : null

    const selectedPanelistPreview = React.useMemo(() => {
        if (selectedKind !== "panelist") return null
        return pickPanelistPreviewItem(panelistItems, selectedEvaluationId)
    }, [panelistItems, selectedEvaluationId, selectedKind])

    const selectedStudentPreview = React.useMemo(() => {
        if (selectedKind !== "student") return null
        return pickStudentPreviewItem(studentItems, selectedEvaluationId, selectedAssigneeId)
    }, [selectedAssigneeId, selectedEvaluationId, selectedKind, studentItems])

    const headerTitle =
        selectedKind === "panelist"
            ? "Panelist Rubric Preview"
            : selectedKind === "student"
                ? "Student Feedback Preview"
                : "Evaluation Preview"

    const headerDescription =
        selectedKind === "panelist"
            ? "This preview is strictly the selected panelist’s rubric scoring (criteria + scores). Student feedback evaluations are a separate flow and have their own preview."
            : selectedKind === "student"
                ? "This preview is strictly the selected student’s feedback evaluation (questions + answers). Status shows Pending/Submitted/Locked — scores only appear when the backend provides a computed summary."
                : "Preview is limited to the selected evaluation assignment."

    function renderPanelistPreview(row: Record<string, unknown>) {
        const evaluation = isRecord(row.evaluation) ? (row.evaluation as Record<string, unknown>) : {}
        const evalId = getString(evaluation.id) ?? selectedEvaluationId ?? "—"

        const status = getString(evaluation.status) ?? "pending"
        const statusNorm = normalizeStatus(status)

        const overall = isRecord(row.overall) ? (row.overall as Record<string, unknown>) : null
        const overallPct =
            (overall?.percentage ??
                overall?.overall_percentage ??
                overall?.score_percentage ??
                row.overall_percentage ??
                row.score_percentage ??
                row.percentage) ??
            null

        const targets = Array.isArray(row.targets) ? (row.targets as unknown[]) : []
        const scores = Array.isArray(row.scores) ? (row.scores as unknown[]) : []

        const groupedByTarget = new Map<string, { title: string; type: string; items: Record<string, unknown>[] }>()
        for (const sRaw of scores) {
            const s = isRecord(sRaw) ? (sRaw as Record<string, unknown>) : {}
            const tType = getString(s.target_type) ?? "unknown"
            const tId = getString(s.target_id) ?? "unknown"
            const tName = getString(s.target_name) ?? (tType === "group" ? "Thesis Group" : "Student")
            const key = `${tType}:${tId}`

            if (!groupedByTarget.has(key)) {
                groupedByTarget.set(key, { title: tName, type: tType, items: [] })
            }
            groupedByTarget.get(key)!.items.push(s)
        }

        const targetGroups = Array.from(groupedByTarget.values()).sort((a, b) => {
            const aP = a.type === "group" ? 0 : 1
            const bP = b.type === "group" ? 0 : 1
            if (aP !== bP) return aP - bP
            return a.title.localeCompare(b.title)
        })

        return (
            <div className="space-y-3">
                <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={[
                                "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                statusBadgeClass(statusNorm),
                            ].join(" ")}
                        >
                            {toTitleCase(statusNorm)}
                        </span>

                        <span className="inline-flex rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                            Overall: {formatPercent(overallPct)}
                        </span>

                        <span className="inline-flex rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                            Targets: {targets.length}
                        </span>

                        <span className="ml-auto text-xs text-muted-foreground">
                            Evaluation ID: <span className="font-medium text-foreground">{evalId}</span>
                        </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                        Rubric scoring can include <span className="font-medium text-foreground">group</span> and{" "}
                        <span className="font-medium text-foreground">individual student</span> targets. These are rubric targets (not student feedback evaluations).
                    </p>
                </div>

                <div className="rounded-md border p-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-medium">Rubric Targets Summary</p>
                        <p className="text-xs text-muted-foreground">
                            {targets.length} target(s) • {includePanelistScores ? "scores included" : "scores hidden"}
                        </p>
                    </div>

                    {targets.length === 0 ? (
                        <div className="mt-2 text-sm text-muted-foreground">No rubric targets available yet.</div>
                    ) : (
                        <div className="mt-2 overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-60">Target</TableHead>
                                        <TableHead className="min-w-28">Target Type</TableHead>
                                        <TableHead className="min-w-32">Criteria Scored</TableHead>
                                        <TableHead className="min-w-32">Percentage</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {targets.map((tRaw: unknown, tIdx: number) => {
                                        const t = isRecord(tRaw) ? (tRaw as Record<string, unknown>) : {}
                                        const tName = getString(t.target_name) ?? "Unnamed target"
                                        const tTypeRaw = getString(t.target_type) ?? "—"
                                        const tType =
                                            normalizeStatus(tTypeRaw) === "student"
                                                ? "Individual Student"
                                                : normalizeStatus(tTypeRaw) === "group"
                                                    ? "Thesis Group"
                                                    : toTitleCase(tTypeRaw)
                                        const criteria = getNumber(t.criteria_scored)
                                        const pct = t.percentage
                                        return (
                                            <TableRow key={`${evalId}-t-${tIdx}`}>
                                                <TableCell className="font-medium">{tName}</TableCell>
                                                <TableCell className="text-muted-foreground">{tType}</TableCell>
                                                <TableCell className="text-muted-foreground">{criteria ?? "—"}</TableCell>
                                                <TableCell className="text-muted-foreground">{formatPercent(pct)}</TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>

                <div className="rounded-md border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-0.5">
                            <p className="text-sm font-medium">Rubric Scores</p>
                            <p className="text-xs text-muted-foreground">
                                Criteria from the rubric template with scores (and optional comments).
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                size="sm"
                                variant={includePanelistScores ? "default" : "outline"}
                                onClick={() => setIncludePanelistScores((v) => !v)}
                            >
                                {includePanelistScores ? "Scores: ON" : "Scores: OFF"}
                            </Button>

                            <Button
                                size="sm"
                                variant={includePanelistComments ? "default" : "outline"}
                                onClick={() => setIncludePanelistComments((v) => !v)}
                                disabled={!includePanelistScores}
                            >
                                {includePanelistComments ? "Comments: ON" : "Comments: OFF"}
                            </Button>
                        </div>
                    </div>

                    {!includePanelistScores ? (
                        <div className="mt-2 text-sm text-muted-foreground">Rubric scores are currently hidden.</div>
                    ) : scores.length === 0 ? (
                        <div className="mt-2 text-sm text-muted-foreground">No rubric scores recorded yet.</div>
                    ) : targetGroups.length === 0 ? (
                        <div className="mt-2 text-sm text-muted-foreground">No grouped rubric scores available.</div>
                    ) : (
                        <Accordion type="multiple" className="mt-3 w-full">
                            {targetGroups.map((g, gIdx) => (
                                <AccordionItem key={`${evalId}-g-${gIdx}`} value={`${evalId}-g-${gIdx}`} className="rounded-lg border px-0">
                                    <AccordionTrigger className="px-3 py-3 hover:no-underline">
                                        <div className="flex w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between">
                                            <p className="truncate text-sm font-semibold">{g.title}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {g.type === "student" ? "Individual Student" : g.type === "group" ? "Thesis Group" : toTitleCase(g.type)} •{" "}
                                                {g.items.length} criterion item(s)
                                            </p>
                                        </div>
                                    </AccordionTrigger>

                                    <AccordionContent className="px-3 pb-3">
                                        <div className="overflow-x-auto rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead className="min-w-72">Criterion</TableHead>
                                                        <TableHead className="min-w-24">Score</TableHead>
                                                        <TableHead className="min-w-24">Max</TableHead>
                                                        <TableHead className="min-w-24">Weight</TableHead>
                                                        {includePanelistComments ? <TableHead className="min-w-96">Comment</TableHead> : null}
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {g.items.map((s, sIdx) => {
                                                        const criterion = getString(s.criterion) ?? "—"
                                                        const score = getNumber(s.score)
                                                        const maxScore = getNumber(s.max_score)
                                                        const weight = s.weight
                                                        const comment = includePanelistComments ? getString(s.comment) : null

                                                        return (
                                                            <TableRow key={`${evalId}-g-${gIdx}-s-${sIdx}`}>
                                                                <TableCell>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-sm font-medium">{criterion}</p>
                                                                        {getString(s.criterion_description) ? (
                                                                            <p className="text-xs text-muted-foreground">
                                                                                {getString(s.criterion_description)}
                                                                            </p>
                                                                        ) : null}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-muted-foreground">{score ?? "—"}</TableCell>
                                                                <TableCell className="text-muted-foreground">{maxScore ?? "—"}</TableCell>
                                                                <TableCell className="text-muted-foreground">{formatMaybeScore(weight)}</TableCell>
                                                                {includePanelistComments ? (
                                                                    <TableCell className="text-muted-foreground">
                                                                        <div className="max-h-24 overflow-y-auto whitespace-pre-wrap wrap-break-word">
                                                                            {comment ?? "—"}
                                                                        </div>
                                                                    </TableCell>
                                                                ) : null}
                                                            </TableRow>
                                                        )
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    )}
                </div>
            </div>
        )
    }

    function renderStudentPreview(row: Record<string, unknown>) {
        const studentId =
            getString(row.student_id) ??
            getString(row.evaluator_id) ??
            getString(row.user_id) ??
            selectedAssigneeId ??
            null

        const studentName =
            getString(row.student_name) ??
            getString(row.name) ??
            getString(row.student_email) ??
            compactString(selectedViewEvaluator?.name) ??
            compactString(selectedViewEvaluator?.email) ??
            "Student"

        const studentEmail = getString(row.student_email) ?? getString(row.email) ?? compactString(selectedViewEvaluator?.email)

        const status = getString(row.status) ?? "pending"
        const statusNorm = normalizeStatus(status)
        const isPending = statusNorm === "pending"

        const submittedAt = getString(row.submitted_at) ?? null
        const lockedAt = getString(row.locked_at) ?? null
        const createdAt = getString(row.created_at) ?? null

        const scoreTotalRaw = row.score_total ?? row.total_score ?? row.total
        const scoreMaxRaw = row.score_max ?? row.max_score ?? row.max
        const scorePercentRaw = row.score_percentage ?? row.percentage

        const scoreTotal = getNumber(scoreTotalRaw)
        const scoreMax = getNumber(scoreMaxRaw)
        const scorePercent = getNumber(scorePercentRaw)

        // IMPORTANT UX FIX:
        // - Pending items should NOT show "0%" (it reads like a missing submission).
        // - Only show score summary when backend provides a meaningful max/summary.
        const hasMeaningfulMax = !isPending && scoreMax !== null && scoreMax > 0
        const hasMeaningfulTotal = hasMeaningfulMax && scoreTotal !== null
        const computedPercent = hasMeaningfulTotal ? (scoreTotal! / scoreMax!) * 100 : null
        const displayPercent =
            hasMeaningfulMax
                ? (scorePercent !== null ? scorePercent : computedPercent)
                : null

        const answersRaw = row.answers ?? row.responses ?? row.feedback ?? null
        const normalizedAnswers = normalizeStudentAnswers(answersRaw)
        const hasAnswers = normalizedAnswers.length > 0

        const scoreHeaderLabel =
            isPending
                ? "Awaiting submission"
                : displayPercent === null
                    ? "Submitted (no score summary)"
                    : `Score: ${formatPercent(displayPercent)}`

        return (
            <div className="space-y-3">
                <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={[
                                "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                statusBadgeClass(statusNorm),
                            ].join(" ")}
                        >
                            {toTitleCase(statusNorm)}
                        </span>

                        <span className="inline-flex rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                            {scoreHeaderLabel}
                        </span>

                        <span className="ml-auto text-xs text-muted-foreground">
                            Student ID: <span className="font-medium text-foreground">{studentId ?? "—"}</span>
                        </span>
                    </div>

                    <div className="mt-2">
                        <p className="text-sm font-semibold">{studentName}</p>
                        <p className="text-xs text-muted-foreground">{studentEmail ?? "No email"}</p>
                    </div>

                    {isPending ? (
                        <div className="mt-3 rounded-md border border-muted-foreground/30 bg-muted/30 p-3 text-sm text-muted-foreground">
                            This feedback is <span className="font-medium text-foreground">Pending</span>. The student hasn’t submitted answers yet, so score summary is hidden to avoid showing misleading “0”.
                        </div>
                    ) : displayPercent === null ? (
                        <div className="mt-3 rounded-md border border-muted-foreground/30 bg-muted/30 p-3 text-sm text-muted-foreground">
                            This feedback is <span className="font-medium text-foreground">{toTitleCase(statusNorm)}</span>. Answers can still be reviewed below. If you expect a computed score summary, click{" "}
                            <span className="font-medium text-foreground">Refresh Preview</span>.
                        </div>
                    ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="mt-1 text-sm font-semibold">{hasMeaningfulTotal ? formatMaybeScore(scoreTotal) : "—"}</p>
                    </div>
                    <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Max</p>
                        <p className="mt-1 text-sm font-semibold">{hasMeaningfulMax ? formatMaybeScore(scoreMax) : "—"}</p>
                    </div>
                    <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Percentage</p>
                        <p className="mt-1 text-sm font-semibold">{displayPercent === null ? "—" : formatPercent(displayPercent)}</p>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Created</p>
                        <p className="mt-1 text-sm font-semibold">{formatDateTime(createdAt)}</p>
                    </div>
                    <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Submitted</p>
                        <p className="mt-1 text-sm font-semibold">{formatDateTime(submittedAt)}</p>
                    </div>
                    <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Locked</p>
                        <p className="mt-1 text-sm font-semibold">{formatDateTime(lockedAt)}</p>
                    </div>
                </div>

                <div className="rounded-md border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-0.5">
                            <p className="text-sm font-medium">Feedback Answers</p>
                            <p className="text-xs text-muted-foreground">
                                Questions are shown with human-friendly labels (not raw attribute keys).
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                size="sm"
                                variant={includeStudentAnswers ? "default" : "outline"}
                                onClick={() => setIncludeStudentAnswers((v) => !v)}
                            >
                                {includeStudentAnswers ? "Answers: ON" : "Answers: OFF"}
                            </Button>
                        </div>
                    </div>

                    {!includeStudentAnswers ? (
                        <div className="mt-2 text-sm text-muted-foreground">Student answers are currently hidden.</div>
                    ) : !hasAnswers ? (
                        <div className="mt-2 text-sm text-muted-foreground">
                            {isPending ? "No answers yet (still pending submission)." : "No feedback answers available for this submission."}
                        </div>
                    ) : (
                        <div className="mt-3 max-h-96 overflow-y-auto rounded-md border bg-muted/10 p-2">
                            <div className="space-y-2">
                                {normalizedAnswers.map((a, idx) => {
                                    const q = a.question ? a.question : `Question ${idx + 1}`
                                    const score = a.score
                                    const max = a.max

                                    return (
                                        <div key={`ans-${idx}`} className="rounded-md border bg-card p-3">
                                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                                <p className="text-sm font-semibold">{q}</p>
                                                {score !== undefined || max !== undefined ? (
                                                    <span className="inline-flex rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                                                        Score: {formatMaybeScore(score)}{max !== undefined ? ` / ${formatMaybeScore(max)}` : ""}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <pre className="mt-2 whitespace-pre-wrap wrap-break-word text-sm text-muted-foreground">
                                                {prettyValue(a.answer)}
                                            </pre>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    return (
        <Dialog
            open={viewOpen}
            onOpenChange={(open) => {
                setViewOpen(open)
            }}
        >
            <DialogContent className="sm:max-w-5xl h-[85svh] flex flex-col overflow-hidden">
                {selectedViewEvaluation ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>{headerTitle}</DialogTitle>
                            <DialogDescription>{headerDescription}</DialogDescription>
                        </DialogHeader>

                        <div className="flex-1 overflow-y-auto pr-2">
                            <div className="space-y-4">
                                <div className="rounded-lg border bg-muted/30 p-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium">Assignment Status</span>
                                        <span
                                            className={[
                                                "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                statusBadgeClass(selectedViewEvaluation.status),
                                            ].join(" ")}
                                        >
                                            {toTitleCase(normalizeStatus(selectedViewEvaluation.status))}
                                        </span>

                                        <span className="inline-flex rounded-md border px-2 py-1 text-xs font-medium">
                                            {selectedViewEvaluation.assignee_role === "student"
                                                ? "Student Feedback Flow"
                                                : "Panelist Rubric Flow"}
                                        </span>

                                        <span className="ml-auto text-xs text-muted-foreground">
                                            Schedule ID: <span className="font-medium text-foreground">{scheduleId}</span>
                                        </span>
                                    </div>

                                    {selectedKind === "student" && studentCounts.total > 0 ? (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <span className="inline-flex rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                                                Student Feedback • Total: <span className="ml-1 font-medium text-foreground">{studentCounts.total}</span>
                                            </span>
                                            <span className="inline-flex rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                                                Pending: <span className="ml-1 font-medium text-foreground">{studentCounts.pending}</span>
                                            </span>
                                            <span className="inline-flex rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                                                Submitted: <span className="ml-1 font-medium text-foreground">{studentCounts.submitted}</span>
                                            </span>
                                            <span className="inline-flex rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                                                Locked: <span className="ml-1 font-medium text-foreground">{studentCounts.locked}</span>
                                            </span>
                                        </div>
                                    ) : null}
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-lg border p-3">
                                        <p className="text-xs font-medium text-muted-foreground">Thesis Group</p>
                                        <p className="mt-1 text-sm font-medium">{resolveGroupNameFromSchedule(selectedViewSchedule)}</p>
                                    </div>

                                    <div className="rounded-lg border p-3">
                                        <p className="text-xs font-medium text-muted-foreground">Schedule</p>
                                        <p className="mt-1 text-sm">
                                            {selectedViewSchedule ? formatDateTime(selectedViewSchedule.scheduled_at) : "Schedule unavailable"}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {compactString(selectedViewSchedule?.room) ?? "No room assigned"}
                                            {selectedViewSchedule?.status ? ` • ${toTitleCase(selectedViewSchedule.status)}` : ""}
                                        </p>
                                    </div>

                                    <div className="rounded-lg border p-3">
                                        <p className="text-xs font-medium text-muted-foreground">Assignee</p>
                                        <p className="mt-1 text-sm font-medium">
                                            {compactString(selectedViewEvaluator?.name) ??
                                                compactString(selectedViewEvaluator?.email) ??
                                                "Unknown Assignee"}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {[
                                                compactString(selectedViewEvaluator?.email),
                                                selectedViewEvaluator ? roleLabel(selectedViewEvaluator.role) : null,
                                            ]
                                                .filter((part): part is string => !!part)
                                                .join(" • ") || "—"}
                                        </p>
                                    </div>

                                    <div className="rounded-lg border p-3">
                                        <p className="text-xs font-medium text-muted-foreground">Timeline</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Created: {formatDateTime(selectedViewEvaluation.created_at)}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Submitted: {formatDateTime(selectedViewEvaluation.submitted_at)}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Locked: {formatDateTime(selectedViewEvaluation.locked_at)}
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-lg border bg-card p-3">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-medium">Preview</p>
                                            <p className="text-xs text-muted-foreground">
                                                Preview is strictly scoped to the selected assignment (no mixed flow UI).
                                            </p>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => void fetchPreview()}
                                                disabled={loadingPreview || !scheduleId}
                                            >
                                                {loadingPreview ? "Loading..." : "Refresh Preview"}
                                            </Button>
                                        </div>
                                    </div>

                                    {previewError ? (
                                        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                                            {previewError}
                                        </div>
                                    ) : null}

                                    {loadingPreview ? (
                                        <div className="mt-3 space-y-2">
                                            {Array.from({ length: 4 }).map((_, i) => (
                                                <div key={`preview-skel-${i}`} className="h-10 w-full animate-pulse rounded-md bg-muted/60" />
                                            ))}
                                        </div>
                                    ) : null}

                                    {!loadingPreview && !previewError ? (
                                        <div className="mt-4">
                                            {selectedKind === "panelist" ? (
                                                selectedPanelistPreview ? (
                                                    renderPanelistPreview(selectedPanelistPreview)
                                                ) : (
                                                    <div className="rounded-md border p-4 text-sm text-muted-foreground">
                                                        No matching panelist preview found for this assignment. Try{" "}
                                                        <span className="font-medium text-foreground">Refresh Preview</span>, or verify the evaluation exists.
                                                    </div>
                                                )
                                            ) : selectedKind === "student" ? (
                                                selectedStudentPreview ? (
                                                    renderStudentPreview(selectedStudentPreview)
                                                ) : (
                                                    <div className="rounded-md border p-4 text-sm text-muted-foreground">
                                                        No matching student feedback preview found for this assignment. Try{" "}
                                                        <span className="font-medium text-foreground">Refresh Preview</span>, or verify the student evaluation exists.
                                                    </div>
                                                )
                                            ) : (
                                                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                                                    Unknown evaluation kind. Please refresh the page.
                                                </div>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setViewOpen(false)
                                    openEditForm(selectedViewEvaluation)
                                }}
                            >
                                Edit Assignment
                            </Button>

                            <div className="flex flex-wrap items-center justify-end gap-2">
                                {currentStatus !== "pending" ? (
                                    <Button
                                        variant="outline"
                                        onClick={() => void runAction(selectedViewEvaluation, "set-pending")}
                                        disabled={busyKey === `${selectedViewEvaluation.kind}:${selectedViewEvaluation.id}:set-pending`}
                                    >
                                        {busyKey === `${selectedViewEvaluation.kind}:${selectedViewEvaluation.id}:set-pending`
                                            ? "Updating..."
                                            : "Set Pending"}
                                    </Button>
                                ) : null}

                                {currentStatus === "pending" ? (
                                    <Button
                                        variant="outline"
                                        onClick={() => void runAction(selectedViewEvaluation, "submit")}
                                        disabled={busyKey === `${selectedViewEvaluation.kind}:${selectedViewEvaluation.id}:submit`}
                                    >
                                        {busyKey === `${selectedViewEvaluation.kind}:${selectedViewEvaluation.id}:submit`
                                            ? "Submitting..."
                                            : "Submit"}
                                    </Button>
                                ) : null}

                                {currentStatus !== "locked" ? (
                                    <Button
                                        onClick={() => void runAction(selectedViewEvaluation, "lock")}
                                        disabled={busyKey === `${selectedViewEvaluation.kind}:${selectedViewEvaluation.id}:lock`}
                                    >
                                        {busyKey === `${selectedViewEvaluation.kind}:${selectedViewEvaluation.id}:lock`
                                            ? "Locking..."
                                            : "Lock Evaluation"}
                                    </Button>
                                ) : (
                                    <Button variant="outline" onClick={() => setViewOpen(false)}>
                                        Close
                                    </Button>
                                )}
                            </div>
                        </DialogFooter>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>Evaluation Not Available</DialogTitle>
                            <DialogDescription>
                                This evaluation is no longer available. It may have been deleted or moved.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button onClick={() => setViewOpen(false)}>Close</Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}

export default function AdminEvaluationsPage() {
    const ctx = useAdminEvaluationsPage()

    return (
        <DashboardLayout
            title="Evaluations"
            description="Assign panelist rubric scoring and student feedback in distinct flows, then manage lifecycle and status in one user-friendly workspace."
        >
            <div className="space-y-4">
                <StudentFeedbackSyncCard ctx={ctx} />

                <AdminEvaluationsToolbar ctx={ctx} />

                <AdminEvaluationsForm ctx={ctx} />

                <AdminEvaluationsStats ctx={ctx} />

                <AdminEvaluationsError ctx={ctx} />

                <AdminEvaluationsGroupedTable ctx={ctx} />

                <AdminEvaluationPreviewDialog ctx={ctx} />
            </div>
        </DashboardLayout>
    )
}
