"use client"

import * as React from "react"
import Link from "next/link"

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

const STATUS_FILTERS = ["all", "pending", "submitted", "locked"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function toStringSafe(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function toNullableString(value: unknown): string | null {
    if (value === null) return null
    return toStringSafe(value)
}

function toTitleCase(value: string): string {
    if (!value) return value
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDateTime(value: string): string {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function toEpoch(value: string | null): number {
    if (!value) return Number.MAX_SAFE_INTEGER
    const d = new Date(value)
    const ms = d.getTime()
    return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms
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

    const scheduleId = toStringSafe(raw.schedule_id ?? raw.scheduleId) ?? "—"
    const evaluatorId = toStringSafe(raw.evaluator_id ?? raw.evaluatorId) ?? "—"
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

const ENDPOINT_CANDIDATES = [
    "/api/panelist/evaluations",
    "/api/evaluations?mine=1",
    "/api/evaluations",
]

export default function PanelistEvaluationsPage() {
    const [items, setItems] = React.useState<EvaluationItem[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [sourceEndpoint, setSourceEndpoint] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")

    const loadEvaluations = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        let loaded = false
        let latestError = "Unable to load evaluations."

        for (const endpoint of ENDPOINT_CANDIDATES) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const parsed = extractArrayPayload(payload)
                    .map(normalizeEvaluation)
                    .filter((item): item is EvaluationItem => item !== null)

                setItems(parsed)
                setSourceEndpoint(endpoint)
                loaded = true
                break
            } catch (err) {
                latestError = err instanceof Error ? err.message : "Unable to load evaluations."
            }
        }

        if (!loaded) {
            setItems([])
            setSourceEndpoint(null)
            setError(
                `${latestError} No evaluations endpoint responded successfully. ` +
                `Please ensure a panelist evaluations API is available.`,
            )
        }

        setLoading(false)
    }, [])

    React.useEffect(() => {
        void loadEvaluations()
    }, [loadEvaluations])

    const filteredItems = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return [...items]
            .filter((item) => {
                if (statusFilter !== "all" && item.status.toLowerCase() !== statusFilter) {
                    return false
                }

                if (!q) return true

                return (
                    item.id.toLowerCase().includes(q) ||
                    item.schedule_id.toLowerCase().includes(q) ||
                    item.evaluator_id.toLowerCase().includes(q) ||
                    (item.status ?? "").toLowerCase().includes(q)
                )
            })
            .sort((a, b) => toEpoch(a.created_at) - toEpoch(b.created_at))
    }, [items, search, statusFilter])

    const totals = React.useMemo(() => {
        let pending = 0
        let submitted = 0
        let locked = 0

        for (const item of items) {
            const s = item.status.toLowerCase()
            if (s === "pending") pending += 1
            else if (s === "submitted") submitted += 1
            else if (s === "locked") locked += 1
        }

        return {
            all: items.length,
            pending,
            submitted,
            locked,
        }
    }, [items])

    return (
        <DashboardLayout
            title="Evaluations"
            description="View and open your assigned evaluations."
        >
            <div className="space-y-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Filter & Search</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by evaluation ID, schedule ID, evaluator ID, or status"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />
                            <Button variant="outline" onClick={() => void loadEvaluations()} disabled={loading}>
                                Refresh
                            </Button>
                        </div>

                        <Tabs
                            value={statusFilter}
                            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
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
                            <span className="font-semibold text-foreground">{filteredItems.length}</span> of{" "}
                            <span className="font-semibold text-foreground">{items.length}</span> evaluation(s).
                        </p>

                        {sourceEndpoint ? (
                            <p className="text-xs text-muted-foreground">Data source: {sourceEndpoint}</p>
                        ) : null}
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
                                <TableHead className="min-w-48">Evaluation</TableHead>
                                <TableHead className="min-w-48">Schedule ID</TableHead>
                                <TableHead className="min-w-48">Evaluator ID</TableHead>
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
                                        <TableCell className="font-medium">{item.id}</TableCell>
                                        <TableCell>{item.schedule_id}</TableCell>
                                        <TableCell>{item.evaluator_id}</TableCell>
                                        <TableCell>
                                            <Badge variant={statusVariant(item.status)}>
                                                {toTitleCase(item.status)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {item.submitted_at ? formatDateTime(item.submitted_at) : "—"}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {item.locked_at ? formatDateTime(item.locked_at) : "—"}
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
