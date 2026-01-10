/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Save, Lock } from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"

type ApiOk<T> = { ok: true } & T

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

type DbRubricTemplate = {
    id: string
    name: string
    version: number
    active: boolean
    description: string | null
    createdAt: string
    updatedAt: string
}

type DbRubricCriterion = {
    id: string
    templateId: string
    criterion: string
    description: string | null
    weight: string
    minScore: number
    maxScore: number
    createdAt: string
}

type DbEvaluationScore = {
    evaluationId: string
    criterionId: string
    score: number
    comment: string | null
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

function toNumberOrNull(v: string) {
    const t = String(v ?? "").trim()
    if (!t) return null
    const n = Number(t)
    if (!Number.isFinite(n)) return null
    return n
}

export default function StaffEvaluationDetailPage({ params }: { params: { id: string } }) {
    const router = useRouter()
    const { user, isLoading } = useAuth() as any

    const evaluationId = params?.id

    const role = String(user?.role ?? "").toLowerCase()
    const isStaff = role === "staff"
    const isAdmin = role === "admin"
    const canRoleView = isStaff || isAdmin
    const actorId = String(user?.id ?? "")

    const [loading, setLoading] = React.useState(true)
    const [saving, setSaving] = React.useState(false)

    const [forbidden, setForbidden] = React.useState(false)

    const [evaluation, setEvaluation] = React.useState<DbEvaluation | null>(null)
    const [schedule, setSchedule] = React.useState<DbDefenseSchedule | null>(null)
    const [group, setGroup] = React.useState<DbThesisGroup | null>(null)

    const [templates, setTemplates] = React.useState<DbRubricTemplate[]>([])
    const [templateId, setTemplateId] = React.useState<string>("")
    const [criteria, setCriteria] = React.useState<DbRubricCriterion[]>([])

    // form state keyed by criterionId
    const [form, setForm] = React.useState<Record<string, { score: string; comment: string }>>({})

    const locked =
        String(evaluation?.status ?? "").toLowerCase() === "locked" ||
        String(evaluation?.status ?? "").toLowerCase() === "finalized"

    const isAssignedToMe = React.useMemo(() => {
        if (!evaluation) return false
        return String(evaluation.evaluatorId ?? "") === actorId
    }, [evaluation, actorId])

    const canEdit = isAdmin || (isStaff && isAssignedToMe)

    const load = React.useCallback(async () => {
        if (!evaluationId) return
        setLoading(true)
        setForbidden(false)

        try {
            const evRes = await fetchJson<ApiOk<{ evaluation: DbEvaluation }>>(
                `/api/evaluation?resource=evaluations&id=${encodeURIComponent(evaluationId)}`
            )
            const ev = evRes.evaluation ?? null

            // Staff must only access their own assigned evaluation
            if (isStaff && ev && actorId && String(ev.evaluatorId) !== actorId) {
                setForbidden(true)
                setEvaluation(null)
                setSchedule(null)
                setGroup(null)
                setTemplates([])
                setTemplateId("")
                setCriteria([])
                setForm({})
                return
            }

            setEvaluation(ev)

            if (!ev?.scheduleId) {
                setSchedule(null)
                setGroup(null)
                return
            }

            const schRes = await fetchJson<ApiOk<{ schedule: DbDefenseSchedule }>>(
                `/api/schedule?resource=schedules&id=${encodeURIComponent(ev.scheduleId)}`
            )
            const sch = schRes.schedule ?? null
            setSchedule(sch)

            if (sch?.groupId) {
                const grRes = await fetchJson<ApiOk<{ group: DbThesisGroup }>>(
                    `/api/thesis?resource=groups&id=${encodeURIComponent(sch.groupId)}`
                )
                setGroup(grRes.group ?? null)
            } else {
                setGroup(null)
            }

            // templates (staff can view; admin manages)
            const tRes = await fetchJson<ApiOk<any>>(`/api/evaluation?resource=rubricTemplates&limit=100&offset=0`)
            const tpls: DbRubricTemplate[] = Array.isArray(tRes?.templates)
                ? tRes.templates
                : Array.isArray(tRes?.items)
                    ? tRes.items
                    : []
            setTemplates(tpls)

            const active = tpls.filter((t) => !!t.active)
            const pick =
                active.sort((a, b) => {
                    const av = Number(a.version ?? 0)
                    const bv = Number(b.version ?? 0)
                    if (bv !== av) return bv - av
                    return String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))
                })[0] ?? tpls[0] ?? null

            const chosenId = pick?.id ?? ""
            setTemplateId(chosenId)

            if (chosenId && ev?.id) {
                const cRes = await fetchJson<ApiOk<any>>(
                    `/api/evaluation?resource=rubricCriteria&templateId=${encodeURIComponent(chosenId)}`
                )
                const crit: DbRubricCriterion[] = Array.isArray(cRes?.criteria)
                    ? cRes.criteria
                    : Array.isArray(cRes?.items)
                        ? cRes.items
                        : []
                setCriteria(crit)

                // scores
                const sRes = await fetchJson<ApiOk<any>>(
                    `/api/evaluation?resource=evaluationScores&evaluationId=${encodeURIComponent(ev.id)}`
                )
                const scores: DbEvaluationScore[] = Array.isArray(sRes?.scores)
                    ? sRes.scores
                    : Array.isArray(sRes?.items)
                        ? sRes.items
                        : []

                const next: Record<string, { score: string; comment: string }> = {}
                for (const c of crit) {
                    const found = scores.find((x) => x.criterionId === c.id)
                    next[c.id] = {
                        score: found ? String(found.score) : "",
                        comment: found?.comment ? String(found.comment) : "",
                    }
                }
                setForm(next)
            } else {
                setCriteria([])
                setForm({})
            }
        } catch (err: any) {
            toast.error("Failed to load evaluation", { description: err?.message ?? "Please try again." })
        } finally {
            setLoading(false)
        }
    }, [evaluationId, isStaff, actorId])

    React.useEffect(() => {
        if (isLoading) return
        if (!canRoleView) {
            setLoading(false)
            return
        }
        load()
    }, [isLoading, canRoleView, load])

    const computed = React.useMemo(() => {
        let totalWeight = 0
        let sum = 0
        let filled = 0

        for (const c of criteria) {
            const w = Number.parseFloat(String(c.weight ?? "1")) || 1
            const n = toNumberOrNull(form[c.id]?.score ?? "")
            if (n === null) continue
            totalWeight += w
            sum += n * w
            filled += 1
        }

        const avg = totalWeight > 0 ? sum / totalWeight : 0
        return { totalWeight, avg, filled, total: criteria.length }
    }, [criteria, form])

    const saveDraft = React.useCallback(async () => {
        if (!evaluation?.id) return
        if (!canEdit) {
            toast.error("Forbidden", { description: "You can only edit evaluations assigned to you." })
            return
        }
        if (!criteria.length) {
            toast.error("No rubric criteria", { description: "Ask Admin to set an active rubric template." })
            return
        }

        setSaving(true)
        try {
            const items = criteria
                .map((c) => {
                    const n = toNumberOrNull(form[c.id]?.score ?? "")
                    if (n === null) return null
                    return {
                        criterionId: c.id,
                        score: n,
                        comment: (form[c.id]?.comment ?? "").trim() || null,
                    }
                })
                .filter(Boolean) as Array<{ criterionId: string; score: number; comment: string | null }>

            if (items.length === 0) {
                toast.error("Nothing to save", { description: "Enter at least one score first." })
                return
            }

            await fetchJson<ApiOk<{ scores: DbEvaluationScore[] }>>(`/api/evaluation?resource=evaluationScoresBulk`, {
                method: "POST",
                body: JSON.stringify({ evaluationId: evaluation.id, items }),
            })

            toast.success("Draft saved")
        } catch (err: any) {
            toast.error("Failed to save draft", { description: err?.message ?? "Please try again." })
        } finally {
            setSaving(false)
        }
    }, [evaluation?.id, criteria, form, canEdit])

    const finalize = React.useCallback(async () => {
        if (!evaluation?.id) return
        if (locked) return
        if (!canEdit) {
            toast.error("Forbidden", { description: "You can only finalize evaluations assigned to you." })
            return
        }

        if (!criteria.length) {
            toast.error("No rubric criteria", { description: "Ask Admin to set an active rubric template." })
            return
        }

        // validate all criteria filled + within range
        for (const c of criteria) {
            const n = toNumberOrNull(form[c.id]?.score ?? "")
            if (n === null) {
                toast.error("Incomplete scores", { description: "Fill in all criterion scores before finalizing." })
                return
            }
            if (n < c.minScore || n > c.maxScore) {
                toast.error("Invalid score range", {
                    description: `“${c.criterion}” must be between ${c.minScore} and ${c.maxScore}.`,
                })
                return
            }
        }

        setSaving(true)
        try {
            const items = criteria.map((c) => ({
                criterionId: c.id,
                score: Number(form[c.id]?.score ?? 0),
                comment: (form[c.id]?.comment ?? "").trim() || null,
            }))

            await fetchJson<ApiOk<{ scores: DbEvaluationScore[] }>>(`/api/evaluation?resource=evaluationScoresBulk`, {
                method: "POST",
                body: JSON.stringify({ evaluationId: evaluation.id, items }),
            })

            const now = new Date().toISOString()
            const patched = await fetchJson<ApiOk<{ evaluation: DbEvaluation }>>(
                `/api/evaluation?resource=evaluations&id=${encodeURIComponent(evaluation.id)}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        id: evaluation.id,
                        status: "locked",
                        submittedAt: now,
                        lockedAt: now,
                    }),
                }
            )

            setEvaluation(patched.evaluation ?? null)
            toast.success("Evaluation finalized and locked")
        } catch (err: any) {
            toast.error("Failed to finalize", { description: err?.message ?? "Please try again." })
        } finally {
            setSaving(false)
        }
    }, [criteria, evaluation?.id, form, locked, canEdit])

    if (!canRoleView) {
        return (
            <DashboardLayout>
                <Card>
                    <CardHeader>
                        <CardTitle>Forbidden</CardTitle>
                        <CardDescription>This page is for Staff/Admin only.</CardDescription>
                    </CardHeader>
                </Card>
            </DashboardLayout>
        )
    }

    if (forbidden) {
        return (
            <DashboardLayout>
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Link href="/dashboard/staff/evaluations">
                            <Button variant="ghost" size="sm">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back
                            </Button>
                        </Link>
                    </div>
                    <Card>
                        <CardHeader>
                            <CardTitle>Forbidden</CardTitle>
                            <CardDescription>You do not have access to this evaluation.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="outline" onClick={() => router.push("/dashboard/staff/evaluations")}>
                                Go back
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <Link href="/dashboard/staff/evaluations">
                                <Button variant="ghost" size="sm">
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Back
                                </Button>
                            </Link>
                            {evaluation?.status ? <StatusBadge status={evaluation.status} /> : null}
                        </div>

                        <h1 className="text-2xl font-semibold">Evaluation</h1>
                        <p className="text-sm text-muted-foreground">
                            Score each rubric criterion and provide comments. Finalize to lock the evaluation.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={saveDraft} disabled={loading || saving || locked || !canEdit}>
                            <Save className="mr-2 h-4 w-4" />
                            Save Draft
                        </Button>
                        <Button onClick={finalize} disabled={loading || saving || locked || !canEdit}>
                            <Lock className="mr-2 h-4 w-4" />
                            Finalize & Lock
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-64 w-full" />
                    </div>
                ) : !evaluation ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Not found</CardTitle>
                            <CardDescription>This evaluation does not exist or you do not have access.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="outline" onClick={() => router.push("/dashboard/staff/evaluations")}>
                                Go back
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle>Schedule & Group</CardTitle>
                                <CardDescription>Context for this evaluation record.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                        <div className="text-xs text-muted-foreground">Group</div>
                                        <div className="font-medium">{group?.title ?? "—"}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {[group?.program, group?.term].filter(Boolean).join(" • ") || "—"}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-xs text-muted-foreground">Schedule</div>
                                        <div className="font-medium">{formatDateTime(schedule?.scheduledAt ?? null)}</div>
                                        <div className="text-xs text-muted-foreground">Room: {schedule?.room ?? "—"}</div>
                                    </div>
                                </div>

                                <Separator />

                                <div className="grid gap-3 sm:grid-cols-3">
                                    <div>
                                        <div className="text-xs text-muted-foreground">Status</div>
                                        <div className="font-medium">{String(evaluation.status ?? "pending")}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Submitted</div>
                                        <div className="font-medium">{formatDateTime(evaluation.submittedAt)}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Locked</div>
                                        <div className="font-medium">{formatDateTime(evaluation.lockedAt)}</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="space-y-2">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <CardTitle>Rubric Scoring</CardTitle>
                                        <CardDescription>
                                            Using the active rubric template (Admin-managed). Weighted average updates as you score.
                                        </CardDescription>
                                    </div>
                                    <div className="text-sm">
                                        <span className="text-muted-foreground">Weighted Avg:</span>{" "}
                                        <span className="font-medium">{computed.avg.toFixed(2)}</span>{" "}
                                        <span className="text-muted-foreground">
                                            ({computed.filled}/{computed.total} filled)
                                        </span>
                                    </div>
                                </div>

                                <div className="text-xs text-muted-foreground">
                                    Template:{" "}
                                    <span className="font-medium">{templates.find((t) => t.id === templateId)?.name ?? "—"}</span>
                                    {templates.find((t) => t.id === templateId)?.version != null ? (
                                        <>
                                            {" "}
                                            • v{templates.find((t) => t.id === templateId)?.version}
                                        </>
                                    ) : null}
                                </div>

                                {!canEdit ? (
                                    <div className="text-xs text-muted-foreground">
                                        You can view this evaluation, but you cannot edit it (not assigned to you).
                                    </div>
                                ) : null}
                            </CardHeader>

                            <CardContent className="space-y-5">
                                {criteria.length === 0 ? (
                                    <div className="text-sm text-muted-foreground">
                                        No rubric criteria found. Ask Admin to create/activate a rubric template.
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {criteria.map((c) => {
                                            const v = form[c.id] ?? { score: "", comment: "" }
                                            const w = Number.parseFloat(String(c.weight ?? "1")) || 1
                                            return (
                                                <div key={c.id} className="rounded-lg border p-4">
                                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                        <div className="space-y-1">
                                                            <div className="font-medium">{c.criterion}</div>
                                                            {c.description ? (
                                                                <div className="text-sm text-muted-foreground">{c.description}</div>
                                                            ) : null}
                                                            <div className="text-xs text-muted-foreground">
                                                                Weight: {w} • Range: {c.minScore}–{c.maxScore}
                                                            </div>
                                                        </div>

                                                        <div className="w-full sm:w-56">
                                                            <div className="text-xs text-muted-foreground">Score</div>
                                                            <Input
                                                                value={v.score}
                                                                onChange={(e) =>
                                                                    setForm((prev) => ({
                                                                        ...prev,
                                                                        [c.id]: { ...prev[c.id], score: e.target.value },
                                                                    }))
                                                                }
                                                                inputMode="numeric"
                                                                placeholder={`${c.minScore} - ${c.maxScore}`}
                                                                disabled={locked || !canEdit}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="mt-3">
                                                        <div className="text-xs text-muted-foreground">Comment</div>
                                                        <Textarea
                                                            value={v.comment}
                                                            onChange={(e) =>
                                                                setForm((prev) => ({
                                                                    ...prev,
                                                                    [c.id]: { ...prev[c.id], comment: e.target.value },
                                                                }))
                                                            }
                                                            placeholder="Write feedback for this criterion..."
                                                            disabled={locked || !canEdit}
                                                            className="min-h-24"
                                                        />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </DashboardLayout>
    )
}
