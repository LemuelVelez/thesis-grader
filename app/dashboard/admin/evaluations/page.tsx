"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

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

type ThesisRole = "student" | "staff" | "admin" | "panelist" | (string & {})
type EvaluationStatus = "pending" | "submitted" | "locked" | (string & {})
type FilterStatus = "all" | "pending" | "submitted" | "locked"
type EvaluationAction = "submit" | "lock" | "set-pending"
type EvaluatorScope = "all" | "panelist" | "student"
type FormMode = "create" | "edit"

type EvaluationRecord = {
    id: string
    schedule_id: string
    evaluator_id: string
    status: EvaluationStatus
    submitted_at: string | null
    locked_at: string | null
    created_at: string
}

type DefenseScheduleOption = {
    id: string
    group_id: string
    scheduled_at: string
    room: string | null
    status: string
}

type UserOption = {
    id: string
    name: string | null
    email: string | null
    role: ThesisRole
    status?: string
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

type DefenseSchedulesResponse = {
    items?: DefenseScheduleOption[]
    error?: string
    message?: string
}

type UsersResponse = {
    items?: UserOption[]
    error?: string
    message?: string
}

type EvaluationFormState = {
    schedule_id: string
    evaluator_id: string
    status: EvaluationStatus
}

const STATUS_FILTERS: FilterStatus[] = ["all", "pending", "submitted", "locked"]
const ASSIGNMENT_STATUSES: EvaluationStatus[] = ["pending", "submitted", "locked"]
const EVALUATOR_SCOPES: EvaluatorScope[] = ["panelist", "student", "all"]

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function toTitleCase(value: string) {
    if (!value) return value
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

async function parseJsonSafely<T>(res: Response): Promise<T> {
    let data: unknown = {}
    try {
        data = await res.json()
    } catch {
        data = {}
    }

    if (!res.ok) {
        const message =
            isRecord(data) &&
                (typeof data.error === "string" || typeof data.message === "string")
                ? String(data.error || data.message)
                : `Request failed (${res.status})`
        throw new Error(message)
    }

    return data as T
}

function getEvaluationFormDefault(): EvaluationFormState {
    return {
        schedule_id: "",
        evaluator_id: "",
        status: "pending",
    }
}

function matchAny(value: string, query: string) {
    return value.toLowerCase().includes(query)
}

function compactString(value: string | null | undefined) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function roleLabel(role: ThesisRole) {
    return toTitleCase(String(role))
}

function toEvaluatorScope(role: ThesisRole): EvaluatorScope {
    const normalized = normalizeStatus(String(role))
    if (normalized === "panelist") return "panelist"
    if (normalized === "student") return "student"
    return "all"
}

export default function AdminEvaluationsPage() {
    const [evaluations, setEvaluations] = React.useState<EvaluationRecord[]>([])
    const [schedules, setSchedules] = React.useState<DefenseScheduleOption[]>([])
    const [evaluators, setEvaluators] = React.useState<UserOption[]>([])

    const [loadingTable, setLoadingTable] = React.useState(true)
    const [loadingMeta, setLoadingMeta] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<FilterStatus>("all")

    const [busyKey, setBusyKey] = React.useState<string | null>(null)

    const [formOpen, setFormOpen] = React.useState(false)
    const [formMode, setFormMode] = React.useState<FormMode>("create")
    const [formBusy, setFormBusy] = React.useState(false)
    const [editingId, setEditingId] = React.useState<string | null>(null)
    const [form, setForm] = React.useState<EvaluationFormState>(getEvaluationFormDefault())
    const [evaluatorScope, setEvaluatorScope] = React.useState<EvaluatorScope>("panelist")

    const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null)

    const loadEvaluations = React.useCallback(async () => {
        setLoadingTable(true)
        try {
            const res = await fetch("/api/evaluations", { cache: "no-store" })
            const data = await parseJsonSafely<EvaluationsResponse>(res)
            setEvaluations(Array.isArray(data.items) ? data.items : [])
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to fetch evaluations."
            setError(message)
            setEvaluations([])
            throw err
        } finally {
            setLoadingTable(false)
        }
    }, [])

    const loadMeta = React.useCallback(async () => {
        setLoadingMeta(true)
        try {
            const [scheduleRes, usersRes] = await Promise.all([
                fetch("/api/defense-schedules", { cache: "no-store" }),
                fetch("/api/users", { cache: "no-store" }),
            ])

            const scheduleData = await parseJsonSafely<DefenseSchedulesResponse>(scheduleRes)
            const usersData = await parseJsonSafely<UsersResponse>(usersRes)

            const safeSchedules = Array.isArray(scheduleData.items)
                ? scheduleData.items.filter(
                    (row): row is DefenseScheduleOption =>
                        !!row &&
                        typeof row.id === "string" &&
                        typeof row.group_id === "string" &&
                        typeof row.scheduled_at === "string",
                )
                : []

            const safeUsers = Array.isArray(usersData.items)
                ? usersData.items.filter(
                    (row): row is UserOption =>
                        !!row &&
                        typeof row.id === "string" &&
                        typeof row.role === "string",
                )
                : []

            setSchedules(safeSchedules)
            setEvaluators(safeUsers)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load assignment data."
            setError(message)
            throw err
        } finally {
            setLoadingMeta(false)
        }
    }, [])

    React.useEffect(() => {
        let active = true

            ; (async () => {
                setError(null)
                try {
                    await Promise.all([loadEvaluations(), loadMeta()])
                } catch (err) {
                    if (!active) return
                    const message = err instanceof Error ? err.message : "Failed to initialize evaluations."
                    setError(message)
                    toast.error("Unable to load evaluations", { description: message })
                }
            })()

        return () => {
            active = false
        }
    }, [loadEvaluations, loadMeta])

    const refreshAll = React.useCallback(async () => {
        setRefreshing(true)
        setError(null)

        try {
            await Promise.all([loadEvaluations(), loadMeta()])
            toast.success("Evaluations refreshed")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to refresh."
            setError(message)
            toast.error("Refresh failed", { description: message })
        } finally {
            setRefreshing(false)
        }
    }, [loadEvaluations, loadMeta])

    const filtered = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return evaluations.filter((item) => {
            const normalized = normalizeStatus(item.status)

            if (statusFilter !== "all" && normalized !== statusFilter) return false
            if (!q) return true

            return (
                matchAny(item.id, q) ||
                matchAny(item.schedule_id, q) ||
                matchAny(item.evaluator_id, q) ||
                matchAny(normalized, q)
            )
        })
    }, [evaluations, search, statusFilter])

    const stats = React.useMemo(() => {
        let pending = 0
        let submitted = 0
        let locked = 0

        for (const item of evaluations) {
            const status = normalizeStatus(item.status)
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

    const openCreateForm = React.useCallback(() => {
        setFormMode("create")
        setEditingId(null)
        setForm(getEvaluationFormDefault())
        setEvaluatorScope("panelist")
        setFormOpen(true)
    }, [])

    const openEditForm = React.useCallback(
        (row: EvaluationRecord) => {
            setFormMode("edit")
            setEditingId(row.id)
            setForm({
                schedule_id: row.schedule_id,
                evaluator_id: row.evaluator_id,
                status: row.status,
            })

            const user = evaluators.find(
                (u) => u.id.toLowerCase() === row.evaluator_id.toLowerCase(),
            )
            setEvaluatorScope(user ? toEvaluatorScope(user.role) : "all")

            setFormOpen(true)
        },
        [evaluators],
    )

    const closeForm = React.useCallback(() => {
        setFormOpen(false)
        setFormBusy(false)
        setEditingId(null)
        setForm(getEvaluationFormDefault())
    }, [])

    const onFormFieldChange = React.useCallback(
        <K extends keyof EvaluationFormState>(key: K, value: EvaluationFormState[K]) => {
            setForm((prev) => ({ ...prev, [key]: value }))
        },
        [],
    )

    const submitForm = React.useCallback(async () => {
        if (formBusy) return

        const schedule_id = form.schedule_id.trim()
        const evaluator_id = form.evaluator_id.trim()
        const status = normalizeStatus(String(form.status)) as EvaluationStatus

        if (!schedule_id) {
            toast.error("Schedule is required")
            return
        }

        if (!evaluator_id) {
            toast.error("Evaluator is required")
            return
        }

        const payload: Partial<EvaluationRecord> = {
            schedule_id,
            evaluator_id,
            status: status || "pending",
        }

        setFormBusy(true)
        setError(null)

        try {
            if (formMode === "create") {
                const res = await fetch("/api/evaluations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                })

                const data = await parseJsonSafely<EvaluationResponse>(res)

                if (data.item) {
                    setEvaluations((prev) => [data.item!, ...prev])
                } else {
                    await loadEvaluations()
                }

                toast.success("Evaluation assigned", {
                    description: "The evaluation was created successfully.",
                })
            } else {
                if (!editingId) {
                    throw new Error("No evaluation selected for update.")
                }

                const res = await fetch(`/api/evaluations/${editingId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                })

                const data = await parseJsonSafely<EvaluationResponse>(res)

                if (data.item) {
                    setEvaluations((prev) =>
                        prev.map((row) => (row.id === data.item!.id ? data.item! : row)),
                    )
                } else {
                    await loadEvaluations()
                }

                toast.success("Evaluation updated", {
                    description: "Changes were saved successfully.",
                })
            }

            closeForm()
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to save evaluation."
            setError(message)
            toast.error("Save failed", { description: message })
        } finally {
            setFormBusy(false)
        }
    }, [closeForm, editingId, form, formBusy, formMode, loadEvaluations])

    const deleteEvaluation = React.useCallback(
        async (evaluationId: string) => {
            const key = `${evaluationId}:delete`
            setBusyKey(key)
            setError(null)

            try {
                const res = await fetch(`/api/evaluations/${evaluationId}`, {
                    method: "DELETE",
                })

                await parseJsonSafely<{ deleted?: number; error?: string; message?: string }>(res)

                setEvaluations((prev) => prev.filter((row) => row.id !== evaluationId))
                setPendingDeleteId(null)

                if (editingId === evaluationId) {
                    closeForm()
                }

                toast.success("Evaluation deleted")
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to delete evaluation."
                setError(message)
                toast.error("Delete failed", { description: message })
            } finally {
                setBusyKey(null)
            }
        },
        [closeForm, editingId],
    )

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

                const data = await parseJsonSafely<EvaluationResponse>(res)

                if (data.item) {
                    setEvaluations((prev) =>
                        prev.map((row) => (row.id === data.item!.id ? data.item! : row)),
                    )
                } else {
                    await loadEvaluations()
                }

                if (action === "submit") {
                    toast.success("Evaluation submitted")
                } else if (action === "lock") {
                    toast.success("Evaluation locked")
                } else {
                    toast.success("Evaluation set to pending")
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to update evaluation."
                setError(message)
                toast.error("Action failed", { description: message })
            } finally {
                setBusyKey(null)
            }
        },
        [busyKey, loadEvaluations],
    )

    const scheduleSuggestions = React.useMemo(() => {
        const q = form.schedule_id.trim().toLowerCase()

        const items = schedules.filter((item) => {
            if (!q) return true

            return (
                matchAny(item.id, q) ||
                matchAny(item.group_id, q) ||
                matchAny(item.status ?? "", q) ||
                matchAny(item.room ?? "", q) ||
                matchAny(item.scheduled_at, q)
            )
        })

        return items.slice(0, 8)
    }, [form.schedule_id, schedules])

    const evaluatorSuggestions = React.useMemo(() => {
        const q = form.evaluator_id.trim().toLowerCase()

        const scoped = evaluators.filter((item) => {
            if (evaluatorScope === "all") return true
            return normalizeStatus(String(item.role)) === evaluatorScope
        })

        const matched = scoped.filter((item) => {
            if (!q) return true

            return (
                matchAny(item.id, q) ||
                matchAny(compactString(item.name) ?? "", q) ||
                matchAny(compactString(item.email) ?? "", q) ||
                matchAny(String(item.role), q)
            )
        })

        return matched.slice(0, 8)
    }, [evaluatorScope, evaluators, form.evaluator_id])

    const selectedSchedule = React.useMemo(() => {
        const id = form.schedule_id.trim().toLowerCase()
        if (!id) return null
        return schedules.find((item) => item.id.toLowerCase() === id) ?? null
    }, [form.schedule_id, schedules])

    const selectedEvaluator = React.useMemo(() => {
        const id = form.evaluator_id.trim().toLowerCase()
        if (!id) return null
        return evaluators.find((item) => item.id.toLowerCase() === id) ?? null
    }, [form.evaluator_id, evaluators])

    return (
        <DashboardLayout
            title="Evaluations"
            description="Assign evaluations to panelists/students and manage evaluation lifecycle."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <Input
                                placeholder="Search by evaluation ID, schedule ID, evaluator ID, or status"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full lg:max-w-xl"
                            />

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => void refreshAll()}
                                    disabled={refreshing || loadingTable || loadingMeta}
                                >
                                    {refreshing ? "Refreshing..." : "Refresh"}
                                </Button>

                                <Button onClick={openCreateForm}>Assign Evaluation</Button>
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

                {formOpen ? (
                    <div className="rounded-lg border bg-card p-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-semibold">
                                    {formMode === "create" ? "Create Evaluation" : "Edit Evaluation"}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    {formMode === "create"
                                        ? "Assign an evaluation to a panelist or student."
                                        : `Update evaluation details${editingId ? ` (${editingId})` : ""}.`}
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={closeForm} disabled={formBusy}>
                                    Cancel
                                </Button>
                                <Button onClick={() => void submitForm()} disabled={formBusy}>
                                    {formBusy
                                        ? formMode === "create"
                                            ? "Creating..."
                                            : "Saving..."
                                        : formMode === "create"
                                            ? "Create"
                                            : "Save Changes"}
                                </Button>
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Schedule ID</p>
                                <Input
                                    placeholder="Enter schedule ID"
                                    value={form.schedule_id}
                                    onChange={(e) => onFormFieldChange("schedule_id", e.target.value)}
                                    disabled={formBusy}
                                />

                                {selectedSchedule ? (
                                    <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs text-muted-foreground">
                                        <span className="font-semibold text-foreground">Selected schedule:</span>{" "}
                                        {selectedSchedule.id} • Group {selectedSchedule.group_id} •{" "}
                                        {formatDateTime(selectedSchedule.scheduled_at)} •{" "}
                                        {compactString(selectedSchedule.room) ?? "No room"}
                                    </div>
                                ) : null}

                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">Quick pick from schedules</p>
                                    <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
                                        {loadingMeta ? (
                                            <span className="text-xs text-muted-foreground">
                                                Loading schedule options...
                                            </span>
                                        ) : scheduleSuggestions.length === 0 ? (
                                            <span className="text-xs text-muted-foreground">
                                                No matching schedules.
                                            </span>
                                        ) : (
                                            scheduleSuggestions.map((item) => (
                                                <Button
                                                    key={item.id}
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => onFormFieldChange("schedule_id", item.id)}
                                                    className="h-auto px-2 py-1 text-left"
                                                    disabled={formBusy}
                                                >
                                                    <span className="block max-w-72 truncate text-xs">
                                                        {item.id} • Group {item.group_id}
                                                    </span>
                                                </Button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Evaluator ID</p>
                                <Input
                                    placeholder="Enter evaluator user ID"
                                    value={form.evaluator_id}
                                    onChange={(e) => onFormFieldChange("evaluator_id", e.target.value)}
                                    disabled={formBusy}
                                />

                                {selectedEvaluator ? (
                                    <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs text-muted-foreground">
                                        <span className="font-semibold text-foreground">Selected evaluator:</span>{" "}
                                        {compactString(selectedEvaluator.name) ?? "Unnamed"} •{" "}
                                        {compactString(selectedEvaluator.email) ?? "No email"} •{" "}
                                        {roleLabel(selectedEvaluator.role)}
                                    </div>
                                ) : null}

                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">Evaluator scope</p>
                                    <div className="flex flex-wrap gap-2">
                                        {EVALUATOR_SCOPES.map((scope) => {
                                            const active = evaluatorScope === scope
                                            return (
                                                <Button
                                                    key={scope}
                                                    size="sm"
                                                    variant={active ? "default" : "outline"}
                                                    onClick={() => setEvaluatorScope(scope)}
                                                    disabled={formBusy}
                                                >
                                                    {scope === "all" ? "All" : toTitleCase(scope)}
                                                </Button>
                                            )
                                        })}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">Quick pick from users</p>
                                    <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
                                        {loadingMeta ? (
                                            <span className="text-xs text-muted-foreground">
                                                Loading user options...
                                            </span>
                                        ) : evaluatorSuggestions.length === 0 ? (
                                            <span className="text-xs text-muted-foreground">
                                                No matching evaluators.
                                            </span>
                                        ) : (
                                            evaluatorSuggestions.map((item) => (
                                                <Button
                                                    key={item.id}
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => onFormFieldChange("evaluator_id", item.id)}
                                                    className="h-auto px-2 py-1 text-left"
                                                    disabled={formBusy}
                                                >
                                                    <span className="block max-w-80 truncate text-xs">
                                                        {compactString(item.name) ?? "Unnamed"} •{" "}
                                                        {roleLabel(item.role)}
                                                    </span>
                                                </Button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Status</p>
                            <div className="flex flex-wrap gap-2">
                                {ASSIGNMENT_STATUSES.map((status) => {
                                    const active = normalizeStatus(form.status) === status
                                    return (
                                        <Button
                                            key={status}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => onFormFieldChange("status", status)}
                                            disabled={formBusy}
                                        >
                                            {toTitleCase(status)}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border bg-card p-3">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-xl font-semibold">{stats.total}</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3">
                        <p className="text-xs text-muted-foreground">Pending</p>
                        <p className="text-xl font-semibold">{stats.pending}</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3">
                        <p className="text-xs text-muted-foreground">Submitted</p>
                        <p className="text-xl font-semibold">{stats.submitted}</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3">
                        <p className="text-xs text-muted-foreground">Locked</p>
                        <p className="text-xl font-semibold">{stats.locked}</p>
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
                                <TableHead className="min-w-56">Evaluator</TableHead>
                                <TableHead className="min-w-28">Status</TableHead>
                                <TableHead className="min-w-44">Submitted</TableHead>
                                <TableHead className="min-w-44">Locked</TableHead>
                                <TableHead className="min-w-44">Created</TableHead>
                                <TableHead className="min-w-80 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loadingTable ? (
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
                                    const isDeleteBusy = busyKey === `${row.id}:delete`
                                    const confirmDelete = pendingDeleteId === row.id

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

                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openEditForm(row)}
                                                        disabled={isDeleteBusy}
                                                    >
                                                        Edit
                                                    </Button>

                                                    {!confirmDelete ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => setPendingDeleteId(row.id)}
                                                            disabled={isDeleteBusy}
                                                        >
                                                            Delete
                                                        </Button>
                                                    ) : (
                                                        <>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => void deleteEvaluation(row.id)}
                                                                disabled={isDeleteBusy}
                                                            >
                                                                {isDeleteBusy ? "Deleting..." : "Confirm Delete"}
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => setPendingDeleteId(null)}
                                                                disabled={isDeleteBusy}
                                                            >
                                                                Cancel
                                                            </Button>
                                                        </>
                                                    )}

                                                    {status !== "pending" ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => void runAction(row, "set-pending")}
                                                            disabled={isPendingBusy || isDeleteBusy}
                                                        >
                                                            {isPendingBusy ? "Updating..." : "Set Pending"}
                                                        </Button>
                                                    ) : null}

                                                    {status === "pending" ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => void runAction(row, "submit")}
                                                            disabled={isSubmitBusy || isDeleteBusy}
                                                        >
                                                            {isSubmitBusy ? "Submitting..." : "Submit"}
                                                        </Button>
                                                    ) : null}

                                                    {status !== "locked" ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => void runAction(row, "lock")}
                                                            disabled={isLockBusy || isDeleteBusy}
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
