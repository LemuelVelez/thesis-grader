"use client"

import * as React from "react"
import { GraduationCap, ShieldCheck, UserCheck, Users } from "lucide-react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
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

function normalizeEvalStatus(raw: string | null | undefined): "pending" | "submitted" | "locked" {
    const v = (raw ?? "").toLowerCase().trim()
    if (v === "submitted") return "submitted"
    if (v === "locked") return "locked"
    return "pending"
}

function toNumber(value: number | `${number}` | null | undefined): number {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0
    if (typeof value === "string") {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
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

export default function StaffOverviewPage() {
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
                fetchJson<RankingsResponse>("/api/admin/rankings?limit=7"),
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
        const students = users.filter((u) => u.role === "student").length
        const panelists = users.filter((u) => u.role === "panelist").length
        const activeAccounts = users.filter((u) => u.status === "active").length

        const totalEvaluations = evaluations.length
        const completedEvaluations = evaluations.filter((e) => {
            const s = normalizeEvalStatus(e.status)
            return s === "submitted" || s === "locked"
        }).length

        const completionRate = totalEvaluations === 0 ? 0 : (completedEvaluations / totalEvaluations) * 100

        return {
            students,
            panelists,
            activeAccounts,
            completionRate,
        }
    }, [users, evaluations])

    const userRoleStatusData = React.useMemo(() => {
        const roles: Array<"student" | "panelist" | "staff" | "admin"> = [
            "student",
            "panelist",
            "staff",
            "admin",
        ]
        const labels: Record<(typeof roles)[number], string> = {
            student: "Students",
            panelist: "Panelists",
            staff: "Staff",
            admin: "Admins",
        }

        return roles.map((role) => ({
            role: labels[role],
            active: users.filter((u) => u.role === role && u.status === "active").length,
            disabled: users.filter((u) => u.role === role && u.status !== "active").length,
        }))
    }, [users])

    const topGroupsData = React.useMemo(() => {
        const fallback = [
            { group_title: "No data", group_percentage: 0, rank: 1 },
            { group_title: "No data", group_percentage: 0, rank: 2 },
            { group_title: "No data", group_percentage: 0, rank: 3 },
            { group_title: "No data", group_percentage: 0, rank: 4 },
            { group_title: "No data", group_percentage: 0, rank: 5 },
            { group_title: "No data", group_percentage: 0, rank: 6 },
            { group_title: "No data", group_percentage: 0, rank: 7 },
        ] as RankingLite[]

        const source = (rankings.length > 0 ? rankings : fallback)
            .slice()
            .sort((a, b) => a.rank - b.rank)
            .slice(0, 7)

        return source.map((r) => ({
            group: r.group_title,
            score: toNumber(r.group_percentage),
        }))
    }, [rankings])

    return (
        <DashboardLayout
            title="Staff Overview"
            description="Operational summary for students, panelists, and evaluations."
        >
            <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        title="Students"
                        value={loading ? "..." : metrics.students.toLocaleString()}
                        subtitle="Current student accounts"
                        icon={GraduationCap}
                    />
                    <MetricCard
                        title="Panelists"
                        value={loading ? "..." : metrics.panelists.toLocaleString()}
                        subtitle="Current panelist accounts"
                        icon={UserCheck}
                    />
                    <MetricCard
                        title="Active Accounts"
                        value={loading ? "..." : metrics.activeAccounts.toLocaleString()}
                        subtitle="Users marked active"
                        icon={Users}
                    />
                    <MetricCard
                        title="Evaluation Completion"
                        value={loading ? "..." : `${metrics.completionRate.toFixed(1)}%`}
                        subtitle="Submitted and locked evaluations"
                        icon={ShieldCheck}
                    />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Account Health by Role</CardTitle>
                            <CardDescription>Active vs disabled users per role</CardDescription>
                        </CardHeader>
                        <CardContent className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={userRoleStatusData}>
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
                                    <Bar dataKey="active" name="Active" stackId="status" fill="var(--chart-2)" />
                                    <Bar dataKey="disabled" name="Disabled" stackId="status" fill="var(--chart-5)" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Top Groups Snapshot</CardTitle>
                            <CardDescription>Group ranking by overall percentage</CardDescription>
                        </CardHeader>
                        <CardContent className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={topGroupsData}>
                                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="group"
                                        stroke="var(--muted-foreground)"
                                        interval={0}
                                        angle={-20}
                                        textAnchor="end"
                                        height={70}
                                    />
                                    <YAxis stroke="var(--muted-foreground)" />
                                    <Tooltip
                                        formatter={(value: number | undefined) => `${(value ?? 0).toFixed(2)}%`}
                                        contentStyle={{
                                            backgroundColor: "var(--card)",
                                            borderColor: "var(--border)",
                                            borderRadius: "var(--radius)",
                                        }}
                                    />
                                    <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                                        {topGroupsData.map((_, index) => (
                                            <Cell key={`top-group-cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    )
}
