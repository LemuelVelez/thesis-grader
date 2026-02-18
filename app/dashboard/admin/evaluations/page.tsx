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

    const [activePreview, setActivePreview] = React.useState<"student" | "panelist">("student")
    const [includeStudentAnswers, setIncludeStudentAnswers] = React.useState(true)
    const [includePanelistScores, setIncludePanelistScores] = React.useState(true)
    const [includePanelistComments, setIncludePanelistComments] = React.useState(true)

    const [loadingPreview, setLoadingPreview] = React.useState(false)
    const [previewError, setPreviewError] = React.useState<string | null>(null)
    const [previewData, setPreviewData] = React.useState<PreviewResponse | null>(null)

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
    const studentCount = getNumber(studentBlock?.count) ?? studentItems.length

    const panelistBlock = preview && isRecord(preview.panelist) ? (preview.panelist as Record<string, unknown>) : null
    const panelistItems = panelistBlock && Array.isArray(panelistBlock.items) ? (panelistBlock.items as unknown[]) : []
    const panelistCount = getNumber(panelistBlock?.count) ?? panelistItems.length

    const selectedKind = selectedViewEvaluation?.kind ?? null
    const selectedEvaluationId = selectedViewEvaluation?.id ?? null
    const selectedAssigneeId = selectedViewEvaluation?.evaluator_id ?? null

    const currentStatus = selectedViewEvaluation ? normalizeStatus(selectedViewEvaluation.status) : null

    return (
        <Dialog
            open={viewOpen}
            onOpenChange={(open) => {
                setViewOpen(open)
            }}
        >
            <DialogContent className="sm:max-w-5xl">
                {selectedViewEvaluation ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Evaluation Details & Preview</DialogTitle>
                            <DialogDescription>
                                Preview student feedback answers and panelist rubric scores for this defense schedule—without mixing the two flows.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div className="rounded-lg border bg-muted/30 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium">Status</span>
                                    <span
                                        className={[
                                            "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                            statusBadgeClass(selectedViewEvaluation.status),
                                        ].join(" ")}
                                    >
                                        {toTitleCase(normalizeStatus(selectedViewEvaluation.status))}
                                    </span>

                                    <span className="inline-flex rounded-md border px-2 py-1 text-xs font-medium">
                                        {selectedViewEvaluation.assignee_role === "student" ? "Student Flow" : "Panelist Flow"}
                                    </span>

                                    <span className="ml-auto text-xs text-muted-foreground">
                                        Schedule ID: <span className="font-medium text-foreground">{scheduleId}</span>
                                    </span>
                                </div>
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
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium">Preview Controls</p>
                                        <p className="text-xs text-muted-foreground">
                                            Toggle what to load from the admin preview aggregator endpoint.
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            variant={activePreview === "student" ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => setActivePreview("student")}
                                        >
                                            Student Answers ({studentCount})
                                        </Button>
                                        <Button
                                            variant={activePreview === "panelist" ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => setActivePreview("panelist")}
                                        >
                                            Panelist Scores ({panelistCount})
                                        </Button>
                                    </div>
                                </div>

                                <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant={includeStudentAnswers ? "default" : "outline"}
                                            onClick={() => setIncludeStudentAnswers((v) => !v)}
                                        >
                                            {includeStudentAnswers ? "Student answers: ON" : "Student answers: OFF"}
                                        </Button>

                                        <Button
                                            size="sm"
                                            variant={includePanelistScores ? "default" : "outline"}
                                            onClick={() => setIncludePanelistScores((v) => !v)}
                                        >
                                            {includePanelistScores ? "Panelist scores: ON" : "Panelist scores: OFF"}
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
                                        {activePreview === "student" ? (
                                            <>
                                                {studentItems.length === 0 ? (
                                                    <div className="rounded-md border p-4 text-sm text-muted-foreground">
                                                        No student feedback entries found for this schedule.
                                                    </div>
                                                ) : (
                                                    <Accordion type="multiple" className="w-full">
                                                        {studentItems.map((raw: unknown, idx: number) => {
                                                            const row = isRecord(raw) ? raw : {}
                                                            const id = getString(row.id) ?? `student-${idx}`
                                                            const studentId =
                                                                getString(row.student_id) ??
                                                                getString(row.evaluator_id) ??
                                                                getString(row.user_id) ??
                                                                null

                                                            const studentName =
                                                                getString(row.student_name) ??
                                                                getString(row.name) ??
                                                                getString(row.student_email) ??
                                                                "Unnamed Student"

                                                            const studentEmail = getString(row.student_email) ?? getString(row.email)

                                                            const status = getString(row.status) ?? "pending"
                                                            const statusNorm = normalizeStatus(status)

                                                            const scoreTotal = row.score_total
                                                            const scoreMax = row.score_max
                                                            const scorePercent = row.score_percentage

                                                            const answers = row.answers

                                                            const isSelected =
                                                                selectedKind === "student" &&
                                                                !!studentId &&
                                                                !!selectedAssigneeId &&
                                                                studentId.toLowerCase() === selectedAssigneeId.toLowerCase()

                                                            return (
                                                                <AccordionItem
                                                                    key={id}
                                                                    value={id}
                                                                    className={[
                                                                        "rounded-lg border px-0",
                                                                        isSelected ? "border-primary/40 bg-primary/5" : "",
                                                                    ].join(" ")}
                                                                >
                                                                    <AccordionTrigger className="px-3 py-3 hover:no-underline">
                                                                        <div className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between">
                                                                            <div className="min-w-0">
                                                                                <p className="truncate text-sm font-semibold">
                                                                                    {studentName}
                                                                                </p>
                                                                                <p className="text-xs text-muted-foreground">
                                                                                    {studentEmail ?? "No email"}
                                                                                    {studentId ? ` • ${studentId}` : ""}
                                                                                </p>
                                                                            </div>

                                                                            <div className="flex flex-wrap items-center gap-2 pr-2">
                                                                                <span
                                                                                    className={[
                                                                                        "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                                                        statusBadgeClass(statusNorm),
                                                                                    ].join(" ")}
                                                                                >
                                                                                    {toTitleCase(statusNorm)}
                                                                                </span>

                                                                                <span className="inline-flex rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                                                                                    Score: {formatPercent(scorePercent)}
                                                                                </span>

                                                                                {isSelected ? (
                                                                                    <span className="inline-flex rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-medium">
                                                                                        Selected
                                                                                    </span>
                                                                                ) : null}
                                                                            </div>
                                                                        </div>
                                                                    </AccordionTrigger>

                                                                    <AccordionContent className="px-3 pb-3">
                                                                        <div className="grid gap-3 sm:grid-cols-3">
                                                                            <div className="rounded-md border p-3">
                                                                                <p className="text-xs text-muted-foreground">Total</p>
                                                                                <p className="mt-1 text-sm font-semibold">
                                                                                    {formatMaybeScore(scoreTotal)}
                                                                                </p>
                                                                            </div>
                                                                            <div className="rounded-md border p-3">
                                                                                <p className="text-xs text-muted-foreground">Max</p>
                                                                                <p className="mt-1 text-sm font-semibold">
                                                                                    {formatMaybeScore(scoreMax)}
                                                                                </p>
                                                                            </div>
                                                                            <div className="rounded-md border p-3">
                                                                                <p className="text-xs text-muted-foreground">Percentage</p>
                                                                                <p className="mt-1 text-sm font-semibold">
                                                                                    {formatPercent(scorePercent)}
                                                                                </p>
                                                                            </div>
                                                                        </div>

                                                                        <div className="mt-3 rounded-md border p-3">
                                                                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                                                <p className="text-sm font-medium">Answers</p>
                                                                                <p className="text-xs text-muted-foreground">
                                                                                    {includeStudentAnswers ? "Included" : "Hidden"} (toggle above)
                                                                                </p>
                                                                            </div>

                                                                            {!includeStudentAnswers ? (
                                                                                <div className="mt-2 text-sm text-muted-foreground">
                                                                                    Student answers are currently hidden.
                                                                                </div>
                                                                            ) : (
                                                                                <div className="mt-2 max-h-80 overflow-y-auto rounded-md border bg-muted/20 p-2">
                                                                                    {isRecord(answers) ? (
                                                                                        <div className="space-y-2">
                                                                                            {Object.entries(answers).map(([k, v]) => (
                                                                                                <div key={k} className="rounded-md border bg-card p-2">
                                                                                                    <p className="text-xs font-medium">{k}</p>
                                                                                                    <pre className="mt-1 whitespace-pre-wrap wrap-break-word text-xs text-muted-foreground">
                                                                                                        {prettyValue(v)}
                                                                                                    </pre>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    ) : (
                                                                                        <pre className="whitespace-pre-wrap wrap-break-word text-xs text-muted-foreground">
                                                                                            {prettyValue(answers)}
                                                                                        </pre>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </AccordionContent>
                                                                </AccordionItem>
                                                            )
                                                        })}
                                                    </Accordion>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                {panelistItems.length === 0 ? (
                                                    <div className="rounded-md border p-4 text-sm text-muted-foreground">
                                                        No panelist evaluations found for this schedule.
                                                    </div>
                                                ) : (
                                                    <Accordion type="multiple" className="w-full">
                                                        {panelistItems.map((raw: unknown, idx: number) => {
                                                            const row = isRecord(raw) ? raw : {}
                                                            const evaluation = isRecord(row.evaluation) ? (row.evaluation as Record<string, unknown>) : {}
                                                            const evalId = getString(evaluation.id) ?? `panelist-${idx}`
                                                            const evaluatorName =
                                                                getString(evaluation.evaluator_name) ??
                                                                getString(evaluation.evaluator_email) ??
                                                                getString(evaluation.evaluator_id) ??
                                                                "Unknown Panelist"
                                                            const evaluatorEmail = getString(evaluation.evaluator_email)

                                                            const status = getString(evaluation.status) ?? getString(row.status) ?? "pending"
                                                            const statusNorm = normalizeStatus(status)

                                                            const overall = isRecord(row.overall) ? (row.overall as Record<string, unknown>) : null
                                                            const overallPct = overall ? (overall.percentage ?? overall.overall_percentage ?? overall.score_percentage) : null

                                                            const targets = Array.isArray(row.targets) ? (row.targets as unknown[]) : []
                                                            const scores = Array.isArray(row.scores) ? (row.scores as unknown[]) : []

                                                            const isSelected = selectedKind === "panelist" && selectedEvaluationId === evalId

                                                            // Group scores by target for nicer UX
                                                            const groupedByTarget = new Map<string, { title: string; type: string; items: Record<string, unknown>[] }>()
                                                            for (const sRaw of scores) {
                                                                const s = isRecord(sRaw) ? (sRaw as Record<string, unknown>) : {}
                                                                const tType = getString(s.target_type) ?? "unknown"
                                                                const tId = getString(s.target_id) ?? "unknown"
                                                                const tName = getString(s.target_name) ?? (tType === "group" ? "Group" : "Student")
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
                                                                <AccordionItem
                                                                    key={evalId}
                                                                    value={evalId}
                                                                    className={[
                                                                        "rounded-lg border px-0",
                                                                        isSelected ? "border-primary/40 bg-primary/5" : "",
                                                                    ].join(" ")}
                                                                >
                                                                    <AccordionTrigger className="px-3 py-3 hover:no-underline">
                                                                        <div className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between">
                                                                            <div className="min-w-0">
                                                                                <p className="truncate text-sm font-semibold">{evaluatorName}</p>
                                                                                <p className="text-xs text-muted-foreground">
                                                                                    {evaluatorEmail ?? "No email"} • {evalId}
                                                                                </p>
                                                                            </div>

                                                                            <div className="flex flex-wrap items-center gap-2 pr-2">
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

                                                                                {isSelected ? (
                                                                                    <span className="inline-flex rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-medium">
                                                                                        Selected
                                                                                    </span>
                                                                                ) : null}
                                                                            </div>
                                                                        </div>
                                                                    </AccordionTrigger>

                                                                    <AccordionContent className="px-3 pb-3">
                                                                        <div className="rounded-md border p-3">
                                                                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                                                <p className="text-sm font-medium">Targets Summary</p>
                                                                                <p className="text-xs text-muted-foreground">
                                                                                    {targets.length} target(s) • {includePanelistScores ? "Scores included" : "Scores hidden"}
                                                                                </p>
                                                                            </div>

                                                                            {targets.length === 0 ? (
                                                                                <div className="mt-2 text-sm text-muted-foreground">
                                                                                    No target summaries available yet.
                                                                                </div>
                                                                            ) : (
                                                                                <div className="mt-2 overflow-x-auto rounded-md border">
                                                                                    <Table>
                                                                                        <TableHeader>
                                                                                            <TableRow>
                                                                                                <TableHead className="min-w-60">Target</TableHead>
                                                                                                <TableHead className="min-w-24">Type</TableHead>
                                                                                                <TableHead className="min-w-32">Criteria</TableHead>
                                                                                                <TableHead className="min-w-32">Percentage</TableHead>
                                                                                            </TableRow>
                                                                                        </TableHeader>
                                                                                        <TableBody>
                                                                                            {targets.map((tRaw: unknown, tIdx: number) => {
                                                                                                const t = isRecord(tRaw) ? (tRaw as Record<string, unknown>) : {}
                                                                                                const tName = getString(t.target_name) ?? "Unnamed target"
                                                                                                const tType = getString(t.target_type) ?? "—"
                                                                                                const criteria = getNumber(t.criteria_scored)
                                                                                                const pct = t.percentage
                                                                                                return (
                                                                                                    <TableRow key={`${evalId}-t-${tIdx}`}>
                                                                                                        <TableCell className="font-medium">{tName}</TableCell>
                                                                                                        <TableCell className="text-muted-foreground">
                                                                                                            {toTitleCase(tType)}
                                                                                                        </TableCell>
                                                                                                        <TableCell className="text-muted-foreground">
                                                                                                            {criteria ?? "—"}
                                                                                                        </TableCell>
                                                                                                        <TableCell className="text-muted-foreground">
                                                                                                            {formatPercent(pct)}
                                                                                                        </TableCell>
                                                                                                    </TableRow>
                                                                                                )
                                                                                            })}
                                                                                        </TableBody>
                                                                                    </Table>
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        <div className="mt-3 rounded-md border p-3">
                                                                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                                                <p className="text-sm font-medium">Detailed Scores</p>
                                                                                <p className="text-xs text-muted-foreground">
                                                                                    {includePanelistScores ? "Included" : "Hidden"} • Comments{" "}
                                                                                    {includePanelistComments ? "ON" : "OFF"}
                                                                                </p>
                                                                            </div>

                                                                            {!includePanelistScores ? (
                                                                                <div className="mt-2 text-sm text-muted-foreground">
                                                                                    Panelist rubric scores are currently hidden.
                                                                                </div>
                                                                            ) : scores.length === 0 ? (
                                                                                <div className="mt-2 text-sm text-muted-foreground">
                                                                                    No rubric scores recorded yet for this panelist.
                                                                                </div>
                                                                            ) : (
                                                                                <div className="mt-2 space-y-3">
                                                                                    {targetGroups.map((g, gIdx) => (
                                                                                        <div key={`${evalId}-g-${gIdx}`} className="rounded-md border p-3">
                                                                                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                                                                <p className="text-sm font-semibold">
                                                                                                    {g.title}
                                                                                                </p>
                                                                                                <p className="text-xs text-muted-foreground">
                                                                                                    {toTitleCase(g.type)} • {g.items.length} criterion item(s)
                                                                                                </p>
                                                                                            </div>

                                                                                            <div className="mt-2 overflow-x-auto rounded-md border">
                                                                                                <Table>
                                                                                                    <TableHeader>
                                                                                                        <TableRow>
                                                                                                            <TableHead className="min-w-72">Criterion</TableHead>
                                                                                                            <TableHead className="min-w-24">Score</TableHead>
                                                                                                            <TableHead className="min-w-24">Max</TableHead>
                                                                                                            <TableHead className="min-w-24">Weight</TableHead>
                                                                                                            {includePanelistComments ? (
                                                                                                                <TableHead className="min-w-96">Comment</TableHead>
                                                                                                            ) : null}
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
                                                                                                                    <TableCell className="text-muted-foreground">
                                                                                                                        {score ?? "—"}
                                                                                                                    </TableCell>
                                                                                                                    <TableCell className="text-muted-foreground">
                                                                                                                        {maxScore ?? "—"}
                                                                                                                    </TableCell>
                                                                                                                    <TableCell className="text-muted-foreground">
                                                                                                                        {formatMaybeScore(weight)}
                                                                                                                    </TableCell>
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
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </AccordionContent>
                                                                </AccordionItem>
                                                            )
                                                        })}
                                                    </Accordion>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ) : null}
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
            description="Assign panelist and student evaluations in distinct flows, then manage lifecycle and status in one user-friendly workspace."
        >
            <div className="space-y-4">
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
