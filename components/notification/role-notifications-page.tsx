"use client"

import * as React from "react"
import { Bell, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
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
import {
    READ_FILTERS,
    SELECT_CONTENT_CLASS,
    SELECT_TRIGGER_CLASS,
    type NotificationRecord,
    type NotificationsResponse,
    type ReadFilter,
} from "@/components/notification/types"
import {
    formatDate,
    readErrorMessage,
    toFriendlyNotification,
    toLabel,
} from "@/components/notification/utils"

type RolePerspective = "panelist" | "staff" | "student"

type RoleNotificationsPageProps = {
    perspective: RolePerspective
}

type AuthUser = {
    id: string
    name: string | null
}

const PAGE_COPY: Record<RolePerspective, { title: string; description: string }> = {
    panelist: {
        title: "Panelist Notifications",
        description: "Latest evaluation, schedule, and thesis-related updates in one place.",
    },
    staff: {
        title: "Staff Notifications",
        description: "Operational updates, schedule changes, and system notices for your workflow.",
    },
    student: {
        title: "Student Notifications",
        description: "Stay updated with evaluations, defense schedules, and official announcements.",
    },
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object") return null
    return value as Record<string, unknown>
}

function pickString(rec: Record<string, unknown> | null, keys: string[]): string | null {
    if (!rec) return null
    for (const key of keys) {
        const value = rec[key]
        if (typeof value === "string") {
            const trimmed = value.trim()
            if (trimmed) return trimmed
        }
    }
    return null
}

function parseAuthUser(payload: unknown): AuthUser | null {
    const root = asRecord(payload)
    if (!root) return null

    const candidates: Array<Record<string, unknown> | null> = [
        root,
        asRecord(root.item),
        asRecord(root.user),
        asRecord(root.data),
    ]

    const item = asRecord(root.item)
    if (item) candidates.push(asRecord(item.user))

    const data = asRecord(root.data)
    if (data) candidates.push(asRecord(data.user))

    for (const candidate of candidates) {
        const id = pickString(candidate, ["id", "user_id", "userId", "uuid"])
        if (!id) continue

        const name =
            pickString(candidate, ["name", "full_name", "fullName", "display_name", "displayName", "email"]) ??
            null

        return { id, name }
    }

    return null
}

export function RoleNotificationsPage({ perspective }: RoleNotificationsPageProps) {
    const copy = PAGE_COPY[perspective]

    const [authLoading, setAuthLoading] = React.useState(false)
    const [currentUser, setCurrentUser] = React.useState<AuthUser | null>(null)

    const [typeFilter, setTypeFilter] = React.useState<string>("all")
    const [readFilter, setReadFilter] = React.useState<ReadFilter>("all")

    const [notifications, setNotifications] = React.useState<NotificationRecord[]>([])
    const [listLoading, setListLoading] = React.useState(false)
    const [actionKey, setActionKey] = React.useState<string | null>(null)
    const [lastLoadedAt, setLastLoadedAt] = React.useState<string | null>(null)

    const [notificationDialogOpen, setNotificationDialogOpen] = React.useState(false)
    const [selectedNotification, setSelectedNotification] = React.useState<NotificationRecord | null>(null)

    const unreadCount = React.useMemo(
        () => notifications.filter((n) => !n.read_at).length,
        [notifications],
    )

    const selectedFriendly = React.useMemo(
        () => (selectedNotification ? toFriendlyNotification(selectedNotification) : null),
        [selectedNotification],
    )

    const typeOptions = React.useMemo(() => {
        const dynamic = Array.from(new Set(notifications.map((n) => n.type))).sort((a, b) =>
            a.localeCompare(b),
        )

        return dynamic
    }, [notifications])

    const loadCurrentUser = React.useCallback(async () => {
        setAuthLoading(true)
        try {
            const res = await fetch("/api/auth/me", { cache: "no-store" })
            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const payload = (await res.json()) as unknown
            const parsed = parseAuthUser(payload)

            if (!parsed?.id) {
                throw new Error("Unable to resolve active user session.")
            }

            setCurrentUser(parsed)
        } catch (error) {
            setCurrentUser(null)
            const message =
                error instanceof Error ? error.message : "Failed to resolve active user."
            toast.error(message)
        } finally {
            setAuthLoading(false)
        }
    }, [])

    const loadNotifications = React.useCallback(async () => {
        const userId = currentUser?.id
        if (!userId) {
            setNotifications([])
            return
        }

        setListLoading(true)
        try {
            const encodedUid = encodeURIComponent(userId)

            let endpoint = `/api/notifications/user/${encodedUid}?limit=200`
            if (readFilter === "unread") {
                endpoint = `/api/notifications/user/${encodedUid}/unread?limit=200`
            } else if (typeFilter !== "all") {
                endpoint = `/api/notifications/user/${encodedUid}/type/${typeFilter}?limit=200`
            }

            const res = await fetch(endpoint, { cache: "no-store" })
            if (!res.ok) throw new Error(await readErrorMessage(res))

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
            setLastLoadedAt(new Date().toISOString())
        } catch (error) {
            setNotifications([])
            const message =
                error instanceof Error ? error.message : "Failed to load notifications."
            toast.error(message)
        } finally {
            setListLoading(false)
        }
    }, [currentUser?.id, readFilter, typeFilter])

    React.useEffect(() => {
        void loadCurrentUser()
    }, [loadCurrentUser])

    React.useEffect(() => {
        if (!currentUser?.id) return
        void loadNotifications()
    }, [currentUser?.id, loadNotifications])

    React.useEffect(() => {
        if (!selectedNotification) return

        const latest = notifications.find((n) => n.id === selectedNotification.id)
        if (!latest) {
            setSelectedNotification(null)
            setNotificationDialogOpen(false)
            return
        }

        setSelectedNotification(latest)
    }, [notifications, selectedNotification])

    const markAsRead = React.useCallback(
        async (id: string, silent = false) => {
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

                if (!silent) {
                    toast.success("Notification marked as read.")
                }
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "Failed to mark notification as read."
                toast.error(message)
            } finally {
                setActionKey(null)
            }
        },
        [],
    )

    const markAllAsRead = React.useCallback(async () => {
        const userId = currentUser?.id
        if (!userId) {
            toast.error("Active user session is unavailable.")
            return
        }

        setActionKey("read-all")
        try {
            const res = await fetch(`/api/notifications/user/${encodeURIComponent(userId)}/read-all`, {
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
                error instanceof Error ? error.message : "Failed to update notifications."
            toast.error(message)
        } finally {
            setActionKey(null)
        }
    }, [currentUser?.id, loadNotifications])

    const openNotificationDetails = React.useCallback(
        (notification: NotificationRecord) => {
            setSelectedNotification(notification)
            setNotificationDialogOpen(true)

            if (!notification.read_at) {
                void markAsRead(notification.id, true)
            }
        },
        [markAsRead],
    )

    const markSelectedNotificationAsRead = React.useCallback(async () => {
        if (!selectedNotification || selectedNotification.read_at) return
        await markAsRead(selectedNotification.id)
    }, [markAsRead, selectedNotification])

    return (
        <DashboardLayout title={copy.title} description={copy.description}>
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                        <div className="min-w-0">
                            <h2 className="text-sm font-semibold">Notifications</h2>
                            <p className="text-xs text-muted-foreground">
                                {currentUser?.name
                                    ? `Signed in as ${currentUser.name}`
                                    : "Signed-in account notifications"}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={() => void loadCurrentUser()}
                                disabled={authLoading || listLoading || !!actionKey}
                            >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                {authLoading ? "Syncing..." : "Sync Account"}
                            </Button>

                            <Button
                                variant="outline"
                                onClick={() => void loadNotifications()}
                                disabled={listLoading || authLoading || !!actionKey || !currentUser?.id}
                            >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                {listLoading ? "Loading..." : "Refresh"}
                            </Button>

                            <Button
                                onClick={() => void markAllAsRead()}
                                disabled={
                                    listLoading ||
                                    authLoading ||
                                    !!actionKey ||
                                    !currentUser?.id ||
                                    unreadCount === 0
                                }
                            >
                                <Bell className="mr-2 h-4 w-4" />
                                {actionKey === "read-all" ? "Updating..." : "Mark All Read"}
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-2 min-w-0">
                            <p className="text-xs font-medium text-muted-foreground">Type filter</p>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                    <SelectValue placeholder="Filter by type" />
                                </SelectTrigger>
                                <SelectContent className={SELECT_CONTENT_CLASS}>
                                    <SelectItem value="all">All</SelectItem>
                                    {typeOptions.map((typeValue) => (
                                        <SelectItem
                                            key={typeValue}
                                            value={typeValue}
                                            textValue={toLabel(typeValue)}
                                        >
                                            <span className="block truncate">{toLabel(typeValue)}</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2 min-w-0">
                            <p className="text-xs font-medium text-muted-foreground">Read filter</p>
                            <Select
                                value={readFilter}
                                onValueChange={(v) => setReadFilter(v as ReadFilter)}
                            >
                                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                    <SelectValue placeholder="Filter by status" />
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

                        <div className="rounded-md border bg-muted/20 px-3 py-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Summary
                            </p>
                            <p className="mt-1 text-sm font-medium">
                                Total: {notifications.length} • Unread: {unreadCount}
                            </p>
                            {lastLoadedAt ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Last updated: {formatDate(lastLoadedAt)}
                                </p>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto rounded-lg border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-72">Notification</TableHead>
                                <TableHead className="min-w-40">Type</TableHead>
                                <TableHead className="min-w-28">Status</TableHead>
                                <TableHead className="min-w-44">Created</TableHead>
                                <TableHead className="min-w-28 text-right">Action</TableHead>
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
                                        No notifications available yet.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                notifications.map((notification) => {
                                    const friendly = toFriendlyNotification(notification)
                                    return (
                                        <TableRow key={notification.id}>
                                            <TableCell className="min-w-0">
                                                <button
                                                    type="button"
                                                    className="w-full text-left"
                                                    onClick={() => openNotificationDetails(notification)}
                                                >
                                                    <div className="flex min-w-0 flex-col">
                                                        <span
                                                            className="truncate font-medium"
                                                            title={friendly.title}
                                                        >
                                                            {friendly.title}
                                                        </span>
                                                        <span
                                                            className="truncate text-xs text-muted-foreground"
                                                            title={friendly.summary}
                                                        >
                                                            {friendly.summary}
                                                        </span>
                                                    </div>
                                                </button>
                                            </TableCell>

                                            <TableCell>
                                                <span className="inline-flex rounded-md border px-2 py-1 text-xs font-medium">
                                                    {toLabel(notification.type)}
                                                </span>
                                            </TableCell>

                                            <TableCell>
                                                <span
                                                    className={[
                                                        "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                        notification.read_at
                                                            ? "border-muted-foreground/30 bg-muted text-muted-foreground"
                                                            : "border-primary/40 bg-primary/10 text-foreground",
                                                    ].join(" ")}
                                                >
                                                    {notification.read_at ? "Read" : "Unread"}
                                                </span>
                                            </TableCell>

                                            <TableCell className="text-muted-foreground">
                                                {formatDate(notification.created_at)}
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex justify-end">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => openNotificationDetails(notification)}
                                                        disabled={!!actionKey}
                                                    >
                                                        View
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

            <Dialog open={notificationDialogOpen} onOpenChange={setNotificationDialogOpen}>
                <DialogContent className="max-h-screen overflow-auto sm:max-w-3xl">
                    {selectedNotification && selectedFriendly ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>{selectedFriendly.title}</DialogTitle>
                                <DialogDescription>{selectedFriendly.summary}</DialogDescription>
                            </DialogHeader>

                            <div className="grid gap-3">
                                <div className="grid gap-2 sm:grid-cols-3">
                                    <div className="rounded-md border bg-muted/20 px-3 py-2">
                                        <p className="text-xs text-muted-foreground">Type</p>
                                        <p className="text-sm font-medium">
                                            {toLabel(selectedNotification.type)}
                                        </p>
                                    </div>
                                    <div className="rounded-md border bg-muted/20 px-3 py-2">
                                        <p className="text-xs text-muted-foreground">Status</p>
                                        <p className="text-sm font-medium">
                                            {selectedNotification.read_at ? "Read" : "Unread"}
                                        </p>
                                    </div>
                                    <div className="rounded-md border bg-muted/20 px-3 py-2">
                                        <p className="text-xs text-muted-foreground">Created</p>
                                        <p className="text-sm font-medium">
                                            {formatDate(selectedNotification.created_at)}
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-md border bg-background p-3">
                                    <p className="text-xs font-medium text-muted-foreground">Subject</p>
                                    <p className="mt-1 text-sm font-semibold">
                                        {selectedFriendly.formalSubject}
                                    </p>

                                    <div className="mt-3 rounded-md border bg-muted/10 p-3">
                                        <p className="whitespace-pre-line text-sm leading-6">
                                            {selectedFriendly.formalMessage}
                                        </p>
                                    </div>
                                </div>

                                {selectedFriendly.details.length > 0 ? (
                                    <div className="rounded-md border bg-muted/10 p-3">
                                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                                            Included details
                                        </p>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {selectedFriendly.details.map((detail, idx) => (
                                                <div
                                                    key={`${detail.label}-${idx}`}
                                                    className="rounded-md border bg-background px-3 py-2"
                                                >
                                                    <p className="text-xs text-muted-foreground">
                                                        {detail.label}
                                                    </p>
                                                    <p className="wrap-break-word text-sm font-medium">
                                                        {detail.value}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                                        No additional details were attached to this notification.
                                    </div>
                                )}
                            </div>

                            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs text-muted-foreground">
                                    Reference ID: {selectedNotification.id}
                                </p>

                                {!selectedNotification.read_at ? (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => void markSelectedNotificationAsRead()}
                                        disabled={!!actionKey}
                                    >
                                        {actionKey === `read:${selectedNotification.id}` ? "Updating..." : "Mark Read"}
                                    </Button>
                                ) : null}
                            </DialogFooter>
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </DashboardLayout>
    )
}
