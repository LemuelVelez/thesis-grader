/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Activity,
    BarChart3,
    BookOpen,
    FileText,
    RefreshCw,
    Shield,
    Users,
} from "lucide-react"
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type ReportsSummary = {
    range: { from: string; to: string }
    filters: { program?: string | null; term?: string | null }

    users: {
        total: number
        byRole: { student: number; staff: number; admin: number }
        byStatus: { active: number; disabled: number }
    }

    thesis: {
        groups_total: number
        memberships_total: number
        unassigned_adviser: number
        byProgram: { program: string; count: number }[]
    }

    defenses: {
        total_in_range: number
        byStatus: { status: string; count: number }[]
        byRoom: { room: string; count: number }[]
        byMonth: { month: string; count: number }[]
    }

    evaluations: {
        panel: { total_in_range: number; byStatus: { status: string; count: number }[] }
        student: { total_in_range: number; byStatus: { status: string; count: number }[] }
    }

    audit: {
        total_in_range: number
        daily: { day: string; count: number }[]
        topActions: { action: string; count: number }[]
        topActors: {
            actor_id: string
            actor_name: string | null
            actor_email: string | null
            role?: string | null
            count: number
        }[]
    }
}

function roleBasePath(role: string) {
    const r = String(role ?? "").toLowerCase()
    if (r === "student") return "/dashboard/student"
    if (r === "staff") return "/dashboard/staff"
    if (r === "admin") return "/dashboard/admin"
    return "/dashboard"
}

function pad2(n: number) {
    return n < 10 ? `0${n}` : String(n)
}

function toYMD(d: Date) {
    // local date (avoids UTC shifting)
    const y = d.getFullYear()
    const m = pad2(d.getMonth() + 1)
    const day = pad2(d.getDate())
    return `${y}-${m}-${day}`
}

function addDaysLocal(ymd: string, delta: number) {
    const [y, m, d] = ymd.split("-").map((v) => Number(v))
    const dt = new Date(y, (m || 1) - 1, d || 1)
    dt.setDate(dt.getDate() + delta)
    return toYMD(dt)
}

async function fetchReportsSummary(params: {
    from: string
    to: string
    days: number
    program?: string
    term?: string
}) {
    const sp = new URLSearchParams()
    sp.set("from", params.from)
    sp.set("to", params.to)
    sp.set("days", String(params.days))
    if (params.program?.trim()) sp.set("program", params.program.trim())
    if (params.term?.trim()) sp.set("term", params.term.trim())

    const res = await fetch(`/api/admin/reports/summary?${sp.toString()}`, { cache: "no-store" })
    const data = await res.json().catch(() => ({} as any))
    if (!res.ok || !data?.ok) {
        throw new Error(data?.message || "Failed to load admin overview.")
    }
    return data.summary as ReportsSummary
}

type ChartColors = {
    chart1: string
    chart2: string
    chart3: string
    chart4: string
    chart5: string
    destructive: string
    border: string
    mutedForeground: string
    foreground: string
}

function readCssVar(name: string, fallback: string) {
    if (typeof window === "undefined") return fallback
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
}

function ChartScroller(props: {
    width: number
    height: number
    hint?: string
    children: React.ReactNode
}) {
    return (
        <div className="space-y-2">
            <div className="w-full overflow-x-auto">
                <div style={{ width: props.width, height: props.height }}>
                    {props.children}
                </div>
            </div>
            {props.hint ? <div className="text-xs text-muted-foreground">{props.hint}</div> : null}
        </div>
    )
}

export default function AdminDashboardPage() {
    const router = useRouter()
    const { loading, user } = useAuth()

    const isAdmin = String(user?.role ?? "").toLowerCase() === "admin"

    // ✅ FIX: resolve theme colors to real values (prevents Recharts/SVG falling back to black)
    const [C, setC] = React.useState<ChartColors>({
        chart1: "#00ff7f",
        chart2: "#2ee6a8",
        chart3: "#00c27a",
        chart4: "#7cffc0",
        chart5: "#0aa36a",
        destructive: "#ef4444",
        border: "#d2f5e2",
        mutedForeground: "#2d5b44",
        foreground: "#0b1f15",
    })

    React.useEffect(() => {
        setC({
            chart1: readCssVar("--chart-1", "#00ff7f"),
            chart2: readCssVar("--chart-2", "#2ee6a8"),
            chart3: readCssVar("--chart-3", "#00c27a"),
            chart4: readCssVar("--chart-4", "#7cffc0"),
            chart5: readCssVar("--chart-5", "#0aa36a"),
            destructive: readCssVar("--destructive", "#ef4444"),
            border: readCssVar("--border", "#d2f5e2"),
            mutedForeground: readCssVar("--muted-foreground", "#2d5b44"),
            foreground: readCssVar("--foreground", "#0b1f15"),
        })
    }, [])

    // Default range: last 30 days (inclusive)
    const today = React.useMemo(() => toYMD(new Date()), [])
    const [preset, setPreset] = React.useState<"7" | "30" | "90" | "custom">("30")
    const [from, setFrom] = React.useState(addDaysLocal(today, -29))
    const [to, setTo] = React.useState(today)
    const [program, setProgram] = React.useState("")
    const [term, setTerm] = React.useState("")

    const [busy, setBusy] = React.useState(false)
    const [err, setErr] = React.useState<string>("")
    const [summary, setSummary] = React.useState<ReportsSummary | null>(null)

    React.useEffect(() => {
        if (loading) return
        if (!user) return
        if (!isAdmin) {
            toast.error("Forbidden: Admins only.")
            window.location.href = roleBasePath(user.role)
            return
        }
        // initial load
        ; (async () => {
            setErr("")
            setBusy(true)
            try {
                const days = preset === "custom" ? 30 : Number(preset)
                const s = await fetchReportsSummary({ from, to, days, program, term })
                setSummary(s)
            } catch (e: any) {
                setErr(String(e?.message ?? "Failed to load admin overview."))
            } finally {
                setBusy(false)
            }
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, user, isAdmin])

    React.useEffect(() => {
        if (preset === "custom") return
        const days = Number(preset)
        setTo(today)
        setFrom(addDaysLocal(today, -(days - 1)))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preset])

    async function refresh() {
        setErr("")
        setBusy(true)
        const tId = toast.loading("Loading overview...")
        try {
            const days = preset === "custom" ? 30 : Number(preset)
            const s = await fetchReportsSummary({ from, to, days, program, term })
            setSummary(s)
            toast.success("Overview updated.", { id: tId })
        } catch (e: any) {
            const msg = String(e?.message ?? "Failed to load admin overview.")
            setErr(msg)
            toast.error(msg, { id: tId })
        } finally {
            setBusy(false)
        }
    }

    const s = summary

    const usersRolePie = React.useMemo(() => {
        if (!s) return []
        return [
            { name: "student", value: s.users.byRole.student ?? 0 },
            { name: "staff", value: s.users.byRole.staff ?? 0 },
            { name: "admin", value: s.users.byRole.admin ?? 0 },
        ]
    }, [s])

    const usersStatusPie = React.useMemo(() => {
        if (!s) return []
        return [
            { name: "active", value: s.users.byStatus.active ?? 0 },
            { name: "disabled", value: s.users.byStatus.disabled ?? 0 },
        ]
    }, [s])

    const thesisProgramBar = React.useMemo(() => {
        if (!s) return []
        // limit for chart readability
        return (s.thesis.byProgram ?? []).slice(0, 12).map((r) => ({
            program: r.program || "Unknown",
            count: r.count ?? 0,
        }))
    }, [s])

    const defensesByMonthLine = React.useMemo(() => {
        if (!s) return []
        return (s.defenses.byMonth ?? []).map((r) => ({
            month: r.month,
            count: r.count ?? 0,
        }))
    }, [s])

    const auditDailyArea = React.useMemo(() => {
        if (!s) return []
        return (s.audit.daily ?? []).map((r) => ({
            day: r.day,
            count: r.count ?? 0,
        }))
    }, [s])

    const auditTopActionsBar = React.useMemo(() => {
        if (!s) return []
        return (s.audit.topActions ?? []).slice(0, 10).map((r) => ({
            action: r.action,
            count: r.count ?? 0,
        }))
    }, [s])

    if (loading) {
        return (
            <DashboardLayout title="Admin Dashboard">
                <div className="space-y-4">
                    <Skeleton className="h-10 w-72" />
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-72 w-full" />
                </div>
            </DashboardLayout>
        )
    }

    if (!user) {
        return (
            <DashboardLayout title="Admin Dashboard">
                <Card>
                    <CardContent className="p-6">
                        <div className="text-sm text-muted-foreground">Please sign in.</div>
                    </CardContent>
                </Card>
            </DashboardLayout>
        )
    }

    if (!isAdmin) {
        return (
            <DashboardLayout title="Admin Dashboard">
                <Alert variant="destructive">
                    <AlertTitle>Forbidden</AlertTitle>
                    <AlertDescription>
                        Admins only. Go back to your dashboard:{" "}
                        <Link className="underline" href={roleBasePath(user.role)}>
                            {roleBasePath(user.role)}
                        </Link>
                    </AlertDescription>
                </Alert>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout title="Admin Dashboard">
            <div className="space-y-6">
                {/* ========================= */}
                {/* MOBILE HEADER (xs/sm)     */}
                {/* ========================= */}
                <div className="md:hidden space-y-4">
                    <Card>
                        <CardHeader className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4" />
                                <CardTitle className="text-lg">Overview</CardTitle>
                                <Badge variant="secondary">Admin</Badge>
                            </div>
                            <CardDescription>
                                Snapshot of Users, Thesis, Reports, and Audit activity.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Date range preset</Label>
                                <div className="grid grid-cols-4 gap-2">
                                    <Button
                                        type="button"
                                        variant={preset === "7" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setPreset("7")}
                                        disabled={busy}
                                    >
                                        7d
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={preset === "30" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setPreset("30")}
                                        disabled={busy}
                                    >
                                        30d
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={preset === "90" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setPreset("90")}
                                        disabled={busy}
                                    >
                                        90d
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={preset === "custom" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setPreset("custom")}
                                        disabled={busy}
                                    >
                                        Custom
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <Label>From</Label>
                                    <Input
                                        className="native-date"
                                        type="date"
                                        value={from}
                                        onChange={(e) => {
                                            setPreset("custom")
                                            setFrom(e.target.value)
                                        }}
                                        disabled={busy}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>To</Label>
                                    <Input
                                        className="native-date"
                                        type="date"
                                        value={to}
                                        onChange={(e) => {
                                            setPreset("custom")
                                            setTo(e.target.value)
                                        }}
                                        disabled={busy}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Program (optional)</Label>
                                    <Input
                                        value={program}
                                        onChange={(e) => setProgram(e.target.value)}
                                        placeholder="e.g., BSCS"
                                        disabled={busy}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Term (optional)</Label>
                                    <Input
                                        value={term}
                                        onChange={(e) => setTerm(e.target.value)}
                                        placeholder="e.g., AY 2025–2026"
                                        disabled={busy}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Button onClick={refresh} disabled={busy}>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Refresh overview
                                    </Button>

                                    <Button variant="outline" onClick={() => router.refresh()} disabled={busy}>
                                        Refresh UI
                                    </Button>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <Button variant="secondary" asChild>
                                        <Link href="/dashboard/admin/users">
                                            <Users className="mr-2 h-4 w-4" />
                                            Users
                                        </Link>
                                    </Button>
                                    <Button variant="secondary" asChild>
                                        <Link href="/dashboard/admin/thesis">
                                            <BookOpen className="mr-2 h-4 w-4" />
                                            Thesis
                                        </Link>
                                    </Button>
                                    <Button variant="secondary" asChild>
                                        <Link href="/dashboard/admin/reports">
                                            <FileText className="mr-2 h-4 w-4" />
                                            Reports
                                        </Link>
                                    </Button>
                                    <Button variant="secondary" asChild>
                                        <Link href="/dashboard/admin/audit">
                                            <Activity className="mr-2 h-4 w-4" />
                                            Audit
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* ========================= */}
                {/* DESKTOP HEADER (md+)      */}
                {/* (kept as-is; hidden on xs) */}
                {/* ========================= */}
                <div className="hidden md:block">
                    {/* Header */}
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4" />
                                <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
                                <Badge variant="secondary">Admin</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Snapshot of Users, Thesis, Reports, and Audit activity.
                            </p>
                        </div>

                        <div className="grid w-full gap-3 md:w-auto md:grid-cols-6">
                            <div className="md:col-span-2">
                                <Label>Date range preset</Label>
                                <div className="mt-2 flex gap-2">
                                    <Button
                                        type="button"
                                        variant={preset === "7" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setPreset("7")}
                                        disabled={busy}
                                    >
                                        7d
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={preset === "30" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setPreset("30")}
                                        disabled={busy}
                                    >
                                        30d
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={preset === "90" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setPreset("90")}
                                        disabled={busy}
                                    >
                                        90d
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={preset === "custom" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setPreset("custom")}
                                        disabled={busy}
                                    >
                                        Custom
                                    </Button>
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <Label>From</Label>
                                <Input
                                    className="mt-2 native-date"
                                    type="date"
                                    value={from}
                                    onChange={(e) => {
                                        setPreset("custom")
                                        setFrom(e.target.value)
                                    }}
                                    disabled={busy}
                                />
                            </div>

                            <div className="md:col-span-2">
                                <Label>To</Label>
                                <Input
                                    className="mt-2 native-date"
                                    type="date"
                                    value={to}
                                    onChange={(e) => {
                                        setPreset("custom")
                                        setTo(e.target.value)
                                    }}
                                    disabled={busy}
                                />
                            </div>

                            <div className="md:col-span-3">
                                <Label>Program (optional)</Label>
                                <Input
                                    className="mt-2"
                                    value={program}
                                    onChange={(e) => setProgram(e.target.value)}
                                    placeholder="e.g., BSCS"
                                    disabled={busy}
                                />
                            </div>

                            <div className="md:col-span-3">
                                <Label>Term (optional)</Label>
                                <Input
                                    className="mt-2"
                                    value={term}
                                    onChange={(e) => setTerm(e.target.value)}
                                    placeholder="e.g., AY 2025–2026"
                                    disabled={busy}
                                />
                            </div>

                            <div className="md:col-span-6 flex flex-wrap items-center gap-2">
                                <Button onClick={refresh} disabled={busy}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Refresh overview
                                </Button>

                                <Button variant="outline" onClick={() => router.refresh()} disabled={busy}>
                                    Refresh UI
                                </Button>

                                <div className="ml-auto flex flex-wrap gap-2">
                                    <Button variant="secondary" asChild>
                                        <Link href="/dashboard/admin/users">
                                            <Users className="mr-2 h-4 w-4" />
                                            Users
                                        </Link>
                                    </Button>
                                    <Button variant="secondary" asChild>
                                        <Link href="/dashboard/admin/thesis">
                                            <BookOpen className="mr-2 h-4 w-4" />
                                            Thesis
                                        </Link>
                                    </Button>
                                    <Button variant="secondary" asChild>
                                        <Link href="/dashboard/admin/reports">
                                            <FileText className="mr-2 h-4 w-4" />
                                            Reports
                                        </Link>
                                    </Button>
                                    <Button variant="secondary" asChild>
                                        <Link href="/dashboard/admin/audit">
                                            <Activity className="mr-2 h-4 w-4" />
                                            Audit
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <Separator />

                {err ? (
                    <Alert variant="destructive">
                        <AlertTitle>Unable to load overview</AlertTitle>
                        <AlertDescription>{err}</AlertDescription>
                    </Alert>
                ) : null}

                {/* KPI Cards */}
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Users</CardDescription>
                            <CardTitle className="text-2xl">{s?.users.total ?? "—"}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="secondary">active: {s?.users.byStatus.active ?? 0}</Badge>
                                <Badge variant="outline">disabled: {s?.users.byStatus.disabled ?? 0}</Badge>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Thesis groups</CardDescription>
                            <CardTitle className="text-2xl">{s?.thesis.groups_total ?? "—"}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="secondary">memberships: {s?.thesis.memberships_total ?? 0}</Badge>
                                <Badge variant="outline">unassigned: {s?.thesis.unassigned_adviser ?? 0}</Badge>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Defenses (range)</CardDescription>
                            <CardTitle className="text-2xl">{s?.defenses.total_in_range ?? "—"}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <Badge variant="secondary">
                                {s?.range.from ?? from} → {s?.range.to ?? to}
                            </Badge>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Audit logs (range)</CardDescription>
                            <CardTitle className="text-2xl">{s?.audit.total_in_range ?? "—"}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <Badge variant="secondary">activity snapshot</Badge>
                        </CardContent>
                    </Card>
                </div>

                {/* ========================= */}
                {/* MOBILE SECTIONS (xs/sm)   */}
                {/* (vertical, no Tabs)       */}
                {/* ========================= */}
                <div className="md:hidden space-y-4">
                    {/* Users */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Users
                            </CardTitle>
                            <CardDescription>Role & status distributions + quick breakdown.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Users by role</CardTitle>
                                    <CardDescription>Distribution of accounts across roles.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {busy || !s ? (
                                        <Skeleton className="h-64 w-full" />
                                    ) : (
                                        <ChartScroller width={420} height={260} hint="Swipe horizontally if needed.">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <RechartsTooltip />
                                                    <Legend wrapperStyle={{ color: C.foreground }} />
                                                    <Pie
                                                        data={usersRolePie}
                                                        dataKey="value"
                                                        nameKey="name"
                                                        innerRadius={45}
                                                        outerRadius={80}
                                                    >
                                                        {usersRolePie.map((_, idx) => (
                                                            <Cell
                                                                key={idx}
                                                                fill={idx === 0 ? C.chart1 : idx === 1 ? C.chart2 : C.chart3}
                                                            />
                                                        ))}
                                                    </Pie>
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </ChartScroller>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Users by status</CardTitle>
                                    <CardDescription>Active vs disabled accounts.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {busy || !s ? (
                                        <Skeleton className="h-64 w-full" />
                                    ) : (
                                        <ChartScroller width={420} height={260} hint="Swipe horizontally if needed.">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <RechartsTooltip />
                                                    <Legend wrapperStyle={{ color: C.foreground }} />
                                                    <Pie
                                                        data={usersStatusPie}
                                                        dataKey="value"
                                                        nameKey="name"
                                                        innerRadius={45}
                                                        outerRadius={80}
                                                    >
                                                        {usersStatusPie.map((_, idx) => (
                                                            <Cell key={idx} fill={idx === 0 ? C.chart1 : C.destructive} />
                                                        ))}
                                                    </Pie>
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </ChartScroller>
                                    )}
                                </CardContent>
                            </Card>

                            <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                    <Badge variant="secondary">student: {s?.users.byRole.student ?? 0}</Badge>
                                    <Badge variant="secondary">staff: {s?.users.byRole.staff ?? 0}</Badge>
                                    <Badge variant="secondary">admin: {s?.users.byRole.admin ?? 0}</Badge>
                                    <Badge variant="outline">active: {s?.users.byStatus.active ?? 0}</Badge>
                                    <Badge variant="outline">disabled: {s?.users.byStatus.disabled ?? 0}</Badge>
                                </div>
                                <Button asChild variant="secondary" className="w-full">
                                    <Link href="/dashboard/admin/users">Open Manage Users</Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Thesis */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2">
                                <BookOpen className="h-4 w-4" />
                                Thesis
                            </CardTitle>
                            <CardDescription>Program distribution and defenses trend.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Thesis groups by program</CardTitle>
                                    <CardDescription>Top programs (up to 12). Respects Program/Term filters.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {busy || !s ? (
                                        <Skeleton className="h-72 w-full" />
                                    ) : thesisProgramBar.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">
                                            No thesis groups found for this range/filter.
                                        </div>
                                    ) : (
                                        <ChartScroller width={760} height={320} hint="Swipe horizontally to view the full chart.">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={thesisProgramBar}>
                                                    <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                                                    <XAxis
                                                        dataKey="program"
                                                        tick={{ fontSize: 12, fill: C.mutedForeground }}
                                                        interval={0}
                                                        angle={-20}
                                                        height={60}
                                                    />
                                                    <YAxis allowDecimals={false} tick={{ fill: C.mutedForeground }} />
                                                    <RechartsTooltip />
                                                    <Bar dataKey="count" fill={C.chart1} radius={[6, 6, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </ChartScroller>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Defenses by month</CardTitle>
                                    <CardDescription>Matches the Reports → Defenses overview.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {busy || !s ? (
                                        <Skeleton className="h-72 w-full" />
                                    ) : defensesByMonthLine.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">No defense schedules in this range.</div>
                                    ) : (
                                        <ChartScroller width={720} height={320} hint="Swipe horizontally to view the full chart.">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={defensesByMonthLine}>
                                                    <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                                                    <XAxis
                                                        dataKey="month"
                                                        tick={{ fontSize: 12, fill: C.mutedForeground }}
                                                    />
                                                    <YAxis allowDecimals={false} tick={{ fill: C.mutedForeground }} />
                                                    <RechartsTooltip />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="count"
                                                        stroke={C.chart1}
                                                        strokeWidth={2}
                                                        dot={false}
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </ChartScroller>
                                    )}
                                </CardContent>
                            </Card>

                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">groups: {s?.thesis.groups_total ?? 0}</Badge>
                                    <Badge variant="secondary">memberships: {s?.thesis.memberships_total ?? 0}</Badge>
                                    <Badge variant="outline">unassigned adviser: {s?.thesis.unassigned_adviser ?? 0}</Badge>
                                </div>

                                <Button asChild variant="secondary" className="w-full">
                                    <Link href="/dashboard/admin/thesis">Open Thesis Records</Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Reports */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Reports
                            </CardTitle>
                            <CardDescription>Audit activity + evaluation/defense totals.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Audit activity (daily)</CardTitle>
                                    <CardDescription>Daily counts across the selected range.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {busy || !s ? (
                                        <Skeleton className="h-72 w-full" />
                                    ) : auditDailyArea.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">No audit activity in this range.</div>
                                    ) : (
                                        <ChartScroller width={760} height={320} hint="Swipe horizontally to view the full chart.">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={auditDailyArea}>
                                                    <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                                                    <XAxis
                                                        dataKey="day"
                                                        tick={{ fontSize: 12, fill: C.mutedForeground }}
                                                    />
                                                    <YAxis allowDecimals={false} tick={{ fill: C.mutedForeground }} />
                                                    <RechartsTooltip />
                                                    <Area
                                                        type="monotone"
                                                        dataKey="count"
                                                        stroke={C.chart2}
                                                        fill={C.chart2}
                                                        fillOpacity={0.2}
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </ChartScroller>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Evaluations (range)</CardTitle>
                                    <CardDescription>Panel vs Student totals.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <div className="flex flex-wrap gap-2">
                                        <Badge variant="secondary">panel: {s?.evaluations.panel.total_in_range ?? 0}</Badge>
                                        <Badge variant="secondary">student: {s?.evaluations.student.total_in_range ?? 0}</Badge>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        Full breakdown is available in <span className="font-medium text-foreground">Reports</span>.
                                    </div>
                                    <Button asChild variant="secondary" className="w-full">
                                        <Link href="/dashboard/admin/reports">Open Reports</Link>
                                    </Button>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Defenses (range)</CardTitle>
                                    <CardDescription>Counts captured for the selected range & filters.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <Badge variant="secondary">total: {s?.defenses.total_in_range ?? 0}</Badge>
                                    <div className="text-sm text-muted-foreground">
                                        Filter by Program/Term above to match the slice you need.
                                    </div>
                                </CardContent>
                            </Card>
                        </CardContent>
                    </Card>

                    {/* Audit */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2">
                                <Activity className="h-4 w-4" />
                                Audit
                            </CardTitle>
                            <CardDescription>Top actions + top actors in the selected range.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Top actions</CardTitle>
                                    <CardDescription>Most common audit actions (top 10).</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {busy || !s ? (
                                        <Skeleton className="h-72 w-full" />
                                    ) : auditTopActionsBar.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">No audit activity in this range.</div>
                                    ) : (
                                        <ChartScroller width={820} height={320} hint="Swipe horizontally to view the full chart.">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={auditTopActionsBar}>
                                                    <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                                                    <XAxis
                                                        dataKey="action"
                                                        tick={{ fontSize: 12, fill: C.mutedForeground }}
                                                        interval={0}
                                                        angle={-20}
                                                        height={70}
                                                    />
                                                    <YAxis allowDecimals={false} tick={{ fill: C.mutedForeground }} />
                                                    <RechartsTooltip />
                                                    <Bar dataKey="count" fill={C.chart1} radius={[6, 6, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </ChartScroller>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Top actors</CardTitle>
                                    <CardDescription>Most active staff/admin based on audit volume.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {busy || !s ? (
                                        <Skeleton className="h-56 w-full" />
                                    ) : (s.audit.topActors ?? []).length === 0 ? (
                                        <div className="text-sm text-muted-foreground">No actor activity in this range.</div>
                                    ) : (
                                        <div className="space-y-2">
                                            {(s.audit.topActors ?? []).slice(0, 6).map((r) => (
                                                <div key={r.actor_id} className="flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-medium">{r.actor_name ?? "Unknown"}</div>
                                                        <div className="truncate text-xs text-muted-foreground">{r.actor_email ?? ""}</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {r.role ? <Badge variant="outline">{r.role}</Badge> : null}
                                                        <Badge variant="secondary">{r.count}</Badge>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <Button asChild variant="secondary" className="w-full">
                                        <Link href="/dashboard/admin/audit">Open Audit Logs</Link>
                                    </Button>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Audit tip</CardTitle>
                                    <CardDescription>
                                        Use Audit filters (action/entity/actor/date) to drill into specific events and view JSON details.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">range: {s?.range.from ?? from} → {s?.range.to ?? to}</Badge>
                                    <Badge variant="outline">total: {s?.audit.total_in_range ?? 0}</Badge>
                                </CardContent>
                            </Card>
                        </CardContent>
                    </Card>
                </div>

                {/* ========================= */}
                {/* DESKTOP TABS (md+)        */}
                {/* (kept; hidden on xs/sm)   */}
                {/* ========================= */}
                <div className="hidden md:block">
                    {/* Tabs of Overviews (Users / Thesis / Reports / Audit) */}
                    <Tabs defaultValue="users" className="w-full">
                        <TabsList className="w-full justify-start">
                            <TabsTrigger value="users">Users</TabsTrigger>
                            <TabsTrigger value="thesis">Thesis</TabsTrigger>
                            <TabsTrigger value="reports">Reports</TabsTrigger>
                            <TabsTrigger value="audit">Audit</TabsTrigger>
                        </TabsList>

                        {/* Users Overview */}
                        <TabsContent value="users" className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="flex items-center gap-2">
                                            <Users className="h-4 w-4" />
                                            Users by role
                                        </CardTitle>
                                        <CardDescription>Distribution of accounts across roles.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="h-72">
                                        {busy || !s ? (
                                            <Skeleton className="h-full w-full" />
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <RechartsTooltip />
                                                    <Legend wrapperStyle={{ color: C.foreground }} />
                                                    <Pie
                                                        data={usersRolePie}
                                                        dataKey="value"
                                                        nameKey="name"
                                                        innerRadius={45}
                                                        outerRadius={80}
                                                    >
                                                        {usersRolePie.map((_, idx) => (
                                                            <Cell
                                                                key={idx}
                                                                fill={idx === 0 ? C.chart1 : idx === 1 ? C.chart2 : C.chart3}
                                                            />
                                                        ))}
                                                    </Pie>
                                                </PieChart>
                                            </ResponsiveContainer>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="flex items-center gap-2">
                                            <BarChart3 className="h-4 w-4" />
                                            Users by status
                                        </CardTitle>
                                        <CardDescription>Active vs disabled accounts.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="h-72">
                                        {busy || !s ? (
                                            <Skeleton className="h-full w-full" />
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <RechartsTooltip />
                                                    <Legend wrapperStyle={{ color: C.foreground }} />
                                                    <Pie
                                                        data={usersStatusPie}
                                                        dataKey="value"
                                                        nameKey="name"
                                                        innerRadius={45}
                                                        outerRadius={80}
                                                    >
                                                        {usersStatusPie.map((_, idx) => (
                                                            <Cell key={idx} fill={idx === 0 ? C.chart1 : C.destructive} />
                                                        ))}
                                                    </Pie>
                                                </PieChart>
                                            </ResponsiveContainer>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle>Quick breakdown</CardTitle>
                                    <CardDescription>Matches Manage Users overview.</CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">student: {s?.users.byRole.student ?? 0}</Badge>
                                    <Badge variant="secondary">staff: {s?.users.byRole.staff ?? 0}</Badge>
                                    <Badge variant="secondary">admin: {s?.users.byRole.admin ?? 0}</Badge>
                                    <Badge variant="outline">active: {s?.users.byStatus.active ?? 0}</Badge>
                                    <Badge variant="outline">disabled: {s?.users.byStatus.disabled ?? 0}</Badge>

                                    <div className="ml-auto">
                                        <Button asChild variant="secondary">
                                            <Link href="/dashboard/admin/users">Open Manage Users</Link>
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Thesis Overview */}
                        <TabsContent value="thesis" className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="flex items-center gap-2">
                                            <BookOpen className="h-4 w-4" />
                                            Thesis groups by program
                                        </CardTitle>
                                        <CardDescription>Top programs (up to 12). Respects Program/Term filters.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="h-80">
                                        {busy || !s ? (
                                            <Skeleton className="h-full w-full" />
                                        ) : thesisProgramBar.length === 0 ? (
                                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                                No thesis groups found for this range/filter.
                                            </div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={thesisProgramBar}>
                                                    <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                                                    <XAxis
                                                        dataKey="program"
                                                        tick={{ fontSize: 12, fill: C.mutedForeground }}
                                                        interval={0}
                                                        angle={-20}
                                                        height={60}
                                                    />
                                                    <YAxis allowDecimals={false} tick={{ fill: C.mutedForeground }} />
                                                    <RechartsTooltip />
                                                    <Bar dataKey="count" fill={C.chart1} radius={[6, 6, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle>Defenses by month</CardTitle>
                                        <CardDescription>Matches the Reports → Defenses tab overview.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="h-80">
                                        {busy || !s ? (
                                            <Skeleton className="h-full w-full" />
                                        ) : defensesByMonthLine.length === 0 ? (
                                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                                No defense schedules in this range.
                                            </div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={defensesByMonthLine}>
                                                    <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                                                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: C.mutedForeground }} />
                                                    <YAxis allowDecimals={false} tick={{ fill: C.mutedForeground }} />
                                                    <RechartsTooltip />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="count"
                                                        stroke={C.chart1}
                                                        strokeWidth={2}
                                                        dot={false}
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle>Thesis snapshot</CardTitle>
                                    <CardDescription>Matches Thesis dashboard totals.</CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">groups: {s?.thesis.groups_total ?? 0}</Badge>
                                    <Badge variant="secondary">memberships: {s?.thesis.memberships_total ?? 0}</Badge>
                                    <Badge variant="outline">unassigned adviser: {s?.thesis.unassigned_adviser ?? 0}</Badge>

                                    <div className="ml-auto">
                                        <Button asChild variant="secondary">
                                            <Link href="/dashboard/admin/thesis">Open Thesis Records</Link>
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Reports Overview */}
                        <TabsContent value="reports" className="space-y-4">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle>Audit activity (daily)</CardTitle>
                                    <CardDescription>Daily counts across the selected range.</CardDescription>
                                </CardHeader>
                                <CardContent className="h-80">
                                    {busy || !s ? (
                                        <Skeleton className="h-full w-full" />
                                    ) : auditDailyArea.length === 0 ? (
                                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                            No audit activity in this range.
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={auditDailyArea}>
                                                <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                                                <XAxis dataKey="day" tick={{ fontSize: 12, fill: C.mutedForeground }} />
                                                <YAxis allowDecimals={false} tick={{ fill: C.mutedForeground }} />
                                                <RechartsTooltip />
                                                <Area
                                                    type="monotone"
                                                    dataKey="count"
                                                    stroke={C.chart2}
                                                    fill={C.chart2}
                                                    fillOpacity={0.2}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    )}
                                </CardContent>
                            </Card>

                            <div className="grid gap-4 md:grid-cols-2">
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle>Evaluations (range)</CardTitle>
                                        <CardDescription>Panel vs Student evaluation totals.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                        <div className="flex flex-wrap gap-2">
                                            <Badge variant="secondary">panel: {s?.evaluations.panel.total_in_range ?? 0}</Badge>
                                            <Badge variant="secondary">student: {s?.evaluations.student.total_in_range ?? 0}</Badge>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            Full breakdown is available in{" "}
                                            <span className="font-medium text-foreground">Reports</span>.
                                        </div>

                                        <div className="pt-2">
                                            <Button asChild variant="secondary">
                                                <Link href="/dashboard/admin/reports">Open Reports</Link>
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle>Defenses (range)</CardTitle>
                                        <CardDescription>Counts captured for the selected range & filters.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                        <Badge variant="secondary">total: {s?.defenses.total_in_range ?? 0}</Badge>
                                        <div className="text-sm text-muted-foreground">
                                            Filter by Program/Term above to match the Thesis/Defenses slice you need.
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        {/* Audit Overview */}
                        <TabsContent value="audit" className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle>Top actions</CardTitle>
                                        <CardDescription>Most common audit actions in the range (top 10).</CardDescription>
                                    </CardHeader>
                                    <CardContent className="h-80">
                                        {busy || !s ? (
                                            <Skeleton className="h-full w-full" />
                                        ) : auditTopActionsBar.length === 0 ? (
                                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                                No audit activity in this range.
                                            </div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={auditTopActionsBar}>
                                                    <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                                                    <XAxis
                                                        dataKey="action"
                                                        tick={{ fontSize: 12, fill: C.mutedForeground }}
                                                        interval={0}
                                                        angle={-20}
                                                        height={70}
                                                    />
                                                    <YAxis allowDecimals={false} tick={{ fill: C.mutedForeground }} />
                                                    <RechartsTooltip />
                                                    <Bar dataKey="count" fill={C.chart1} radius={[6, 6, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle>Top actors</CardTitle>
                                        <CardDescription>Most active staff/admin based on audit volume.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {busy || !s ? (
                                            <Skeleton className="h-60 w-full" />
                                        ) : (s.audit.topActors ?? []).length === 0 ? (
                                            <div className="text-sm text-muted-foreground">No actor activity in this range.</div>
                                        ) : (
                                            <div className="space-y-2">
                                                {(s.audit.topActors ?? []).slice(0, 6).map((r) => (
                                                    <div key={r.actor_id} className="flex items-center justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="truncate text-sm font-medium">{r.actor_name ?? "Unknown"}</div>
                                                            <div className="truncate text-xs text-muted-foreground">{r.actor_email ?? ""}</div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {r.role ? <Badge variant="outline">{r.role}</Badge> : null}
                                                            <Badge variant="secondary">{r.count}</Badge>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="pt-2">
                                            <Button asChild variant="secondary">
                                                <Link href="/dashboard/admin/audit">Open Audit Logs</Link>
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle>Audit tip</CardTitle>
                                    <CardDescription>
                                        Use Audit filters (action/entity/actor/date) to drill into specific events and view JSON details.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">range: {s?.range.from ?? from} → {s?.range.to ?? to}</Badge>
                                    <Badge variant="outline">total: {s?.audit.total_in_range ?? 0}</Badge>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </DashboardLayout>
    )
}
