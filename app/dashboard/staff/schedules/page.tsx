/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    CalendarDays,
    CheckCircle2,
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
    group_id: string
    scheduled_at: string
    room: string | null
    status: string
    created_by: string | null
    created_at: string
    updated_at: string

    // list endpoint includes these
    group_title?: string
    program?: string | null
    term?: string | null
}

type ListResponse = {
    total: number
    schedules: DefenseSchedule[]
}

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

function statusBadge(status: string) {
    const s = String(status || "").toLowerCase()
    if (s === "scheduled") return <Badge>Scheduled</Badge>
    if (s === "completed" || s === "done") return <Badge variant="secondary">Completed</Badge>
    if (s === "cancelled" || s === "canceled") return <Badge variant="destructive">Cancelled</Badge>
    if (s === "ongoing" || s === "in_progress") return <Badge variant="outline">Ongoing</Badge>
    return <Badge variant="outline">{status || "unknown"}</Badge>
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
        },
        cache: "no-store",
    })
    if (!res.ok) {
        const msg = await res.text().catch(() => "")
        throw new Error(msg || `Request failed (${res.status})`)
    }
    return (await res.json()) as T
}

export default function StaffSchedulesPage() {
    const router = useRouter()
    const { user, loading } = useAuth() as any

    const [busy, setBusy] = React.useState(false)
    const [data, setData] = React.useState<ListResponse | null>(null)

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
    const [newGroupId, setNewGroupId] = React.useState("")
    const [newScheduledAt, setNewScheduledAt] = React.useState("")
    const [newRoom, setNewRoom] = React.useState("")
    const [newStatus, setNewStatus] = React.useState("scheduled")

    const total = data?.total ?? 0
    const schedules = data?.schedules ?? []

    const canPrev = page > 0
    const canNext = (page + 1) * limit < total

    const stats = React.useMemo(() => {
        const byStatus = schedules.reduce<Record<string, number>>((acc, s) => {
            const k = String(s.status ?? "unknown").toLowerCase()
            acc[k] = (acc[k] ?? 0) + 1
            return acc
        }, {})
        const today = new Date()
        const todayKey = toISODate(today)
        const todayCount = schedules.filter((s) => {
            const d = new Date(s.scheduled_at)
            return !Number.isNaN(d.getTime()) && toISODate(d) === todayKey
        }).length
        return {
            todayCount,
            scheduledCount: byStatus["scheduled"] ?? 0,
            completedCount: (byStatus["completed"] ?? 0) + (byStatus["done"] ?? 0),
        }
    }, [schedules])

    React.useEffect(() => {
        if (!loading && (!user || user.role !== "staff")) {
            router.replace("/auth/login")
        }
    }, [loading, user, router])

    const fetchList = React.useCallback(async () => {
        setBusy(true)
        try {
            const params = new URLSearchParams()
            params.set("limit", String(limit))
            params.set("offset", String(page * limit))

            if (q.trim()) params.set("q", q.trim())
            if (status !== "all") params.set("status", status)
            if (fromDate) params.set("from", toISODate(fromDate))
            if (toDate) params.set("to", toISODate(toDate))

            const res = await apiJson<ListResponse>(`/api/staff/defense-schedules?${params.toString()}`)
            setData(res)
        } catch (e: any) {
            setData(null)
            toast.error(e?.message ?? "Failed to load schedules")
        } finally {
            setBusy(false)
        }
    }, [limit, page, q, status, fromDate, toDate])

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

    const onCreate = async () => {
        const gid = newGroupId.trim()
        const scheduledAt = newScheduledAt.trim()
        if (!gid) return toast.error("Group ID is required")
        if (!scheduledAt) return toast.error("Scheduled date/time is required")

        setCreating(true)
        try {
            await apiJson(`/api/staff/defense-schedules`, {
                method: "POST",
                body: JSON.stringify({
                    group_id: gid,
                    scheduled_at: scheduledAt,
                    room: newRoom.trim() ? newRoom.trim() : null,
                    status: newStatus || "scheduled",
                }),
            })
            toast.success("Schedule created")
            setCreateOpen(false)
            setNewGroupId("")
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
            await apiJson(`/api/staff/defense-schedules/${id}`, { method: "DELETE" })
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
                                        <DialogDescription>Fill in the schedule details. You can edit later.</DialogDescription>
                                    </DialogHeader>

                                    <div className="grid gap-4">
                                        <div className="grid gap-2">
                                            <Label htmlFor="group_id">Group ID</Label>
                                            <Input
                                                id="group_id"
                                                value={newGroupId}
                                                onChange={(e) => setNewGroupId(e.target.value)}
                                                placeholder="UUID or group id"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Tip: paste the thesis group ID here.
                                            </p>
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
                                        <Button onClick={onCreate} disabled={creating}>
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
                        <>
                            <div className="grid gap-4 md:grid-cols-3">
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardDescription>Today</CardDescription>
                                        <CardTitle className="text-2xl">{stats.todayCount}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="text-xs text-muted-foreground">
                                        Schedules occurring today (based on current page data)
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardDescription>Scheduled</CardDescription>
                                        <CardTitle className="text-2xl">{stats.scheduledCount}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="text-xs text-muted-foreground">
                                        Currently marked as scheduled
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardDescription>Completed</CardDescription>
                                        <CardTitle className="text-2xl">{stats.completedCount}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="text-xs text-muted-foreground">
                                        Completed/done on the current page
                                    </CardContent>
                                </Card>
                            </div>

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
                                            <div className="relative w-full sm:w-[320px]">
                                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    value={q}
                                                    onChange={(e) => {
                                                        setQ(e.target.value)
                                                        setPage(0)
                                                    }}
                                                    placeholder="Search group / program / term / room..."
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
                                                <SelectTrigger className="w-full sm:w-45">
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
                                                <PopoverContent align="end" className="w-90 p-3">
                                                    <div className="grid gap-3">
                                                        <div className="grid gap-2">
                                                            <Label>From</Label>
                                                            <div className="flex gap-2">
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <Button variant="outline" className={cn("w-full justify-start", !fromDate && "text-muted-foreground")}>
                                                                            {fromDate ? toISODate(fromDate) : "Pick a date"}
                                                                        </Button>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent className="p-0" align="start">
                                                                        <Calendar
                                                                            mode="single"
                                                                            selected={fromDate}
                                                                            onSelect={(d: any) => {
                                                                                setFromDate(d ?? undefined)
                                                                                setPage(0)
                                                                            }}
                                                                            initialFocus
                                                                        />
                                                                    </PopoverContent>
                                                                </Popover>
                                                                <Button
                                                                    variant="ghost"
                                                                    onClick={() => {
                                                                        setFromDate(undefined)
                                                                        setPage(0)
                                                                    }}
                                                                >
                                                                    Clear
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        <div className="grid gap-2">
                                                            <Label>To</Label>
                                                            <div className="flex gap-2">
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <Button variant="outline" className={cn("w-full justify-start", !toDate && "text-muted-foreground")}>
                                                                            {toDate ? toISODate(toDate) : "Pick a date"}
                                                                        </Button>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent className="p-0" align="start">
                                                                        <Calendar
                                                                            mode="single"
                                                                            selected={toDate}
                                                                            onSelect={(d: any) => {
                                                                                setToDate(d ?? undefined)
                                                                                setPage(0)
                                                                            }}
                                                                            initialFocus
                                                                        />
                                                                    </PopoverContent>
                                                                </Popover>
                                                                <Button
                                                                    variant="ghost"
                                                                    onClick={() => {
                                                                        setToDate(undefined)
                                                                        setPage(0)
                                                                    }}
                                                                >
                                                                    Clear
                                                                </Button>
                                                            </div>
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
                                                    <TableHead className="w-55">Scheduled</TableHead>
                                                    <TableHead>Group</TableHead>
                                                    <TableHead className="w-35">Room</TableHead>
                                                    <TableHead className="w-32.5">Status</TableHead>
                                                    <TableHead className="w-20 text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {busy && !data ? (
                                                    <>
                                                        <TableRow>
                                                            <TableCell colSpan={5}>
                                                                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                    Loading schedules...
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    </>
                                                ) : schedules.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                                                            No schedules found.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    schedules.map((s) => (
                                                        <TableRow key={s.id}>
                                                            <TableCell className="font-medium">{formatDateTime(s.scheduled_at)}</TableCell>
                                                            <TableCell>
                                                                <div className="space-y-1">
                                                                    <div className="line-clamp-1 font-medium">
                                                                        {s.group_title?.trim() ? s.group_title : s.group_id}
                                                                    </div>
                                                                    <div className="text-xs text-muted-foreground">
                                                                        {[
                                                                            s.program?.trim() ? s.program : null,
                                                                            s.term?.trim() ? s.term : null,
                                                                        ]
                                                                            .filter(Boolean)
                                                                            .join(" • ") || "—"}
                                                                    </div>
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
                                                                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
                                                    ))
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
                                                Showing{" "}
                                                <span className="font-medium text-foreground">{schedules.length}</span> of{" "}
                                                <span className="font-medium text-foreground">{total}</span>
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={!canPrev || busy}>
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
                                                <SelectTrigger className="w-27.5">
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

                                    <Separator />

                                    <Alert>
                                        <CheckCircle2 className="h-4 w-4" />
                                        <AlertTitle>Tip</AlertTitle>
                                        <AlertDescription>
                                            Open a schedule to manage its panelists (add/remove).
                                        </AlertDescription>
                                    </Alert>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </div>
            </TooltipProvider>
        </DashboardLayout>
    )
}
