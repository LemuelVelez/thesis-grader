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
    read_at: string | null
    created_at: string | null
}

type TypeFilter = "all" | "general" | "evaluation_submitted" | "evaluation_locked"
type ReadFilter = "all" | "unread" | "read"

const TYPE_FILTERS: readonly TypeFilter[] = [
    "all",
    "general",
    "evaluation_submitted",
    "evaluation_locked",
]

const READ_FILTERS: readonly ReadFilter[] = ["all", "unread", "read"]

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

function formatType(type: string): string {
    if (!type) return "General"
    return type
        .split("_")
        .map((part) => toTitleCase(part))
        .join(" ")
}

function formatDateTime(value: string | null): string {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function typeTone(type: string): string {
    const normalized = type.trim().toLowerCase()

    if (normalized === "evaluation_locked") {
        return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
    }

    if (normalized === "evaluation_submitted") {
        return "border-blue-600/40 bg-blue-600/10 text-foreground"
    }

    if (normalized === "general") {
        return "border-violet-600/40 bg-violet-600/10 text-foreground"
    }

    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

function readTone(readAt: string | null): string {
    if (readAt) {
        return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
    }

    return "border-amber-600/40 bg-amber-600/10 text-foreground"
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

    const source =
        (isRecord(raw.notification) && raw.notification) ||
        (isRecord(raw.item) && raw.item) ||
        raw

    const id = toStringSafe(source.id ?? raw.id)
    if (!id) return null

    const title =
        toStringSafe(source.title ?? source.subject ?? raw.title) ??
        "Untitled notification"

    const body = toStringSafe(source.body ?? source.message ?? source.content ?? raw.body) ?? ""

    return {
        id,
        user_id: toNullableString(source.user_id ?? source.userId ?? raw.user_id),
        type: toStringSafe(source.type ?? raw.type) ?? "general",
        title,
        body,
        read_at: toNullableString(source.read_at ?? source.readAt ?? raw.read_at),
        created_at: toNullableString(source.created_at ?? source.createdAt ?? raw.created_at),
    }
}

async function readErrorMessage(res: Response, payload: unknown): Promise<string> {
    if (isRecord(payload)) {
        const message = toStringSafe(payload.error) ?? toStringSafe(payload.message)
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

function extractUserId(payload: unknown): string | null {
    if (!isRecord(payload)) return null

    const candidates: unknown[] = [
        payload.user,
        payload.item,
        payload.data,
        isRecord(payload.data) ? payload.data.user : null,
        isRecord(payload.result) ? payload.result.user : null,
        payload,
    ]

    for (const candidate of candidates) {
        if (!isRecord(candidate)) continue

        const direct = toStringSafe(candidate.id ?? candidate.user_id ?? candidate.userId)
        if (direct) return direct

        if (isRecord(candidate.user)) {
            const nested = toStringSafe(
                candidate.user.id ?? candidate.user.user_id ?? candidate.user.userId,
            )
            if (nested) return nested
        }
    }

    return null
}

async function resolveCurrentUserId(): Promise<string | null> {
    const authEndpoints = ["/api/auth/me", "/api/auth/profile", "/api/auth/session"]

    for (const endpoint of authEndpoints) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            const payload = (await res.json().catch(() => null)) as unknown
            if (!res.ok) continue

            const userId = extractUserId(payload)
            if (userId) return userId
        } catch {
            // try next
        }
    }

    return null
}

export default function StudentNotificationsPage() {
    const [notifications, setNotifications] = React.useState<NotificationItem[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [source, setSource] = React.useState<string | null>(null)
    const [userId, setUserId] = React.useState<string | null>(null)
    const [actioningId, setActioningId] = React.useState<string | null>(null)
    const [markAllBusy, setMarkAllBusy] = React.useState(false)

    const [search, setSearch] = React.useState("")
    const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all")
    const [readFilter, setReadFilter] = React.useState<ReadFilter>("all")

    const loadNotifications = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        let latestError = "Unable to load notifications."
        let loaded = false
        let resolvedUserId = userId

        if (!resolvedUserId) {
            resolvedUserId = await resolveCurrentUserId()
            if (resolvedUserId) {
                setUserId(resolvedUserId)
            }
        }

        const endpointCandidates = [
            ...(resolvedUserId
                ? [
                    `/api/notifications/user/${resolvedUserId}?limit=500&orderBy=created_at&orderDirection=desc`,
                    `/api/notifications/user/${resolvedUserId}?limit=500`,
                    `/api/notifications/user/${resolvedUserId}`,
                ]
                : []),
            "/api/notifications/my?limit=500&orderBy=created_at&orderDirection=desc",
            "/api/notifications/me?limit=500&orderBy=created_at&orderDirection=desc",
            "/api/notifications?limit=500&orderBy=created_at&orderDirection=desc",
            "/api/notifications",
        ]

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
                    .sort((a, b) => {
                        const ta = a.created_at ? new Date(a.created_at).getTime() : 0
                        const tb = b.created_at ? new Date(b.created_at).getTime() : 0
                        return tb - ta
                    })

                setNotifications(parsed)
                setSource(endpoint)
                loaded = true
                break
            } catch (err) {
                latestError = err instanceof Error ? err.message : "Unable to load notifications."
            }
        }

        if (!loaded) {
            setNotifications([])
            setSource(null)

            const extra =
                resolvedUserId === null
                    ? " Could not resolve the current user ID from auth endpoints."
                    : ""

            setError(`${latestError} No notifications endpoint responded successfully.${extra}`)
        }

        setLoading(false)
    }, [userId])

    React.useEffect(() => {
        void loadNotifications()
    }, [loadNotifications])

    const markAsRead = React.useCallback(async (id: string) => {
        setActioningId(id)
        setError(null)

        const methods = ["PATCH", "POST"] as const
        let latestError = "Unable to mark notification as read."

        for (const method of methods) {
            try {
                const res = await fetch(`/api/notifications/${id}/read`, {
                    method,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ readAt: new Date().toISOString() }),
                })

                const payload = (await res.json().catch(() => null)) as unknown
                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const normalized = normalizeNotification(
                    isRecord(payload) && isRecord(payload.item) ? payload.item : payload,
                )

                setNotifications((prev) =>
                    prev.map((row) => {
                        if (row.id !== id) return row
                        if (normalized) {
                            return {
                                ...row,
                                ...normalized,
                                id: row.id,
                            }
                        }
                        return {
                            ...row,
                            read_at: row.read_at ?? new Date().toISOString(),
                        }
                    }),
                )
                setActioningId(null)
                return
            } catch (err) {
                latestError = err instanceof Error ? err.message : latestError
            }
        }

        setError(latestError)
        setActioningId(null)
    }, [])

    const markAllAsRead = React.useCallback(async () => {
        if (!userId) {
            setError("Unable to mark all as read because user ID is unavailable.")
            return
        }

        setMarkAllBusy(true)
        setError(null)

        const methods = ["PATCH", "POST"] as const
        let latestError = "Unable to mark all notifications as read."

        for (const method of methods) {
            try {
                const res = await fetch(`/api/notifications/user/${userId}/read-all`, {
                    method,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ readAt: new Date().toISOString() }),
                })

                const payload = (await res.json().catch(() => null)) as unknown
                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const readAt = new Date().toISOString()
                setNotifications((prev) =>
                    prev.map((row) => ({
                        ...row,
                        read_at: row.read_at ?? readAt,
                    })),
                )
                setMarkAllBusy(false)
                return
            } catch (err) {
                latestError = err instanceof Error ? err.message : latestError
            }
        }

        setError(latestError)
        setMarkAllBusy(false)
    }, [userId])

    const filtered = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return notifications.filter((item) => {
            const type = item.type.toLowerCase()
            const isRead = !!item.read_at

            if (typeFilter !== "all" && type !== typeFilter) {
                return false
            }

            if (readFilter === "read" && !isRead) return false
            if (readFilter === "unread" && isRead) return false

            if (!q) return true

            return (
                item.id.toLowerCase().includes(q) ||
                item.title.toLowerCase().includes(q) ||
                item.body.toLowerCase().includes(q) ||
                type.includes(q)
            )
        })
    }, [notifications, search, typeFilter, readFilter])

    const totals = React.useMemo(() => {
        let unread = 0
        let read = 0
        let evaluation = 0

        for (const item of notifications) {
            if (item.read_at) read += 1
            else unread += 1

            if (
                item.type === "evaluation_submitted" ||
                item.type === "evaluation_locked"
            ) {
                evaluation += 1
            }
        }

        return {
            total: notifications.length,
            unread,
            read,
            evaluation,
        }
    }, [notifications])

    return (
        <DashboardLayout
            title="Notifications"
            description="Review system notices and evaluation alerts."
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

                            <Button
                                variant="outline"
                                onClick={() => void loadNotifications()}
                                disabled={loading}
                            >
                                Refresh
                            </Button>

                            <Button
                                onClick={() => void markAllAsRead()}
                                disabled={loading || markAllBusy || totals.unread === 0}
                            >
                                Mark all as read
                            </Button>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by type</p>
                            <div className="flex flex-wrap gap-2">
                                {TYPE_FILTERS.map((type) => {
                                    const active = typeFilter === type
                                    return (
                                        <Button
                                            key={`type-${type}`}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setTypeFilter(type)}
                                        >
                                            {type === "all" ? "All" : formatType(type)}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by read state</p>
                            <div className="flex flex-wrap gap-2">
                                {READ_FILTERS.map((state) => {
                                    const active = readFilter === state
                                    return (
                                        <Button
                                            key={`read-${state}`}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setReadFilter(state)}
                                        >
                                            {state === "all" ? "All" : toTitleCase(state)}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Total</p>
                                <p className="text-lg font-semibold">{totals.total}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Unread</p>
                                <p className="text-lg font-semibold">{totals.unread}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Read</p>
                                <p className="text-lg font-semibold">{totals.read}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Evaluation alerts</p>
                                <p className="text-lg font-semibold">{totals.evaluation}</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <p>
                                Showing <span className="font-semibold text-foreground">{filtered.length}</span> of{" "}
                                <span className="font-semibold text-foreground">{notifications.length}</span> notification(s).
                            </p>
                            {userId ? <p>User ID: {userId}</p> : null}
                            {source ? <p>Data source: {source}</p> : null}
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
                                <TableHead className="min-w-64">Title</TableHead>
                                <TableHead className="min-w-44">Type</TableHead>
                                <TableHead className="min-w-80">Message</TableHead>
                                <TableHead className="min-w-44">Created</TableHead>
                                <TableHead className="min-w-40">Status</TableHead>
                                <TableHead className="min-w-36">Action</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <TableRow key={`notification-skeleton-${i}`}>
                                        <TableCell colSpan={6}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                        No notifications found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filtered.map((item) => {
                                    const unread = !item.read_at
                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-medium">{item.title}</span>
                                                    <span className="text-xs text-muted-foreground">{item.id}</span>
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
                                                <p className="line-clamp-2 text-sm text-muted-foreground">
                                                    {item.body || "—"}
                                                </p>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {formatDateTime(item.created_at)}
                                            </TableCell>
                                            <TableCell>
                                                <span
                                                    className={[
                                                        "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                        readTone(item.read_at),
                                                    ].join(" ")}
                                                >
                                                    {unread ? "Unread" : "Read"}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                {unread ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => void markAsRead(item.id)}
                                                        disabled={actioningId === item.id}
                                                    >
                                                        {actioningId === item.id ? "Updating..." : "Mark read"}
                                                    </Button>
                                                ) : (
                                                    <Button size="sm" variant="outline" disabled>
                                                        Read
                                                    </Button>
                                                )}
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
