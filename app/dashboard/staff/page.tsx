/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    BarChart3,
    CalendarDays,
    ClipboardList,
    Eye,
    RefreshCw,
    Search,
    Sparkles,
    Waypoints,
} from "lucide-react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis,
} from "recharts"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

type ApiOk<T> = { ok: true } & T

type DefenseSchedule = {
    id: string
    groupId: string
    scheduledAt: string
    room: string | null
    status: string
    createdBy: string | null
    createdAt: string
    updatedAt: string
    groupTitle?: string | null
    group_title?: string | null
    program?: string | null
    term?: string | null
}

type RubricTemplate = {
    id: string
    name: string
    version: number
    active: boolean
    description: string | null
    createdAt: string
    updatedAt: string
}

type DbEvaluation = {
    id: string
    scheduleId: string
    evaluatorId: string
    status: string
    submittedAt: string | null
    lockedAt: string | null
    createdAt: string
}

type DbThesisGroup = {
    id: string
    title: string
    adviserId: string | null
    program: string | null
    term: string | null
    createdAt: string
    updatedAt: string
}

type ThesisGroupOption = {
    id: string
    title: string
    program?: string | null
    term?: string | null
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
        },
    })

    const text = await res.text()
    let data: any = null
    try {
        data = text ? JSON.parse(text) : null
    } catch {
        data = null
    }

    if (!res.ok) {
        const msg = data?.message || `Request failed (${res.status})`
        throw new Error(msg)
    }

    if (data && data.ok === false) {
        throw new Error(data?.message || "Request failed")
    }

    return data as T
}

function safeDate(v: string | null | undefined) {
    const d = new Date(String(v ?? ""))
    if (Number.isNaN(d.getTime())) return null
    return d
}

function formatDateTime(iso: string | null | undefined) {
    if (!iso) return "—"
    const d = safeDate(iso)
    if (!d) return "—"
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(d)
}

function formatShort(iso: string | null | undefined) {
    if (!iso) return "—"
    const d = safeDate(iso)
    if (!d) return "—"
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" }).format(d)
}

function normStatus(s: string) {
    const v = String(s ?? "").toLowerCase().trim()
    if (!v) return "other"
    if (v === "scheduled") return "scheduled"
    if (v === "ongoing" || v === "in_progress") return "ongoing"
    if (v === "completed" || v === "done") return "completed"
    if (v === "cancelled" || v === "canceled") return "cancelled"
    if (v === "pending") return "pending"
    if (v === "submitted") return "submitted"
    if (v === "locked" || v === "finalized") return "locked"
    return "other"
}

function statusBadge(label: string) {
    const s = normStatus(label)
    if (s === "scheduled") return <Badge>Scheduled</Badge>
    if (s === "ongoing") return <Badge variant="outline">Ongoing</Badge>
    if (s === "completed") return <Badge variant="secondary">Completed</Badge>
    if (s === "cancelled") return <Badge variant="destructive">Cancelled</Badge>
    if (s === "pending") return <Badge variant="outline">Pending</Badge>
    if (s === "submitted") return <Badge variant="secondary">Submitted</Badge>
    if (s === "locked") return <Badge>Locked</Badge>
    return <Badge variant="outline">{label || "Other"}</Badge>
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

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n))
}

/**
 * IMPORTANT:
 * Your globals.css defines --chart-* and --border as HEX values.
 * So DO NOT wrap them in hsl(...). Use var(--chart-1) directly.
 */
function colorVar(name: string) {
    return `var(--${name})`
}

function pieColor(name: string) {
    const n = String(name ?? "").toLowerCase()
    if (n === "scheduled") return colorVar("chart-1")
    if (n === "ongoing") return colorVar("chart-2")
    if (n === "completed") return colorVar("chart-3")
    if (n === "cancelled") return colorVar("chart-4")
    if (n === "pending") return colorVar("chart-2")
    if (n === "submitted") return colorVar("chart-3")
    if (n === "locked") return colorVar("chart-1")
    if (n === "active") return colorVar("chart-3")
    if (n === "inactive") return colorVar("chart-5")
    return colorVar("chart-5")
}

function StatCard(props: {
    title: string
    icon: React.ReactNode
    value: React.ReactNode
    hint?: React.ReactNode
    footer?: React.ReactNode
}) {
    return (
        <Card>
            <CardHeader className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{props.title}</CardTitle>
                    <div className="text-muted-foreground">{props.icon}</div>
                </div>
                <div className="text-2xl font-semibold">{props.value}</div>
                {props.hint ? <CardDescription>{props.hint}</CardDescription> : null}
            </CardHeader>
            {props.footer ? <CardContent className="pt-0">{props.footer}</CardContent> : null}
        </Card>
    )
}

export default function StaffDashboardPage() {
    const router = useRouter()
    const { user, isLoading, loading } = useAuth() as any
    const authLoading = Boolean(isLoading ?? loading)

    const role = String(user?.role ?? "").toLowerCase()
    const isStaff = role === "staff"
    const isAdmin = role === "admin"
    const canView = isStaff || isAdmin

    const actorId = String(user?.id ?? "").trim()

    const [busy, setBusy] = React.useState(false)
    const [lastUpdatedAt, setLastUpdatedAt] = React.useState<string | null>(null)

    const [schedules, setSchedules] = React.useState<DefenseSchedule[]>([])
    const [evaluations, setEvaluations] = React.useState<DbEvaluation[]>([])
    const [rubrics, setRubrics] = React.useState<RubricTemplate[]>([])

    const [groupMetaById, setGroupMetaById] = React.useState<Record<string, ThesisGroupOption>>({})

    const [qSchedules, setQSchedules] = React.useState("")
    const [qEvaluations, setQEvaluations] = React.useState("")
    const [qRubrics, setQRubrics] = React.useState("")

    const [navOpen, setNavOpen] = React.useState(false)

    React.useEffect(() => {
        if (authLoading) return
        if (!user) {
            router.replace("/auth/login")
            return
        }
        if (!canView) return
    }, [authLoading, user, canView, router])

    const load = React.useCallback(async () => {
        if (!canView) return
        setBusy(true)
        try {
            // NOTE: /api/evaluation validation commonly caps limit <= 200.
            // Your request was failing with limit=500 (400 Bad Request), so we clamp to 200.
            const LIMIT = "200"

            const schedulesUrl = `/api/schedule?resource=schedules&limit=${LIMIT}&offset=0`
            const rubricsUrl = `/api/evaluation?resource=rubricTemplates&q=&limit=${LIMIT}&offset=0`

            const sp = new URLSearchParams()
            sp.set("resource", "evaluations")
            sp.set("limit", LIMIT)
            sp.set("offset", "0")

            // staff/admin dashboard should load "mine" for evaluations here
            if ((isStaff || isAdmin) && actorId) sp.set("evaluatorId", actorId)

            const evaluationsUrl = `/api/evaluation?${sp.toString()}`

            const [schRes, rbRes, evRes] = await Promise.all([
                fetchJson<any>(schedulesUrl),
                fetchJson<any>(rubricsUrl),
                fetchJson<any>(evaluationsUrl),
            ])

            const schList: DefenseSchedule[] = Array.isArray(schRes?.schedules) ? schRes.schedules : []
            const rbList: RubricTemplate[] = Array.isArray(rbRes?.templates) ? rbRes.templates : []
            const evList: DbEvaluation[] = Array.isArray(evRes?.evaluations) ? evRes.evaluations : []

            setSchedules(schList)
            setRubrics(rbList)
            setEvaluations(evList)

            setLastUpdatedAt(new Date().toISOString())

            // Warm group meta cache for what we will render (upcoming schedules + pending eval schedules)
            const now = Date.now()
            const upcoming = schList
                .filter((s) => {
                    const d = safeDate(s.scheduledAt)
                    if (!d) return false
                    const st = normStatus(s.status)
                    if (st === "cancelled") return false
                    if (st === "completed") return false
                    return d.getTime() >= now
                })
                .sort((a, b) => (safeDate(a.scheduledAt)?.getTime() ?? 0) - (safeDate(b.scheduledAt)?.getTime() ?? 0))
                .slice(0, 12)

            const scheduleById = new Map<string, DefenseSchedule>()
            for (const s of schList) scheduleById.set(String(s.id), s)

            const pending = evList
                .filter((e) => normStatus(e.status) === "pending")
                .slice(0, 20)
                .map((e) => scheduleById.get(String(e.scheduleId)))
                .filter(Boolean) as DefenseSchedule[]

            const wantGroupIds = Array.from(
                new Set(
                    [...upcoming, ...pending]
                        .map((s) => String(s.groupId ?? "").trim())
                        .filter(Boolean)
                )
            )

            const missing = wantGroupIds.filter((gid) => !groupMetaById[gid])
            if (missing.length) {
                const fetched = await Promise.all(
                    missing.map(async (gid) => {
                        try {
                            const gr = await fetchJson<ApiOk<{ group: DbThesisGroup }>>(
                                `/api/thesis?resource=groups&id=${encodeURIComponent(gid)}`
                            )
                            const normalized = normalizeGroups([gr.group])
                            return normalized[0] ?? null
                        } catch {
                            return null
                        }
                    })
                )

                const items = fetched.filter(Boolean) as ThesisGroupOption[]
                if (items.length) {
                    setGroupMetaById((prev) => {
                        const next = { ...prev }
                        for (const g of items) next[g.id] = g
                        return next
                    })
                }
            }
        } catch (err: any) {
            toast.error("Failed to load dashboard", { description: err?.message ?? "Please try again." })
        } finally {
            setBusy(false)
        }
    }, [actorId, canView, isAdmin, isStaff, groupMetaById])

    React.useEffect(() => {
        if (authLoading) return
        if (!canView) return
        if (!actorId && !isAdmin) return
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, canView, actorId])

    const scheduleById = React.useMemo(() => {
        const m = new Map<string, DefenseSchedule>()
        for (const s of schedules) m.set(String(s.id), s)
        return m
    }, [schedules])

    const scheduleStatusCounts = React.useMemo(() => {
        const counts: Record<string, number> = { scheduled: 0, ongoing: 0, completed: 0, cancelled: 0, other: 0 }
        for (const s of schedules) counts[normStatus(s.status)] = (counts[normStatus(s.status)] ?? 0) + 1
        return counts
    }, [schedules])

    const evalStatusCounts = React.useMemo(() => {
        const counts: Record<string, number> = { pending: 0, submitted: 0, locked: 0, other: 0 }
        for (const e of evaluations) counts[normStatus(e.status)] = (counts[normStatus(e.status)] ?? 0) + 1
        return counts
    }, [evaluations])

    const rubricCounts = React.useMemo(() => {
        let active = 0
        let inactive = 0
        // ✅ Fix eslint@typescript-eslint/no-unused-expressions:
        // Use an if/else instead of a ternary expression statement.
        for (const r of rubrics) {
            if (r.active) active += 1
            else inactive += 1
        }
        return { active, inactive }
    }, [rubrics])

    const completionRate = React.useMemo(() => {
        const total = evaluations.length
        if (!total) return 0
        const done = (evalStatusCounts.locked ?? 0) + (evalStatusCounts.submitted ?? 0)
        return clamp(Math.round((done / total) * 100), 0, 100)
    }, [evaluations.length, evalStatusCounts.locked, evalStatusCounts.submitted])

    const nextUpcomingSchedule = React.useMemo(() => {
        const now = Date.now()
        const list = schedules
            .filter((s) => {
                const d = safeDate(s.scheduledAt)
                if (!d) return false
                const st = normStatus(s.status)
                if (st === "cancelled" || st === "completed") return false
                return d.getTime() >= now
            })
            .sort((a, b) => (safeDate(a.scheduledAt)?.getTime() ?? 0) - (safeDate(b.scheduledAt)?.getTime() ?? 0))
        return list[0] ?? null
    }, [schedules])

    const upcomingSchedules = React.useMemo(() => {
        const now = Date.now()
        const list = schedules
            .filter((s) => {
                const d = safeDate(s.scheduledAt)
                if (!d) return false
                const st = normStatus(s.status)
                if (st === "cancelled" || st === "completed") return false
                return d.getTime() >= now
            })
            .sort((a, b) => (safeDate(a.scheduledAt)?.getTime() ?? 0) - (safeDate(b.scheduledAt)?.getTime() ?? 0))

        const q = qSchedules.trim().toLowerCase()
        if (!q) return list.slice(0, 25)

        return list
            .filter((s) => {
                const g = groupMetaById[String(s.groupId ?? "").trim()]
                const title = String(s.groupTitle ?? s.group_title ?? g?.title ?? "").toLowerCase()
                const room = String(s.room ?? "").toLowerCase()
                const st = String(s.status ?? "").toLowerCase()
                const meta = [g?.program, g?.term].filter(Boolean).join(" ").toLowerCase()
                return title.includes(q) || room.includes(q) || st.includes(q) || meta.includes(q)
            })
            .slice(0, 25)
    }, [schedules, qSchedules, groupMetaById])

    const pendingEvaluations = React.useMemo(() => {
        const base = evaluations
            .filter((e) => normStatus(e.status) === "pending")
            .map((e) => {
                const sch = scheduleById.get(String(e.scheduleId)) ?? null
                const grp = sch?.groupId ? groupMetaById[String(sch.groupId).trim()] : undefined
                const title = String(grp?.title ?? sch?.groupTitle ?? sch?.group_title ?? "").trim()
                const program = String(grp?.program ?? sch?.program ?? "").trim()
                const term = String(grp?.term ?? sch?.term ?? "").trim()

                return {
                    evaluationId: e.id,
                    scheduleId: e.scheduleId,
                    scheduledAt: sch?.scheduledAt ?? null,
                    room: sch?.room ?? null,
                    groupTitle: title || (sch?.groupId ? `Group ${String(sch.groupId).slice(0, 8)}…` : "—"),
                    program: program || null,
                    term: term || null,
                }
            })
            .sort((a, b) => (safeDate(a.scheduledAt)?.getTime() ?? 0) - (safeDate(b.scheduledAt)?.getTime() ?? 0))

        const q = qEvaluations.trim().toLowerCase()
        if (!q) return base.slice(0, 25)

        return base
            .filter((r) => {
                const a = String(r.groupTitle ?? "").toLowerCase()
                const b = String(r.program ?? "").toLowerCase()
                const c = String(r.term ?? "").toLowerCase()
                const d = String(r.room ?? "").toLowerCase()
                return a.includes(q) || b.includes(q) || c.includes(q) || d.includes(q)
            })
            .slice(0, 25)
    }, [evaluations, scheduleById, groupMetaById, qEvaluations])

    const recentRubrics = React.useMemo(() => {
        const list = [...rubrics].sort(
            (a, b) => (safeDate(b.updatedAt)?.getTime() ?? 0) - (safeDate(a.updatedAt)?.getTime() ?? 0)
        )
        const q = qRubrics.trim().toLowerCase()
        if (!q) return list.slice(0, 25)

        return list
            .filter((t) => {
                const name = String(t.name ?? "").toLowerCase()
                const desc = String(t.description ?? "").toLowerCase()
                const ver = String(t.version ?? "")
                return name.includes(q) || desc.includes(q) || ver.includes(q)
            })
            .slice(0, 25)
    }, [rubrics, qRubrics])

    const schedulesNext14DaysChart = React.useMemo(() => {
        const now = new Date()
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const days = 14

        const buckets = Array.from({ length: days }, (_, i) => {
            const d = new Date(start)
            d.setDate(d.getDate() + i)
            const key = d.toISOString().slice(0, 10)
            return {
                key,
                label: new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" }).format(d),
                total: 0,
                scheduled: 0,
                ongoing: 0,
                completed: 0,
                cancelled: 0,
            }
        })

        const idxByKey = new Map<string, number>()
        for (let i = 0; i < buckets.length; i++) idxByKey.set(buckets[i].key, i)

        for (const s of schedules) {
            const d = safeDate(s.scheduledAt)
            if (!d) continue
            const key = d.toISOString().slice(0, 10)
            const idx = idxByKey.get(key)
            if (idx === undefined) continue

            buckets[idx].total += 1
            const st = normStatus(s.status)
            if (st === "scheduled") buckets[idx].scheduled += 1
            else if (st === "ongoing") buckets[idx].ongoing += 1
            else if (st === "completed") buckets[idx].completed += 1
            else if (st === "cancelled") buckets[idx].cancelled += 1
        }

        return buckets
    }, [schedules])

    const scheduleStatusPie = React.useMemo(() => {
        const order = ["scheduled", "ongoing", "completed", "cancelled", "other"] as const
        return order
            .map((k) => ({ name: k, value: Number(scheduleStatusCounts[k] ?? 0) }))
            .filter((x) => x.value > 0)
    }, [scheduleStatusCounts])

    const evaluationStatusPie = React.useMemo(() => {
        const order = ["pending", "submitted", "locked", "other"] as const
        return order
            .map((k) => ({ name: k, value: Number(evalStatusCounts[k] ?? 0) }))
            .filter((x) => x.value > 0)
    }, [evalStatusCounts])

    const rubricStatusPie = React.useMemo(() => {
        const items = [
            { name: "active", value: rubricCounts.active },
            { name: "inactive", value: rubricCounts.inactive },
        ]
        return items.filter((x) => x.value > 0)
    }, [rubricCounts])

    const headerMeta = React.useMemo(() => {
        const name = String(user?.name ?? user?.fullName ?? user?.email ?? "Staff").trim()
        const updated = lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "—"
        return { name, updated }
    }, [user, lastUpdatedAt])

    return (
        <DashboardLayout>
            <TooltipProvider>
                <div className="space-y-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-muted-foreground" />
                                <h1 className="text-2xl font-semibold tracking-tight">Staff Dashboard</h1>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Overview of schedules, rubrics, and your evaluation workload.
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="rounded-md border px-2 py-1">
                                    Signed in as{" "}
                                    <span className="font-medium text-foreground">{headerMeta.name}</span>
                                </span>
                                <span className="rounded-md border px-2 py-1">
                                    Last updated{" "}
                                    <span className="font-medium text-foreground">{headerMeta.updated}</span>
                                </span>
                                {isAdmin ? (
                                    <Badge variant="outline">Admin viewing staff area</Badge>
                                ) : (
                                    <Badge variant="outline">Staff</Badge>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Dialog open={navOpen} onOpenChange={setNavOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline">
                                        <Waypoints className="mr-2 h-4 w-4" />
                                        Quick navigate
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-lg">
                                    <DialogHeader>
                                        <DialogTitle>Go to</DialogTitle>
                                        <DialogDescription>Search and jump to common staff pages.</DialogDescription>
                                    </DialogHeader>

                                    <Command>
                                        <CommandInput placeholder="Type: schedules, evaluations, rubrics..." />
                                        <CommandList>
                                            <CommandEmpty>No results found.</CommandEmpty>
                                            <CommandGroup heading="Staff pages">
                                                <CommandItem onSelect={() => router.push("/dashboard/staff/schedules")}>
                                                    <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                                                    Schedules
                                                </CommandItem>
                                                <CommandItem onSelect={() => router.push("/dashboard/staff/evaluations")}>
                                                    <ClipboardList className="mr-2 h-4 w-4 text-muted-foreground" />
                                                    Evaluations
                                                </CommandItem>
                                                <CommandItem onSelect={() => router.push("/dashboard/staff/rubrics")}>
                                                    <BarChart3 className="mr-2 h-4 w-4 text-muted-foreground" />
                                                    Rubrics
                                                </CommandItem>
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </DialogContent>
                            </Dialog>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline">Actions</Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Open</DropdownMenuLabel>
                                    <DropdownMenuItem asChild>
                                        <Link href="/dashboard/staff/schedules">
                                            <span className="flex items-center">
                                                <CalendarDays className="mr-2 h-4 w-4" />
                                                Schedules
                                            </span>
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild>
                                        <Link href="/dashboard/staff/evaluations">
                                            <span className="flex items-center">
                                                <ClipboardList className="mr-2 h-4 w-4" />
                                                Evaluations
                                            </span>
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild>
                                        <Link href="/dashboard/staff/rubrics">
                                            <span className="flex items-center">
                                                <BarChart3 className="mr-2 h-4 w-4" />
                                                Rubrics
                                            </span>
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => load()} disabled={busy || authLoading || !canView}>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Refresh overview
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button onClick={() => load()} disabled={busy || authLoading || !canView}>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Refresh
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Reload schedules, rubrics, and your evaluations</TooltipContent>
                            </Tooltip>
                        </div>
                    </div>

                    {!canView && !authLoading ? (
                        <Alert variant="destructive">
                            <AlertTitle>Forbidden</AlertTitle>
                            <AlertDescription>This page is for Staff/Admin only.</AlertDescription>
                        </Alert>
                    ) : null}

                    {authLoading ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <Skeleton className="h-28 w-full" />
                            <Skeleton className="h-28 w-full" />
                            <Skeleton className="h-28 w-full" />
                            <Skeleton className="h-28 w-full" />
                        </div>
                    ) : canView ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <StatCard
                                title="Next schedule"
                                icon={<CalendarDays className="h-4 w-4" />}
                                value={nextUpcomingSchedule ? formatShort(nextUpcomingSchedule.scheduledAt) : "—"}
                                hint={
                                    nextUpcomingSchedule ? (
                                        <span className="inline-flex items-center gap-2">
                                            {statusBadge(nextUpcomingSchedule.status)}
                                            <span className="text-muted-foreground">
                                                {nextUpcomingSchedule.room?.trim() ? nextUpcomingSchedule.room : "No room"}
                                            </span>
                                        </span>
                                    ) : (
                                        "No upcoming schedules"
                                    )
                                }
                                footer={
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">View and manage schedules</span>
                                        <Link href="/dashboard/staff/schedules">
                                            <Button size="sm" variant="outline">
                                                <Eye className="mr-2 h-4 w-4" />
                                                Open
                                            </Button>
                                        </Link>
                                    </div>
                                }
                            />

                            <StatCard
                                title="Pending evaluations"
                                icon={<ClipboardList className="h-4 w-4" />}
                                value={String(evalStatusCounts.pending ?? 0)}
                                hint={
                                    evaluations.length ? (
                                        <span>
                                            Completion{" "}
                                            <span className="font-medium text-foreground">{completionRate}%</span>
                                        </span>
                                    ) : (
                                        "No evaluation assignments yet"
                                    )
                                }
                                footer={
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">Continue scoring your assignments</span>
                                        <Link href="/dashboard/staff/evaluations">
                                            <Button size="sm" variant="outline">
                                                <Eye className="mr-2 h-4 w-4" />
                                                Open
                                            </Button>
                                        </Link>
                                    </div>
                                }
                            />

                            <StatCard
                                title="Active rubrics"
                                icon={<BarChart3 className="h-4 w-4" />}
                                value={String(rubricCounts.active)}
                                hint={
                                    <span>
                                        Total templates{" "}
                                        <span className="font-medium text-foreground">{rubrics.length}</span>
                                    </span>
                                }
                                footer={
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">Review rubric templates and criteria</span>
                                        <Link href="/dashboard/staff/rubrics">
                                            <Button size="sm" variant="outline">
                                                <Eye className="mr-2 h-4 w-4" />
                                                Open
                                            </Button>
                                        </Link>
                                    </div>
                                }
                            />

                            <StatCard
                                title="Schedules total"
                                icon={<CalendarDays className="h-4 w-4" />}
                                value={String(schedules.length)}
                                hint={
                                    <span className="inline-flex items-center gap-2">
                                        <Badge variant="outline">Scheduled {scheduleStatusCounts.scheduled ?? 0}</Badge>
                                        <Badge variant="outline">Ongoing {scheduleStatusCounts.ongoing ?? 0}</Badge>
                                    </span>
                                }
                                footer={
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">This is the overall schedules pool</span>
                                        <Link href="/dashboard/staff/schedules">
                                            <Button size="sm" variant="outline">
                                                <Eye className="mr-2 h-4 w-4" />
                                                Open
                                            </Button>
                                        </Link>
                                    </div>
                                }
                            />
                        </div>
                    ) : null}

                    <Tabs defaultValue="overview">
                        <TabsList className="grid w-full grid-cols-4 sm:max-w-xl">
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="schedules">Schedules</TabsTrigger>
                            <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
                            <TabsTrigger value="rubrics">Rubrics</TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="space-y-4">
                            <div className="grid gap-4 lg:grid-cols-2">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Schedules (next 14 days)</CardTitle>
                                        <CardDescription>Daily schedule volume from the schedules module.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="h-72">
                                        {busy && schedules.length === 0 ? (
                                            <Skeleton className="h-full w-full" />
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={schedulesNext14DaysChart}>
                                                    <CartesianGrid stroke={colorVar("border")} strokeDasharray="3 3" />
                                                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                                                    <RechartsTooltip />
                                                    <Legend />
                                                    <Bar
                                                        dataKey="scheduled"
                                                        name="Scheduled"
                                                        fill={colorVar("chart-1")}
                                                        radius={[6, 6, 0, 0]}
                                                    />
                                                    <Bar
                                                        dataKey="ongoing"
                                                        name="Ongoing"
                                                        fill={colorVar("chart-2")}
                                                        radius={[6, 6, 0, 0]}
                                                    />
                                                    <Bar
                                                        dataKey="completed"
                                                        name="Completed"
                                                        fill={colorVar("chart-3")}
                                                        radius={[6, 6, 0, 0]}
                                                    />
                                                    <Bar
                                                        dataKey="cancelled"
                                                        name="Cancelled"
                                                        fill={colorVar("chart-4")}
                                                        radius={[6, 6, 0, 0]}
                                                    />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle>Evaluation status</CardTitle>
                                        <CardDescription>Your evaluation workload status breakdown.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="h-72">
                                        {busy && evaluations.length === 0 ? (
                                            <Skeleton className="h-full w-full" />
                                        ) : evaluationStatusPie.length === 0 ? (
                                            <div className="text-sm text-muted-foreground">No evaluation data.</div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <RechartsTooltip />
                                                    <Legend />
                                                    <Pie
                                                        data={evaluationStatusPie}
                                                        dataKey="value"
                                                        nameKey="name"
                                                        innerRadius={55}
                                                        outerRadius={95}
                                                        stroke={colorVar("border")}
                                                        strokeWidth={1}
                                                    >
                                                        {evaluationStatusPie.map((entry, idx) => (
                                                            <Cell
                                                                key={`${entry.name}-${idx}`}
                                                                fill={pieColor(entry.name)}
                                                            />
                                                        ))}
                                                    </Pie>
                                                </PieChart>
                                            </ResponsiveContainer>
                                        )}
                                    </CardContent>
                                    <CardContent className="pt-0">
                                        <div className="flex flex-wrap items-center gap-2 text-sm">
                                            <Badge variant="outline">Pending {evalStatusCounts.pending ?? 0}</Badge>
                                            <Badge variant="outline">Submitted {evalStatusCounts.submitted ?? 0}</Badge>
                                            <Badge variant="outline">Locked {evalStatusCounts.locked ?? 0}</Badge>
                                            <Separator orientation="vertical" className="h-4" />
                                            <span className="text-muted-foreground">
                                                Completion:{" "}
                                                <span className="font-medium text-foreground">{completionRate}%</span>
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-3">
                                <Card className="lg:col-span-1">
                                    <CardHeader>
                                        <CardTitle>Schedules status</CardTitle>
                                        <CardDescription>Overall schedule status breakdown.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="h-64">
                                        {scheduleStatusPie.length === 0 ? (
                                            <div className="text-sm text-muted-foreground">No schedule data.</div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <RechartsTooltip />
                                                    <Legend />
                                                    <Pie
                                                        data={scheduleStatusPie}
                                                        dataKey="value"
                                                        nameKey="name"
                                                        innerRadius={45}
                                                        outerRadius={90}
                                                        stroke={colorVar("border")}
                                                        strokeWidth={1}
                                                    >
                                                        {scheduleStatusPie.map((entry, idx) => (
                                                            <Cell key={`${entry.name}-${idx}`} fill={pieColor(entry.name)} />
                                                        ))}
                                                    </Pie>
                                                </PieChart>
                                            </ResponsiveContainer>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card className="lg:col-span-1">
                                    <CardHeader>
                                        <CardTitle>Rubrics status</CardTitle>
                                        <CardDescription>Active vs inactive rubric templates.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="h-64">
                                        {rubricStatusPie.length === 0 ? (
                                            <div className="text-sm text-muted-foreground">No rubric templates.</div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <RechartsTooltip />
                                                    <Legend />
                                                    <Pie
                                                        data={rubricStatusPie}
                                                        dataKey="value"
                                                        nameKey="name"
                                                        innerRadius={45}
                                                        outerRadius={90}
                                                        stroke={colorVar("border")}
                                                        strokeWidth={1}
                                                    >
                                                        {rubricStatusPie.map((entry, idx) => (
                                                            <Cell key={`${entry.name}-${idx}`} fill={pieColor(entry.name)} />
                                                        ))}
                                                    </Pie>
                                                </PieChart>
                                            </ResponsiveContainer>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card className="lg:col-span-1">
                                    <CardHeader>
                                        <CardTitle>Quick links</CardTitle>
                                        <CardDescription>Jump straight into work.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                        <Link href="/dashboard/staff/evaluations" className="block">
                                            <Button variant="outline" className="w-full justify-start">
                                                <ClipboardList className="mr-2 h-4 w-4" />
                                                Continue evaluations
                                            </Button>
                                        </Link>
                                        <Link href="/dashboard/staff/schedules" className="block">
                                            <Button variant="outline" className="w-full justify-start">
                                                <CalendarDays className="mr-2 h-4 w-4" />
                                                View schedules
                                            </Button>
                                        </Link>
                                        <Link href="/dashboard/staff/rubrics" className="block">
                                            <Button variant="outline" className="w-full justify-start">
                                                <BarChart3 className="mr-2 h-4 w-4" />
                                                View rubrics
                                            </Button>
                                        </Link>
                                        <Separator />
                                        <div className="text-xs text-muted-foreground">
                                            Tip: start with{" "}
                                            <span className="font-medium text-foreground">Pending evaluations</span> to
                                            avoid missing your scoring window.
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        {/* The rest of your tabs remain unchanged */}
                        {/* Schedules tab */}
                        <TabsContent value="schedules" className="space-y-4">
                            <Card>
                                <CardHeader className="space-y-3">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                        <div>
                                            <CardTitle>Upcoming schedules</CardTitle>
                                            <CardDescription>Derived from the schedules module (sorted by schedule date).</CardDescription>
                                        </div>
                                        <div className="relative w-full sm:max-w-md">
                                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                value={qSchedules}
                                                onChange={(e) => setQSchedules(e.target.value)}
                                                placeholder="Search group, room, status, program, term..."
                                                className="pl-9"
                                            />
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {busy && schedules.length === 0 ? (
                                        <div className="space-y-3">
                                            <Skeleton className="h-10 w-full" />
                                            <Skeleton className="h-10 w-full" />
                                            <Skeleton className="h-10 w-full" />
                                        </div>
                                    ) : upcomingSchedules.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">No upcoming schedules found.</div>
                                    ) : (
                                        <ScrollArea className="h-96 rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead className="w-56">Scheduled</TableHead>
                                                        <TableHead>Group</TableHead>
                                                        <TableHead className="w-40">Room</TableHead>
                                                        <TableHead className="w-32">Status</TableHead>
                                                        <TableHead className="w-20 text-right">Open</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {upcomingSchedules.map((s) => {
                                                        const g = groupMetaById[String(s.groupId ?? "").trim()]
                                                        const title =
                                                            String(s.groupTitle ?? s.group_title ?? g?.title ?? "").trim() ||
                                                            (s.groupId ? `Group ${String(s.groupId).slice(0, 8)}…` : "—")
                                                        const meta = [g?.program, g?.term].filter(Boolean).join(" • ")
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
                                                                    <Link href={`/dashboard/staff/schedules/${s.id}`}>
                                                                        <Button variant="outline" size="sm">
                                                                            <Eye className="mr-2 h-4 w-4" />
                                                                            Open
                                                                        </Button>
                                                                    </Link>
                                                                </TableCell>
                                                            </TableRow>
                                                        )
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </ScrollArea>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Evaluations tab */}
                        <TabsContent value="evaluations" className="space-y-4">
                            <Card>
                                <CardHeader className="space-y-3">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                        <div>
                                            <CardTitle>Pending evaluations</CardTitle>
                                            <CardDescription>From the evaluations module (your assignments).</CardDescription>
                                        </div>
                                        <div className="relative w-full sm:max-w-md">
                                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                value={qEvaluations}
                                                onChange={(e) => setQEvaluations(e.target.value)}
                                                placeholder="Search group, program, term, room..."
                                                className="pl-9"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="outline">Pending {evalStatusCounts.pending ?? 0}</Badge>
                                        <Badge variant="outline">Submitted {evalStatusCounts.submitted ?? 0}</Badge>
                                        <Badge variant="outline">Locked {evalStatusCounts.locked ?? 0}</Badge>
                                        <Separator orientation="vertical" className="h-4" />
                                        <span className="text-sm text-muted-foreground">
                                            Completion <span className="font-medium text-foreground">{completionRate}%</span>
                                        </span>
                                    </div>
                                </CardHeader>

                                <CardContent>
                                    {busy && evaluations.length === 0 ? (
                                        <div className="space-y-3">
                                            <Skeleton className="h-10 w-full" />
                                            <Skeleton className="h-10 w-full" />
                                            <Skeleton className="h-10 w-full" />
                                        </div>
                                    ) : pendingEvaluations.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">No pending evaluations found.</div>
                                    ) : (
                                        <ScrollArea className="h-96 rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Group</TableHead>
                                                        <TableHead className="w-56">Schedule</TableHead>
                                                        <TableHead className="w-40">Room</TableHead>
                                                        <TableHead className="w-20 text-right">Open</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {pendingEvaluations.map((r) => (
                                                        <TableRow key={r.evaluationId}>
                                                            <TableCell>
                                                                <div className="space-y-1">
                                                                    <div className="line-clamp-1 font-medium">{r.groupTitle ?? "—"}</div>
                                                                    <div className="text-xs text-muted-foreground">
                                                                        {[r.program, r.term].filter(Boolean).join(" • ") || "—"}
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>{formatDateTime(r.scheduledAt)}</TableCell>
                                                            <TableCell>{r.room?.trim() ? r.room : "—"}</TableCell>
                                                            <TableCell className="text-right">
                                                                <Link href={`/dashboard/staff/evaluations/${r.evaluationId}`}>
                                                                    <Button variant="outline" size="sm">
                                                                        <Eye className="mr-2 h-4 w-4" />
                                                                        Open
                                                                    </Button>
                                                                </Link>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </ScrollArea>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Rubrics tab */}
                        <TabsContent value="rubrics" className="space-y-4">
                            <Card>
                                <CardHeader className="space-y-3">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                        <div>
                                            <CardTitle>Rubric templates</CardTitle>
                                            <CardDescription>From the rubrics module (templates and versions).</CardDescription>
                                        </div>
                                        <div className="relative w-full sm:max-w-md">
                                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                value={qRubrics}
                                                onChange={(e) => setQRubrics(e.target.value)}
                                                placeholder="Search name, version, description..."
                                                className="pl-9"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="outline">Active {rubricCounts.active}</Badge>
                                        <Badge variant="outline">Inactive {rubricCounts.inactive}</Badge>
                                        <Separator orientation="vertical" className="h-4" />
                                        <span className="text-sm text-muted-foreground">
                                            Total <span className="font-medium text-foreground">{rubrics.length}</span>
                                        </span>
                                    </div>
                                </CardHeader>

                                <CardContent>
                                    {busy && rubrics.length === 0 ? (
                                        <div className="space-y-3">
                                            <Skeleton className="h-10 w-full" />
                                            <Skeleton className="h-10 w-full" />
                                            <Skeleton className="h-10 w-full" />
                                        </div>
                                    ) : recentRubrics.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">No rubric templates found.</div>
                                    ) : (
                                        <ScrollArea className="h-96 rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Name</TableHead>
                                                        <TableHead className="w-24">Version</TableHead>
                                                        <TableHead className="w-28">Status</TableHead>
                                                        <TableHead className="w-36">Updated</TableHead>
                                                        <TableHead className="w-20 text-right">Open</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {recentRubrics.map((t) => (
                                                        <TableRow key={t.id}>
                                                            <TableCell className="min-w-72">
                                                                <div className="font-medium">{t.name}</div>
                                                                <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                                                    {t.description || "—"}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="outline">v{t.version}</Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                {t.active ? (
                                                                    <Badge variant="secondary">Active</Badge>
                                                                ) : (
                                                                    <Badge variant="outline">Inactive</Badge>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-sm text-muted-foreground">{formatShort(t.updatedAt)}</TableCell>
                                                            <TableCell className="text-right">
                                                                <Link href={`/dashboard/staff/rubrics/${t.id}`}>
                                                                    <Button variant="outline" size="sm">
                                                                        <Eye className="mr-2 h-4 w-4" />
                                                                        Open
                                                                    </Button>
                                                                </Link>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </ScrollArea>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>

                    <Accordion type="single" collapsible>
                        <AccordionItem value="how-it-works">
                            <AccordionTrigger>What is this overview showing?</AccordionTrigger>
                            <AccordionContent>
                                <div className="space-y-2 text-sm text-muted-foreground">
                                    <p>
                                        This page summarizes key data from:
                                        <span className="ml-1 font-medium text-foreground">Schedules</span>,{" "}
                                        <span className="font-medium text-foreground">Rubrics</span>, and{" "}
                                        <span className="font-medium text-foreground">Evaluations</span>.
                                    </p>
                                    <ul className="list-disc pl-5">
                                        <li>
                                            <span className="font-medium text-foreground">Schedules charts</span> use the schedule date and status.
                                        </li>
                                        <li>
                                            <span className="font-medium text-foreground">Evaluation metrics</span> are based on your assignments (pending/submitted/locked).
                                        </li>
                                        <li>
                                            <span className="font-medium text-foreground">Rubrics</span> show active vs inactive templates and recent updates.
                                        </li>
                                    </ul>
                                    <p>
                                        Use the tabs to drill down, or open the full pages via Quick Links / Actions.
                                    </p>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
            </TooltipProvider>
        </DashboardLayout>
    )
}
