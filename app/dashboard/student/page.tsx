"use client"

import * as React from "react"
import { Bell, BellDot, BarChart3, Trophy } from "lucide-react"
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
import { useAuth } from "@/hooks/use-auth"

type IconType = React.ComponentType<{ className?: string }>

type NotificationLite = {
    id: string
    type?: string | null
    created_at?: string | null
    read_at?: string | null
}

type RankingLite = {
    group_title: string
    group_percentage: number | `${number}` | null
    rank: number
}

type NotificationsResponse = { items?: NotificationLite[] }
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

function shortDayLabel(date: Date): string {
    return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)
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

export default function StudentOverviewPage() {
    const { user, loading: authLoading } = useAuth()

    const [loading, setLoading] = React.useState(true)
    const [notifications, setNotifications] = React.useState<NotificationLite[]>([])
    const [unreadNotifications, setUnreadNotifications] = React.useState<NotificationLite[]>([])
    const [rankings, setRankings] = React.useState<RankingLite[]>([])

    React.useEffect(() => {
        if (authLoading) return

        let active = true

        async function load() {
            const rankingReq = fetchJson<RankingsResponse>("/api/admin/rankings?limit=5")

            if (!user?.id) {
                const rankingsRes = await rankingReq
                if (!active) return

                setNotifications([])
                setUnreadNotifications([])
                setRankings(rankingsRes?.items ?? [])
                setLoading(false)
                return
            }

            const [allRes, unreadRes, rankingsRes] = await Promise.all([
                fetchJson<NotificationsResponse>(`/api/notifications/user/${user.id}?limit=100`),
                fetchJson<NotificationsResponse>(`/api/notifications/user/${user.id}/unread?limit=100`),
                rankingReq,
            ])

            if (!active) return

            setNotifications(allRes?.items ?? [])
            setUnreadNotifications(unreadRes?.items ?? [])
            setRankings(rankingsRes?.items ?? [])
            setLoading(false)
        }

        void load()

        return () => {
            active = false
        }
    }, [authLoading, user?.id])

    const metrics = React.useMemo(() => {
        const totalNotifications = notifications.length
        const unreadCount = unreadNotifications.length
        const evaluationUpdates = notifications.filter((n) =>
            String(n.type ?? "").toLowerCase().includes("evaluation"),
        ).length

        const highestGroupScore = rankings.length
            ? Math.max(...rankings.map((r) => toNumber(r.group_percentage)))
            : 0

        return {
            totalNotifications,
            unreadCount,
            evaluationUpdates,
            highestGroupScore,
        }
    }, [notifications, unreadNotifications, rankings])

    const last7DaysNotifications = React.useMemo(() => {
        const today = new Date()
        const data = Array.from({ length: 7 }, (_, index) => {
            const dt = new Date(today)
            dt.setHours(0, 0, 0, 0)
            dt.setDate(today.getDate() - (6 - index))
            return {
                key: dt.toISOString().slice(0, 10),
                day: shortDayLabel(dt),
                count: 0,
            }
        })

        const indexByKey = new Map<string, number>()
        data.forEach((row, idx) => indexByKey.set(row.key, idx))

        notifications.forEach((item) => {
            const created = item.created_at
            if (!created) return
            const key = created.slice(0, 10)
            const idx = indexByKey.get(key)
            if (idx === undefined) return
            data[idx].count += 1
        })

        return data
    }, [notifications])

    const notificationTypeData = React.useMemo(() => {
        const typeMap = new Map<string, number>([
            ["general", 0],
            ["evaluation_submitted", 0],
            ["evaluation_locked", 0],
        ])

        notifications.forEach((n) => {
            const normalized = String(n.type ?? "general").toLowerCase()
            if (!typeMap.has(normalized)) {
                typeMap.set(normalized, 0)
            }
            typeMap.set(normalized, (typeMap.get(normalized) ?? 0) + 1)
        })

        const entries = Array.from(typeMap.entries()).map(([name, value], idx) => ({
            name,
            value,
            color: CHART_COLORS[idx % CHART_COLORS.length],
        }))

        return entries.length
            ? entries
            : [{ name: "general", value: 0, color: CHART_COLORS[0] }]
    }, [notifications])

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

    const pageLoading = authLoading || loading

    return (
        <DashboardLayout
            title="Student Overview"
            description="Your notification activity and latest ranking snapshot."
        >
            <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        title="Unread Notifications"
                        value={pageLoading ? "..." : metrics.unreadCount.toLocaleString()}
                        subtitle="Items needing your attention"
                        icon={BellDot}
                    />
                    <MetricCard
                        title="Total Notifications"
                        value={pageLoading ? "..." : metrics.totalNotifications.toLocaleString()}
                        subtitle="All recent updates"
                        icon={Bell}
                    />
                    <MetricCard
                        title="Evaluation Updates"
                        value={pageLoading ? "..." : metrics.evaluationUpdates.toLocaleString()}
                        subtitle="Evaluation-related notices"
                        icon={BarChart3}
                    />
                    <MetricCard
                        title="Top Group Score"
                        value={pageLoading ? "..." : `${metrics.highestGroupScore.toFixed(2)}%`}
                        subtitle="Highest score in current ranking"
                        icon={Trophy}
                    />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Notifications (Last 7 Days)</CardTitle>
                            <CardDescription>Daily count of received notifications</CardDescription>
                        </CardHeader>
                        <CardContent className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={last7DaysNotifications}>
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
                                    <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="var(--chart-2)" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Notification Types</CardTitle>
                            <CardDescription>Distribution by notification category</CardDescription>
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
                                        data={notificationTypeData}
                                        dataKey="value"
                                        nameKey="name"
                                        innerRadius={56}
                                        outerRadius={98}
                                        label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                                    >
                                        {notificationTypeData.map((entry, index) => (
                                            <Cell key={`${entry.name}-${index}`} fill={entry.color} />
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
                        <CardDescription>Leaderboard snapshot from latest rankings</CardDescription>
                    </CardHeader>
                    <CardContent className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topRankingData}>
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
                                    formatter={(value: number) => `${value.toFixed(2)}%`}
                                    contentStyle={{
                                        backgroundColor: "var(--card)",
                                        borderColor: "var(--border)",
                                        borderRadius: "var(--radius)",
                                    }}
                                />
                                <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                                    {topRankingData.map((_, index) => (
                                        <Cell key={`student-rank-cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
