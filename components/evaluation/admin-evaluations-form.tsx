"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import {
    ASSIGNMENT_PRESET_META,
    ASSIGNMENT_STATUSES,
    type AssignmentPreset,
} from "./admin-evaluations-model"
import type { AdminEvaluationsPageState } from "./admin-evaluations-hook"

export function AdminEvaluationsForm({ ctx }: { ctx: AdminEvaluationsPageState }) {
    if (!ctx.formOpen) return null

    const {
        formMode,
        formBusy,
        closeForm,
        submitForm,

        availablePresets,
        assignmentPreset,
        setAssignmentPreset,
        assignmentMeta,

        form,
        onFormFieldChange,

        scheduleQuery,
        setScheduleQuery,
        scheduleSuggestions,
        selectedSchedule,
        resolveGroupNameFromSchedule,

        evaluatorQuery,
        setEvaluatorQuery,
        evaluatorSuggestions,
        selectedEvaluator,

        loadingMeta,

        assignableUsers,
        bulkAssignmentPreview,
        allModePreview,

        toTitleCase,
        formatDateTime,
        compactString,
        roleLabel,
        normalizeStatus,
    } = ctx

    return (
        <div className="rounded-lg border bg-card p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold">
                        {formMode === "create" ? "Create Evaluation" : "Edit Evaluation"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {formMode === "create"
                            ? "Student and panelist assignments are handled via separate API flows automatically."
                            : "Update one evaluation assignment using its original flow."}
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

            <div className="mb-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Assignment type</p>
                <div className="flex flex-wrap gap-2">
                    {availablePresets.map((preset: AssignmentPreset) => {
                        const active = assignmentPreset === preset
                        const meta = ASSIGNMENT_PRESET_META[preset]
                        return (
                            <Button
                                key={preset}
                                size="sm"
                                variant={active ? "default" : "outline"}
                                onClick={() => setAssignmentPreset(preset)}
                                disabled={formBusy}
                            >
                                {meta.label}
                            </Button>
                        )
                    })}
                </div>
                <p className="text-xs text-muted-foreground">
                    {ASSIGNMENT_PRESET_META[assignmentPreset].description}
                </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Schedule</p>
                    <Input
                        placeholder="Search by group name, room, or date"
                        value={scheduleQuery}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setScheduleQuery(e.target.value)}
                        disabled={formBusy}
                    />

                    {selectedSchedule ? (
                        <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">Selected:</span>{" "}
                            {resolveGroupNameFromSchedule(selectedSchedule)} •{" "}
                            {formatDateTime(selectedSchedule.scheduled_at)} •{" "}
                            {compactString(selectedSchedule.room) ?? "No room"} •{" "}
                            {toTitleCase(selectedSchedule.status)}
                        </div>
                    ) : null}

                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Quick pick from schedules</p>
                        <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
                            {loadingMeta ? (
                                <span className="text-xs text-muted-foreground">Loading schedule options...</span>
                            ) : scheduleSuggestions.length === 0 ? (
                                <span className="text-xs text-muted-foreground">No matching schedules.</span>
                            ) : (
                                scheduleSuggestions.map((item) => (
                                    <Button
                                        key={item.id}
                                        type="button"
                                        size="sm"
                                        variant={
                                            form.schedule_id.toLowerCase() === item.id.toLowerCase()
                                                ? "default"
                                                : "outline"
                                        }
                                        onClick={() => {
                                            onFormFieldChange("schedule_id", item.id)
                                            setScheduleQuery(resolveGroupNameFromSchedule(item))
                                        }}
                                        className="h-auto px-2 py-1 text-left"
                                        disabled={formBusy}
                                    >
                                        <span className="block max-w-80 truncate text-xs">
                                            {resolveGroupNameFromSchedule(item)} • {formatDateTime(item.scheduled_at)}
                                            {compactString(item.room) ? ` • ${compactString(item.room)}` : ""}
                                        </span>
                                    </Button>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                        {assignmentMeta.mode === "all"
                            ? `Recipients (${assignmentMeta.rolePlural})`
                            : `${toTitleCase(assignmentMeta.roleSingular)} selector`}
                    </p>

                    {assignmentMeta.mode === "all" ? (
                        <>
                            <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs text-muted-foreground">
                                <span className="font-semibold text-foreground">Bulk assignment target:</span>{" "}
                                {assignableUsers.length} active {assignmentMeta.rolePlural}
                            </div>

                            {form.schedule_id ? (
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <div className="rounded-md border p-2 text-xs">
                                        <p className="text-muted-foreground">Ready to create</p>
                                        <p className="mt-1 font-semibold text-foreground">{bulkAssignmentPreview.toCreate}</p>
                                    </div>
                                    <div className="rounded-md border p-2 text-xs">
                                        <p className="text-muted-foreground">Already assigned</p>
                                        <p className="mt-1 font-semibold text-foreground">
                                            {bulkAssignmentPreview.alreadyAssigned}
                                        </p>
                                    </div>
                                    <div className="rounded-md border p-2 text-xs">
                                        <p className="text-muted-foreground">Valid IDs</p>
                                        <p className="mt-1 font-semibold text-foreground">{bulkAssignmentPreview.valid}</p>
                                    </div>
                                    <div className="rounded-md border p-2 text-xs">
                                        <p className="text-muted-foreground">Invalid IDs (skipped)</p>
                                        <p className="mt-1 font-semibold text-foreground">{bulkAssignmentPreview.invalid}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-md border p-2 text-xs text-muted-foreground">
                                    Select a schedule first to preview new vs already assigned recipients.
                                </div>
                            )}

                            <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">Preview of recipients (up to 8)</p>
                                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
                                    {loadingMeta ? (
                                        <span className="text-xs text-muted-foreground">
                                            Loading {assignmentMeta.rolePlural}...
                                        </span>
                                    ) : allModePreview.length === 0 ? (
                                        <span className="text-xs text-muted-foreground">
                                            No active {assignmentMeta.rolePlural} found.
                                        </span>
                                    ) : (
                                        allModePreview.map((item) => (
                                            <span key={item.id} className="inline-flex rounded-md border bg-muted px-2 py-1 text-xs">
                                                {compactString(item.name) ?? "Unnamed"}
                                                {compactString(item.email) ? ` • ${compactString(item.email)}` : ""}
                                            </span>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <Input
                                placeholder={`Search ${assignmentMeta.roleSingular} name, email, or role`}
                                value={evaluatorQuery}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEvaluatorQuery(e.target.value)}
                                disabled={formBusy}
                            />

                            {selectedEvaluator ? (
                                <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs text-muted-foreground">
                                    <span className="font-semibold text-foreground">
                                        Selected {assignmentMeta.roleSingular}:
                                    </span>{" "}
                                    {compactString(selectedEvaluator.name) ?? "Unnamed"} •{" "}
                                    {compactString(selectedEvaluator.email) ?? "No email"} •{" "}
                                    {roleLabel(selectedEvaluator.role)}
                                </div>
                            ) : null}

                            <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">
                                    Quick pick from {assignmentMeta.rolePlural}
                                </p>
                                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
                                    {loadingMeta ? (
                                        <span className="text-xs text-muted-foreground">
                                            Loading {assignmentMeta.rolePlural}...
                                        </span>
                                    ) : evaluatorSuggestions.length === 0 ? (
                                        <span className="text-xs text-muted-foreground">
                                            No matching {assignmentMeta.rolePlural}.
                                        </span>
                                    ) : (
                                        evaluatorSuggestions.map((item) => (
                                            <Button
                                                key={item.id}
                                                type="button"
                                                size="sm"
                                                variant={
                                                    form.evaluator_id.toLowerCase() === item.id.toLowerCase()
                                                        ? "default"
                                                        : "outline"
                                                }
                                                onClick={() => {
                                                    onFormFieldChange("evaluator_id", item.id)
                                                    setEvaluatorQuery(
                                                        compactString(item.name) ?? compactString(item.email) ?? "",
                                                    )
                                                }}
                                                className="h-auto px-2 py-1 text-left"
                                                disabled={formBusy}
                                            >
                                                <span className="block max-w-80 truncate text-xs">
                                                    {compactString(item.name) ?? "Unnamed"}
                                                    {compactString(item.email) ? ` • ${compactString(item.email)}` : ""}
                                                    {" • "}
                                                    {roleLabel(item.role)}
                                                </span>
                                            </Button>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}
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
    )
}
