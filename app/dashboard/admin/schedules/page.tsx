/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { Calendar, RefreshCw, Search, Users, Save, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

type DefenseSchedule = {
    id: string
    groupId: string
    scheduledAt: string
    room: string | null
    status: string
    createdBy: string | null
    createdAt: string
    updatedAt: string
}

type SchedulePanelist = {
    scheduleId: string
    staffId: string
    staffName: string
    staffEmail: string
}

type UserPublic = {
    id: string
    name: string
    email: string
    role?: string
}

type ThesisGroup = {
    id: string
    title: string
}

function fmtDate(v: string | null | undefined) {
    if (!v) return "—"
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return v
    return d.toLocaleString()
}

function toDatetimeLocalValue(iso: string | null | undefined) {
    if (!iso) return ""
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ""
    const pad = (n: number) => String(n).padStart(2, "0")
    const yyyy = d.getFullYear()
    const mm = pad(d.getMonth() + 1)
    const dd = pad(d.getDate())
    const hh = pad(d.getHours())
    const mi = pad(d.getMinutes())
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

function fromDatetimeLocalValue(v: string) {
    const s = String(v ?? "").trim()
    if (!s) return null
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString()
}

function buildUrl(path: string, params: Record<string, string | undefined | null>) {
    const sp = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
        const val = String(v ?? "").trim()
        if (val) sp.set(k, val)
    })
    const qs = sp.toString()
    return qs ? `${path}?${qs}` : path
}

async function apiGet<T>(path: string, params: Record<string, string | undefined | null>) {
    const url = buildUrl(path, params)
    const res = await fetch(url, { method: "GET" })
    const json = await res.json().catch(() => ({} as any))

    if (!res.ok || !json?.ok) throw new Error(json?.message || "Request failed")
    return json as T
}

async function apiPost<T>(path: string, params: Record<string, string | undefined | null>, body: any) {
    const url = buildUrl(path, params)
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    })
    const json = await res.json().catch(() => ({} as any))
    if (!res.ok || !json?.ok) throw new Error(json?.message || "Request failed")
    return json as T
}

async function apiPatch<T>(path: string, params: Record<string, string | undefined | null>, body: any) {
    const url = buildUrl(path, params)
    const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    })
    const json = await res.json().catch(() => ({} as any))
    if (!res.ok || !json?.ok) throw new Error(json?.message || "Request failed")
    return json as T
}

async function apiDelete<T>(path: string, params: Record<string, string | undefined | null>) {
    const url = buildUrl(path, params)
    const res = await fetch(url, { method: "DELETE" })
    const json = await res.json().catch(() => ({} as any))
    if (!res.ok || !json?.ok) throw new Error(json?.message || "Request failed")
    return json as T
}

function uniq(ids: Array<string | null | undefined>) {
    return Array.from(new Set(ids.filter(Boolean).map((x) => String(x))))
}

export default function AdminSchedulesPage() {
    const { loading, user } = useAuth()
    const isAdmin = String(user?.role ?? "").toLowerCase() === "admin"

    const [showIds, setShowIds] = React.useState(false)

    // Filters
    const [q, setQ] = React.useState("")
    const [groupId, setGroupId] = React.useState("")
    const [status, setStatus] = React.useState("")
    const [fromLocal, setFromLocal] = React.useState("")
    const [toLocal, setToLocal] = React.useState("")

    // Data
    const [listLoading, setListLoading] = React.useState(false)
    const [schedules, setSchedules] = React.useState<DefenseSchedule[]>([])
    const [selectedId, setSelectedId] = React.useState<string | null>(null)

    // Lookups (names/titles)
    const [userMap, setUserMap] = React.useState<Record<string, UserPublic>>({})
    const [groupMap, setGroupMap] = React.useState<Record<string, ThesisGroup>>({})
    const inFlightUsers = React.useRef(new Set<string>())
    const inFlightGroups = React.useRef(new Set<string>())

    // Options
    const [groupOptions, setGroupOptions] = React.useState<ThesisGroup[]>([])
    const [staffOptions, setStaffOptions] = React.useState<UserPublic[]>([])
    const [optionsLoading, setOptionsLoading] = React.useState(false)

    // Panelists
    const [panelistsLoading, setPanelistsLoading] = React.useState(false)
    const [panelists, setPanelists] = React.useState<SchedulePanelist[]>([])
    const [panelistActionLoading, setPanelistActionLoading] = React.useState(false)

    // Edit form
    const selected = React.useMemo(() => schedules.find((s) => s.id === selectedId) ?? null, [schedules, selectedId])
    const [editScheduledAtLocal, setEditScheduledAtLocal] = React.useState("")
    const [editRoom, setEditRoom] = React.useState("")
    const [editStatus, setEditStatus] = React.useState("")
    const [saveLoading, setSaveLoading] = React.useState(false)
    const [deleteLoading, setDeleteLoading] = React.useState(false)

    // Add panelist (by dropdown)
    const [addStaffId, setAddStaffId] = React.useState("")

    // Bulk panelist selection
    const [bulkQuery, setBulkQuery] = React.useState("")
    const [bulkStaffIds, setBulkStaffIds] = React.useState<string[]>([])

    const ensureUsers = React.useCallback(
        async (ids: string[]) => {
            const missing = ids.filter((id) => id && !userMap[id] && !inFlightUsers.current.has(id))
            if (!missing.length) return

            missing.forEach((id) => inFlightUsers.current.add(id))
            try {
                const results = await Promise.all(
                    missing.map(async (id) => {
                        try {
                            const data = await apiGet<{ ok: true; user: UserPublic }>("/api/profiles", {
                                resource: "users",
                                id,
                            })
                            return data.user
                        } catch {
                            return null
                        }
                    })
                )

                setUserMap((prev) => {
                    const next = { ...prev }
                    for (const u of results) {
                        if (u?.id) next[u.id] = u
                    }
                    return next
                })
            } finally {
                missing.forEach((id) => inFlightUsers.current.delete(id))
            }
        },
        [userMap]
    )

    const ensureGroups = React.useCallback(
        async (ids: string[]) => {
            const missing = ids.filter((id) => id && !groupMap[id] && !inFlightGroups.current.has(id))
            if (!missing.length) return

            missing.forEach((id) => inFlightGroups.current.add(id))
            try {
                const results = await Promise.all(
                    missing.map(async (id) => {
                        try {
                            const data = await apiGet<{ ok: true; group: ThesisGroup }>("/api/thesis", {
                                resource: "groups",
                                id,
                            })
                            return data.group
                        } catch {
                            return null
                        }
                    })
                )

                setGroupMap((prev) => {
                    const next = { ...prev }
                    for (const g of results) {
                        if (g?.id) next[g.id] = g
                    }
                    return next
                })
            } finally {
                missing.forEach((id) => inFlightGroups.current.delete(id))
            }
        },
        [groupMap]
    )

    const loadOptions = React.useCallback(async () => {
        if (!isAdmin) return
        setOptionsLoading(true)
        try {
            const [groupsRes, staffRes] = await Promise.all([
                apiGet<{ ok: true; groups: ThesisGroup[]; total: number }>("/api/thesis", {
                    resource: "groups",
                    limit: "200",
                    offset: "0",
                }),
                apiGet<{ ok: true; users: UserPublic[]; total: number }>("/api/profiles", {
                    resource: "users",
                    role: "staff",
                    limit: "200",
                    offset: "0",
                }),
            ])

            const groups = (groupsRes.groups ?? []).slice().sort((a, b) => (a.title || "").localeCompare(b.title || ""))
            setGroupOptions(groups)
            setGroupMap((prev) => {
                const next = { ...prev }
                for (const g of groups) next[g.id] = g
                return next
            })

            const staff = (staffRes.users ?? []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""))
            setStaffOptions(staff)
            setUserMap((prev) => {
                const next = { ...prev }
                for (const u of staff) next[u.id] = u
                return next
            })
        } catch (e: any) {
            toast.error("Failed to load dropdown options", { description: e?.message || "Please try again." })
        } finally {
            setOptionsLoading(false)
        }
    }, [isAdmin])

    const userLabel = React.useCallback(
        (id: string | null | undefined) => {
            const key = String(id ?? "")
            if (!key) return "—"
            const u = userMap[key]
            return u?.name ? u.name : "Unknown user"
        },
        [userMap]
    )

    const groupLabel = React.useCallback(
        (id: string | null | undefined) => {
            const key = String(id ?? "")
            if (!key) return "—"
            const g = groupMap[key]
            return g?.title ? g.title : "Unknown group"
        },
        [groupMap]
    )

    const loadSchedules = React.useCallback(async () => {
        setListLoading(true)
        try {
            const fromIso = fromDatetimeLocalValue(fromLocal)
            const toIso = fromDatetimeLocalValue(toLocal)

            const data = await apiGet<{ ok: true; schedules: DefenseSchedule[]; total: number }>(
                "/api/schedule",
                {
                    resource: "schedules",
                    q: q || null,
                    groupId: groupId || null,
                    status: status || null,
                    from: fromIso || null,
                    to: toIso || null,
                    limit: "50",
                    offset: "0",
                }
            )
            const items = data.schedules ?? []
            setSchedules(items)

            const groupIds = uniq(items.map((s) => s.groupId))
            const createdByIds = uniq(items.map((s) => s.createdBy))
            await Promise.all([ensureGroups(groupIds), ensureUsers(createdByIds)])
        } catch (e: any) {
            toast.error("Failed to load schedules", { description: e?.message || "Please try again." })
        } finally {
            setListLoading(false)
        }
    }, [q, groupId, status, fromLocal, toLocal, ensureGroups, ensureUsers])

    const loadPanelists = React.useCallback(async (scheduleId: string) => {
        setPanelistsLoading(true)
        try {
            const data = await apiGet<{ ok: true; panelists: SchedulePanelist[] }>(
                "/api/schedule",
                { resource: "panelists", scheduleId }
            )
            const list = data.panelists ?? []
            setPanelists(list)
            setBulkStaffIds(list.map((p) => p.staffId))
        } catch (e: any) {
            toast.error("Failed to load panelists", { description: e?.message || "Please try again." })
        } finally {
            setPanelistsLoading(false)
        }
    }, [])

    React.useEffect(() => {
        if (!isAdmin) return
        void loadOptions()
        void loadSchedules()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin])

    React.useEffect(() => {
        if (!selected) return
        setEditScheduledAtLocal(toDatetimeLocalValue(selected.scheduledAt))
        setEditRoom(selected.room ?? "")
        setEditStatus(selected.status ?? "")
        void loadPanelists(selected.id)

        void ensureGroups(uniq([selected.groupId]))
        void ensureUsers(uniq([selected.createdBy]))
    }, [selected, loadPanelists, ensureGroups, ensureUsers])

    const onSelect = async (id: string) => {
        setSelectedId((prev) => (prev === id ? null : id))
    }

    const onSave = async () => {
        if (!selected) return
        setSaveLoading(true)
        try {
            const scheduledAtIso = fromDatetimeLocalValue(editScheduledAtLocal)

            await apiPatch(
                "/api/schedule",
                { resource: "schedules", id: selected.id },
                {
                    id: selected.id,
                    scheduledAt: scheduledAtIso ?? selected.scheduledAt,
                    room: editRoom ? editRoom : null,
                    status: editStatus ? editStatus : selected.status,
                }
            )

            toast.success("Schedule updated")
            await loadSchedules()
            await loadPanelists(selected.id)
        } catch (e: any) {
            toast.error("Failed to update schedule", { description: e?.message || "Please try again." })
        } finally {
            setSaveLoading(false)
        }
    }

    const onDelete = async () => {
        if (!selected) return
        setDeleteLoading(true)
        try {
            await apiDelete("/api/schedule", { resource: "schedules", id: selected.id })
            toast.success("Schedule deleted")
            setSelectedId(null)
            setPanelists([])
            await loadSchedules()
        } catch (e: any) {
            toast.error("Failed to delete schedule", { description: e?.message || "Please try again." })
        } finally {
            setDeleteLoading(false)
        }
    }

    const onAddPanelist = async () => {
        if (!selected) return
        const sid = String(addStaffId ?? "").trim()
        if (!sid) return toast.error("Please select a staff member")

        setPanelistActionLoading(true)
        try {
            await apiPost("/api/schedule", { resource: "panelists" }, { scheduleId: selected.id, staffId: sid })
            toast.success("Panelist added")
            setAddStaffId("")
            await loadPanelists(selected.id)
        } catch (e: any) {
            toast.error("Failed to add panelist", { description: e?.message || "Please try again." })
        } finally {
            setPanelistActionLoading(false)
        }
    }

    const onRemovePanelist = async (staffId: string) => {
        if (!selected) return
        setPanelistActionLoading(true)
        try {
            await apiDelete("/api/schedule", { resource: "panelists", scheduleId: selected.id, staffId })
            toast.success("Panelist removed")
            await loadPanelists(selected.id)
        } catch (e: any) {
            toast.error("Failed to remove panelist", { description: e?.message || "Please try again." })
        } finally {
            setPanelistActionLoading(false)
        }
    }

    const onApplyBulkPanelists = async () => {
        if (!selected) return
        setPanelistActionLoading(true)
        try {
            await apiPatch("/api/schedule", { resource: "panelists" }, { scheduleId: selected.id, staffIds: bulkStaffIds })
            toast.success("Panelists updated")
            await loadPanelists(selected.id)
        } catch (e: any) {
            toast.error("Failed to set panelists", { description: e?.message || "Please try again." })
        } finally {
            setPanelistActionLoading(false)
        }
    }

    const filteredStaff = React.useMemo(() => {
        const qq = bulkQuery.trim().toLowerCase()
        if (!qq) return staffOptions
        return staffOptions.filter((s) => (s.name || "").toLowerCase().includes(qq) || (s.email || "").toLowerCase().includes(qq))
    }, [staffOptions, bulkQuery])

    const toggleBulk = (id: string) => {
        setBulkStaffIds((prev) => {
            const has = prev.includes(id)
            if (has) return prev.filter((x) => x !== id)
            return [...prev, id]
        })
    }

    return (
        <DashboardLayout
            title="Schedules"
            description="Search schedules, view panelists, and update schedule fields."
            mainClassName="space-y-6"
        >
            {loading ? (
                <div className="space-y-4">
                    <div className="h-8 w-52 rounded-md bg-muted/40" />
                    <div className="h-40 rounded-md bg-muted/30" />
                </div>
            ) : !isAdmin ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            Schedules
                            <Badge variant="outline">Admin</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Forbidden. This page is available to Admin only.
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => setShowIds((v) => !v)} disabled={optionsLoading}>
                            {showIds ? "Hide IDs" : "Show IDs"}
                        </Button>
                    </div>

                    <Card>
                        <CardHeader className="space-y-2">
                            <CardTitle className="flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                    <Search className="h-4 w-4" />
                                    Filters
                                </span>
                                <Button variant="outline" size="sm" onClick={loadSchedules} disabled={listLoading} className="gap-2">
                                    <RefreshCw className="h-4 w-4" />
                                    Refresh
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                                <div className="sm:col-span-2 space-y-1">
                                    <div className="text-xs font-medium text-muted-foreground">Search</div>
                                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="room / status" />
                                </div>

                                <div className="sm:col-span-2 space-y-1">
                                    <div className="text-xs font-medium text-muted-foreground">Group</div>
                                    <Select value={groupId} onValueChange={setGroupId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={optionsLoading ? "Loading…" : "All groups"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="">All groups</SelectItem>
                                            {groupOptions.map((g) => (
                                                <SelectItem key={g.id} value={g.id}>
                                                    {g.title}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="sm:col-span-2 space-y-1">
                                    <div className="text-xs font-medium text-muted-foreground">Status</div>
                                    <Input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="scheduled / completed / ..." />
                                </div>

                                <div className="sm:col-span-3 space-y-1">
                                    <div className="text-xs font-medium text-muted-foreground">From</div>
                                    <Input type="datetime-local" value={fromLocal} onChange={(e) => setFromLocal(e.target.value)} />
                                </div>

                                <div className="sm:col-span-3 space-y-1">
                                    <div className="text-xs font-medium text-muted-foreground">To</div>
                                    <Input type="datetime-local" value={toLocal} onChange={(e) => setToLocal(e.target.value)} />
                                </div>
                            </div>

                            <div className="mt-3">
                                <Button onClick={loadSchedules} disabled={listLoading} className="gap-2">
                                    <Search className="h-4 w-4" />
                                    Apply
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                        {/* Results */}
                        <Card className="lg:col-span-6">
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between">
                                    <span>Results</span>
                                    <Badge variant="outline">{schedules.length} items</Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {listLoading ? (
                                    <div className="text-sm text-muted-foreground">Loading…</div>
                                ) : schedules.length === 0 ? (
                                    <div className="text-sm text-muted-foreground">No schedules found.</div>
                                ) : (
                                    <ScrollArea className="h-130 rounded-md border">
                                        <div className="space-y-2 p-3">
                                            {schedules.map((s) => {
                                                const active = selectedId === s.id
                                                return (
                                                    <button
                                                        key={s.id}
                                                        type="button"
                                                        onClick={() => void onSelect(s.id)}
                                                        className={[
                                                            "w-full rounded-md border p-3 text-left transition",
                                                            active ? "bg-muted/40" : "hover:bg-muted/20",
                                                        ].join(" ")}
                                                    >
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div className="truncate text-sm font-semibold">
                                                                {groupLabel(s.groupId)} • {fmtDate(s.scheduledAt)}
                                                            </div>
                                                            <Badge variant="secondary">{s.status}</Badge>
                                                        </div>

                                                        <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                                                            <div className="truncate">Room: {s.room ?? "—"}</div>
                                                            <div className="truncate">Created by: {s.createdBy ? userLabel(s.createdBy) : "—"}</div>
                                                            {showIds ? (
                                                                <>
                                                                    <div className="truncate">Schedule ID: {s.id}</div>
                                                                    <div className="truncate">Group ID: {s.groupId}</div>
                                                                </>
                                                            ) : null}
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </ScrollArea>
                                )}
                            </CardContent>
                        </Card>

                        {/* Details */}
                        <Card className="lg:col-span-6">
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between">
                                    <span>Details</span>
                                    {selected ? <Badge variant="outline">{selected.status}</Badge> : <Badge variant="outline">None selected</Badge>}
                                </CardTitle>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                {!selected ? (
                                    <div className="text-sm text-muted-foreground">
                                        Select a schedule to view panelists and edit fields.
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-1 text-xs text-muted-foreground">
                                            <div><span className="font-medium">Group:</span> {groupLabel(selected.groupId)}</div>
                                            <div><span className="font-medium">Created by:</span> {selected.createdBy ? userLabel(selected.createdBy) : "—"}</div>
                                            <div><span className="font-medium">Created:</span> {fmtDate(selected.createdAt)}</div>
                                            <div><span className="font-medium">Updated:</span> {fmtDate(selected.updatedAt)}</div>
                                            {showIds ? <div className="truncate"><span className="font-medium">Schedule ID:</span> {selected.id}</div> : null}
                                        </div>

                                        <Separator />

                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                            <div className="sm:col-span-2 space-y-1">
                                                <div className="text-xs font-medium text-muted-foreground">Scheduled at</div>
                                                <Input
                                                    type="datetime-local"
                                                    value={editScheduledAtLocal}
                                                    onChange={(e) => setEditScheduledAtLocal(e.target.value)}
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <div className="text-xs font-medium text-muted-foreground">Status</div>
                                                <Input value={editStatus} onChange={(e) => setEditStatus(e.target.value)} />
                                            </div>

                                            <div className="sm:col-span-3 space-y-1">
                                                <div className="text-xs font-medium text-muted-foreground">Room</div>
                                                <Input value={editRoom} onChange={(e) => setEditRoom(e.target.value)} placeholder="e.g. Room 301" />
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            <Button onClick={() => void onSave()} disabled={saveLoading} className="gap-2">
                                                <Save className="h-4 w-4" />
                                                Save changes
                                            </Button>

                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    setEditScheduledAtLocal(toDatetimeLocalValue(selected.scheduledAt))
                                                    setEditRoom(selected.room ?? "")
                                                    setEditStatus(selected.status ?? "")
                                                }}
                                                disabled={saveLoading}
                                            >
                                                Reset
                                            </Button>

                                            <Button
                                                variant="destructive"
                                                onClick={() => void onDelete()}
                                                disabled={deleteLoading}
                                                className="gap-2"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                Delete
                                            </Button>
                                        </div>

                                        <Separator />

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-sm font-semibold">
                                                    <Users className="h-4 w-4" />
                                                    Panelists
                                                </div>
                                                {panelistsLoading ? (
                                                    <Badge variant="outline">Loading…</Badge>
                                                ) : (
                                                    <Badge variant="outline">{panelists.length} panelists</Badge>
                                                )}
                                            </div>

                                            {panelistsLoading ? (
                                                <div className="text-sm text-muted-foreground">Loading panelists…</div>
                                            ) : panelists.length === 0 ? (
                                                <div className="text-sm text-muted-foreground">No panelists assigned.</div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {panelists.map((p) => (
                                                        <div key={p.staffId} className="flex items-start justify-between gap-3 rounded-md border p-3">
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-medium truncate">{p.staffName}</div>
                                                                <div className="text-xs text-muted-foreground truncate">{p.staffEmail}</div>
                                                                {showIds ? (
                                                                    <div className="text-xs text-muted-foreground truncate">ID: {p.staffId}</div>
                                                                ) : null}
                                                            </div>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => void onRemovePanelist(p.staffId)}
                                                                disabled={panelistActionLoading}
                                                            >
                                                                Remove
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <Separator />

                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                                <div className="sm:col-span-2 space-y-1">
                                                    <div className="text-xs font-medium text-muted-foreground">Add panelist</div>
                                                    <Select value={addStaffId} onValueChange={setAddStaffId}>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder={optionsLoading ? "Loading…" : "Select staff"} />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {staffOptions.map((u) => (
                                                                <SelectItem key={u.id} value={u.id}>
                                                                    {u.name}{u.email ? ` (${u.email})` : ""}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="flex items-end">
                                                    <Button
                                                        onClick={() => void onAddPanelist()}
                                                        disabled={panelistActionLoading}
                                                        className="w-full gap-2"
                                                    >
                                                        <UserPlus className="h-4 w-4" />
                                                        Add
                                                    </Button>
                                                </div>
                                            </div>

                                            <Separator />

                                            <div className="space-y-2">
                                                <div className="text-sm font-semibold">Bulk set panelists (no UUID typing)</div>
                                                <Input
                                                    value={bulkQuery}
                                                    onChange={(e) => setBulkQuery(e.target.value)}
                                                    placeholder="Search staff name/email…"
                                                />
                                                <ScrollArea className="h-56 rounded-md border">
                                                    <div className="space-y-2 p-3">
                                                        {filteredStaff.map((u) => {
                                                            const checked = bulkStaffIds.includes(u.id)
                                                            return (
                                                                <label key={u.id} className="flex items-start gap-3 rounded-md border p-2 cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={() => toggleBulk(u.id)}
                                                                        className="mt-1"
                                                                    />
                                                                    <div className="min-w-0">
                                                                        <div className="text-sm font-medium truncate">{u.name}</div>
                                                                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                                                                        {showIds ? <div className="text-xs text-muted-foreground truncate">ID: {u.id}</div> : null}
                                                                    </div>
                                                                </label>
                                                            )
                                                        })}
                                                        {filteredStaff.length === 0 ? (
                                                            <div className="text-sm text-muted-foreground">No staff match your search.</div>
                                                        ) : null}
                                                    </div>
                                                </ScrollArea>

                                                <Button
                                                    variant="secondary"
                                                    onClick={() => void onApplyBulkPanelists()}
                                                    disabled={panelistActionLoading}
                                                >
                                                    Apply selected panelists
                                                </Button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </DashboardLayout>
    )
}
