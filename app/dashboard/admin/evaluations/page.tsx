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

type EvaluationStatus = "pending" | "submitted" | "locked" | (string & {})

type EvaluationRecord = {
    id: string
    schedule_id: string
    evaluator_id: string
    status: EvaluationStatus
    submitted_at: string | null
    locked_at: string | null
    created_at: string
}

type EvaluationsResponse = {
    items?: EvaluationRecord[]
    error?: string
    message?: string
}

type EvaluationResponse = {
    item?: EvaluationRecord
    error?: string
    message?: string
}

type FilterStatus = "all" | "pending" | "submitted" | "locked"
type EvaluationAction = "submit" | "lock" | "set-pending"

const STATUS_FILTERS: FilterStatus[] = ["all", "pending", "submitted", "locked"]

function toTitleCase(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function normalizeStatus(value: string): string {
    return value.trim().toLowerCase()
}

function formatDateTime(value: string | null) {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { error?: string; message?: string }
        return data.error || data.message || `Request failed (${res.status})`
    } catch {
        return `Request failed (${res.status})`
    }
}

function statusBadgeClass(status: string): string {
    const s = normalizeStatus(status)

    if (s === "submitted") {
        return "border-primary/40 bg-primary/10 text-foreground"
    }

    if (s === "locked") {
        return "border-foreground/30 bg-foreground/10 text-foreground"
    }

    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

export default function AdminEvaluationsPage() {
    const [evaluations, setEvaluations] = React.useState<EvaluationRecord[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<FilterStatus>("all")

    const [busyKey, setBusyKey] = React.useState<string | null>(null)

    const loadEvaluations = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const res = await fetch("/api/evaluations", { cache: "no-store" })
            const data = (await res.json()) as EvaluationsResponse

            if (!res.ok) {
                throw new Error(data.error || data.message || "Failed to fetch evaluations.")
            }

            setEvaluations(Array.isArray(data.items) ? data.items : [])
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch evaluations.")
            setEvaluations([])
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void loadEvaluations()
    }, [loadEvaluations])

    const filtered = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return evaluations.filter((item) => {
            const normalized = normalizeStatus(item.status)

            if (statusFilter !== "all" && normalized !== statusFilter) return false

            if (!q) return true

            return (
                item.id.toLowerCase().includes(q) ||
                item.schedule_id.toLowerCase().includes(q) ||
                item.evaluator_id.toLowerCase().includes(q) ||
                normalized.includes(q)
            )
        })
    }, [evaluations, search, statusFilter])

    const runAction = React.useCallback(
        async (evaluation: EvaluationRecord, action: EvaluationAction) => {
            const actionKey = `${evaluation.id}:${action}`
            if (busyKey) return

            setBusyKey(actionKey)
            setError(null)

            try {
                let endpoint = ""
                let payload: Record<string, unknown> = {}

                if (action === "submit") {
                    endpoint = `/api/evaluations/${evaluation.id}/submit`
                } else if (action === "lock") {
                    endpoint = `/api/evaluations/${evaluation.id}/lock`
                } else {
                    endpoint = `/api/evaluations/${evaluation.id}/status`
                    payload = { status: "pending" }
                }

                const res = await fetch(endpoint, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                })

                const data = (await res.json()) as EvaluationResponse

                if (!res.ok) {
                    throw new Error(data.error || data.message || `Request failed (${res.status})`)
                }

                if (data.item) {
                    setEvaluations((prev) =>
                        prev.map((row) => (row.id === data.item!.id ? data.item! : row)),
                    )
                } else {
                    await loadEvaluations()
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to update evaluation.")
            } finally {
                setBusyKey(null)
            }
        },
        [busyKey, loadEvaluations],
    )

    return (
        <DashboardLayout
            title="Evaluations"
            description="Manage panel evaluations, submission state, and lock status."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by evaluation ID, schedule ID, evaluator ID, or status"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => void loadEvaluations()}
                                    disabled={loading}
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
                                    return (
                                        <Button
                                            key={status}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setStatusFilter(status)}
                                        >
                                            {toTitleCase(status)}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Showing{" "}
                            <span className="font-semibold text-foreground">{filtered.length}</span> of{" "}
                            <span className="font-semibold text-foreground">{evaluations.length}</span>{" "}
                            evaluation(s).
                        </p>
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
                                <TableHead className="min-w-60">Evaluation ID</TableHead>
                                <TableHead className="min-w-48">Schedule</TableHead>
                                <TableHead className="min-w-48">Evaluator</TableHead>
                                <TableHead className="min-w-28">Status</TableHead>
                                <TableHead className="min-w-44">Submitted</TableHead>
                                <TableHead className="min-w-44">Locked</TableHead>
                                <TableHead className="min-w-44">Created</TableHead>
                                <TableHead className="min-w-64 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <TableRow key={`skeleton-${i}`}>
                                        <TableCell colSpan={8}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                        No evaluations found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filtered.map((row) => {
                                    const status = normalizeStatus(row.status)
                                    const isSubmitBusy = busyKey === `${row.id}:submit`
                                    const isLockBusy = busyKey === `${row.id}:lock`
                                    const isPendingBusy = busyKey === `${row.id}:set-pending`

                                    return (
                                        <TableRow key={row.id}>
                                            <TableCell>
                                                <span className="font-medium">{row.id}</span>
                                            </TableCell>

                                            <TableCell>
                                                <span className="text-sm">{row.schedule_id}</span>
                                            </TableCell>

                                            <TableCell>
                                                <span className="text-sm">{row.evaluator_id}</span>
                                            </TableCell>

                                            <TableCell>
                                                <span
                                                    className={[
                                                        "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                        statusBadgeClass(status),
                                                    ].join(" ")}
                                                >
                                                    {toTitleCase(status)}
                                                </span>
                                            </TableCell>

                                            <TableCell className="text-muted-foreground">
                                                {formatDateTime(row.submitted_at)}
                                            </TableCell>

                                            <TableCell className="text-muted-foreground">
                                                {formatDateTime(row.locked_at)}
                                            </TableCell>

                                            <TableCell className="text-muted-foreground">
                                                {formatDateTime(row.created_at)}
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex flex-wrap items-center justify-end gap-2">
                                                    <Button asChild variant="outline" size="sm">
                                                        <Link href={`/dashboard/admin/evaluations/${row.id}`}>
                                                            View
                                                        </Link>
                                                    </Button>

                                                    {status !== "pending" ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => void runAction(row, "set-pending")}
                                                            disabled={isPendingBusy}
                                                        >
                                                            {isPendingBusy ? "Updating..." : "Set Pending"}
                                                        </Button>
                                                    ) : null}

                                                    {status === "pending" ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => void runAction(row, "submit")}
                                                            disabled={isSubmitBusy}
                                                        >
                                                            {isSubmitBusy ? "Submitting..." : "Submit"}
                                                        </Button>
                                                    ) : null}

                                                    {status !== "locked" ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => void runAction(row, "lock")}
                                                            disabled={isLockBusy}
                                                        >
                                                            {isLockBusy ? "Locking..." : "Lock"}
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
            </div>
        </DashboardLayout>
    )
}
