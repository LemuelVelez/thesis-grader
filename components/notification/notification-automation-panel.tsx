"use client"

import * as React from "react"
import { Check, ChevronDown, RefreshCw, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

import {
    NONE_VALUE,
    SELECT_CONTENT_CLASS,
    SELECT_TRIGGER_CLASS,
    type AutoNotificationIncludeField,
    type AutoNotificationTemplate,
    type NotificationAutomationOptions,
    type NotificationType,
    type TargetMode,
} from "@/components/notification/types"
import {
    boolToSelectValue,
    buildEvaluationDisplayLabel,
    buildGroupDisplayLabel,
    buildScheduleDisplayLabel,
    selectValueToBool,
    shortId,
    toLabel,
} from "@/components/notification/utils"

type NotificationAutomationPanelProps = {
    optionsLoading: boolean
    options: NotificationAutomationOptions | null
    actionKey: string | null

    template: AutoNotificationTemplate | ""
    setTemplate: (value: AutoNotificationTemplate | "") => void
    selectedTemplateDef: NotificationAutomationOptions["templates"][number] | null

    notificationType: NotificationType
    setNotificationType: (value: NotificationType) => void

    targetMode: TargetMode
    setTargetMode: (value: TargetMode) => void

    loadAutomationOptions: () => Promise<void>

    targetUserIds: string[]
    toggleTargetUser: (userId: string, checked: boolean) => void

    targetRole: string
    setTargetRole: (value: string) => void

    targetGroupId: string
    setTargetGroupId: (value: string) => void

    targetScheduleId: string
    setTargetScheduleId: (value: string) => void

    includeAdviser: boolean
    setIncludeAdviser: (value: boolean) => void

    includeStudents: boolean
    setIncludeStudents: (value: boolean) => void

    includePanelists: boolean
    setIncludePanelists: (value: boolean) => void

    includeCreator: boolean
    setIncludeCreator: (value: boolean) => void

    contextEvaluationId: string
    setContextEvaluationId: (value: string) => void

    contextScheduleId: string
    setContextScheduleId: (value: string) => void

    contextGroupId: string
    setContextGroupId: (value: string) => void

    includeFields: AutoNotificationIncludeField[]
    includeChoices: NotificationAutomationOptions["includeOptions"]
    includeButtonText: string
    toggleIncludeField: (field: AutoNotificationIncludeField, checked: boolean) => void

    needsEvaluationSelector: boolean
    needsScheduleSelector: boolean
    needsGroupSelector: boolean
    contextSelectorCount: number

    hasEvaluationOptions: boolean
    hasScheduleOptions: boolean
    hasGroupOptions: boolean

    requiredContextIssue: string | null
    sendDisabled: boolean
    sendAutomaticNotification: () => Promise<void> | void

    targetUsersButtonText: string
}

export function NotificationAutomationPanel({
    optionsLoading,
    options,
    actionKey,
    template,
    setTemplate,
    selectedTemplateDef,
    notificationType,
    setNotificationType,
    targetMode,
    setTargetMode,
    loadAutomationOptions,
    targetUserIds,
    toggleTargetUser,
    targetRole,
    setTargetRole,
    targetGroupId,
    setTargetGroupId,
    targetScheduleId,
    setTargetScheduleId,
    includeAdviser,
    setIncludeAdviser,
    includeStudents,
    setIncludeStudents,
    includePanelists,
    setIncludePanelists,
    includeCreator,
    setIncludeCreator,
    contextEvaluationId,
    setContextEvaluationId,
    contextScheduleId,
    setContextScheduleId,
    contextGroupId,
    setContextGroupId,
    includeFields,
    includeChoices,
    includeButtonText,
    toggleIncludeField,
    needsEvaluationSelector,
    needsScheduleSelector,
    needsGroupSelector,
    contextSelectorCount,
    hasEvaluationOptions,
    hasScheduleOptions,
    hasGroupOptions,
    requiredContextIssue,
    sendDisabled,
    sendAutomaticNotification,
    targetUsersButtonText,
}: NotificationAutomationPanelProps) {
    return (
        <div className="rounded-lg border bg-card p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold">Notification Automation</h2>
                    <p className="text-xs text-muted-foreground">
                        Choose template, recipients, and relevant fields to send automatically.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadAutomationOptions()}
                    disabled={optionsLoading || !!actionKey}
                >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh Options
                </Button>
            </div>

            {optionsLoading && !options ? (
                <div className="space-y-2">
                    <div className="h-10 animate-pulse rounded-md bg-muted/40" />
                    <div className="h-10 animate-pulse rounded-md bg-muted/40" />
                    <div className="h-10 animate-pulse rounded-md bg-muted/40" />
                </div>
            ) : !options ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    Failed to load automation options.
                </div>
            ) : (
                <div className="grid gap-4">
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-2 min-w-0">
                            <p className="text-xs font-medium text-muted-foreground">Template</p>
                            <Select
                                value={template || options.templates[0]?.value}
                                onValueChange={(value) =>
                                    setTemplate(value as AutoNotificationTemplate)
                                }
                            >
                                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                    <SelectValue placeholder="Select template" />
                                </SelectTrigger>
                                <SelectContent className={SELECT_CONTENT_CLASS}>
                                    {options.templates.map((t) => (
                                        <SelectItem key={t.value} value={t.value} textValue={t.label}>
                                            <span className="block truncate" title={t.label}>
                                                {t.label}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedTemplateDef ? (
                                <p className="text-xs text-muted-foreground">
                                    {selectedTemplateDef.description}
                                </p>
                            ) : null}
                        </div>

                        <div className="space-y-2 min-w-0">
                            <p className="text-xs font-medium text-muted-foreground">Notification type</p>
                            <Select
                                value={notificationType}
                                onValueChange={(value) => setNotificationType(value)}
                            >
                                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent className={SELECT_CONTENT_CLASS}>
                                    {options.notificationTypes.map((nt) => (
                                        <SelectItem key={nt} value={nt} textValue={toLabel(nt)}>
                                            <span className="block truncate" title={toLabel(nt)}>
                                                {toLabel(nt)}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2 min-w-0">
                            <p className="text-xs font-medium text-muted-foreground">Target mode</p>
                            <Select
                                value={targetMode}
                                onValueChange={(value) => setTargetMode(value as TargetMode)}
                            >
                                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                    <SelectValue placeholder="Select target mode" />
                                </SelectTrigger>
                                <SelectContent className={SELECT_CONTENT_CLASS}>
                                    {options.targetModes.map((tm) => (
                                        <SelectItem key={tm.value} value={tm.value} textValue={tm.label}>
                                            <span className="block truncate" title={tm.description}>
                                                {tm.label}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="rounded-md border bg-muted/20 p-3">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">Target selection</p>

                        {targetMode === "users" ? (
                            <div className="space-y-2 min-w-0">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between min-w-0">
                                            <span className="truncate">{targetUsersButtonText}</span>
                                            <ChevronDown className="ml-2 h-4 w-4 shrink-0" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-96 max-w-full">
                                        <DropdownMenuLabel>Recipients (users)</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        {options.context.users.length === 0 ? (
                                            <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                                No active users available.
                                            </div>
                                        ) : (
                                            options.context.users.map((u) => {
                                                const label = `${u.label} • ${toLabel(u.role)}`
                                                return (
                                                    <DropdownMenuCheckboxItem
                                                        key={u.value}
                                                        checked={targetUserIds.includes(u.value)}
                                                        onCheckedChange={(checked) =>
                                                            toggleTargetUser(u.value, checked === true)
                                                        }
                                                    >
                                                        <span className="block truncate" title={label}>
                                                            {label}
                                                        </span>
                                                    </DropdownMenuCheckboxItem>
                                                )
                                            })
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        ) : null}

                        {targetMode === "role" ? (
                            <div className="space-y-2 min-w-0">
                                <Select value={targetRole} onValueChange={setTargetRole}>
                                    <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                        <SelectValue placeholder="Select role" />
                                    </SelectTrigger>
                                    <SelectContent className={SELECT_CONTENT_CLASS}>
                                        <SelectItem value={NONE_VALUE}>Select role</SelectItem>
                                        {options.context.roles.map((role) => (
                                            <SelectItem key={role} value={role} textValue={toLabel(role)}>
                                                <span className="block truncate">{toLabel(role)}</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : null}

                        {targetMode === "group" ? (
                            <div className="grid gap-2 md:grid-cols-2">
                                <Select value={targetGroupId} onValueChange={setTargetGroupId}>
                                    <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                        <SelectValue placeholder="Select thesis group" />
                                    </SelectTrigger>
                                    <SelectContent className={SELECT_CONTENT_CLASS}>
                                        <SelectItem value={NONE_VALUE}>Select thesis group</SelectItem>
                                        {options.context.groups.map((g) => {
                                            const label = buildGroupDisplayLabel(g)
                                            return (
                                                <SelectItem key={g.value} value={g.value} textValue={label}>
                                                    <span className="block truncate" title={label}>
                                                        {label}
                                                    </span>
                                                </SelectItem>
                                            )
                                        })}
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={boolToSelectValue(includeAdviser)}
                                    onValueChange={(v) => setIncludeAdviser(selectValueToBool(v))}
                                >
                                    <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                        <SelectValue placeholder="Include adviser?" />
                                    </SelectTrigger>
                                    <SelectContent className={SELECT_CONTENT_CLASS}>
                                        <SelectItem value="yes">Include adviser</SelectItem>
                                        <SelectItem value="no">Students only</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : null}

                        {targetMode === "schedule" ? (
                            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                                <Select value={targetScheduleId} onValueChange={setTargetScheduleId}>
                                    <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                        <SelectValue placeholder="Select schedule" />
                                    </SelectTrigger>
                                    <SelectContent className={SELECT_CONTENT_CLASS}>
                                        <SelectItem value={NONE_VALUE}>Select schedule</SelectItem>
                                        {options.context.schedules.map((s) => {
                                            const primary = buildScheduleDisplayLabel(s)
                                            const secondary = s.groupTitle
                                                ? `Group: ${s.groupTitle}`
                                                : `Group ID: ${shortId(s.groupId)}`
                                            const full = `${primary} • ${secondary}`
                                            return (
                                                <SelectItem key={s.value} value={s.value} textValue={full}>
                                                    <div className="flex min-w-0 flex-col">
                                                        <span className="truncate" title={primary}>
                                                            {primary}
                                                        </span>
                                                        <span
                                                            className="truncate text-xs text-muted-foreground"
                                                            title={secondary}
                                                        >
                                                            {secondary}
                                                        </span>
                                                    </div>
                                                </SelectItem>
                                            )
                                        })}
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={boolToSelectValue(includeStudents)}
                                    onValueChange={(v) => setIncludeStudents(selectValueToBool(v))}
                                >
                                    <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                        <SelectValue placeholder="Include students" />
                                    </SelectTrigger>
                                    <SelectContent className={SELECT_CONTENT_CLASS}>
                                        <SelectItem value="yes">Include students</SelectItem>
                                        <SelectItem value="no">Skip students</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={boolToSelectValue(includePanelists)}
                                    onValueChange={(v) => setIncludePanelists(selectValueToBool(v))}
                                >
                                    <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                        <SelectValue placeholder="Include panelists" />
                                    </SelectTrigger>
                                    <SelectContent className={SELECT_CONTENT_CLASS}>
                                        <SelectItem value="yes">Include panelists</SelectItem>
                                        <SelectItem value="no">Skip panelists</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={boolToSelectValue(includeCreator)}
                                    onValueChange={(v) => setIncludeCreator(selectValueToBool(v))}
                                >
                                    <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                        <SelectValue placeholder="Include creator" />
                                    </SelectTrigger>
                                    <SelectContent className={SELECT_CONTENT_CLASS}>
                                        <SelectItem value="yes">Include creator</SelectItem>
                                        <SelectItem value="no">Skip creator</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : null}
                    </div>

                    <div className="rounded-md border bg-muted/20 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-muted-foreground">Context selection</p>
                            {contextSelectorCount > 0 ? (
                                <span className="text-xs text-muted-foreground">
                                    {contextSelectorCount} selector{contextSelectorCount > 1 ? "s" : ""} active
                                </span>
                            ) : null}
                        </div>

                        {contextSelectorCount === 0 ? (
                            <div className="rounded-md border border-dashed bg-background px-3 py-2 text-xs text-muted-foreground">
                                No context is required for the current template and included fields.
                                Add fields like schedule, group, or evaluation details to enable context selectors.
                            </div>
                        ) : (
                            <div className="grid gap-2 md:grid-cols-3">
                                {needsEvaluationSelector ? (
                                    <div className="space-y-1 min-w-0">
                                        <p className="text-xs text-muted-foreground">Evaluation context</p>
                                        {hasEvaluationOptions || !selectedTemplateDef?.requiredContext.includes("evaluationId") ? (
                                            <Select value={contextEvaluationId} onValueChange={setContextEvaluationId}>
                                                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                                    <SelectValue placeholder="Select evaluation context" />
                                                </SelectTrigger>
                                                <SelectContent className={SELECT_CONTENT_CLASS}>
                                                    <SelectItem value={NONE_VALUE}>
                                                        {selectedTemplateDef?.requiredContext.includes("evaluationId")
                                                            ? "Select evaluation context"
                                                            : "No evaluation context"}
                                                    </SelectItem>
                                                    {options.context.evaluations.map((e) => {
                                                        const primary = buildEvaluationDisplayLabel(e)
                                                        const secondary = `Evaluation #${shortId(e.value)} • Schedule #${shortId(e.scheduleId)}`
                                                        const full = `${primary} • ${secondary}`
                                                        return (
                                                            <SelectItem key={e.value} value={e.value} textValue={full}>
                                                                <div className="flex min-w-0 flex-col">
                                                                    <span className="truncate" title={primary}>
                                                                        {primary}
                                                                    </span>
                                                                    <span
                                                                        className="truncate text-xs text-muted-foreground"
                                                                        title={secondary}
                                                                    >
                                                                        {secondary}
                                                                    </span>
                                                                </div>
                                                            </SelectItem>
                                                        )
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
                                                No evaluation records are available yet.
                                            </div>
                                        )}
                                    </div>
                                ) : null}

                                {needsScheduleSelector ? (
                                    <div className="space-y-1 min-w-0">
                                        <p className="text-xs text-muted-foreground">Schedule context</p>
                                        {hasScheduleOptions || !selectedTemplateDef?.requiredContext.includes("scheduleId") ? (
                                            <Select value={contextScheduleId} onValueChange={setContextScheduleId}>
                                                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                                    <SelectValue placeholder="Select schedule context" />
                                                </SelectTrigger>
                                                <SelectContent className={SELECT_CONTENT_CLASS}>
                                                    <SelectItem value={NONE_VALUE}>
                                                        {selectedTemplateDef?.requiredContext.includes("scheduleId")
                                                            ? "Select schedule context"
                                                            : "No schedule context"}
                                                    </SelectItem>
                                                    {options.context.schedules.map((s) => {
                                                        const primary = buildScheduleDisplayLabel(s)
                                                        const secondary = s.groupTitle
                                                            ? `Group: ${s.groupTitle}`
                                                            : `Group ID: ${shortId(s.groupId)}`
                                                        const full = `${primary} • ${secondary}`
                                                        return (
                                                            <SelectItem key={s.value} value={s.value} textValue={full}>
                                                                <div className="flex min-w-0 flex-col">
                                                                    <span className="truncate" title={primary}>
                                                                        {primary}
                                                                    </span>
                                                                    <span
                                                                        className="truncate text-xs text-muted-foreground"
                                                                        title={secondary}
                                                                    >
                                                                        {secondary}
                                                                    </span>
                                                                </div>
                                                            </SelectItem>
                                                        )
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
                                                No schedules are available yet.
                                            </div>
                                        )}
                                    </div>
                                ) : null}

                                {needsGroupSelector ? (
                                    <div className="space-y-1 min-w-0">
                                        <p className="text-xs text-muted-foreground">Group context</p>
                                        {hasGroupOptions || !selectedTemplateDef?.requiredContext.includes("groupId") ? (
                                            <Select value={contextGroupId} onValueChange={setContextGroupId}>
                                                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                                    <SelectValue placeholder="Select group context" />
                                                </SelectTrigger>
                                                <SelectContent className={SELECT_CONTENT_CLASS}>
                                                    <SelectItem value={NONE_VALUE}>
                                                        {selectedTemplateDef?.requiredContext.includes("groupId")
                                                            ? "Select group context"
                                                            : "No group context"}
                                                    </SelectItem>
                                                    {options.context.groups.map((g) => {
                                                        const label = buildGroupDisplayLabel(g)
                                                        return (
                                                            <SelectItem key={g.value} value={g.value} textValue={label}>
                                                                <span className="block truncate" title={label}>
                                                                    {label}
                                                                </span>
                                                            </SelectItem>
                                                        )
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
                                                No groups are available yet.
                                            </div>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>

                    <div className="rounded-md border bg-muted/20 p-3">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">Included information</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="justify-between min-w-0 max-w-full">
                                        <span className="truncate">{includeButtonText}</span>
                                        <ChevronDown className="ml-2 h-4 w-4 shrink-0" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-96 max-w-full">
                                    <DropdownMenuLabel>Information fields</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {includeChoices.map((field) => (
                                        <DropdownMenuCheckboxItem
                                            key={field.value}
                                            checked={includeFields.includes(field.value)}
                                            onCheckedChange={(checked) =>
                                                toggleIncludeField(field.value, checked === true)
                                            }
                                        >
                                            <div className="flex min-w-0 flex-col">
                                                <span className="truncate" title={field.label}>
                                                    {field.label}
                                                </span>
                                                <span className="truncate text-xs text-muted-foreground" title={field.description}>
                                                    {field.description}
                                                </span>
                                            </div>
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {includeFields.map((field) => (
                                <span
                                    key={field}
                                    className="inline-flex max-w-full items-center rounded-md border px-2 py-1 text-xs"
                                    title={toLabel(field)}
                                >
                                    <Check className="mr-1 h-3 w-3 shrink-0" />
                                    <span className="truncate">{toLabel(field)}</span>
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        {requiredContextIssue ? (
                            <p className="text-xs text-amber-600 dark:text-amber-300">
                                {requiredContextIssue}
                            </p>
                        ) : null}
                        <Button
                            onClick={() => void sendAutomaticNotification()}
                            disabled={sendDisabled}
                        >
                            <Send className="mr-2 h-4 w-4" />
                            {actionKey === "send-auto" ? "Sending..." : "Send Automatic Notification"}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
