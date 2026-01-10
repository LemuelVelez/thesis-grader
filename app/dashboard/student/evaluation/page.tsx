/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { toast } from "sonner"
import { RefreshCw, MessageSquare, Users, Layers, BarChart3, Info, Star } from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

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
    studentEvaluation: null | {
        id: string
        status: string
        answers: any
        submittedAt: string | null
        lockedAt: string | null
        createdAt: string
        updatedAt: string
    }
}

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

export default function StudentEvaluationPage() {
    const { user, loading: authLoading } = useAuth()

    const [loading, setLoading] = React.useState(true)
    const [items, setItems] = React.useState<SummaryItem[]>([])
    const [selectedScheduleId, setSelectedScheduleId] = React.useState<string>("")
    const [error, setError] = React.useState<string>("")

    // feedback form state
    const [rating, setRating] = React.useState<string>("")
    const [comment, setComment] = React.useState<string>("")
    const [saving, setSaving] = React.useState(false)

    const selected = React.useMemo(() => {
        return items.find((x) => x.schedule.id === selectedScheduleId) ?? items[0] ?? null
    }, [items, selectedScheduleId])

    function hydrateFeedbackFromSelected(it: SummaryItem | null) {
        const ans = it?.studentEvaluation?.answers ?? {}
        const fb = ans?.studentFeedback ?? ans?.feedback ?? {}
        const r = fb?.rating
        const c = fb?.comment ?? fb?.text ?? fb?.message ?? ""
        setRating(r !== undefined && r !== null && String(r).trim() ? String(r) : "")
        setComment(typeof c === "string" ? c : "")
    }

    async function load() {
        setLoading(true)
        setError("")
        try {
            const res = await fetch(`/api/student/evaluation-summary?limit=10`, { cache: "no-store" })
            const data = (await res.json()) as any
            if (!res.ok || !data?.ok) {
                throw new Error(data?.message ?? "Failed to load evaluation summary")
            }

            const nextItems = (data as ApiOk<{ items: SummaryItem[] }>).items ?? []
            setItems(nextItems)

            const firstId = nextItems?.[0]?.schedule?.id ?? ""
            setSelectedScheduleId((prev) => prev || firstId)
        } catch (e: any) {
            setError(e?.message ?? "Failed to load evaluation summary")
            setItems([])
        } finally {
            setLoading(false)
        }
    }

    React.useEffect(() => {
        if (authLoading) return
        load()
    }, [authLoading])

    React.useEffect(() => {
        const it = selected
        if (!it) return
        if (!selectedScheduleId) setSelectedScheduleId(it.schedule.id)
        hydrateFeedbackFromSelected(it)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedScheduleId, selected?.schedule?.id])

    async function saveFeedback(next: { rating: string; comment: string; clearStatusToPending?: boolean }) {
        if (!user?.id) {
            toast.error("You are not logged in.")
            return
        }
        if (!selected) {
            toast.error("No schedule selected.")
            return
        }

        const se = selected.studentEvaluation
        const isLocked = safeText(se?.status, "").toLowerCase() === "locked"
        if (isLocked) {
            toast.error("Feedback is locked and cannot be updated.")
            return
        }

        setSaving(true)
        try {
            const nowIso = new Date().toISOString()
            const existingAnswers =
                se?.answers && typeof se.answers === "object" && !Array.isArray(se.answers) ? se.answers : {}
            const mergedAnswers = {
                ...existingAnswers,
                studentFeedback: {
                    rating: next.rating ? Number(next.rating) : null,
                    comment: next.comment ?? "",
                },
            }

            const nextStatus = next.clearStatusToPending ? "pending" : "submitted"

            if (se?.id) {
                const url = `/api/evaluation?resource=studentEvaluations&id=${encodeURIComponent(se.id)}`
                const res = await fetch(url, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: se.id,
                        status: nextStatus,
                        answers: mergedAnswers,
                        submittedAt: nextStatus === "submitted" ? (se.submittedAt ?? nowIso) : null,
                    }),
                })
                const data = (await res.json()) as any
                if (!res.ok || !data?.ok) throw new Error(data?.message ?? "Failed to save feedback")
            } else {
                const url = `/api/evaluation?resource=studentEvaluations`
                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        scheduleId: selected.schedule.id,
                        studentId: user.id,
                        status: nextStatus,
                        answers: mergedAnswers,
                        submittedAt: nextStatus === "submitted" ? nowIso : null,
                    }),
                })
                const data = (await res.json()) as any
                if (!res.ok || !data?.ok) throw new Error(data?.message ?? "Failed to save feedback")
            }

            toast.success(next.clearStatusToPending ? "Feedback cleared." : "Feedback saved.")
            await load()
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to save feedback")
        } finally {
            setSaving(false)
        }
    }

    const role = safeText(user?.role, "").toLowerCase()
    const isStudent = role === "student"

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            <h1 className="text-xl font-semibold">Evaluation</h1>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            View your group and system results, plus your personal score. You can also submit feedback.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => load()} disabled={loading || authLoading}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Refresh
                        </Button>
                    </div>
                </div>

                {!authLoading && !isStudent && (
                    <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>Access restricted</AlertTitle>
                        <AlertDescription>This page is only available for student accounts.</AlertDescription>
                    </Alert>
                )}

                {error && (
                    <Alert variant="destructive">
                        <AlertTitle>Failed to load</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <Card>
                    <CardHeader className="space-y-2">
                        <CardTitle className="flex items-center gap-2">
                            <Layers className="h-5 w-5" />
                            Select schedule
                        </CardTitle>
                        <CardDescription>Choose which defense schedule you want to view.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {loading ? (
                            <div className="space-y-3">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-20 w-full" />
                            </div>
                        ) : items.length === 0 ? (
                            <Alert>
                                <AlertTitle>No schedules found</AlertTitle>
                                <AlertDescription>
                                    You do not have a defense schedule assigned yet, or results are not available.
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Schedule</Label>
                                        <Select value={selected?.schedule?.id ?? ""} onValueChange={(v) => setSelectedScheduleId(v)}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a schedule" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {items.map((it) => (
                                                    <SelectItem key={it.schedule.id} value={it.schedule.id}>
                                                        {safeText(it.group.title, "Untitled Group")} — {formatDateTime(it.schedule.scheduledAt)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Status</Label>
                                        <div className="flex items-center gap-2 rounded-md border p-3">
                                            {statusBadge(selected?.schedule?.status)}
                                            <span className="text-sm text-muted-foreground">
                                                Room: {safeText(selected?.schedule?.room, "—")}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <Separator />

                                <div className="grid gap-4 md:grid-cols-3">
                                    <Card>
                                        <CardHeader className="space-y-1">
                                            <CardTitle className="flex items-center gap-2 text-base">
                                                <Users className="h-4 w-4" />
                                                Group score
                                            </CardTitle>
                                            <CardDescription>Average from panelist submissions.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-2">
                                            <div className="text-2xl font-semibold">{fmtScore(selected?.scores?.groupScore)}</div>
                                            <Progress value={scoreProgress(selected?.scores?.groupScore)} />
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader className="space-y-1">
                                            <CardTitle className="flex items-center gap-2 text-base">
                                                <Layers className="h-4 w-4" />
                                                System score
                                            </CardTitle>
                                            <CardDescription>Average system score (if provided).</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-2">
                                            <div className="text-2xl font-semibold">{fmtScore(selected?.scores?.systemScore)}</div>
                                            <Progress value={scoreProgress(selected?.scores?.systemScore)} />
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader className="space-y-1">
                                            <CardTitle className="flex items-center gap-2 text-base">
                                                <Star className="h-4 w-4" />
                                                Your score
                                            </CardTitle>
                                            <CardDescription>Your personal score only.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-2">
                                            <div className="text-2xl font-semibold">{fmtScore(selected?.scores?.personalScore)}</div>
                                            <Progress value={scoreProgress(selected?.scores?.personalScore)} />
                                        </CardContent>
                                    </Card>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                {selected && (
                    <Tabs defaultValue="breakdown" className="space-y-4">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
                            <TabsTrigger value="feedback">Feedback</TabsTrigger>
                        </TabsList>

                        <TabsContent value="breakdown" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Panelist breakdown</CardTitle>
                                    <CardDescription>
                                        Shows group/system and your personal score per evaluator (if available).
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {selected.panelistEvaluations.length === 0 ? (
                                        <Alert>
                                            <AlertTitle>No panelist evaluations yet</AlertTitle>
                                            <AlertDescription>
                                                Your panelists may not have submitted results, or results are not published.
                                            </AlertDescription>
                                        </Alert>
                                    ) : (
                                        <>
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
                                                        {selected.panelistEvaluations.map((r) => (
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

                                            <Accordion type="single" collapsible className="w-full">
                                                <AccordionItem value="comments">
                                                    <AccordionTrigger>Comments (if provided)</AccordionTrigger>
                                                    <AccordionContent>
                                                        <ScrollArea className="h-72 rounded-md border p-4">
                                                            <div className="space-y-4">
                                                                {selected.panelistEvaluations.map((r) => (
                                                                    <div key={`${r.evaluationId}-c`} className="space-y-2">
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <div className="font-medium">{safeText(r.evaluator.name, "—")}</div>
                                                                            <div className="text-xs text-muted-foreground">
                                                                                Submitted: {formatDateTime(r.submittedAt)}
                                                                            </div>
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
                                                    </AccordionContent>
                                                </AccordionItem>
                                            </Accordion>
                                        </>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="feedback" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <MessageSquare className="h-5 w-5" />
                                        Submit feedback
                                    </CardTitle>
                                    <CardDescription>Only your feedback is saved under your account.</CardDescription>
                                </CardHeader>

                                <CardContent className="space-y-4">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Feedback status</Label>
                                            <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                                                <div className="flex items-center gap-2">
                                                    {statusBadge(selected.studentEvaluation?.status)}
                                                    <span className="text-sm text-muted-foreground">
                                                        Updated: {formatDateTime(selected.studentEvaluation?.updatedAt)}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-muted-foreground">
                                                    Submitted: {formatDateTime(selected.studentEvaluation?.submittedAt)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Rating</Label>
                                            <Select value={rating} onValueChange={(v) => setRating(v)}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select rating (optional)" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="1">1 - Poor</SelectItem>
                                                    <SelectItem value="2">2 - Fair</SelectItem>
                                                    <SelectItem value="3">3 - Good</SelectItem>
                                                    <SelectItem value="4">4 - Very Good</SelectItem>
                                                    <SelectItem value="5">5 - Excellent</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Comment</Label>
                                        <Textarea
                                            value={comment}
                                            onChange={(e) => setComment(e.target.value)}
                                            placeholder="Write your feedback here..."
                                            rows={6}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Tip: Keep it constructive (what went well, what could improve).
                                        </p>
                                    </div>

                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex gap-2">
                                            <Button onClick={() => saveFeedback({ rating, comment })} disabled={saving || loading}>
                                                {saving ? "Saving..." : "Save feedback"}
                                            </Button>

                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="outline" disabled={saving || loading}>
                                                        Clear
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Clear your feedback?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This will remove your rating and comment for this schedule.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            onClick={() => {
                                                                setRating("")
                                                                setComment("")
                                                                saveFeedback({ rating: "", comment: "", clearStatusToPending: true })
                                                            }}
                                                        >
                                                            Clear
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>

                                        <div className="text-xs text-muted-foreground">
                                            Your feedback is private (other students cannot see it).
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </DashboardLayout>
    )
}
