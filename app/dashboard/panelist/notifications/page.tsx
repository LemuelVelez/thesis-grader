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

type NotificationType =
    | "general"
    | "evaluation_submitted"
    | "evaluation_locked"
    | (string & {})

type NotificationItem = {
    id: string
    user_id: string
    type: NotificationType
    title: string
    body: string
    data: Record<string, unknown>
    read_at: string | null
    created_at: string
}

type ReadFilter = "all" | "unread" | "read"

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function toStringSafe(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function toNullableString(value: unknown): string | null {
    if (value === null || value === undefined) return null
    return toStringSafe(value)
}

function toTitleCase(value: string): string {
    if (!value) return value
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function humanizeType(type: string): string {
    return type
        .replace(/[_-]+/g, " ")
        .trim()
        .split(" ")
        .map((x) => toTitleCase(x))
        .join(" ")
}

function formatDateTime(value: string): string {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function toEpoch(value: string): number {
    const d = new Date(value)
    const ms = d.getTime()
    return Number.isNaN(ms) ? 0 : ms
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload

    if (!isRecord(payload)) return []

    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data

    if (isRecord(payload.data) && Array.isArray(payload.data.items)) {
        return payload.data.items
    }

    if (isRecord(payload.result) && Array.isArray(payload.result.items)) {
        return payload.result.items
    }

    return []
}

function extractObjectPayload(payload: unknown): Record<string, unknown> | null {
    if (!isRecord(payload)) return null

    if (isRecord(payload.item)) return payload.item
    if (isRecord(payload.data)) return payload.data
    if (isRecord(payload.result)) return payload.result

    return payload
}

function extractUserId(payload: unknown): string | null {
    if (!isRecord(payload)) return null

    const direct =
        toStringSafe(payload.id) ??
        toStringSafe(payload.user_id) ??
        toStringSafe(payload.userId)

    if (direct) return direct

    if (isRecord(payload.user)) {
        const fromUser =
            toStringSafe(payload.user.id) ??
            toStringSafe(payload.user.user_id) ??
            toStringSafe(payload.user.userId)

        if (fromUser) return fromUser
    }

    if (isRecord(payload.item)) {
        const fromItem =
            toStringSafe(payload.item.id) ??
            toStringSafe(payload.item.user_id) ??
            toStringSafe(payload.item.userId)

        if (fromItem) return fromItem
    }

    if (isRecord(payload.data)) {
        const fromData =
            toStringSafe(payload.data.id) ??
            toStringSafe(payload.data.user_id) ??
            toStringSafe(payload.data.userId)

        if (fromData) return fromData

        if (isRecord(payload.data.user)) {
            const fromNestedUser =
                toStringSafe(payload.data.user.id) ??
                toStringSafe(payload.data.user.user_id) ??
                toStringSafe(payload.data.user.userId)

            if (fromNestedUser) return fromNestedUser
        }
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

function normalizeNotification(raw: unknown): NotificationItem | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    if (!id) return null

    const userId = toStringSafe(raw.user_id ?? raw.userId) ?? "unknown"
    const type = (toStringSafe(raw.type) ?? "general") as NotificationType
    const title = toStringSafe(raw.title) ?? "Untitled Notification"
    const body = toStringSafe(raw.body) ?? ""
    const readAt = toNullableString(raw.read_at ?? raw.readAt)
    const createdAt =
        toStringSafe(raw.created_at ?? raw.createdAt) ??
        new Date(0).toISOString()

    return {
        id,
        user_id: userId,
        type,
        title,
        body,
        data: isRecord(raw.data) ? raw.data : {},
        read_at: readAt,
        created_at: createdAt,
    }
}

function typeTone(type: string): string {
    const normalized = type.toLowerCase()

    if (normalized === "evaluation_submitted") {
        return "border-amber-500/40 bg-amber-500/10 text-foreground"
    }

    if (normalized === "evaluation_locked") {
        return "border-destructive/40 bg-destructive/10 text-destructive"
    }

    if (normalized === "general") {
        return "border-primary/40 bg-primary/10 text-foreground"
    }

    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

const AUTH_ME_ENDPOINTS = ["/api/auth/me", "/api/auth/profile", "/api/auth/session"] as const

export default function PanelistNotificationsPage() {
    const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
    const [notifications, setNotifications] = React.useState<NotificationItem[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [sourceEndpoint, setSourceEndpoint] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [typeFilter, setTypeFilter] = React.useState<string>("all")
    const [readFilter, setReadFilter] = React.useState<ReadFilter>("all")

    const [markingIds, setMarkingIds] = React.useState<string[]>([])
    const [markingAll, setMarkingAll] = React.useState(false)

    const resolveCurrentUserId = React.useCallback(async (): Promise<string | null> => {
        if (currentUserId) return currentUserId

        for (const endpoint of AUTH_ME_ENDPOINTS) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) continue

                const uid = extractUserId(payload)
                if (uid) {
                    setCurrentUserId(uid)
                    return uid
                }
            } catch {
                // ignore and continue to next endpoint
            }
        }

        return null
    }, [currentUserId])

    const loadNotifications = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        const userId = await resolveCurrentUserId()

        if (!userId) {
            setNotifications([])
            setSourceEndpoint(null)
            setError("Unable to resolve current user. Please sign in again.")
            setLoading(false)
            return
        }

        const endpointCandidates = [
            `/api/panelist/notifications`,
            `/api/notifications/user/${userId}?orderBy=created_at&orderDirection=desc`,
            `/api/notifications/user/${userId}`,
        ]

        let loaded = false
        let latestError = "Unable to load notifications."

        for (const endpoint of endpointCandidates) {
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
                    .sort((a, b) => toEpoch(b.created_at) - toEpoch(a.created_at))

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
                `${latestError} No notifications endpoint responded successfully. ` +
                `Please ensure notifications APIs are available.`,
            )
        }

        setLoading(false)
    }, [resolveCurrentUserId])

    React.useEffect(() => {
        void loadNotifications()
    }, [loadNotifications])

    const markAsRead = React.useCallback(async (id: string) => {
        setMarkingIds((prev) => (prev.includes(id) ? prev : [...prev, id]))

        let latestError = "Unable to mark notification as read."
        const isoNow = new Date().toISOString()

        for (const method of ["PATCH", "POST"] as const) {
            try {
                const res = await fetch(`/api/notifications/${id}/read`, {
                    method,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ readAt: isoNow }),
                })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const itemPayload = extractObjectPayload(payload)
                const readAt =
                    toNullableString(itemPayload?.read_at ?? itemPayload?.readAt) ?? isoNow

                setNotifications((prev) =>
                    prev.map((n) => (n.id === id ? { ...n, read_at: readAt } : n)),
                )
                setError(null)
                setMarkingIds((prev) => prev.filter((x) => x !== id))
                return
            } catch (err) {
                latestError =
                    err instanceof Error
                        ? err.message
                        : "Unable to mark notification as read."
            }
        }

        setError(latestError)
        setMarkingIds((prev) => prev.filter((x) => x !== id))
    }, [])

    const markAllAsRead = React.useCallback(async () => {
        const userId = await resolveCurrentUserId()
        if (!userId) {
            setError("Unable to resolve current user.")
            return
        }

        setMarkingAll(true)

        let latestError = "Unable to mark all notifications as read."
        const isoNow = new Date().toISOString()

        for (const method of ["PATCH", "POST"] as const) {
            try {
                const res = await fetch(`/api/notifications/user/${userId}/read-all`, {
                    method,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ readAt: isoNow }),
                })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                setNotifications((prev) =>
                    prev.map((n) => (n.read_at ? n : { ...n, read_at: isoNow })),
                )
                setError(null)
                setMarkingAll(false)
                return
            } catch (err) {
                latestError =
                    err instanceof Error
                        ? err.message
                        : "Unable to mark all notifications as read."
            }
        }

        setError(latestError)
        setMarkingAll(false)
    }, [resolveCurrentUserId])

    const discoveredTypes = React.useMemo(() => {
        const values = Array.from(
            new Set(notifications.map((n) => n.type.toLowerCase()).filter(Boolean)),
        )
        values.sort((a, b) => a.localeCompare(b))
        return values
    }, [notifications])

    const totals = React.useMemo(() => {
        let read = 0
        let unread = 0

        for (const item of notifications) {
            if (item.read_at) read += 1
            else unread += 1
        }

        return {
            all: notifications.length,
            read,
            unread,
        }
    }, [notifications])

    const filteredNotifications = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return notifications
            .filter((item) => {
                if (typeFilter !== "all" && item.type.toLowerCase() !== typeFilter) {
                    return false
                }

                if (readFilter === "read" && !item.read_at) {
                    return false
                }

                if (readFilter === "unread" && item.read_at) {
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
            .sort((a, b) => toEpoch(b.created_at) - toEpoch(a.created_at))
    }, [notifications, search, typeFilter, readFilter])

    return (
        <DashboardLayout
            title="Notifications"
            description="View, filter, and manage your panelist notifications."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by title, body, type, or notification ID"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />

                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={() => void loadNotifications()} disabled={loading}>
                                    Refresh
                                </Button>

                                <Button
                                    onClick={() => void markAllAsRead()}
                                    disabled={markingAll || totals.unread === 0}
                                >
                                    Mark all as read
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by type</p>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    size="sm"
                                    variant={typeFilter === "all" ? "default" : "outline"}
                                    onClick={() => setTypeFilter("all")}
                                >
                                    All
                                </Button>

                                {discoveredTypes.map((type) => (
                                    <Button
                                        key={type}
                                        size="sm"
                                        variant={typeFilter === type ? "default" : "outline"}
                                        onClick={() => setTypeFilter(type)}
                                    >
                                        {humanizeType(type)}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by status</p>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    size="sm"
                                    variant={readFilter === "all" ? "default" : "outline"}
                                    onClick={() => setReadFilter("all")}
                                >
                                    All
                                </Button>
                                <Button
                                    size="sm"
                                    variant={readFilter === "unread" ? "default" : "outline"}
                                    onClick={() => setReadFilter("unread")}
                                >
                                    Unread
                                </Button>
                                <Button
                                    size="sm"
                                    variant={readFilter === "read" ? "default" : "outline"}
                                    onClick={() => setReadFilter("read")}
                                >
                                    Read
                                </Button>
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-3">
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Total</p>
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

                        {sourceEndpoint ? (
                            <p className="text-xs text-muted-foreground">Data source: {sourceEndpoint}</p>
                        ) : null}
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
                                <TableHead className="min-w-28">Status</TableHead>
                                <TableHead className="min-w-52">Received</TableHead>
                                <TableHead className="min-w-36 text-right">Actions</TableHead>
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
                                    const marking = markingIds.includes(item.id)

                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-medium">{item.title}</span>
                                                    <span className="text-xs text-muted-foreground">{item.body}</span>
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
                                                    {humanizeType(item.type)}
                                                </span>
                                            </TableCell>

                                            <TableCell>
                                                {item.read_at ? (
                                                    <span className="inline-flex rounded-md border border-emerald-600/40 bg-emerald-600/10 px-2 py-1 text-xs font-medium text-foreground">
                                                        Read
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-medium text-foreground">
                                                        Unread
                                                    </span>
                                                )}
                                            </TableCell>

                                            <TableCell className="text-muted-foreground">
                                                {formatDateTime(item.created_at)}
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex items-center justify-end">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={!!item.read_at || marking}
                                                        onClick={() => void markAsRead(item.id)}
                                                    >
                                                        {item.read_at ? "Read" : marking ? "Marking..." : "Mark as read"}
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
