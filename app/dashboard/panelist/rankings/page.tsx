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

type RankingItem = {
    group_id: string
    group_title: string
    group_percentage: number | null
    submitted_evaluations: number
    latest_defense_at: string | null
    rank: number | null
}

type SortBy = "rank" | "percentage" | "latest"
type SortDirection = "asc" | "desc"

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function toStringSafe(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function toNullableString(value: unknown): string | null {
    if (value === null || value === undefined) return null
    return toStringSafe(value)
}

function toNumberSafe(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value
    }

    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) {
            return parsed
        }
    }

    return null
}

function formatDateTime(value: string | null): string {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function toEpoch(value: string | null): number {
    if (!value) return 0
    const d = new Date(value)
    const ms = d.getTime()
    return Number.isNaN(ms) ? 0 : ms
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload

    if (!isRecord(payload)) return []

    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data

    if (isRecord(payload.data) && Array.isArray(payload.data.items)) {
        return payload.data.items
    }

    if (isRecord(payload.result) && Array.isArray(payload.result.items)) {
        return payload.result.items
    }

    return []
}

async function readErrorMessage(res: Response, payload: unknown): Promise<string> {
    if (isRecord(payload)) {
        const error = toStringSafe(payload.error)
        if (error) return error

        const message = toStringSafe(payload.message)
        if (message) return message
    }

    try {
        const text = await res.text()
        if (text.trim().length > 0) return text
    } catch {
        // ignore
    }

    return `Request failed (${res.status})`
}

function normalizeRanking(raw: unknown): RankingItem | null {
    if (!isRecord(raw)) return null

    const groupId = toStringSafe(raw.group_id ?? raw.groupId ?? raw.id)
    if (!groupId) return null

    const submittedRaw =
        toNumberSafe(
            raw.submitted_evaluations ??
            raw.submittedEvaluations ??
            raw.evaluations_count ??
            raw.evaluationsCount,
        ) ?? 0

    const rankRaw = toNumberSafe(raw.rank)

    return {
        group_id: groupId,
        group_title:
            toStringSafe(raw.group_title ?? raw.groupTitle ?? raw.title) ??
            "Untitled Group",
        group_percentage:
            toNumberSafe(raw.group_percentage ?? raw.groupPercentage ?? raw.percentage),
        submitted_evaluations: submittedRaw < 0 ? 0 : Math.floor(submittedRaw),
        latest_defense_at: toNullableString(raw.latest_defense_at ?? raw.latestDefenseAt),
        rank:
            rankRaw !== null && Number.isFinite(rankRaw) && rankRaw > 0
                ? Math.floor(rankRaw)
                : null,
    }
}

function percentageTone(value: number | null): string {
    if (value === null) return "border-muted-foreground/30 bg-muted text-muted-foreground"
    if (value >= 90) return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
    if (value >= 75) return "border-primary/40 bg-primary/10 text-foreground"
    if (value >= 60) return "border-amber-500/40 bg-amber-500/10 text-foreground"
    return "border-destructive/40 bg-destructive/10 text-destructive"
}

const ENDPOINT_CANDIDATES = [
    "/api/panelist/rankings?limit=200",
    "/api/admin/rankings?limit=200",
    "/api/rankings?limit=200",
    "/api/thesis-groups/rankings?limit=200",
] as const

export default function PanelistRankingsPage() {
    const [rankings, setRankings] = React.useState<RankingItem[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [sourceEndpoint, setSourceEndpoint] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [sortBy, setSortBy] = React.useState<SortBy>("rank")
    const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc")

    const loadRankings = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        let loaded = false
        let latestError = "Unable to load rankings."

        for (const endpoint of ENDPOINT_CANDIDATES) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const parsed = extractArrayPayload(payload)
                    .map(normalizeRanking)
                    .filter((item): item is RankingItem => item !== null)

                setRankings(parsed)
                setSourceEndpoint(endpoint)
                loaded = true
                break
            } catch (err) {
                latestError = err instanceof Error ? err.message : "Unable to load rankings."
            }
        }

        if (!loaded) {
            setRankings([])
            setSourceEndpoint(null)
            setError(
                `${latestError} No rankings endpoint responded successfully. ` +
                `Please ensure a rankings API is available.`,
            )
        }

        setLoading(false)
    }, [])

    React.useEffect(() => {
        void loadRankings()
    }, [loadRankings])

    const filteredRankings = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        const out = rankings.filter((item) => {
            if (!q) return true

            return (
                item.group_id.toLowerCase().includes(q) ||
                item.group_title.toLowerCase().includes(q)
            )
        })

        out.sort((a, b) => {
            let compare = 0

            if (sortBy === "rank") {
                compare = (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
            } else if (sortBy === "percentage") {
                compare = (a.group_percentage ?? -1) - (b.group_percentage ?? -1)
            } else {
                compare = toEpoch(a.latest_defense_at) - toEpoch(b.latest_defense_at)
            }

            return sortDirection === "asc" ? compare : -compare
        })

        return out
    }, [rankings, search, sortBy, sortDirection])

    const stats = React.useMemo(() => {
        const percentages = rankings
            .map((item) => item.group_percentage)
            .filter((v): v is number => typeof v === "number" && Number.isFinite(v))

        const top = percentages.length > 0 ? Math.max(...percentages) : null
        const avg =
            percentages.length > 0
                ? percentages.reduce((sum, v) => sum + v, 0) / percentages.length
                : null

        const latestEpoch = Math.max(...rankings.map((x) => toEpoch(x.latest_defense_at)), 0)
        const latestDefenseAt =
            latestEpoch > 0 ? new Date(latestEpoch).toISOString() : null

        return {
            total: rankings.length,
            average: avg,
            top,
            latestDefenseAt,
        }
    }, [rankings])

    return (
        <DashboardLayout
            title="Rankings"
            description="Review current thesis group rankings and overall performance trends."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by group title or group ID"
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
                            <p className="text-xs font-medium text-muted-foreground">Sort by</p>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    size="sm"
                                    variant={sortBy === "rank" ? "default" : "outline"}
                                    onClick={() => setSortBy("rank")}
                                >
                                    Rank
                                </Button>
                                <Button
                                    size="sm"
                                    variant={sortBy === "percentage" ? "default" : "outline"}
                                    onClick={() => setSortBy("percentage")}
                                >
                                    Percentage
                                </Button>
                                <Button
                                    size="sm"
                                    variant={sortBy === "latest" ? "default" : "outline"}
                                    onClick={() => setSortBy("latest")}
                                >
                                    Latest Defense
                                </Button>

                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
                                    }
                                >
                                    Direction: {sortDirection === "asc" ? "Ascending" : "Descending"}
                                </Button>
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Groups</p>
                                <p className="text-lg font-semibold">{stats.total}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Average Score</p>
                                <p className="text-lg font-semibold">
                                    {stats.average === null ? "—" : `${stats.average.toFixed(2)}%`}
                                </p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Top Score</p>
                                <p className="text-lg font-semibold">
                                    {stats.top === null ? "—" : `${stats.top.toFixed(2)}%`}
                                </p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Latest Defense</p>
                                <p className="text-sm font-semibold">
                                    {formatDateTime(stats.latestDefenseAt)}
                                </p>
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Showing{" "}
                            <span className="font-semibold text-foreground">
                                {filteredRankings.length}
                            </span>{" "}
                            of{" "}
                            <span className="font-semibold text-foreground">{rankings.length}</span>{" "}
                            ranked group(s).
                        </p>

                        {sourceEndpoint ? (
                            <p className="text-xs text-muted-foreground">Data source: {sourceEndpoint}</p>
                        ) : null}
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
                                <TableHead className="min-w-44">Percentage</TableHead>
                                <TableHead className="min-w-36">Evaluations</TableHead>
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
                                        No rankings found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredRankings.map((item, index) => {
                                    const rank = item.rank ?? index + 1
                                    const percentageValue = item.group_percentage
                                    const percentageText =
                                        percentageValue === null ? "N/A" : `${percentageValue.toFixed(2)}%`
                                    const barWidth = Math.max(
                                        0,
                                        Math.min(100, percentageValue ?? 0),
                                    )

                                    return (
                                        <TableRow key={`${item.group_id}-${rank}`}>
                                            <TableCell>
                                                <span className="inline-flex min-w-10 items-center justify-center rounded-md border bg-muted px-2 py-1 text-sm font-semibold">
                                                    #{rank}
                                                </span>
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{item.group_title}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        Group ID: {item.group_id}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex flex-col gap-2">
                                                    <span
                                                        className={[
                                                            "inline-flex w-fit rounded-md border px-2 py-1 text-xs font-medium",
                                                            percentageTone(percentageValue),
                                                        ].join(" ")}
                                                    >
                                                        {percentageText}
                                                    </span>
                                                    <div className="h-2 w-full rounded-full bg-muted">
                                                        <div
                                                            className="h-2 rounded-full bg-primary"
                                                            style={{ width: `${barWidth}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </TableCell>

                                            <TableCell>{item.submitted_evaluations}</TableCell>

                                            <TableCell className="text-muted-foreground">
                                                {formatDateTime(item.latest_defense_at)}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </DashboardLayout>
    )
}
