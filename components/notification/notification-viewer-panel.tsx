"use client"

import * as React from "react"
import { Bell, RefreshCw, Send } from "lucide-react"

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
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip"

import {
    NONE_VALUE,
    READ_FILTERS,
    SELECT_CONTENT_CLASS,
    SELECT_TRIGGER_CLASS,
    type FriendlyNotificationContent,
    type NotificationAutomationOptions,
    type NotificationRecord,
    type ReadFilter,
} from "@/components/notification/types"
import {
    formatDate,
    pushPermissionLabel,
    toFriendlyNotification,
    toLabel,
    truncateMiddle,
} from "@/components/notification/utils"

type NotificationViewerPanelProps = {
    options: NotificationAutomationOptions | null

    viewerUserId: string
    setViewerUserId: (value: string) => void

    typeFilter: string
    setTypeFilter: (value: string) => void

    readFilter: ReadFilter
    setReadFilter: (value: ReadFilter) => void

    listLoading: boolean
    actionKey: string | null

    loadNotifications: () => Promise<void>
    markAllAsRead: () => Promise<void>

    notifications: NotificationRecord[]
    unreadCount: number

    markAsRead: (id: string) => Promise<void>
    deleteNotification: (id: string) => Promise<void>
    openNotificationDetails: (notification: NotificationRecord) => void

    notificationDialogOpen: boolean
    setNotificationDialogOpen: (open: boolean) => void
    selectedNotification: NotificationRecord | null
    selectedNotificationFriendly: FriendlyNotificationContent | null

    markSelectedNotificationAsRead: () => Promise<void>
    deleteSelectedNotification: () => Promise<void>

    pushSupported: boolean
    pushPermission: NotificationPermission | "unsupported"
    pushConfigured: boolean
    pushConfigReason: string | null
    localPushEndpoint: string | null

    pushActionsBusy: boolean
    canManagePush: boolean

    loadPushEnvironment: (showToast?: boolean) => Promise<unknown>
    enablePushForSelectedUser: () => Promise<void>
    disablePushForCurrentBrowser: () => Promise<void>
    sendPushTestToSelectedUser: () => Promise<void>
}

export function NotificationViewerPanel({
    options,
    viewerUserId,
    setViewerUserId,
    typeFilter,
    setTypeFilter,
    readFilter,
    setReadFilter,
    listLoading,
    actionKey,
    loadNotifications,
    markAllAsRead,
    notifications,
    unreadCount,
    markAsRead,
    deleteNotification,
    openNotificationDetails,
    notificationDialogOpen,
    setNotificationDialogOpen,
    selectedNotification,
    selectedNotificationFriendly,
    markSelectedNotificationAsRead,
    deleteSelectedNotification,
    pushSupported,
    pushPermission,
    pushConfigured,
    pushConfigReason,
    localPushEndpoint,
    pushActionsBusy,
    canManagePush,
    loadPushEnvironment,
    enablePushForSelectedUser,
    disablePushForCurrentBrowser,
    sendPushTestToSelectedUser,
}: NotificationViewerPanelProps) {
    return (
        <>
            <div className="rounded-lg border bg-card p-4">
                <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div className="min-w-0">
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
                                {(options?.context.users ?? []).map((u) => {
                                    const label = `${u.label} • ${toLabel(u.role)}`
                                    return (
                                        <SelectItem key={u.value} value={u.value} textValue={label}>
                                            <span className="block truncate" title={label}>
                                                {label}
                                            </span>
                                        </SelectItem>
                                    )
                                })}
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
                            onValueChange={(v) => setReadFilter(v as ReadFilter)}
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
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Browser Support
                            </p>
                            <p className="text-sm font-medium">
                                {pushSupported ? "Supported" : "Not Supported"}
                            </p>
                        </div>

                        <div className="rounded-md border bg-background px-3 py-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Permission
                            </p>
                            <p className="text-sm font-medium">
                                {pushPermissionLabel(pushPermission)}
                            </p>
                        </div>

                        <div className="rounded-md border bg-background px-3 py-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Server Push Config
                            </p>
                            <p className="text-sm font-medium">
                                {pushConfigured ? "Configured" : "Not Configured"}
                            </p>
                        </div>

                        <div className="rounded-md border bg-background px-3 py-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                                const friendly = toFriendlyNotification(n)

                                return (
                                    <TableRow key={n.id}>
                                        <TableCell>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        className="h-auto w-full justify-start p-0 text-left"
                                                        onClick={() => openNotificationDetails(n)}
                                                    >
                                                        <div className="flex min-w-0 w-full flex-col">
                                                            <span className="font-medium truncate" title={friendly.title}>
                                                                {friendly.title}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground truncate" title={friendly.summary}>
                                                                {friendly.summary}
                                                            </span>
                                                            <span className="mt-1 inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs text-muted-foreground">
                                                                Click to view formal notice
                                                            </span>
                                                        </div>
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" align="start">
                                                    Click this row to open the full formal message
                                                </TooltipContent>
                                            </Tooltip>
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

            <Dialog open={notificationDialogOpen} onOpenChange={setNotificationDialogOpen}>
                <DialogContent className="sm:max-w-3xl max-h-screen overflow-auto">
                    {selectedNotification && selectedNotificationFriendly ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>{selectedNotificationFriendly.title}</DialogTitle>
                                <DialogDescription>
                                    {selectedNotificationFriendly.summary}
                                </DialogDescription>
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
                                    <p className="text-xs font-medium text-muted-foreground">
                                        Subject
                                    </p>
                                    <p className="mt-1 text-sm font-semibold">
                                        {selectedNotificationFriendly.formalSubject}
                                    </p>

                                    <div className="mt-3 rounded-md border bg-muted/10 p-3">
                                        <p className="whitespace-pre-line text-sm leading-6">
                                            {selectedNotificationFriendly.formalMessage}
                                        </p>
                                    </div>
                                </div>

                                {selectedNotificationFriendly.details.length > 0 ? (
                                    <div className="rounded-md border bg-muted/10 p-3">
                                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                                            Included details
                                        </p>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {selectedNotificationFriendly.details.map((detail, index) => (
                                                <div
                                                    key={`${detail.label}-${index}`}
                                                    className="rounded-md border bg-background px-3 py-2"
                                                >
                                                    <p className="text-xs text-muted-foreground">
                                                        {detail.label}
                                                    </p>
                                                    <p className="text-sm font-medium wrap-break-word">
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

                                <div className="flex items-center gap-2">
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

                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => void deleteSelectedNotification()}
                                        disabled={!!actionKey}
                                    >
                                        {actionKey === `delete:${selectedNotification.id}` ? "Deleting..." : "Delete"}
                                    </Button>
                                </div>
                            </DialogFooter>
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    )
}
