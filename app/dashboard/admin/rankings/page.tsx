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

type GroupRankingRecord = {
    group_id: string
    group_title: string
    group_percentage: number | null
    submitted_evaluations: number
    latest_defense_at: string | null
    rank: number
}

type StudentRankingRecord = {
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

type RankingItem = GroupRankingRecord | StudentRankingRecord

const LIMIT_OPTIONS = [10, 25, 50, 100] as const
const GROUP_FALLBACK_LIMIT = 500

const DEFENSE_DATE_KEYS: string[] = [
    "latest_defense_at",
    "latestDefenseAt",
    "latest_defense_datetime",
    "latestDefenseDatetime",
    "latest_defense_date",
    "latestDefenseDate",
    "last_defense_at",
    "lastDefenseAt",
    "defense_datetime",
    "defenseDateTime",
    "defense_at",
    "defenseAt",
    "schedule_datetime",
    "scheduleDatetime",
    "scheduled_at",
    "scheduledAt",
    "latest_evaluation_at",
    "latestEvaluationAt",
    "evaluated_at",
    "evaluatedAt",
    "updated_at",
    "updatedAt",
    "created_at",
    "createdAt",
]

const DEFENSE_CONTAINER_KEYS: string[] = [
    "latest_defense",
    "latestDefense",
    "defense_schedule",
    "defenseSchedule",
    "schedule",
    "group",
    "thesis_group",
    "thesisGroup",
]

const DEFENSE_ARRAY_KEYS: string[] = [
    "defense_schedules",
    "defenseSchedules",
    "schedules",
]

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

function toRank(value: unknown, fallback = 0): number {
    const parsed = toNumberSafe(value)
    if (parsed === null) return fallback
    const int = Math.floor(parsed)
    return int > 0 ? int : fallback
}

function toSubmittedEvaluations(value: unknown): number {
    const parsed = toNumberSafe(value) ?? 0
    const normalized = Math.floor(parsed)
    return normalized < 0 ? 0 : normalized
}

function toEpoch(value: string | null): number {
    if (!value) return 0
    const d = new Date(value)
    const ms = d.getTime()
    return Number.isNaN(ms) ? 0 : ms
}

function normalizeDateCandidate(value: unknown): string | null {
    if (value === null || value === undefined) return null

    if (typeof value === "string") {
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : null
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        const ms = value > 10_000_000_000 ? value : value * 1000
        const d = new Date(ms)
        if (Number.isNaN(d.getTime())) return null
        return d.toISOString()
    }

    return null
}

function pickDateFromRecord(record: Record<string, unknown>): string | null {
    for (const key of DEFENSE_DATE_KEYS) {
        const candidate = normalizeDateCandidate(record[key])
        if (candidate) return candidate
    }
    return null
}

function extractLatestFromArray(arr: unknown[], depth: number): string | null {
    let latestValue: string | null = null
    let latestEpoch = 0

    for (const entry of arr) {
        let candidate: string | null = null

        if (isRecord(entry)) {
            candidate = extractLatestDefenseAt(entry, depth + 1)
        } else {
            candidate = normalizeDateCandidate(entry)
        }

        if (!candidate) continue

        const epoch = toEpoch(candidate)
        if (epoch > latestEpoch) {
            latestEpoch = epoch
            latestValue = candidate
            continue
        }

        if (!latestValue) {
            latestValue = candidate
        }
    }

    return latestValue
}

function extractLatestDefenseAt(raw: Record<string, unknown>, depth = 0): string | null {
    if (depth > 3) return null

    const direct = pickDateFromRecord(raw)
    if (direct) return direct

    for (const key of DEFENSE_CONTAINER_KEYS) {
        const nested = raw[key]

        if (isRecord(nested)) {
            const nestedValue = extractLatestDefenseAt(nested, depth + 1)
            if (nestedValue) return nestedValue
        }

        if (Array.isArray(nested)) {
            const nestedArrayValue = extractLatestFromArray(nested, depth + 1)
            if (nestedArrayValue) return nestedArrayValue
        }
    }

    for (const key of DEFENSE_ARRAY_KEYS) {
        const arr = raw[key]
        if (!Array.isArray(arr)) continue
        const arrayValue = extractLatestFromArray(arr, depth + 1)
        if (arrayValue) return arrayValue
    }

    const defenseDate = toStringSafe(raw.defense_date ?? raw.defenseDate ?? raw.schedule_date ?? raw.scheduleDate)
    const defenseTime = toStringSafe(raw.defense_time ?? raw.defenseTime ?? raw.schedule_time ?? raw.scheduleTime)

    if (defenseDate && defenseTime) return `${defenseDate}T${defenseTime}`
    if (defenseDate) return defenseDate

    return null
}

function formatPercent(value: number | null): string {
    if (value === null) return "—"
    return `${value.toFixed(2)}%`
}

function formatDate(value: string | null): string {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function extractItems(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []
    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (isRecord(payload.data) && Array.isArray(payload.data.items)) return payload.data.items
    return []
}

function normalizeGroupRanking(raw: unknown): GroupRankingRecord | null {
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
        latest_defense_at: extractLatestDefenseAt(raw),
        rank: toRank(raw.rank),
    }
}

function normalizeStudentRanking(raw: unknown): StudentRankingRecord | null {
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
        latest_defense_at: extractLatestDefenseAt(raw),
        rank: toRank(raw.rank),
    }
}

function isGroupRanking(item: RankingItem): item is GroupRankingRecord {
    return "group_id" in item && "group_percentage" in item
}

function isStudentRanking(item: RankingItem): item is StudentRankingRecord {
    return "student_id" in item && "student_percentage" in item
}

function metricFromItem(item: RankingItem, target: RankingTarget): number | null {
    if (target === "group" && isGroupRanking(item)) return item.group_percentage
    if (target === "student" && isStudentRanking(item)) return item.student_percentage
    return null
}

function entityLabel(item: RankingItem, target: RankingTarget): string {
    if (target === "group" && isGroupRanking(item)) {
        return item.group_title
    }

    if (target === "student" && isStudentRanking(item)) {
        return item.student_name ?? item.student_email ?? item.student_id
    }

    return "—"
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

async function fetchGroupLatestDefenseMap(): Promise<Map<string, string>> {
    try {
        const params = new URLSearchParams({
            limit: String(GROUP_FALLBACK_LIMIT),
            target: "group",
        })

        const res = await fetch(`/api/admin/rankings?${params.toString()}`, {
            cache: "no-store",
        })

        const payload = (await res.json().catch(() => null)) as unknown
        if (!res.ok) return new Map()

        const groups = extractItems(payload)
            .map(normalizeGroupRanking)
            .filter((item): item is GroupRankingRecord => item !== null)

        const map = new Map<string, string>()
        for (const group of groups) {
            if (!group.group_id || !group.latest_defense_at) continue
            map.set(group.group_id, group.latest_defense_at)
        }

        return map
    } catch {
        return new Map()
    }
}

function applyStudentLatestDefenseFallback(
    students: StudentRankingRecord[],
    groupLatestById: Map<string, string>,
): StudentRankingRecord[] {
    if (groupLatestById.size === 0) return students

    return students.map((student) => {
        if (student.latest_defense_at) return student
        if (!student.group_id) return student

        const groupLatest = groupLatestById.get(student.group_id)
        if (!groupLatest) return student

        return {
            ...student,
            latest_defense_at: groupLatest,
        }
    })
}

export default function AdminRankingsPage() {
    const [target, setTarget] = React.useState<RankingTarget>("group")
    const [rankings, setRankings] = React.useState<RankingItem[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [limit, setLimit] = React.useState<number>(25)

    const loadRankings = React.useCallback(
        async (options?: { silent?: boolean }) => {
            const silent = options?.silent ?? false
            setLoading(true)
            setError(null)

            try {
                const params = new URLSearchParams({
                    limit: String(limit),
                    target,
                })

                const res = await fetch(`/api/admin/rankings?${params.toString()}`, {
                    cache: "no-store",
                })

                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    throw new Error(await readErrorMessage(res, payload))
                }

                const rawItems = extractItems(payload)

                const parsed =
                    target === "group"
                        ? rawItems
                            .map(normalizeGroupRanking)
                            .filter((item): item is GroupRankingRecord => item !== null)
                        : await (async () => {
                            let students = rawItems
                                .map(normalizeStudentRanking)
                                .filter((item): item is StudentRankingRecord => item !== null)

                            const hasMissingLatestDefense = students.some(
                                (item) => !item.latest_defense_at && !!item.group_id,
                            )

                            if (hasMissingLatestDefense) {
                                const fallbackMap = await fetchGroupLatestDefenseMap()
                                students = applyStudentLatestDefenseFallback(students, fallbackMap)
                            }

                            return students
                        })()

                parsed.sort((a, b) => {
                    const rankDiff = a.rank - b.rank
                    if (rankDiff !== 0) return rankDiff

                    const metricA = metricFromItem(a, target) ?? Number.NEGATIVE_INFINITY
                    const metricB = metricFromItem(b, target) ?? Number.NEGATIVE_INFINITY
                    if (metricB !== metricA) return metricB - metricA

                    return entityLabel(a, target).toLowerCase().localeCompare(entityLabel(b, target).toLowerCase())
                })

                setRankings(parsed)

                if (!silent) {
                    toast.success(
                        target === "group"
                            ? "Group rankings refreshed."
                            : "Student rankings refreshed.",
                    )
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to fetch rankings."
                setError(message)
                setRankings([])
                if (!silent) toast.error(message)
            } finally {
                setLoading(false)
            }
        },
        [limit, target],
    )

    React.useEffect(() => {
        void loadRankings({ silent: true })
    }, [loadRankings])

    const filteredRankings = React.useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return rankings

        if (target === "group") {
            return rankings.filter((item) => {
                if (!isGroupRanking(item)) return false
                return (
                    item.group_title.toLowerCase().includes(q) ||
                    item.group_id.toLowerCase().includes(q) ||
                    String(item.rank).includes(q)
                )
            })
        }

        return rankings.filter((item) => {
            if (!isStudentRanking(item)) return false
            return (
                (item.student_name ?? "").toLowerCase().includes(q) ||
                (item.student_email ?? "").toLowerCase().includes(q) ||
                item.student_id.toLowerCase().includes(q) ||
                (item.group_title ?? "").toLowerCase().includes(q) ||
                String(item.rank).includes(q)
            )
        })
    }, [rankings, search, target])

    const topItem = filteredRankings[0] ?? null

    const averagePercentage = React.useMemo(() => {
        const values = filteredRankings
            .map((item) => metricFromItem(item, target))
            .filter((value): value is number => typeof value === "number" && Number.isFinite(value))

        if (values.length === 0) return null

        const total = values.reduce((acc, curr) => acc + curr, 0)
        return total / values.length
    }, [filteredRankings, target])

    const withScoreCount = React.useMemo(() => {
        return filteredRankings.reduce((count, item) => {
            return metricFromItem(item, target) !== null ? count + 1 : count
        }, 0)
    }, [filteredRankings, target])

    const tableColSpan = target === "group" ? 5 : 6

    return (
        <DashboardLayout
            title="Rankings"
            description={
                target === "group"
                    ? "Group leaderboard based on submitted defense evaluations."
                    : "Student leaderboard based on submitted defense evaluations."
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

                        <p className="text-sm text-muted-foreground">
                            Showing <span className="font-semibold text-foreground">{filteredRankings.length}</span>{" "}
                            of <span className="font-semibold text-foreground">{rankings.length}</span>{" "}
                            ranked {target === "group" ? "group(s)" : "student(s)"}.
                        </p>
                    </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-card p-4">
                        <p className="text-xs font-medium text-muted-foreground">
                            Top {target === "group" ? "Group" : "Student"}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                            {topItem ? `${topItem.rank}. ${entityLabel(topItem, target)}` : "—"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {topItem
                                ? `Score: ${formatPercent(metricFromItem(topItem, target))}`
                                : "No data"}
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
                        <p className="text-xs font-medium text-muted-foreground">
                            {target === "group" ? "Groups With Score" : "Students With Score"}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                            {withScoreCount.toLocaleString()}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Out of {filteredRankings.length.toLocaleString()} filtered{" "}
                            {target === "group" ? "group(s)" : "student(s)"}
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
                                        <TableHead className="min-w-40">Group Percentage</TableHead>
                                        <TableHead className="min-w-40">Submitted Evaluations</TableHead>
                                        <TableHead className="min-w-56">Latest Defense</TableHead>
                                    </>
                                ) : (
                                    <>
                                        <TableHead className="min-w-72">Student</TableHead>
                                        <TableHead className="min-w-56">Group</TableHead>
                                        <TableHead className="min-w-40">Student Percentage</TableHead>
                                        <TableHead className="min-w-40">Submitted Evaluations</TableHead>
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
                                        No ranking data found.
                                    </TableCell>
                                </TableRow>
                            ) : target === "group" ? (
                                filteredRankings
                                    .filter((item): item is GroupRankingRecord => isGroupRanking(item))
                                    .map((item) => (
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
                            ) : (
                                filteredRankings
                                    .filter((item): item is StudentRankingRecord => isStudentRanking(item))
                                    .map((item) => (
                                        <TableRow key={item.student_id}>
                                            <TableCell>
                                                <span className="inline-flex rounded-md border px-2 py-1 text-xs font-semibold">
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
                                                        <span className="text-xs text-muted-foreground">{item.group_id}</span>
                                                    ) : null}
                                                </div>
                                            </TableCell>

                                            <TableCell>{formatPercent(item.student_percentage)}</TableCell>

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
