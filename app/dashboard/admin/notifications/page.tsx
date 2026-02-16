"use client"

import * as React from "react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { NotificationAutomationPanel } from "@/components/notification/notification-automation-panel"
import { NotificationViewerPanel } from "@/components/notification/notification-viewer-panel"
import {
    NONE_VALUE,
    PUSH_SW_PATH,
    type AutoNotificationIncludeField,
    type AutoNotificationTemplate,
    type AutomationOptionsResponse,
    type NotificationAutomationOptions,
    type NotificationRecord,
    type NotificationType,
    type NotificationsResponse,
    type PushPublicKeyInfo,
    type PushPublicKeyResponse,
    type PushSendResponse,
    type ReadFilter,
    type TargetMode,
} from "@/components/notification/types"
import {
    isPushSupportedInBrowser,
    readErrorMessage,
    toFriendlyNotification,
    urlBase64ToUint8Array,
} from "@/components/notification/utils"
import { TooltipProvider } from "@/components/ui/tooltip"

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
    const [readFilter, setReadFilter] = React.useState<ReadFilter>("all")

    // Notification details dialog
    const [notificationDialogOpen, setNotificationDialogOpen] = React.useState(false)
    const [selectedNotification, setSelectedNotification] = React.useState<NotificationRecord | null>(null)

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

    const selectedNotificationFriendly = React.useMemo(
        () => (selectedNotification ? toFriendlyNotification(selectedNotification) : null),
        [selectedNotification],
    )
    const selectedNotificationId = selectedNotification?.id ?? null

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

    React.useEffect(() => {
        if (!selectedNotificationId) return

        const latest = notifications.find((n) => n.id === selectedNotificationId)
        if (!latest) {
            setSelectedNotification(null)
            setNotificationDialogOpen(false)
            return
        }

        setSelectedNotification(latest)
    }, [notifications, selectedNotificationId])

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

    const openNotificationDetails = React.useCallback((notification: NotificationRecord) => {
        setSelectedNotification(notification)
        setNotificationDialogOpen(true)
    }, [])

    const markSelectedNotificationAsRead = React.useCallback(async () => {
        if (!selectedNotification || selectedNotification.read_at) return
        await markAsRead(selectedNotification.id)
    }, [markAsRead, selectedNotification])

    const deleteSelectedNotification = React.useCallback(async () => {
        if (!selectedNotification) return
        const id = selectedNotification.id
        await deleteNotification(id)
        setNotificationDialogOpen(false)
        setSelectedNotification(null)
    }, [deleteNotification, selectedNotification])

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
            <TooltipProvider delayDuration={150}>
                <div className="space-y-4">
                    <NotificationAutomationPanel
                        optionsLoading={optionsLoading}
                        options={options}
                        actionKey={actionKey}
                        template={template}
                        setTemplate={setTemplate}
                        selectedTemplateDef={selectedTemplateDef}
                        notificationType={notificationType}
                        setNotificationType={setNotificationType}
                        targetMode={targetMode}
                        setTargetMode={setTargetMode}
                        loadAutomationOptions={loadAutomationOptions}
                        targetUserIds={targetUserIds}
                        toggleTargetUser={toggleTargetUser}
                        targetRole={targetRole}
                        setTargetRole={setTargetRole}
                        targetGroupId={targetGroupId}
                        setTargetGroupId={setTargetGroupId}
                        targetScheduleId={targetScheduleId}
                        setTargetScheduleId={setTargetScheduleId}
                        includeAdviser={includeAdviser}
                        setIncludeAdviser={setIncludeAdviser}
                        includeStudents={includeStudents}
                        setIncludeStudents={setIncludeStudents}
                        includePanelists={includePanelists}
                        setIncludePanelists={setIncludePanelists}
                        includeCreator={includeCreator}
                        setIncludeCreator={setIncludeCreator}
                        contextEvaluationId={contextEvaluationId}
                        setContextEvaluationId={setContextEvaluationId}
                        contextScheduleId={contextScheduleId}
                        setContextScheduleId={setContextScheduleId}
                        contextGroupId={contextGroupId}
                        setContextGroupId={setContextGroupId}
                        includeFields={includeFields}
                        includeChoices={includeChoices}
                        includeButtonText={includeButtonText}
                        toggleIncludeField={toggleIncludeField}
                        needsEvaluationSelector={needsEvaluationSelector}
                        needsScheduleSelector={needsScheduleSelector}
                        needsGroupSelector={needsGroupSelector}
                        contextSelectorCount={contextSelectorCount}
                        hasEvaluationOptions={hasEvaluationOptions}
                        hasScheduleOptions={hasScheduleOptions}
                        hasGroupOptions={hasGroupOptions}
                        requiredContextIssue={requiredContextIssue}
                        sendDisabled={sendDisabled}
                        sendAutomaticNotification={sendAutomaticNotification}
                        targetUsersButtonText={targetUsersButtonText}
                    />

                    <NotificationViewerPanel
                        options={options}
                        viewerUserId={viewerUserId}
                        setViewerUserId={setViewerUserId}
                        typeFilter={typeFilter}
                        setTypeFilter={setTypeFilter}
                        readFilter={readFilter}
                        setReadFilter={setReadFilter}
                        listLoading={listLoading}
                        actionKey={actionKey}
                        loadNotifications={loadNotifications}
                        markAllAsRead={markAllAsRead}
                        notifications={notifications}
                        unreadCount={unreadCount}
                        markAsRead={markAsRead}
                        deleteNotification={deleteNotification}
                        openNotificationDetails={openNotificationDetails}
                        notificationDialogOpen={notificationDialogOpen}
                        setNotificationDialogOpen={setNotificationDialogOpen}
                        selectedNotification={selectedNotification}
                        selectedNotificationFriendly={selectedNotificationFriendly}
                        markSelectedNotificationAsRead={markSelectedNotificationAsRead}
                        deleteSelectedNotification={deleteSelectedNotification}
                        pushSupported={pushSupported}
                        pushPermission={pushPermission}
                        pushConfigured={pushConfigured}
                        pushConfigReason={pushConfigReason}
                        localPushEndpoint={localPushEndpoint}
                        pushActionsBusy={pushActionsBusy}
                        canManagePush={canManagePush}
                        loadPushEnvironment={loadPushEnvironment}
                        enablePushForSelectedUser={enablePushForSelectedUser}
                        disablePushForCurrentBrowser={disablePushForCurrentBrowser}
                        sendPushTestToSelectedUser={sendPushTestToSelectedUser}
                    />
                </div>
            </TooltipProvider>
        </DashboardLayout>
    )
}
