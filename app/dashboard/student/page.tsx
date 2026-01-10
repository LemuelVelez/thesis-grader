/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
    CalendarDays,
    Eye,
    RefreshCw,
    BarChart3,
    ClipboardList,
    Info,
    TrendingUp,
    Star,
    Users,
    MessageSquare,
} from "lucide-react"
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip as RechartsTooltip,
    Legend,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
} from "recharts"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

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

type SummaryItem = {
    schedule: {
        id: string
        scheduledAt: string | null
        room: string | null
        status: string | null
    }
    group: {
        id: string
        title: string
        program: string | null
        term: string | null
    }
    scores: {
        groupScore: number | null
        systemScore: number | null
        personalScore: number | null
    }
    panelistEvaluations: Array<{
        evaluationId: string
        status: string
        submittedAt: string | null
        lockedAt: string | null
        evaluator: { id: string; name: string; email: string }
        scores: { groupScore: number | null; systemScore: number | null; personalScore: number | null }
        comments: { groupComment: string | null; systemComment: string | null; personalComment: string | null }
    }>
    studentEvaluation: null | {
        id: string
        status: string
        answers: any
        submittedAt: string | null
        lockedAt: string | null
        createdAt: string
        updatedAt: string
    }
}

function safeText(v: any, fallback = "") {
    const s = String(v ?? "").trim()
    return s ? s : fallback
}

async function safeJson(res: Response) {
    const text = await res.text()
    try {
        return JSON.parse(text)
    } catch {
        return { ok: false, message: text || `HTTP ${res.status}` }
    }
}

function fmtDateTime(iso?: string | null) {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
    }).format(d)
}

function daysUntil(iso?: string | null) {
    if (!iso) return null
    const t = new Date(iso).getTime()
    if (!Number.isFinite(t)) return null
    const now = Date.now()
    return Math.ceil((t - now) / (1000 * 60 * 60 * 24))
}

function fmtScore(n: number | null | undefined) {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—"
    return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

function scoreScale(n: number | null | undefined) {
    if (typeof n !== "number" || !Number.isFinite(n)) return 100
    if (n <= 5) return 5
    if (n <= 10) return 10
    return 100
}

function scoreProgress(n: number | null | undefined) {
    if (typeof n !== "number" || !Number.isFinite(n)) return 0
    const max = scoreScale(n)
    return Math.max(0, Math.min(100, (n / max) * 100))
}

function statusBadgeVariant(status: string): React.ComponentProps<typeof Badge>["variant"] {
    const s = String(status || "").toLowerCase()
    if (s.includes("cancel")) return "destructive"
    if (s.includes("done") || s.includes("complete")) return "secondary"
    if (s.includes("ongoing") || s.includes("in_progress") || s.includes("progress")) return "default"
    if (s.includes("scheduled")) return "default"
    return "outline"
}

function evalStatusBadge(status?: string | null) {
    const s = safeText(status, "").toLowerCase()
    if (!s) return <Badge variant="secondary">Unknown</Badge>
    if (s === "locked") return <Badge variant="destructive">Locked</Badge>
    if (s === "submitted") return <Badge variant="default">Submitted</Badge>
    if (s === "pending") return <Badge variant="secondary">Pending</Badge>
    return <Badge variant="outline">{status}</Badge>
}

function bucketScheduleStatus(status: string) {
    const s = String(status || "").toLowerCase()
    if (s.includes("cancel")) return "Cancelled"
    if (s.includes("done") || s.includes("complete")) return "Completed"
    if (s.includes("scheduled")) return "Scheduled"
    return "Other"
}

function bucketEvalStatus(status: string) {
    const s = String(status || "").toLowerCase()
    if (s.includes("lock")) return "Locked"
    if (s.includes("submit")) return "Submitted"
    if (s.includes("pend")) return "Pending"
    return "Other"
}

function shortDateLabel(iso?: string | null) {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" }).format(d)
}

export default function StudentDashboardPage() {
    const router = useRouter()
    const { user, loading: authLoading } = useAuth()

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const [schedules, setSchedules] = React.useState<ScheduleRow[]>([])
    const [evalItems, setEvalItems] = React.useState<SummaryItem[]>([])

    const role = safeText(user?.role, "").toLowerCase()
    const isStudent = role === "student"

    React.useEffect(() => {
        if (authLoading) return
        if (!user) {
            router.replace("/auth/login")
            return
        }
        if (!isStudent) {
            router.replace("/dashboard")
        }
    }, [authLoading, user, isStudent, router])

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [schedRes, evalRes] = await Promise.all([
                fetch(`/api/schedule?resource=schedules&limit=50&offset=0`, { cache: "no-store" }),
                fetch(`/api/student/evaluation-summary?limit=10`, { cache: "no-store" }),
            ])

            const schedData = (await safeJson(schedRes)) as (ApiOk<{ total: number; schedules: ScheduleRow[] }> | ApiErr)
            const evalData = (await safeJson(evalRes)) as (ApiOk<{ items: SummaryItem[] }> | ApiErr)

            if (!schedRes.ok || !schedData.ok) {
                throw new Error((schedData as any)?.message || `Failed to load schedules (HTTP ${schedRes.status})`)
            }
            if (!evalRes.ok || !evalData.ok) {
                throw new Error((evalData as any)?.message || `Failed to load evaluation summary (HTTP ${evalRes.status})`)
            }

            setSchedules((schedData as any).schedules ?? [])
            setEvalItems((evalData as any).items ?? [])
        } catch (e: any) {
            setSchedules([])
            setEvalItems([])
            setError(e?.message ?? "Failed to load student dashboard")
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        if (authLoading) return
        if (!isStudent) return
        load()
    }, [authLoading, isStudent, load])

    const onRefresh = async () => {
        setRefreshing(true)
        await load()
        setRefreshing(false)
        toast.success("Dashboard refreshed")
    }

    const upcoming = React.useMemo(() => {
        const now = Date.now()
        const sorted = [...schedules].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
        const next = sorted.find((r) => new Date(r.scheduledAt).getTime() >= now)
        return next ?? sorted[0] ?? null
    }, [schedules])

    const nextInDays = upcoming ? daysUntil(upcoming.scheduledAt) : null
    const countdownProgress = React.useMemo(() => {
        // 0..30 day window
        if (nextInDays === null) return 0
        if (nextInDays <= 0) return 100
        const clamped = Math.min(30, Math.max(0, 30 - nextInDays))
        return Math.round((clamped / 30) * 100)
    }, [nextInDays])

    const scheduleStatusCounts = React.useMemo(() => {
        const map = new Map<string, number>()
        for (const s of schedules) {
            const k = bucketScheduleStatus(s.status)
            map.set(k, (map.get(k) ?? 0) + 1)
        }
        const order = ["Scheduled", "Completed", "Cancelled", "Other"]
        return order.map((name) => ({ name, count: map.get(name) ?? 0 }))
    }, [schedules])

    const latestEval = React.useMemo(() => {
        const items = [...evalItems]
        items.sort((a, b) => new Date(b.schedule.scheduledAt ?? 0).getTime() - new Date(a.schedule.scheduledAt ?? 0).getTime())
        return items[0] ?? null
    }, [evalItems])

    const scoreTrend = React.useMemo(() => {
        const items = [...evalItems]
        items.sort((a, b) => new Date(a.schedule.scheduledAt ?? 0).getTime() - new Date(b.schedule.scheduledAt ?? 0).getTime())
        const last = items.slice(-8)
        return last.map((it) => ({
            date: shortDateLabel(it.schedule.scheduledAt),
            group: typeof it.scores.groupScore === "number" ? it.scores.groupScore : null,
            system: typeof it.scores.systemScore === "number" ? it.scores.systemScore : null,
            you: typeof it.scores.personalScore === "number" ? it.scores.personalScore : null,
        }))
    }, [evalItems])

    const panelistStatus = React.useMemo(() => {
        const map = new Map<string, number>()
        const rows = latestEval?.panelistEvaluations ?? []
        for (const r of rows) {
            const k = bucketEvalStatus(r.status)
            map.set(k, (map.get(k) ?? 0) + 1)
        }
        const order = ["Submitted", "Pending", "Locked", "Other"]
        return order.map((name) => ({ name, value: map.get(name) ?? 0 }))
    }, [latestEval])

    const feedbackSummary = React.useMemo(() => {
        const se = latestEval?.studentEvaluation
        const ans = se?.answers ?? {}
        const fb = ans?.studentFeedback ?? ans?.feedback ?? {}
        const rating = fb?.rating
        const comment = fb?.comment ?? fb?.text ?? fb?.message ?? ""
        return {
            status: se?.status ?? null,
            updatedAt: se?.updatedAt ?? null,
            rating: typeof rating === "number" ? rating : (String(rating ?? "").trim() ? Number(rating) : null),
            comment: typeof comment === "string" ? comment : "",
        }
    }, [latestEval])

    const pieColors = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-2)"]

    return (
        <DashboardLayout
            title="Student Dashboard"
        >
            <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            <h1 className="text-xl font-semibold">Overview</h1>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Your next defense schedule, score highlights, and quick trends.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" onClick={onRefresh} disabled={refreshing || loading || authLoading}>
                                        <RefreshCw className={cn("mr-2 h-4 w-4", refreshing ? "animate-spin" : "")} />
                                        Refresh
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Reload schedule + evaluation summary</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="secondary">Quick Actions</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => router.push("/dashboard/student/schedule")} className="gap-2">
                                    <CalendarDays className="h-4 w-4" />
                                    My Schedule
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push("/dashboard/student/evaluation")} className="gap-2">
                                    <ClipboardList className="h-4 w-4" />
                                    My Evaluation
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {!authLoading && !isStudent && (
                    <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>Access restricted</AlertTitle>
                        <AlertDescription>This page is only available for student accounts.</AlertDescription>
                    </Alert>
                )}

                {error && (
                    <Alert variant="destructive">
                        <AlertTitle>Failed to load dashboard</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <CardHeader className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <CalendarDays className="h-5 w-5" />
                                Next Defense
                            </CardTitle>
                            <CardDescription>Your next scheduled defense (if available).</CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            {loading ? (
                                <div className="space-y-3">
                                    <Skeleton className="h-5 w-2/3" />
                                    <Skeleton className="h-4 w-1/2" />
                                    <Separator />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                            ) : !upcoming ? (
                                <Alert>
                                    <AlertTitle>No schedule yet</AlertTitle>
                                    <AlertDescription>
                                        Your defense schedule may not be published yet. Please check again later.
                                    </AlertDescription>
                                </Alert>
                            ) : (
                                <>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <HoverCard>
                                            <HoverCardTrigger asChild>
                                                <Badge variant={statusBadgeVariant(upcoming.status)} className="cursor-help">
                                                    {String(upcoming.status || "scheduled").toUpperCase()}
                                                </Badge>
                                            </HoverCardTrigger>
                                            <HoverCardContent className="text-sm">
                                                Keep an eye on your status and room. Refresh if you expect changes.
                                            </HoverCardContent>
                                        </HoverCard>

                                        <Badge variant="outline">{fmtDateTime(upcoming.scheduledAt)}</Badge>
                                        {upcoming.room ? <Badge variant="outline">Room: {upcoming.room}</Badge> : null}
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-3">
                                        <div className="rounded-lg border p-3">
                                            <p className="text-xs text-muted-foreground">Thesis Title</p>
                                            <p className="mt-1 text-sm font-medium">{upcoming.groupTitle ? upcoming.groupTitle : "—"}</p>
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
                                                {nextInDays === null ? "—" : nextInDays > 0 ? `${nextInDays} day(s) remaining` : "Today / Passed"}
                                            </span>
                                        </div>
                                        <Progress value={countdownProgress} />
                                    </div>
                                </>
                            )}
                        </CardContent>

                        <CardFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-muted-foreground">
                                Quick access:{" "}
                                <Link href="/dashboard/student/schedule" className="underline underline-offset-4">
                                    schedules
                                </Link>{" "}
                                and{" "}
                                <Link href="/dashboard/student/evaluation" className="underline underline-offset-4">
                                    evaluation
                                </Link>
                                .
                            </p>

                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={() => router.push("/dashboard/student/schedule")} className="gap-2">
                                    <Eye className="h-4 w-4" />
                                    View Schedule
                                </Button>
                                <Button variant="secondary" onClick={() => router.push("/dashboard/student/evaluation")} className="gap-2">
                                    <ClipboardList className="h-4 w-4" />
                                    View Evaluation
                                </Button>
                            </div>
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="h-5 w-5" />
                                Score Highlights
                            </CardTitle>
                            <CardDescription>Latest available scores from your evaluation summary.</CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            {loading ? (
                                <div className="space-y-3">
                                    <Skeleton className="h-16 w-full" />
                                    <Skeleton className="h-16 w-full" />
                                    <Skeleton className="h-16 w-full" />
                                </div>
                            ) : !latestEval ? (
                                <Alert>
                                    <AlertTitle>No evaluation results yet</AlertTitle>
                                    <AlertDescription>
                                        Scores may appear after panelists submit and results are published.
                                    </AlertDescription>
                                </Alert>
                            ) : (
                                <>
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Current schedule</p>
                                        <p className="text-sm font-medium">
                                            {safeText(latestEval.group.title, "Untitled Group")} • {fmtDateTime(latestEval.schedule.scheduledAt)}
                                        </p>
                                    </div>

                                    <Separator />

                                    <div className="space-y-2 rounded-lg border p-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Users className="h-4 w-4 text-muted-foreground" />
                                                <p className="text-sm font-medium">Group</p>
                                            </div>
                                            <p className="text-sm font-semibold">{fmtScore(latestEval.scores.groupScore)}</p>
                                        </div>
                                        <Progress value={scoreProgress(latestEval.scores.groupScore)} />
                                    </div>

                                    <div className="space-y-2 rounded-lg border p-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                                                <p className="text-sm font-medium">System</p>
                                            </div>
                                            <p className="text-sm font-semibold">{fmtScore(latestEval.scores.systemScore)}</p>
                                        </div>
                                        <Progress value={scoreProgress(latestEval.scores.systemScore)} />
                                    </div>

                                    <div className="space-y-2 rounded-lg border p-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Star className="h-4 w-4 text-muted-foreground" />
                                                <p className="text-sm font-medium">You</p>
                                            </div>
                                            <p className="text-sm font-semibold">{fmtScore(latestEval.scores.personalScore)}</p>
                                        </div>
                                        <Progress value={scoreProgress(latestEval.scores.personalScore)} />
                                    </div>
                                </>
                            )}
                        </CardContent>

                        <CardFooter className="flex items-center justify-between">
                            <Badge variant="outline">Student</Badge>
                            <Badge variant="outline">{user?.email ?? "—"}</Badge>
                        </CardFooter>
                    </Card>
                </div>

                <Tabs defaultValue="charts" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="charts">Charts</TabsTrigger>
                        <TabsTrigger value="lists">Lists</TabsTrigger>
                        <TabsTrigger value="feedback">Feedback</TabsTrigger>
                    </TabsList>

                    <TabsContent value="charts" className="space-y-4">
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card>
                                <CardHeader className="space-y-1">
                                    <CardTitle>Schedules by status</CardTitle>
                                    <CardDescription>How many schedules you can see in each status.</CardDescription>
                                </CardHeader>
                                <CardContent className="h-72">
                                    {loading ? (
                                        <Skeleton className="h-full w-full" />
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={scheduleStatusCounts} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                                                <RechartsTooltip />
                                                <Legend />
                                                <Bar dataKey="count" name="Count" fill="var(--chart-1)" radius={[8, 8, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </CardContent>
                                <CardFooter className="text-xs text-muted-foreground">
                                    Tip: If you see “Other”, the status label is custom (e.g., rescheduled).
                                </CardFooter>
                            </Card>

                            <Card>
                                <CardHeader className="space-y-1">
                                    <CardTitle>Score trend (latest up to 8)</CardTitle>
                                    <CardDescription>Group/System/Personal scores across recent schedules.</CardDescription>
                                </CardHeader>
                                <CardContent className="h-72">
                                    {loading ? (
                                        <Skeleton className="h-full w-full" />
                                    ) : scoreTrend.length === 0 ? (
                                        <Alert>
                                            <AlertTitle>No score trend yet</AlertTitle>
                                            <AlertDescription>
                                                Once scores exist, you’ll see a simple trend line here.
                                            </AlertDescription>
                                        </Alert>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={scoreTrend} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                                                <YAxis tickLine={false} axisLine={false} />
                                                <RechartsTooltip />
                                                <Legend />
                                                <Line
                                                    type="monotone"
                                                    dataKey="group"
                                                    name="Group"
                                                    stroke="var(--chart-1)"
                                                    strokeWidth={2}
                                                    dot={false}
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="system"
                                                    name="System"
                                                    stroke="var(--chart-3)"
                                                    strokeWidth={2}
                                                    dot={false}
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="you"
                                                    name="You"
                                                    stroke="var(--chart-4)"
                                                    strokeWidth={2}
                                                    dot={false}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    )}
                                </CardContent>
                                <CardFooter className="text-xs text-muted-foreground">
                                    Note: Missing scores show as gaps until results are published.
                                </CardFooter>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader className="space-y-1">
                                <CardTitle>Panelist submission status (latest schedule)</CardTitle>
                                <CardDescription>Submitted vs pending vs locked for the most recent evaluation item.</CardDescription>
                            </CardHeader>
                            <CardContent className="h-72">
                                {loading ? (
                                    <Skeleton className="h-full w-full" />
                                ) : !latestEval ? (
                                    <Alert>
                                        <AlertTitle>No evaluation data</AlertTitle>
                                        <AlertDescription>
                                            When panelists are assigned and submit evaluations, this chart will update.
                                        </AlertDescription>
                                    </Alert>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <RechartsTooltip />
                                            <Legend />
                                            <Pie
                                                data={panelistStatus}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                outerRadius={90}
                                                innerRadius={55}
                                                paddingAngle={3}
                                            >
                                                {panelistStatus.map((_, idx) => (
                                                    <Cell key={`cell-${idx}`} fill={pieColors[idx % pieColors.length]} />
                                                ))}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="lists" className="space-y-4">
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card>
                                <CardHeader className="space-y-1">
                                    <CardTitle>Upcoming schedules</CardTitle>
                                    <CardDescription>Your next items by date/time.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {loading ? (
                                        <div className="space-y-2">
                                            <Skeleton className="h-10 w-full" />
                                            <Skeleton className="h-10 w-full" />
                                            <Skeleton className="h-10 w-full" />
                                        </div>
                                    ) : schedules.length === 0 ? (
                                        <Alert>
                                            <AlertTitle>No schedules found</AlertTitle>
                                            <AlertDescription>Check “My Schedule” for filters and details.</AlertDescription>
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
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {[...schedules]
                                                            .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                                                            .slice(0, 6)
                                                            .map((r) => (
                                                                <TableRow key={r.id}>
                                                                    <TableCell className="whitespace-nowrap">{fmtDateTime(r.scheduledAt)}</TableCell>
                                                                    <TableCell>{r.room ? r.room : "—"}</TableCell>
                                                                    <TableCell>
                                                                        <Badge variant={statusBadgeVariant(r.status)}>
                                                                            {String(r.status || "scheduled").toUpperCase()}
                                                                        </Badge>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </ScrollArea>
                                    )}
                                </CardContent>
                                <CardFooter className="flex items-center justify-end">
                                    <Button variant="outline" onClick={() => router.push("/dashboard/student/schedule")} className="gap-2">
                                        <CalendarDays className="h-4 w-4" />
                                        Open My Schedule
                                    </Button>
                                </CardFooter>
                            </Card>

                            <Card>
                                <CardHeader className="space-y-1">
                                    <CardTitle>Latest panelist rows</CardTitle>
                                    <CardDescription>Quick peek of evaluator statuses (latest schedule).</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {loading ? (
                                        <div className="space-y-2">
                                            <Skeleton className="h-10 w-full" />
                                            <Skeleton className="h-10 w-full" />
                                            <Skeleton className="h-10 w-full" />
                                        </div>
                                    ) : !latestEval || (latestEval.panelistEvaluations?.length ?? 0) === 0 ? (
                                        <Alert>
                                            <AlertTitle>No panelist evaluations yet</AlertTitle>
                                            <AlertDescription>
                                                This fills in after evaluators are assigned and start submitting.
                                            </AlertDescription>
                                        </Alert>
                                    ) : (
                                        <div className="rounded-lg border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Evaluator</TableHead>
                                                        <TableHead className="text-right">Status</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {latestEval.panelistEvaluations.slice(0, 6).map((r) => (
                                                        <TableRow key={r.evaluationId}>
                                                            <TableCell>
                                                                <div className="font-medium">{safeText(r.evaluator.name, "—")}</div>
                                                                <div className="text-xs text-muted-foreground">{safeText(r.evaluator.email, "")}</div>
                                                            </TableCell>
                                                            <TableCell className="text-right">{evalStatusBadge(r.status)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </CardContent>
                                <CardFooter className="flex items-center justify-end">
                                    <Button variant="outline" onClick={() => router.push("/dashboard/student/evaluation")} className="gap-2">
                                        <ClipboardList className="h-4 w-4" />
                                        Open My Evaluation
                                    </Button>
                                </CardFooter>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="feedback" className="space-y-4">
                        <Card>
                            <CardHeader className="space-y-1">
                                <CardTitle className="flex items-center gap-2">
                                    <MessageSquare className="h-5 w-5" />
                                    My Feedback (latest schedule)
                                </CardTitle>
                                <CardDescription>
                                    Your feedback is private (other students cannot see it). You can update it in My Evaluation.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {loading ? (
                                    <div className="space-y-2">
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-20 w-full" />
                                    </div>
                                ) : !latestEval ? (
                                    <Alert>
                                        <AlertTitle>No evaluation item yet</AlertTitle>
                                        <AlertDescription>
                                            Once an evaluation exists for your schedule, you can submit feedback there.
                                        </AlertDescription>
                                    </Alert>
                                ) : (
                                    <>
                                        <div className="grid gap-4 md:grid-cols-3">
                                            <div className="space-y-2">
                                                <Label>Feedback status</Label>
                                                <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                                                    {evalStatusBadge(feedbackSummary.status)}
                                                    <span className="text-xs text-muted-foreground">
                                                        Updated: {fmtDateTime(feedbackSummary.updatedAt)}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Rating</Label>
                                                <div className="rounded-md border p-3">
                                                    <p className="text-sm font-medium">
                                                        {typeof feedbackSummary.rating === "number" && Number.isFinite(feedbackSummary.rating)
                                                            ? `${feedbackSummary.rating}/5`
                                                            : "—"}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Set this in My Evaluation.</p>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Schedule</Label>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-start gap-2">
                                                            <Info className="h-4 w-4" />
                                                            View details
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent align="start" className="w-80">
                                                        <div className="space-y-2">
                                                            <p className="text-sm font-medium">{safeText(latestEval.group.title, "Untitled Group")}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {fmtDateTime(latestEval.schedule.scheduledAt)}
                                                            </p>
                                                            <Separator />
                                                            <p className="text-xs text-muted-foreground">
                                                                Room: {safeText(latestEval.schedule.room, "—")}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground">
                                                                Status: {safeText(latestEval.schedule.status, "—")}
                                                            </p>
                                                        </div>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                        </div>

                                        <Separator />

                                        <div className="space-y-2">
                                            <Label>Comment</Label>
                                            <div className="rounded-lg border p-4">
                                                <p className="text-sm text-muted-foreground">
                                                    {safeText(feedbackSummary.comment, "No comment yet.")}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                            <Button onClick={() => router.push("/dashboard/student/evaluation")} className="gap-2">
                                                <ClipboardList className="h-4 w-4" />
                                                Edit feedback in My Evaluation
                                            </Button>

                                            <div className="flex items-center gap-2">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button variant="outline" onClick={onRefresh} disabled={refreshing} className="gap-2">
                                                                <RefreshCw className={cn("h-4 w-4", refreshing ? "animate-spin" : "")} />
                                                                Refresh
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>Reload your latest feedback snapshot</TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    )
}
