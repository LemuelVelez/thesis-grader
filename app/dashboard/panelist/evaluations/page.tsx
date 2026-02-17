"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type EvaluationStatus = "pending" | "submitted" | "locked" | (string & {})

type EvaluationItem = {
    id: string
    schedule_id: string
    evaluator_id: string
    status: EvaluationStatus
    submitted_at: string | null
    locked_at: string | null
    created_at: string | null
}

type DefenseScheduleOption = {
    id: string
    group_id: string
    group_title: string | null
    scheduled_at: string | null
    room: string | null
    status: string
}

type UserOption = {
    id: string
    name: string | null
    email: string | null
    role: string
}

type UserProfile = {
    id: string
    name: string | null
}

type DisplayEvaluationItem = EvaluationItem & {
    evaluationName: string
    scheduleName: string
    scheduleMeta: string
    evaluatorName: string
    evaluatorRole: string | null
}

const STATUS_FILTERS = ["all", "pending", "submitted", "locked"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const EVALUATIONS_ENDPOINT = "/api/panelist/evaluations"
const CURRENT_USER_ENDPOINTS = ["/api/users/me", "/api/auth/me", "/api/me"] as const
const USERS_ENDPOINTS = ["/api/users"] as const
const SCHEDULES_ENDPOINTS = ["/api/defense-schedules"] as const

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

function toTitleCase(value: string): string {
    if (!value) return value
    return value.charAt(0).toUpperCase() + value.slice(1)
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

function compact(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function statusVariant(status: string): "secondary" | "outline" | "default" | "destructive" {
    const normalized = status.toLowerCase()
    if (normalized === "submitted") return "default"
    if (normalized === "locked") return "destructive"
    if (normalized === "pending") return "secondary"
    return "outline"
}

function normalizeEvaluation(raw: unknown): EvaluationItem | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    if (!id) return null

    const scheduleId = toStringSafe(raw.schedule_id ?? raw.scheduleId)
    const evaluatorId = toStringSafe(raw.evaluator_id ?? raw.evaluatorId)
    if (!scheduleId || !evaluatorId) return null

    const status = (toStringSafe(raw.status) ?? "pending") as EvaluationStatus

    return {
        id,
        schedule_id: scheduleId,
        evaluator_id: evaluatorId,
        status,
        submitted_at: toNullableString(raw.submitted_at ?? raw.submittedAt),
        locked_at: toNullableString(raw.locked_at ?? raw.lockedAt),
        created_at: toNullableString(raw.created_at ?? raw.createdAt),
    }
}

function normalizeSchedule(raw: unknown): DefenseScheduleOption | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    const groupId = toStringSafe(raw.group_id ?? raw.groupId)
    if (!id || !groupId) return null

    return {
        id,
        group_id: groupId,
        group_title:
            toNullableString(raw.group_title ?? raw.groupTitle) ??
            toNullableString(raw.title ?? raw.group_name ?? raw.groupName),
        scheduled_at: toNullableString(raw.scheduled_at ?? raw.scheduledAt),
        room: toNullableString(raw.room),
        status: toStringSafe(raw.status) ?? "scheduled",
    }
}

function normalizeUser(raw: unknown): UserOption | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    if (!id) return null

    return {
        id,
        name: toNullableString(raw.name),
        email: toNullableString(raw.email),
        role: toStringSafe(raw.role) ?? "panelist",
    }
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

function extractObjectPayload(payload: unknown): Record<string, unknown> | null {
    if (!isRecord(payload)) return null

    if (isRecord(payload.user)) return payload.user
    if (isRecord(payload.item)) return payload.item

    if (isRecord(payload.data)) {
        if (isRecord(payload.data.user)) return payload.data.user
        return payload.data
    }

    return payload
}

function isStatusFilter(value: string): value is StatusFilter {
    return (STATUS_FILTERS as readonly string[]).includes(value)
}

async function readErrorMessage(res: Response, payload: unknown): Promise<string> {
    if (isRecord(payload)) {
        const error = toStringSafe(payload.error)
        if (error) return error

        const message = toStringSafe(payload.message)
        if (message) return message
    }

    return `Request failed (${res.status})`
}

async function fetchFirstSuccessfulObject(endpointList: readonly string[]): Promise<Record<string, unknown> | null> {
    for (const endpoint of endpointList) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            const payload = (await res.json().catch(() => null)) as unknown
            if (!res.ok) continue

            const extracted = extractObjectPayload(payload)
            if (extracted) return extracted
        } catch {
            // try next endpoint
        }
    }

    return null
}

async function fetchFirstSuccessfulArray(endpointList: readonly string[]): Promise<unknown[]> {
    for (const endpoint of endpointList) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            const payload = (await res.json().catch(() => null)) as unknown
            if (!res.ok) continue

            return extractArrayPayload(payload)
        } catch {
            // try next endpoint
        }
    }

    return []
}

async function resolveCurrentUserProfile(): Promise<UserProfile | null> {
    const source = await fetchFirstSuccessfulObject(CURRENT_USER_ENDPOINTS)
    if (!source) return null

    const id = toStringSafe(source.id ?? source.user_id ?? source.userId)
    if (!id) return null

    return {
        id,
        name: toNullableString(source.name),
    }
}

export default function PanelistEvaluationsPage() {
    const [items, setItems] = React.useState<EvaluationItem[]>([])
    const [schedules, setSchedules] = React.useState<DefenseScheduleOption[]>([])
    const [users, setUsers] = React.useState<UserOption[]>([])
    const [currentUser, setCurrentUser] = React.useState<UserProfile | null>(null)

    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")

    const loadEvaluations = React.useCallback(
        async (options?: { showSuccessToast?: boolean; showErrorToast?: boolean }) => {
            const { showSuccessToast = false, showErrorToast = true } = options ?? {}

            setLoading(true)
            setError(null)

            try {
                const me = await resolveCurrentUserProfile()
                setCurrentUser(me)

                const evalRes = await fetch(EVALUATIONS_ENDPOINT, { cache: "no-store" })
                const evalPayload = (await evalRes.json().catch(() => null)) as unknown

                if (!evalRes.ok) {
                    throw new Error(await readErrorMessage(evalRes, evalPayload))
                }

                let parsedItems = extractArrayPayload(evalPayload)
                    .map(normalizeEvaluation)
                    .filter((item): item is EvaluationItem => item !== null)

                // Extra client-side guard: if we can resolve current user, only keep assigned records.
                if (me?.id) {
                    const meId = me.id.toLowerCase()
                    parsedItems = parsedItems.filter(
                        (item) => item.evaluator_id.toLowerCase() === meId,
                    )
                }

                const [scheduleRows, userRows] = await Promise.all([
                    fetchFirstSuccessfulArray(SCHEDULES_ENDPOINTS),
                    fetchFirstSuccessfulArray(USERS_ENDPOINTS),
                ])

                setItems(parsedItems)
                setSchedules(
                    scheduleRows
                        .map(normalizeSchedule)
                        .filter((item): item is DefenseScheduleOption => item !== null),
                )
                setUsers(
                    userRows.map(normalizeUser).filter((item): item is UserOption => item !== null),
                )

                if (showSuccessToast) {
                    toast.success("Evaluations refreshed")
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unable to load evaluations."
                setError(message)

                if (showErrorToast) {
                    toast.error("Unable to load evaluations", { description: message })
                }
            } finally {
                setLoading(false)
            }
        },
        [],
    )

    React.useEffect(() => {
        void loadEvaluations({ showErrorToast: false })
    }, [loadEvaluations])

    const scheduleById = React.useMemo(() => {
        const map = new Map<string, DefenseScheduleOption>()
        for (const item of schedules) {
            map.set(item.id.toLowerCase(), item)
        }
        return map
    }, [schedules])

    const userById = React.useMemo(() => {
        const map = new Map<string, UserOption>()
        for (const item of users) {
            map.set(item.id.toLowerCase(), item)
        }
        return map
    }, [users])

    const scopedItems = React.useMemo(() => {
        if (!currentUser?.id) return items
        const meId = currentUser.id.toLowerCase()
        return items.filter((item) => item.evaluator_id.toLowerCase() === meId)
    }, [currentUser?.id, items])

    const displayItems = React.useMemo<DisplayEvaluationItem[]>(() => {
        return scopedItems.map((item) => {
            const schedule = scheduleById.get(item.schedule_id.toLowerCase()) ?? null
            const evaluator = userById.get(item.evaluator_id.toLowerCase()) ?? null

            const scheduleName = compact(schedule?.group_title) ?? "Defense Schedule"

            const scheduleDate = formatDateTime(schedule?.scheduled_at ?? null)
            const scheduleRoom = compact(schedule?.room)
            const scheduleStatus = schedule?.status ? toTitleCase(schedule.status) : null

            const scheduleMetaParts = [scheduleDate, scheduleRoom, scheduleStatus].filter(
                (part): part is string => !!part,
            )
            const scheduleMeta = scheduleMetaParts.length > 0 ? scheduleMetaParts.join(" • ") : "—"

            const currentUserName =
                currentUser && currentUser.id.toLowerCase() === item.evaluator_id.toLowerCase()
                    ? compact(currentUser.name)
                    : null

            const evaluatorName =
                compact(evaluator?.name) ??
                compact(evaluator?.email) ??
                currentUserName ??
                "Assigned Panelist"

            return {
                ...item,
                evaluationName: `Evaluation for ${scheduleName}`,
                scheduleName,
                scheduleMeta,
                evaluatorName,
                evaluatorRole: evaluator ? toTitleCase(evaluator.role) : null,
            }
        })
    }, [currentUser, scheduleById, scopedItems, userById])

    const filteredItems = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return [...displayItems]
            .filter((item) => {
                if (statusFilter !== "all" && item.status.toLowerCase() !== statusFilter) {
                    return false
                }

                if (!q) return true

                return (
                    item.evaluationName.toLowerCase().includes(q) ||
                    item.scheduleName.toLowerCase().includes(q) ||
                    item.evaluatorName.toLowerCase().includes(q) ||
                    item.scheduleMeta.toLowerCase().includes(q) ||
                    item.status.toLowerCase().includes(q)
                )
            })
            .sort((a, b) => toEpoch(b.created_at) - toEpoch(a.created_at))
    }, [displayItems, search, statusFilter])

    const totals = React.useMemo(() => {
        let pending = 0
        let submitted = 0
        let locked = 0

        for (const item of scopedItems) {
            const s = item.status.toLowerCase()
            if (s === "pending") pending += 1
            else if (s === "submitted") submitted += 1
            else if (s === "locked") locked += 1
        }

        return {
            all: scopedItems.length,
            pending,
            submitted,
            locked,
        }
    }, [scopedItems])

    return (
        <DashboardLayout
            title="Evaluations"
            description="View and open evaluations assigned to you."
        >
            <div className="space-y-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Filter & Search</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {currentUser ? (
                            <Alert>
                                <AlertTitle>
                                    Signed in as {compact(currentUser.name) ?? "Panelist"}
                                </AlertTitle>
                                <AlertDescription>
                                    This page only shows evaluations assigned to your account.
                                </AlertDescription>
                            </Alert>
                        ) : null}

                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by schedule, evaluator name, or status"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />
                            <Button
                                variant="outline"
                                onClick={() => void loadEvaluations({ showSuccessToast: true })}
                                disabled={loading}
                            >
                                Refresh
                            </Button>
                        </div>

                        <Tabs
                            value={statusFilter}
                            onValueChange={(value) =>
                                setStatusFilter(isStatusFilter(value) ? value : "all")
                            }
                            className="w-full"
                        >
                            <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-4">
                                {STATUS_FILTERS.map((status) => (
                                    <TabsTrigger key={status} value={status}>
                                        {status === "all" ? "All" : toTitleCase(status)}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <Card>
                                <CardContent className="pt-4">
                                    <p className="text-xs text-muted-foreground">All</p>
                                    <p className="text-xl font-semibold">{totals.all}</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4">
                                    <p className="text-xs text-muted-foreground">Pending</p>
                                    <p className="text-xl font-semibold">{totals.pending}</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4">
                                    <p className="text-xs text-muted-foreground">Submitted</p>
                                    <p className="text-xl font-semibold">{totals.submitted}</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4">
                                    <p className="text-xs text-muted-foreground">Locked</p>
                                    <p className="text-xl font-semibold">{totals.locked}</p>
                                </CardContent>
                            </Card>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Showing{" "}
                            <span className="font-semibold text-foreground">{filteredItems.length}</span>{" "}
                            of <span className="font-semibold text-foreground">{totals.all}</span>{" "}
                            evaluation(s).
                        </p>
                    </CardContent>
                </Card>

                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>Unable to load evaluations</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                <Card className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-56">Evaluation</TableHead>
                                <TableHead className="min-w-72">Schedule</TableHead>
                                <TableHead className="min-w-56">Assigned Evaluator</TableHead>
                                <TableHead className="min-w-32">Status</TableHead>
                                <TableHead className="min-w-52">Submitted</TableHead>
                                <TableHead className="min-w-52">Locked</TableHead>
                                <TableHead className="min-w-36 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <TableRow key={`skeleton-${i}`}>
                                        <TableCell colSpan={7}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredItems.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                        No evaluations found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredItems.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">
                                            <div className="space-y-0.5">
                                                <p>{item.evaluationName}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {item.created_at
                                                        ? `Created ${formatDateTime(item.created_at)}`
                                                        : "Created date unavailable"}
                                                </p>
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            <div className="space-y-0.5">
                                                <p className="font-medium">{item.scheduleName}</p>
                                                <p className="text-xs text-muted-foreground">{item.scheduleMeta}</p>
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            <div className="space-y-0.5">
                                                <p className="font-medium">{item.evaluatorName}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {item.evaluatorRole ?? "Panelist"}
                                                </p>
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            <Badge variant={statusVariant(item.status)}>
                                                {toTitleCase(item.status)}
                                            </Badge>
                                        </TableCell>

                                        <TableCell className="text-muted-foreground">
                                            {formatDateTime(item.submitted_at)}
                                        </TableCell>

                                        <TableCell className="text-muted-foreground">
                                            {formatDateTime(item.locked_at)}
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex items-center justify-end">
                                                <Button asChild variant="outline" size="sm">
                                                    <Link href={`/dashboard/panelist/evaluations/${item.id}`}>
                                                        Open
                                                    </Link>
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </Card>
            </div>
        </DashboardLayout>
    )
}
