/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { DateRange } from "react-day-picker"
import {
    Calendar as CalendarIcon,
    Check,
    Copy,
    Download,
    Filter,
    MoreHorizontal,
    RefreshCw,
    Search,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type AuditLog = {
    id: string
    actorId?: string | null
    actorName?: string | null
    actorEmail?: string | null
    action?: string | null
    entity?: string | null
    entityId?: string | null
    timestamp?: string | null
    details?: any
    [k: string]: any
}

function roleHome(role: string | null | undefined) {
    const r = String(role ?? "").toLowerCase()
    if (r === "student") return "/dashboard/student"
    if (r === "staff") return "/dashboard/staff"
    if (r === "admin") return "/dashboard/admin"
    return "/dashboard"
}

function safeJsonParse(v: any) {
    if (v == null) return v
    if (typeof v === "object") return v
    if (typeof v !== "string") return v
    const s = v.trim()
    if (!s) return v
    try {
        return JSON.parse(s)
    } catch {
        return v
    }
}

function toIsoMaybe(d?: Date) {
    if (!d) return null
    const t = d.getTime()
    if (!Number.isFinite(t)) return null
    return new Date(t).toISOString()
}

function fmtDate(iso?: string | null) {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)
    return d.toLocaleString()
}

function normalizeAuditResponse(data: any): { total: number | null; logs: AuditLog[] } {
    const arr =
        (Array.isArray(data) ? data : null) ||
        (Array.isArray(data?.logs) ? data.logs : null) ||
        (Array.isArray(data?.auditLogs) ? data.auditLogs : null) ||
        (Array.isArray(data?.items) ? data.items : null) ||
        (Array.isArray(data?.rows) ? data.rows : null) ||
        (Array.isArray(data?.data) ? data.data : null) ||
        (Array.isArray(data?.result) ? data.result : null) ||
        []

    const totalRaw =
        (typeof data?.total === "number" ? data.total : null) ??
        (typeof data?.count === "number" ? data.count : null) ??
        (typeof data?.meta?.total === "number" ? data.meta.total : null) ??
        null

    const logs: AuditLog[] = (arr as any[]).map((x) => {
        const actorName =
            x?.actorName ??
            x?.actor_name ??
            x?.actor?.name ??
            x?.user?.name ??
            x?.actor ??
            null

        const actorEmail =
            x?.actorEmail ??
            x?.actor_email ??
            x?.actor?.email ??
            x?.user?.email ??
            null

        const timestamp =
            x?.timestamp ??
            x?.createdAt ??
            x?.created_at ??
            x?.time ??
            x?.at ??
            null

        const details =
            x?.details ??
            x?.meta ??
            x?.metadata ??
            x?.data ??
            x?.payload ??
            null

        return {
            ...x,
            id: String(x?.id ?? x?.logId ?? x?.auditId ?? `${timestamp ?? ""}-${Math.random()}`),
            actorId: x?.actorId ?? x?.actor_id ?? x?.actor?.id ?? x?.user?.id ?? null,
            actorName: actorName != null ? String(actorName) : null,
            actorEmail: actorEmail != null ? String(actorEmail) : null,
            action: x?.action != null ? String(x?.action) : null,
            entity:
                x?.entity != null
                    ? String(x?.entity)
                    : x?.resource != null
                        ? String(x?.resource)
                        : null,
            entityId:
                x?.entityId != null
                    ? String(x?.entityId)
                    : x?.entity_id != null
                        ? String(x?.entity_id)
                        : x?.resourceId != null
                            ? String(x?.resourceId)
                            : null,
            timestamp: timestamp != null ? String(timestamp) : null,
            details: safeJsonParse(details),
        }
    })

    return { total: totalRaw, logs }
}

async function fetchJson(url: string) {
    const res = await fetch(url, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
    })

    const ct = res.headers.get("content-type") ?? ""
    let data: any = null

    if (ct.includes("application/json")) {
        data = await res.json().catch(() => null)
    } else {
        const text = await res.text().catch(() => "")
        data = { message: text ? text.slice(0, 500) : null }
    }

    if (!res.ok) {
        const msg =
            (data && (data.message || data.error)) ||
            `Request failed (${res.status})`
        throw new Error(msg)
    }

    return { res, data }
}

function buildParamVariants(p: URLSearchParams) {
    const variants: URLSearchParams[] = []

    // 1) original (limit/offset)
    variants.push(new URLSearchParams(p.toString()))

    // 2) page/limit (page starts at 1)
    {
        const v = new URLSearchParams(p.toString())
        const off = Number(v.get("offset") ?? "0")
        const lim = Number(v.get("limit") ?? "50")
        if (v.has("offset") && Number.isFinite(off) && Number.isFinite(lim) && lim > 0) {
            v.delete("offset")
            v.set("page", String(Math.floor(off / lim) + 1))
        }
        variants.push(v)
    }

    // 3) skip/take
    {
        const v = new URLSearchParams(p.toString())
        if (v.has("offset")) {
            v.set("skip", v.get("offset") ?? "0")
            v.delete("offset")
        }
        if (v.has("limit")) {
            v.set("take", v.get("limit") ?? "50")
            v.delete("limit")
        }
        variants.push(v)
    }

    // unique
    const seen = new Set<string>()
    const uniq: URLSearchParams[] = []
    for (const v of variants) {
        const key = v.toString()
        if (seen.has(key)) continue
        seen.add(key)
        uniq.push(v)
    }
    return uniq
}

async function fetchAuditLogs(params: URLSearchParams) {
    const endpoints = ["/api/admin/audit-logs", "/api/admin/audit"]

    let lastErr: any = null

    for (const base of endpoints) {
        for (const variant of buildParamVariants(params)) {
            const url = `${base}?${variant.toString()}`
            try {
                const { res, data } = await fetchJson(url)

                // treat 404 as "endpoint not available", keep trying
                if (res.status === 404) continue

                return { url, data }
            } catch (e: any) {
                lastErr = e
                // try next variant/endpoint
            }
        }
    }

    throw lastErr ?? new Error("No audit endpoint found.")
}

function makeCsvValue(v: any) {
    if (v == null) return ""
    const s = typeof v === "string" ? v : JSON.stringify(v)
    const needsQuotes = /[",\n]/.test(s)
    const escaped = s.replace(/"/g, '""')
    return needsQuotes ? `"${escaped}"` : escaped
}

export default function AdminAuditPage() {
    const router = useRouter()
    const { user, isLoading } = useAuth()

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const [logs, setLogs] = React.useState<AuditLog[]>([])
    const [total, setTotal] = React.useState<number | null>(null)

    const [limit, setLimit] = React.useState(50)
    const [offset, setOffset] = React.useState(0)

    const [q, setQ] = React.useState("")
    const [tab, setTab] = React.useState("all")

    const [entity, setEntity] = React.useState("all")
    const [action, setAction] = React.useState("all")
    const [actor, setActor] = React.useState("all")
    const [range, setRange] = React.useState<DateRange | undefined>(undefined)

    const [selected, setSelected] = React.useState<AuditLog | null>(null)
    const [detailsOpen, setDetailsOpen] = React.useState(false)
    const [prettyJson, setPrettyJson] = React.useState(true)

    const skipAutoLoadRef = React.useRef(false)

    const role = String((user as any)?.role ?? "").toLowerCase()
    const isAdminReady = !isLoading && !!user && role === "admin"

    // access control
    React.useEffect(() => {
        if (isLoading) return
        if (!user) {
            router.replace("/login")
            return
        }
        if (role !== "admin") {
            router.replace(roleHome(role))
        }
    }, [user, isLoading, role, router])

    const uniqueEntities = React.useMemo(() => {
        const s = new Set<string>()
        for (const l of logs) {
            const e = String(l.entity ?? "").trim()
            if (e) s.add(e)
        }
        return Array.from(s).sort((a, b) => a.localeCompare(b))
    }, [logs])

    const uniqueActions = React.useMemo(() => {
        const s = new Set<string>()
        for (const l of logs) {
            const a = String(l.action ?? "").trim()
            if (a) s.add(a)
        }
        return Array.from(s).sort((a, b) => a.localeCompare(b))
    }, [logs])

    const uniqueActors = React.useMemo(() => {
        const s = new Set<string>()
        for (const l of logs) {
            const a = String(l.actorName ?? l.actorEmail ?? "").trim()
            if (a) s.add(a)
        }
        return Array.from(s).sort((a, b) => a.localeCompare(b))
    }, [logs])

    const buildParams = React.useCallback(
        (overrideOffset?: number) => {
            const p = new URLSearchParams()
            p.set("limit", String(limit))
            p.set("offset", String(overrideOffset ?? offset))

            const qq = q.trim()
            if (qq) p.set("q", qq)

            if (entity !== "all") p.set("entity", entity)
            if (action !== "all") p.set("action", action)
            if (actor !== "all") p.set("actor", actor)

            const fromIso = toIsoMaybe(range?.from)
            const toIso = toIsoMaybe(range?.to)
            if (fromIso) p.set("from", fromIso)
            if (toIso) p.set("to", toIso)

            if (tab !== "all") p.set("tab", tab)

            return p
        },
        [limit, offset, q, entity, action, actor, range, tab]
    )

    const load = React.useCallback(
        async (opts?: { overrideOffset?: number; showToast?: boolean; soft?: boolean }) => {
            setError(null)

            if (!opts?.soft) setLoading(true)

            const params = buildParams(opts?.overrideOffset)

            try {
                const { data } = await fetchAuditLogs(params)
                const norm = normalizeAuditResponse(data)
                setLogs(norm.logs)
                setTotal(norm.total)
                if (opts?.showToast) toast.success("Audit logs updated")
            } catch (e: any) {
                const msg = String(e?.message ?? "Failed to load audit logs.")
                setError(msg)
                toast.error("Failed to load audit logs", { description: msg })
            } finally {
                if (!opts?.soft) setLoading(false)
                setRefreshing(false)
            }
        },
        [buildParams]
    )

    // auto-load only when admin auth is ready AND pagination changes
    React.useEffect(() => {
        if (!isAdminReady) return
        if (skipAutoLoadRef.current) {
            skipAutoLoadRef.current = false
            return
        }
        load({ overrideOffset: offset })
    }, [isAdminReady, offset, limit, load])

    const filtered = React.useMemo(() => {
        const qq = q.trim().toLowerCase()
        const entityF = entity
        const actionF = action
        const actorF = actor

        const from = range?.from ? range.from.getTime() : null
        const to = range?.to ? range.to.getTime() : null

        return logs.filter((l) => {
            if (tab !== "all") {
                const ent = String(l.entity ?? "").toLowerCase()
                const act = String(l.action ?? "").toLowerCase()
                const t = tab.toLowerCase()
                if (!ent.includes(t) && !act.includes(t)) return false
            }

            if (entityF !== "all" && String(l.entity ?? "") !== entityF) return false
            if (actionF !== "all" && String(l.action ?? "") !== actionF) return false

            const actorKey = String(l.actorName ?? l.actorEmail ?? "")
            if (actorF !== "all" && actorKey !== actorF) return false

            if (qq) {
                const hay = [
                    l.id,
                    l.actorName,
                    l.actorEmail,
                    l.action,
                    l.entity,
                    l.entityId,
                    l.timestamp,
                    typeof l.details === "string" ? l.details : JSON.stringify(l.details ?? {}),
                ]
                    .map((x) => String(x ?? "").toLowerCase())
                    .join(" ")
                if (!hay.includes(qq)) return false
            }

            if (from != null || to != null) {
                const ts = l.timestamp ? new Date(l.timestamp).getTime() : NaN
                if (!Number.isFinite(ts)) return false
                if (from != null && ts < from) return false
                if (to != null && ts > to) return false
            }

            return true
        })
    }, [logs, q, entity, action, actor, range, tab])

    const canPrev = offset > 0
    const canNext = total != null ? offset + limit < total : logs.length >= limit

    const showingFrom = total != null ? Math.min(total, offset + 1) : offset + 1
    const showingTo =
        total != null
            ? Math.min(total, offset + filtered.length)
            : offset + filtered.length

    function openDetails(l: AuditLog) {
        setSelected(l)
        setDetailsOpen(true)
    }

    async function copyJson(obj: any) {
        try {
            await navigator.clipboard.writeText(JSON.stringify(obj, null, 2))
            toast.success("Copied")
        } catch (e: any) {
            toast.error("Copy failed", { description: String(e?.message ?? "") })
        }
    }

    function exportCsv() {
        const headers = [
            "timestamp",
            "actorName",
            "actorEmail",
            "action",
            "entity",
            "entityId",
            "id",
            "details",
        ]
        const rows = filtered.map((l) => [
            makeCsvValue(l.timestamp),
            makeCsvValue(l.actorName),
            makeCsvValue(l.actorEmail),
            makeCsvValue(l.action),
            makeCsvValue(l.entity),
            makeCsvValue(l.entityId),
            makeCsvValue(l.id),
            makeCsvValue(l.details),
        ])

        const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        toast.success("Exported CSV")
    }

    return (
        <DashboardLayout title="Audit Logs">
            <div className="space-y-6">
                <Card>
                    <CardHeader className="space-y-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Filter className="h-5 w-5" />
                                    Admin Audit Logs
                                </CardTitle>
                                <CardDescription>
                                    Immutable system activity history. Admin-only view.
                                </CardDescription>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        if (!isAdminReady) return
                                        setRefreshing(true)
                                        load({ overrideOffset: offset, showToast: true, soft: true })
                                    }}
                                    disabled={loading || refreshing || !isAdminReady}
                                >
                                    <RefreshCw className={cn("mr-2 h-4 w-4", refreshing ? "animate-spin" : "")} />
                                    Refresh
                                </Button>

                                <Button
                                    variant="outline"
                                    onClick={exportCsv}
                                    disabled={loading || !filtered.length}
                                >
                                    <Download className="mr-2 h-4 w-4" />
                                    Export CSV
                                </Button>
                            </div>
                        </div>

                        <Separator />
                    </CardHeader>

                    <CardContent className="space-y-4">
                        {error ? (
                            <Alert variant="destructive">
                                <AlertTitle>Unable to load audit logs</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        ) : null}

                        <Tabs value={tab} onValueChange={setTab}>
                            <TabsList className="flex flex-wrap justify-start">
                                <TabsTrigger value="all">All</TabsTrigger>
                                <TabsTrigger value="users">Users</TabsTrigger>
                                <TabsTrigger value="thesis">Thesis</TabsTrigger>
                                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                                <TabsTrigger value="rubric">Rubric</TabsTrigger>
                                <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
                                <TabsTrigger value="security">Security</TabsTrigger>
                            </TabsList>
                        </Tabs>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                            <div className="md:col-span-5">
                                <Label htmlFor="q">Search</Label>
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 opacity-60" />
                                    <Input
                                        id="q"
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        placeholder="Search actor, action, entity, id, details..."
                                        className="pl-9"
                                    />
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <Label>Entity</Label>
                                <Select value={entity} onValueChange={setEntity}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        {uniqueEntities.map((e) => (
                                            <SelectItem key={e} value={e}>
                                                {e}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="md:col-span-2">
                                <Label>Action</Label>
                                <Select value={action} onValueChange={setAction}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        {uniqueActions.map((a) => (
                                            <SelectItem key={a} value={a}>
                                                {a}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="md:col-span-3">
                                <Label>Actor</Label>
                                <Select value={actor} onValueChange={setActor}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        {uniqueActors.map((a) => (
                                            <SelectItem key={a} value={a}>
                                                {a}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="md:col-span-6">
                                <Label>Date range</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className={cn(
                                                "w-full justify-start text-left font-normal",
                                                !range?.from && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {range?.from ? (
                                                range.to ? (
                                                    <>
                                                        {range.from.toLocaleDateString()} – {range.to.toLocaleDateString()}
                                                    </>
                                                ) : (
                                                    range.from.toLocaleDateString()
                                                )
                                            ) : (
                                                "Pick a date range"
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            initialFocus
                                            mode="range"
                                            defaultMonth={range?.from}
                                            selected={range}
                                            onSelect={setRange}
                                            numberOfMonths={2}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            <div className="md:col-span-3">
                                <Label>Page size</Label>
                                <Select
                                    value={String(limit)}
                                    onValueChange={(v) => {
                                        const n = Number(v)
                                        setLimit(Number.isFinite(n) && n > 0 ? n : 50)
                                        setOffset(0)
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="25">25</SelectItem>
                                        <SelectItem value="50">50</SelectItem>
                                        <SelectItem value="100">100</SelectItem>
                                        <SelectItem value="200">200</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="md:col-span-3 flex items-center-safe gap-2 flex-col">
                                <Button
                                    className="w-full"
                                    onClick={() => {
                                        if (!isAdminReady) return
                                        skipAutoLoadRef.current = true
                                        setOffset(0)
                                        load({ overrideOffset: 0 })
                                    }}
                                    disabled={loading || refreshing || !isAdminReady}
                                >
                                    <Check className="mr-2 h-4 w-4" />
                                    Apply
                                </Button>

                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => {
                                        if (!isAdminReady) return
                                        setQ("")
                                        setEntity("all")
                                        setAction("all")
                                        setActor("all")
                                        setRange(undefined)
                                        setTab("all")
                                        skipAutoLoadRef.current = true
                                        setOffset(0)
                                        load({ overrideOffset: 0 })
                                    }}
                                    disabled={loading || refreshing || !isAdminReady}
                                >
                                    Clear
                                </Button>
                            </div>
                        </div>

                        <Separator />

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-sm text-muted-foreground">
                                {loading ? (
                                    <span>Loading…</span>
                                ) : (
                                    <span>
                                        Showing <span className="font-medium text-foreground">{showingFrom}</span>–
                                        <span className="font-medium text-foreground">{showingTo}</span>
                                        {total != null ? (
                                            <>
                                                {" "}
                                                of <span className="font-medium text-foreground">{total}</span>
                                            </>
                                        ) : null}
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setOffset((o) => Math.max(0, o - limit))}
                                    disabled={loading || !canPrev}
                                >
                                    Prev
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setOffset((o) => o + limit)}
                                    disabled={loading || !canNext}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>

                        <div className="rounded-md border">
                            {loading ? (
                                <div className="space-y-3 p-4">
                                    <Skeleton className="h-6 w-1/2" />
                                    <Skeleton className="h-6 w-2/3" />
                                    <Skeleton className="h-6 w-3/4" />
                                    <Skeleton className="h-6 w-2/5" />
                                </div>
                            ) : filtered.length ? (
                                <div className="w-full overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-56">Time</TableHead>
                                                <TableHead className="w-64">Actor</TableHead>
                                                <TableHead className="w-40">Action</TableHead>
                                                <TableHead className="w-40">Entity</TableHead>
                                                <TableHead>Entity ID</TableHead>
                                                <TableHead className="w-20 text-right">More</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filtered.map((l) => (
                                                <TableRow key={l.id}>
                                                    <TableCell className="align-top">
                                                        <div className="text-sm font-medium">{fmtDate(l.timestamp)}</div>
                                                        <div className="max-w-56 truncate text-xs text-muted-foreground">
                                                            {l.id}
                                                        </div>
                                                    </TableCell>

                                                    <TableCell className="align-top">
                                                        <div className="text-sm font-medium">{l.actorName || "—"}</div>
                                                        <div className="max-w-64 truncate text-xs text-muted-foreground">
                                                            {l.actorEmail || l.actorId || ""}
                                                        </div>
                                                    </TableCell>

                                                    <TableCell className="align-top">
                                                        {l.action ? (
                                                            <Badge variant="secondary" className="whitespace-nowrap">
                                                                {l.action}
                                                            </Badge>
                                                        ) : (
                                                            "—"
                                                        )}
                                                    </TableCell>

                                                    <TableCell className="align-top">
                                                        {l.entity ? (
                                                            <Badge variant="outline" className="whitespace-nowrap">
                                                                {l.entity}
                                                            </Badge>
                                                        ) : (
                                                            "—"
                                                        )}
                                                    </TableCell>

                                                    <TableCell className="align-top">
                                                        <div className="max-w-64 truncate text-sm">{l.entityId || "—"}</div>
                                                    </TableCell>

                                                    <TableCell className="align-top text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8"
                                                                >
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                    <span className="sr-only">Open menu</span>
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-48">
                                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem onClick={() => openDetails(l)}>
                                                                    View details
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => copyJson(l)}>
                                                                    <Copy className="mr-2 h-4 w-4" />
                                                                    Copy row JSON
                                                                </DropdownMenuItem>
                                                                {l.details != null ? (
                                                                    <DropdownMenuItem onClick={() => copyJson(l.details)}>
                                                                        <Copy className="mr-2 h-4 w-4" />
                                                                        Copy details JSON
                                                                    </DropdownMenuItem>
                                                                ) : null}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                <div className="p-8 text-center">
                                    <div className="text-sm font-medium">No audit logs found</div>
                                    <div className="mt-1 text-sm text-muted-foreground">
                                        Try changing filters, widening the date range, or refreshing.
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
                    <DialogContent className="max-w-3xl">
                        <DialogHeader>
                            <DialogTitle>Audit log details</DialogTitle>
                            <DialogDescription>
                                Review the complete record and metadata for auditing.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                                <div className="text-sm">
                                    <span className="text-muted-foreground">Time: </span>
                                    <span className="font-medium">{fmtDate(selected?.timestamp ?? null)}</span>
                                </div>
                                <div className="text-sm">
                                    <span className="text-muted-foreground">Actor: </span>
                                    <span className="font-medium">{selected?.actorName || "—"}</span>
                                </div>
                                <div className="text-sm">
                                    <span className="text-muted-foreground">Action: </span>
                                    <span className="font-medium">{selected?.action || "—"}</span>
                                </div>
                                <div className="text-sm">
                                    <span className="text-muted-foreground">Entity: </span>
                                    <span className="font-medium">{selected?.entity || "—"}</span>
                                </div>
                                <div className="text-sm">
                                    <span className="text-muted-foreground">Entity ID: </span>
                                    <span className="font-medium">{selected?.entityId || "—"}</span>
                                </div>
                                <div className="text-sm">
                                    <span className="text-muted-foreground">Row ID: </span>
                                    <span className="font-medium">{selected?.id || "—"}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm">Pretty JSON</Label>
                                    <div className="flex items-center gap-2">
                                        <Switch checked={prettyJson} onCheckedChange={setPrettyJson} />
                                    </div>
                                </div>

                                <ScrollArea className="h-56 rounded-md border p-3">
                                    <pre className="whitespace-pre-wrap wrap-break-word text-xs">
                                        {selected
                                            ? prettyJson
                                                ? JSON.stringify(selected, null, 2)
                                                : JSON.stringify(selected)
                                            : "—"}
                                    </pre>
                                </ScrollArea>
                            </div>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                            <Label>Details</Label>
                            <Textarea
                                readOnly
                                value={
                                    selected?.details != null
                                        ? prettyJson
                                            ? JSON.stringify(selected.details, null, 2)
                                            : JSON.stringify(selected.details)
                                        : ""
                                }
                                placeholder="No details"
                                className="min-h-48 font-mono text-xs"
                            />
                        </div>

                        <DialogFooter className="gap-2">
                            <Button
                                variant="outline"
                                onClick={() => (selected ? copyJson(selected) : null)}
                                disabled={!selected}
                            >
                                <Copy className="mr-2 h-4 w-4" />
                                Copy row
                            </Button>
                            <Button
                                onClick={() => (selected ? copyJson(selected.details ?? {}) : null)}
                                disabled={!selected}
                            >
                                <Copy className="mr-2 h-4 w-4" />
                                Copy details
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </DashboardLayout>
    )
}
