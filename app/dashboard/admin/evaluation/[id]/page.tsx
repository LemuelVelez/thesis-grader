/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Lock, RefreshCw, ShieldCheck, Unlock } from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
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

type EvalScoreRow = {
    criterionId?: string
    criterion?: string
    description?: string | null
    weight?: number | string | null
    minScore?: number | null
    maxScore?: number | null
    score?: number | null
    comment?: string | null
}

type EvalDetail = {
    id: string
    status?: string | null
    submittedAt?: string | null
    lockedAt?: string | null
    createdAt?: string | null

    scheduleId?: string | null
    scheduledAt?: string | null
    room?: string | null
    scheduleStatus?: string | null

    groupId?: string | null
    groupTitle?: string | null
    program?: string | null
    term?: string | null

    evaluatorId?: string | null
    evaluatorName?: string | null
    evaluatorEmail?: string | null
    evaluatorRole?: string | null

    scores?: EvalScoreRow[]
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
    if (s === "archived") return <Badge variant="outline">Archived</Badge>
    if (s === "cancelled" || s === "canceled") return <Badge variant="destructive">Cancelled</Badge>
    return <Badge variant="secondary">{safeText(status, "Unknown")}</Badge>
}

function personLine(name?: string | null, email?: string | null) {
    const n = safeText(name, "")
    const e = safeText(email, "")
    if (n && e) return `${n} (${e})`
    return n || e || "—"
}

function scheduleLine(groupTitle?: string | null, scheduledAt?: string | null, room?: string | null) {
    const left = safeText(groupTitle, "Schedule")
    const when = scheduledAt ? `${fmtDate(scheduledAt)} ${fmtTime(scheduledAt)}`.trim() : ""
    const r = safeText(room, "")
    const where = r ? `Room ${r}` : ""
    return [left, when, where].filter(Boolean).join(" · ")
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

/**
 * Normalize whatever the backend returns into a single EvalDetail + scores[].
 * This is defensive because your evaluationRoutes response shape may vary.
 */
function normalizeEvalDetail(payload: any): { detail: EvalDetail | null; raw: any } {
    const raw = payload

    // candidate root objects
    const candidate =
        raw?.evaluation ??
        raw?.item ??
        raw?.record ??
        raw?.evaluationRecord ??
        (Array.isArray(raw?.evaluations) ? raw.evaluations[0] : null) ??
        null

    if (!candidate) return { detail: null, raw }

    // schedules / group / evaluator may be nested or already flattened
    const schedule = candidate?.schedule ?? candidate?.defenseSchedule ?? candidate?.defense_schedule ?? null
    const group = candidate?.group ?? candidate?.thesisGroup ?? candidate?.thesis_group ?? schedule?.group ?? null
    const evaluator = candidate?.evaluator ?? candidate?.user ?? candidate?.staff ?? null

    const scoresRaw =
        raw?.scores ??
        candidate?.scores ??
        candidate?.evaluationScores ??
        candidate?.evaluation_scores ??
        raw?.evaluationScores ??
        raw?.evaluation_scores ??
        []

    const scoresArray: any[] = Array.isArray(scoresRaw) ? scoresRaw : []

    const scores: EvalScoreRow[] = scoresArray.map((x) => {
        const crit = x?.criterion ?? x?.rubricCriterion ?? x?.rubric_criterion ?? null
        return {
            criterionId: safeText(x?.criterionId ?? x?.criterion_id ?? crit?.id ?? "", "") || undefined,
            criterion: safeText(x?.criterion ?? crit?.criterion ?? crit?.name ?? "", "") || undefined,
            description: crit?.description ?? x?.description ?? null,
            weight: x?.weight ?? crit?.weight ?? null,
            minScore: x?.minScore ?? crit?.min_score ?? crit?.minScore ?? null,
            maxScore: x?.maxScore ?? crit?.max_score ?? crit?.maxScore ?? null,
            score: x?.score ?? null,
            comment: x?.comment ?? null,
        }
    })

    const detail: EvalDetail = {
        id: safeText(candidate?.id, ""),

        status: candidate?.status ?? null,
        submittedAt: candidate?.submittedAt ?? candidate?.submitted_at ?? null,
        lockedAt: candidate?.lockedAt ?? candidate?.locked_at ?? null,
        createdAt: candidate?.createdAt ?? candidate?.created_at ?? null,

        scheduleId: candidate?.scheduleId ?? candidate?.schedule_id ?? schedule?.id ?? null,
        scheduledAt: candidate?.scheduledAt ?? schedule?.scheduledAt ?? schedule?.scheduled_at ?? null,
        room: candidate?.room ?? schedule?.room ?? null,
        scheduleStatus: candidate?.scheduleStatus ?? schedule?.status ?? null,

        groupId: candidate?.groupId ?? candidate?.group_id ?? group?.id ?? null,
        groupTitle: candidate?.groupTitle ?? group?.title ?? group?.name ?? null,
        program: candidate?.program ?? group?.program ?? null,
        term: candidate?.term ?? group?.term ?? null,

        evaluatorId: candidate?.evaluatorId ?? candidate?.evaluator_id ?? evaluator?.id ?? null,
        evaluatorName: candidate?.evaluatorName ?? evaluator?.name ?? null,
        evaluatorEmail: candidate?.evaluatorEmail ?? evaluator?.email ?? null,
        evaluatorRole: candidate?.evaluatorRole ?? evaluator?.role ?? null,

        scores,
    }

    return { detail, raw }
}

export default function AdminEvaluationDetailPage() {
    const router = useRouter()
    const params = useParams<{ id: string }>()
    const id = safeText(params?.id, "")

    const { user, loading: authLoading } = useAuth()

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)

    const [detail, setDetail] = React.useState<EvalDetail | null>(null)
    const [raw, setRaw] = React.useState<any>(null)

    const [showInternalIds, setShowInternalIds] = React.useState(false)
    const [showRaw, setShowRaw] = React.useState(false)

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
            const res = await apiJson<any>("GET", `/api/evaluation?resource=evaluations&id=${encodeURIComponent(id)}`)
            if (!res.ok) throw new Error(res.error ?? "Failed to load evaluation")

            const normalized = normalizeEvalDetail(res)
            if (!normalized.detail) throw new Error("Evaluation not found")

            setDetail(normalized.detail)
            setRaw(normalized.raw)
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to load evaluation")
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

    const isLocked = safeText(detail?.status, "").toLowerCase() === "locked"

    const scoreSummary = React.useMemo(() => {
        const rows = detail?.scores ?? []
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
        return {
            rows: rows.length,
            scoredCount,
            totalWeight,
            weightedSum,
            weightedAverage: avg,
        }
    }, [detail?.scores])

    async function setLock(lock: boolean) {
        if (!detail?.id) return

        const desiredLockedAt = lock ? new Date().toISOString() : null
        const desiredStatus = lock ? "locked" : detail.submittedAt ? "submitted" : "pending"

        const res = await apiJson(
            "PATCH",
            `/api/evaluation?resource=evaluations&id=${encodeURIComponent(detail.id)}`,
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
                                <h1 className="text-xl font-semibold">Evaluation record</h1>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Admin view of a single evaluator submission. You can lock/unlock if required.
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

                        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                            <Checkbox
                                id="showInternalIds"
                                checked={showInternalIds}
                                onCheckedChange={(v) => setShowInternalIds(Boolean(v))}
                            />
                            <Label htmlFor="showInternalIds" className="cursor-pointer select-none text-sm">
                                Show internal IDs
                            </Label>
                        </div>

                        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                            <Checkbox id="showRaw" checked={showRaw} onCheckedChange={(v) => setShowRaw(Boolean(v))} />
                            <Label htmlFor="showRaw" className="cursor-pointer select-none text-sm">
                                Show raw JSON
                            </Label>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-24 w-full" />
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
                        <Card>
                            <CardHeader className="space-y-2">
                                <CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <span className="min-w-0 truncate">{safeText(detail.groupTitle, "Schedule")}</span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {statusBadge(detail.status)}
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
                                    <div>{scheduleLine(detail.groupTitle, detail.scheduledAt, detail.room)}</div>
                                    <div className="text-xs text-muted-foreground">
                                        Evaluator: {personLine(detail.evaluatorName, detail.evaluatorEmail)}
                                    </div>
                                    {(detail.program || detail.term) && (
                                        <div className="text-xs text-muted-foreground">
                                            {[safeText(detail.program, ""), safeText(detail.term, "")].filter(Boolean).join(" · ")}
                                        </div>
                                    )}
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                    <div className="rounded-md border p-3">
                                        <div className="text-xs text-muted-foreground">Submitted</div>
                                        <div className="mt-1 text-sm">{fmtDateTime(detail.submittedAt) || "—"}</div>
                                    </div>
                                    <div className="rounded-md border p-3">
                                        <div className="text-xs text-muted-foreground">Locked</div>
                                        <div className="mt-1 text-sm">{fmtDateTime(detail.lockedAt) || "—"}</div>
                                    </div>
                                    <div className="rounded-md border p-3">
                                        <div className="text-xs text-muted-foreground">Created</div>
                                        <div className="mt-1 text-sm">{fmtDateTime(detail.createdAt) || "—"}</div>
                                    </div>
                                </div>

                                {showInternalIds ? (
                                    <div className="rounded-md border bg-card p-3 text-xs text-muted-foreground">
                                        <div>Evaluation ID: {detail.id}</div>
                                        <div>Schedule ID: {safeText(detail.scheduleId, "—")}</div>
                                        <div>Evaluator ID: {safeText(detail.evaluatorId, "—")}</div>
                                        <div>Group ID: {safeText(detail.groupId, "—")}</div>
                                    </div>
                                ) : null}

                                <div className="flex flex-wrap gap-2">
                                    {detail.scheduleId ? (
                                        <Button asChild variant="outline" size="sm">
                                            <Link href={`/dashboard/admin/schedules/${detail.scheduleId}`}>Open schedule</Link>
                                        </Button>
                                    ) : null}
                                    <Button asChild variant="outline" size="sm">
                                        <Link href="/dashboard/admin/evaluation">Back to list</Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="space-y-1">
                                <CardTitle>Scores & comments</CardTitle>
                                <CardDescription>
                                    Rows: {scoreSummary.rows} • Scored: {scoreSummary.scoredCount}
                                    {scoreSummary.scoredCount > 0 ? (
                                        <>
                                            {" "}
                                            • Weighted avg: {scoreSummary.weightedAverage.toFixed(2)}
                                        </>
                                    ) : null}
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                {Array.isArray(detail.scores) && detail.scores.length > 0 ? (
                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-80">Criterion</TableHead>
                                                    <TableHead className="w-28">Weight</TableHead>
                                                    <TableHead className="w-28">Score</TableHead>
                                                    <TableHead>Comment</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {detail.scores.map((r, idx) => {
                                                    const w = toNumber(r.weight, 1)
                                                    const sc = typeof r.score === "number" ? r.score : toNumber(r.score, NaN)
                                                    const crit = safeText(r.criterion, `Criterion ${idx + 1}`)
                                                    const range =
                                                        typeof r.minScore === "number" && typeof r.maxScore === "number"
                                                            ? `(${r.minScore}–${r.maxScore})`
                                                            : ""

                                                    return (
                                                        <TableRow key={`${r.criterionId ?? idx}`}>
                                                            <TableCell className="align-top">
                                                                <div className="space-y-1">
                                                                    <div className="font-medium">{crit}</div>
                                                                    {r.description ? (
                                                                        <div className="text-xs text-muted-foreground">
                                                                            {safeText(r.description, "")}
                                                                        </div>
                                                                    ) : null}
                                                                    {range ? (
                                                                        <div className="text-[10px] text-muted-foreground">Range {range}</div>
                                                                    ) : null}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="align-top">{Number.isFinite(w) ? w : "—"}</TableCell>
                                                            <TableCell className="align-top">{Number.isFinite(sc) ? sc : "—"}</TableCell>
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
                                        No score rows were returned by the API for this evaluation.
                                    </div>
                                )}

                                {showRaw ? (
                                    <>
                                        <Separator />
                                        <div>
                                            <div className="mb-2 text-sm font-semibold">Raw JSON</div>
                                            <ScrollArea className="h-72 rounded-md border">
                                                <pre className="p-3 text-xs">{JSON.stringify(raw ?? {}, null, 2)}</pre>
                                            </ScrollArea>
                                        </div>
                                    </>
                                ) : null}
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
