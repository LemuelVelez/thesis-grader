"use client"

import * as React from "react"
import { toast } from "sonner"
import { Check, ChevronDown, RefreshCw, Send } from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type NotificationRecord = {
    id: string
    user_id: string
    type: string
    title: string
    body: string
    data: Record<string, unknown>
    read_at: string | null
    created_at: string
}

type NotificationsResponse = {
    items?: NotificationRecord[]
    item?: NotificationRecord
    updated?: number
    count?: number
    resolved?: {
        recipientCount: number
        recipientIds: string[]
        template: string
        targetMode: string
    }
    error?: string
    message?: string
}

type AutoNotificationTemplate =
    | "evaluation_submitted"
    | "evaluation_locked"
    | "defense_schedule_updated"
    | "general_update"

type AutoNotificationIncludeField =
    | "group_title"
    | "schedule_datetime"
    | "schedule_room"
    | "evaluator_name"
    | "evaluation_status"
    | "student_count"
    | "program"
    | "term"

type AutoNotificationContextKey = "evaluationId" | "scheduleId" | "groupId"

type TargetMode = "users" | "role" | "group" | "schedule"

type ThesisRole = string
type NotificationType = string

type NotificationAutomationOptions = {
    templates: Array<{
        value: AutoNotificationTemplate
        label: string
        description: string
        defaultType: NotificationType
        requiredContext: AutoNotificationContextKey[]
        allowedIncludes: AutoNotificationIncludeField[]
        defaultIncludes: AutoNotificationIncludeField[]
    }>
    targetModes: Array<{
        value: TargetMode
        label: string
        description: string
    }>
    includeOptions: Array<{
        value: AutoNotificationIncludeField
        label: string
        description: string
    }>
    notificationTypes: NotificationType[]
    context: {
        roles: ThesisRole[]
        users: Array<{
            value: string
            label: string
            role: ThesisRole
        }>
        groups: Array<{
            value: string
            label: string
            program: string | null
            term: string | null
        }>
        schedules: Array<{
            value: string
            label: string
            scheduledAt: string
            room: string | null
            groupId: string
            groupTitle: string | null
        }>
        evaluations: Array<{
            value: string
            label: string
            status: string
            scheduleId: string
            evaluatorId: string
            evaluatorName: string | null
        }>
    }
}

type AutomationOptionsResponse = {
    item?: NotificationAutomationOptions
    error?: string
    message?: string
}

const NONE_VALUE = "__none__"

const READ_FILTERS = [
    { value: "all", label: "All" },
    { value: "unread", label: "Unread" },
    { value: "read", label: "Read" },
] as const

function formatDate(value: string) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function toLabel(value: string) {
    return value
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
}

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { error?: string; message?: string }
        return data.error || data.message || `Request failed (${res.status})`
    } catch {
        return `Request failed (${res.status})`
    }
}

function boolToSelectValue(value: boolean) {
    return value ? "yes" : "no"
}

function selectValueToBool(value: string) {
    return value === "yes"
}

export default function AdminNotificationsPage() {
    const [options, setOptions] = React.useState<NotificationAutomationOptions | null>(null)
    const [optionsLoading, setOptionsLoading] = React.useState(false)

    const [notifications, setNotifications] = React.useState<NotificationRecord[]>([])
    const [listLoading, setListLoading] = React.useState(false)
    const [actionKey, setActionKey] = React.useState<string | null>(null)

    // Automatic dispatch selections
    const [template, setTemplate] = React.useState<AutoNotificationTemplate | "">("")
    const [notificationType, setNotificationType] = React.useState<NotificationType>("general")
    const [targetMode, setTargetMode] = React.useState<TargetMode>("users")
    const [includeFields, setIncludeFields] = React.useState<AutoNotificationIncludeField[]>([])

    // target detail selections
    const [targetUserIds, setTargetUserIds] = React.useState<string[]>([])
    const [targetRole, setTargetRole] = React.useState<string>(NONE_VALUE)
    const [targetGroupId, setTargetGroupId] = React.useState<string>(NONE_VALUE)
    const [targetScheduleId, setTargetScheduleId] = React.useState<string>(NONE_VALUE)
    const [includeAdviser, setIncludeAdviser] = React.useState(false)
    const [includeStudents, setIncludeStudents] = React.useState(true)
    const [includePanelists, setIncludePanelists] = React.useState(false)
    const [includeCreator, setIncludeCreator] = React.useState(false)

    // context selections
    const [contextEvaluationId, setContextEvaluationId] = React.useState<string>(NONE_VALUE)
    const [contextScheduleId, setContextScheduleId] = React.useState<string>(NONE_VALUE)
    const [contextGroupId, setContextGroupId] = React.useState<string>(NONE_VALUE)

    // viewer/filter selections
    const [viewerUserId, setViewerUserId] = React.useState<string>(NONE_VALUE)
    const [typeFilter, setTypeFilter] = React.useState<string>("all")
    const [readFilter, setReadFilter] = React.useState<"all" | "unread" | "read">("all")

    const selectedTemplateDef = React.useMemo(() => {
        if (!options || !template) return null
        return options.templates.find((t) => t.value === template) ?? null
    }, [options, template])

    const includeChoices = React.useMemo(() => {
        if (!options || !selectedTemplateDef) return []
        const allowed = new Set(selectedTemplateDef.allowedIncludes)
        return options.includeOptions.filter((opt) => allowed.has(opt.value))
    }, [options, selectedTemplateDef])

    const unreadCount = React.useMemo(
        () => notifications.filter((n) => !n.read_at).length,
        [notifications],
    )

    const needsEvaluationSelector = React.useMemo(() => {
        if (!selectedTemplateDef) return false
        if (selectedTemplateDef.requiredContext.includes("evaluationId")) return true
        return includeFields.includes("evaluator_name") || includeFields.includes("evaluation_status")
    }, [includeFields, selectedTemplateDef])

    const needsScheduleSelector = React.useMemo(() => {
        if (!selectedTemplateDef) return false
        if (selectedTemplateDef.requiredContext.includes("scheduleId")) return true
        return includeFields.includes("schedule_datetime") || includeFields.includes("schedule_room")
    }, [includeFields, selectedTemplateDef])

    const needsGroupSelector = React.useMemo(() => {
        if (!selectedTemplateDef) return false
        if (selectedTemplateDef.requiredContext.includes("groupId")) return true
        return (
            includeFields.includes("group_title") ||
            includeFields.includes("student_count") ||
            includeFields.includes("program") ||
            includeFields.includes("term")
        )
    }, [includeFields, selectedTemplateDef])

    const loadAutomationOptions = React.useCallback(async () => {
        setOptionsLoading(true)
        try {
            const res = await fetch("/api/notifications/auto/options?limit=100", {
                cache: "no-store",
            })
            if (!res.ok) throw new Error(await readErrorMessage(res))

            const data = (await res.json()) as AutomationOptionsResponse
            const item = data.item
            if (!item) throw new Error("Automation options response is empty.")

            setOptions(item)

            const firstTemplate = item.templates[0]
            if (firstTemplate) {
                setTemplate(firstTemplate.value)
                setNotificationType(firstTemplate.defaultType)
                setIncludeFields([...firstTemplate.defaultIncludes])
            }

            const firstTargetMode = item.targetModes[0]?.value ?? "users"
            setTargetMode(firstTargetMode)

            const firstUser = item.context.users[0]?.value ?? NONE_VALUE
            const firstRole = item.context.roles[0] ?? NONE_VALUE
            const firstGroup = item.context.groups[0]?.value ?? NONE_VALUE
            const firstSchedule = item.context.schedules[0]?.value ?? NONE_VALUE
            const firstEvaluation = item.context.evaluations[0]?.value ?? NONE_VALUE

            setTargetUserIds(firstUser === NONE_VALUE ? [] : [firstUser])
            setTargetRole(firstRole)
            setTargetGroupId(firstGroup)
            setTargetScheduleId(firstSchedule)

            setContextEvaluationId(firstEvaluation)
            setContextScheduleId(firstSchedule)
            setContextGroupId(firstGroup)

            setViewerUserId(firstUser)
            setTypeFilter("all")
            setReadFilter("all")

            toast.success("Notification automation options loaded.")
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to load notification automation options."
            toast.error(message)
        } finally {
            setOptionsLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void loadAutomationOptions()
    }, [loadAutomationOptions])

    React.useEffect(() => {
        if (!selectedTemplateDef) return

        setNotificationType(selectedTemplateDef.defaultType)

        const allowed = new Set(selectedTemplateDef.allowedIncludes)
        setIncludeFields((prev) => {
            const filtered = prev.filter((field) => allowed.has(field))
            if (filtered.length > 0) return filtered
            return [...selectedTemplateDef.defaultIncludes]
        })

        if (selectedTemplateDef.requiredContext.includes("evaluationId")) {
            if (contextEvaluationId === NONE_VALUE) {
                setContextEvaluationId(options?.context.evaluations[0]?.value ?? NONE_VALUE)
            }
        }
        if (selectedTemplateDef.requiredContext.includes("scheduleId")) {
            if (contextScheduleId === NONE_VALUE) {
                setContextScheduleId(options?.context.schedules[0]?.value ?? NONE_VALUE)
            }
        }
        if (selectedTemplateDef.requiredContext.includes("groupId")) {
            if (contextGroupId === NONE_VALUE) {
                setContextGroupId(options?.context.groups[0]?.value ?? NONE_VALUE)
            }
        }
    }, [contextEvaluationId, contextGroupId, contextScheduleId, options, selectedTemplateDef])

    React.useEffect(() => {
        if (!options) return
        if (targetMode === "users" && targetUserIds.length === 0) {
            const first = options.context.users[0]?.value
            if (first) setTargetUserIds([first])
        }
        if (targetMode === "role" && targetRole === NONE_VALUE) {
            setTargetRole(options.context.roles[0] ?? NONE_VALUE)
        }
        if (targetMode === "group" && targetGroupId === NONE_VALUE) {
            setTargetGroupId(options.context.groups[0]?.value ?? NONE_VALUE)
        }
        if (targetMode === "schedule" && targetScheduleId === NONE_VALUE) {
            setTargetScheduleId(options.context.schedules[0]?.value ?? NONE_VALUE)
        }
    }, [options, targetGroupId, targetMode, targetRole, targetScheduleId, targetUserIds.length])

    const loadNotifications = React.useCallback(async () => {
        const uid = viewerUserId
        if (!uid || uid === NONE_VALUE) {
            setNotifications([])
            return
        }

        setListLoading(true)
        try {
            const encodedUid = encodeURIComponent(uid)

            let endpoint = `/api/notifications/user/${encodedUid}?limit=200`
            if (readFilter === "unread") {
                endpoint = `/api/notifications/user/${encodedUid}/unread?limit=200`
            } else if (typeFilter !== "all") {
                endpoint = `/api/notifications/user/${encodedUid}/type/${typeFilter}?limit=200`
            }

            const res = await fetch(endpoint, { cache: "no-store" })
            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = (await res.json()) as NotificationsResponse
            const rawItems = Array.isArray(data.items) ? data.items : []

            const filtered = rawItems.filter((item) => {
                if (readFilter === "read" && !item.read_at) return false
                if (readFilter === "unread" && item.read_at) return false
                if (typeFilter !== "all" && item.type !== typeFilter) return false
                return true
            })

            filtered.sort((a, b) => {
                const aT = new Date(a.created_at).getTime()
                const bT = new Date(b.created_at).getTime()
                if (Number.isNaN(aT) || Number.isNaN(bT)) return 0
                return bT - aT
            })

            setNotifications(filtered)
        } catch (error) {
            setNotifications([])
            const message =
                error instanceof Error ? error.message : "Failed to load notifications."
            toast.error(message)
        } finally {
            setListLoading(false)
        }
    }, [readFilter, typeFilter, viewerUserId])

    React.useEffect(() => {
        if (!options || viewerUserId === NONE_VALUE) return
        void loadNotifications()
    }, [loadNotifications, options, viewerUserId])

    const toggleTargetUser = React.useCallback((userId: string, checked: boolean) => {
        setTargetUserIds((prev) => {
            const next = new Set(prev)
            if (checked) next.add(userId)
            else next.delete(userId)
            return Array.from(next)
        })
    }, [])

    const toggleIncludeField = React.useCallback((field: AutoNotificationIncludeField, checked: boolean) => {
        setIncludeFields((prev) => {
            const next = new Set(prev)
            if (checked) next.add(field)
            else next.delete(field)
            return Array.from(next)
        })
    }, [])

    const sendAutomaticNotification = React.useCallback(async () => {
        if (!options || !template || !selectedTemplateDef) {
            toast.error("Automation options are not ready yet.")
            return
        }

        if (includeFields.length === 0) {
            toast.error("Select at least one information field to include.")
            return
        }

        const target: Record<string, unknown> = { mode: targetMode }

        if (targetMode === "users") {
            if (targetUserIds.length === 0) {
                toast.error("Select at least one recipient user.")
                return
            }
            target.userIds = targetUserIds
        } else if (targetMode === "role") {
            if (targetRole === NONE_VALUE) {
                toast.error("Select a role.")
                return
            }
            target.role = targetRole
        } else if (targetMode === "group") {
            if (targetGroupId === NONE_VALUE) {
                toast.error("Select a group.")
                return
            }
            target.groupId = targetGroupId
            target.includeAdviser = includeAdviser
        } else if (targetMode === "schedule") {
            if (targetScheduleId === NONE_VALUE) {
                toast.error("Select a schedule.")
                return
            }
            target.scheduleId = targetScheduleId
            target.includeStudents = includeStudents
            target.includePanelists = includePanelists
            target.includeCreator = includeCreator
        }

        if (
            selectedTemplateDef.requiredContext.includes("evaluationId") &&
            contextEvaluationId === NONE_VALUE
        ) {
            toast.error("This template requires an evaluation context.")
            return
        }

        if (
            selectedTemplateDef.requiredContext.includes("scheduleId") &&
            contextScheduleId === NONE_VALUE
        ) {
            toast.error("This template requires a schedule context.")
            return
        }

        if (
            selectedTemplateDef.requiredContext.includes("groupId") &&
            contextGroupId === NONE_VALUE
        ) {
            toast.error("This template requires a group context.")
            return
        }

        const context: Record<string, string> = {}
        if (contextEvaluationId !== NONE_VALUE) context.evaluationId = contextEvaluationId
        if (contextScheduleId !== NONE_VALUE) context.scheduleId = contextScheduleId
        if (contextGroupId !== NONE_VALUE) context.groupId = contextGroupId

        const payload: Record<string, unknown> = {
            template,
            type: notificationType,
            target,
            include: includeFields,
        }

        if (Object.keys(context).length > 0) {
            payload.context = context
        }

        setActionKey("send-auto")
        try {
            const res = await fetch("/api/notifications/auto/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = (await res.json()) as NotificationsResponse
            const createdCount = typeof data.count === "number" ? data.count : 0
            toast.success(`Automatic notification sent to ${createdCount} recipient(s).`)

            if (viewerUserId !== NONE_VALUE) {
                void loadNotifications()
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to send automatic notification."
            toast.error(message)
        } finally {
            setActionKey(null)
        }
    }, [
        contextEvaluationId,
        contextGroupId,
        contextScheduleId,
        includeAdviser,
        includeCreator,
        includeFields,
        includePanelists,
        includeStudents,
        loadNotifications,
        notificationType,
        options,
        selectedTemplateDef,
        targetGroupId,
        targetMode,
        targetRole,
        targetScheduleId,
        targetUserIds,
        template,
        viewerUserId,
    ])

    const markAsRead = React.useCallback(async (id: string) => {
        setActionKey(`read:${id}`)

        try {
            const res = await fetch(`/api/notifications/${id}/read`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = (await res.json()) as NotificationsResponse
            if (data.item) {
                setNotifications((prev) =>
                    prev.map((n) => (n.id === id ? data.item! : n)),
                )
            } else {
                setNotifications((prev) =>
                    prev.map((n) =>
                        n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
                    ),
                )
            }

            toast.success("Notification marked as read.")
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to mark notification as read."
            toast.error(message)
        } finally {
            setActionKey(null)
        }
    }, [])

    const deleteNotification = React.useCallback(async (id: string) => {
        setActionKey(`delete:${id}`)

        try {
            const res = await fetch(`/api/notifications/${id}`, {
                method: "DELETE",
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            setNotifications((prev) => prev.filter((n) => n.id !== id))
            toast.success("Notification deleted.")
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to delete notification."
            toast.error(message)
        } finally {
            setActionKey(null)
        }
    }, [])

    const markAllAsRead = React.useCallback(async () => {
        if (!viewerUserId || viewerUserId === NONE_VALUE) {
            toast.error("Select a user first.")
            return
        }

        setActionKey("read-all")
        try {
            const res = await fetch(`/api/notifications/user/${encodeURIComponent(viewerUserId)}/read-all`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = (await res.json()) as NotificationsResponse
            const updated = typeof data.updated === "number" ? data.updated : 0
            toast.success(`Marked ${updated} notification(s) as read.`)
            await loadNotifications()
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to mark all as read."
            toast.error(message)
        } finally {
            setActionKey(null)
        }
    }, [loadNotifications, viewerUserId])

    const includeButtonText =
        includeFields.length === 0
            ? "Choose included details"
            : `${includeFields.length} field(s) selected`

    const targetUsersButtonText =
        targetUserIds.length === 0
            ? "Choose recipient users"
            : `${targetUserIds.length} user(s) selected`

    return (
        <DashboardLayout
            title="Automatic Notifications"
            description="Select template, audience, and included details. No manual message input."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="mb-4 flex items-center justify-between gap-2">
                        <div>
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
                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">Template</p>
                                    <Select
                                        value={template || options.templates[0]?.value}
                                        onValueChange={(value) =>
                                            setTemplate(value as AutoNotificationTemplate)
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select template" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {options.templates.map((t) => (
                                                <SelectItem key={t.value} value={t.value}>
                                                    {t.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {selectedTemplateDef ? (
                                        <p className="text-[11px] text-muted-foreground">
                                            {selectedTemplateDef.description}
                                        </p>
                                    ) : null}
                                </div>

                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">Notification type</p>
                                    <Select
                                        value={notificationType}
                                        onValueChange={(value) => setNotificationType(value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {options.notificationTypes.map((nt) => (
                                                <SelectItem key={nt} value={nt}>
                                                    {toLabel(nt)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">Target mode</p>
                                    <Select
                                        value={targetMode}
                                        onValueChange={(value) => setTargetMode(value as TargetMode)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select target mode" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {options.targetModes.map((tm) => (
                                                <SelectItem key={tm.value} value={tm.value}>
                                                    {tm.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="rounded-md border bg-muted/20 p-3">
                                <p className="mb-2 text-xs font-medium text-muted-foreground">Target selection</p>

                                {targetMode === "users" ? (
                                    <div className="space-y-2">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="outline" className="w-full justify-between">
                                                    {targetUsersButtonText}
                                                    <ChevronDown className="ml-2 h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent className="w-90">
                                                <DropdownMenuLabel>Recipients (users)</DropdownMenuLabel>
                                                <DropdownMenuSeparator />
                                                {options.context.users.map((u) => (
                                                    <DropdownMenuCheckboxItem
                                                        key={u.value}
                                                        checked={targetUserIds.includes(u.value)}
                                                        onCheckedChange={(checked) =>
                                                            toggleTargetUser(u.value, checked === true)
                                                        }
                                                    >
                                                        {u.label} • {toLabel(u.role)}
                                                    </DropdownMenuCheckboxItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                ) : null}

                                {targetMode === "role" ? (
                                    <div className="space-y-2">
                                        <Select value={targetRole} onValueChange={setTargetRole}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select role" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {options.context.roles.map((role) => (
                                                    <SelectItem key={role} value={role}>
                                                        {toLabel(role)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ) : null}

                                {targetMode === "group" ? (
                                    <div className="grid gap-2 md:grid-cols-2">
                                        <Select value={targetGroupId} onValueChange={setTargetGroupId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select thesis group" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {options.context.groups.map((g) => (
                                                    <SelectItem key={g.value} value={g.value}>
                                                        {g.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        <Select
                                            value={boolToSelectValue(includeAdviser)}
                                            onValueChange={(v) => setIncludeAdviser(selectValueToBool(v))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Include adviser?" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="yes">Include adviser</SelectItem>
                                                <SelectItem value="no">Students only</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ) : null}

                                {targetMode === "schedule" ? (
                                    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                                        <Select value={targetScheduleId} onValueChange={setTargetScheduleId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select schedule" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {options.context.schedules.map((s) => (
                                                    <SelectItem key={s.value} value={s.value}>
                                                        {s.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        <Select
                                            value={boolToSelectValue(includeStudents)}
                                            onValueChange={(v) => setIncludeStudents(selectValueToBool(v))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Include students" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="yes">Include students</SelectItem>
                                                <SelectItem value="no">Skip students</SelectItem>
                                            </SelectContent>
                                        </Select>

                                        <Select
                                            value={boolToSelectValue(includePanelists)}
                                            onValueChange={(v) => setIncludePanelists(selectValueToBool(v))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Include panelists" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="yes">Include panelists</SelectItem>
                                                <SelectItem value="no">Skip panelists</SelectItem>
                                            </SelectContent>
                                        </Select>

                                        <Select
                                            value={boolToSelectValue(includeCreator)}
                                            onValueChange={(v) => setIncludeCreator(selectValueToBool(v))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Include creator" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="yes">Include creator</SelectItem>
                                                <SelectItem value="no">Skip creator</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ) : null}
                            </div>

                            <div className="rounded-md border bg-muted/20 p-3">
                                <p className="mb-2 text-xs font-medium text-muted-foreground">Context selection</p>

                                <div className="grid gap-2 md:grid-cols-3">
                                    {needsEvaluationSelector ? (
                                        <Select value={contextEvaluationId} onValueChange={setContextEvaluationId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select evaluation context" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {!selectedTemplateDef?.requiredContext.includes("evaluationId") ? (
                                                    <SelectItem value={NONE_VALUE}>No evaluation context</SelectItem>
                                                ) : null}
                                                {options.context.evaluations.map((e) => (
                                                    <SelectItem key={e.value} value={e.value}>
                                                        {e.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : null}

                                    {needsScheduleSelector ? (
                                        <Select value={contextScheduleId} onValueChange={setContextScheduleId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select schedule context" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {!selectedTemplateDef?.requiredContext.includes("scheduleId") ? (
                                                    <SelectItem value={NONE_VALUE}>No schedule context</SelectItem>
                                                ) : null}
                                                {options.context.schedules.map((s) => (
                                                    <SelectItem key={s.value} value={s.value}>
                                                        {s.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : null}

                                    {needsGroupSelector ? (
                                        <Select value={contextGroupId} onValueChange={setContextGroupId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select group context" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {!selectedTemplateDef?.requiredContext.includes("groupId") ? (
                                                    <SelectItem value={NONE_VALUE}>No group context</SelectItem>
                                                ) : null}
                                                {options.context.groups.map((g) => (
                                                    <SelectItem key={g.value} value={g.value}>
                                                        {g.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : null}
                                </div>
                            </div>

                            <div className="rounded-md border bg-muted/20 p-3">
                                <p className="mb-2 text-xs font-medium text-muted-foreground">Included information</p>
                                <div className="flex flex-wrap items-center gap-2">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" className="justify-between">
                                                {includeButtonText}
                                                <ChevronDown className="ml-2 h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[320px]">
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
                                                    <div className="flex flex-col">
                                                        <span>{field.label}</span>
                                                        <span className="text-[11px] text-muted-foreground">
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
                                            className="inline-flex items-center rounded-md border px-2 py-1 text-xs"
                                        >
                                            <Check className="mr-1 h-3 w-3" />
                                            {toLabel(field)}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button
                                    onClick={() => void sendAutomaticNotification()}
                                    disabled={optionsLoading || !!actionKey || !options}
                                >
                                    <Send className="mr-2 h-4 w-4" />
                                    {actionKey === "send-auto" ? "Sending..." : "Send Automatic Notification"}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="rounded-lg border bg-card p-4">
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h2 className="text-sm font-semibold">Notification Viewer</h2>
                            <p className="text-xs text-muted-foreground">
                                Review sent notifications for a selected user.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={() => void loadNotifications()}
                                disabled={listLoading || !!actionKey || viewerUserId === NONE_VALUE}
                            >
                                {listLoading ? "Loading..." : "Load"}
                            </Button>

                            <Button
                                variant="outline"
                                onClick={() => void markAllAsRead()}
                                disabled={listLoading || !!actionKey || viewerUserId === NONE_VALUE}
                            >
                                {actionKey === "read-all" ? "Updating..." : "Mark All Read"}
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">User</p>
                            <Select value={viewerUserId} onValueChange={setViewerUserId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select user" />
                                </SelectTrigger>
                                <SelectContent>
                                    {options?.context.users.map((u) => (
                                        <SelectItem key={u.value} value={u.value}>
                                            {u.label} • {toLabel(u.role)}
                                        </SelectItem>
                                    )) ?? null}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Type filter</p>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Filter by type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All</SelectItem>
                                    {(options?.notificationTypes ?? []).map((nt) => (
                                        <SelectItem key={nt} value={nt}>
                                            {toLabel(nt)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Read filter</p>
                            <Select
                                value={readFilter}
                                onValueChange={(v) => setReadFilter(v as "all" | "unread" | "read")}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Filter by read status" />
                                </SelectTrigger>
                                <SelectContent>
                                    {READ_FILTERS.map((rf) => (
                                        <SelectItem key={rf.value} value={rf.value}>
                                            {rf.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <p className="mt-3 text-sm text-muted-foreground">
                        Total: <span className="font-semibold text-foreground">{notifications.length}</span> •
                        Unread: <span className="font-semibold text-foreground">{unreadCount}</span>
                    </p>
                </div>

                <div className="overflow-x-auto rounded-lg border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-72">Notification</TableHead>
                                <TableHead className="min-w-40">Type</TableHead>
                                <TableHead className="min-w-28">Status</TableHead>
                                <TableHead className="min-w-44">Created</TableHead>
                                <TableHead className="min-w-44 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {listLoading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <TableRow key={`skeleton-${i}`}>
                                        <TableCell colSpan={5}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : notifications.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                        Select a user and click Load to view notifications.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                notifications.map((n) => {
                                    const reading = actionKey === `read:${n.id}`
                                    const deleting = actionKey === `delete:${n.id}`

                                    return (
                                        <TableRow key={n.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{n.title}</span>
                                                    <span className="text-xs text-muted-foreground">{n.body}</span>
                                                    <span className="mt-1 text-[11px] text-muted-foreground">
                                                        ID: {n.id}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                <span className="inline-flex rounded-md border px-2 py-1 text-xs font-medium">
                                                    {toLabel(n.type)}
                                                </span>
                                            </TableCell>

                                            <TableCell>
                                                <span
                                                    className={[
                                                        "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                        n.read_at
                                                            ? "border-muted-foreground/30 bg-muted text-muted-foreground"
                                                            : "border-primary/40 bg-primary/10 text-foreground",
                                                    ].join(" ")}
                                                >
                                                    {n.read_at ? "Read" : "Unread"}
                                                </span>
                                            </TableCell>

                                            <TableCell className="text-muted-foreground">
                                                {formatDate(n.created_at)}
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex items-center justify-end gap-2">
                                                    {!n.read_at ? (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => void markAsRead(n.id)}
                                                            disabled={!!actionKey}
                                                        >
                                                            {reading ? "Updating..." : "Mark Read"}
                                                        </Button>
                                                    ) : null}

                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => void deleteNotification(n.id)}
                                                        disabled={!!actionKey}
                                                    >
                                                        {deleting ? "Deleting..." : "Delete"}
                                                    </Button>
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
