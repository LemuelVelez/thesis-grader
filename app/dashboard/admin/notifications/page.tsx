"use client"

import * as React from "react"

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

type NotificationType = "general" | "evaluation_submitted" | "evaluation_locked"

type NotificationRecord = {
    id: string
    user_id: string
    type: NotificationType
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
    error?: string
    message?: string
}

const TYPE_FILTERS: Array<"all" | NotificationType> = [
    "all",
    "general",
    "evaluation_submitted",
    "evaluation_locked",
]

const READ_FILTERS: Array<"all" | "unread" | "read"> = ["all", "unread", "read"]

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

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function parseJsonObject(input: string): Record<string, unknown> {
    const trimmed = input.trim()
    if (!trimmed) return {}

    let parsed: unknown
    try {
        parsed = JSON.parse(trimmed)
    } catch {
        throw new Error("Data JSON must be a valid JSON object.")
    }

    if (!isRecord(parsed)) {
        throw new Error("Data JSON must be an object (example: {\"key\":\"value\"}).")
    }

    return parsed
}

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { error?: string; message?: string }
        return data.error || data.message || `Request failed (${res.status})`
    } catch {
        return `Request failed (${res.status})`
    }
}

export default function AdminNotificationsPage() {
    const [userId, setUserId] = React.useState("")
    const [notifications, setNotifications] = React.useState<NotificationRecord[]>([])

    const [typeFilter, setTypeFilter] = React.useState<"all" | NotificationType>("all")
    const [readFilter, setReadFilter] = React.useState<"all" | "unread" | "read">("all")

    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [success, setSuccess] = React.useState<string | null>(null)
    const [actionKey, setActionKey] = React.useState<string | null>(null)

    // Single notification form
    const [singleTitle, setSingleTitle] = React.useState("")
    const [singleBody, setSingleBody] = React.useState("")
    const [singleType, setSingleType] = React.useState<NotificationType>("general")
    const [singleDataJson, setSingleDataJson] = React.useState("{}")

    // Broadcast form
    const [broadcastUserIds, setBroadcastUserIds] = React.useState("")
    const [broadcastTitle, setBroadcastTitle] = React.useState("")
    const [broadcastBody, setBroadcastBody] = React.useState("")
    const [broadcastType, setBroadcastType] = React.useState<NotificationType>("general")
    const [broadcastDataJson, setBroadcastDataJson] = React.useState("{}")

    const unreadCount = React.useMemo(
        () => notifications.filter((n) => !n.read_at).length,
        [notifications],
    )

    const loadNotifications = React.useCallback(async () => {
        const uid = userId.trim()
        setError(null)
        setSuccess(null)

        if (!uid) {
            setNotifications([])
            setError("Enter a User ID to load notifications.")
            return
        }

        setLoading(true)
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

                // When unread route is used, type filtering can still be applied client-side.
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
        } catch (err) {
            setNotifications([])
            setError(err instanceof Error ? err.message : "Failed to load notifications.")
        } finally {
            setLoading(false)
        }
    }, [readFilter, typeFilter, userId])

    const markAsRead = React.useCallback(async (id: string) => {
        setError(null)
        setSuccess(null)
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

            setSuccess("Notification marked as read.")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to mark notification as read.")
        } finally {
            setActionKey(null)
        }
    }, [])

    const deleteNotification = React.useCallback(async (id: string) => {
        setError(null)
        setSuccess(null)
        setActionKey(`delete:${id}`)

        try {
            const res = await fetch(`/api/notifications/${id}`, {
                method: "DELETE",
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            setNotifications((prev) => prev.filter((n) => n.id !== id))
            setSuccess("Notification deleted.")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete notification.")
        } finally {
            setActionKey(null)
        }
    }, [])

    const markAllAsRead = React.useCallback(async () => {
        const uid = userId.trim()
        setError(null)
        setSuccess(null)

        if (!uid) {
            setError("Enter a User ID first.")
            return
        }

        setActionKey("read-all")
        try {
            const res = await fetch(`/api/notifications/user/${encodeURIComponent(uid)}/read-all`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = (await res.json()) as NotificationsResponse
            const updated = typeof data.updated === "number" ? data.updated : 0
            setSuccess(`Marked ${updated} notification(s) as read.`)
            await loadNotifications()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to mark all as read.")
        } finally {
            setActionKey(null)
        }
    }, [loadNotifications, userId])

    const createSingleNotification = React.useCallback(async () => {
        const uid = userId.trim()
        setError(null)
        setSuccess(null)

        if (!uid) {
            setError("User ID is required for creating a notification.")
            return
        }

        if (!singleTitle.trim() || !singleBody.trim()) {
            setError("Title and body are required.")
            return
        }

        let dataPayload: Record<string, unknown>
        try {
            dataPayload = parseJsonObject(singleDataJson)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid JSON data.")
            return
        }

        setActionKey("create-single")
        try {
            const res = await fetch("/api/notifications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: uid,
                    type: singleType,
                    title: singleTitle.trim(),
                    body: singleBody.trim(),
                    data: dataPayload,
                }),
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            setSuccess("Notification created.")
            setSingleTitle("")
            setSingleBody("")
            await loadNotifications()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create notification.")
        } finally {
            setActionKey(null)
        }
    }, [loadNotifications, singleBody, singleDataJson, singleTitle, singleType, userId])

    const broadcastNotifications = React.useCallback(async () => {
        setError(null)
        setSuccess(null)

        if (!broadcastTitle.trim() || !broadcastBody.trim()) {
            setError("Broadcast title and body are required.")
            return
        }

        const userIds = broadcastUserIds
            .split(/[\n,]+/g)
            .map((v) => v.trim())
            .filter(Boolean)

        if (userIds.length === 0) {
            setError("Provide at least one user ID for broadcast.")
            return
        }

        let dataPayload: Record<string, unknown>
        try {
            dataPayload = parseJsonObject(broadcastDataJson)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid JSON data.")
            return
        }

        setActionKey("broadcast")
        try {
            const res = await fetch("/api/notifications/broadcast", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userIds,
                    payload: {
                        type: broadcastType,
                        title: broadcastTitle.trim(),
                        body: broadcastBody.trim(),
                        data: dataPayload,
                    },
                }),
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = (await res.json()) as NotificationsResponse
            const createdCount = typeof data.count === "number" ? data.count : userIds.length
            setSuccess(`Broadcast sent to ${createdCount} user(s).`)

            setBroadcastUserIds("")
            setBroadcastTitle("")
            setBroadcastBody("")

            if (userId.trim() && userIds.includes(userId.trim())) {
                await loadNotifications()
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to broadcast notifications.")
        } finally {
            setActionKey(null)
        }
    }, [
        broadcastBody,
        broadcastDataJson,
        broadcastTitle,
        broadcastType,
        broadcastUserIds,
        loadNotifications,
        userId,
    ])

    return (
        <DashboardLayout
            title="Notifications"
            description="Create, broadcast, review, and manage user notifications."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Enter User ID"
                                value={userId}
                                onChange={(e) => setUserId(e.target.value)}
                                className="w-full md:max-w-xl"
                            />
                            <div className="flex items-center gap-2">
                                <Button onClick={() => void loadNotifications()} disabled={loading || !!actionKey}>
                                    {loading ? "Loading..." : "Load"}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => void markAllAsRead()}
                                    disabled={!userId.trim() || loading || !!actionKey}
                                >
                                    {actionKey === "read-all" ? "Updating..." : "Mark All Read"}
                                </Button>
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Total: <span className="font-semibold text-foreground">{notifications.length}</span>{" "}
                            • Unread: <span className="font-semibold text-foreground">{unreadCount}</span>
                        </p>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by type</p>
                            <div className="flex flex-wrap gap-2">
                                {TYPE_FILTERS.map((type) => {
                                    const active = typeFilter === type
                                    return (
                                        <Button
                                            key={type}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setTypeFilter(type)}
                                        >
                                            {toLabel(type)}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by read status</p>
                            <div className="flex flex-wrap gap-2">
                                {READ_FILTERS.map((rf) => {
                                    const active = readFilter === rf
                                    return (
                                        <Button
                                            key={rf}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setReadFilter(rf)}
                                        >
                                            {toLabel(rf)}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                {success ? (
                    <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">
                        {success}
                    </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border bg-card p-4">
                        <div className="space-y-3">
                            <h2 className="text-sm font-semibold">Create Single Notification</h2>

                            <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Type</p>
                                <div className="flex flex-wrap gap-2">
                                    {TYPE_FILTERS.filter((v): v is NotificationType => v !== "all").map((type) => {
                                        const active = singleType === type
                                        return (
                                            <Button
                                                key={type}
                                                size="sm"
                                                variant={active ? "default" : "outline"}
                                                onClick={() => setSingleType(type)}
                                            >
                                                {toLabel(type)}
                                            </Button>
                                        )
                                    })}
                                </div>
                            </div>

                            <Input
                                placeholder="Title"
                                value={singleTitle}
                                onChange={(e) => setSingleTitle(e.target.value)}
                            />

                            <Input
                                placeholder="Body"
                                value={singleBody}
                                onChange={(e) => setSingleBody(e.target.value)}
                            />

                            <Input
                                placeholder='Data JSON (example: {"scheduleId":"abc123"})'
                                value={singleDataJson}
                                onChange={(e) => setSingleDataJson(e.target.value)}
                            />

                            <Button
                                onClick={() => void createSingleNotification()}
                                disabled={loading || !!actionKey}
                            >
                                {actionKey === "create-single" ? "Creating..." : "Create Notification"}
                            </Button>
                        </div>
                    </div>

                    <div className="rounded-lg border bg-card p-4">
                        <div className="space-y-3">
                            <h2 className="text-sm font-semibold">Broadcast Notifications</h2>

                            <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Type</p>
                                <div className="flex flex-wrap gap-2">
                                    {TYPE_FILTERS.filter((v): v is NotificationType => v !== "all").map((type) => {
                                        const active = broadcastType === type
                                        return (
                                            <Button
                                                key={type}
                                                size="sm"
                                                variant={active ? "default" : "outline"}
                                                onClick={() => setBroadcastType(type)}
                                            >
                                                {toLabel(type)}
                                            </Button>
                                        )
                                    })}
                                </div>
                            </div>

                            <Input
                                placeholder="User IDs (comma-separated)"
                                value={broadcastUserIds}
                                onChange={(e) => setBroadcastUserIds(e.target.value)}
                            />

                            <Input
                                placeholder="Broadcast title"
                                value={broadcastTitle}
                                onChange={(e) => setBroadcastTitle(e.target.value)}
                            />

                            <Input
                                placeholder="Broadcast body"
                                value={broadcastBody}
                                onChange={(e) => setBroadcastBody(e.target.value)}
                            />

                            <Input
                                placeholder='Data JSON (example: {"from":"admin"})'
                                value={broadcastDataJson}
                                onChange={(e) => setBroadcastDataJson(e.target.value)}
                            />

                            <Button
                                onClick={() => void broadcastNotifications()}
                                disabled={loading || !!actionKey}
                            >
                                {actionKey === "broadcast" ? "Sending..." : "Send Broadcast"}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto rounded-lg border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-72">Notification</TableHead>
                                <TableHead className="min-w-48">Type</TableHead>
                                <TableHead className="min-w-32">Status</TableHead>
                                <TableHead className="min-w-44">Created</TableHead>
                                <TableHead className="min-w-44 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
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
                                        {userId.trim()
                                            ? "No notifications found for this user and filter set."
                                            : "Enter a user ID, then click Load."}
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
