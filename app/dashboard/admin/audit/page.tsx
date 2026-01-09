/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    ClipboardCopy,
    Filter,
    Loader2,
    RefreshCw,
    Search,
    ShieldCheck,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type AuditLog = {
    id: string
    actorId: string | null
    actorName?: string | null
    actorEmail?: string | null
    action: string
    entity: string
    entityId: string | null
    details: any
    createdAt: string
}

function safeJsonStringify(value: any) {
    try {
        return JSON.stringify(value ?? null, null, 2)
    } catch {
        return String(value)
    }
}

function formatDateTime(iso: string) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString()
}

function buildQuery(params: Record<string, any>) {
    const sp = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null) return
        const s = String(v).trim()
        if (!s) return
        sp.set(k, s)
    })
    return sp.toString()
}

async function fetchFirstOkJson(urls: string[]) {
    let lastErr: any = null

    for (const url of urls) {
        try {
            const res = await fetch(url, {
                method: "GET",
                credentials: "include",
                headers: { "Accept": "application/json" },
            })

            if (res.status === 404) continue

            const data = await res.json().catch(() => null)
            if (!res.ok) {
                const msg =
                    (data && (data.message || data.error)) ||
                    `Request failed (${res.status})`
                throw new Error(msg)
            }

            return { url, data }
        } catch (e: any) {
            lastErr = e
        }
    }

    if (lastErr) throw lastErr
    throw new Error("Audit API not found (tried multiple endpoints).")
}

function normalizeAuditResponse(data: any): { logs: AuditLog[]; total: number } {
    // Accept a few common response shapes:
    // { ok: true, logs, total }
    // { ok: true, items, total }
    // { ok: true, auditLogs, total }
    // { logs, total }
    const raw =
        (data?.logs ?? data?.items ?? data?.auditLogs ?? data?.rows ?? []) as any[]

    const logs: AuditLog[] = (Array.isArray(raw) ? raw : []).map((x) => ({
        id: String(x?.id ?? ""),
        actorId: x?.actorId ?? x?.actor_id ?? null,
        actorName: x?.actorName ?? x?.actor_name ?? x?.actor?.name ?? null,
        actorEmail: x?.actorEmail ?? x?.actor_email ?? x?.actor?.email ?? null,
        action: String(x?.action ?? ""),
        entity: String(x?.entity ?? ""),
        entityId: x?.entityId ?? x?.entity_id ?? null,
        details: x?.details ?? x?.meta ?? x?.data ?? null,
        createdAt: String(x?.createdAt ?? x?.created_at ?? x?.timestamp ?? ""),
    }))

    const total =
        Number.isFinite(Number(data?.total)) ? Number(data.total) :
            Number.isFinite(Number(data?.count)) ? Number(data.count) :
                logs.length

    return { logs, total }
}

export default function AdminAuditPage() {
    const router = useRouter()
    const { user, loading } = useAuth() as any

    const [q, setQ] = React.useState("")
    const [action, setAction] = React.useState<string>("all")
    const [entity, setEntity] = React.useState<string>("all")
    const [actor, setActor] = React.useState("")
    const [from, setFrom] = React.useState("") // YYYY-MM-DD
    const [to, setTo] = React.useState("") // YYYY-MM-DD

    const [limit, setLimit] = React.useState(50)
    const [page, setPage] = React.useState(0)

    const [isLoading, setIsLoading] = React.useState(false)
    const [logs, setLogs] = React.useState<AuditLog[]>([])
    const [total, setTotal] = React.useState(0)
    const [apiHint, setApiHint] = React.useState<string>("")

    // Debounce search text so we don't spam requests while typing
    const [debouncedQ, setDebouncedQ] = React.useState(q)
    React.useEffect(() => {
        const t = setTimeout(() => setDebouncedQ(q), 350)
        return () => clearTimeout(t)
    }, [q])

    const isAdmin = String(user?.role ?? "").toLowerCase() === "admin"

    React.useEffect(() => {
        if (loading) return
        if (!user) {
            router.push("/login")
            return
        }
        if (!isAdmin) {
            router.push("/dashboard")
        }
    }, [loading, user, isAdmin, router])

    const offset = page * limit

    const load = React.useCallback(async () => {
        setIsLoading(true)
        try {
            const query = buildQuery({
                q: debouncedQ,
                action: action !== "all" ? action : undefined,
                entity: entity !== "all" ? entity : undefined,
                actorId: actor,
                from: from ? `${from}T00:00:00.000Z` : undefined,
                to: to ? `${to}T23:59:59.999Z` : undefined,
                limit,
                offset,
            })

            const candidates = [
                `/api/admin/audit?${query}`,
                `/api/admin/audit-logs?${query}`,
                `/api/audit?${query}`,
                `/api/audit-logs?${query}`,
            ]

            const { url, data } = await fetchFirstOkJson(candidates)
            setApiHint(url.split("?")[0])

            const norm = normalizeAuditResponse(data)
            setLogs(norm.logs)
            setTotal(norm.total)
        } catch (err: any) {
            setLogs([])
            setTotal(0)
            toast.error("Failed to load audit logs", {
                description: err?.message ?? "Please try again.",
            })
        } finally {
            setIsLoading(false)
        }
    }, [debouncedQ, action, entity, actor, from, to, limit, offset])

    React.useEffect(() => {
        if (!loading && user && isAdmin) load()
    }, [load, loading, user, isAdmin])

    function resetFilters() {
        setQ("")
        setAction("all")
        setEntity("all")
        setActor("")
        setFrom("")
        setTo("")
        setPage(0)
    }

    const totalPages = Math.max(1, Math.ceil((total || 0) / limit))
    const canPrev = page > 0
    const canNext = page + 1 < totalPages

    return (
        <DashboardLayout title="Audit Logs">
            <div className="mx-auto w-full max-w-6xl space-y-4">
                <Card>
                    <CardHeader className="space-y-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                                <CardTitle className="flex items-center gap-2">
                                    <ShieldCheck className="h-5 w-5" />
                                    Audit Logs
                                </CardTitle>
                                <CardDescription>
                                    Read-only, immutable history of important system actions (Admin-only).
                                </CardDescription>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={load} disabled={isLoading}>
                                    {isLoading ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                    )}
                                    Refresh
                                </Button>
                                <Button variant="outline" onClick={resetFilters} disabled={isLoading}>
                                    <Filter className="mr-2 h-4 w-4" />
                                    Reset
                                </Button>
                            </div>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
                            <div className="lg:col-span-5">
                                <Label htmlFor="q">Search</Label>
                                <div className="relative mt-2">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" />
                                    <Input
                                        id="q"
                                        value={q}
                                        onChange={(e) => {
                                            setQ(e.target.value)
                                            setPage(0)
                                        }}
                                        placeholder="Search action/entity/actor/target…"
                                        className="pl-9"
                                    />
                                </div>
                            </div>

                            <div className="lg:col-span-2">
                                <Label>Action</Label>
                                <div className="mt-2">
                                    <Select
                                        value={action}
                                        onValueChange={(v) => {
                                            setAction(v)
                                            setPage(0)
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="All" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All</SelectItem>
                                            <SelectItem value="create">create</SelectItem>
                                            <SelectItem value="update">update</SelectItem>
                                            <SelectItem value="delete">delete</SelectItem>
                                            <SelectItem value="lock">lock</SelectItem>
                                            <SelectItem value="unlock">unlock</SelectItem>
                                            <SelectItem value="login">login</SelectItem>
                                            <SelectItem value="logout">logout</SelectItem>
                                            <SelectItem value="reset_password">reset_password</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="lg:col-span-2">
                                <Label>Entity</Label>
                                <div className="mt-2">
                                    <Select
                                        value={entity}
                                        onValueChange={(v) => {
                                            setEntity(v)
                                            setPage(0)
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="All" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All</SelectItem>
                                            <SelectItem value="users">users</SelectItem>
                                            <SelectItem value="thesis_groups">thesis_groups</SelectItem>
                                            <SelectItem value="defense_schedules">defense_schedules</SelectItem>
                                            <SelectItem value="rubric_templates">rubric_templates</SelectItem>
                                            <SelectItem value="rubric_criteria">rubric_criteria</SelectItem>
                                            <SelectItem value="evaluations">evaluations</SelectItem>
                                            <SelectItem value="student_evaluations">student_evaluations</SelectItem>
                                            <SelectItem value="settings">settings</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="lg:col-span-3">
                                <Label htmlFor="actor">Actor (User ID)</Label>
                                <Input
                                    id="actor"
                                    value={actor}
                                    onChange={(e) => {
                                        setActor(e.target.value)
                                        setPage(0)
                                    }}
                                    placeholder="e.g., UUID"
                                    className="mt-2"
                                />
                            </div>

                            <div className="lg:col-span-3">
                                <Label htmlFor="from">From</Label>
                                <Input
                                    id="from"
                                    type="date"
                                    value={from}
                                    onChange={(e) => {
                                        setFrom(e.target.value)
                                        setPage(0)
                                    }}
                                    className="mt-2"
                                />
                            </div>

                            <div className="lg:col-span-3">
                                <Label htmlFor="to">To</Label>
                                <Input
                                    id="to"
                                    type="date"
                                    value={to}
                                    onChange={(e) => {
                                        setTo(e.target.value)
                                        setPage(0)
                                    }}
                                    className="mt-2"
                                />
                            </div>

                            <div className="lg:col-span-3">
                                <Label>Rows</Label>
                                <div className="mt-2">
                                    <Select
                                        value={String(limit)}
                                        onValueChange={(v) => {
                                            const n = Number(v)
                                            setLimit(Number.isFinite(n) ? n : 50)
                                            setPage(0)
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="50" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="10">10</SelectItem>
                                            <SelectItem value="25">25</SelectItem>
                                            <SelectItem value="50">50</SelectItem>
                                            <SelectItem value="100">100</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                            <div className="text-sm text-muted-foreground">
                                {apiHint ? (
                                    <span>
                                        API: <span className="font-mono">{apiHint}</span>
                                    </span>
                                ) : (
                                    <span />
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <Badge variant="secondary">
                                    Total: {Number.isFinite(total) ? total : 0}
                                </Badge>
                                <Badge variant="outline">
                                    Page {page + 1} / {totalPages}
                                </Badge>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-3">
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-50">Time</TableHead>
                                        <TableHead>Actor</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Entity</TableHead>
                                        <TableHead>Target</TableHead>
                                        <TableHead className="text-right">Details</TableHead>
                                    </TableRow>
                                </TableHeader>

                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                                                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                                                Loading audit logs…
                                            </TableCell>
                                        </TableRow>
                                    ) : logs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                                                No audit logs found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        logs.map((log) => (
                                            <TableRow key={log.id}>
                                                <TableCell className="align-top">
                                                    <div className="text-sm">{formatDateTime(log.createdAt)}</div>
                                                    <div className="text-xs text-muted-foreground font-mono">{log.id}</div>
                                                </TableCell>

                                                <TableCell className="align-top">
                                                    <div className="text-sm">
                                                        {log.actorName ? log.actorName : log.actorId ? "User" : "System"}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {log.actorEmail ? log.actorEmail : log.actorId ? (
                                                            <span className="font-mono">{log.actorId}</span>
                                                        ) : (
                                                            <span className="font-mono">—</span>
                                                        )}
                                                    </div>
                                                </TableCell>

                                                <TableCell className="align-top">
                                                    <Badge variant="secondary" className="capitalize">
                                                        {log.action || "unknown"}
                                                    </Badge>
                                                </TableCell>

                                                <TableCell className="align-top">
                                                    <div className="text-sm">{log.entity || "—"}</div>
                                                </TableCell>

                                                <TableCell className="align-top">
                                                    {log.entityId ? (
                                                        <span className="font-mono text-xs">{log.entityId}</span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </TableCell>

                                                <TableCell className="align-top text-right">
                                                    <Dialog>
                                                        <DialogTrigger asChild>
                                                            <Button variant="outline" size="sm">
                                                                View
                                                            </Button>
                                                        </DialogTrigger>
                                                        <DialogContent className="max-w-3xl">
                                                            <DialogHeader>
                                                                <DialogTitle>Audit Log Details</DialogTitle>
                                                            </DialogHeader>

                                                            <div className="space-y-3">
                                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                                    <div className="rounded-md border p-3">
                                                                        <div className="text-xs text-muted-foreground">Time</div>
                                                                        <div className="text-sm">{formatDateTime(log.createdAt)}</div>
                                                                    </div>
                                                                    <div className="rounded-md border p-3">
                                                                        <div className="text-xs text-muted-foreground">Action</div>
                                                                        <div className="text-sm">{log.action}</div>
                                                                    </div>
                                                                    <div className="rounded-md border p-3">
                                                                        <div className="text-xs text-muted-foreground">Entity</div>
                                                                        <div className="text-sm">{log.entity}</div>
                                                                    </div>
                                                                    <div className="rounded-md border p-3">
                                                                        <div className="text-xs text-muted-foreground">Target ID</div>
                                                                        <div className="text-sm font-mono break-all">{log.entityId ?? "—"}</div>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center justify-between gap-2">
                                                                    <div className="text-sm text-muted-foreground">
                                                                        <span className="font-mono">{log.id}</span>
                                                                    </div>

                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={async () => {
                                                                            const text = safeJsonStringify(log.details)
                                                                            try {
                                                                                await navigator.clipboard.writeText(text)
                                                                                toast.success("Copied details")
                                                                            } catch {
                                                                                toast.error("Failed to copy")
                                                                            }
                                                                        }}
                                                                    >
                                                                        <ClipboardCopy className="mr-2 h-4 w-4" />
                                                                        Copy JSON
                                                                    </Button>
                                                                </div>

                                                                <div className="rounded-md border bg-muted/30">
                                                                    <pre
                                                                        className={cn(
                                                                            "max-h-105 overflow-auto p-4 text-xs leading-relaxed",
                                                                            "font-mono"
                                                                        )}
                                                                    >
                                                                        {safeJsonStringify(log.details)}
                                                                    </pre>
                                                                </div>
                                                            </div>
                                                        </DialogContent>
                                                    </Dialog>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-sm text-muted-foreground">
                                Showing{" "}
                                <span className="font-medium text-foreground">
                                    {logs.length === 0 ? 0 : offset + 1}
                                </span>{" "}
                                to{" "}
                                <span className="font-medium text-foreground">
                                    {Math.min(offset + logs.length, total || offset + logs.length)}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                                    disabled={isLoading || !canPrev}
                                >
                                    Prev
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setPage((p) => p + 1)}
                                    disabled={isLoading || !canNext}
                                >
                                    Next
                                </Button>

                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        // CSV export of currently loaded rows (not the entire dataset)
                                        if (!logs.length) {
                                            toast.error("No rows to export")
                                            return
                                        }
                                        const cols = ["createdAt", "actorId", "actorName", "actorEmail", "action", "entity", "entityId", "details"]
                                        const escape = (v: any) => {
                                            const s = v === null || v === undefined ? "" : String(v)
                                            const needs = /[",\n]/.test(s)
                                            const out = s.replace(/"/g, '""')
                                            return needs ? `"${out}"` : out
                                        }
                                        const lines = [
                                            cols.join(","),
                                            ...logs.map((r) =>
                                                cols
                                                    .map((c) => {
                                                        if (c === "details") return escape(safeJsonStringify((r as any)[c]))
                                                        return escape((r as any)[c])
                                                    })
                                                    .join(",")
                                            ),
                                        ]
                                        const csv = lines.join("\n")
                                        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
                                        const url = URL.createObjectURL(blob)
                                        const a = document.createElement("a")
                                        a.href = url
                                        a.download = `audit-logs-page-${page + 1}.csv`
                                        document.body.appendChild(a)
                                        a.click()
                                        a.remove()
                                        URL.revokeObjectURL(url)
                                        toast.success("Exported CSV")
                                    }}
                                    disabled={isLoading}
                                >
                                    Export CSV
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Notes</CardTitle>
                        <CardDescription>
                            This page is intentionally read-only. Audit logs must not be deleted or edited.
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        </DashboardLayout>
    )
}
