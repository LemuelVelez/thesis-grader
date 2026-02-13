"use client"

import * as React from "react"
import { ClipboardCheck, ClipboardList, Lock, Timer } from "lucide-react"
import {
    Area,
    AreaChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"

import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"

type IconType = React.ComponentType<{ className?: string }>

type EvaluationLite = {
    id: string
    status?: string | null
    created_at?: string | null
    submitted_at?: string | null
    locked_at?: string | null
}

type EvaluationsResponse = { items?: EvaluationLite[] }

const CHART_COLORS = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
] as const

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

async function fetchJson<T>(url: string): Promise<T | null> {
    try {
        const res = await fetch(url, { cache: "no-store" })
        if (!res.ok) return null
        return (await res.json()) as T
    } catch {
        return null
    }
}

function normalizeEvalStatus(raw: string | null | undefined): "pending" | "submitted" | "locked" {
    const v = (raw ?? "").toLowerCase().trim()
    if (v === "submitted") return "submitted"
    if (v === "locked") return "locked"
    return "pending"
}

function dayIndexFromDateString(raw: string | null | undefined): number | null {
    if (!raw) return null
    const dt = new Date(raw)
    if (Number.isNaN(dt.getTime())) return null
    const jsDay = dt.getDay() // 0=Sun
    return (jsDay + 6) % 7 // 0=Mon
}

function MetricCard({
    title,
    value,
    subtitle,
    icon: Icon,
}: {
    title: string
    value: string
    subtitle: string
    icon: IconType
}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                    <CardDescription>{title}</CardDescription>
                    <CardTitle className="pt-1 text-2xl">{value}</CardTitle>
                </div>
                <Icon className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
            </CardContent>
        </Card>
    )
}

export default function PanelistOverviewPage() {
    const { user, loading: authLoading } = useAuth()

    const [loading, setLoading] = React.useState(true)
    const [evaluations, setEvaluations] = React.useState<EvaluationLite[]>([])

    React.useEffect(() => {
        if (authLoading) return

        let active = true

        async function load() {
            if (!user?.id) {
                if (!active) return
                setEvaluations([])
                setLoading(false)
                return
            }

            const res = await fetchJson<EvaluationsResponse>(
                `/api/evaluations/evaluator/${user.id}?limit=1000`,
            )

            if (!active) return

            setEvaluations(res?.items ?? [])
            setLoading(false)
        }

        void load()

        return () => {
            active = false
        }
    }, [authLoading, user?.id])

    const metrics = React.useMemo(() => {
        const total = evaluations.length
        const pending = evaluations.filter((e) => normalizeEvalStatus(e.status) === "pending").length
        const submitted = evaluations.filter((e) => normalizeEvalStatus(e.status) === "submitted").length
        const locked = evaluations.filter((e) => normalizeEvalStatus(e.status) === "locked").length
        const completed = submitted + locked
        const completionRate = total === 0 ? 0 : (completed / total) * 100

        return { total, pending, submitted, locked, completionRate }
    }, [evaluations])

    const statusData = React.useMemo(
        () => [
            { name: "Pending", value: metrics.pending, color: CHART_COLORS[0] },
            { name: "Submitted", value: metrics.submitted, color: CHART_COLORS[1] },
            { name: "Locked", value: metrics.locked, color: CHART_COLORS[2] },
        ],
        [metrics.pending, metrics.submitted, metrics.locked],
    )

    const weeklyActivityData = React.useMemo(() => {
        const buckets = WEEKDAY_LABELS.map((day) => ({ day, updates: 0 }))

        evaluations.forEach((evaluation) => {
            const candidateDate =
                evaluation.locked_at ?? evaluation.submitted_at ?? evaluation.created_at ?? null
            const idx = dayIndexFromDateString(candidateDate)
            if (idx === null) return
            buckets[idx].updates += 1
        })

        return buckets
    }, [evaluations])

    const pageLoading = authLoading || loading

    return (
        <DashboardLayout
            title="Panelist Overview"
            description="Your assigned evaluations and weekly activity."
        >
            <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        title="Assigned Evaluations"
                        value={pageLoading ? "..." : metrics.total.toLocaleString()}
                        subtitle="All records assigned to you"
                        icon={ClipboardList}
                    />
                    <MetricCard
                        title="Pending"
                        value={pageLoading ? "..." : metrics.pending.toLocaleString()}
                        subtitle="Not yet submitted"
                        icon={Timer}
                    />
                    <MetricCard
                        title="Submitted"
                        value={pageLoading ? "..." : metrics.submitted.toLocaleString()}
                        subtitle="Ready for lock/review"
                        icon={ClipboardCheck}
                    />
                    <MetricCard
                        title="Locked"
                        value={pageLoading ? "..." : metrics.locked.toLocaleString()}
                        subtitle="Finalized evaluations"
                        icon={Lock}
                    />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Status Distribution</CardTitle>
                            <CardDescription>Pending vs submitted vs locked</CardDescription>
                        </CardHeader>
                        <CardContent className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: "var(--card)",
                                            borderColor: "var(--border)",
                                            borderRadius: "var(--radius)",
                                        }}
                                    />
                                    <Pie
                                        data={statusData}
                                        dataKey="value"
                                        nameKey="name"
                                        innerRadius={56}
                                        outerRadius={98}
                                        label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                                    >
                                        {statusData.map((entry, index) => (
                                            <Cell key={`${entry.name}-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Weekly Activity</CardTitle>
                            <CardDescription>Evaluation updates by weekday</CardDescription>
                        </CardHeader>
                        <CardContent className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={weeklyActivityData}>
                                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                                    <XAxis dataKey="day" stroke="var(--muted-foreground)" />
                                    <YAxis stroke="var(--muted-foreground)" />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: "var(--card)",
                                            borderColor: "var(--border)",
                                            borderRadius: "var(--radius)",
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="updates"
                                        stroke="var(--chart-4)"
                                        fill="var(--chart-4)"
                                        fillOpacity={0.25}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Completion Rate</CardTitle>
                        <CardDescription>Based on submitted + locked over all assigned evaluations</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-semibold text-primary">
                            {pageLoading ? "..." : `${metrics.completionRate.toFixed(1)}%`}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Keep pushing pending items to submitted and locked status.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
