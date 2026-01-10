/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Lock, RefreshCw, ShieldCheck, Unlock, Users } from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type ApiOk<T> = { ok: true } & T
type ApiErr = { ok: false; error?: string; message?: string }

type Person = { id: string; name: string | null; email: string }

type DetailPayload = {
    evaluation: {
        id: string
        status: string
        submittedAt: string | null
        lockedAt: string | null
        createdAt: string | null
    }
    schedule: {
        id: string
        scheduledAt: string
        room: string | null
        status: string | null
    }
    group: {
        id: string
        title: string
        program: string | null
        term: string | null
        adviser: Person | null
        students: Person[]
    }
    evaluator: Person
    panelists: Person[]
    rubric: {
        id: string
        name: string
        version: number
        active: boolean
        description: string | null
        createdAt: string
        updatedAt: string
    } | null
    criteria: Array<{
        criterionId: string
        criterion: string
        description: string | null
        weight: string
        minScore: number
        maxScore: number
        score: number | null
        comment: string | null
    }>
}

function safeText(v: any, fallback = "") {
    const s = String(v ?? "").trim()
    return s ? s : fallback
}

function toNumber(v: any, fallback = 0) {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
}

function fmtDateTime(iso?: string | null) {
    const s = safeText(iso, "")
    if (!s) return ""
    const dt = new Date(s)
    if (Number.isNaN(dt.getTime())) return s
    return dt.toLocaleString()
}

function fmtDate(iso?: string | null) {
    const s = safeText(iso, "")
    if (!s) return ""
    const dt = new Date(s)
    if (Number.isNaN(dt.getTime())) return s
    return dt.toLocaleDateString()
}

function fmtTime(iso?: string | null) {
    const s = safeText(iso, "")
    if (!s) return ""
    const dt = new Date(s)
    if (Number.isNaN(dt.getTime())) return s
    return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function statusBadge(status?: string | null) {
    const s = safeText(status, "").toLowerCase()
    if (!s) return <Badge variant="secondary">Unknown</Badge>
    if (s === "submitted" || s === "done" || s === "completed") return <Badge>Submitted</Badge>
    if (s === "pending" || s === "draft") return <Badge variant="secondary">Pending</Badge>
    if (s === "locked") return <Badge variant="outline">Locked</Badge>
    return <Badge variant="secondary">{safeText(status, "Unknown")}</Badge>
}

async function apiJson<T>(method: string, url: string, body?: any): Promise<ApiOk<T> | ApiErr> {
    const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await res.json().catch(() => ({}))) as any
    if (!res.ok) return { ok: false, error: data?.error ?? data?.message ?? `HTTP ${res.status}` }
    return data
}

function personLabel(p: Person | null | undefined) {
    if (!p) return "—"
    const n = safeText(p.name, "")
    const e = safeText(p.email, "")
    if (n && e) return `${n} (${e})`
    return n || e || "—"
}

export default function AdminEvaluationDetailPage() {
    const router = useRouter()
    const params = useParams<{ id: string }>()
    const id = safeText(params?.id, "")

    const { user, loading: authLoading } = useAuth()

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)

    const [detail, setDetail] = React.useState<DetailPayload | null>(null)

    // confirm dialog
    const [confirmOpen, setConfirmOpen] = React.useState(false)
    const [confirmTitle, setConfirmTitle] = React.useState("")
    const [confirmDesc, setConfirmDesc] = React.useState("")
    const confirmActionRef = React.useRef<null | (() => Promise<void>)>(null)

    function openConfirm(title: string, desc: string, action: () => Promise<void>) {
        confirmActionRef.current = action
        setConfirmTitle(title)
        setConfirmDesc(desc)
        setConfirmOpen(true)
    }

    async function loadOne() {
        if (!id) return
        setLoading(true)
        try {
            // NOTE: this expects /api/admin/evaluations/detail to exist (added in this update)
            const res = await apiJson<{ detail: DetailPayload }>(
                "GET",
                `/api/admin/evaluations/detail?id=${encodeURIComponent(id)}`
            )
            if (!res.ok) throw new Error(res.error ?? "Failed to load evaluation detail")

            const d = (res as any).detail as DetailPayload
            setDetail(d)
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to load evaluation")
            setDetail(null)
        } finally {
            setLoading(false)
        }
    }

    async function refresh() {
        setRefreshing(true)
        try {
            await loadOne()
        } finally {
            setRefreshing(false)
        }
    }

    React.useEffect(() => {
        if (authLoading) return
        if (!user) return
        if (String(user.role ?? "").toLowerCase() !== "admin") {
            toast.error("Unauthorized")
            router.push("/dashboard")
            return
        }
        loadOne()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, user?.id, id])

    const isLocked = safeText(detail?.evaluation?.status, "").toLowerCase() === "locked"

    const scoreSummary = React.useMemo(() => {
        const rows = detail?.criteria ?? []
        let scoredCount = 0
        let totalWeight = 0
        let weightedSum = 0

        for (const r of rows) {
            const w = toNumber(r.weight, 1)
            const sc = typeof r.score === "number" ? r.score : toNumber(r.score, NaN)
            if (Number.isFinite(sc)) {
                scoredCount += 1
                totalWeight += w
                weightedSum += sc * w
            }
        }

        const avg = totalWeight > 0 ? weightedSum / totalWeight : 0
        return { rows: rows.length, scoredCount, weightedAverage: avg }
    }, [detail?.criteria])

    async function setLock(lock: boolean) {
        if (!detail?.evaluation?.id) return

        const desiredLockedAt = lock ? new Date().toISOString() : null
        const desiredStatus = lock ? "locked" : detail.evaluation.submittedAt ? "submitted" : "pending"

        const res = await apiJson(
            "PATCH",
            `/api/evaluation?resource=evaluations&id=${encodeURIComponent(detail.evaluation.id)}`,
            { status: desiredStatus, lockedAt: desiredLockedAt }
        )
        if (!res.ok) throw new Error(res.error ?? "Failed to update evaluation")

        toast.success(lock ? "Evaluation locked" : "Evaluation unlocked")
        await loadOne()
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="icon" onClick={() => router.push("/dashboard/admin/evaluation")}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>

                        <div>
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5" />
                                <h1 className="text-xl font-semibold">Evaluation detail</h1>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Schedule, group, evaluator, rubric, and scores (admin view).
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={refresh} disabled={loading || refreshing}>
                            {refreshing ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCw className="mr-2 h-4 w-4" />
                            )}
                            Refresh
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-28 w-full" />
                        <Skeleton className="h-64 w-full" />
                    </div>
                ) : !detail ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Not found</CardTitle>
                            <CardDescription>This evaluation record could not be loaded.</CardDescription>
                        </CardHeader>
                    </Card>
                ) : (
                    <>
                        {/* Summary */}
                        <Card>
                            <CardHeader className="space-y-2">
                                <CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <span>Overview</span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {statusBadge(detail.evaluation.status)}
                                        {isLocked ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() =>
                                                    openConfirm(
                                                        "Unlock evaluation?",
                                                        "This will remove the lock so it can be edited again.",
                                                        async () => setLock(false)
                                                    )
                                                }
                                            >
                                                <Unlock className="mr-2 h-4 w-4" />
                                                Unlock
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() =>
                                                    openConfirm(
                                                        "Lock evaluation?",
                                                        "This will lock the evaluation to prevent further changes.",
                                                        async () => setLock(true)
                                                    )
                                                }
                                            >
                                                <Lock className="mr-2 h-4 w-4" />
                                                Lock
                                            </Button>
                                        )}
                                    </div>
                                </CardTitle>

                                <CardDescription className="space-y-1">
                                    <div className="text-xs text-muted-foreground">
                                        Submitted: {fmtDateTime(detail.evaluation.submittedAt) || "—"}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Locked: {fmtDateTime(detail.evaluation.lockedAt) || "—"}
                                    </div>
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div className="rounded-md border p-3">
                                        <div className="text-xs text-muted-foreground">Schedule</div>
                                        <div className="mt-1 font-medium">{safeText(detail.group.title, "—")}</div>
                                        <div className="mt-1 text-sm text-muted-foreground">
                                            {fmtDate(detail.schedule.scheduledAt)} {fmtTime(detail.schedule.scheduledAt)}
                                            {detail.schedule.room ? <> · Room {detail.schedule.room}</> : null}
                                        </div>
                                        {(detail.group.program || detail.group.term) ? (
                                            <div className="mt-1 text-sm text-muted-foreground">
                                                {[safeText(detail.group.program, ""), safeText(detail.group.term, "")]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </div>
                                        ) : null}
                                        <div className="mt-2">{statusBadge(detail.schedule.status)}</div>
                                    </div>

                                    <div className="rounded-md border p-3">
                                        <div className="text-xs text-muted-foreground">Evaluator</div>
                                        <div className="mt-1 font-medium">{personLabel(detail.evaluator)}</div>
                                        <div className="mt-3 text-xs text-muted-foreground">Adviser</div>
                                        <div className="mt-1 text-sm">{personLabel(detail.group.adviser)}</div>
                                    </div>
                                </div>

                                {detail.rubric ? (
                                    <div className="rounded-md border p-3">
                                        <div className="text-xs text-muted-foreground">Rubric</div>
                                        <div className="mt-1 font-medium">
                                            {detail.rubric.name} (v{detail.rubric.version}){" "}
                                            {detail.rubric.active ? "" : "(inactive)"}
                                        </div>
                                        {detail.rubric.description ? (
                                            <div className="mt-1 text-sm text-muted-foreground">{detail.rubric.description}</div>
                                        ) : null}
                                    </div>
                                ) : (
                                    <div className="rounded-md border p-3 text-sm text-muted-foreground">
                                        No rubric template found (no active template and no scored criterion template).
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2">
                                    <Button asChild variant="outline" size="sm">
                                        <Link href="/dashboard/admin/evaluation">Back to list</Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* People */}
                        <Card>
                            <CardHeader className="space-y-1">
                                <CardTitle className="flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    People
                                </CardTitle>
                                <CardDescription>Students in the group and panelists assigned to the schedule.</CardDescription>
                            </CardHeader>

                            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="rounded-md border p-3">
                                    <div className="text-sm font-semibold">Students ({detail.group.students?.length ?? 0})</div>
                                    <Separator className="my-2" />
                                    {detail.group.students?.length ? (
                                        <div className="space-y-2">
                                            {detail.group.students.map((s) => (
                                                <div key={s.id} className="text-sm">
                                                    {personLabel(s)}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-muted-foreground">No students found for this group.</div>
                                    )}
                                </div>

                                <div className="rounded-md border p-3">
                                    <div className="text-sm font-semibold">Panelists ({detail.panelists?.length ?? 0})</div>
                                    <Separator className="my-2" />
                                    {detail.panelists?.length ? (
                                        <div className="space-y-2">
                                            {detail.panelists.map((p) => {
                                                const isEvaluator = p.id === detail.evaluator.id
                                                return (
                                                    <div key={p.id} className="text-sm">
                                                        <div className="flex items-center gap-2">
                                                            <span>{personLabel(p)}</span>
                                                            {isEvaluator ? <Badge variant="secondary">Evaluator</Badge> : null}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-muted-foreground">No panelists found for this schedule.</div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Scores */}
                        <Card>
                            <CardHeader className="space-y-1">
                                <CardTitle>Scores & comments</CardTitle>
                                <CardDescription>
                                    Rows: {scoreSummary.rows} • Scored: {scoreSummary.scoredCount}
                                    {scoreSummary.scoredCount > 0 ? (
                                        <> • Weighted avg: {scoreSummary.weightedAverage.toFixed(2)}</>
                                    ) : null}
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                {Array.isArray(detail.criteria) && detail.criteria.length > 0 ? (
                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-80">Criterion</TableHead>
                                                    <TableHead className="w-24">Weight</TableHead>
                                                    <TableHead className="w-28">Min–Max</TableHead>
                                                    <TableHead className="w-24">Score</TableHead>
                                                    <TableHead>Comment</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {detail.criteria.map((r) => {
                                                    const w = toNumber(r.weight, 1)
                                                    const sc = typeof r.score === "number" ? r.score : null
                                                    return (
                                                        <TableRow key={r.criterionId}>
                                                            <TableCell className="align-top">
                                                                <div className="space-y-1">
                                                                    <div className="font-medium">{safeText(r.criterion, "—")}</div>
                                                                    {r.description ? (
                                                                        <div className="text-xs text-muted-foreground">
                                                                            {safeText(r.description, "")}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="align-top">{Number.isFinite(w) ? w : "—"}</TableCell>
                                                            <TableCell className="align-top">
                                                                {toNumber(r.minScore, 0)}–{toNumber(r.maxScore, 0)}
                                                            </TableCell>
                                                            <TableCell className="align-top">{sc ?? "—"}</TableCell>
                                                            <TableCell className="align-top">
                                                                <div className="whitespace-pre-wrap text-sm">{safeText(r.comment, "—")}</div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>
                                ) : (
                                    <div className="rounded-md border p-6 text-sm text-muted-foreground">
                                        No rubric criteria returned. (No active template and no scored template found.)
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}

                {/* Confirm dialog */}
                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
                            <AlertDialogDescription>{confirmDesc}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={async () => {
                                    try {
                                        const fn = confirmActionRef.current
                                        confirmActionRef.current = null
                                        if (fn) await fn()
                                    } catch (e: any) {
                                        toast.error(e?.message ?? "Action failed")
                                    }
                                }}
                            >
                                Continue
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </DashboardLayout>
    )
}
