/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CalendarDays, Eye, Filter, Loader2, RefreshCw, Search } from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"
import { useApi } from "@/hooks/use-api"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
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

    // optional enrichment
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

function statusBadge(status: string) {
    const s = String(status || "").toLowerCase()
    if (s === "scheduled") return <Badge>Scheduled</Badge>
    if (s === "completed" || s === "done") return <Badge variant="secondary">Completed</Badge>
    if (s === "cancelled" || s === "canceled") return <Badge variant="destructive">Cancelled</Badge>
    if (s === "ongoing" || s === "in_progress") return <Badge variant="outline">Ongoing</Badge>
    return <Badge variant="outline">{status || "unknown"}</Badge>
}

function normalizeGroup(group: any): ThesisGroupOption | null {
    if (!group) return null
    const id = String(group?.id ?? group?.groupId ?? group?.group_id ?? "").trim()
    if (!id) return null
    const title = String(group?.title ?? group?.name ?? "").trim()
    return {
        id,
        title: title || `Group ${id.slice(0, 8)}…`,
        program: group?.program ?? null,
        term: group?.term ?? null,
    }
}

export default function StudentSchedulesPage() {
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

    // cache of group meta for rendering
    const [groupMetaById, setGroupMetaById] = React.useState<Record<string, ThesisGroupOption>>({})

    // ✅ IMPORTANT: memoize these so their references don't change every render
    const schedules = React.useMemo(() => data?.schedules ?? [], [data?.schedules])
    const total = React.useMemo(() => data?.total ?? 0, [data?.total])

    const canPrev = page > 0
    const canNext = (page + 1) * limit < total

    React.useEffect(() => {
        if (!loading && (!user || String(user.role ?? "").toLowerCase() !== "student")) {
            router.replace("/auth/login")
        }
    }, [loading, user, router])

    const fetchThesisGroupById = React.useCallback(
        async (gid: string): Promise<ThesisGroupOption | null> => {
            const params = new URLSearchParams()
            params.set("resource", "groups")
            params.set("id", gid)

            try {
                const res = await api.request<ThesisGroupByIdResponse>(`/api/thesis?${params.toString()}`)
                if (!res || (res as any).ok !== true) return null
                const ok = res as ThesisGroupByIdOk
                return normalizeGroup(ok.group)
            } catch {
                return null
            }
        },
        [api]
    )

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
        if (!loading && user?.role === "student") fetchList()
    }, [fetchList, loading, user])

    const resetFilters = () => {
        setQ("")
        setStatus("all")
        setFromDate(undefined)
        setToDate(undefined)
        setPage(0)
    }

    // ensure group meta for schedules currently visible
    React.useEffect(() => {
        const ids = Array.from(new Set((schedules ?? []).map((s) => String(s.groupId ?? "").trim()).filter(Boolean)))
        if (!ids.length) return

        const missing = ids.filter((id) => !groupMetaById[id])
        if (!missing.length) return

        let cancelled = false
            ; (async () => {
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

    const upcoming = React.useMemo(() => {
        const now = Date.now()
        const sorted = [...schedules].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
        const next = sorted.find((r) => new Date(r.scheduledAt).getTime() >= now)
        return next ?? sorted[0] ?? null
    }, [schedules])

    const upcomingTitle = React.useMemo(() => {
        if (!upcoming) return ""
        const cached = groupMetaById[String(upcoming.groupId ?? "").trim()]
        return (
            (upcoming.groupTitle ?? upcoming.group_title ?? "").trim() ||
            (cached?.title ?? "").trim() ||
            upcoming.groupId
        )
    }, [upcoming, groupMetaById])

    const upcomingMeta = React.useMemo(() => {
        if (!upcoming) return ""
        const cached = groupMetaById[String(upcoming.groupId ?? "").trim()]
        return [
            (upcoming.program ?? cached?.program ?? null)?.toString().trim()
                ? (upcoming.program ?? cached?.program)
                : null,
            (upcoming.term ?? cached?.term ?? null)?.toString().trim() ? (upcoming.term ?? cached?.term) : null,
        ]
            .filter(Boolean)
            .join(" • ")
    }, [upcoming, groupMetaById])

    return (
        <DashboardLayout>
            <TooltipProvider>
                <div className="space-y-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <CalendarDays className="h-5 w-5 text-muted-foreground" />
                                <h1 className="text-xl font-semibold tracking-tight">My Defense Schedule</h1>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                View your schedule (date/time/room/status) and open a schedule to see panelists and details.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={fetchList} disabled={busy}>
                                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                Refresh
                            </Button>

                            <Button variant="secondary" asChild>
                                <Link href="/dashboard/student/evaluation">
                                    <Eye className="mr-2 h-4 w-4" />
                                    My Evaluation
                                </Link>
                            </Button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-64 w-full" />
                        </div>
                    ) : !user || String(user.role ?? "").toLowerCase() !== "student" ? (
                        <Alert variant="destructive">
                            <AlertTitle>Unauthorized</AlertTitle>
                            <AlertDescription>Please login as student to access schedules.</AlertDescription>
                        </Alert>
                    ) : (
                        <>
                            <Card>
                                <CardHeader className="space-y-2">
                                    <CardTitle>Next schedule</CardTitle>
                                    <CardDescription>Your nearest schedule (if available).</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {!upcoming ? (
                                        <Alert>
                                            <AlertTitle>No schedule yet</AlertTitle>
                                            <AlertDescription>
                                                You don’t have a published defense schedule right now. Please check again later.
                                            </AlertDescription>
                                        </Alert>
                                    ) : (
                                        <div className="grid gap-3 sm:grid-cols-4">
                                            <div className="rounded-md border p-3 sm:col-span-2">
                                                <div className="text-xs text-muted-foreground">Thesis / Group</div>
                                                <div className="mt-1 text-sm font-medium">{upcomingTitle}</div>
                                                <div className="mt-1 text-xs text-muted-foreground">{upcomingMeta || "—"}</div>
                                            </div>

                                            <div className="rounded-md border p-3">
                                                <div className="text-xs text-muted-foreground">Scheduled</div>
                                                <div className="mt-1 text-sm font-medium">{formatDateTime(upcoming.scheduledAt)}</div>
                                            </div>

                                            <div className="rounded-md border p-3">
                                                <div className="text-xs text-muted-foreground">Room / Status</div>
                                                <div className="mt-1 text-sm font-medium">{upcoming.room?.trim() ? upcoming.room : "—"}</div>
                                                <div className="mt-2">{statusBadge(upcoming.status)}</div>
                                            </div>

                                            <div className="sm:col-span-4 flex items-center justify-end">
                                                <Button asChild>
                                                    <Link href={`/dashboard/student/schedule/${upcoming.id}`}>Open details</Link>
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

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
                                    <ScrollArea className="w-full">
                                        <div className="rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead className="w-56">Scheduled</TableHead>
                                                        <TableHead>Thesis / Group</TableHead>
                                                        <TableHead className="w-40">Room</TableHead>
                                                        <TableHead className="w-32">Status</TableHead>
                                                        <TableHead className="w-28 text-right">Action</TableHead>
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
                                                                        <Button size="sm" asChild>
                                                                            <Link href={`/dashboard/student/schedule/${s.id}`}>Open</Link>
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            )
                                                        })
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </ScrollArea>

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
                        </>
                    )}
                </div>
            </TooltipProvider>
        </DashboardLayout>
    )
}
