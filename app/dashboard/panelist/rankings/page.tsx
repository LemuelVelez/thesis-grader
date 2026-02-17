"use client"

import * as React from "react"
import { toast } from "sonner"

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

type RankingTarget = "group" | "student"
type SortBy = "rank" | "name" | "percentage" | "latest"
type SortDirection = "asc" | "desc"

type GroupRankingItem = {
    group_id: string
    group_title: string
    group_percentage: number | null
    submitted_evaluations: number
    latest_defense_at: string | null
    rank: number
}

type StudentRankingItem = {
    student_id: string
    student_name: string | null
    student_email: string | null
    group_id: string | null
    group_title: string | null
    student_percentage: number | null
    submitted_evaluations: number
    latest_defense_at: string | null
    rank: number
}

type RankingItem = GroupRankingItem | StudentRankingItem

const ENDPOINT_CANDIDATES = [
    "/api/panelist/rankings",
    "/api/admin/rankings",
    "/api/rankings",
    "/api/thesis-groups/rankings",
] as const

const LIMIT_OPTIONS = [10, 25, 50, 100, 200] as const

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
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return null
}

function toSubmittedEvaluations(value: unknown): number {
    const parsed = toNumberSafe(value) ?? 0
    const normalized = Math.floor(parsed)
    return normalized < 0 ? 0 : normalized
}

function toRank(value: unknown, fallback = 0): number {
    const parsed = toNumberSafe(value)
    if (parsed === null) return fallback
    const int = Math.floor(parsed)
    return int > 0 ? int : fallback
}

function toEpoch(value: string | null): number {
    if (!value) return 0
    const d = new Date(value)
    const ms = d.getTime()
    return Number.isNaN(ms) ? 0 : ms
}

function formatDateTime(value: string | null): string {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function formatPercent(value: number | null): string {
    if (value === null) return "—"
    return `${value.toFixed(2)}%`
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []
    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (isRecord(payload.data) && Array.isArray(payload.data.items)) return payload.data.items
    if (isRecord(payload.result) && Array.isArray(payload.result.items)) return payload.result.items
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

function normalizeGroupRanking(raw: unknown): GroupRankingItem | null {
    if (!isRecord(raw)) return null

    const groupId = toStringSafe(raw.group_id ?? raw.groupId ?? raw.id)
    if (!groupId) return null

    return {
        group_id: groupId,
        group_title:
            toStringSafe(raw.group_title ?? raw.groupTitle ?? raw.title) ?? `Group ${groupId}`,
        group_percentage: toNumberSafe(raw.group_percentage ?? raw.groupPercentage ?? raw.percentage),
        submitted_evaluations: toSubmittedEvaluations(
            raw.submitted_evaluations ??
            raw.submittedEvaluations ??
            raw.evaluations_count ??
            raw.evaluationsCount,
        ),
        latest_defense_at: toNullableString(raw.latest_defense_at ?? raw.latestDefenseAt),
        rank: toRank(raw.rank),
    }
}

function normalizeStudentRanking(raw: unknown): StudentRankingItem | null {
    if (!isRecord(raw)) return null

    const studentId = toStringSafe(raw.student_id ?? raw.studentId ?? raw.id)
    if (!studentId) return null

    return {
        student_id: studentId,
        student_name: toNullableString(raw.student_name ?? raw.studentName ?? raw.name),
        student_email: toNullableString(raw.student_email ?? raw.studentEmail ?? raw.email),
        group_id: toNullableString(raw.group_id ?? raw.groupId),
        group_title: toNullableString(raw.group_title ?? raw.groupTitle),
        student_percentage: toNumberSafe(raw.student_percentage ?? raw.studentPercentage ?? raw.percentage),
        submitted_evaluations: toSubmittedEvaluations(
            raw.submitted_evaluations ??
            raw.submittedEvaluations ??
            raw.evaluations_count ??
            raw.evaluationsCount,
        ),
        latest_defense_at: toNullableString(raw.latest_defense_at ?? raw.latestDefenseAt),
        rank: toRank(raw.rank),
    }
}

function isGroupRanking(item: RankingItem): item is GroupRankingItem {
    return "group_id" in item && "group_percentage" in item
}

function isStudentRanking(item: RankingItem): item is StudentRankingItem {
    return "student_id" in item && "student_percentage" in item
}

function metricFromItem(item: RankingItem, target: RankingTarget): number | null {
    if (target === "group" && isGroupRanking(item)) return item.group_percentage
    if (target === "student" && isStudentRanking(item)) return item.student_percentage
    return null
}

function nameFromItem(item: RankingItem, target: RankingTarget): string {
    if (target === "group" && isGroupRanking(item)) return item.group_title
    if (target === "student" && isStudentRanking(item)) {
        return item.student_name ?? item.student_email ?? item.student_id
    }
    return ""
}

function percentageTone(value: number | null): string {
    if (value === null) return "border-muted-foreground/30 bg-muted text-muted-foreground"
    if (value >= 90) return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
    if (value >= 75) return "border-primary/40 bg-primary/10 text-foreground"
    if (value >= 60) return "border-amber-500/40 bg-amber-500/10 text-foreground"
    return "border-destructive/40 bg-destructive/10 text-destructive"
}

export default function PanelistRankingsPage() {
    const [target, setTarget] = React.useState<RankingTarget>("group")
    const [rankings, setRankings] = React.useState<RankingItem[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [sortBy, setSortBy] = React.useState<SortBy>("rank")
    const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc")
    const [limit, setLimit] = React.useState<number>(50)

    const loadRankings = React.useCallback(
        async (options?: { silent?: boolean }) => {
            const silent = options?.silent ?? false
            setLoading(true)
            setError(null)

            let loaded = false
            let latestError = "Unable to load rankings."

            for (const endpoint of ENDPOINT_CANDIDATES) {
                try {
                    const params = new URLSearchParams({
                        limit: String(limit),
                        target,
                    })
                    const url = endpoint.includes("?")
                        ? `${endpoint}&${params.toString()}`
                        : `${endpoint}?${params.toString()}`

                    const res = await fetch(url, { cache: "no-store" })
                    const payload = (await res.json().catch(() => null)) as unknown

                    if (!res.ok) {
                        latestError = await readErrorMessage(res, payload)
                        continue
                    }

                    const parsed =
                        target === "group"
                            ? extractArrayPayload(payload)
                                .map(normalizeGroupRanking)
                                .filter((item): item is GroupRankingItem => item !== null)
                            : extractArrayPayload(payload)
                                .map(normalizeStudentRanking)
                                .filter((item): item is StudentRankingItem => item !== null)

                    setRankings(parsed)
                    loaded = true
                    break
                } catch (err) {
                    latestError = err instanceof Error ? err.message : "Unable to load rankings."
                }
            }

            if (!loaded) {
                setRankings([])
                setError(
                    `${latestError} No rankings endpoint responded successfully.`,
                )
                if (!silent) toast.error(latestError)
            } else if (!silent) {
                toast.success(
                    target === "group"
                        ? "Group rankings refreshed."
                        : "Student rankings refreshed.",
                )
            }

            setLoading(false)
        },
        [limit, target],
    )

    React.useEffect(() => {
        void loadRankings({ silent: true })
    }, [loadRankings])

    const filteredRankings = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        const out = rankings.filter((item) => {
            if (!q) return true

            if (target === "group" && isGroupRanking(item)) {
                return (
                    item.group_id.toLowerCase().includes(q) ||
                    item.group_title.toLowerCase().includes(q) ||
                    String(item.rank).includes(q)
                )
            }

            if (target === "student" && isStudentRanking(item)) {
                return (
                    item.student_id.toLowerCase().includes(q) ||
                    (item.student_name ?? "").toLowerCase().includes(q) ||
                    (item.student_email ?? "").toLowerCase().includes(q) ||
                    (item.group_title ?? "").toLowerCase().includes(q) ||
                    String(item.rank).includes(q)
                )
            }

            return false
        })

        out.sort((a, b) => {
            let compare = 0

            if (sortBy === "rank") {
                compare = a.rank - b.rank
            } else if (sortBy === "name") {
                compare = nameFromItem(a, target)
                    .toLowerCase()
                    .localeCompare(nameFromItem(b, target).toLowerCase())
            } else if (sortBy === "percentage") {
                compare = (metricFromItem(a, target) ?? -1) - (metricFromItem(b, target) ?? -1)
            } else {
                compare =
                    toEpoch("latest_defense_at" in a ? a.latest_defense_at : null) -
                    toEpoch("latest_defense_at" in b ? b.latest_defense_at : null)
            }

            return sortDirection === "asc" ? compare : -compare
        })

        return out
    }, [rankings, search, sortBy, sortDirection, target])

    const stats = React.useMemo(() => {
        const percentages = filteredRankings
            .map((item) => metricFromItem(item, target))
            .filter((v): v is number => typeof v === "number" && Number.isFinite(v))

        const top = percentages.length > 0 ? Math.max(...percentages) : null
        const avg =
            percentages.length > 0
                ? percentages.reduce((sum, v) => sum + v, 0) / percentages.length
                : null

        const latestEpoch = Math.max(
            ...filteredRankings.map((x) =>
                toEpoch("latest_defense_at" in x ? x.latest_defense_at : null),
            ),
            0,
        )
        const latestDefenseAt = latestEpoch > 0 ? new Date(latestEpoch).toISOString() : null

        return {
            total: filteredRankings.length,
            average: avg,
            top,
            latestDefenseAt,
        }
    }, [filteredRankings, target])

    const tableColSpan = target === "group" ? 5 : 6

    return (
        <DashboardLayout
            title="Rankings"
            description={
                target === "group"
                    ? "Review thesis group rankings and performance trends."
                    : "Review student rankings and performance trends."
            }
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <Input
                                placeholder={
                                    target === "group"
                                        ? "Search by group title, group ID, or rank"
                                        : "Search by student name, email, ID, group, or rank"
                                }
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />

                            <div className="flex items-center gap-2">
                                <Button
                                    variant={target === "group" ? "default" : "outline"}
                                    onClick={() => setTarget("group")}
                                >
                                    Group Ranking
                                </Button>
                                <Button
                                    variant={target === "student" ? "default" : "outline"}
                                    onClick={() => setTarget("student")}
                                >
                                    Student Ranking
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => void loadRankings({ silent: false })}
                                    disabled={loading}
                                >
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
                                    variant={sortBy === "name" ? "default" : "outline"}
                                    onClick={() => setSortBy("name")}
                                >
                                    {target === "group" ? "Group Name" : "Student Name"}
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
                                <p className="text-xs text-muted-foreground">
                                    {target === "group" ? "Groups" : "Students"}
                                </p>
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
                            ranked {target === "group" ? "group(s)" : "student(s)"}.
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

                                {target === "group" ? (
                                    <>
                                        <TableHead className="min-w-72">Group</TableHead>
                                        <TableHead className="min-w-44">Percentage</TableHead>
                                        <TableHead className="min-w-36">Evaluations</TableHead>
                                        <TableHead className="min-w-56">Latest Defense</TableHead>
                                    </>
                                ) : (
                                    <>
                                        <TableHead className="min-w-72">Student</TableHead>
                                        <TableHead className="min-w-56">Group</TableHead>
                                        <TableHead className="min-w-44">Percentage</TableHead>
                                        <TableHead className="min-w-36">Evaluations</TableHead>
                                        <TableHead className="min-w-56">Latest Defense</TableHead>
                                    </>
                                )}
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <TableRow key={`skeleton-${i}`}>
                                        <TableCell colSpan={tableColSpan}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredRankings.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={tableColSpan} className="h-24 text-center text-muted-foreground">
                                        No rankings found.
                                    </TableCell>
                                </TableRow>
                            ) : target === "group" ? (
                                filteredRankings
                                    .filter((item): item is GroupRankingItem => isGroupRanking(item))
                                    .map((item) => {
                                        const percentageValue = item.group_percentage
                                        const barWidth = Math.max(0, Math.min(100, percentageValue ?? 0))

                                        return (
                                            <TableRow key={item.group_id}>
                                                <TableCell>
                                                    <span className="inline-flex min-w-10 items-center justify-center rounded-md border bg-muted px-2 py-1 text-sm font-semibold">
                                                        #{item.rank}
                                                    </span>
                                                </TableCell>

                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{item.group_title}</span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {item.group_id}
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
                                                            {formatPercent(percentageValue)}
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
                            ) : (
                                filteredRankings
                                    .filter((item): item is StudentRankingItem => isStudentRanking(item))
                                    .map((item) => {
                                        const percentageValue = item.student_percentage
                                        const barWidth = Math.max(0, Math.min(100, percentageValue ?? 0))

                                        return (
                                            <TableRow key={item.student_id}>
                                                <TableCell>
                                                    <span className="inline-flex min-w-10 items-center justify-center rounded-md border bg-muted px-2 py-1 text-sm font-semibold">
                                                        #{item.rank}
                                                    </span>
                                                </TableCell>

                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">
                                                            {item.student_name ?? "Unnamed Student"}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {item.student_email ?? item.student_id}
                                                        </span>
                                                    </div>
                                                </TableCell>

                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">
                                                            {item.group_title ?? "Unassigned Group"}
                                                        </span>
                                                        {item.group_id ? (
                                                            <span className="text-xs text-muted-foreground">
                                                                {item.group_id}
                                                            </span>
                                                        ) : null}
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
                                                            {formatPercent(percentageValue)}
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
