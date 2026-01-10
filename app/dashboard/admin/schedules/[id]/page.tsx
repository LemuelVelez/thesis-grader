/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    ArrowLeft,
    Calendar,
    Clock,
    Eye,
    Loader2,
    Pencil,
    RefreshCw,
    ShieldCheck,
    Trash2,
    Users,
    X,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"

type ApiOk<T> = { ok: true } & T
type ApiErr = { ok: false; error?: string; message?: string }

type DbUser = {
    id: string
    name: string | null
    email: string
    role?: string | null
    status?: "active" | "disabled" | string | null
}

type DbSchedule = {
    id: string
    groupId: string
    scheduledAt: string
    room: string | null
    status: string
    createdBy: string | null
    createdAt: string
    updatedAt: string
    groupTitle: string | null
    program: string | null
    term: string | null
}

type DbPanelist = {
    scheduleId: string
    staffId: string
    staffName: string | null
    staffEmail: string | null
}

function safeText(v: any, fallback = "") {
    const s = String(v ?? "").trim()
    return s ? s : fallback
}

function fmtDateTime(iso?: string | null) {
    const s = safeText(iso, "")
    if (!s) return ""
    const dt = new Date(s)
    if (Number.isNaN(dt.getTime())) return s
    return dt.toLocaleString()
}

function fmtDate(iso?: string | null) {
    const s = safeText(iso, "")
    if (!s) return ""
    const dt = new Date(s)
    if (Number.isNaN(dt.getTime())) return s
    return dt.toLocaleDateString()
}

function fmtTime(iso?: string | null) {
    const s = safeText(iso, "")
    if (!s) return ""
    const dt = new Date(s)
    if (Number.isNaN(dt.getTime())) return s
    return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function toLocalDateInput(iso?: string | null) {
    const s = safeText(iso, "")
    if (!s) return ""
    const dt = new Date(s)
    if (Number.isNaN(dt.getTime())) return ""
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, "0")
    const d = String(dt.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
}

function toLocalTimeInput(iso?: string | null) {
    const s = safeText(iso, "")
    if (!s) return ""
    const dt = new Date(s)
    if (Number.isNaN(dt.getTime())) return ""
    const hh = String(dt.getHours()).padStart(2, "0")
    const mm = String(dt.getMinutes()).padStart(2, "0")
    return `${hh}:${mm}`
}

function statusBadge(status?: string | null) {
    const s = safeText(status, "").toLowerCase()
    if (!s) return <Badge variant="secondary">Unknown</Badge>
    if (s === "scheduled") return <Badge>Scheduled</Badge>
    if (s === "ongoing") return <Badge>Ongoing</Badge>
    if (s === "done" || s === "completed") return <Badge>Completed</Badge>
    if (s === "cancelled" || s === "canceled") return <Badge variant="destructive">Cancelled</Badge>
    if (s === "archived") return <Badge variant="outline">Archived</Badge>
    return <Badge variant="secondary">{safeText(status, "Unknown")}</Badge>
}

function normalizeRole(role?: string | null) {
    return safeText(role, "").toLowerCase()
}

function userLabel(u?: DbUser | null) {
    if (!u) return ""
    const name = safeText(u.name, "")
    const email = safeText(u.email, "")
    if (name && email) return `${name} (${email})`
    return name || email
}

// Select.Item cannot use empty string values.
const CLEAR_SELECT_VALUE = "__clear__"

async function apiGet<T>(url: string): Promise<ApiOk<T> | ApiErr> {
    const res = await fetch(url, { method: "GET" })
    const data = (await res.json().catch(() => ({}))) as any
    if (!res.ok) return { ok: false, error: data?.error ?? data?.message ?? `HTTP ${res.status}` }
    return data
}

async function apiPatch<T>(url: string, body: any): Promise<ApiOk<T> | ApiErr> {
    const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as any
    if (!res.ok) return { ok: false, error: data?.error ?? data?.message ?? `HTTP ${res.status}` }
    return data
}

async function apiPost<T>(url: string, body: any): Promise<ApiOk<T> | ApiErr> {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as any
    if (!res.ok) return { ok: false, error: data?.error ?? data?.message ?? `HTTP ${res.status}` }
    return data
}

async function apiDelete<T>(url: string): Promise<ApiOk<T> | ApiErr> {
    const res = await fetch(url, { method: "DELETE" })
    const data = (await res.json().catch(() => ({}))) as any
    if (!res.ok) return { ok: false, error: data?.error ?? data?.message ?? `HTTP ${res.status}` }
    return data
}

function buildScheduledAtISO(dateStr: string, timeStr: string) {
    const d = safeText(dateStr, "")
    const t = safeText(timeStr, "")
    if (!d || !t) return ""
    const dt = new Date(`${d}T${t}:00`)
    if (Number.isNaN(dt.getTime())) return ""
    return dt.toISOString()
}

export default function AdminScheduleDetailPage() {
    const router = useRouter()
    const params = useParams() as any
    const scheduleId = String(params?.id ?? "").trim()

    const { user, loading: authLoading } = useAuth()

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)

    const [schedule, setSchedule] = React.useState<DbSchedule | null>(null)
    const [panelists, setPanelists] = React.useState<DbPanelist[]>([])
    const [users, setUsers] = React.useState<DbUser[]>([])

    // edit dialog
    const [openEdit, setOpenEdit] = React.useState(false)
    const [saving, setSaving] = React.useState(false)
    const [edDate, setEdDate] = React.useState("")
    const [edTime, setEdTime] = React.useState("")
    const [edRoom, setEdRoom] = React.useState("")
    const [edStatus, setEdStatus] = React.useState("scheduled")
    const [edReason, setEdReason] = React.useState("")

    // delete alert dialog
    const [openDelete, setOpenDelete] = React.useState(false)
    const [deleteReason, setDeleteReason] = React.useState("")
    const [deleting, setDeleting] = React.useState(false)

    // panel dialog
    const [openPanel, setOpenPanel] = React.useState(false)
    const [panelLoading, setPanelLoading] = React.useState(false)
    const [panelAddStaffId, setPanelAddStaffId] = React.useState("")
    const [panelBusyId, setPanelBusyId] = React.useState("")
    const [panelAdding, setPanelAdding] = React.useState(false)
    const [panelReason, setPanelReason] = React.useState("")

    const usersById = React.useMemo(() => {
        const m = new Map<string, DbUser>()
        for (const u of users) m.set(u.id, u)
        return m
    }, [users])

    const staffUsers = React.useMemo(() => {
        return users
            .filter((u) => normalizeRole(u.role) === "staff" && String(u.status ?? "active").toLowerCase() !== "disabled")
            .sort((a, b) => userLabel(a).localeCompare(userLabel(b)))
    }, [users])

    async function loadOne() {
        if (!scheduleId) return
        setLoading(true)
        try {
            const [scRes, panelRes, usersRes] = await Promise.all([
                apiGet<{ schedule: DbSchedule }>(`/api/schedule?resource=schedules&id=${encodeURIComponent(scheduleId)}`),
                apiGet<{ panelists: DbPanelist[] }>(`/api/schedule?resource=panelists&scheduleId=${encodeURIComponent(scheduleId)}`),
                apiGet<{ users: DbUser[] }>(`/api/admin/users?limit=500&offset=0`),
            ])

            if (!scRes.ok) throw new Error(scRes.error ?? "Failed to load schedule")
            if (!panelRes.ok) throw new Error(panelRes.error ?? "Failed to load panelists")
            if (!usersRes.ok) throw new Error(usersRes.error ?? "Failed to load users")

            const sch = (scRes as any).schedule ?? null
            setSchedule(sch)
            setPanelists(Array.isArray((panelRes as any).panelists) ? (panelRes as any).panelists : [])
            setUsers(Array.isArray((usersRes as any).users) ? (usersRes as any).users : [])

            if (sch) {
                setEdDate(toLocalDateInput(sch.scheduledAt))
                setEdTime(toLocalTimeInput(sch.scheduledAt))
                setEdRoom(safeText(sch.room, ""))
                setEdStatus(safeText(sch.status, "scheduled") || "scheduled")
            }
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to load schedule")
            setSchedule(null)
            setPanelists([])
        } finally {
            setLoading(false)
        }
    }

    async function refresh() {
        setRefreshing(true)
        try {
            await loadOne()
        } finally {
            setRefreshing(false)
        }
    }

    React.useEffect(() => {
        if (authLoading) return
        if (!user) return
        if (String(user.role ?? "").toLowerCase() !== "admin") {
            toast.error("Unauthorized")
            router.push("/dashboard")
            return
        }
        loadOne()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, user?.id, scheduleId])

    async function saveEdits() {
        if (!schedule) return

        const scheduledAt = buildScheduledAtISO(edDate, edTime)
        if (!scheduledAt) {
            toast.error("Please set a valid date and time.")
            return
        }

        const reason = safeText(edReason, "")
        if (!reason) {
            toast.error("Reason is required for admin overrides.")
            return
        }

        setSaving(true)
        try {
            const res = await apiPatch(`/api/schedule?resource=schedules&id=${encodeURIComponent(schedule.id)}`, {
                scheduledAt,
                room: safeText(edRoom, "") || null,
                status: safeText(edStatus, "scheduled") || "scheduled",
                reason,
            })
            if (!res.ok) throw new Error(res.error ?? "Failed to update schedule")
            toast.success("Schedule updated")
            setOpenEdit(false)
            setEdReason("")
            await loadOne()
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to update schedule")
        } finally {
            setSaving(false)
        }
    }

    async function confirmDeleteSchedule() {
        if (!schedule) return
        const reason = safeText(deleteReason, "")
        if (!reason) {
            toast.error("Reason is required.")
            return
        }

        setDeleting(true)
        try {
            const res = await apiDelete(
                `/api/schedule?resource=schedules&id=${encodeURIComponent(schedule.id)}&reason=${encodeURIComponent(reason)}`
            )
            if (!res.ok) throw new Error(res.error ?? "Failed to delete schedule")
            toast.success("Schedule deleted")
            setOpenDelete(false)
            router.push("/dashboard/admin/schedules")
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to delete schedule")
        } finally {
            setDeleting(false)
        }
    }

    async function openPanelists() {
        if (!schedule) return
        setOpenPanel(true)
        setPanelAddStaffId("")
        setPanelReason("")
        setPanelLoading(true)
        try {
            const res = await apiGet<{ panelists: DbPanelist[] }>(
                `/api/schedule?resource=panelists&scheduleId=${encodeURIComponent(schedule.id)}`
            )
            if (!res.ok) throw new Error(res.error ?? "Failed to load panelists")
            setPanelists(Array.isArray((res as any).panelists) ? (res as any).panelists : [])
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to load panelists")
        } finally {
            setPanelLoading(false)
        }
    }

    async function addPanelist() {
        if (!schedule) return
        const staffId = safeText(panelAddStaffId, "")
        if (!staffId || staffId === CLEAR_SELECT_VALUE) {
            toast.error("Please select a staff panelist to add.")
            return
        }

        const reason = safeText(panelReason, "")
        if (!reason) {
            toast.error("Reason is required for admin overrides.")
            return
        }

        setPanelAdding(true)
        try {
            const res = await apiPost(`/api/schedule?resource=panelists`, { scheduleId: schedule.id, staffId, reason })
            if (!res.ok) throw new Error(res.error ?? "Failed to add panelist")

            const rr = await apiGet<{ panelists: DbPanelist[] }>(
                `/api/schedule?resource=panelists&scheduleId=${encodeURIComponent(schedule.id)}`
            )
            if (!rr.ok) throw new Error(rr.error ?? "Failed to refresh panelists")

            setPanelists(Array.isArray((rr as any).panelists) ? (rr as any).panelists : [])
            setPanelAddStaffId("")
            toast.success("Panelist added")
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to add panelist")
        } finally {
            setPanelAdding(false)
        }
    }

    async function removePanelist(staffId: string) {
        if (!schedule) return

        const reason = safeText(panelReason, "")
        if (!reason) {
            toast.error("Reason is required for admin overrides.")
            return
        }

        setPanelBusyId(staffId)
        try {
            const res = await apiDelete(
                `/api/schedule?resource=panelists&scheduleId=${encodeURIComponent(schedule.id)}&staffId=${encodeURIComponent(
                    staffId
                )}&reason=${encodeURIComponent(reason)}`
            )
            if (!res.ok) throw new Error(res.error ?? "Failed to remove panelist")

            setPanelists((prev) => prev.filter((p) => p.staffId !== staffId))
            toast.success("Panelist removed")
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to remove panelist")
        } finally {
            setPanelBusyId("")
        }
    }

    const createdByUser = schedule?.createdBy ? usersById.get(schedule.createdBy) : null

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="icon" onClick={() => router.push("/dashboard/admin/schedules")}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>

                        <div>
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5" />
                                <h1 className="text-xl font-semibold">Schedule Details</h1>
                                {schedule ? statusBadge(schedule.status) : null}
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Admin may override schedule details and panel assignments (audit-backed).
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={refresh} disabled={loading || refreshing}>
                            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Refresh
                        </Button>

                        <Button variant="outline" onClick={() => setOpenEdit(true)} disabled={!schedule}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                        </Button>

                        <Button variant="outline" onClick={openPanelists} disabled={!schedule}>
                            <Users className="mr-2 h-4 w-4" />
                            Panelists
                        </Button>

                        <Button
                            variant="destructive"
                            onClick={() => {
                                setDeleteReason("")
                                setOpenDelete(true)
                            }}
                            disabled={!schedule}
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-28 w-full" />
                        <Skeleton className="h-40 w-full" />
                    </div>
                ) : !schedule ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Schedule not found</CardTitle>
                            <CardDescription>This schedule may have been deleted or you don’t have access.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button onClick={() => router.push("/dashboard/admin/schedules")}>Go back</Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <Card className="lg:col-span-2">
                            <CardHeader className="space-y-1">
                                <CardTitle className="flex items-center gap-2">
                                    <Calendar className="h-5 w-5" />
                                    Overview
                                </CardTitle>
                                <CardDescription>Defense schedule information.</CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <div className="rounded-md border p-4">
                                    <div className="text-sm text-muted-foreground">Group</div>
                                    <div className="mt-1 text-lg font-semibold">{safeText(schedule.groupTitle, "—")}</div>
                                    <div className="mt-1 text-sm text-muted-foreground">
                                        {[safeText(schedule.program, ""), safeText(schedule.term, "")].filter(Boolean).join(" · ") || "—"}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                    <div className="rounded-md border p-4">
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Calendar className="h-4 w-4" />
                                            Date
                                        </div>
                                        <div className="mt-1 font-medium">{fmtDate(schedule.scheduledAt) || "—"}</div>
                                    </div>

                                    <div className="rounded-md border p-4">
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Clock className="h-4 w-4" />
                                            Time
                                        </div>
                                        <div className="mt-1 font-medium">{fmtTime(schedule.scheduledAt) || "—"}</div>
                                    </div>

                                    <div className="rounded-md border p-4">
                                        <div className="text-sm text-muted-foreground">Room</div>
                                        <div className="mt-1 font-medium">{safeText(schedule.room, "—")}</div>
                                    </div>
                                </div>

                                <Separator />

                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div className="rounded-md border p-4">
                                        <div className="text-sm text-muted-foreground">Created by</div>
                                        <div className="mt-1 text-sm">{safeText(userLabel(createdByUser), "—")}</div>
                                    </div>
                                    <div className="rounded-md border p-4">
                                        <div className="text-sm text-muted-foreground">Updated</div>
                                        <div className="mt-1 text-sm">{fmtDateTime(schedule.updatedAt) || "—"}</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="space-y-1">
                                <CardTitle className="flex items-center gap-2">
                                    <Users className="h-5 w-5" />
                                    Panelists
                                </CardTitle>
                                <CardDescription>Assigned staff evaluators.</CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-3">
                                {panelists.length === 0 ? (
                                    <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">
                                        No panelists assigned yet.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {panelists.map((p) => (
                                            <div key={p.staffId} className={cn("rounded-md border p-3")}>
                                                <div className="truncate text-sm font-medium">
                                                    {safeText(p.staffName, safeText(p.staffEmail, "Staff"))}
                                                </div>
                                                {p.staffEmail ? (
                                                    <div className="truncate text-xs text-muted-foreground">{p.staffEmail}</div>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <Button className="w-full" variant="outline" onClick={openPanelists}>
                                    <Users className="mr-2 h-4 w-4" />
                                    Manage panelists
                                </Button>

                                <Button className="w-full" asChild variant="outline">
                                    <Link href={`/dashboard/admin/evaluation?scheduleId=${encodeURIComponent(schedule.id)}`}>
                                        <Eye className="mr-2 h-4 w-4" />
                                        View evaluations
                                    </Link>
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Delete schedule (AlertDialog) */}
                <AlertDialog
                    open={openDelete}
                    onOpenChange={(v) => {
                        if (!v && deleting) return
                        setOpenDelete(v)
                        if (!v) setDeleteReason("")
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete this schedule?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. The schedule and its panel assignments will be removed.
                            </AlertDialogDescription>
                        </AlertDialogHeader>

                        <div className="space-y-4">
                            {schedule ? (
                                <div className="rounded-md border p-3 text-sm">
                                    <div className="font-medium">{safeText(schedule.groupTitle, "Group")}</div>
                                    <div className="text-muted-foreground">
                                        {fmtDateTime(schedule.scheduledAt) || "—"} · {safeText(schedule.room, "No room")}
                                    </div>
                                </div>
                            ) : null}

                            <div className="space-y-2">
                                <Label>Reason (required)</Label>
                                <Textarea
                                    value={deleteReason}
                                    onChange={(e) => setDeleteReason(e.target.value)}
                                    placeholder="Why are you deleting this schedule?"
                                />
                            </div>
                        </div>

                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                            <AlertDialogAction asChild>
                                <Button
                                    variant="destructive"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        void confirmDeleteSchedule()
                                    }}
                                    disabled={deleting || !safeText(deleteReason, "")}
                                >
                                    {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Delete
                                </Button>
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Edit schedule */}
                <Dialog
                    open={openEdit}
                    onOpenChange={(v) => {
                        if (v) setOpenEdit(true)
                        else {
                            setOpenEdit(false)
                            setEdReason("")
                        }
                    }}
                >
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Edit schedule</DialogTitle>
                            <DialogDescription>Admin override: changes are logged to audit trail (reason required).</DialogDescription>
                        </DialogHeader>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Date</Label>
                                <Input type="date" value={edDate} onChange={(e) => setEdDate(e.target.value)} />
                            </div>

                            <div className="space-y-2">
                                <Label>Time</Label>
                                <Input type="time" value={edTime} onChange={(e) => setEdTime(e.target.value)} />
                            </div>

                            <div className="space-y-2">
                                <Label>Room</Label>
                                <Input value={edRoom} onChange={(e) => setEdRoom(e.target.value)} placeholder="e.g., ICT Lab 1" />
                            </div>

                            <div className="space-y-2">
                                <Label>Status</Label>
                                <Select value={edStatus || "scheduled"} onValueChange={setEdStatus}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="scheduled">scheduled</SelectItem>
                                        <SelectItem value="ongoing">ongoing</SelectItem>
                                        <SelectItem value="completed">completed</SelectItem>
                                        <SelectItem value="cancelled">cancelled</SelectItem>
                                        <SelectItem value="archived">archived</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <Label>Reason (required)</Label>
                                <Textarea
                                    value={edReason}
                                    onChange={(e) => setEdReason(e.target.value)}
                                    placeholder="Why are you changing this schedule?"
                                />
                            </div>
                        </div>

                        <DialogFooter className="gap-2">
                            <Button variant="outline" onClick={() => setOpenEdit(false)} disabled={saving}>
                                Cancel
                            </Button>
                            <Button onClick={saveEdits} disabled={saving}>
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Save
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Panelists manager */}
                <Dialog
                    open={openPanel}
                    onOpenChange={(v) => {
                        if (v) setOpenPanel(true)
                        else {
                            setOpenPanel(false)
                            setPanelAddStaffId("")
                            setPanelReason("")
                        }
                    }}
                >
                    <DialogContent className="max-w-2xl">
                        <DialogHeader className="space-y-1">
                            <DialogTitle className="flex items-center justify-between gap-3">
                                <span>Panelists</span>
                                <Button variant="ghost" size="icon" onClick={() => setOpenPanel(false)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </DialogTitle>
                            <DialogDescription>Admin override: changes are logged (reason required).</DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Reason (required)</Label>
                                <Textarea
                                    value={panelReason}
                                    onChange={(e) => setPanelReason(e.target.value)}
                                    placeholder="Why are you changing panel assignments?"
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Add panelist (Staff)</Label>
                                    <Select
                                        value={panelAddStaffId || CLEAR_SELECT_VALUE}
                                        onValueChange={(v) => setPanelAddStaffId(v === CLEAR_SELECT_VALUE ? "" : v)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select staff" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={CLEAR_SELECT_VALUE}>Select staff</SelectItem>
                                            {staffUsers.map((u) => (
                                                <SelectItem key={u.id} value={u.id}>
                                                    {userLabel(u)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-end">
                                    <Button className="w-full" onClick={addPanelist} disabled={panelAdding || panelLoading}>
                                        {panelAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                                        Add
                                    </Button>
                                </div>
                            </div>

                            <Separator />

                            {panelLoading ? (
                                <div className="space-y-2">
                                    <Skeleton className="h-10 w-full" />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                            ) : panelists.length === 0 ? (
                                <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">No panelists assigned yet.</div>
                            ) : (
                                <div className="space-y-2">
                                    {panelists.map((p) => (
                                        <div key={p.staffId} className={cn("flex items-center gap-3 rounded-md border px-3 py-2")}>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium">
                                                    {safeText(p.staffName, safeText(p.staffEmail, "Staff"))}
                                                </div>
                                                {p.staffEmail ? (
                                                    <div className="truncate text-xs text-muted-foreground">{p.staffEmail}</div>
                                                ) : null}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => removePanelist(p.staffId)}
                                                disabled={panelBusyId === p.staffId}
                                            >
                                                {panelBusyId === p.staffId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                Remove
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setOpenPanel(false)}>
                                Close
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </DashboardLayout>
    )
}
