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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

type ScheduleDetailPayload = {
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
    panelists: Person[]
    evaluations: Array<{
        id: string
        status: string
        submittedAt: string | null
        lockedAt: string | null
        createdAt: string | null
        evaluator: Person
    }>
}

type EvalScoreSummary = {
    rows: number
    scoredCount: number
    weightedAverage: number
}

type MemberScore = {
    studentId: string
    score: number | null
    comment: string | null
    raw?: any
}

function safeText(v: any, fallback = "") {
    const s = String(v ?? "").trim()
    return s ? s : fallback
}

function toNumber(v: any, fallback = 0) {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
}

function looksLikeUuid(v: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
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

function fmtScore(v: number | null | undefined) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—"
    // show 2 decimals only when needed
    return Number.isInteger(v) ? String(v) : v.toFixed(2)
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

function computeSummary(criteria: Array<{ weight: string; score: number | null }>): EvalScoreSummary {
    const rows = Array.isArray(criteria) ? criteria.length : 0
    let scoredCount = 0
    let totalWeight = 0
    let weightedSum = 0

    for (const r of criteria ?? []) {
        const w = toNumber(r?.weight, 1)
        const sc = typeof r?.score === "number" ? r.score : toNumber(r?.score, NaN)
        if (Number.isFinite(sc)) {
            scoredCount += 1
            totalWeight += w
            weightedSum += sc * w
        }
    }

    const avg = totalWeight > 0 ? weightedSum / totalWeight : 0
    return { rows, scoredCount, weightedAverage: avg }
}

function pickMemberScore(value: any): { score: number | null; comment: string | null; raw?: any } | null {
    if (typeof value === "number" && Number.isFinite(value)) return { score: value, comment: null, raw: value }
    if (!value || typeof value !== "object" || Array.isArray(value)) return null

    const scoreCandidate =
        value.score ?? value.total ?? value.value ?? value.points ?? value.memberScore ?? value.finalScore ?? null
    const score = typeof scoreCandidate === "number" ? scoreCandidate : toNumber(scoreCandidate, NaN)
    const finalScore = Number.isFinite(score) ? score : null

    const comment =
        (typeof value.comment === "string" && value.comment) ||
        (typeof value.feedback === "string" && value.feedback) ||
        (typeof value.notes === "string" && value.notes) ||
        null

    if (finalScore === null && !comment) return null
    return { score: finalScore, comment, raw: value }
}

function extractMemberScores(extras: any): Record<string, MemberScore> {
    const out: Record<string, MemberScore> = {}
    if (!extras || typeof extras !== "object") return out

    const tryArray = (arr: any[]) => {
        for (const row of arr ?? []) {
            if (!row || typeof row !== "object") continue
            const sid = safeText(row.studentId ?? row.id ?? row.memberId ?? row.userId ?? "", "")
            if (!sid) continue

            const scoreCandidate = row.score ?? row.total ?? row.value ?? row.points ?? row.memberScore ?? row.finalScore ?? null
            const sc = typeof scoreCandidate === "number" ? scoreCandidate : toNumber(scoreCandidate, NaN)
            const score = Number.isFinite(sc) ? sc : null

            const comment =
                (typeof row.comment === "string" && row.comment) ||
                (typeof row.feedback === "string" && row.feedback) ||
                (typeof row.notes === "string" && row.notes) ||
                null

            out[sid] = { studentId: sid, score, comment, raw: row }
        }
    }

    // common shapes
    if (Array.isArray(extras.memberScores)) tryArray(extras.memberScores)
    if (Array.isArray(extras.members)) tryArray(extras.members)
    if (Array.isArray(extras.individualScores)) tryArray(extras.individualScores)

    const tryObjectMap = (obj: any) => {
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) return
        for (const [k, v] of Object.entries(obj)) {
            const sid = safeText(k, "")
            if (!sid) continue
            const picked = pickMemberScore(v)
            if (!picked) continue
            out[sid] = { studentId: sid, score: picked.score, comment: picked.comment, raw: picked.raw }
        }
    }

    if (extras.scoresByMember) tryObjectMap(extras.scoresByMember)
    if (extras.memberScoreById) tryObjectMap(extras.memberScoreById)
    if (extras.memberScoresById) tryObjectMap(extras.memberScoresById)
    if (extras.memberScoreMap) tryObjectMap(extras.memberScoreMap)

    // heuristic: top-level uuid keys mapping -> values
    for (const [k, v] of Object.entries(extras)) {
        if (!looksLikeUuid(k)) continue
        if (out[k]) continue
        const picked = pickMemberScore(v)
        if (!picked) continue
        out[k] = { studentId: k, score: picked.score, comment: picked.comment, raw: picked.raw }
    }

    return out
}

function pickOverallComment(extras: any): string | null {
    if (!extras || typeof extras !== "object") return null
    const candidates = [
        extras.overallComment,
        extras.overallFeedback,
        extras.overallNotes,
        extras.comment,
        extras.feedback,
        extras.notes,
        extras.system?.comment,
        extras.system?.feedback,
        extras.group?.comment,
        extras.group?.feedback,
        extras.summary?.comment,
        extras.summary?.feedback,
    ]
    for (const c of candidates) {
        const s = typeof c === "string" ? c.trim() : ""
        if (s) return s
    }
    return null
}

export default function AdminEvaluationDetailPage() {
    const router = useRouter()
    const params = useParams<{ id: string }>()
    const id = safeText(params?.id, "")

    const { user, loading: authLoading } = useAuth()

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)

    const [detail, setDetail] = React.useState<DetailPayload | null>(null)
    const [scheduleDetail, setScheduleDetail] = React.useState<ScheduleDetailPayload | null>(null)

    // members + extras (for evaluation detail view)
    const [membersLoading, setMembersLoading] = React.useState(false)
    const [members, setMembers] = React.useState<Person[]>([])
    const [extrasLoading, setExtrasLoading] = React.useState(false)
    const [extras, setExtras] = React.useState<any>(null)

    // score summaries for scheduleDetail.evaluations (small N; safe to fetch)
    const [evalSummaries, setEvalSummaries] = React.useState<Record<string, EvalScoreSummary>>({})
    const [evalSummariesLoading, setEvalSummariesLoading] = React.useState<Record<string, boolean>>({})

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

    async function loadMembersAndExtras(evaluationId: string) {
        setMembersLoading(true)
        setExtrasLoading(true)
        setMembers([])
        setExtras(null)

        try {
            const [mRes, xRes] = await Promise.all([
                apiJson<{ members: Person[] }>("GET", `/api/evaluations/members?evaluationId=${encodeURIComponent(evaluationId)}`),
                apiJson<{ extras: any }>("GET", `/api/evaluations/extras?evaluationId=${encodeURIComponent(evaluationId)}`),
            ])

            if (mRes.ok) {
                setMembers(Array.isArray((mRes as any).members) ? ((mRes as any).members as Person[]) : [])
            } else {
                // do not fail the page; just notify
                toast.error(mRes.error ?? "Failed to load evaluation members")
            }

            if (xRes.ok) {
                setExtras((xRes as any).extras ?? {})
            } else {
                toast.error(xRes.error ?? "Failed to load evaluation extras")
            }
        } finally {
            setMembersLoading(false)
            setExtrasLoading(false)
        }
    }

    async function loadOne() {
        if (!id) return
        setLoading(true)

        // reset cross-view state
        setEvalSummaries({})
        setEvalSummariesLoading({})
        setMembers([])
        setExtras(null)

        try {
            // 1) Try evaluation detail (evaluationId)
            const res = await apiJson<{ detail: DetailPayload }>(
                "GET",
                `/api/admin/evaluations/detail?id=${encodeURIComponent(id)}`
            )
            if (res.ok) {
                const d = (res as any).detail as DetailPayload
                setDetail(d)
                setScheduleDetail(null)

                // load member scores + extras (members group + system extras)
                const evaluationId = safeText(d?.evaluation?.id, "")
                if (evaluationId) {
                    // do not block rendering; run after we set detail
                    void loadMembersAndExtras(evaluationId)
                }
                return
            }

            // 2) Fallback: treat id as scheduleId and show schedule detail (even if evaluations not yet created)
            const res2 = await apiJson<{ detail: ScheduleDetailPayload }>(
                "GET",
                `/api/admin/schedules/detail?id=${encodeURIComponent(id)}`
            )
            if (!res2.ok) throw new Error(res2.error ?? res.error ?? "Failed to load evaluation/schedule detail")

            const sd = (res2 as any).detail as ScheduleDetailPayload
            setScheduleDetail(sd)
            setDetail(null)
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to load evaluation")
            setDetail(null)
            setScheduleDetail(null)
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

    // When viewing a scheduleDetail, load score summaries for each evaluation row (small N).
    React.useEffect(() => {
        const evals = scheduleDetail?.evaluations ?? []
        if (!scheduleDetail?.schedule?.id) return
        if (!evals.length) return

        let cancelled = false

        async function run() {
            const toFetch = evals
                .map((e) => safeText(e.id, ""))
                .filter(Boolean)
                .filter((eid) => !evalSummaries[eid] && !evalSummariesLoading[eid])

            if (!toFetch.length) return

            const nextLoading: Record<string, boolean> = {}
            for (const eid of toFetch) nextLoading[eid] = true
            setEvalSummariesLoading((prev) => ({ ...prev, ...nextLoading }))

            try {
                const results = await Promise.all(
                    toFetch.map(async (eid) => {
                        const r = await apiJson<{ detail: DetailPayload }>(
                            "GET",
                            `/api/admin/evaluations/detail?id=${encodeURIComponent(eid)}`
                        )
                        if (!r.ok) throw new Error(r.error ?? "Failed to load evaluation detail")
                        const d = (r as any).detail as DetailPayload
                        const summary = computeSummary(d?.criteria ?? [])
                        return { eid, summary }
                    })
                )

                if (cancelled) return

                const next: Record<string, EvalScoreSummary> = {}
                for (const it of results) next[it.eid] = it.summary
                setEvalSummaries((prev) => ({ ...prev, ...next }))
            } catch {
                // silent (we still allow viewing each record)
            } finally {
                if (cancelled) return
                setEvalSummariesLoading((prev) => {
                    const out = { ...prev }
                    for (const eid of toFetch) delete out[eid]
                    return out
                })
            }
        }

        run()
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scheduleDetail?.schedule?.id])

    const isLocked = safeText(detail?.evaluation?.status, "").toLowerCase() === "locked"

    const scoreSummary = React.useMemo(() => {
        const rows = detail?.criteria ?? []
        return computeSummary(rows as any)
    }, [detail?.criteria])

    const scheduleScoreSnapshot = React.useMemo(() => {
        const sums = Object.values(evalSummaries ?? {})
        const valid = sums.filter((s) => s && s.scoredCount > 0)
        if (!valid.length) return { count: 0, avg: null as number | null, min: null as number | null, max: null as number | null }

        const avg = valid.reduce((a, s) => a + s.weightedAverage, 0) / valid.length
        const min = valid.reduce((a, s) => Math.min(a, s.weightedAverage), valid[0].weightedAverage)
        const max = valid.reduce((a, s) => Math.max(a, s.weightedAverage), valid[0].weightedAverage)
        return { count: valid.length, avg, min, max }
    }, [evalSummaries])

    const memberScoreMap = React.useMemo(() => extractMemberScores(extras), [extras])

    const memberList = React.useMemo(() => {
        // prefer /api/evaluations/members (actual group_members join), fallback to detail.group.students
        const fromApi = Array.isArray(members) ? members : []
        const fromDetail = Array.isArray(detail?.group?.students) ? (detail!.group.students as Person[]) : []
        const base = fromApi.length ? fromApi : fromDetail
        // stable sort by name/email
        return [...base].sort((a, b) => personLabel(a).localeCompare(personLabel(b)))
    }, [members, detail])

    const memberScoreSummary = React.useMemo(() => {
        const total = memberList.length
        const scored = memberList.filter((m) => {
            const ms = memberScoreMap[m.id]
            return ms && typeof ms.score === "number" && Number.isFinite(ms.score)
        })
        const scoredCount = scored.length
        const avg =
            scoredCount > 0
                ? scored.reduce((a, m) => a + (memberScoreMap[m.id]?.score ?? 0), 0) / scoredCount
                : null
        return { total, scoredCount, avg }
    }, [memberList, memberScoreMap])

    const overallComment = React.useMemo(() => pickOverallComment(extras), [extras])

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

    async function assignPanelists(scheduleId: string) {
        const res = await apiJson("POST", "/api/admin/evaluations/assign", { mode: "panelists", scheduleId })
        if (!res.ok) throw new Error(res.error ?? "Failed to assign panelists")
        toast.success(`Assigned panelists. Created: ${(res as any).createdCount ?? 0}`)
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
                                <h1 className="text-xl font-semibold">
                                    {detail ? "Evaluation detail" : scheduleDetail ? "Schedule detail" : "Detail"}
                                </h1>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {detail
                                    ? "Schedule, group, evaluator, and scores (system + member-level)."
                                    : scheduleDetail
                                        ? "Schedule, group, panelists, evaluation assignments, and score summaries."
                                        : "Admin view."}
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
                ) : !detail && !scheduleDetail ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Not found</CardTitle>
                            <CardDescription>This record could not be loaded.</CardDescription>
                        </CardHeader>
                    </Card>
                ) : scheduleDetail ? (
                    <>
                        {/* Schedule Overview */}
                        <Card>
                            <CardHeader className="space-y-2">
                                <CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <span>Schedule overview</span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                openConfirm(
                                                    "Assign panelists for this schedule?",
                                                    "This will create missing evaluation rows for all panelists assigned to this schedule.",
                                                    async () => assignPanelists(scheduleDetail.schedule.id)
                                                )
                                            }
                                        >
                                            <Users className="mr-2 h-4 w-4" />
                                            Assign panelists
                                        </Button>
                                    </div>
                                </CardTitle>

                                <CardDescription className="space-y-1">
                                    <div className="text-xs text-muted-foreground">
                                        When: {fmtDate(scheduleDetail.schedule.scheduledAt)} {fmtTime(scheduleDetail.schedule.scheduledAt)}
                                        {scheduleDetail.schedule.room ? <> · Room {scheduleDetail.schedule.room}</> : null}
                                    </div>
                                    <div className="text-xs text-muted-foreground">Schedule ID: {scheduleDetail.schedule.id}</div>
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div className="rounded-md border p-3">
                                        <div className="text-xs text-muted-foreground">Group</div>
                                        <div className="mt-1 font-medium">{safeText(scheduleDetail.group.title, "—")}</div>
                                        {scheduleDetail.group.program || scheduleDetail.group.term ? (
                                            <div className="mt-1 text-sm text-muted-foreground">
                                                {[safeText(scheduleDetail.group.program, ""), safeText(scheduleDetail.group.term, "")]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </div>
                                        ) : null}
                                        <div className="mt-2">{statusBadge(scheduleDetail.schedule.status)}</div>
                                    </div>

                                    <div className="rounded-md border p-3">
                                        <div className="text-xs text-muted-foreground">Adviser</div>
                                        <div className="mt-1 font-medium">{personLabel(scheduleDetail.group.adviser)}</div>

                                        <div className="mt-3 text-xs text-muted-foreground">Counts</div>
                                        <div className="mt-1 text-sm">
                                            Students: {scheduleDetail.group.students?.length ?? 0} · Panelists:{" "}
                                            {scheduleDetail.panelists?.length ?? 0} · Evaluations: {scheduleDetail.evaluations?.length ?? 0}
                                        </div>

                                        <div className="mt-3 text-xs text-muted-foreground">System score snapshot</div>
                                        <div className="mt-1 text-sm">
                                            {scheduleScoreSnapshot.count > 0 ? (
                                                <>
                                                    Avg: {fmtScore(scheduleScoreSnapshot.avg)} · Min: {fmtScore(scheduleScoreSnapshot.min)} · Max:{" "}
                                                    {fmtScore(scheduleScoreSnapshot.max)} · Based on {scheduleScoreSnapshot.count} scored evaluation(s)
                                                </>
                                            ) : (
                                                "—"
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <Button asChild variant="outline" size="sm">
                                        <Link href="/dashboard/admin/evaluation">Back to list</Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Evaluations */}
                        <Card>
                            <CardHeader className="space-y-1">
                                <CardTitle>Evaluation assignments</CardTitle>
                                <CardDescription>
                                    Existing evaluation rows for this schedule (if any). Score summaries auto-load for quick admin viewing.
                                    Open an evaluation to see <span className="font-medium">system</span> rubric scores and{" "}
                                    <span className="font-medium">member</span> scores.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {scheduleDetail.evaluations?.length ? (
                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-80">Evaluator</TableHead>
                                                    <TableHead className="w-40">Status</TableHead>
                                                    <TableHead className="w-40">Score avg</TableHead>
                                                    <TableHead className="w-40">Scored</TableHead>
                                                    <TableHead className="w-56">Submitted</TableHead>
                                                    <TableHead className="w-56">Locked</TableHead>
                                                    <TableHead className="w-40 text-right">Action</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {scheduleDetail.evaluations.map((e) => {
                                                    const sum = evalSummaries[e.id]
                                                    const isSumLoading = Boolean(evalSummariesLoading[e.id])

                                                    const scoreAvg =
                                                        sum && sum.scoredCount > 0
                                                            ? fmtScore(sum.weightedAverage)
                                                            : sum
                                                                ? "—"
                                                                : isSumLoading
                                                                    ? ""
                                                                    : "—"
                                                    const scored = sum ? `${sum.scoredCount}/${sum.rows}` : isSumLoading ? "" : "—"

                                                    return (
                                                        <TableRow key={e.id}>
                                                            <TableCell className="align-top">
                                                                <div className="font-medium">{personLabel(e.evaluator)}</div>
                                                            </TableCell>
                                                            <TableCell className="align-top">{statusBadge(e.status)}</TableCell>

                                                            <TableCell className="align-top">
                                                                {isSumLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>{scoreAvg}</span>}
                                                            </TableCell>

                                                            <TableCell className="align-top">
                                                                {isSumLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>{scored}</span>}
                                                            </TableCell>

                                                            <TableCell className="align-top">{fmtDateTime(e.submittedAt) || "—"}</TableCell>
                                                            <TableCell className="align-top">{fmtDateTime(e.lockedAt) || "—"}</TableCell>
                                                            <TableCell className="align-top text-right">
                                                                <Button asChild size="sm" variant="outline">
                                                                    <Link href={`/dashboard/admin/evaluation/${e.id}`}>View scores</Link>
                                                                </Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>
                                ) : (
                                    <div className="rounded-md border p-6 text-sm text-muted-foreground">
                                        No evaluation rows yet. Click <span className="font-medium">Assign panelists</span> above to generate them.
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* People */}
                        <Card>
                            <CardHeader className="space-y-1">
                                <CardTitle className="flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    People
                                </CardTitle>
                                <CardDescription>Students in the group and panelists assigned to this schedule.</CardDescription>
                            </CardHeader>

                            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="rounded-md border p-3">
                                    <div className="text-sm font-semibold">Students ({scheduleDetail.group.students?.length ?? 0})</div>
                                    <Separator className="my-2" />
                                    {scheduleDetail.group.students?.length ? (
                                        <div className="space-y-2">
                                            {scheduleDetail.group.students.map((s) => (
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
                                    <div className="text-sm font-semibold">Panelists ({scheduleDetail.panelists?.length ?? 0})</div>
                                    <Separator className="my-2" />
                                    {scheduleDetail.panelists?.length ? (
                                        <div className="space-y-2">
                                            {scheduleDetail.panelists.map((p) => (
                                                <div key={p.id} className="text-sm">
                                                    {personLabel(p)}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-muted-foreground">No panelists found for this schedule.</div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </>
                ) : (
                    <>
                        {/* Evaluation Summary */}
                        <Card>
                            <CardHeader className="space-y-2">
                                <CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <span>Overview</span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {statusBadge(detail!.evaluation.status)}
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
                                    <div className="text-xs text-muted-foreground">Submitted: {fmtDateTime(detail!.evaluation.submittedAt) || "—"}</div>
                                    <div className="text-xs text-muted-foreground">Locked: {fmtDateTime(detail!.evaluation.lockedAt) || "—"}</div>
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div className="rounded-md border p-3">
                                        <div className="text-xs text-muted-foreground">Schedule</div>
                                        <div className="mt-1 font-medium">{safeText(detail!.group.title, "—")}</div>
                                        <div className="mt-1 text-sm text-muted-foreground">
                                            {fmtDate(detail!.schedule.scheduledAt)} {fmtTime(detail!.schedule.scheduledAt)}
                                            {detail!.schedule.room ? <> · Room {detail!.schedule.room}</> : null}
                                        </div>
                                        {detail!.group.program || detail!.group.term ? (
                                            <div className="mt-1 text-sm text-muted-foreground">
                                                {[safeText(detail!.group.program, ""), safeText(detail!.group.term, "")]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </div>
                                        ) : null}
                                        <div className="mt-2">{statusBadge(detail!.schedule.status)}</div>
                                    </div>

                                    <div className="rounded-md border p-3">
                                        <div className="text-xs text-muted-foreground">Evaluator</div>
                                        <div className="mt-1 font-medium">{personLabel(detail!.evaluator)}</div>
                                        <div className="mt-3 text-xs text-muted-foreground">Adviser</div>
                                        <div className="mt-1 text-sm">{personLabel(detail!.group.adviser)}</div>
                                    </div>
                                </div>

                                {detail!.rubric ? (
                                    <div className="rounded-md border p-3">
                                        <div className="text-xs text-muted-foreground">Rubric</div>
                                        <div className="mt-1 font-medium">
                                            {detail!.rubric.name} (v{detail!.rubric.version}) {detail!.rubric.active ? "" : "(inactive)"}
                                        </div>
                                        {detail!.rubric.description ? (
                                            <div className="mt-1 text-sm text-muted-foreground">{detail!.rubric.description}</div>
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
                                    <div className="text-sm font-semibold">Students ({detail!.group.students?.length ?? 0})</div>
                                    <Separator className="my-2" />
                                    {detail!.group.students?.length ? (
                                        <div className="space-y-2">
                                            {detail!.group.students.map((s) => (
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
                                    <div className="text-sm font-semibold">Panelists ({detail!.panelists?.length ?? 0})</div>
                                    <Separator className="my-2" />
                                    {detail!.panelists?.length ? (
                                        <div className="space-y-2">
                                            {detail!.panelists.map((p) => {
                                                const isEvaluator = p.id === detail!.evaluator.id
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

                        {/* Scores (SYSTEM + MEMBERS) */}
                        <Card>
                            <CardHeader className="space-y-1">
                                <CardTitle>Scores</CardTitle>
                                <CardDescription>
                                    System (rubric criteria) and member-level scores (from evaluation extras).
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <Tabs defaultValue="system">
                                    <TabsList className="grid w-full grid-cols-3">
                                        <TabsTrigger value="system">System</TabsTrigger>
                                        <TabsTrigger value="members">Members</TabsTrigger>
                                        <TabsTrigger value="raw">Raw</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="system" className="mt-4 space-y-4">
                                        <div className="rounded-md border p-3">
                                            <div className="text-sm font-semibold">System summary</div>
                                            <div className="mt-1 text-sm text-muted-foreground">
                                                Rows: {scoreSummary.rows} • Scored: {scoreSummary.scoredCount}
                                                {scoreSummary.scoredCount > 0 ? (
                                                    <> • Weighted avg: {fmtScore(scoreSummary.weightedAverage)}</>
                                                ) : null}
                                            </div>

                                            {overallComment ? (
                                                <div className="mt-3">
                                                    <div className="text-xs text-muted-foreground">Overall comment</div>
                                                    <div className="mt-1 whitespace-pre-wrap text-sm">{overallComment}</div>
                                                </div>
                                            ) : null}
                                        </div>

                                        {Array.isArray(detail!.criteria) && detail!.criteria.length > 0 ? (
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
                                                        {detail!.criteria.map((r) => {
                                                            const w = toNumber(r.weight, 1)
                                                            const sc = typeof r.score === "number" ? r.score : null
                                                            return (
                                                                <TableRow key={r.criterionId}>
                                                                    <TableCell className="align-top">
                                                                        <div className="space-y-1">
                                                                            <div className="font-medium">{safeText(r.criterion, "—")}</div>
                                                                            {r.description ? (
                                                                                <div className="text-xs text-muted-foreground">{safeText(r.description, "")}</div>
                                                                            ) : null}
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="align-top">{Number.isFinite(w) ? w : "—"}</TableCell>
                                                                    <TableCell className="align-top">
                                                                        {toNumber(r.minScore, 0)}–{toNumber(r.maxScore, 0)}
                                                                    </TableCell>
                                                                    <TableCell className="align-top">{fmtScore(sc)}</TableCell>
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
                                    </TabsContent>

                                    <TabsContent value="members" className="mt-4 space-y-4">
                                        <div className="rounded-md border p-3">
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <div className="text-sm font-semibold">Member scores</div>
                                                    <div className="mt-1 text-sm text-muted-foreground">
                                                        Scored: {memberScoreSummary.scoredCount}/{memberScoreSummary.total}
                                                        {memberScoreSummary.scoredCount > 0 && memberScoreSummary.avg !== null ? (
                                                            <> • Avg: {fmtScore(memberScoreSummary.avg)}</>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {membersLoading || extrasLoading ? "Loading…" : " "}
                                                </div>
                                            </div>
                                        </div>

                                        {memberList.length ? (
                                            <div className="rounded-md border">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead className="w-80">Member</TableHead>
                                                            <TableHead className="w-64">Email</TableHead>
                                                            <TableHead className="w-32">Score</TableHead>
                                                            <TableHead>Comment</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {memberList.map((m) => {
                                                            const ms = memberScoreMap[m.id]
                                                            return (
                                                                <TableRow key={m.id}>
                                                                    <TableCell className="align-top">
                                                                        <div className="font-medium">{safeText(m.name, "—")}</div>
                                                                    </TableCell>
                                                                    <TableCell className="align-top">
                                                                        <div className="text-sm text-muted-foreground">{safeText(m.email, "—")}</div>
                                                                    </TableCell>
                                                                    <TableCell className="align-top">{fmtScore(ms?.score ?? null)}</TableCell>
                                                                    <TableCell className="align-top">
                                                                        <div className="whitespace-pre-wrap text-sm">{safeText(ms?.comment ?? "", "—")}</div>
                                                                    </TableCell>
                                                                </TableRow>
                                                            )
                                                        })}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        ) : (
                                            <div className="rounded-md border p-6 text-sm text-muted-foreground">
                                                No members found for this evaluation.
                                            </div>
                                        )}

                                        {!extrasLoading && extras && Object.keys(memberScoreMap).length === 0 ? (
                                            <div className="rounded-md border p-4 text-sm text-muted-foreground">
                                                No member-level scores were found in <span className="font-medium">evaluation extras</span>.
                                                If your staff UI saves member scores under a different key, open the <span className="font-medium">Raw</span>{" "}
                                                tab to confirm the stored structure.
                                            </div>
                                        ) : null}
                                    </TabsContent>

                                    <TabsContent value="raw" className="mt-4 space-y-3">
                                        <div className="rounded-md border p-3">
                                            <div className="text-sm font-semibold">Evaluation extras (raw)</div>
                                            <div className="mt-1 text-sm text-muted-foreground">
                                                Stored JSON for additional fields (member/system scoring, notes, etc).
                                            </div>
                                        </div>

                                        {extrasLoading ? (
                                            <div className="space-y-2">
                                                <Skeleton className="h-6 w-full" />
                                                <Skeleton className="h-64 w-full" />
                                            </div>
                                        ) : (
                                            <ScrollArea className="h-80 rounded-md border">
                                                <pre className="p-3 text-xs">{JSON.stringify(extras ?? {}, null, 2)}</pre>
                                            </ScrollArea>
                                        )}
                                    </TabsContent>
                                </Tabs>
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
