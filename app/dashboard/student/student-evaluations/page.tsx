"use client"

import * as React from "react"
import Link from "next/link"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type StudentEvaluationItem = {
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
}

type StatusFilter = "all" | "pending" | "submitted" | "locked"

const STATUS_FILTERS = ["all", "pending", "submitted", "locked"] as const

const EVALUATION_ENDPOINT_CANDIDATES = [
    "/api/student-evaluations/my",
    "/api/student-evaluations/me",
    "/api/student-evaluations",
    "/api/evaluations?limit=500&orderBy=created_at&orderDirection=desc",
    "/api/evaluations?limit=500",
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
        schedule_id: toNullableString(source.schedule_id ?? source.scheduleId ?? schedule?.id ?? raw.schedule_id),
        student_id: toNullableString(source.student_id ?? source.studentId ?? raw.student_id),
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
        created_at: toNullableString(source.created_at ?? source.createdAt ?? raw.created_at),
        submitted_at: toNullableString(source.submitted_at ?? source.submittedAt ?? raw.submitted_at),
        locked_at: toNullableString(source.locked_at ?? source.lockedAt ?? raw.locked_at),
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

export default function StudentEvaluationsPage() {
    const [evaluations, setEvaluations] = React.useState<StudentEvaluationItem[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [source, setSource] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")

    const loadEvaluations = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        let latestError = "Unable to load evaluations."
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
                        const ta = a.created_at ? new Date(a.created_at).getTime() : 0
                        const tb = b.created_at ? new Date(b.created_at).getTime() : 0
                        return tb - ta
                    })

                setEvaluations(parsed)
                setSource(endpoint)
                loaded = true
                break
            } catch (err) {
                latestError = err instanceof Error ? err.message : "Unable to load evaluations."
            }
        }

        if (!loaded) {
            setEvaluations([])
            setSource(null)
            setError(`${latestError} No evaluation endpoint responded successfully.`)
        }

        setLoading(false)
    }, [])

    React.useEffect(() => {
        void loadEvaluations()
    }, [loadEvaluations])

    const filtered = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return evaluations.filter((item) => {
            const s = item.status.toLowerCase()
            if (statusFilter !== "all" && s !== statusFilter) {
                return false
            }

            if (!q) return true

            return (
                item.id.toLowerCase().includes(q) ||
                (item.schedule_id ?? "").toLowerCase().includes(q) ||
                (item.student_id ?? "").toLowerCase().includes(q) ||
                (item.title ?? "").toLowerCase().includes(q) ||
                (item.group_title ?? "").toLowerCase().includes(q) ||
                s.includes(q)
            )
        })
    }, [evaluations, search, statusFilter])

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

        return {
            total: evaluations.length,
            pending,
            submitted,
            locked,
        }
    }, [evaluations])

    return (
        <DashboardLayout
            title="Student Evaluations"
            description="Track your submitted and pending evaluation records."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by evaluation ID, schedule, title, group, or status"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />

                            <Button
                                variant="outline"
                                onClick={() => void loadEvaluations()}
                                disabled={loading}
                            >
                                Refresh
                            </Button>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by status</p>
                            <div className="flex flex-wrap gap-2">
                                {STATUS_FILTERS.map((status) => {
                                    const active = statusFilter === status
                                    return (
                                        <Button
                                            key={status}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setStatusFilter(status)}
                                        >
                                            {status === "all" ? "All" : toTitleCase(status)}
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
                                Showing <span className="font-semibold text-foreground">{filtered.length}</span> of{" "}
                                <span className="font-semibold text-foreground">{evaluations.length}</span> evaluation(s).
                            </p>
                            {source ? <p>Data source: {source}</p> : null}
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
                                <TableHead className="min-w-44">Evaluation ID</TableHead>
                                <TableHead className="min-w-64">Thesis / Group</TableHead>
                                <TableHead className="min-w-32">Status</TableHead>
                                <TableHead className="min-w-44">Scheduled</TableHead>
                                <TableHead className="min-w-44">Submitted</TableHead>
                                <TableHead className="min-w-44">Locked</TableHead>
                                <TableHead className="min-w-28">Action</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <TableRow key={`student-eval-skeleton-${i}`}>
                                        <TableCell colSpan={7}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                        No evaluations found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filtered.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">{item.id}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <span className="font-medium">{item.title ?? item.group_title ?? "Untitled evaluation"}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    Schedule: {item.schedule_id ?? "—"}
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
                                        <TableCell className="text-muted-foreground">{formatDateTime(item.scheduled_at)}</TableCell>
                                        <TableCell className="text-muted-foreground">{formatDateTime(item.submitted_at)}</TableCell>
                                        <TableCell className="text-muted-foreground">{formatDateTime(item.locked_at)}</TableCell>
                                        <TableCell>
                                            <Button asChild size="sm" variant="outline">
                                                <Link href={`/dashboard/student/student-evaluations/${item.id}`}>View</Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </DashboardLayout>
    )
}
