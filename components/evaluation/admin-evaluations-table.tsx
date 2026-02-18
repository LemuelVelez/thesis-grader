"use client"

import * as React from "react"

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

import type { AdminEvaluationsPageState } from "./admin-evaluations-hook"
import { statusBadgeClass } from "./admin-evaluations-model"

export function AdminEvaluationsToolbar({ ctx }: { ctx: AdminEvaluationsPageState }) {
    const {
        search,
        setSearch,
        refreshAll,
        refreshing,
        loadingTable,
        loadingMeta,
        openCreateForm,
        statusFilter,
        setStatusFilter,
        STATUS_FILTERS,
        toTitleCase,
        filtered,
        evaluations,
    } = ctx

    return (
        <div className="rounded-lg border bg-card p-4">
            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <Input
                        placeholder="Search by group name, assignee, role, room, schedule, or status"
                        value={search}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
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
    )
}

export function AdminEvaluationsStats({ ctx }: { ctx: AdminEvaluationsPageState }) {
    const { stats } = ctx

    return (
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
    )
}

export function AdminEvaluationsError({ ctx }: { ctx: AdminEvaluationsPageState }) {
    if (!ctx.error) return null
    return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {ctx.error}
        </div>
    )
}

export function AdminEvaluationsGroupedTable({ ctx }: { ctx: AdminEvaluationsPageState }) {
    const {
        loadingTable,
        filtered,
        groupedFiltered,

        busyKey,
        pendingDeleteRef,
        setPendingDeleteRef,

        openViewDialog,
        openEditForm,
        deleteEvaluation,
        runAction,

        scheduleById,
        evaluatorById,

        formatDateTime,
        compactString,
        toTitleCase,
        normalizeStatus,
        roleLabel,
    } = ctx

    return (
        <div className="rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
                <p className="text-sm font-medium">Evaluations by Group</p>
                <p className="text-xs text-muted-foreground">
                    Student and panelist evaluations are displayed together while preserving separate backend flows.
                </p>
            </div>

            {loadingTable ? (
                <div className="space-y-3 p-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={`group-skeleton-${i}`}
                            className="h-12 w-full animate-pulse rounded-md bg-muted/50"
                        />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No evaluations found.</div>
            ) : (
                <Accordion type="multiple" className="w-full">
                    {groupedFiltered.map((group) => (
                        <AccordionItem key={group.key} value={group.key} className="border-b px-0">
                            <AccordionTrigger className="px-4 py-3 hover:no-underline">
                                <div className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold">{group.groupName}</p>
                                        <p className="text-xs text-muted-foreground">{group.items.length} evaluation(s)</p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 pr-2">
                                        {group.pending > 0 ? (
                                            <span className="inline-flex rounded-md border border-muted-foreground/30 bg-muted px-2 py-1 text-xs text-muted-foreground">
                                                Pending: {group.pending}
                                            </span>
                                        ) : null}
                                        {group.submitted > 0 ? (
                                            <span className="inline-flex rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-foreground">
                                                Submitted: {group.submitted}
                                            </span>
                                        ) : null}
                                        {group.locked > 0 ? (
                                            <span className="inline-flex rounded-md border border-foreground/30 bg-foreground/10 px-2 py-1 text-xs text-foreground">
                                                Locked: {group.locked}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            </AccordionTrigger>

                            <AccordionContent className="px-4 pb-4">
                                <div className="overflow-x-auto rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="min-w-56">Schedule</TableHead>
                                                <TableHead className="min-w-56">Assignee</TableHead>
                                                <TableHead className="min-w-28">Status</TableHead>
                                                <TableHead className="min-w-44">Submitted</TableHead>
                                                <TableHead className="min-w-44">Locked</TableHead>
                                                <TableHead className="min-w-44">Created</TableHead>
                                                <TableHead className="min-w-80 text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>

                                        <TableBody>
                                            {group.items.map((row) => {
                                                const status = normalizeStatus(row.status)
                                                const isSubmitBusy = busyKey === `${row.kind}:${row.id}:submit`
                                                const isLockBusy = busyKey === `${row.kind}:${row.id}:lock`
                                                const isPendingBusy = busyKey === `${row.kind}:${row.id}:set-pending`
                                                const isDeleteBusy = busyKey === `${row.kind}:${row.id}:delete`
                                                const confirmDelete =
                                                    pendingDeleteRef?.id === row.id && pendingDeleteRef?.kind === row.kind

                                                const schedule = scheduleById.get(row.schedule_id.toLowerCase()) ?? null
                                                const scheduleDate = schedule
                                                    ? formatDateTime(schedule.scheduled_at)
                                                    : "Schedule unavailable"
                                                const scheduleRoom = compactString(schedule?.room)

                                                const evaluator = evaluatorById.get(row.evaluator_id.toLowerCase()) ?? null
                                                const evaluatorName =
                                                    compactString(evaluator?.name) ??
                                                    compactString(evaluator?.email) ??
                                                    "Unknown Assignee"

                                                const evaluatorEmail = compactString(evaluator?.email)
                                                const evaluatorRole = evaluator ? roleLabel(evaluator.role) : null

                                                const evaluatorMeta = [evaluatorEmail, evaluatorRole]
                                                    .filter((part): part is string => !!part)
                                                    .join(" • ")

                                                return (
                                                    <TableRow key={`${row.kind}:${row.id}`}>
                                                        <TableCell>
                                                            <div className="space-y-0.5">
                                                                <p className="text-sm">{scheduleDate}</p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {scheduleRoom ?? "No room assigned"}
                                                                    {schedule?.status ? ` • ${toTitleCase(schedule.status)}` : ""}
                                                                </p>
                                                            </div>
                                                        </TableCell>

                                                        <TableCell>
                                                            <div className="space-y-0.5">
                                                                <p className="text-sm font-medium">{evaluatorName}</p>
                                                                <p className="text-xs text-muted-foreground">{evaluatorMeta || "—"}</p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    Flow:{" "}
                                                                    <span className="font-medium text-foreground">
                                                                        {row.assignee_role === "student" ? "Student" : "Panelist"}
                                                                    </span>
                                                                </p>
                                                            </div>
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
                                                                <Button variant="outline" size="sm" onClick={() => openViewDialog(row)}>
                                                                    View
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
                                                                        onClick={() =>
                                                                            setPendingDeleteRef({ id: row.id, kind: row.kind })
                                                                        }
                                                                        disabled={isDeleteBusy}
                                                                    >
                                                                        Delete
                                                                    </Button>
                                                                ) : (
                                                                    <>
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            onClick={() => void deleteEvaluation(row)}
                                                                            disabled={isDeleteBusy}
                                                                        >
                                                                            {isDeleteBusy ? "Deleting..." : "Confirm Delete"}
                                                                        </Button>
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            onClick={() => setPendingDeleteRef(null)}
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
    )
}

export function AdminEvaluationViewDialog({ ctx }: { ctx: AdminEvaluationsPageState }) {
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

    return (
        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
            <DialogContent className="sm:max-w-2xl">
                {selectedViewEvaluation ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Evaluation Details</DialogTitle>
                            <DialogDescription>
                                View full assignment details and run quick lifecycle actions.
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
                                        {selectedViewEvaluation.assignee_role === "student"
                                            ? "Student Flow"
                                            : "Panelist Flow"}
                                    </span>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs font-medium text-muted-foreground">Thesis Group</p>
                                    <p className="mt-1 text-sm font-medium">
                                        {resolveGroupNameFromSchedule(selectedViewSchedule)}
                                    </p>
                                </div>

                                <div className="rounded-lg border p-3">
                                    <p className="text-xs font-medium text-muted-foreground">Schedule</p>
                                    <p className="mt-1 text-sm">
                                        {selectedViewSchedule
                                            ? formatDateTime(selectedViewSchedule.scheduled_at)
                                            : "Schedule unavailable"}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {compactString(selectedViewSchedule?.room) ?? "No room assigned"}
                                        {selectedViewSchedule?.status
                                            ? ` • ${toTitleCase(selectedViewSchedule.status)}`
                                            : ""}
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
                                {normalizeStatus(selectedViewEvaluation.status) !== "pending" ? (
                                    <Button
                                        variant="outline"
                                        onClick={() => void runAction(selectedViewEvaluation, "set-pending")}
                                        disabled={
                                            busyKey ===
                                            `${selectedViewEvaluation.kind}:${selectedViewEvaluation.id}:set-pending`
                                        }
                                    >
                                        {busyKey ===
                                            `${selectedViewEvaluation.kind}:${selectedViewEvaluation.id}:set-pending`
                                            ? "Updating..."
                                            : "Set Pending"}
                                    </Button>
                                ) : null}

                                {normalizeStatus(selectedViewEvaluation.status) === "pending" ? (
                                    <Button
                                        variant="outline"
                                        onClick={() => void runAction(selectedViewEvaluation, "submit")}
                                        disabled={
                                            busyKey ===
                                            `${selectedViewEvaluation.kind}:${selectedViewEvaluation.id}:submit`
                                        }
                                    >
                                        {busyKey ===
                                            `${selectedViewEvaluation.kind}:${selectedViewEvaluation.id}:submit`
                                            ? "Submitting..."
                                            : "Submit"}
                                    </Button>
                                ) : null}

                                {normalizeStatus(selectedViewEvaluation.status) !== "locked" ? (
                                    <Button
                                        onClick={() => void runAction(selectedViewEvaluation, "lock")}
                                        disabled={
                                            busyKey ===
                                            `${selectedViewEvaluation.kind}:${selectedViewEvaluation.id}:lock`
                                        }
                                    >
                                        {busyKey ===
                                            `${selectedViewEvaluation.kind}:${selectedViewEvaluation.id}:lock`
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
