/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    CalendarDays,
    ChevronDown,
    ClipboardCopy,
    Filter,
    Loader2,
    MoreHorizontal,
    Plus,
    RefreshCw,
    Search,
    Trash2,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"
import { useApi } from "@/hooks/use-api"
import { cn } from "@/lib/utils"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type DefenseSchedule = {
    id: string
    groupId: string
    scheduledAt: string
    room: string | null
    status: string
    createdBy: string | null
    createdAt: string
    updatedAt: string

    // optional enrichment (if backend adds it later)
    groupTitle?: string | null
    group_title?: string | null
    program?: string | null
    term?: string | null
}

type ScheduleListOk = { ok: true; total: number; schedules: DefenseSchedule[] }
type ScheduleListErr = { ok: false; message?: string }
type ScheduleListResponse = ScheduleListOk | ScheduleListErr

type ThesisGroupOption = {
    id: string
    title: string
    program?: string | null
    term?: string | null
}

type ThesisGroupsOk = { ok: true; total: number; groups: any[] }
type ThesisGroupsErr = { ok: false; message?: string }
type ThesisGroupsResponse = ThesisGroupsOk | ThesisGroupsErr

type ThesisGroupByIdOk = { ok: true; group: any }
type ThesisGroupByIdErr = { ok: false; message?: string }
type ThesisGroupByIdResponse = ThesisGroupByIdOk | ThesisGroupByIdErr

function toISODate(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

function formatDateTime(v: string) {
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return v
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(d)
}

function datetimeLocalToIso(v: string) {
    const s = String(v ?? "").trim()
    if (!s) return ""
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s
    return d.toISOString()
}

function statusBadge(status: string) {
    const s = String(status || "").toLowerCase()
    if (s === "scheduled") return <Badge>Scheduled</Badge>
    if (s === "completed" || s === "done") return <Badge variant="secondary">Completed</Badge>
    if (s === "cancelled" || s === "canceled") return <Badge variant="destructive">Cancelled</Badge>
    if (s === "ongoing" || s === "in_progress") return <Badge variant="outline">Ongoing</Badge>
    return <Badge variant="outline">{status || "unknown"}</Badge>
}

function normalizeGroups(groups: any[]): ThesisGroupOption[] {
    const out: ThesisGroupOption[] = []
    for (const g of groups ?? []) {
        const id = String(g?.id ?? g?.groupId ?? g?.group_id ?? "").trim()
        const title = String(g?.title ?? g?.name ?? "").trim()
        if (!id) continue
        out.push({
            id,
            title: title || `Group ${id.slice(0, 8)}…`,
            program: g?.program ?? null,
            term: g?.term ?? null,
        })
    }
    const map = new Map<string, ThesisGroupOption>()
    for (const i of out) map.set(i.id, i)
    return Array.from(map.values())
}

export default function StaffSchedulesPage() {
    const router = useRouter()
    const { user, loading } = useAuth() as any

    const api = useApi({
        onUnauthorized: () => router.replace("/auth/login"),
    })

    const [busy, setBusy] = React.useState(false)
    const [data, setData] = React.useState<ScheduleListOk | null>(null)

    // filters
    const [q, setQ] = React.useState("")
    const [status, setStatus] = React.useState<string>("all")
    const [fromDate, setFromDate] = React.useState<Date | undefined>(undefined)
    const [toDate, setToDate] = React.useState<Date | undefined>(undefined)

    // pagination
    const [limit, setLimit] = React.useState(20)
    const [page, setPage] = React.useState(0)

    // create dialog
    const [createOpen, setCreateOpen] = React.useState(false)
    const [creating, setCreating] = React.useState(false)

    // group picker (uses /api/thesis?resource=groups)
    const [groupOpen, setGroupOpen] = React.useState(false)
    const [groupQuery, setGroupQuery] = React.useState("")
    const [groupLoading, setGroupLoading] = React.useState(false)
    const [groups, setGroups] = React.useState<ThesisGroupOption[]>([])
    const [selectedGroup, setSelectedGroup] = React.useState<ThesisGroupOption | null>(null)
    const [groupError, setGroupError] = React.useState<string>("")

    // cache of group meta for rendering schedules list
    const [groupMetaById, setGroupMetaById] = React.useState<Record<string, ThesisGroupOption>>({})

    const [newScheduledAt, setNewScheduledAt] = React.useState("")
    const [newRoom, setNewRoom] = React.useState("")
    const [newStatus, setNewStatus] = React.useState("scheduled")

    const total = data?.total ?? 0
    const schedules = data?.schedules ?? []

    const canPrev = page > 0
    const canNext = (page + 1) * limit < total

    React.useEffect(() => {
        if (!loading && (!user || user.role !== "staff")) {
            router.replace("/auth/login")
        }
    }, [loading, user, router])

    const fetchList = React.useCallback(async () => {
        setBusy(true)
        try {
            const params = new URLSearchParams()
            params.set("resource", "schedules")
            params.set("limit", String(limit))
            params.set("offset", String(page * limit))

            if (q.trim()) params.set("q", q.trim())
            if (status !== "all") params.set("status", status)
            if (fromDate) params.set("from", toISODate(fromDate))
            if (toDate) params.set("to", toISODate(toDate))

            const res = await api.request<ScheduleListResponse>(`/api/schedule?${params.toString()}`)
            if (!res || (res as any).ok !== true) {
                const msg = (res as any)?.message ?? "Failed to load schedules"
                throw new Error(String(msg))
            }

            setData(res as ScheduleListOk)
        } catch (e: any) {
            setData(null)
            toast.error(e?.message ?? "Failed to load schedules")
        } finally {
            setBusy(false)
        }
    }, [api, limit, page, q, status, fromDate, toDate])

    React.useEffect(() => {
        if (!loading && user?.role === "staff") fetchList()
    }, [fetchList, loading, user])

    const resetFilters = () => {
        setQ("")
        setStatus("all")
        setFromDate(undefined)
        setToDate(undefined)
        setPage(0)
    }

    const loadGroups = React.useCallback(
        async (query: string) => {
            setGroupLoading(true)
            setGroupError("")
            try {
                const params = new URLSearchParams()
                params.set("resource", "groups")
                params.set("q", query.trim())
                params.set("limit", "50")
                params.set("offset", "0")

                const res = await api.request<ThesisGroupsResponse>(`/api/thesis?${params.toString()}`)
                if (!res || (res as any).ok !== true) {
                    const msg = (res as any)?.message ?? "Failed to load thesis groups"
                    throw new Error(String(msg))
                }

                const ok = res as ThesisGroupsOk
                const normalized = normalizeGroups(ok.groups ?? [])
                setGroups(normalized)

                // warm cache
                setGroupMetaById((prev) => {
                    const next = { ...prev }
                    for (const g of normalized) next[g.id] = g
                    return next
                })
            } catch (e: any) {
                setGroups([])
                setGroupError(e?.message || "Failed to load thesis groups.")
            } finally {
                setGroupLoading(false)
            }
        },
        [api]
    )

    const fetchThesisGroupById = React.useCallback(
        async (id: string): Promise<ThesisGroupOption | null> => {
            const params = new URLSearchParams()
            params.set("resource", "groups")
            params.set("id", id)

            const res = await api.request<ThesisGroupByIdResponse>(`/api/thesis?${params.toString()}`)
            if (!res || (res as any).ok !== true) return null
            const ok = res as ThesisGroupByIdOk
            const normalized = normalizeGroups([ok.group])
            return normalized[0] ?? null
        },
        [api]
    )

    React.useEffect(() => {
        if (!createOpen) return
        setSelectedGroup(null)
        setGroupQuery("")
        loadGroups("")
    }, [createOpen, loadGroups])

    React.useEffect(() => {
        if (!createOpen) return
        const t = setTimeout(() => {
            loadGroups(groupQuery)
        }, 350)
        return () => clearTimeout(t)
    }, [groupQuery, createOpen, loadGroups])

    // ensure group meta for schedules currently visible
    React.useEffect(() => {
        const ids = Array.from(
            new Set((schedules ?? []).map((s) => String(s.groupId ?? "").trim()).filter(Boolean))
        )
        if (!ids.length) return

        const missing = ids.filter((id) => !groupMetaById[id])
        if (!missing.length) return

        let cancelled = false
        ;(async () => {
            try {
                const fetched = await Promise.all(missing.map((gid) => fetchThesisGroupById(gid)))
                const items = fetched.filter(Boolean) as ThesisGroupOption[]
                if (cancelled || !items.length) return
                setGroupMetaById((prev) => {
                    const next = { ...prev }
                    for (const g of items) next[g.id] = g
                    return next
                })
            } catch {
                // silent
            }
        })()

        return () => {
            cancelled = true
        }
    }, [schedules, groupMetaById, fetchThesisGroupById])

    const onCreate = async () => {
        const gid = selectedGroup?.id?.trim() ?? ""
        const scheduledLocal = newScheduledAt.trim()

        if (!gid) return toast.error("Please select a group")
        if (!scheduledLocal) return toast.error("Scheduled date/time is required")

        const scheduledAtIso = datetimeLocalToIso(scheduledLocal)
        if (!scheduledAtIso) return toast.error("Invalid scheduled date/time")

        setCreating(true)
        try {
            const params = new URLSearchParams()
            params.set("resource", "schedules")

            await api.request(`/api/schedule?${params.toString()}`, {
                method: "POST",
                body: JSON.stringify({
                    groupId: gid,
                    scheduledAt: scheduledAtIso,
                    room: newRoom.trim() ? newRoom.trim() : null,
                    status: newStatus || "scheduled",
                    createdBy: user?.id ?? null,
                }),
            })

            toast.success("Schedule created")
            setCreateOpen(false)

            setSelectedGroup(null)
            setGroupQuery("")
            setNewScheduledAt("")
            setNewRoom("")
            setNewStatus("scheduled")
            setPage(0)

            await fetchList()
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to create schedule")
        } finally {
            setCreating(false)
        }
    }

    const onDelete = async (id: string) => {
        try {
            const params = new URLSearchParams()
            params.set("resource", "schedules")
            params.set("id", id)

            await api.request(`/api/schedule?${params.toString()}`, { method: "DELETE" })
            toast.success("Schedule deleted")
            await fetchList()
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to delete schedule")
        }
    }

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text)
            toast.success("Copied")
        } catch {
            toast.error("Copy failed")
        }
    }

    const selectedGroupLabel = React.useMemo(() => {
        if (!selectedGroup) return "Select a group..."
        const meta = [selectedGroup.program?.trim() ? selectedGroup.program : null, selectedGroup.term?.trim() ? selectedGroup.term : null]
            .filter(Boolean)
            .join(" • ")
        return meta ? `${selectedGroup.title} (${meta})` : selectedGroup.title
    }, [selectedGroup])

    return (
        <DashboardLayout>
            <TooltipProvider>
                <div className="space-y-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <CalendarDays className="h-5 w-5 text-muted-foreground" />
                                <h1 className="text-xl font-semibold tracking-tight">Defense Schedules</h1>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                View schedules, filter by date/status, and open a schedule to manage its panelists.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={fetchList} disabled={busy}>
                                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                Refresh
                            </Button>

                            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                                <DialogTrigger asChild>
                                    <Button>
                                        <Plus className="mr-2 h-4 w-4" />
                                        Create
                                    </Button>
                                </DialogTrigger>

                                <DialogContent className="sm:max-w-lg">
                                    <DialogHeader>
                                        <DialogTitle>Create defense schedule</DialogTitle>
                                        <DialogDescription>Select the group, then set date/time, room, and status.</DialogDescription>
                                    </DialogHeader>

                                    <div className="grid gap-4">
                                        <div className="grid gap-2">
                                            <Label>Group</Label>

                                            <Popover open={groupOpen} onOpenChange={setGroupOpen}>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        role="combobox"
                                                        className={cn("w-full justify-between", !selectedGroup && "text-muted-foreground")}
                                                    >
                                                        <span className="truncate">{selectedGroupLabel}</span>
                                                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                                    </Button>
                                                </PopoverTrigger>

                                                <PopoverContent className="w-80 p-0 sm:w-96" align="start">
                                                    <Command>
                                                        <div className="flex items-center gap-2 border-b px-3 py-2">
                                                            <Search className="h-4 w-4 text-muted-foreground" />
                                                            <CommandInput
                                                                value={groupQuery}
                                                                onValueChange={setGroupQuery}
                                                                placeholder="Search group title..."
                                                            />
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={() => loadGroups(groupQuery)}
                                                                disabled={groupLoading}
                                                                title="Refresh groups"
                                                            >
                                                                {groupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                                            </Button>
                                                        </div>

                                                        <CommandList>
                                                            <CommandEmpty>{groupLoading ? "Loading groups..." : "No groups found."}</CommandEmpty>

                                                            <CommandGroup heading="Thesis groups">
                                                                {groups.map((g) => {
                                                                    const meta = [g.program?.trim() ? g.program : null, g.term?.trim() ? g.term : null]
                                                                        .filter(Boolean)
                                                                        .join(" • ")
                                                                    return (
                                                                        <CommandItem
                                                                            key={g.id}
                                                                            value={`${g.title} ${g.program ?? ""} ${g.term ?? ""}`}
                                                                            onSelect={() => {
                                                                                setSelectedGroup(g)
                                                                                setGroupOpen(false)
                                                                            }}
                                                                        >
                                                                            <div className="min-w-0">
                                                                                <div className="truncate text-sm font-medium">{g.title}</div>
                                                                                <div className="truncate text-xs text-muted-foreground">{meta || g.id}</div>
                                                                            </div>
                                                                        </CommandItem>
                                                                    )
                                                                })}
                                                            </CommandGroup>
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>

                                            <div className="flex items-center justify-between">
                                                <p className="text-xs text-muted-foreground">Select from available thesis groups.</p>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 px-2"
                                                    onClick={() => setSelectedGroup(null)}
                                                    disabled={!selectedGroup}
                                                >
                                                    Clear
                                                </Button>
                                            </div>

                                            {groupError ? (
                                                <Alert variant="destructive">
                                                    <AlertTitle>Cannot load thesis groups</AlertTitle>
                                                    <AlertDescription>{groupError}</AlertDescription>
                                                </Alert>
                                            ) : null}
                                        </div>

                                        <div className="grid gap-2">
                                            <Label htmlFor="scheduled_at">Scheduled at</Label>
                                            <Input
                                                id="scheduled_at"
                                                type="datetime-local"
                                                value={newScheduledAt}
                                                onChange={(e) => setNewScheduledAt(e.target.value)}
                                            />
                                        </div>

                                        <div className="grid gap-2">
                                            <Label htmlFor="room">Room (optional)</Label>
                                            <Input
                                                id="room"
                                                value={newRoom}
                                                onChange={(e) => setNewRoom(e.target.value)}
                                                placeholder="e.g., ICT Lab / Room 203"
                                            />
                                        </div>

                                        <div className="grid gap-2">
                                            <Label>Status</Label>
                                            <Select value={newStatus} onValueChange={setNewStatus}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="scheduled">scheduled</SelectItem>
                                                    <SelectItem value="ongoing">ongoing</SelectItem>
                                                    <SelectItem value="completed">completed</SelectItem>
                                                    <SelectItem value="cancelled">cancelled</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <DialogFooter className="gap-2 sm:gap-0">
                                        <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                                            Cancel
                                        </Button>
                                        <Button onClick={onCreate} disabled={creating || !selectedGroup || !newScheduledAt.trim()}>
                                            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            Create
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>

                    {loading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-64 w-full" />
                        </div>
                    ) : !user || user.role !== "staff" ? (
                        <Alert variant="destructive">
                            <AlertTitle>Unauthorized</AlertTitle>
                            <AlertDescription>Please login as staff to access schedules.</AlertDescription>
                        </Alert>
                    ) : (
                        <Card>
                            <CardHeader className="space-y-3">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <CardTitle>Schedules</CardTitle>
                                        <CardDescription>
                                            Total: <span className="font-medium text-foreground">{total}</span>
                                        </CardDescription>
                                    </div>

                                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                                        <div className="relative w-full sm:w-80">
                                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                value={q}
                                                onChange={(e) => {
                                                    setQ(e.target.value)
                                                    setPage(0)
                                                }}
                                                placeholder="Search room / status..."
                                                className="pl-9"
                                            />
                                        </div>

                                        <Select
                                            value={status}
                                            onValueChange={(v) => {
                                                setStatus(v)
                                                setPage(0)
                                            }}
                                        >
                                            <SelectTrigger className="w-full sm:w-48">
                                                <SelectValue placeholder="Status" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All statuses</SelectItem>
                                                <SelectItem value="scheduled">scheduled</SelectItem>
                                                <SelectItem value="ongoing">ongoing</SelectItem>
                                                <SelectItem value="completed">completed</SelectItem>
                                                <SelectItem value="cancelled">cancelled</SelectItem>
                                            </SelectContent>
                                        </Select>

                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" className="w-full sm:w-auto">
                                                    <Filter className="mr-2 h-4 w-4" />
                                                    Date filter
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent align="end" className="w-80 p-3 sm:w-96">
                                                <div className="grid gap-3">
                                                    <div className="grid gap-2">
                                                        <Label>From</Label>
                                                        <Calendar
                                                            mode="single"
                                                            selected={fromDate}
                                                            onSelect={(d: any) => {
                                                                setFromDate(d ?? undefined)
                                                                setPage(0)
                                                            }}
                                                            initialFocus
                                                        />
                                                    </div>

                                                    <div className="grid gap-2">
                                                        <Label>To</Label>
                                                        <Calendar
                                                            mode="single"
                                                            selected={toDate}
                                                            onSelect={(d: any) => {
                                                                setToDate(d ?? undefined)
                                                                setPage(0)
                                                            }}
                                                            initialFocus
                                                        />
                                                    </div>

                                                    <Separator />

                                                    <div className="flex items-center justify-between">
                                                        <Button variant="outline" onClick={resetFilters}>
                                                            Reset all
                                                        </Button>
                                                        <Button onClick={fetchList} disabled={busy}>
                                                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                            Apply
                                                        </Button>
                                                    </div>
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-56">Scheduled</TableHead>
                                                <TableHead>Group</TableHead>
                                                <TableHead className="w-40">Room</TableHead>
                                                <TableHead className="w-32">Status</TableHead>
                                                <TableHead className="w-20 text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {busy && !data ? (
                                                <TableRow>
                                                    <TableCell colSpan={5}>
                                                        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                            Loading schedules...
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : schedules.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                                                        No schedules found.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                schedules.map((s) => {
                                                    const cached = groupMetaById[String(s.groupId ?? "").trim()]
                                                    const title =
                                                        (s.groupTitle ?? s.group_title ?? "").trim() ||
                                                        (cached?.title ?? "").trim() ||
                                                        s.groupId

                                                    const meta = [
                                                        (s.program ?? cached?.program ?? null)?.toString().trim()
                                                            ? (s.program ?? cached?.program)
                                                            : null,
                                                        (s.term ?? cached?.term ?? null)?.toString().trim()
                                                            ? (s.term ?? cached?.term)
                                                            : null,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" • ")

                                                    return (
                                                        <TableRow key={s.id}>
                                                            <TableCell className="font-medium">{formatDateTime(s.scheduledAt)}</TableCell>
                                                            <TableCell>
                                                                <div className="space-y-1">
                                                                    <div className="line-clamp-1 font-medium">{title}</div>
                                                                    <div className="text-xs text-muted-foreground">{meta || "—"}</div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>{s.room?.trim() ? s.room : "—"}</TableCell>
                                                            <TableCell>{statusBadge(s.status)}</TableCell>
                                                            <TableCell className="text-right">
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <Button variant="ghost" size="icon">
                                                                            <MoreHorizontal className="h-4 w-4" />
                                                                        </Button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuLabel>Schedule</DropdownMenuLabel>

                                                                        <DropdownMenuItem asChild>
                                                                            <Link href={`/dashboard/staff/schedules/${s.id}`}>Open</Link>
                                                                        </DropdownMenuItem>

                                                                        <DropdownMenuItem onClick={() => copy(s.id)}>
                                                                            <ClipboardCopy className="mr-2 h-4 w-4" />
                                                                            Copy ID
                                                                        </DropdownMenuItem>

                                                                        <DropdownMenuSeparator />

                                                                        <AlertDialog>
                                                                            <AlertDialogTrigger asChild>
                                                                                <DropdownMenuItem
                                                                                    className="text-destructive focus:text-destructive"
                                                                                    onSelect={(e) => e.preventDefault()}
                                                                                >
                                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                                    Delete
                                                                                </DropdownMenuItem>
                                                                            </AlertDialogTrigger>
                                                                            <AlertDialogContent>
                                                                                <AlertDialogHeader>
                                                                                    <AlertDialogTitle>Delete schedule?</AlertDialogTitle>
                                                                                    <AlertDialogDescription>
                                                                                        This will permanently delete the schedule. This action cannot be undone.
                                                                                    </AlertDialogDescription>
                                                                                </AlertDialogHeader>
                                                                                <AlertDialogFooter>
                                                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                                    <AlertDialogAction
                                                                                        className="bg-destructive text-white hover:bg-destructive/90"
                                                                                        onClick={() => onDelete(s.id)}
                                                                                    >
                                                                                        Delete
                                                                                    </AlertDialogAction>
                                                                                </AlertDialogFooter>
                                                                            </AlertDialogContent>
                                                                        </AlertDialog>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <span>
                                            Page <span className="font-medium text-foreground">{page + 1}</span>
                                        </span>
                                        <span>•</span>
                                        <span>
                                            Showing <span className="font-medium text-foreground">{schedules.length}</span> of{" "}
                                            <span className="font-medium text-foreground">{total}</span>
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                                                    disabled={!canPrev || busy}
                                                >
                                                    Prev
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Previous page</TooltipContent>
                                        </Tooltip>

                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button variant="outline" onClick={() => setPage((p) => p + 1)} disabled={!canNext || busy}>
                                                    Next
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Next page</TooltipContent>
                                        </Tooltip>

                                        <Select
                                            value={String(limit)}
                                            onValueChange={(v) => {
                                                const n = Number(v)
                                                setLimit(Number.isFinite(n) ? n : 20)
                                                setPage(0)
                                            }}
                                        >
                                            <SelectTrigger className="w-28">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="10">10 / page</SelectItem>
                                                <SelectItem value="20">20 / page</SelectItem>
                                                <SelectItem value="50">50 / page</SelectItem>
                                            </SelectContent>
                                        </Select>

                                        <Button variant="ghost" onClick={resetFilters} className="hidden sm:inline-flex">
                                            Reset
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </TooltipProvider>
        </DashboardLayout>
    )
}
