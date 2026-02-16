"use client"

import * as React from "react"
import { toast } from "sonner"
import { Bell, Check, ChevronDown, RefreshCw, Send } from "lucide-react"

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

/* ------------------------------- Push Types -------------------------------- */

type PushPublicKeyInfo = {
    enabled: boolean
    publicKey: string | null
    reason?: string
}

type PushPublicKeyResponse = {
    item?: PushPublicKeyInfo
    error?: string
    message?: string
}

type PushDispatchResult = {
    enabled: boolean
    totalSubscriptions: number
    sent: number
    failed: number
    removed: number
    reason?: string
}

type PushSendResponse = {
    item?: PushDispatchResult
    error?: string
    message?: string
}

const NONE_VALUE = "__none__"
const PUSH_SW_PATH = "/push-sw.js"

const READ_FILTERS = [
    { value: "all", label: "All" },
    { value: "unread", label: "Unread" },
    { value: "read", label: "Read" },
] as const

const SELECT_TRIGGER_CLASS =
    "w-full min-w-0 max-w-full [&>span]:block [&>span]:truncate"

const SELECT_CONTENT_CLASS = "max-w-3xl"

function shortId(value: string, size = 8) {
    if (!value) return ""
    return value.length <= size ? value : value.slice(0, size)
}

function formatDate(value: string) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function formatDateCompact(value: string) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    })
}

function toLabel(value: string) {
    return value
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
}

function buildScheduleDisplayLabel(
    schedule: NotificationAutomationOptions["context"]["schedules"][number],
) {
    const when = formatDateCompact(schedule.scheduledAt)
    const roomPart = schedule.room ? ` • ${schedule.room}` : ""
    return `${when}${roomPart}`
}

function buildEvaluationDisplayLabel(
    evaluation: NotificationAutomationOptions["context"]["evaluations"][number],
) {
    const status = toLabel(evaluation.status)
    const evaluator = evaluation.evaluatorName ? ` • ${evaluation.evaluatorName}` : ""
    return `${status}${evaluator}`
}

function buildGroupDisplayLabel(
    group: NotificationAutomationOptions["context"]["groups"][number],
) {
    const program = group.program ? ` • ${group.program}` : ""
    const term = group.term ? ` • ${group.term}` : ""
    return `${group.label}${program}${term}`
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

function isPushSupportedInBrowser() {
    if (typeof window === "undefined") return false
    return (
        "Notification" in window &&
        "serviceWorker" in navigator &&
        "PushManager" in window
    )
}

function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/")

    const rawData = typeof window !== "undefined" ? window.atob(base64) : ""
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; i += 1) {
        outputArray[i] = rawData.charCodeAt(i)
    }

    return outputArray
}

function pushPermissionLabel(
    permission: NotificationPermission | "unsupported",
): string {
    if (permission === "granted") return "Granted"
    if (permission === "denied") return "Denied"
    if (permission === "default") return "Prompt"
    return "Unsupported"
}

function truncateMiddle(value: string, head = 30, tail = 18) {
    if (!value) return ""
    if (value.length <= head + tail + 3) return value
    return `${value.slice(0, head)}...${value.slice(-tail)}`
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

    /* ------------------------------- Push State ------------------------------- */

    const swRegistrationRef = React.useRef<ServiceWorkerRegistration | null>(null)
    const [pushSupported, setPushSupported] = React.useState(false)
    const [pushPermission, setPushPermission] = React.useState<NotificationPermission | "unsupported">("unsupported")
    const [pushConfigured, setPushConfigured] = React.useState(false)
    const [pushPublicKey, setPushPublicKey] = React.useState<string | null>(null)
    const [pushConfigReason, setPushConfigReason] = React.useState<string | null>(null)
    const [localPushEndpoint, setLocalPushEndpoint] = React.useState<string | null>(null)

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

    const contextSelectorCount = React.useMemo(
        () =>
            [needsEvaluationSelector, needsScheduleSelector, needsGroupSelector].filter(Boolean)
                .length,
        [needsEvaluationSelector, needsGroupSelector, needsScheduleSelector],
    )

    const hasEvaluationOptions = (options?.context.evaluations.length ?? 0) > 0
    const hasScheduleOptions = (options?.context.schedules.length ?? 0) > 0
    const hasGroupOptions = (options?.context.groups.length ?? 0) > 0

    const requiredContextIssue = React.useMemo(() => {
        if (!selectedTemplateDef) return null

        const requiresEvaluation = selectedTemplateDef.requiredContext.includes("evaluationId")
        const requiresSchedule = selectedTemplateDef.requiredContext.includes("scheduleId")
        const requiresGroup = selectedTemplateDef.requiredContext.includes("groupId")

        if (requiresEvaluation && !hasEvaluationOptions) {
            return "This template requires an evaluation context, but no evaluations are available yet."
        }
        if (requiresSchedule && !hasScheduleOptions) {
            return "This template requires a schedule context, but no schedules are available yet."
        }
        if (requiresGroup && !hasGroupOptions) {
            return "This template requires a group context, but no groups are available yet."
        }

        if (requiresEvaluation && contextEvaluationId === NONE_VALUE) {
            return "Please select an evaluation context."
        }
        if (requiresSchedule && contextScheduleId === NONE_VALUE) {
            return "Please select a schedule context."
        }
        if (requiresGroup && contextGroupId === NONE_VALUE) {
            return "Please select a group context."
        }

        return null
    }, [
        contextEvaluationId,
        contextGroupId,
        contextScheduleId,
        hasEvaluationOptions,
        hasGroupOptions,
        hasScheduleOptions,
        selectedTemplateDef,
    ])

    const loadPushEnvironment = React.useCallback(
        async (showToast = false): Promise<PushPublicKeyInfo | null> => {
            try {
                const res = await fetch("/api/notifications/push/public-key", {
                    cache: "no-store",
                })
                if (!res.ok) throw new Error(await readErrorMessage(res))

                const data = (await res.json()) as PushPublicKeyResponse
                const info = data.item
                if (!info) throw new Error("Push configuration response is empty.")

                setPushConfigured(info.enabled)
                setPushPublicKey(info.publicKey ?? null)
                setPushConfigReason(info.reason ?? null)

                if (showToast) {
                    if (info.enabled) {
                        toast.success("Push server configuration is ready.")
                    } else {
                        toast.error(info.reason || "Push server configuration is incomplete.")
                    }
                }

                return info
            } catch (error) {
                setPushConfigured(false)
                setPushPublicKey(null)

                const message =
                    error instanceof Error ? error.message : "Failed to load push configuration."
                setPushConfigReason(message)
                if (showToast) toast.error(message)
                return null
            }
        },
        [],
    )

    const syncBrowserPushState = React.useCallback(async () => {
        if (!isPushSupportedInBrowser()) {
            setPushSupported(false)
            setPushPermission("unsupported")
            setLocalPushEndpoint(null)
            return
        }

        setPushSupported(true)
        setPushPermission(Notification.permission)

        try {
            const registration =
                swRegistrationRef.current ??
                (await navigator.serviceWorker.register(PUSH_SW_PATH))
            swRegistrationRef.current = registration

            const subscription = await registration.pushManager.getSubscription()
            setLocalPushEndpoint(subscription?.endpoint ?? null)
        } catch {
            setLocalPushEndpoint(null)
        }
    }, [])

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
        void loadPushEnvironment(false)
        void syncBrowserPushState()
    }, [loadPushEnvironment, syncBrowserPushState])

    React.useEffect(() => {
        if (typeof window === "undefined") return
        const handleFocus = () => {
            void syncBrowserPushState()
        }

        window.addEventListener("focus", handleFocus)
        document.addEventListener("visibilitychange", handleFocus)

        return () => {
            window.removeEventListener("focus", handleFocus)
            document.removeEventListener("visibilitychange", handleFocus)
        }
    }, [syncBrowserPushState])

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

        const userIds = new Set(options.context.users.map((u) => u.value))
        const roleSet = new Set(options.context.roles)
        const groupIds = new Set(options.context.groups.map((g) => g.value))
        const scheduleIds = new Set(options.context.schedules.map((s) => s.value))
        const evaluationIds = new Set(options.context.evaluations.map((e) => e.value))

        setTargetUserIds((prev) => {
            const filtered = prev.filter((id) => userIds.has(id))
            return filtered.length === prev.length ? prev : filtered
        })

        if (viewerUserId !== NONE_VALUE && !userIds.has(viewerUserId)) {
            setViewerUserId(options.context.users[0]?.value ?? NONE_VALUE)
        }

        if (targetRole !== NONE_VALUE && !roleSet.has(targetRole)) {
            setTargetRole(options.context.roles[0] ?? NONE_VALUE)
        }

        if (targetGroupId !== NONE_VALUE && !groupIds.has(targetGroupId)) {
            setTargetGroupId(options.context.groups[0]?.value ?? NONE_VALUE)
        }

        if (targetScheduleId !== NONE_VALUE && !scheduleIds.has(targetScheduleId)) {
            setTargetScheduleId(options.context.schedules[0]?.value ?? NONE_VALUE)
        }

        if (contextEvaluationId !== NONE_VALUE && !evaluationIds.has(contextEvaluationId)) {
            setContextEvaluationId(NONE_VALUE)
        }

        if (contextScheduleId !== NONE_VALUE && !scheduleIds.has(contextScheduleId)) {
            setContextScheduleId(NONE_VALUE)
        }

        if (contextGroupId !== NONE_VALUE && !groupIds.has(contextGroupId)) {
            setContextGroupId(NONE_VALUE)
        }
    }, [
        contextEvaluationId,
        contextGroupId,
        contextScheduleId,
        options,
        targetGroupId,
        targetRole,
        targetScheduleId,
        viewerUserId,
    ])

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

        if (requiredContextIssue) {
            toast.error(requiredContextIssue)
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
        requiredContextIssue,
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

    /* ----------------------------- Push Handlers ----------------------------- */

    const enablePushForSelectedUser = React.useCallback(async () => {
        if (viewerUserId === NONE_VALUE) {
            toast.error("Select a user in Notification Viewer first.")
            return
        }

        if (!isPushSupportedInBrowser()) {
            toast.error("This browser does not support web push notifications.")
            return
        }

        setActionKey("push:enable")
        try {
            let permission: NotificationPermission = Notification.permission
            if (permission !== "granted") {
                permission = await Notification.requestPermission()
            }
            setPushPermission(permission)

            if (permission !== "granted") {
                throw new Error("Push permission is required. Please allow notifications in your browser.")
            }

            let serverPublicKey = pushPublicKey
            if (!pushConfigured || !serverPublicKey) {
                const info = await loadPushEnvironment(false)
                if (!info?.enabled || !info.publicKey) {
                    throw new Error(info?.reason || "Push is not configured on the server.")
                }
                serverPublicKey = info.publicKey
            }

            const registration =
                swRegistrationRef.current ??
                (await navigator.serviceWorker.register(PUSH_SW_PATH))
            swRegistrationRef.current = registration

            let subscription = await registration.pushManager.getSubscription()
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(serverPublicKey),
                })
            }

            const res = await fetch("/api/notifications/push/subscriptions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: viewerUserId,
                    subscription,
                }),
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            setLocalPushEndpoint(subscription.endpoint)
            toast.success("Push notification is enabled for this browser device.")
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to enable browser push."
            toast.error(message)
        } finally {
            setActionKey(null)
            void syncBrowserPushState()
        }
    }, [
        loadPushEnvironment,
        pushConfigured,
        pushPublicKey,
        syncBrowserPushState,
        viewerUserId,
    ])

    const disablePushForCurrentBrowser = React.useCallback(async () => {
        if (!isPushSupportedInBrowser()) {
            toast.error("This browser does not support web push notifications.")
            return
        }

        setActionKey("push:disable")
        try {
            const registration =
                swRegistrationRef.current ??
                (await navigator.serviceWorker.register(PUSH_SW_PATH))
            swRegistrationRef.current = registration

            const subscription = await registration.pushManager.getSubscription()
            const endpoint = subscription?.endpoint ?? localPushEndpoint

            if (!endpoint) {
                throw new Error("This browser has no active push subscription.")
            }

            const payload: Record<string, unknown> = { endpoint }
            if (viewerUserId !== NONE_VALUE) {
                payload.userId = viewerUserId
            }

            const res = await fetch("/api/notifications/push/subscriptions", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            if (subscription) {
                await subscription.unsubscribe()
            }

            setLocalPushEndpoint(null)
            toast.success("Push notification is disabled for this browser device.")
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to disable browser push."
            toast.error(message)
        } finally {
            setActionKey(null)
            void syncBrowserPushState()
        }
    }, [localPushEndpoint, syncBrowserPushState, viewerUserId])

    const sendPushTestToSelectedUser = React.useCallback(async () => {
        if (viewerUserId === NONE_VALUE) {
            toast.error("Select a user in Notification Viewer first.")
            return
        }

        setActionKey("push:test")
        try {
            const res = await fetch("/api/notifications/push/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userIds: [viewerUserId],
                    payload: {
                        type: "general",
                        title: "Test Push Notification",
                        body: "If you can see this alert, browser push is working.",
                        data: {
                            url: "/dashboard/admin/notifications",
                            topic: "admin-notification-test",
                        },
                    },
                }),
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = (await res.json()) as PushSendResponse
            const result = data.item

            if (result && result.enabled === false) {
                throw new Error(result.reason || "Push is disabled on the server.")
            }

            toast.success(
                `Test push dispatched. Sent: ${result?.sent ?? 0}, Failed: ${result?.failed ?? 0}.`,
            )
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to send test push."
            toast.error(message)
        } finally {
            setActionKey(null)
            void syncBrowserPushState()
        }
    }, [syncBrowserPushState, viewerUserId])

    const includeButtonText =
        includeFields.length === 0
            ? "Choose included details"
            : `${includeFields.length} field(s) selected`

    const targetUsersButtonText =
        targetUserIds.length === 0
            ? "Choose recipient users"
            : `${targetUserIds.length} user(s) selected`

    const sendDisabled =
        optionsLoading || !!actionKey || !options || !!requiredContextIssue

    const pushActionsBusy = actionKey?.startsWith("push:") ?? false
    const canManagePush = pushSupported && viewerUserId !== NONE_VALUE

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
                                                        <span className="text-xs text-muted-foreground truncate" title={field.description}>
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
                        <div className="space-y-2 min-w-0">
                            <p className="text-xs font-medium text-muted-foreground">User</p>
                            <Select value={viewerUserId} onValueChange={setViewerUserId}>
                                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                    <SelectValue placeholder="Select user" />
                                </SelectTrigger>
                                <SelectContent className={SELECT_CONTENT_CLASS}>
                                    <SelectItem value={NONE_VALUE}>Select user</SelectItem>
                                    {options?.context.users.map((u) => {
                                        const label = `${u.label} • ${toLabel(u.role)}`
                                        return (
                                            <SelectItem key={u.value} value={u.value} textValue={label}>
                                                <span className="block truncate" title={label}>
                                                    {label}
                                                </span>
                                            </SelectItem>
                                        )
                                    }) ?? null}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2 min-w-0">
                            <p className="text-xs font-medium text-muted-foreground">Type filter</p>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                    <SelectValue placeholder="Filter by type" />
                                </SelectTrigger>
                                <SelectContent className={SELECT_CONTENT_CLASS}>
                                    <SelectItem value="all">All</SelectItem>
                                    {(options?.notificationTypes ?? []).map((nt) => (
                                        <SelectItem key={nt} value={nt} textValue={toLabel(nt)}>
                                            <span className="block truncate">{toLabel(nt)}</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2 min-w-0">
                            <p className="text-xs font-medium text-muted-foreground">Read filter</p>
                            <Select
                                value={readFilter}
                                onValueChange={(v) => setReadFilter(v as "all" | "unread" | "read")}
                            >
                                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                    <SelectValue placeholder="Filter by read status" />
                                </SelectTrigger>
                                <SelectContent className={SELECT_CONTENT_CLASS}>
                                    {READ_FILTERS.map((rf) => (
                                        <SelectItem key={rf.value} value={rf.value}>
                                            {rf.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Push Notification Device Controls */}
                    <div className="mt-4 rounded-md border bg-muted/20 p-3">
                        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                                <p className="text-xs font-medium text-muted-foreground">Browser Push Device</p>
                                <p className="text-xs text-muted-foreground">
                                    Connect this browser to the selected user, then send a test push.
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void loadPushEnvironment(true)}
                                    disabled={!!actionKey}
                                >
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Refresh Push Config
                                </Button>

                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void enablePushForSelectedUser()}
                                    disabled={!!actionKey || !canManagePush}
                                >
                                    <Bell className="mr-2 h-4 w-4" />
                                    {actionKey === "push:enable" ? "Enabling..." : "Enable Push"}
                                </Button>

                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void disablePushForCurrentBrowser()}
                                    disabled={!!actionKey || !pushSupported}
                                >
                                    {actionKey === "push:disable" ? "Disabling..." : "Disable Push"}
                                </Button>

                                <Button
                                    size="sm"
                                    onClick={() => void sendPushTestToSelectedUser()}
                                    disabled={!!actionKey || viewerUserId === NONE_VALUE}
                                >
                                    <Send className="mr-2 h-4 w-4" />
                                    {actionKey === "push:test" ? "Sending..." : "Send Test Push"}
                                </Button>
                            </div>
                        </div>

                        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-md border bg-background px-3 py-2">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Browser Support
                                </p>
                                <p className="text-sm font-medium">
                                    {pushSupported ? "Supported" : "Not Supported"}
                                </p>
                            </div>

                            <div className="rounded-md border bg-background px-3 py-2">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Permission
                                </p>
                                <p className="text-sm font-medium">
                                    {pushPermissionLabel(pushPermission)}
                                </p>
                            </div>

                            <div className="rounded-md border bg-background px-3 py-2">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Server Push Config
                                </p>
                                <p className="text-sm font-medium">
                                    {pushConfigured ? "Configured" : "Not Configured"}
                                </p>
                            </div>

                            <div className="rounded-md border bg-background px-3 py-2">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    This Browser Device
                                </p>
                                <p className="text-sm font-medium">
                                    {localPushEndpoint ? "Subscribed" : "Not Subscribed"}
                                </p>
                            </div>
                        </div>

                        {!pushConfigured && pushConfigReason ? (
                            <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                                {pushConfigReason}
                            </p>
                        ) : null}

                        {localPushEndpoint ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                                Endpoint:{" "}
                                <span className="font-mono">
                                    {truncateMiddle(localPushEndpoint)}
                                </span>
                            </p>
                        ) : null}

                        {!pushSupported ? (
                            <p className="mt-2 text-xs text-destructive">
                                This browser does not support service worker push.
                            </p>
                        ) : null}

                        {viewerUserId === NONE_VALUE ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                                Select a user in the Notification Viewer to bind this browser subscription.
                            </p>
                        ) : null}

                        {pushActionsBusy ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                                Updating push subscription...
                            </p>
                        ) : null}
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
                                                <div className="flex min-w-0 flex-col">
                                                    <span className="font-medium truncate" title={n.title}>
                                                        {n.title}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground truncate" title={n.body}>
                                                        {n.body}
                                                    </span>
                                                    <span className="mt-1 text-xs text-muted-foreground">
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
