/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    ArrowLeft,
    Calendar,
    Clock,
    Eye,
    Filter,
    Loader2,
    Pencil,
    Plus,
    RefreshCw,
    Search,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type ApiOk<T> = { ok: true } & T
type ApiErr = { ok: false; error?: string; message?: string }

type DbUser = {
    id: string
    name: string | null
    email: string
    role?: string | null
    status?: "active" | "disabled" | string | null
}

type DbGroup = {
    id: string
    title?: string | null
    name?: string | null
    program?: string | null
    term?: string | null
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

function groupLabel(g?: DbGroup | null, fallback = "") {
    if (!g) return fallback
    return safeText(g.title, safeText(g.name, fallback))
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

// Select.Item cannot use empty string values.
const CLEAR_SELECT_VALUE = "__clear__"

async function apiGet<T>(url: string): Promise<ApiOk<T> | ApiErr> {
    const res = await fetch(url, { method: "GET" })
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

async function apiDelete<T>(url: string): Promise<ApiOk<T> | ApiErr> {
    const res = await fetch(url, { method: "DELETE" })
    const data = (await res.json().catch(() => ({}))) as any
    if (!res.ok) return { ok: false, error: data?.error ?? data?.message ?? `HTTP ${res.status}` }
    return data
}

function buildScheduledAtISO(dateStr: string, timeStr: string) {
    // local time -> ISO
    const d = safeText(dateStr, "")
    const t = safeText(timeStr, "")
    if (!d || !t) return ""
    const dt = new Date(`${d}T${t}:00`)
    if (Number.isNaN(dt.getTime())) return ""
    return dt.toISOString()
}

export default function AdminSchedulesPage() {
    const router = useRouter()
    const { user, loading: authLoading } = useAuth()

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)

    const [schedules, setSchedules] = React.useState<DbSchedule[]>([])
    const [users, setUsers] = React.useState<DbUser[]>([])
    const [groups, setGroups] = React.useState<DbGroup[]>([])

    // filters (client-side)
    const [q, setQ] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<string>("")
    const [groupFilter, setGroupFilter] = React.useState<string>("")
    const [fromDate, setFromDate] = React.useState<string>("")
    const [toDate, setToDate] = React.useState<string>("")

    // upsert modal
    const [openUpsert, setOpenUpsert] = React.useState(false)
    const [saving, setSaving] = React.useState(false)
    const [editing, setEditing] = React.useState<DbSchedule | null>(null)

    // editor fields
    const [edGroupId, setEdGroupId] = React.useState<string>("")
    const [edDate, setEdDate] = React.useState<string>("")
    const [edTime, setEdTime] = React.useState<string>("")
    const [edRoom, setEdRoom] = React.useState<string>("")
    const [edStatus, setEdStatus] = React.useState<string>("scheduled")

    // panelists modal
    const [openPanel, setOpenPanel] = React.useState(false)
    const [panelSchedule, setPanelSchedule] = React.useState<DbSchedule | null>(null)
    const [panelLoading, setPanelLoading] = React.useState(false)
    const [panelists, setPanelists] = React.useState<DbPanelist[]>([])
    const [panelAddStaffId, setPanelAddStaffId] = React.useState<string>("")
    const [panelBusyId, setPanelBusyId] = React.useState<string>("") // staffId while removing
    const [panelAdding, setPanelAdding] = React.useState(false)

    const usersById = React.useMemo(() => {
        const m = new Map<string, DbUser>()
        for (const u of users) m.set(u.id, u)
        return m
    }, [users])

    const groupsById = React.useMemo(() => {
        const m = new Map<string, DbGroup>()
        for (const g of groups) m.set(g.id, g)
        return m
    }, [groups])

    const staffUsers = React.useMemo(() => {
        return users
            .filter((u) => normalizeRole(u.role) === "staff" && String(u.status ?? "active").toLowerCase() !== "disabled")
            .sort((a, b) => userLabel(a).localeCompare(userLabel(b)))
    }, [users])

    const groupOptions = React.useMemo(() => {
        return groups
            .slice()
            .sort((a, b) => groupLabel(a).localeCompare(groupLabel(b)))
    }, [groups])

    const distinctStatuses = React.useMemo(() => {
        const set = new Set<string>()
        for (const sc of schedules) {
            const s = safeText(sc.status, "")
            if (s) set.add(s)
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b))
    }, [schedules])

    const filtered = React.useMemo(() => {
        const qq = safeText(q, "").toLowerCase()

        return schedules.filter((sc) => {
            if (statusFilter && safeText(sc.status, "").toLowerCase() !== statusFilter.toLowerCase()) return false
            if (groupFilter && safeText(sc.groupId, "") !== groupFilter) return false

            if (fromDate) {
                const fromIso = new Date(`${fromDate}T00:00:00`)
                const scDt = new Date(sc.scheduledAt)
                if (!Number.isNaN(fromIso.getTime()) && !Number.isNaN(scDt.getTime()) && scDt < fromIso) return false
            }
            if (toDate) {
                const toIsoExclusive = new Date(`${toDate}T00:00:00`)
                toIsoExclusive.setDate(toIsoExclusive.getDate() + 1)
                const scDt = new Date(sc.scheduledAt)
                if (!Number.isNaN(toIsoExclusive.getTime()) && !Number.isNaN(scDt.getTime()) && scDt >= toIsoExclusive)
                    return false
            }

            if (!qq) return true

            const g = groupsById.get(sc.groupId)
            const gName = safeText(sc.groupTitle, groupLabel(g, ""))
            const createdByName = sc.createdBy ? userLabel(usersById.get(sc.createdBy)) : ""
            const base = [
                gName,
                safeText(sc.room, ""),
                safeText(sc.status, ""),
                safeText(sc.program, ""),
                safeText(sc.term, ""),
                fmtDateTime(sc.scheduledAt),
                createdByName,
            ]
                .filter(Boolean)
                .join(" · ")
                .toLowerCase()

            return base.includes(qq)
        })
    }, [schedules, q, statusFilter, groupFilter, fromDate, toDate, groupsById, usersById])

    function resetEditor() {
        setEditing(null)
        setEdGroupId("")
        setEdDate("")
        setEdTime("")
        setEdRoom("")
        setEdStatus("scheduled")
    }

    function openCreate() {
        resetEditor()
        setOpenUpsert(true)
    }

    function openEdit(sc: DbSchedule) {
        setEditing(sc)
        setEdGroupId(safeText(sc.groupId, ""))
        setEdDate(toLocalDateInput(sc.scheduledAt))
        setEdTime(toLocalTimeInput(sc.scheduledAt))
        setEdRoom(safeText(sc.room, ""))
        setEdStatus(safeText(sc.status, "scheduled") || "scheduled")
        setOpenUpsert(true)
    }

    async function loadAll() {
        setLoading(true)
        try {
            const [scRes, usRes, grRes] = await Promise.all([
                apiGet<{ schedules: DbSchedule[] }>(`/api/schedule?resource=schedules&limit=200&offset=0`),
                apiGet<{ users: DbUser[] }>("/api/admin/users?limit=500&offset=0"),
                apiGet<{ groups: DbGroup[] }>("/api/groups?resource=all"),
            ])

            if (!scRes.ok) throw new Error(scRes.error ?? "Failed to load schedules")
            if (!usRes.ok) throw new Error(usRes.error ?? "Failed to load users")
            if (!grRes.ok) throw new Error(grRes.error ?? "Failed to load groups")

            setSchedules(Array.isArray((scRes as any).schedules) ? (scRes as any).schedules : [])
            setUsers(Array.isArray((usRes as any).users) ? (usRes as any).users : [])
            setGroups(Array.isArray((grRes as any).groups) ? (grRes as any).groups : [])
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to load schedules")
        } finally {
            setLoading(false)
        }
    }

    async function refresh() {
        setRefreshing(true)
        try {
            await loadAll()
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
        loadAll()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, user?.id])

    async function handleSave() {
        const groupId = safeText(edGroupId, "")
        if (!editing && !groupId) {
            toast.error("Please select a group.")
            return
        }

        const scheduledAt = buildScheduledAtISO(edDate, edTime)
        if (!scheduledAt) {
            toast.error("Please set a valid date and time.")
            return
        }

        setSaving(true)
        try {
            if (editing?.id) {
                const res = await apiPatch(`/api/schedule?resource=schedules&id=${encodeURIComponent(editing.id)}`, {
                    scheduledAt,
                    room: safeText(edRoom, "") || null,
                    status: safeText(edStatus, "scheduled") || "scheduled",
                })
                if (!res.ok) throw new Error(res.error ?? "Failed to update schedule")
                toast.success("Schedule updated")
            } else {
                const res = await apiPost(`/api/schedule?resource=schedules`, {
                    groupId,
                    scheduledAt,
                    room: safeText(edRoom, "") || null,
                    status: safeText(edStatus, "scheduled") || "scheduled",
                })
                if (!res.ok) throw new Error(res.error ?? "Failed to create schedule")
                toast.success("Schedule created")
            }

            setOpenUpsert(false)
            resetEditor()
            await loadAll()
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to save schedule")
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete(sc: DbSchedule) {
        const ok = window.confirm("Delete this schedule?")
        if (!ok) return
        try {
            const res = await apiDelete(`/api/schedule?resource=schedules&id=${encodeURIComponent(sc.id)}`)
            if (!res.ok) throw new Error(res.error ?? "Failed to delete schedule")
            toast.success("Schedule deleted")
            await loadAll()
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to delete schedule")
        }
    }

    async function openPanelists(sc: DbSchedule) {
        setPanelSchedule(sc)
        setOpenPanel(true)
        setPanelAddStaffId("")
        setPanelists([])
        setPanelLoading(true)
        try {
            const res = await apiGet<{ panelists: DbPanelist[] }>(
                `/api/schedule?resource=panelists&scheduleId=${encodeURIComponent(sc.id)}`
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
        const sc = panelSchedule
        if (!sc) return
        const staffId = safeText(panelAddStaffId, "")
        if (!staffId || staffId === CLEAR_SELECT_VALUE) {
            toast.error("Please select a staff panelist to add.")
            return
        }

        setPanelAdding(true)
        try {
            const res = await apiPost(`/api/schedule?resource=panelists`, { scheduleId: sc.id, staffId })
            if (!res.ok) throw new Error(res.error ?? "Failed to add panelist")

            // refresh list
            const rr = await apiGet<{ panelists: DbPanelist[] }>(
                `/api/schedule?resource=panelists&scheduleId=${encodeURIComponent(sc.id)}`
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
        const sc = panelSchedule
        if (!sc) return

        setPanelBusyId(staffId)
        try {
            const res = await apiDelete(
                `/api/schedule?resource=panelists&scheduleId=${encodeURIComponent(sc.id)}&staffId=${encodeURIComponent(staffId)}`
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

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="icon" onClick={() => router.push("/dashboard/admin")}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5" />
                                <h1 className="text-xl font-semibold">Schedules</h1>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Create schedules, set date/time, manage room/status, and assign panelists.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={refresh} disabled={loading || refreshing}>
                            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Refresh
                        </Button>

                        <Button onClick={openCreate}>
                            <Plus className="mr-2 h-4 w-4" />
                            New schedule
                        </Button>
                    </div>
                </div>

                <Card>
                    <CardHeader className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            Schedule list
                        </CardTitle>
                        <CardDescription>Search and filter schedules by group, status, and date range.</CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
                            <div className="space-y-2 lg:col-span-2">
                                <Label className="text-xs text-muted-foreground">Search</Label>
                                <div className="relative">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        className="pl-8"
                                        placeholder="group, room, status, program..."
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Status</Label>
                                <Select
                                    value={statusFilter || CLEAR_SELECT_VALUE}
                                    onValueChange={(v) => setStatusFilter(v === CLEAR_SELECT_VALUE ? "" : v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="All statuses" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={CLEAR_SELECT_VALUE}>All statuses</SelectItem>
                                        {distinctStatuses.map((s) => (
                                            <SelectItem key={s} value={s}>
                                                {s}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Group</Label>
                                <Select
                                    value={groupFilter || CLEAR_SELECT_VALUE}
                                    onValueChange={(v) => setGroupFilter(v === CLEAR_SELECT_VALUE ? "" : v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="All groups" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={CLEAR_SELECT_VALUE}>All groups</SelectItem>
                                        {groupOptions.map((g) => (
                                            <SelectItem key={g.id} value={g.id}>
                                                {groupLabel(g, "Group")}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">From</Label>
                                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">To</Label>
                                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                            </div>

                            <div className="flex items-end md:col-span-2 lg:col-span-6">
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => {
                                        setQ("")
                                        setStatusFilter("")
                                        setGroupFilter("")
                                        setFromDate("")
                                        setToDate("")
                                    }}
                                >
                                    <Filter className="mr-2 h-4 w-4" />
                                    Clear filters
                                </Button>
                            </div>
                        </div>

                        <Separator />

                        {loading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : (
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[320px]">Group</TableHead>
                                            <TableHead className="w-35">Status</TableHead>
                                            <TableHead className="w-45">Date</TableHead>
                                            <TableHead className="w-40">Time</TableHead>
                                            <TableHead>Room</TableHead>
                                            <TableHead className="w-60">Panel</TableHead>
                                            <TableHead className="w-60">Updated</TableHead>
                                            <TableHead className="w-60 text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>

                                    <TableBody>
                                        {filtered.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                                                    No schedules found.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filtered.map((sc) => {
                                                const g = groupsById.get(sc.groupId)
                                                const gName = safeText(sc.groupTitle, groupLabel(g, "Group"))
                                                const sub = [safeText(sc.program, ""), safeText(sc.term, "")]
                                                    .filter(Boolean)
                                                    .join(" · ")

                                                return (
                                                    <TableRow key={sc.id}>
                                                        <TableCell className="align-top">
                                                            <div className="space-y-1">
                                                                <div className="font-medium">{gName}</div>
                                                                {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
                                                            </div>
                                                        </TableCell>

                                                        <TableCell className="align-top">{statusBadge(sc.status)}</TableCell>

                                                        <TableCell className="align-top">
                                                            <div className="flex items-center gap-2">
                                                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                                                <span>{fmtDate(sc.scheduledAt) || "—"}</span>
                                                            </div>
                                                        </TableCell>

                                                        <TableCell className="align-top">
                                                            <div className="flex items-center gap-2">
                                                                <Clock className="h-4 w-4 text-muted-foreground" />
                                                                <span>{fmtTime(sc.scheduledAt) || "—"}</span>
                                                            </div>
                                                        </TableCell>

                                                        <TableCell className="align-top">{safeText(sc.room, "—")}</TableCell>

                                                        <TableCell className="align-top">
                                                            <Button size="sm" variant="outline" onClick={() => openPanelists(sc)}>
                                                                <Users className="mr-2 h-4 w-4" />
                                                                Manage
                                                            </Button>
                                                        </TableCell>

                                                        <TableCell className="align-top">{fmtDateTime(sc.updatedAt) || "—"}</TableCell>

                                                        <TableCell className="align-top text-right">
                                                            <div className="flex justify-end gap-2">
                                                                <TooltipProvider>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Button asChild size="sm" variant="outline">
                                                                                <Link href={`/dashboard/admin/schedules/${sc.id}`}>
                                                                                    <Eye className="mr-2 h-4 w-4" />
                                                                                    View
                                                                                </Link>
                                                                            </Button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent>Open schedule details</TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>

                                                                <Button size="sm" variant="outline" onClick={() => openEdit(sc)}>
                                                                    <Pencil className="mr-2 h-4 w-4" />
                                                                    Edit
                                                                </Button>

                                                                <Button size="sm" variant="destructive" onClick={() => handleDelete(sc)}>
                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                    Delete
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
                        )}
                    </CardContent>
                </Card>

                {/* Create/Edit Schedule */}
                <Dialog
                    open={openUpsert}
                    onOpenChange={(v) => {
                        if (v) setOpenUpsert(true)
                        else {
                            setOpenUpsert(false)
                            resetEditor()
                        }
                    }}
                >
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{editing ? "Edit schedule" : "Create schedule"}</DialogTitle>
                            <DialogDescription>
                                Set date/time, room, and status. Group is selected on create.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                                <Label>Group</Label>
                                <Select
                                    value={edGroupId || CLEAR_SELECT_VALUE}
                                    onValueChange={(v) => setEdGroupId(v === CLEAR_SELECT_VALUE ? "" : v)}
                                >
                                    <SelectTrigger disabled={Boolean(editing)}>
                                        <SelectValue placeholder="Select group" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={CLEAR_SELECT_VALUE}>Select group</SelectItem>
                                        {groupOptions.map((g) => (
                                            <SelectItem key={g.id} value={g.id}>
                                                {groupLabel(g, "Group")}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {editing ? (
                                    <p className="text-xs text-muted-foreground">Group cannot be changed here.</p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">Required</p>
                                )}
                            </div>

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
                        </div>

                        <DialogFooter className="gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setOpenUpsert(false)
                                    resetEditor()
                                }}
                                disabled={saving}
                            >
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={saving}>
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Save
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Panelists Manager */}
                <Dialog
                    open={openPanel}
                    onOpenChange={(v) => {
                        if (v) setOpenPanel(true)
                        else {
                            setOpenPanel(false)
                            setPanelSchedule(null)
                            setPanelists([])
                            setPanelAddStaffId("")
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
                            <DialogDescription>
                                Assign staff panelists for this schedule. Only Staff accounts can be added as panelists.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div className="rounded-md border p-3">
                                <div className="text-sm font-medium">
                                    {panelSchedule
                                        ? safeText(panelSchedule.groupTitle, groupLabel(groupsById.get(panelSchedule.groupId), "Group"))
                                        : "Schedule"}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                    {panelSchedule ? fmtDateTime(panelSchedule.scheduledAt) : ""}
                                </div>
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
                                <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
                                    No panelists assigned yet.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {panelists.map((p) => (
                                        <div
                                            key={p.staffId}
                                            className={cn("flex items-center gap-3 rounded-md border px-3 py-2")}
                                        >
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
                                                {panelBusyId === p.staffId ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                ) : null}
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
