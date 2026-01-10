/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { RefreshCw, ArrowLeft, Info, Layers, Star, Users } from "lucide-react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type ApiOk<T> = { ok: true } & T

type SummaryItem = {
    schedule: {
        id: string
        scheduledAt: string | null
        room: string | null
        status: string | null
    }
    group: {
        id: string
        title: string
        program: string | null
        term: string | null
    }
    scores: {
        groupScore: number | string | null
        systemScore: number | string | null
        personalScore: number | string | null
    }
    panelistEvaluations: Array<{
        evaluationId: string
        status: string
        submittedAt: string | null
        lockedAt: string | null
        evaluator: { id: string; name: string; email: string }
        scores: { groupScore: number | string | null; systemScore: number | string | null; personalScore: number | string | null }
        comments: { groupComment: string | null; systemComment: string | null; personalComment: string | null }
    }>
    studentEvaluation: any
}

type EvalExtrasResp =
    | { ok: true; extras: any }
    | { ok: false; error?: string; message?: string }

function safeText(v: any, fallback = "") {
    const s = String(v ?? "").trim()
    return s ? s : fallback
}

function toNumber(v: any): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string") {
        const n = Number(v)
        return Number.isFinite(n) ? n : null
    }
    return null
}

function fmtScore(n: number | string | null | undefined) {
    const x = toNumber(n)
    if (x === null) return "—"
    return Number.isInteger(x) ? String(x) : x.toFixed(2)
}

function scoreScale(n: number | string | null | undefined) {
    const x = toNumber(n)
    if (x === null) return 100
    if (x <= 5) return 5
    if (x <= 10) return 10
    return 100
}

function scoreProgress(n: number | string | null | undefined) {
    const x = toNumber(n)
    if (x === null) return 0
    const max = scoreScale(x)
    return Math.max(0, Math.min(100, (x / max) * 100))
}

function statusBadge(status?: string | null) {
    const s = safeText(status, "").toLowerCase()
    if (!s) return <Badge variant="secondary">Unknown</Badge>
    if (s === "locked") return <Badge variant="destructive">Locked</Badge>
    if (s === "submitted") return <Badge variant="default">Submitted</Badge>
    if (s === "pending") return <Badge variant="secondary">Pending</Badge>
    return <Badge variant="outline">{status}</Badge>
}

function formatDateTime(iso?: string | null) {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleString()
}

function pickPersonalFromExtras(extras: any, studentId: string): { score: number | null; comment: string | null } {
    const mo = extras?.membersOverall?.[studentId]
    const score = toNumber(mo?.score)
    const comment =
        typeof mo?.comment === "string"
            ? mo.comment
            : typeof mo?.feedback === "string"
                ? mo.feedback
                : typeof mo?.notes === "string"
                    ? mo.notes
                    : null
    return { score, comment }
}

function averageNumbers(nums: Array<number | null | undefined>): number | null {
    const valid = nums.filter((n) => typeof n === "number" && Number.isFinite(n)) as number[]
    if (!valid.length) return null
    const sum = valid.reduce((a, b) => a + b, 0)
    return sum / valid.length
}

async function fetchEvalExtras(evaluationId: string): Promise<any | null> {
    const urls = [
        `/api/evaluations/extras?evaluationId=${encodeURIComponent(evaluationId)}`,
        `/api/student/evaluations/extras?evaluationId=${encodeURIComponent(evaluationId)}`,
    ]

    for (const url of urls) {
        try {
            const res = await fetch(url, { cache: "no-store" })
            const data = (await res.json().catch(() => ({}))) as EvalExtrasResp
            if (res.ok && (data as any)?.ok) return (data as any).extras ?? {}
        } catch {
            // try next
        }
    }
    return null
}

export default function StudentEvaluationDetailPage() {
    const router = useRouter()
    const params = useParams<{ id: string }>()
    const scheduleId = safeText(params?.id, "")

    const { user, loading: authLoading } = useAuth()

    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState("")
    const [item, setItem] = React.useState<SummaryItem | null>(null)

    const [extrasByEvalId, setExtrasByEvalId] = React.useState<Record<string, any>>({})
    const [extrasLoadingByEvalId, setExtrasLoadingByEvalId] = React.useState<Record<string, boolean>>({})

    const role = safeText(user?.role, "").toLowerCase()
    const isStudent = role === "student"

    async function load() {
        if (!scheduleId) return
        setLoading(true)
        setError("")
        setItem(null)

        try {
            const res = await fetch(`/api/student/evaluation-summary?limit=50`, { cache: "no-store" })
            const data = (await res.json()) as any
            if (!res.ok || !data?.ok) throw new Error(data?.message ?? "Failed to load evaluation summary")

            const items = (data as ApiOk<{ items: SummaryItem[] }>).items ?? []
            const found = items.find((x) => x.schedule.id === scheduleId) ?? null
            if (!found) throw new Error("Schedule not found in your evaluation summary.")

            setItem(found)
        } catch (e: any) {
            setError(e?.message ?? "Failed to load evaluation detail")
        } finally {
            setLoading(false)
        }
    }

    React.useEffect(() => {
        if (authLoading) return
        if (!isStudent) return
        load()

    }, [authLoading, isStudent, scheduleId])

    // Fetch extras if personalScore missing in rows
    React.useEffect(() => {
        const studentId = safeText(user?.id, "")
        if (!studentId) return
        if (!item) return

        const rows = item.panelistEvaluations ?? []
        const missingPersonal = rows.filter((r) => toNumber(r?.scores?.personalScore) === null)

        if (!missingPersonal.length) return

        const toFetch = missingPersonal
            .map((r) => safeText(r.evaluationId, ""))
            .filter(Boolean)
            .filter((eid) => !extrasByEvalId[eid] && !extrasLoadingByEvalId[eid])

        if (!toFetch.length) return

        let cancelled = false

        async function run() {
            setExtrasLoadingByEvalId((prev) => {
                const next = { ...prev }
                for (const eid of toFetch) next[eid] = true
                return next
            })

            try {
                const results = await Promise.all(
                    toFetch.map(async (eid) => {
                        const extras = await fetchEvalExtras(eid)
                        return { eid, extras }
                    })
                )
                if (cancelled) return

                setExtrasByEvalId((prev) => {
                    const next = { ...prev }
                    for (const { eid, extras } of results) {
                        if (extras) next[eid] = extras
                    }
                    return next
                })
            } finally {
                if (cancelled) return
                setExtrasLoadingByEvalId((prev) => {
                    const next = { ...prev }
                    for (const eid of toFetch) delete next[eid]
                    return next
                })
            }
        }

        run()
        return () => {
            cancelled = true
        }
    }, [user?.id, item?.schedule?.id, item?.panelistEvaluations, extrasByEvalId, extrasLoadingByEvalId])

    const enrichedRows = React.useMemo(() => {
        const studentId = safeText(user?.id, "")
        const rows = item?.panelistEvaluations ?? []
        if (!rows.length) return []

        return rows.map((r) => {
            const evalId = safeText(r.evaluationId, "")
            const existingScore = toNumber(r?.scores?.personalScore)
            const existingComment = typeof r?.comments?.personalComment === "string" ? r.comments.personalComment : null

            if (existingScore !== null || existingComment) return r

            const extras = evalId ? extrasByEvalId[evalId] : null
            if (!extras || !studentId) return r

            const picked = pickPersonalFromExtras(extras, studentId)
            return {
                ...r,
                scores: { ...r.scores, personalScore: picked.score ?? r.scores.personalScore },
                comments: { ...r.comments, personalComment: picked.comment ?? r.comments.personalComment },
            }
        })
    }, [item?.panelistEvaluations, extrasByEvalId, user?.id])

    const derivedScores = React.useMemo(() => {
        const base = item?.scores ?? { groupScore: null, systemScore: null, personalScore: null }
        const groupAvg = averageNumbers(enrichedRows.map((r) => toNumber(r.scores.groupScore)))
        const systemAvg = averageNumbers(enrichedRows.map((r) => toNumber(r.scores.systemScore)))
        const personalAvg = averageNumbers(enrichedRows.map((r) => toNumber(r.scores.personalScore)))

        return {
            groupScore: toNumber(base.groupScore) !== null ? base.groupScore : groupAvg,
            systemScore: toNumber(base.systemScore) !== null ? base.systemScore : systemAvg,
            personalScore: toNumber(base.personalScore) !== null ? base.personalScore : personalAvg,
        }
    }, [item?.scores, enrichedRows])

    React.useEffect(() => {
        if (!error) return
        toast.error(error)
    }, [error])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" onClick={() => router.push("/dashboard/student/evaluation")}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <div className="flex items-center gap-2">
                                <Layers className="h-5 w-5" />
                                <h1 className="text-xl font-semibold">Evaluation detail</h1>
                            </div>
                            <p className="text-sm text-muted-foreground">Your group/system scores and your personal score.</p>
                        </div>
                    </div>

                    <Button variant="outline" onClick={load} disabled={loading || authLoading}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                    </Button>
                </div>

                {!authLoading && !isStudent && (
                    <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>Access restricted</AlertTitle>
                        <AlertDescription>This page is only available for student accounts.</AlertDescription>
                    </Alert>
                )}

                {loading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-28 w-full" />
                        <Skeleton className="h-64 w-full" />
                    </div>
                ) : !item ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Not found</CardTitle>
                            <CardDescription>{error || "This record could not be loaded."}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button asChild variant="outline">
                                <Link href="/dashboard/student/evaluation">Back</Link>
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <Card>
                            <CardHeader className="space-y-2">
                                <CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <span>{safeText(item.group.title, "Untitled group")}</span>
                                    <div className="flex items-center gap-2">
                                        {statusBadge(item.schedule.status)}
                                    </div>
                                </CardTitle>
                                <CardDescription className="space-y-1">
                                    <div className="text-xs text-muted-foreground">
                                        When: {formatDateTime(item.schedule.scheduledAt)} {item.schedule.room ? <> · Room {item.schedule.room}</> : null}
                                    </div>
                                    <div className="text-xs text-muted-foreground">Schedule ID: {item.schedule.id}</div>
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-3">
                                    <Card>
                                        <CardHeader className="space-y-1">
                                            <CardTitle className="flex items-center gap-2 text-base">
                                                <Users className="h-4 w-4" />
                                                Group score
                                            </CardTitle>
                                            <CardDescription>Average from panelists.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-2">
                                            <div className="text-2xl font-semibold">{fmtScore(derivedScores.groupScore)}</div>
                                            <Progress value={scoreProgress(derivedScores.groupScore)} />
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader className="space-y-1">
                                            <CardTitle className="flex items-center gap-2 text-base">
                                                <Layers className="h-4 w-4" />
                                                System score
                                            </CardTitle>
                                            <CardDescription>Average system score.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-2">
                                            <div className="text-2xl font-semibold">{fmtScore(derivedScores.systemScore)}</div>
                                            <Progress value={scoreProgress(derivedScores.systemScore)} />
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader className="space-y-1">
                                            <CardTitle className="flex items-center gap-2 text-base">
                                                <Star className="h-4 w-4" />
                                                Your score
                                            </CardTitle>
                                            <CardDescription>Your personal score.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-2">
                                            <div className="text-2xl font-semibold">{fmtScore(derivedScores.personalScore)}</div>
                                            <Progress value={scoreProgress(derivedScores.personalScore)} />
                                            {Object.values(extrasLoadingByEvalId).some(Boolean) ? (
                                                <div className="text-xs text-muted-foreground">Loading personal scores…</div>
                                            ) : null}
                                        </CardContent>
                                    </Card>
                                </div>

                                <Separator />

                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Evaluator</TableHead>
                                                <TableHead className="text-right">Group</TableHead>
                                                <TableHead className="text-right">System</TableHead>
                                                <TableHead className="text-right">You</TableHead>
                                                <TableHead className="text-right">Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {enrichedRows.map((r) => (
                                                <TableRow key={r.evaluationId}>
                                                    <TableCell>
                                                        <div className="font-medium">{safeText(r.evaluator.name, "—")}</div>
                                                        <div className="text-xs text-muted-foreground">{safeText(r.evaluator.email, "")}</div>
                                                    </TableCell>
                                                    <TableCell className="text-right">{fmtScore(r.scores.groupScore)}</TableCell>
                                                    <TableCell className="text-right">{fmtScore(r.scores.systemScore)}</TableCell>
                                                    <TableCell className="text-right">{fmtScore(r.scores.personalScore)}</TableCell>
                                                    <TableCell className="text-right">{statusBadge(r.status)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>

                                <Card>
                                    <CardHeader className="space-y-1">
                                        <CardTitle>Comments</CardTitle>
                                        <CardDescription>Panelists’ comments, including your personal comment.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <ScrollArea className="h-80 rounded-md border p-4">
                                            <div className="space-y-4">
                                                {enrichedRows.map((r) => (
                                                    <div key={`${r.evaluationId}-comments`} className="space-y-2">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="font-medium">{safeText(r.evaluator.name, "—")}</div>
                                                            <div className="text-xs text-muted-foreground">Submitted: {formatDateTime(r.submittedAt)}</div>
                                                        </div>

                                                        <div className="grid gap-2 md:grid-cols-3">
                                                            <Card>
                                                                <CardHeader className="py-3">
                                                                    <CardTitle className="text-sm">Group comment</CardTitle>
                                                                </CardHeader>
                                                                <CardContent className="text-sm text-muted-foreground">
                                                                    {safeText(r.comments.groupComment, "—")}
                                                                </CardContent>
                                                            </Card>
                                                            <Card>
                                                                <CardHeader className="py-3">
                                                                    <CardTitle className="text-sm">System comment</CardTitle>
                                                                </CardHeader>
                                                                <CardContent className="text-sm text-muted-foreground">
                                                                    {safeText(r.comments.systemComment, "—")}
                                                                </CardContent>
                                                            </Card>
                                                            <Card>
                                                                <CardHeader className="py-3">
                                                                    <CardTitle className="text-sm">Your comment</CardTitle>
                                                                </CardHeader>
                                                                <CardContent className="text-sm text-muted-foreground">
                                                                    {safeText(r.comments.personalComment, "—")}
                                                                </CardContent>
                                                            </Card>
                                                        </div>

                                                        <Separator />
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    </CardContent>
                                </Card>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </DashboardLayout>
    )
}
