/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Calendar as CalendarIcon,
    Eye,
    RefreshCw,
    Search,
    MoreHorizontal,
    Copy,
    Users as UsersIcon,
    Info,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

import type { DateRange } from "react-day-picker"

type ApiOk<T> = { ok: true } & T
type ApiErr = { ok: false; message?: string }

type ScheduleRow = {
    id: string
    groupId: string
    scheduledAt: string
    room: string | null
    status: string
    createdBy: string | null
    createdAt: string
    updatedAt: string
    groupTitle?: string | null
    program?: string | null
    term?: string | null
}

type PanelistRow = {
    scheduleId: string
    staffId: string
    staffName: string
    staffEmail: string
}

function yyyyMmDd(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

function fmtDateTime(iso: string) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
    }).format(d)
}

function fmtDate(iso: string) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(d)
}

function safeInitials(nameOrEmail: string) {
    const s = String(nameOrEmail || "").trim()
    if (!s) return "U"
    const parts = s.split(/\s+/).filter(Boolean)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase()
}

function statusBadgeVariant(status: string): React.ComponentProps<typeof Badge>["variant"] {
    const s = String(status || "").toLowerCase()
    if (s.includes("cancel")) return "destructive"
    if (s.includes("done") || s.includes("complete")) return "secondary"
    if (s.includes("ongoing") || s.includes("in_progress") || s.includes("progress")) return "default"
    return "outline"
}

function statusHelp(status: string) {
    const s = String(status || "").toLowerCase()
    if (s.includes("scheduled")) return "Your defense is scheduled. Check date/time/room and panelists."
    if (s.includes("done") || s.includes("complete")) return "Defense completed. This is a record of the final schedule."
    if (s.includes("cancel")) return "Defense was cancelled or moved. Wait for an updated schedule."
    if (s.includes("resched")) return "Defense is being rescheduled. Watch for the new schedule."
    return "Schedule status provided by the system."
}

function daysUntil(iso: string) {
    const t = new Date(iso).getTime()
    if (!Number.isFinite(t)) return null
    const now = Date.now()
    return Math.ceil((t - now) / (1000 * 60 * 60 * 24))
}

async function safeJson(res: Response) {
    const text = await res.text()
    try {
        return JSON.parse(text)
    } catch {
        return { ok: false, message: text || `HTTP ${res.status}` }
    }
}

export default function StudentSchedulePage() {
    const router = useRouter()
    const { loading: authLoading, user } = useAuth()

    const [tab, setTab] = React.useState<"upcoming" | "all" | "past">("upcoming")

    const [q, setQ] = React.useState("")
    const [status, setStatus] = React.useState<"all" | "scheduled" | "completed" | "cancelled">("all")
    const [range, setRange] = React.useState<DateRange | undefined>(undefined)

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const [total, setTotal] = React.useState(0)
    const [rows, setRows] = React.useState<ScheduleRow[]>([])

    const [selected, setSelected] = React.useState<ScheduleRow | null>(null)
    const [panelistsLoading, setPanelistsLoading] = React.useState(false)
    const [panelists, setPanelists] = React.useState<PanelistRow[]>([])
    const [panelistsError, setPanelistsError] = React.useState<string | null>(null)

    const today = React.useMemo(() => new Date(), [])
    const tabFromTo = React.useMemo(() => {
        // default behavior when no explicit date range is chosen
        if (range?.from || range?.to) {
            return {
                from: range.from ? yyyyMmDd(range.from) : "",
                to: range.to ? yyyyMmDd(range.to) : "",
            }
        }

        if (tab === "upcoming") {
            return { from: yyyyMmDd(today), to: "" }
        }
        if (tab === "past") {
            return { from: "", to: yyyyMmDd(today) }
        }
        return { from: "", to: "" }
    }, [range?.from, range?.to, tab, today])

    React.useEffect(() => {
        if (authLoading) return
        const role = String(user?.role ?? "").toLowerCase()
        if (!user) {
            router.replace("/auth/login")
            return
        }
        if (role !== "student") {
            router.replace("/dashboard")
        }
    }, [authLoading, user, router])

    const fetchSchedules = React.useCallback(
        async (opts?: { silent?: boolean }) => {
            const silent = Boolean(opts?.silent)

            if (!silent) setLoading(true)
            setError(null)

            const sp = new URLSearchParams()
            sp.set("resource", "schedules")
            sp.set("limit", "50")
            sp.set("offset", "0")

            const qq = q.trim()
            if (qq) sp.set("q", qq)

            if (status !== "all") sp.set("status", status)

            if (tabFromTo.from) sp.set("from", tabFromTo.from)
            if (tabFromTo.to) sp.set("to", tabFromTo.to)

            try {
                const res = await fetch(`/api/schedule?${sp.toString()}`, { cache: "no-store" })
                const data = (await safeJson(res)) as (ApiOk<{ total: number; schedules: ScheduleRow[] }> | ApiErr)

                if (!res.ok || !data.ok) {
                    throw new Error((data as any)?.message || `Failed to load schedules (HTTP ${res.status})`)
                }

                setTotal((data as any).total ?? 0)
                setRows((data as any).schedules ?? [])
            } catch (e: any) {
                setTotal(0)
                setRows([])
                setError(e?.message ?? "Failed to load schedules")
            } finally {
                if (!silent) setLoading(false)
            }
        },
        [q, status, tabFromTo.from, tabFromTo.to]
    )

    React.useEffect(() => {
        const t = window.setTimeout(() => {
            fetchSchedules({ silent: false })
        }, 250)
        return () => window.clearTimeout(t)
    }, [fetchSchedules])

    const onRefresh = async () => {
        setRefreshing(true)
        await fetchSchedules({ silent: true })
        setRefreshing(false)
        toast.success("Schedule refreshed")
    }

    const upcoming = React.useMemo(() => {
        const now = Date.now()
        const sorted = [...rows].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
        const next = sorted.find((r) => new Date(r.scheduledAt).getTime() >= now)
        return next ?? sorted[0] ?? null
    }, [rows])

    const nextInDays = upcoming ? daysUntil(upcoming.scheduledAt) : null
    const progress = React.useMemo(() => {
        // simple countdown visualization: 0..30 days window
        if (nextInDays === null) return 0
        if (nextInDays <= 0) return 100
        const clamped = Math.min(30, Math.max(0, 30 - nextInDays))
        return Math.round((clamped / 30) * 100)
    }, [nextInDays])

    const loadPanelists = React.useCallback(async (scheduleId: string) => {
        setPanelistsLoading(true)
        setPanelistsError(null)
        setPanelists([])

        try {
            const res = await fetch(`/api/schedule?resource=panelists&scheduleId=${encodeURIComponent(scheduleId)}`, {
                cache: "no-store",
            })
            const data = (await safeJson(res)) as (ApiOk<{ panelists: PanelistRow[] }> | ApiErr)

            if (!res.ok || !data.ok) {
                throw new Error((data as any)?.message || `Failed to load panelists (HTTP ${res.status})`)
            }

            setPanelists((data as any).panelists ?? [])
        } catch (e: any) {
            setPanelistsError(e?.message ?? "Failed to load panelists")
        } finally {
            setPanelistsLoading(false)
        }
    }, [])

    const copyText = async (text: string, label?: string) => {
        try {
            await navigator.clipboard.writeText(text)
            toast.success(label ? `${label} copied` : "Copied")
        } catch {
            toast.error("Copy failed")
        }
    }

    const emptyState = !loading && !error && rows.length === 0

    return (
        <DashboardLayout
            title="My Schedule"
            description="View your thesis defense schedule and related details (room, status, panelists)."
        >
            <div className="space-y-6">
                <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <CardHeader className="space-y-1">
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <CardTitle className="text-xl">Defense Overview</CardTitle>
                                    <CardDescription>
                                        Your next scheduled defense (if available), plus quick actions.
                                    </CardDescription>
                                </div>

                                <div className="flex items-center gap-2">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={onRefresh}
                                                    disabled={refreshing}
                                                    className="gap-2"
                                                >
                                                    <RefreshCw className={cn("h-4 w-4", refreshing ? "animate-spin" : "")} />
                                                    Refresh
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Reload your latest schedule</TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>

                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => router.push("/dashboard/student/evaluation")}
                                        className="gap-2"
                                    >
                                        <Eye className="h-4 w-4" />
                                        My Evaluation
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            {loading ? (
                                <div className="space-y-3">
                                    <Skeleton className="h-5 w-1/2" />
                                    <Skeleton className="h-4 w-2/3" />
                                    <Skeleton className="h-4 w-1/3" />
                                    <Separator />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                            ) : error ? (
                                <Alert variant="destructive">
                                    <AlertTitle>Unable to load schedule</AlertTitle>
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            ) : upcoming ? (
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <HoverCard>
                                            <HoverCardTrigger asChild>
                                                <Badge variant={statusBadgeVariant(upcoming.status)} className="cursor-help">
                                                    {String(upcoming.status || "scheduled").toUpperCase()}
                                                </Badge>
                                            </HoverCardTrigger>
                                            <HoverCardContent className="text-sm">{statusHelp(upcoming.status)}</HoverCardContent>
                                        </HoverCard>

                                        <Badge variant="outline" className="gap-2">
                                            <CalendarIcon className="h-3.5 w-3.5" />
                                            {fmtDateTime(upcoming.scheduledAt)}
                                        </Badge>

                                        {upcoming.room ? <Badge variant="outline">Room: {upcoming.room}</Badge> : null}
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-3">
                                        <div className="rounded-lg border p-3">
                                            <p className="text-xs text-muted-foreground">Thesis Title</p>
                                            <p className="mt-1 text-sm font-medium">
                                                {upcoming.groupTitle ? upcoming.groupTitle : "—"}
                                            </p>
                                        </div>
                                        <div className="rounded-lg border p-3">
                                            <p className="text-xs text-muted-foreground">Program</p>
                                            <p className="mt-1 text-sm font-medium">{upcoming.program ? upcoming.program : "—"}</p>
                                        </div>
                                        <div className="rounded-lg border p-3">
                                            <p className="text-xs text-muted-foreground">Term</p>
                                            <p className="mt-1 text-sm font-medium">{upcoming.term ? upcoming.term : "—"}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Countdown window (30 days)</span>
                                            <span className="font-medium">
                                                {nextInDays === null
                                                    ? "—"
                                                    : nextInDays > 0
                                                        ? `${nextInDays} day(s) remaining`
                                                        : "Today / Passed"}
                                            </span>
                                        </div>
                                        <Progress value={progress} />
                                    </div>
                                </div>
                            ) : (
                                <Alert>
                                    <Info className="h-4 w-4" />
                                    <AlertTitle>No schedule yet</AlertTitle>
                                    <AlertDescription>
                                        You don’t have a published defense schedule right now. Please check again later.
                                    </AlertDescription>
                                </Alert>
                            )}
                        </CardContent>

                        <CardFooter className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                                Showing <span className="font-medium">{rows.length}</span> item(s)
                                {typeof total === "number" ? (
                                    <>
                                        {" "}
                                        out of <span className="font-medium">{total}</span>
                                    </>
                                ) : null}
                                .
                            </p>

                            <div className="flex items-center gap-2">
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" size="sm" className="gap-2">
                                            <UsersIcon className="h-4 w-4" />
                                            Panelists
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-lg">
                                        <DialogHeader>
                                            <DialogTitle>Panelists</DialogTitle>
                                            <DialogDescription>
                                                Panelists for the selected/next schedule (if available).
                                            </DialogDescription>
                                        </DialogHeader>

                                        {!upcoming ? (
                                            <Alert>
                                                <AlertTitle>No schedule selected</AlertTitle>
                                                <AlertDescription>
                                                    Once you have a schedule, panelists will appear here.
                                                </AlertDescription>
                                            </Alert>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div>
                                                        <p className="text-sm font-medium">{fmtDateTime(upcoming.scheduledAt)}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {upcoming.groupTitle ? upcoming.groupTitle : "—"}
                                                        </p>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => loadPanelists(upcoming.id)}
                                                        className="gap-2"
                                                    >
                                                        <RefreshCw className="h-4 w-4" />
                                                        Load
                                                    </Button>
                                                </div>

                                                <Separator />

                                                {panelistsLoading ? (
                                                    <div className="space-y-2">
                                                        <Skeleton className="h-10 w-full" />
                                                        <Skeleton className="h-10 w-full" />
                                                        <Skeleton className="h-10 w-full" />
                                                    </div>
                                                ) : panelistsError ? (
                                                    <Alert variant="destructive">
                                                        <AlertTitle>Unable to load panelists</AlertTitle>
                                                        <AlertDescription>{panelistsError}</AlertDescription>
                                                    </Alert>
                                                ) : panelists.length === 0 ? (
                                                    <Alert>
                                                        <AlertTitle>No panelists listed</AlertTitle>
                                                        <AlertDescription>
                                                            Panelists may not be assigned yet. Check again later.
                                                        </AlertDescription>
                                                    </Alert>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {panelists.map((p) => (
                                                            <div
                                                                key={`${p.scheduleId}-${p.staffId}`}
                                                                className="flex items-center justify-between gap-3 rounded-lg border p-3"
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <Avatar className="h-9 w-9">
                                                                        <AvatarFallback>{safeInitials(p.staffName || p.staffEmail)}</AvatarFallback>
                                                                    </Avatar>
                                                                    <div>
                                                                        <p className="text-sm font-medium">{p.staffName}</p>
                                                                        <p className="text-xs text-muted-foreground">{p.staffEmail}</p>
                                                                    </div>
                                                                </div>

                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <Button variant="ghost" size="icon" aria-label="More">
                                                                            <MoreHorizontal className="h-4 w-4" />
                                                                        </Button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuItem
                                                                            onClick={() => copyText(p.staffName, "Name")}
                                                                            className="gap-2"
                                                                        >
                                                                            <Copy className="h-4 w-4" />
                                                                            Copy name
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem
                                                                            onClick={() => copyText(p.staffEmail, "Email")}
                                                                            className="gap-2"
                                                                        >
                                                                            <Copy className="h-4 w-4" />
                                                                            Copy email
                                                                        </DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </DialogContent>
                                </Dialog>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setTab("upcoming")
                                        setRange(undefined)
                                        setStatus("all")
                                        setQ("")
                                    }}
                                >
                                    Reset filters
                                </Button>
                            </div>
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader className="space-y-1">
                            <CardTitle className="text-xl">Filters</CardTitle>
                            <CardDescription>Search and narrow down schedules.</CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="search">Search</Label>
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="search"
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        placeholder="Room, status, or thesis title..."
                                        className="pl-9"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Status</Label>
                                <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        <SelectItem value="scheduled">Scheduled</SelectItem>
                                        <SelectItem value="completed">Completed</SelectItem>
                                        <SelectItem value="cancelled">Cancelled</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Date range</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-start gap-2">
                                            <CalendarIcon className="h-4 w-4" />
                                            {range?.from ? (
                                                range.to ? (
                                                    <span className="text-sm">
                                                        {fmtDate(range.from.toISOString())} - {fmtDate(range.to.toISOString())}
                                                    </span>
                                                ) : (
                                                    <span className="text-sm">{fmtDate(range.from.toISOString())}</span>
                                                )
                                            ) : (
                                                <span className="text-sm text-muted-foreground">Pick a date range</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="start" className="p-2">
                                        <Calendar mode="range" selected={range} onSelect={setRange} numberOfMonths={2} />
                                        <div className="mt-2 flex items-center justify-end gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => setRange(undefined)}>
                                                Clear
                                            </Button>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                                <p className="text-xs text-muted-foreground">
                                    Tip: Tabs (Upcoming/All/Past) auto-set dates when no range is chosen.
                                </p>
                            </div>
                        </CardContent>

                        <CardFooter className="flex items-center justify-between">
                            <Badge variant="outline">Student</Badge>
                            <Badge variant="outline">{user?.email ?? "—"}</Badge>
                        </CardFooter>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="space-y-1">
                                <CardTitle className="text-xl">Schedule List</CardTitle>
                                <CardDescription>All schedules you’re allowed to view.</CardDescription>
                            </div>

                            <Tabs value={tab} onValueChange={(v: any) => setTab(v)} className="w-full sm:w-auto">
                                <TabsList>
                                    <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                                    <TabsTrigger value="all">All</TabsTrigger>
                                    <TabsTrigger value="past">Past</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        {loading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : error ? (
                            <Alert variant="destructive">
                                <AlertTitle>Could not load schedules</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        ) : emptyState ? (
                            <Alert>
                                <AlertTitle>No schedules found</AlertTitle>
                                <AlertDescription>
                                    Try adjusting your filters, or check again later if your defense hasn’t been scheduled yet.
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <ScrollArea className="w-full">
                                <div className="min-w-180">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Date & Time</TableHead>
                                                <TableHead>Room</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Thesis Title</TableHead>
                                                <TableHead>Program</TableHead>
                                                <TableHead>Term</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {rows.map((r) => (
                                                <TableRow key={r.id}>
                                                    <TableCell className="whitespace-nowrap">{fmtDateTime(r.scheduledAt)}</TableCell>
                                                    <TableCell>{r.room ? r.room : "—"}</TableCell>
                                                    <TableCell>
                                                        <HoverCard>
                                                            <HoverCardTrigger asChild>
                                                                <Badge variant={statusBadgeVariant(r.status)} className="cursor-help">
                                                                    {String(r.status || "scheduled").toUpperCase()}
                                                                </Badge>
                                                            </HoverCardTrigger>
                                                            <HoverCardContent className="text-sm">{statusHelp(r.status)}</HoverCardContent>
                                                        </HoverCard>
                                                    </TableCell>
                                                    <TableCell className="max-w-sm truncate">{r.groupTitle ? r.groupTitle : "—"}</TableCell>
                                                    <TableCell>{r.program ? r.program : "—"}</TableCell>
                                                    <TableCell>{r.term ? r.term : "—"}</TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Sheet>
                                                                <SheetTrigger asChild>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="secondary"
                                                                        onClick={() => {
                                                                            setSelected(r)
                                                                            setPanelists([])
                                                                            setPanelistsError(null)
                                                                        }}
                                                                        className="gap-2"
                                                                    >
                                                                        <Eye className="h-4 w-4" />
                                                                        View
                                                                    </Button>
                                                                </SheetTrigger>
                                                                <SheetContent className="w-full sm:max-w-xl">
                                                                    <SheetHeader>
                                                                        <SheetTitle>Schedule Details</SheetTitle>
                                                                        <SheetDescription>
                                                                            Date/time, room, status, and (if available) panelists.
                                                                        </SheetDescription>
                                                                    </SheetHeader>

                                                                    <div className="mt-5 space-y-4">
                                                                        <div className="rounded-lg border p-3 space-y-2">
                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                <Badge variant={statusBadgeVariant(selected?.status ?? "")}>
                                                                                    {String(selected?.status ?? "scheduled").toUpperCase()}
                                                                                </Badge>
                                                                                <Badge variant="outline">
                                                                                    {selected ? fmtDateTime(selected.scheduledAt) : "—"}
                                                                                </Badge>
                                                                                {selected?.room ? (
                                                                                    <Badge variant="outline">Room: {selected.room}</Badge>
                                                                                ) : null}
                                                                            </div>

                                                                            <Separator />

                                                                            <div className="grid gap-3 sm:grid-cols-2">
                                                                                <div>
                                                                                    <p className="text-xs text-muted-foreground">Thesis Title</p>
                                                                                    <p className="text-sm font-medium">{selected?.groupTitle ?? "—"}</p>
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-xs text-muted-foreground">Group ID</p>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <p className="text-sm font-medium truncate">{selected?.groupId ?? "—"}</p>
                                                                                        {selected?.groupId ? (
                                                                                            <Button
                                                                                                size="icon"
                                                                                                variant="ghost"
                                                                                                onClick={() => copyText(selected.groupId, "Group ID")}
                                                                                                aria-label="Copy group ID"
                                                                                            >
                                                                                                <Copy className="h-4 w-4" />
                                                                                            </Button>
                                                                                        ) : null}
                                                                                    </div>
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-xs text-muted-foreground">Program</p>
                                                                                    <p className="text-sm font-medium">{selected?.program ?? "—"}</p>
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-xs text-muted-foreground">Term</p>
                                                                                    <p className="text-sm font-medium">{selected?.term ?? "—"}</p>
                                                                                </div>
                                                                            </div>

                                                                            <Separator />

                                                                            <div className="flex items-center justify-between gap-2">
                                                                                <p className="text-xs text-muted-foreground">Schedule ID</p>
                                                                                <div className="flex items-center gap-2">
                                                                                    <p className="text-xs font-mono truncate max-w-60">
                                                                                        {selected?.id ?? "—"}
                                                                                    </p>
                                                                                    {selected?.id ? (
                                                                                        <Button
                                                                                            size="icon"
                                                                                            variant="ghost"
                                                                                            onClick={() => copyText(selected.id, "Schedule ID")}
                                                                                            aria-label="Copy schedule ID"
                                                                                        >
                                                                                            <Copy className="h-4 w-4" />
                                                                                        </Button>
                                                                                    ) : null}
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <div className="flex items-center gap-2">
                                                                                <UsersIcon className="h-4 w-4 text-muted-foreground" />
                                                                                <p className="text-sm font-medium">Panelists</p>
                                                                            </div>

                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                onClick={async () => {
                                                                                    if (!selected?.id) return
                                                                                    await loadPanelists(selected.id)
                                                                                }}
                                                                            >
                                                                                Load panelists
                                                                            </Button>
                                                                        </div>

                                                                        {panelistsLoading ? (
                                                                            <div className="space-y-2">
                                                                                <Skeleton className="h-10 w-full" />
                                                                                <Skeleton className="h-10 w-full" />
                                                                                <Skeleton className="h-10 w-full" />
                                                                            </div>
                                                                        ) : panelistsError ? (
                                                                            <Alert variant="destructive">
                                                                                <AlertTitle>Unable to load panelists</AlertTitle>
                                                                                <AlertDescription>{panelistsError}</AlertDescription>
                                                                            </Alert>
                                                                        ) : panelists.length === 0 ? (
                                                                            <Alert>
                                                                                <AlertTitle>No panelists listed</AlertTitle>
                                                                                <AlertDescription>
                                                                                    Panelists may not be assigned yet.
                                                                                </AlertDescription>
                                                                            </Alert>
                                                                        ) : (
                                                                            <div className="space-y-2">
                                                                                {panelists.map((p) => (
                                                                                    <div
                                                                                        key={`${p.scheduleId}-${p.staffId}`}
                                                                                        className="flex items-center justify-between gap-3 rounded-lg border p-3"
                                                                                    >
                                                                                        <div className="flex items-center gap-3">
                                                                                            <Avatar className="h-9 w-9">
                                                                                                <AvatarFallback>
                                                                                                    {safeInitials(p.staffName || p.staffEmail)}
                                                                                                </AvatarFallback>
                                                                                            </Avatar>
                                                                                            <div>
                                                                                                <p className="text-sm font-medium">{p.staffName}</p>
                                                                                                <p className="text-xs text-muted-foreground">{p.staffEmail}</p>
                                                                                            </div>
                                                                                        </div>

                                                                                        <DropdownMenu>
                                                                                            <DropdownMenuTrigger asChild>
                                                                                                <Button variant="ghost" size="icon" aria-label="More">
                                                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                                                </Button>
                                                                                            </DropdownMenuTrigger>
                                                                                            <DropdownMenuContent align="end">
                                                                                                <DropdownMenuItem
                                                                                                    className="gap-2"
                                                                                                    onClick={() => copyText(p.staffName, "Name")}
                                                                                                >
                                                                                                    <Copy className="h-4 w-4" />
                                                                                                    Copy name
                                                                                                </DropdownMenuItem>
                                                                                                <DropdownMenuItem
                                                                                                    className="gap-2"
                                                                                                    onClick={() => copyText(p.staffEmail, "Email")}
                                                                                                >
                                                                                                    <Copy className="h-4 w-4" />
                                                                                                    Copy email
                                                                                                </DropdownMenuItem>
                                                                                            </DropdownMenuContent>
                                                                                        </DropdownMenu>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}

                                                                        <Separator />

                                                                        <Accordion type="single" collapsible>
                                                                            <AccordionItem value="tips">
                                                                                <AccordionTrigger>Tips for your defense day</AccordionTrigger>
                                                                                <AccordionContent>
                                                                                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                                                                                        <li>Arrive early and confirm your room assignment.</li>
                                                                                        <li>Prepare your slides and backup files.</li>
                                                                                        <li>Check panelists list and coordinate if needed.</li>
                                                                                        <li>Follow any department-specific guidelines.</li>
                                                                                    </ul>
                                                                                </AccordionContent>
                                                                            </AccordionItem>
                                                                        </Accordion>
                                                                    </div>
                                                                </SheetContent>
                                                            </Sheet>

                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" size="icon" aria-label="More actions">
                                                                        <MoreHorizontal className="h-4 w-4" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem
                                                                        className="gap-2"
                                                                        onClick={() => copyText(r.id, "Schedule ID")}
                                                                    >
                                                                        <Copy className="h-4 w-4" />
                                                                        Copy schedule ID
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem
                                                                        className="gap-2"
                                                                        onClick={() => {
                                                                            setSelected(r)
                                                                            toast.message("Opened details", {
                                                                                description: "Use View to see full details and panelists.",
                                                                            })
                                                                        }}
                                                                    >
                                                                        <Info className="h-4 w-4" />
                                                                        Quick info
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </ScrollArea>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl">Notes</CardTitle>
                        <CardDescription>These are read-only schedule details.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Accordion type="single" collapsible>
                            <AccordionItem value="privacy">
                                <AccordionTrigger>Privacy</AccordionTrigger>
                                <AccordionContent className="text-sm text-muted-foreground">
                                    You can only view schedules assigned to your thesis group. If you see an empty list,
                                    your schedule may not be published yet.
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="changes">
                                <AccordionTrigger>Schedule changes</AccordionTrigger>
                                <AccordionContent className="text-sm text-muted-foreground">
                                    If your schedule is rescheduled, the system will show the updated date/time and status.
                                    Refresh to load the latest information.
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
