/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
    CheckCircle2,
    ClipboardCopy,
    Eye,
    Filter,
    Loader2,
    MoreHorizontal,
    RefreshCw,
    Search,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type EvaluationRow = {
    id: string
    schedule_id: string
    evaluator_id: string
    status: string
    submitted_at: string | null
    locked_at: string | null
    created_at: string
}

function safeStr(v: any) {
    return typeof v === "string" ? v : v == null ? "" : String(v)
}

function shortId(id: string) {
    const s = safeStr(id)
    if (s.length <= 12) return s
    return `${s.slice(0, 6)}…${s.slice(-4)}`
}

function formatTs(v: string | null | undefined) {
    if (!v) return "—"
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return v
    return d.toLocaleString()
}

function badgeVariantFromStatus(status: string): "default" | "secondary" | "outline" | "destructive" {
    const s = safeStr(status).toLowerCase()
    if (s === "submitted") return "default"
    if (s === "locked") return "destructive"
    if (s === "pending" || s === "draft") return "secondary"
    return "outline"
}

async function fetchJson(url: string, init?: RequestInit) {
    const res = await fetch(url, init)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
        const msg = data?.error || data?.message || `Request failed (${res.status})`
        throw new Error(msg)
    }
    return data
}

export default function StaffEvaluationsPage() {
    const router = useRouter()
    const sp = useSearchParams()
    const { me, loading: authLoading } = useAuth() as any

    const [tab, setTab] = React.useState<"schedule" | "assignment" | "evaluation">("schedule")

    const [scheduleId, setScheduleId] = React.useState<string>(safeStr(sp.get("scheduleId") || sp.get("schedule_id") || ""))
    const [assignmentId, setAssignmentId] = React.useState<string>(safeStr(sp.get("assignmentId") || sp.get("assignment_id") || ""))
    const [evaluationId, setEvaluationId] = React.useState<string>(safeStr(sp.get("id") || sp.get("evaluationId") || sp.get("evaluation_id") || ""))

    const [rows, setRows] = React.useState<EvaluationRow[]>([])
    const [busy, setBusy] = React.useState(false)
    const [query, setQuery] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<string>("all")

    const [previewOpen, setPreviewOpen] = React.useState(false)
    const [previewRow, setPreviewRow] = React.useState<EvaluationRow | null>(null)

    const canUse = React.useMemo(() => {
        if (!me) return false
        const r = safeStr(me.role).toLowerCase()
        return r === "staff" || r === "admin"
    }, [me])

    const activeParam = React.useMemo(() => {
        if (tab === "schedule") return { key: "scheduleId", value: scheduleId.trim() }
        if (tab === "assignment") return { key: "assignmentId", value: assignmentId.trim() }
        return { key: "id", value: evaluationId.trim() }
    }, [tab, scheduleId, assignmentId, evaluationId])

    const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase()
        return (rows ?? [])
            .filter((r) => {
                if (statusFilter !== "all") {
                    if (safeStr(r.status).toLowerCase() !== safeStr(statusFilter).toLowerCase()) return false
                }
                if (!q) return true
                const hay = [
                    r.id,
                    r.schedule_id,
                    r.evaluator_id,
                    r.status,
                    r.created_at,
                    r.submitted_at ?? "",
                    r.locked_at ?? "",
                ]
                    .map((x) => safeStr(x).toLowerCase())
                    .join(" ")
                return hay.includes(q)
            })
            .sort((a, b) => (safeStr(b.created_at) > safeStr(a.created_at) ? 1 : -1))
    }, [rows, query, statusFilter])

    async function load() {
        const v = activeParam.value
        if (!v) {
            toast.error(`Please provide ${activeParam.key}.`)
            return
        }

        setBusy(true)
        const t = toast.loading("Loading evaluations...")
        try {
            const url = `/api/staff/evaluations?${encodeURIComponent(activeParam.key)}=${encodeURIComponent(v)}`
            const data = await fetchJson(url)

            // API behavior:
            // - scheduleId -> array
            // - assignmentId -> single row or null/undefined
            // - id -> single row or null/undefined
            if (Array.isArray(data)) {
                setRows(data as EvaluationRow[])
            } else if (data && typeof data === "object" && data.id) {
                setRows([data as EvaluationRow])
            } else {
                setRows([])
            }

            toast.success("Loaded.", { id: t })
        } catch (e: any) {
            setRows([])
            toast.error(e?.message || "Failed to load evaluations.", { id: t })
        } finally {
            setBusy(false)
        }
    }

    React.useEffect(() => {
        // Auto-load if query param exists.
        const shouldAuto =
            (tab === "schedule" && scheduleId.trim()) ||
            (tab === "assignment" && assignmentId.trim()) ||
            (tab === "evaluation" && evaluationId.trim())

        if (shouldAuto) load()
         
    }, [])

    function openPreview(r: EvaluationRow) {
        setPreviewRow(r)
        setPreviewOpen(true)
    }

    async function copyText(text: string, label = "Copied") {
        try {
            await navigator.clipboard.writeText(text)
            toast.success(label)
        } catch {
            toast.error("Failed to copy.")
        }
    }

    function exportCsv() {
        const items = filtered ?? []
        if (!items.length) {
            toast.error("Nothing to export.")
            return
        }

        const header = ["id", "schedule_id", "evaluator_id", "status", "submitted_at", "locked_at", "created_at"]
        const lines = [header.join(",")]

        for (const r of items) {
            const row = [
                r.id,
                r.schedule_id,
                r.evaluator_id,
                r.status,
                r.submitted_at ?? "",
                r.locked_at ?? "",
                r.created_at ?? "",
            ].map((x) => `"${safeStr(x).replaceAll(`"`, `""`)}"`)
            lines.push(row.join(","))
        }

        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
        const a = document.createElement("a")
        a.href = URL.createObjectURL(blob)
        a.download = `evaluations_${tab}_${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(a.href)
        toast.success("CSV exported.")
    }

    const statusStats = React.useMemo(() => {
        const map = new Map<string, number>()
        for (const r of filtered) {
            const s = safeStr(r.status || "unknown").toLowerCase()
            map.set(s, (map.get(s) ?? 0) + 1)
        }
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
    }, [filtered])

    return (
        <DashboardLayout title="Evaluations" description="View and manage evaluations by schedule, assignment, or evaluation ID.">
            <div className="space-y-6">
                {authLoading ? (
                    <Card>
                        <CardHeader>
                            <Skeleton className="h-6 w-44" />
                            <Skeleton className="h-4 w-80" />
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-56 w-full" />
                        </CardContent>
                    </Card>
                ) : !me ? (
                    <Alert>
                        <AlertTitle>Not signed in</AlertTitle>
                        <AlertDescription>
                            Please sign in to access staff evaluations.{" "}
                            <Link className="underline" href="/auth/login">
                                Go to login
                            </Link>
                            .
                        </AlertDescription>
                    </Alert>
                ) : !canUse ? (
                    <Alert variant="destructive">
                        <AlertTitle>Access denied</AlertTitle>
                        <AlertDescription>Your account does not have permission to view this page.</AlertDescription>
                    </Alert>
                ) : (
                    <>
                        <Card>
                            <CardHeader className="gap-2">
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <CardTitle className="flex items-center gap-2">
                                            <Filter className="h-5 w-5" />
                                            Lookup
                                        </CardTitle>
                                        <CardDescription>Choose a lookup type and load evaluations from the API.</CardDescription>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button variant="secondary" onClick={load} disabled={busy}>
                                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                            Load
                                        </Button>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="outline">
                                                    <MoreHorizontal className="mr-2 h-4 w-4" />
                                                    Actions
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-52">
                                                <DropdownMenuLabel>Utilities</DropdownMenuLabel>
                                                <DropdownMenuItem onClick={exportCsv}>Export CSV</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => router.refresh()}>Refresh page</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
                                    <TabsList className="grid w-full grid-cols-3">
                                        <TabsTrigger value="schedule">By Schedule</TabsTrigger>
                                        <TabsTrigger value="assignment">By Assignment</TabsTrigger>
                                        <TabsTrigger value="evaluation">By Evaluation</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="schedule" className="mt-4 space-y-3">
                                        <div className="grid gap-2 md:grid-cols-[180px_1fr] md:items-center">
                                            <Label htmlFor="scheduleId">Schedule ID</Label>
                                            <Input
                                                id="scheduleId"
                                                value={scheduleId}
                                                onChange={(e) => setScheduleId(e.target.value)}
                                                placeholder="e.g., 9b7c... (schedule_id)"
                                            />
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="assignment" className="mt-4 space-y-3">
                                        <div className="grid gap-2 md:grid-cols-[180px_1fr] md:items-center">
                                            <Label htmlFor="assignmentId">Assignment</Label>
                                            <Input
                                                id="assignmentId"
                                                value={assignmentId}
                                                onChange={(e) => setAssignmentId(e.target.value)}
                                                placeholder="e.g., schedule_id + evaluator_id mapping (assignmentId)"
                                            />
                                        </div>
                                        <Alert>
                                            <AlertTitle>Note</AlertTitle>
                                            <AlertDescription>
                                                The API treats <span className="font-medium">assignmentId</span> as an alias of the evaluation assignment
                                                (often schedule + evaluator). If your backend expects a different shape, update the API mapping.
                                            </AlertDescription>
                                        </Alert>
                                    </TabsContent>

                                    <TabsContent value="evaluation" className="mt-4 space-y-3">
                                        <div className="grid gap-2 md:grid-cols-[180px_1fr] md:items-center">
                                            <Label htmlFor="evaluationId">Evaluation ID</Label>
                                            <Input
                                                id="evaluationId"
                                                value={evaluationId}
                                                onChange={(e) => setEvaluationId(e.target.value)}
                                                placeholder="e.g., 1f2a... (evaluation id)"
                                            />
                                        </div>
                                    </TabsContent>
                                </Tabs>

                                <Separator />

                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div className="relative w-full md:max-w-md">
                                        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search within results..." />
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            variant={statusFilter === "all" ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => setStatusFilter("all")}
                                        >
                                            All
                                        </Button>
                                        <Button
                                            variant={statusFilter === "pending" ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => setStatusFilter("pending")}
                                        >
                                            Pending
                                        </Button>
                                        <Button
                                            variant={statusFilter === "submitted" ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => setStatusFilter("submitted")}
                                        >
                                            Submitted
                                        </Button>
                                        <Button
                                            variant={statusFilter === "locked" ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => setStatusFilter("locked")}
                                        >
                                            Locked
                                        </Button>
                                    </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-3">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Total</CardTitle>
                                            <CardDescription>Rows loaded</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="text-3xl font-semibold">{filtered.length}</div>
                                        </CardContent>
                                    </Card>

                                    <Card className="md:col-span-2">
                                        <CardHeader>
                                            <CardTitle>Status breakdown</CardTitle>
                                            <CardDescription>Counts based on current filters</CardDescription>
                                        </CardHeader>
                                        <CardContent className="flex flex-wrap gap-2">
                                            {statusStats.length ? (
                                                statusStats.map(([s, n]) => (
                                                    <Badge key={s} variant={badgeVariantFromStatus(s)} className="capitalize">
                                                        {s}: {n}
                                                    </Badge>
                                                ))
                                            ) : (
                                                <span className="text-sm text-muted-foreground">—</span>
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Results</CardTitle>
                                <CardDescription>
                                    Click an evaluation to open. Use the menu to preview/copy.
                                </CardDescription>
                            </CardHeader>

                            <CardContent>
                                {!filtered.length ? (
                                    <Alert>
                                        <AlertTitle>No results</AlertTitle>
                                        <AlertDescription>
                                            Provide a lookup value above and click <span className="font-medium">Load</span>.
                                        </AlertDescription>
                                    </Alert>
                                ) : (
                                    <div className="overflow-auto rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-55">Evaluation</TableHead>
                                                    <TableHead className="w-55">Schedule</TableHead>
                                                    <TableHead className="w-55">Evaluator</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead>Submitted</TableHead>
                                                    <TableHead>Locked</TableHead>
                                                    <TableHead>Created</TableHead>
                                                    <TableHead className="w-17.5 text-right"> </TableHead>
                                                </TableRow>
                                            </TableHeader>

                                            <TableBody>
                                                {filtered.map((r) => (
                                                    <TableRow
                                                        key={r.id}
                                                        className="cursor-pointer"
                                                        onClick={() => router.push(`/dashboard/staff/evaluations/${encodeURIComponent(r.id)}`)}
                                                    >
                                                        <TableCell className="font-medium">{shortId(r.id)}</TableCell>
                                                        <TableCell>{shortId(r.schedule_id)}</TableCell>
                                                        <TableCell>{shortId(r.evaluator_id)}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={badgeVariantFromStatus(r.status)} className="capitalize">
                                                                {safeStr(r.status || "unknown")}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>{formatTs(r.submitted_at)}</TableCell>
                                                        <TableCell>{formatTs(r.locked_at)}</TableCell>
                                                        <TableCell>{formatTs(r.created_at)}</TableCell>
                                                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" size="icon" aria-label="Row actions">
                                                                        <MoreHorizontal className="h-4 w-4" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end" className="w-44">
                                                                    <DropdownMenuItem onClick={() => router.push(`/dashboard/staff/evaluations/${encodeURIComponent(r.id)}`)}>
                                                                        <Eye className="mr-2 h-4 w-4" /> Open
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => openPreview(r)}>
                                                                        <Search className="mr-2 h-4 w-4" /> Preview
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem onClick={() => copyText(r.id, "Evaluation ID copied")}>
                                                                        <ClipboardCopy className="mr-2 h-4 w-4" /> Copy ID
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => copyText(r.schedule_id, "Schedule ID copied")}>
                                                                        <ClipboardCopy className="mr-2 h-4 w-4" /> Copy Schedule
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => copyText(r.evaluator_id, "Evaluator ID copied")}>
                                                                        <ClipboardCopy className="mr-2 h-4 w-4" /> Copy Evaluator
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                            <DialogContent className="sm:max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>Evaluation preview</DialogTitle>
                                    <DialogDescription>Quick view of evaluation fields.</DialogDescription>
                                </DialogHeader>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">IDs</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-2 text-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-muted-foreground">Evaluation</span>
                                                <span className="font-mono">{shortId(previewRow?.id || "")}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-muted-foreground">Schedule</span>
                                                <span className="font-mono">{shortId(previewRow?.schedule_id || "")}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-muted-foreground">Evaluator</span>
                                                <span className="font-mono">{shortId(previewRow?.evaluator_id || "")}</span>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Status</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-2 text-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-muted-foreground">Status</span>
                                                <Badge variant={badgeVariantFromStatus(previewRow?.status || "")} className="capitalize">
                                                    {safeStr(previewRow?.status || "unknown")}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-muted-foreground">Submitted</span>
                                                <span>{formatTs(previewRow?.submitted_at ?? null)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-muted-foreground">Locked</span>
                                                <span>{formatTs(previewRow?.locked_at ?? null)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-muted-foreground">Created</span>
                                                <span>{formatTs(previewRow?.created_at ?? null)}</span>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                <DialogFooter className="gap-2 sm:gap-0">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            if (!previewRow) return
                                            copyText(previewRow.id, "Evaluation ID copied")
                                        }}
                                    >
                                        <ClipboardCopy className="mr-2 h-4 w-4" />
                                        Copy ID
                                    </Button>
                                    <Button
                                        onClick={() => {
                                            if (!previewRow) return
                                            router.push(`/dashboard/staff/evaluations/${encodeURIComponent(previewRow.id)}`)
                                        }}
                                    >
                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                        Open
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </>
                )}
            </div>
        </DashboardLayout>
    )
}
