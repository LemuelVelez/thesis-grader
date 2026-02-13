"use client"

import * as React from "react"
import { ClipboardList, Trophy, UserCheck, Users } from "lucide-react"
import {
    Bar,
    BarChart,
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

type IconType = React.ComponentType<{ className?: string }>

type UserLite = {
    id: string
    role: "admin" | "staff" | "panelist" | "student" | string
    status: "active" | "disabled" | string
}

type EvaluationLite = {
    id: string
    status?: string | null
}

type RankingLite = {
    group_title: string
    group_percentage: number | `${number}` | null
    rank: number
}

type UsersResponse = { items?: UserLite[] }
type EvaluationsResponse = { items?: EvaluationLite[] }
type RankingsResponse = { items?: RankingLite[] }

const CHART_COLORS = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
] as const

async function fetchJson<T>(url: string): Promise<T | null> {
    try {
        const res = await fetch(url, { cache: "no-store" })
        if (!res.ok) return null
        return (await res.json()) as T
    } catch {
        return null
    }
}

function toNumber(value: number | `${number}` | null | undefined): number {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0
    if (typeof value === "string") {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
}

function normalizeEvalStatus(raw: string | null | undefined): "pending" | "submitted" | "locked" {
    const v = (raw ?? "").toLowerCase().trim()
    if (v === "submitted") return "submitted"
    if (v === "locked") return "locked"
    return "pending"
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

export default function AdminOverviewPage() {
    const [loading, setLoading] = React.useState(true)
    const [users, setUsers] = React.useState<UserLite[]>([])
    const [evaluations, setEvaluations] = React.useState<EvaluationLite[]>([])
    const [rankings, setRankings] = React.useState<RankingLite[]>([])

    React.useEffect(() => {
        let active = true

        async function load() {
            const [usersRes, evalRes, rankingsRes] = await Promise.all([
                fetchJson<UsersResponse>("/api/users?limit=1000"),
                fetchJson<EvaluationsResponse>("/api/evaluations?limit=1000"),
                fetchJson<RankingsResponse>("/api/admin/rankings?limit=10"),
            ])

            if (!active) return

            setUsers(usersRes?.items ?? [])
            setEvaluations(evalRes?.items ?? [])
            setRankings(rankingsRes?.items ?? [])
            setLoading(false)
        }

        void load()

        return () => {
            active = false
        }
    }, [])

    const metrics = React.useMemo(() => {
        const totalUsers = users.length
        const activeUsers = users.filter((u) => u.status === "active").length
        const totalEvaluations = evaluations.length
        const doneEvaluations = evaluations.filter((e) => {
            const s = normalizeEvalStatus(e.status)
            return s === "submitted" || s === "locked"
        }).length

        return {
            totalUsers,
            activeUsers,
            totalEvaluations,
            doneEvaluations,
        }
    }, [users, evaluations])

    const roleChartData = React.useMemo(() => {
        const roles: Array<"admin" | "staff" | "panelist" | "student"> = [
            "admin",
            "staff",
            "panelist",
            "student",
        ]
        const roleLabel: Record<(typeof roles)[number], string> = {
            admin: "Admins",
            staff: "Staff",
            panelist: "Panelists",
            student: "Students",
        }

        return roles.map((role) => ({
            role: roleLabel[role],
            count: users.filter((u) => u.role === role).length,
        }))
    }, [users])

    const evaluationStatusData = React.useMemo(() => {
        const pending = evaluations.filter((e) => normalizeEvalStatus(e.status) === "pending").length
        const submitted = evaluations.filter((e) => normalizeEvalStatus(e.status) === "submitted").length
        const locked = evaluations.filter((e) => normalizeEvalStatus(e.status) === "locked").length

        return [
            { name: "Pending", value: pending, color: CHART_COLORS[0] },
            { name: "Submitted", value: submitted, color: CHART_COLORS[1] },
            { name: "Locked", value: locked, color: CHART_COLORS[2] },
        ]
    }, [evaluations])

    const topRankingData = React.useMemo(() => {
        const fallback = [
            { group_title: "No data", group_percentage: 0, rank: 1 },
            { group_title: "No data", group_percentage: 0, rank: 2 },
            { group_title: "No data", group_percentage: 0, rank: 3 },
            { group_title: "No data", group_percentage: 0, rank: 4 },
            { group_title: "No data", group_percentage: 0, rank: 5 },
        ] as RankingLite[]

        const source = (rankings.length > 0 ? rankings : fallback)
            .slice()
            .sort((a, b) => a.rank - b.rank)
            .slice(0, 5)

        return source.map((r) => ({
            group: r.group_title,
            score: toNumber(r.group_percentage),
        }))
    }, [rankings])

    return (
        <DashboardLayout
            title="Admin Overview"
            description="System-wide metrics and performance snapshot."
        >
            <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        title="Total Users"
                        value={loading ? "..." : metrics.totalUsers.toLocaleString()}
                        subtitle="All registered accounts"
                        icon={Users}
                    />
                    <MetricCard
                        title="Active Users"
                        value={loading ? "..." : metrics.activeUsers.toLocaleString()}
                        subtitle="Users with active status"
                        icon={UserCheck}
                    />
                    <MetricCard
                        title="Total Evaluations"
                        value={loading ? "..." : metrics.totalEvaluations.toLocaleString()}
                        subtitle="All evaluation records"
                        icon={ClipboardList}
                    />
                    <MetricCard
                        title="Completed Evaluations"
                        value={loading ? "..." : metrics.doneEvaluations.toLocaleString()}
                        subtitle="Submitted and locked"
                        icon={Trophy}
                    />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Users by Role</CardTitle>
                            <CardDescription>Distribution of accounts across roles</CardDescription>
                        </CardHeader>
                        <CardContent className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={roleChartData}>
                                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                                    <XAxis dataKey="role" stroke="var(--muted-foreground)" />
                                    <YAxis stroke="var(--muted-foreground)" />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: "var(--card)",
                                            borderColor: "var(--border)",
                                            borderRadius: "var(--radius)",
                                        }}
                                    />
                                    <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                                        {roleChartData.map((_, index) => (
                                            <Cell key={`role-cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Evaluation Status</CardTitle>
                            <CardDescription>Current status split across all evaluations</CardDescription>
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
                                        data={evaluationStatusData}
                                        dataKey="value"
                                        nameKey="name"
                                        innerRadius={56}
                                        outerRadius={98}
                                        label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                                    >
                                        {evaluationStatusData.map((entry, index) => (
                                            <Cell
                                                key={`status-cell-${entry.name}-${index}`}
                                                fill={entry.color}
                                            />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Top Thesis Groups</CardTitle>
                        <CardDescription>Highest ranked groups by overall percentage</CardDescription>
                    </CardHeader>
                    <CardContent className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topRankingData} layout="vertical" margin={{ left: 12, right: 12 }}>
                                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                                <XAxis type="number" stroke="var(--muted-foreground)" />
                                <YAxis
                                    type="category"
                                    dataKey="group"
                                    stroke="var(--muted-foreground)"
                                    width={140}
                                />
                                <Tooltip
                                    formatter={(value: number) => `${value.toFixed(2)}%`}
                                    contentStyle={{
                                        backgroundColor: "var(--card)",
                                        borderColor: "var(--border)",
                                        borderRadius: "var(--radius)",
                                    }}
                                />
                                <Bar dataKey="score" radius={[0, 8, 8, 0]} fill="var(--chart-4)" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
