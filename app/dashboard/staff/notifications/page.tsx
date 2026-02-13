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

type NotificationItem = {
    id: string
    user_id: string | null
    type: string
    title: string
    body: string
    data: Record<string, unknown>
    read_at: string | null
    created_at: string | null
}

type StatusFilter = "all" | "unread" | "read"

const AUTH_ME_ENDPOINTS = [
    "/api/auth/me",
    "/api/auth/session",
    "/api/auth/profile",
]

function notificationEndpoints(userId: string): string[] {
    const encoded = encodeURIComponent(userId)
    return [
        `/api/notifications/user/${encoded}?limit=200&orderBy=created_at&orderDirection=desc`,
        `/api/notifications/user/${encoded}?limit=200`,
        `/api/notifications/user/${encoded}`,
    ]
}

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

function formatType(value: string): string {
    return value
        .split("_")
        .filter(Boolean)
        .map((part) => toTitleCase(part))
        .join(" ")
}

function statusTone(isRead: boolean): string {
    if (isRead) {
        return "border-muted-foreground/30 bg-muted text-muted-foreground"
    }

    return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
}

function typeTone(type: string): string {
    const normalized = type.trim().toLowerCase()

    if (normalized === "evaluation_submitted") {
        return "border-blue-600/40 bg-blue-600/10 text-foreground"
    }

    if (normalized === "evaluation_locked") {
        return "border-amber-600/40 bg-amber-600/10 text-foreground"
    }

    if (normalized === "general") {
        return "border-muted-foreground/30 bg-muted text-muted-foreground"
    }

    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload.notifications)) return payload.notifications

    if (isRecord(payload.data)) {
        if (Array.isArray(payload.data.items)) return payload.data.items
        if (Array.isArray(payload.data.notifications)) return payload.data.notifications
    }

    if (isRecord(payload.result)) {
        if (Array.isArray(payload.result.items)) return payload.result.items
        if (Array.isArray(payload.result.notifications)) return payload.result.notifications
    }

    return []
}

function normalizeNotification(raw: unknown): NotificationItem | null {
    if (!isRecord(raw)) return null

    const source = isRecord(raw.notification) ? raw.notification : raw

    const id = toStringSafe(source.id ?? raw.id)
    if (!id) return null

    const type = toStringSafe(source.type ?? raw.type) ?? "general"
    const title = toStringSafe(source.title ?? raw.title) ?? "Untitled notification"
    const body = toStringSafe(source.body ?? raw.body) ?? ""
    const user_id = toNullableString(source.user_id ?? source.userId ?? raw.user_id)
    const read_at = toNullableString(source.read_at ?? source.readAt ?? raw.read_at)
    const created_at = toNullableString(
        source.created_at ?? source.createdAt ?? raw.created_at ?? raw.timestamp,
    )

    const data = isRecord(source.data) ? source.data : {}

    return {
        id,
        user_id,
        type,
        title,
        body,
        data,
        read_at,
        created_at,
    }
}

function normalizeUserCandidate(raw: unknown): { id: string; name: string | null } | null {
    if (!isRecord(raw)) return null

    const nestedUser = isRecord(raw.user) ? raw.user : null
    const id =
        toStringSafe(raw.id ?? raw.user_id ?? raw.userId) ??
        toStringSafe(nestedUser?.id ?? nestedUser?.user_id ?? nestedUser?.userId)

    if (!id) return null

    const name =
        toNullableString(raw.name ?? raw.full_name ?? raw.fullName) ??
        toNullableString(nestedUser?.name ?? nestedUser?.full_name ?? nestedUser?.fullName)

    return { id, name }
}

function extractCurrentUser(payload: unknown): { id: string; name: string | null } | null {
    if (!isRecord(payload)) return null

    const candidates: unknown[] = [
        payload.user,
        payload.item,
        payload.data,
        isRecord(payload.data) ? payload.data.user : null,
        payload.session,
        payload.profile,
        payload.result,
        isRecord(payload.result) ? payload.result.user : null,
        payload,
    ]

    for (const candidate of candidates) {
        const parsed = normalizeUserCandidate(candidate)
        if (parsed) return parsed
    }

    return null
}

async function readErrorMessage(res: Response, payload: unknown): Promise<string> {
    if (isRecord(payload)) {
        const error = toStringSafe(payload.error)
        if (error) return error

        const message = toStringSafe(payload.message)
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

export default function StaffNotificationsPage() {
    const [userId, setUserId] = React.useState<string | null>(null)
    const [userName, setUserName] = React.useState<string | null>(null)
    const [notifications, setNotifications] = React.useState<NotificationItem[]>([])

    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [sourceEndpoint, setSourceEndpoint] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")
    const [typeFilter, setTypeFilter] = React.useState("all")

    const [markingId, setMarkingId] = React.useState<string | null>(null)
    const [markingAll, setMarkingAll] = React.useState(false)

    const loadNotifications = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        let currentUser: { id: string; name: string | null } | null = null

        for (const endpoint of AUTH_ME_ENDPOINTS) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown
                if (!res.ok) continue

                currentUser = extractCurrentUser(payload)
                if (currentUser) break
            } catch {
                // try next auth endpoint
            }
        }

        if (!currentUser) {
            setLoading(false)
            setNotifications([])
            setSourceEndpoint(null)
            setUserId(null)
            setUserName(null)
            setError("Unable to resolve current user session. Please sign in again.")
            return
        }

        setUserId(currentUser.id)
        setUserName(currentUser.name)

        let loaded = false
        let latestError = "Unable to load notifications."

        for (const endpoint of notificationEndpoints(currentUser.id)) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const parsed = extractArrayPayload(payload)
                    .map(normalizeNotification)
                    .filter((item): item is NotificationItem => item !== null)
                    .sort((a, b) => {
                        const ta = a.created_at ? new Date(a.created_at).getTime() : 0
                        const tb = b.created_at ? new Date(b.created_at).getTime() : 0
                        return tb - ta
                    })

                setNotifications(parsed)
                setSourceEndpoint(endpoint)
                loaded = true
                break
            } catch (err) {
                latestError =
                    err instanceof Error ? err.message : "Unable to load notifications."
            }
        }

        if (!loaded) {
            setNotifications([])
            setSourceEndpoint(null)
            setError(
                `${latestError} No notifications endpoint responded successfully.`,
            )
        }

        setLoading(false)
    }, [])

    React.useEffect(() => {
        void loadNotifications()
    }, [loadNotifications])

    const availableTypes = React.useMemo(() => {
        const set = new Set<string>()
        for (const item of notifications) {
            const normalized = item.type.trim().toLowerCase()
            if (normalized.length > 0) {
                set.add(normalized)
            }
        }
        return ["all", ...Array.from(set.values())]
    }, [notifications])

    React.useEffect(() => {
        if (!availableTypes.includes(typeFilter)) {
            setTypeFilter("all")
        }
    }, [availableTypes, typeFilter])

    const filteredNotifications = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return notifications.filter((item) => {
            const isRead = !!item.read_at

            if (statusFilter === "read" && !isRead) return false
            if (statusFilter === "unread" && isRead) return false

            if (typeFilter !== "all" && item.type.toLowerCase() !== typeFilter) {
                return false
            }

            if (!q) return true

            return (
                item.id.toLowerCase().includes(q) ||
                item.title.toLowerCase().includes(q) ||
                item.body.toLowerCase().includes(q) ||
                item.type.toLowerCase().includes(q)
            )
        })
    }, [notifications, search, statusFilter, typeFilter])

    const totals = React.useMemo(() => {
        let unread = 0
        let read = 0

        for (const item of notifications) {
            if (item.read_at) read += 1
            else unread += 1
        }

        return {
            all: notifications.length,
            unread,
            read,
        }
    }, [notifications])

    const markAsRead = React.useCallback(
        async (id: string) => {
            const target = notifications.find((item) => item.id === id)
            if (!target || target.read_at) return

            setMarkingId(id)
            setError(null)

            try {
                const res = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                })

                const payload = (await res.json().catch(() => null)) as unknown
                if (!res.ok) {
                    throw new Error(await readErrorMessage(res, payload))
                }

                setNotifications((prev) =>
                    prev.map((item) =>
                        item.id === id
                            ? { ...item, read_at: new Date().toISOString() }
                            : item,
                    ),
                )
            } catch (err) {
                setError(err instanceof Error ? err.message : "Unable to mark as read.")
            } finally {
                setMarkingId(null)
            }
        },
        [notifications],
    )

    const markAllAsRead = React.useCallback(async () => {
        if (!userId) return

        setMarkingAll(true)
        setError(null)

        try {
            const endpoint = `/api/notifications/user/${encodeURIComponent(userId)}/read-all`
            const res = await fetch(endpoint, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            })

            const payload = (await res.json().catch(() => null)) as unknown
            if (!res.ok) {
                throw new Error(await readErrorMessage(res, payload))
            }

            const nowIso = new Date().toISOString()
            setNotifications((prev) =>
                prev.map((item) =>
                    item.read_at ? item : { ...item, read_at: nowIso },
                ),
            )
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to mark all as read.")
        } finally {
            setMarkingAll(false)
        }
    }, [userId])

    return (
        <DashboardLayout
            title="Notifications"
            description="Review and manage system notifications for your staff account."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by title, message, type, or ID"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => void loadNotifications()}
                                    disabled={loading}
                                >
                                    Refresh
                                </Button>
                                <Button
                                    onClick={() => void markAllAsRead()}
                                    disabled={loading || markingAll || totals.unread === 0 || !userId}
                                >
                                    {markingAll ? "Marking..." : "Mark all as read"}
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by status</p>
                            <div className="flex flex-wrap gap-2">
                                {(["all", "unread", "read"] as const).map((status) => {
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

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by type</p>
                            <div className="flex flex-wrap gap-2">
                                {availableTypes.map((type) => {
                                    const active = typeFilter === type
                                    const label = type === "all" ? "All" : formatType(type)
                                    return (
                                        <Button
                                            key={type}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setTypeFilter(type)}
                                        >
                                            {label}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-3">
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">All</p>
                                <p className="text-lg font-semibold">{totals.all}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Unread</p>
                                <p className="text-lg font-semibold">{totals.unread}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Read</p>
                                <p className="text-lg font-semibold">{totals.read}</p>
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Showing{" "}
                            <span className="font-semibold text-foreground">
                                {filteredNotifications.length}
                            </span>{" "}
                            of{" "}
                            <span className="font-semibold text-foreground">
                                {notifications.length}
                            </span>{" "}
                            notification(s).
                        </p>

                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                            {userId ? (
                                <p>
                                    Signed in as{" "}
                                    <span className="font-medium text-foreground">
                                        {userName ?? "Staff User"}
                                    </span>{" "}
                                    ({userId})
                                </p>
                            ) : null}
                            {sourceEndpoint ? <p>Data source: {sourceEndpoint}</p> : null}
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
                                <TableHead className="min-w-64">Notification</TableHead>
                                <TableHead className="min-w-40">Type</TableHead>
                                <TableHead className="min-w-40">Status</TableHead>
                                <TableHead className="min-w-48">Created</TableHead>
                                <TableHead className="min-w-40 text-right">Actions</TableHead>
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
                            ) : filteredNotifications.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                        No notifications found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredNotifications.map((item) => {
                                    const isRead = !!item.read_at
                                    const isMarking = markingId === item.id

                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-medium">{item.title}</span>
                                                    <span className="text-sm text-muted-foreground">
                                                        {item.body || "—"}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        ID: {item.id}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                <span
                                                    className={[
                                                        "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                        typeTone(item.type),
                                                    ].join(" ")}
                                                >
                                                    {formatType(item.type)}
                                                </span>
                                            </TableCell>

                                            <TableCell>
                                                <span
                                                    className={[
                                                        "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                        statusTone(isRead),
                                                    ].join(" ")}
                                                >
                                                    {isRead ? "Read" : "Unread"}
                                                </span>
                                            </TableCell>

                                            <TableCell className="text-muted-foreground">
                                                {formatDateTime(item.created_at)}
                                            </TableCell>

                                            <TableCell className="text-right">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={isRead || isMarking}
                                                    onClick={() => void markAsRead(item.id)}
                                                >
                                                    {isMarking ? "Saving..." : isRead ? "Read" : "Mark as read"}
                                                </Button>
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
