/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { RefreshCw, Search, Eye } from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"

type ApiOk<T> = { ok: true } & T

type EvaluationStatus = "pending" | "submitted" | "locked"
type StatusFilter = "all" | EvaluationStatus
type ScopeFilter = "mine" | "all" // for Admin viewing inside staff area

type DbEvaluation = {
    id: string
    scheduleId: string
    evaluatorId: string
    status: string
    submittedAt: string | null
    lockedAt: string | null
    createdAt: string
}

type DbDefenseSchedule = {
    id: string
    groupId: string
    scheduledAt: string
    room: string | null
    status: string
    createdBy: string | null
    createdAt: string
    updatedAt: string
}

type DbThesisGroup = {
    id: string
    title: string
    adviserId: string | null
    program: string | null
    term: string | null
    createdAt: string
    updatedAt: string
}

type Row = {
    evaluationId: string
    status: string
    submittedAt: string | null
    lockedAt: string | null

    scheduleId: string
    scheduledAt: string | null
    room: string | null

    groupId: string | null
    groupTitle: string | null
    program: string | null
    term: string | null
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
        },
    })

    const text = await res.text()
    let data: any = null
    try {
        data = text ? JSON.parse(text) : null
    } catch {
        data = null
    }

    if (!res.ok) {
        const msg = data?.message || `Request failed (${res.status})`
        throw new Error(msg)
    }

    if (data && data.ok === false) {
        throw new Error(data?.message || "Request failed")
    }

    return data as T
}

function formatDateTime(iso: string | null) {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(d)
}

function StatusBadge({ status }: { status: string }) {
    const s = String(status || "").toLowerCase()
    if (s === "locked" || s === "finalized") return <Badge>Locked</Badge>
    if (s === "submitted") return <Badge variant="secondary">Submitted</Badge>
    return <Badge variant="outline">Pending</Badge>
}

export default function StaffEvaluationsPage() {
    const { user, isLoading } = useAuth() as any

    const role = String(user?.role ?? "").toLowerCase()
    const isStaff = role === "staff"
    const isAdmin = role === "admin"
    const canView = isStaff || isAdmin
    const actorId = String(user?.id ?? "")

    const [loading, setLoading] = React.useState(false)
    const [rows, setRows] = React.useState<Row[]>([])
    const [q, setQ] = React.useState("")
    const [status, setStatus] = React.useState<StatusFilter>("all")

    // If an admin is viewing the staff area, optionally allow "Mine" view
    const [scope, setScope] = React.useState<ScopeFilter>("mine")
    const scopeInitRef = React.useRef(false)

    React.useEffect(() => {
        if (!canView) return
        if (scopeInitRef.current) return
        // default: staff -> mine, admin -> all (since admin has full visibility anyway)
        setScope(isAdmin ? "all" : "mine")
        scopeInitRef.current = true
    }, [canView, isAdmin])

    const load = React.useCallback(async () => {
        if (!actorId) return
        setLoading(true)
        try {
            const sp = new URLSearchParams()
            sp.set("resource", "evaluations")
            sp.set("limit", "200")
            sp.set("offset", "0")
            if (status !== "all") sp.set("status", status)

            // Staff should only see their assignments
            if (isStaff) sp.set("evaluatorId", actorId)

            // Admin can see all, but can also choose "mine"
            if (isAdmin && scope === "mine") sp.set("evaluatorId", actorId)

            const evUrl = `/api/evaluation?${sp.toString()}`
            const evRes = await fetchJson<ApiOk<{ evaluations: DbEvaluation[] }>>(evUrl)

            const raw = Array.isArray(evRes.evaluations) ? evRes.evaluations : []

            // Safety-net client filter (in case backend params are ignored/misconfigured)
            const evaluations =
                isStaff || (isAdmin && scope === "mine") ? raw.filter((e) => String(e.evaluatorId) === actorId) : raw

            // Fetch schedules for each evaluation
            const scheduleMap = new Map<string, DbDefenseSchedule | null>()
            await Promise.all(
                evaluations.map(async (e) => {
                    if (!e?.scheduleId) return
                    if (scheduleMap.has(e.scheduleId)) return
                    try {
                        const sch = await fetchJson<ApiOk<{ schedule: DbDefenseSchedule }>>(
                            `/api/schedule?resource=schedules&id=${encodeURIComponent(e.scheduleId)}`
                        )
                        scheduleMap.set(e.scheduleId, sch.schedule ?? null)
                    } catch {
                        scheduleMap.set(e.scheduleId, null)
                    }
                })
            )

            // Fetch groups (unique)
            const groupIds = new Set<string>()
            for (const sch of scheduleMap.values()) {
                if (sch?.groupId) groupIds.add(sch.groupId)
            }

            const groupMap = new Map<string, DbThesisGroup | null>()
            await Promise.all(
                Array.from(groupIds).map(async (gid) => {
                    try {
                        const gr = await fetchJson<ApiOk<{ group: DbThesisGroup }>>(
                            `/api/thesis?resource=groups&id=${encodeURIComponent(gid)}`
                        )
                        groupMap.set(gid, gr.group ?? null)
                    } catch {
                        groupMap.set(gid, null)
                    }
                })
            )

            const out: Row[] = evaluations.map((e) => {
                const sch = scheduleMap.get(e.scheduleId) ?? null
                const grp = sch?.groupId ? groupMap.get(sch.groupId) ?? null : null

                return {
                    evaluationId: e.id,
                    status: e.status,
                    submittedAt: e.submittedAt,
                    lockedAt: e.lockedAt,

                    scheduleId: e.scheduleId,
                    scheduledAt: sch?.scheduledAt ?? null,
                    room: sch?.room ?? null,

                    groupId: sch?.groupId ?? null,
                    groupTitle: grp?.title ?? null,
                    program: grp?.program ?? null,
                    term: grp?.term ?? null,
                }
            })

            setRows(out)
        } catch (err: any) {
            toast.error("Failed to load evaluations", { description: err?.message ?? "Please try again." })
        } finally {
            setLoading(false)
        }
    }, [actorId, status, isStaff, isAdmin, scope])

    React.useEffect(() => {
        if (isLoading) return
        if (!canView) return
        load()
    }, [isLoading, canView, load])

    const filtered = React.useMemo(() => {
        const s = q.trim().toLowerCase()
        if (!s) return rows
        return rows.filter((r) => {
            const a = String(r.groupTitle ?? "").toLowerCase()
            const b = String(r.program ?? "").toLowerCase()
            const c = String(r.term ?? "").toLowerCase()
            const d = String(r.room ?? "").toLowerCase()
            return a.includes(s) || b.includes(s) || c.includes(s) || d.includes(s)
        })
    }, [rows, q])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold">Evaluations</h1>
                        <p className="text-sm text-muted-foreground">View your assigned evaluation history and continue scoring.</p>
                    </div>

                    <Button onClick={load} disabled={loading || isLoading || !canView}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                    </Button>
                </div>

                {!canView ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Forbidden</CardTitle>
                            <CardDescription>This page is for Staff/Admin only.</CardDescription>
                        </CardHeader>
                    </Card>
                ) : (
                    <Card>
                        <CardHeader className="space-y-4">
                            <div>
                                <CardTitle>My Evaluation Records</CardTitle>
                                <CardDescription>Search by group title/program/term/room and filter status.</CardDescription>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="relative w-full sm:max-w-md">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        placeholder="Search group, program, term, room..."
                                        className="pl-9"
                                    />
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant={status === "all" ? "default" : "outline"}
                                        onClick={() => setStatus("all")}
                                    >
                                        All
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={status === "pending" ? "default" : "outline"}
                                        onClick={() => setStatus("pending")}
                                    >
                                        Pending
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={status === "submitted" ? "default" : "outline"}
                                        onClick={() => setStatus("submitted")}
                                    >
                                        Submitted
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={status === "locked" ? "default" : "outline"}
                                        onClick={() => setStatus("locked")}
                                    >
                                        Locked
                                    </Button>
                                </div>
                            </div>

                            {isAdmin ? (
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-xs text-muted-foreground">
                                        Admin view: choose whether to see all evaluators or only your own records.
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            variant={scope === "all" ? "default" : "outline"}
                                            onClick={() => setScope("all")}
                                        >
                                            All evaluators
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={scope === "mine" ? "default" : "outline"}
                                            onClick={() => setScope("mine")}
                                        >
                                            Only me
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </CardHeader>

                        <CardContent>
                            {loading ? (
                                <div className="space-y-3">
                                    <Skeleton className="h-10 w-full" />
                                    <Skeleton className="h-10 w-full" />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="text-sm text-muted-foreground">No evaluations found.</div>
                            ) : (
                                <div className="w-full overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left">
                                                <th className="py-3 pr-4 font-medium">Group</th>
                                                <th className="py-3 pr-4 font-medium">Schedule</th>
                                                <th className="py-3 pr-4 font-medium">Room</th>
                                                <th className="py-3 pr-4 font-medium">Status</th>
                                                <th className="py-3 pr-4 font-medium">Submitted</th>
                                                <th className="py-3 pr-4 font-medium">Locked</th>
                                                <th className="py-3 pr-2 font-medium"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filtered.map((r) => (
                                                <tr key={r.evaluationId} className="border-b">
                                                    <td className="py-3 pr-4">
                                                        <div className="font-medium">{r.groupTitle ?? "—"}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {[r.program, r.term].filter(Boolean).join(" • ") || "—"}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 pr-4">{formatDateTime(r.scheduledAt)}</td>
                                                    <td className="py-3 pr-4">{r.room ?? "—"}</td>
                                                    <td className="py-3 pr-4">
                                                        <StatusBadge status={r.status} />
                                                    </td>
                                                    <td className="py-3 pr-4">{formatDateTime(r.submittedAt)}</td>
                                                    <td className="py-3 pr-4">{formatDateTime(r.lockedAt)}</td>
                                                    <td className="py-3 pr-2 text-right">
                                                        <Link href={`/dashboard/staff/evaluations/${r.evaluationId}`}>
                                                            <Button variant="outline" size="sm">
                                                                <Eye className="mr-2 h-4 w-4" />
                                                                Open
                                                            </Button>
                                                        </Link>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </DashboardLayout>
    )
}
