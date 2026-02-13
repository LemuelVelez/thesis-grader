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

type DbNumeric = number | `${number}`

type RankingRecord = {
    group_id: string
    group_title: string
    group_percentage: DbNumeric | null
    submitted_evaluations: number
    latest_defense_at: string | null
    rank: number
}

type RankingsResponse = {
    items?: RankingRecord[]
    error?: string
    message?: string
}

const LIMIT_OPTIONS = [10, 25, 50, 100] as const

function toNumber(value: DbNumeric | null): number | null {
    if (value === null) return null
    const parsed = typeof value === "number" ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function formatPercent(value: DbNumeric | null): string {
    const num = toNumber(value)
    if (num === null) return "—"
    return `${num.toFixed(2)}%`
}

function formatDate(value: string | null): string {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { error?: string; message?: string }
        return data.error || data.message || `Request failed (${res.status})`
    } catch {
        return `Request failed (${res.status})`
    }
}

export default function AdminRankingsPage() {
    const [rankings, setRankings] = React.useState<RankingRecord[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [limit, setLimit] = React.useState<number>(25)

    const loadRankings = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const res = await fetch(`/api/admin/rankings?limit=${limit}`, {
                cache: "no-store",
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = (await res.json()) as RankingsResponse
            const safeItems = Array.isArray(data.items) ? data.items : []

            safeItems.sort((a, b) => a.rank - b.rank)
            setRankings(safeItems)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch rankings.")
            setRankings([])
        } finally {
            setLoading(false)
        }
    }, [limit])

    React.useEffect(() => {
        void loadRankings()
    }, [loadRankings])

    const filteredRankings = React.useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return rankings

        return rankings.filter((item) => {
            return (
                item.group_title.toLowerCase().includes(q) ||
                item.group_id.toLowerCase().includes(q) ||
                String(item.rank).includes(q)
            )
        })
    }, [rankings, search])

    const topGroup = filteredRankings[0] ?? null

    const averagePercentage = React.useMemo(() => {
        const values = filteredRankings
            .map((item) => toNumber(item.group_percentage))
            .filter((value): value is number => value !== null)

        if (values.length === 0) return null

        const total = values.reduce((acc, curr) => acc + curr, 0)
        return total / values.length
    }, [filteredRankings])

    const withScoreCount = React.useMemo(() => {
        return filteredRankings.reduce((count, item) => {
            return toNumber(item.group_percentage) !== null ? count + 1 : count
        }, 0)
    }, [filteredRankings])

    return (
        <DashboardLayout
            title="Rankings"
            description="View thesis group leaderboard based on overall evaluated percentages."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <Input
                                placeholder="Search by group title, group ID, or rank"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />

                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={() => void loadRankings()} disabled={loading}>
                                    Refresh
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Leaderboard size</p>
                            <div className="flex flex-wrap gap-2">
                                {LIMIT_OPTIONS.map((value) => (
                                    <Button
                                        key={value}
                                        size="sm"
                                        variant={limit === value ? "default" : "outline"}
                                        onClick={() => setLimit(value)}
                                    >
                                        Top {value}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Showing <span className="font-semibold text-foreground">{filteredRankings.length}</span>{" "}
                            of <span className="font-semibold text-foreground">{rankings.length}</span> ranked group(s).
                        </p>
                    </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-card p-4">
                        <p className="text-xs font-medium text-muted-foreground">Top Group</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                            {topGroup ? `${topGroup.rank}. ${topGroup.group_title}` : "—"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {topGroup ? `Score: ${formatPercent(topGroup.group_percentage)}` : "No data"}
                        </p>
                    </div>

                    <div className="rounded-lg border bg-card p-4">
                        <p className="text-xs font-medium text-muted-foreground">Average Score</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                            {averagePercentage === null ? "—" : `${averagePercentage.toFixed(2)}%`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Across filtered results</p>
                    </div>

                    <div className="rounded-lg border bg-card p-4">
                        <p className="text-xs font-medium text-muted-foreground">Groups With Score</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                            {withScoreCount.toLocaleString()}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Out of {filteredRankings.length.toLocaleString()} filtered group(s)
                        </p>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                <div className="overflow-x-auto rounded-lg border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-20">Rank</TableHead>
                                <TableHead className="min-w-72">Group</TableHead>
                                <TableHead className="min-w-40">Group Percentage</TableHead>
                                <TableHead className="min-w-40">Submitted Evaluations</TableHead>
                                <TableHead className="min-w-56">Latest Defense</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <TableRow key={`skeleton-${i}`}>
                                        <TableCell colSpan={5}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredRankings.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                        No ranking data found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredRankings.map((item) => (
                                    <TableRow key={item.group_id}>
                                        <TableCell>
                                            <span className="inline-flex rounded-md border px-2 py-1 text-xs font-semibold">
                                                #{item.rank}
                                            </span>
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{item.group_title}</span>
                                                <span className="text-xs text-muted-foreground">{item.group_id}</span>
                                            </div>
                                        </TableCell>

                                        <TableCell>{formatPercent(item.group_percentage)}</TableCell>

                                        <TableCell>{item.submitted_evaluations.toLocaleString()}</TableCell>

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
        </DashboardLayout>
    )
}
