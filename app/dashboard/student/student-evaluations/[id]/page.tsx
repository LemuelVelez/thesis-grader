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

type StudentEvaluationDetail = {
    id: string
    schedule_id: string | null
    student_id: string | null
    status: string
    title: string | null
    group_title: string | null
    scheduled_at: string | null
    created_at: string | null
    submitted_at: string | null
    locked_at: string | null
    answers: Record<string, unknown> | null
    notes: string | null
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

export default function StudentEvaluationDetailPage() {
    const params = useParams()

    const evaluationId = React.useMemo(() => {
        const raw = params?.id
        if (Array.isArray(raw)) return raw[0] ?? ""
        return typeof raw === "string" ? raw : ""
    }, [params])

    const [item, setItem] = React.useState<StudentEvaluationDetail | null>(null)
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [source, setSource] = React.useState<string | null>(null)

    const loadDetail = React.useCallback(async () => {
        if (!evaluationId) {
            setItem(null)
            setError("Evaluation ID is missing.")
            setLoading(false)
            return
        }

        setLoading(true)
        setError(null)

        const endpointCandidates = [
            `/api/student-evaluations/${evaluationId}`,
            `/api/evaluations/${evaluationId}`,
        ]

        let latestError = "Unable to load evaluation details."
        let loaded = false

        for (const endpoint of endpointCandidates) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const parsed = extractDetailFromPayload(payload)
                if (!parsed) continue

                setItem(parsed)
                setSource(endpoint)
                loaded = true
                break
            } catch (err) {
                latestError =
                    err instanceof Error ? err.message : "Unable to load evaluation details."
            }
        }

        if (!loaded) {
            setItem(null)
            setSource(null)
            setError(`${latestError} No detail endpoint responded successfully.`)
        }

        setLoading(false)
    }, [evaluationId])

    React.useEffect(() => {
        void loadDetail()
    }, [loadDetail])

    const answerEntries = React.useMemo(() => {
        if (!item?.answers) return []
        return Object.entries(item.answers).sort(([a], [b]) => a.localeCompare(b))
    }, [item?.answers])

    return (
        <DashboardLayout
            title="Evaluation Details"
            description="Inspect your evaluation record and submitted answers."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                            <p className="text-sm font-medium">Evaluation ID: {evaluationId || "—"}</p>
                            <p className="text-xs text-muted-foreground">
                                {source ? `Data source: ${source}` : "No data source detected yet."}
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button asChild variant="outline">
                                <Link href="/dashboard/student/student-evaluations">Back</Link>
                            </Button>
                            <Button variant="outline" onClick={() => void loadDetail()} disabled={loading}>
                                Refresh
                            </Button>
                        </div>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                <div className="rounded-lg border bg-card p-4">
                    {loading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={`detail-skeleton-${i}`} className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                            ))}
                        </div>
                    ) : !item ? (
                        <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
                            No evaluation data found.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-md border bg-background p-3">
                                    <p className="text-xs text-muted-foreground">Status</p>
                                    <div className="mt-1">
                                        <span
                                            className={[
                                                "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                statusTone(item.status),
                                            ].join(" ")}
                                        >
                                            {toTitleCase(item.status)}
                                        </span>
                                    </div>
                                </div>
                                <div className="rounded-md border bg-background p-3">
                                    <p className="text-xs text-muted-foreground">Schedule ID</p>
                                    <p className="text-sm font-semibold">{item.schedule_id ?? "—"}</p>
                                </div>
                                <div className="rounded-md border bg-background p-3">
                                    <p className="text-xs text-muted-foreground">Student ID</p>
                                    <p className="text-sm font-semibold">{item.student_id ?? "—"}</p>
                                </div>
                                <div className="rounded-md border bg-background p-3">
                                    <p className="text-xs text-muted-foreground">Thesis / Group</p>
                                    <p className="text-sm font-semibold">
                                        {item.title ?? item.group_title ?? "—"}
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-md border bg-background p-3">
                                    <p className="text-xs text-muted-foreground">Scheduled At</p>
                                    <p className="text-sm">{formatDateTime(item.scheduled_at)}</p>
                                </div>
                                <div className="rounded-md border bg-background p-3">
                                    <p className="text-xs text-muted-foreground">Created At</p>
                                    <p className="text-sm">{formatDateTime(item.created_at)}</p>
                                </div>
                                <div className="rounded-md border bg-background p-3">
                                    <p className="text-xs text-muted-foreground">Submitted At</p>
                                    <p className="text-sm">{formatDateTime(item.submitted_at)}</p>
                                </div>
                                <div className="rounded-md border bg-background p-3">
                                    <p className="text-xs text-muted-foreground">Locked At</p>
                                    <p className="text-sm">{formatDateTime(item.locked_at)}</p>
                                </div>
                            </div>

                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Notes</p>
                                <p className="text-sm">{item.notes ?? "—"}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="rounded-lg border bg-card p-4">
                    <div className="mb-3">
                        <p className="text-sm font-medium">Submitted Answers</p>
                        <p className="text-xs text-muted-foreground">
                            Parsed from <code className="rounded bg-muted px-1 py-0.5">answers</code> payload
                        </p>
                    </div>

                    {loading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={`answer-skeleton-${i}`} className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                            ))}
                        </div>
                    ) : answerEntries.length === 0 ? (
                        <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
                            No answer payload found for this evaluation.
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-52">Field</TableHead>
                                        <TableHead className="min-w-105">Value</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {answerEntries.map(([key, value]) => (
                                        <TableRow key={key}>
                                            <TableCell className="font-medium">{key}</TableCell>
                                            <TableCell className="whitespace-pre-wrap wrap-break-word text-sm">
                                                {typeof value === "string" || typeof value === "number" || typeof value === "boolean"
                                                    ? String(value)
                                                    : JSON.stringify(value, null, 2)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    )
}
