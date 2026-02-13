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

type AuditLogRecord = {
    id: string
    actor_id: string | null
    action: string
    entity: string
    entity_id: string | null
    details: unknown
    created_at: string
}

type AuditLogsResponse = {
    items?: AuditLogRecord[]
    error?: string
    message?: string
}

function toTitleCase(value: string): string {
    if (!value) return value
    return value
        .split(/[_\s-]+/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
}

function formatDate(value: string): string {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function stringifyDetails(value: unknown, pretty = false): string {
    if (value === null || value === undefined) return "—"
    if (typeof value === "string") return value
    if (typeof value === "number" || typeof value === "boolean") return String(value)

    try {
        return JSON.stringify(value, null, pretty ? 2 : 0)
    } catch {
        return "[unserializable details]"
    }
}

function compact(value: string, max = 120): string {
    if (value.length <= max) return value
    return `${value.slice(0, max - 1)}…`
}

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { error?: string; message?: string }
        return data.error || data.message || `Request failed (${res.status})`
    } catch {
        return `Request failed (${res.status})`
    }
}

export default function AdminAuditLogsPage() {
    const [logs, setLogs] = React.useState<AuditLogRecord[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [actionFilter, setActionFilter] = React.useState("all")
    const [entityFilter, setEntityFilter] = React.useState("all")
    const [expandedId, setExpandedId] = React.useState<string | null>(null)

    const loadLogs = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const res = await fetch(
                "/api/admin/audit-logs?limit=300&orderBy=created_at&orderDirection=desc",
                { cache: "no-store" },
            )

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = (await res.json()) as AuditLogsResponse
            const items = Array.isArray(data.items) ? data.items : []
            setLogs(items)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch audit logs.")
            setLogs([])
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void loadLogs()
    }, [loadLogs])

    const actionOptions = React.useMemo(() => {
        const set = new Set<string>()
        for (const row of logs) {
            if (row.action?.trim()) set.add(row.action.trim())
        }
        return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))]
    }, [logs])

    const entityOptions = React.useMemo(() => {
        const set = new Set<string>()
        for (const row of logs) {
            if (row.entity?.trim()) set.add(row.entity.trim())
        }
        return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))]
    }, [logs])

    const filteredLogs = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return logs.filter((row) => {
            if (actionFilter !== "all" && row.action !== actionFilter) return false
            if (entityFilter !== "all" && row.entity !== entityFilter) return false

            if (!q) return true

            const haystack = [
                row.id,
                row.actor_id ?? "",
                row.action,
                row.entity,
                row.entity_id ?? "",
                stringifyDetails(row.details, false),
                row.created_at,
            ]
                .join(" ")
                .toLowerCase()

            return haystack.includes(q)
        })
    }, [logs, search, actionFilter, entityFilter])

    return (
        <DashboardLayout title="Audit Logs" description="Track system actions and data changes for admin monitoring.">
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by action, entity, actor ID, entity ID, or details"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />

                            <div className="flex items-center gap-2">
                                <Button onClick={() => void loadLogs()} variant="outline" disabled={loading}>
                                    Refresh
                                </Button>
                                <Button
                                    onClick={() => {
                                        setSearch("")
                                        setActionFilter("all")
                                        setEntityFilter("all")
                                        setExpandedId(null)
                                    }}
                                    variant="outline"
                                >
                                    Clear Filters
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by action</p>
                            <div className="flex flex-wrap gap-2">
                                {actionOptions.map((value) => {
                                    const active = actionFilter === value
                                    return (
                                        <Button
                                            key={`action-${value}`}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setActionFilter(value)}
                                        >
                                            {value === "all" ? "All" : toTitleCase(value)}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by entity</p>
                            <div className="flex flex-wrap gap-2">
                                {entityOptions.map((value) => {
                                    const active = entityFilter === value
                                    return (
                                        <Button
                                            key={`entity-${value}`}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setEntityFilter(value)}
                                        >
                                            {value === "all" ? "All" : toTitleCase(value)}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Showing <span className="font-semibold text-foreground">{filteredLogs.length}</span>{" "}
                            of <span className="font-semibold text-foreground">{logs.length}</span> log entr
                            {logs.length === 1 ? "y" : "ies"}.
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
                                <TableHead className="min-w-48">Timestamp</TableHead>
                                <TableHead className="min-w-40">Action</TableHead>
                                <TableHead className="min-w-40">Entity</TableHead>
                                <TableHead className="min-w-56">Actor ID</TableHead>
                                <TableHead className="min-w-56">Entity ID</TableHead>
                                <TableHead className="min-w-72">Details</TableHead>
                                <TableHead className="min-w-28 text-right">View</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <TableRow key={`skeleton-${i}`}>
                                        <TableCell colSpan={7}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredLogs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                        No audit logs found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredLogs.map((row) => {
                                    const detailsCompact = compact(stringifyDetails(row.details, false), 120)
                                    const isExpanded = expandedId === row.id

                                    return (
                                        <React.Fragment key={row.id}>
                                            <TableRow>
                                                <TableCell className="font-medium">{formatDate(row.created_at)}</TableCell>

                                                <TableCell>
                                                    <span className="inline-flex rounded-md border px-2 py-1 text-xs font-medium">
                                                        {toTitleCase(row.action)}
                                                    </span>
                                                </TableCell>

                                                <TableCell>
                                                    <span className="inline-flex rounded-md border px-2 py-1 text-xs font-medium">
                                                        {toTitleCase(row.entity)}
                                                    </span>
                                                </TableCell>

                                                <TableCell className="font-mono text-xs text-muted-foreground">
                                                    {row.actor_id ?? "System"}
                                                </TableCell>

                                                <TableCell className="font-mono text-xs text-muted-foreground">
                                                    {row.entity_id ?? "—"}
                                                </TableCell>

                                                <TableCell className="font-mono text-xs text-muted-foreground">
                                                    {detailsCompact}
                                                </TableCell>

                                                <TableCell>
                                                    <div className="flex justify-end">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => {
                                                                setExpandedId((prev) => (prev === row.id ? null : row.id))
                                                            }}
                                                        >
                                                            {isExpanded ? "Hide" : "Show"}
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>

                                            {isExpanded ? (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="bg-muted/40">
                                                        <div className="space-y-2">
                                                            <p className="text-xs font-medium text-muted-foreground">
                                                                Full details JSON
                                                            </p>
                                                            <pre className="max-h-80 overflow-auto rounded-md border bg-background p-3 text-xs leading-relaxed">
                                                                {stringifyDetails(row.details, true)}
                                                            </pre>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : null}
                                        </React.Fragment>
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
