"use client"

import * as React from "react"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type ThesisRole = "student" | "staff" | "admin" | "panelist"
type UserStatus = "active" | "disabled"
type EvaluationStatus = "pending" | "submitted" | "locked" | (string & {})

type UserRecord = {
    id: string
    name: string
    email: string
    role: ThesisRole
    status: UserStatus
    avatar_key: string | null
    created_at: string
    updated_at: string
}

type GroupRankingRecord = {
    group_id: string
    group_title: string
    group_percentage: number | `${number}` | null
    submitted_evaluations: number
    latest_defense_at: string | null
    rank: number
}

type EvaluationRecord = {
    id: string
    schedule_id: string
    evaluator_id: string
    status: EvaluationStatus
    submitted_at: string | null
    locked_at: string | null
    created_at: string
}

type UsersResponse = {
    items?: UserRecord[]
    error?: string
    message?: string
}

type RankingsResponse = {
    items?: GroupRankingRecord[]
    error?: string
    message?: string
}

type EvaluationsResponse = {
    items?: EvaluationRecord[]
    error?: string
    message?: string
}

const ROLE_FILTERS: Array<"all" | ThesisRole> = ["all", "admin", "staff", "student", "panelist"]
const SUBMISSION_FILTERS: Array<"all" | "1+" | "2+" | "3+"> = ["all", "1+", "2+", "3+"]

function toTitleCase(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDate(value: string | null) {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function toNumber(value: number | `${number}` | null | undefined): number | null {
    if (value === null || value === undefined) return null
    const parsed = typeof value === "number" ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function formatPercent(value: number | null, fractionDigits = 2) {
    if (value === null) return "N/A"
    return `${value.toFixed(fractionDigits)}%`
}

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { error?: string; message?: string }
        return data.error || data.message || `Request failed (${res.status})`
    } catch {
        return `Request failed (${res.status})`
    }
}

function escapeCsvValue(value: string | number | null) {
    const raw = value === null ? "" : String(value)
    const escaped = raw.replace(/"/g, '""')
    return `"${escaped}"`
}

function downloadCsv(filename: string, rows: Array<Array<string | number | null>>) {
    const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
}

export default function AdminReportsPage() {
    const [users, setUsers] = React.useState<UserRecord[]>([])
    const [rankings, setRankings] = React.useState<GroupRankingRecord[]>([])
    const [evaluations, setEvaluations] = React.useState<EvaluationRecord[]>([])

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

    const [rankingSearch, setRankingSearch] = React.useState("")
    const [roleFilter, setRoleFilter] = React.useState<"all" | ThesisRole>("all")
    const [submissionFilter, setSubmissionFilter] = React.useState<"all" | "1+" | "2+" | "3+">("all")

    const loadReports = React.useCallback(
        async (isRefresh = false) => {
            if (isRefresh) {
                setRefreshing(true)
            } else {
                setLoading(true)
            }

            setError(null)

            try {
                const [rankingsRes, usersRes, evaluationsRes] = await Promise.all([
                    fetch("/api/admin/rankings?limit=200", { cache: "no-store" }),
                    fetch("/api/users?limit=1000", { cache: "no-store" }),
                    fetch("/api/evaluations?limit=1000", { cache: "no-store" }),
                ])

                if (!rankingsRes.ok) {
                    throw new Error(await readErrorMessage(rankingsRes))
                }
                if (!usersRes.ok) {
                    throw new Error(await readErrorMessage(usersRes))
                }
                if (!evaluationsRes.ok) {
                    throw new Error(await readErrorMessage(evaluationsRes))
                }

                const rankingsData = (await rankingsRes.json()) as RankingsResponse
                const usersData = (await usersRes.json()) as UsersResponse
                const evaluationsData = (await evaluationsRes.json()) as EvaluationsResponse

                setRankings(Array.isArray(rankingsData.items) ? rankingsData.items : [])
                setUsers(Array.isArray(usersData.items) ? usersData.items : [])
                setEvaluations(Array.isArray(evaluationsData.items) ? evaluationsData.items : [])
                setLastUpdated(new Date().toISOString())
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load reports.")
                setRankings([])
                setUsers([])
                setEvaluations([])
            } finally {
                setLoading(false)
                setRefreshing(false)
            }
        },
        [],
    )

    React.useEffect(() => {
        void loadReports()
    }, [loadReports])

    const userCounts = React.useMemo(() => {
        const byRole: Record<ThesisRole, number> = {
            admin: 0,
            staff: 0,
            student: 0,
            panelist: 0,
        }

        let active = 0
        let disabled = 0

        for (const user of users) {
            if (user.status === "active") active += 1
            if (user.status === "disabled") disabled += 1
            byRole[user.role] += 1
        }

        return {
            total: users.length,
            active,
            disabled,
            byRole,
        }
    }, [users])

    const rankingMetrics = React.useMemo(() => {
        const numericPercentages = rankings
            .map((r) => toNumber(r.group_percentage))
            .filter((v): v is number => v !== null)

        const average =
            numericPercentages.length > 0
                ? numericPercentages.reduce((sum, value) => sum + value, 0) / numericPercentages.length
                : null

        const top = rankings.length > 0 ? rankings[0] : null

        return {
            total: rankings.length,
            scored: numericPercentages.length,
            average,
            top,
        }
    }, [rankings])

    const evaluationCounts = React.useMemo(() => {
        const counters = {
            pending: 0,
            submitted: 0,
            locked: 0,
            other: 0,
        }

        for (const item of evaluations) {
            const status = String(item.status ?? "").trim().toLowerCase()
            if (status === "pending") counters.pending += 1
            else if (status === "submitted") counters.submitted += 1
            else if (status === "locked") counters.locked += 1
            else counters.other += 1
        }

        return counters
    }, [evaluations])

    const filteredRankings = React.useMemo(() => {
        const q = rankingSearch.trim().toLowerCase()

        const minSubmissions = (() => {
            if (submissionFilter === "1+") return 1
            if (submissionFilter === "2+") return 2
            if (submissionFilter === "3+") return 3
            return 0
        })()

        return rankings.filter((item) => {
            if (item.submitted_evaluations < minSubmissions) return false

            if (!q) return true
            return (
                item.group_title.toLowerCase().includes(q) ||
                item.group_id.toLowerCase().includes(q) ||
                String(item.rank).includes(q)
            )
        })
    }, [rankings, rankingSearch, submissionFilter])

    const roleRows = React.useMemo(() => {
        return (["admin", "staff", "student", "panelist"] as const).map((role) => {
            const roleUsers = users.filter((u) => u.role === role)
            const active = roleUsers.filter((u) => u.status === "active").length
            const disabled = roleUsers.filter((u) => u.status === "disabled").length

            return {
                role,
                total: roleUsers.length,
                active,
                disabled,
            }
        })
    }, [users])

    const filteredRecentUsers = React.useMemo(() => {
        const scoped = roleFilter === "all" ? users : users.filter((u) => u.role === roleFilter)
        return [...scoped]
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            .slice(0, 10)
    }, [users, roleFilter])

    const recentEvaluations = React.useMemo(() => {
        return [...evaluations]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 10)
    }, [evaluations])

    const exportRankingsCsv = React.useCallback(() => {
        if (rankings.length === 0) return

        const rows: Array<Array<string | number | null>> = [
            ["Rank", "Group Title", "Group ID", "Group Percentage", "Submitted Evaluations", "Latest Defense At"],
            ...rankings.map((item) => [
                item.rank,
                item.group_title,
                item.group_id,
                toNumber(item.group_percentage),
                item.submitted_evaluations,
                item.latest_defense_at,
            ]),
        ]

        downloadCsv("admin-report-rankings.csv", rows)
    }, [rankings])

    const exportUsersCsv = React.useCallback(() => {
        if (users.length === 0) return

        const rows: Array<Array<string | number | null>> = [
            ["ID", "Name", "Email", "Role", "Status", "Created At", "Updated At"],
            ...users.map((user) => [
                user.id,
                user.name,
                user.email,
                user.role,
                user.status,
                user.created_at,
                user.updated_at,
            ]),
        ]

        downloadCsv("admin-report-users.csv", rows)
    }, [users])

    return (
        <DashboardLayout title="Reports" description="Consolidated analytics and summary reports.">
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <p className="text-sm text-muted-foreground">
                                Last updated:{" "}
                                <span className="font-medium text-foreground">
                                    {lastUpdated ? formatDate(lastUpdated) : "—"}
                                </span>
                            </p>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => void loadReports(true)}
                                    disabled={loading || refreshing}
                                >
                                    {loading ? "Loading..." : refreshing ? "Refreshing..." : "Refresh"}
                                </Button>

                                <Button variant="outline" onClick={exportUsersCsv} disabled={users.length === 0}>
                                    Export Users CSV
                                </Button>

                                <Button
                                    variant="outline"
                                    onClick={exportRankingsCsv}
                                    disabled={rankings.length === 0}
                                >
                                    Export Rankings CSV
                                </Button>
                            </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Total Users</p>
                                <p className="mt-1 text-2xl font-semibold">{userCounts.total}</p>
                                <p className="text-xs text-muted-foreground">
                                    Active: {userCounts.active} • Disabled: {userCounts.disabled}
                                </p>
                            </div>

                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Groups Ranked</p>
                                <p className="mt-1 text-2xl font-semibold">{rankingMetrics.total}</p>
                                <p className="text-xs text-muted-foreground">
                                    Avg Score: {formatPercent(rankingMetrics.average)}
                                </p>
                            </div>

                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Evaluations</p>
                                <p className="mt-1 text-2xl font-semibold">{evaluations.length}</p>
                                <p className="text-xs text-muted-foreground">
                                    Pending: {evaluationCounts.pending} • Submitted: {evaluationCounts.submitted}
                                </p>
                            </div>

                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Top Group</p>
                                <p className="mt-1 line-clamp-1 text-base font-semibold">
                                    {rankingMetrics.top?.group_title ?? "—"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {rankingMetrics.top
                                        ? `Score: ${formatPercent(toNumber(rankingMetrics.top.group_percentage))}`
                                        : "No ranking data"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h2 className="text-base font-semibold">Thesis Group Rankings</h2>
                                <p className="text-sm text-muted-foreground">
                                    Showing {filteredRankings.length} of {rankings.length} ranked group(s)
                                </p>
                            </div>

                            <Input
                                placeholder="Search group title, group ID, or rank"
                                value={rankingSearch}
                                onChange={(e) => setRankingSearch(e.target.value)}
                                className="w-full md:max-w-sm"
                            />
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Minimum submitted evaluations</p>
                            <div className="flex flex-wrap gap-2">
                                {SUBMISSION_FILTERS.map((filter) => {
                                    const active = submissionFilter === filter
                                    return (
                                        <Button
                                            key={filter}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setSubmissionFilter(filter)}
                                        >
                                            {filter === "all" ? "All" : filter}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="min-w-20">Rank</TableHead>
                                    <TableHead className="min-w-64">Group</TableHead>
                                    <TableHead className="min-w-40">Score</TableHead>
                                    <TableHead className="min-w-40">Submitted</TableHead>
                                    <TableHead className="min-w-56">Latest Defense</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={`ranking-skeleton-${i}`}>
                                            <TableCell colSpan={5}>
                                                <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredRankings.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                                            No ranking records found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredRankings.map((item) => (
                                        <TableRow key={item.group_id}>
                                            <TableCell className="font-medium">#{item.rank}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{item.group_title}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {item.group_id}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{formatPercent(toNumber(item.group_percentage))}</TableCell>
                                            <TableCell>{item.submitted_evaluations}</TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {formatDate(item.latest_defense_at)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-lg border bg-card p-4">
                        <div className="mb-3">
                            <h2 className="text-base font-semibold">User Distribution by Role</h2>
                            <p className="text-sm text-muted-foreground">Role and account status breakdown.</p>
                        </div>

                        <div className="overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Total</TableHead>
                                        <TableHead>Active</TableHead>
                                        <TableHead>Disabled</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {roleRows.map((row) => (
                                        <TableRow key={row.role}>
                                            <TableCell className="font-medium">{toTitleCase(row.role)}</TableCell>
                                            <TableCell>{row.total}</TableCell>
                                            <TableCell>{row.active}</TableCell>
                                            <TableCell>{row.disabled}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="mt-4 space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Recent users filter by role</p>
                            <div className="flex flex-wrap gap-2">
                                {ROLE_FILTERS.map((role) => {
                                    const active = roleFilter === role
                                    return (
                                        <Button
                                            key={role}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setRoleFilter(role)}
                                        >
                                            {toTitleCase(role)}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="mt-4 overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-56">User</TableHead>
                                        <TableHead className="min-w-36">Role</TableHead>
                                        <TableHead className="min-w-32">Status</TableHead>
                                        <TableHead className="min-w-56">Updated</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        Array.from({ length: 4 }).map((_, i) => (
                                            <TableRow key={`users-mini-skeleton-${i}`}>
                                                <TableCell colSpan={4}>
                                                    <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : filteredRecentUsers.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                                                No user records found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredRecentUsers.map((user) => (
                                            <TableRow key={user.id}>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{user.name}</span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {user.email}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{toTitleCase(user.role)}</TableCell>
                                                <TableCell>{toTitleCase(user.status)}</TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {formatDate(user.updated_at)}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    <div className="rounded-lg border bg-card p-4">
                        <div className="mb-3">
                            <h2 className="text-base font-semibold">Recent Evaluations</h2>
                            <p className="text-sm text-muted-foreground">
                                Latest entries with current status snapshots.
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Pending</p>
                                <p className="mt-1 text-xl font-semibold">{evaluationCounts.pending}</p>
                            </div>
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Submitted</p>
                                <p className="mt-1 text-xl font-semibold">{evaluationCounts.submitted}</p>
                            </div>
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Locked</p>
                                <p className="mt-1 text-xl font-semibold">{evaluationCounts.locked}</p>
                            </div>
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Other</p>
                                <p className="mt-1 text-xl font-semibold">{evaluationCounts.other}</p>
                            </div>
                        </div>

                        <div className="mt-4 overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-44">Evaluation ID</TableHead>
                                        <TableHead className="min-w-32">Status</TableHead>
                                        <TableHead className="min-w-44">Submitted At</TableHead>
                                        <TableHead className="min-w-44">Locked At</TableHead>
                                        <TableHead className="min-w-44">Created At</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        Array.from({ length: 4 }).map((_, i) => (
                                            <TableRow key={`eval-skeleton-${i}`}>
                                                <TableCell colSpan={5}>
                                                    <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : recentEvaluations.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                                                No evaluations found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        recentEvaluations.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-medium">{item.id}</TableCell>
                                                <TableCell>{toTitleCase(String(item.status))}</TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {formatDate(item.submitted_at)}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {formatDate(item.locked_at)}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {formatDate(item.created_at)}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
