"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import DashboardLayout from "@/components/dashboard-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

type EvaluationStatus = "pending" | "submitted" | "locked" | (string & {})

type EvaluationItem = {
    id: string
    schedule_id: string
    evaluator_id: string
    status: EvaluationStatus
    submitted_at: string | null
    locked_at: string | null
    created_at: string | null
}

type EvaluationScoreItem = {
    criterion_id: string
    score: number | null
    comment: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function toStringSafe(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function toNullableString(value: unknown): string | null {
    if (value === null) return null
    return toStringSafe(value)
}

function toNumberOrNull(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}

function toTitleCase(value: string): string {
    if (!value) return value
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDateTime(value: string): string {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function statusVariant(status: string): "secondary" | "outline" | "default" | "destructive" {
    const normalized = status.toLowerCase()
    if (normalized === "submitted") return "default"
    if (normalized === "locked") return "destructive"
    if (normalized === "pending") return "secondary"
    return "outline"
}

function normalizeEvaluation(raw: unknown): EvaluationItem | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    if (!id) return null

    return {
        id,
        schedule_id: toStringSafe(raw.schedule_id ?? raw.scheduleId) ?? "—",
        evaluator_id: toStringSafe(raw.evaluator_id ?? raw.evaluatorId) ?? "—",
        status: (toStringSafe(raw.status) ?? "pending") as EvaluationStatus,
        submitted_at: toNullableString(raw.submitted_at ?? raw.submittedAt),
        locked_at: toNullableString(raw.locked_at ?? raw.lockedAt),
        created_at: toNullableString(raw.created_at ?? raw.createdAt),
    }
}

function normalizeScore(raw: unknown): EvaluationScoreItem | null {
    if (!isRecord(raw)) return null

    const criterionId = toStringSafe(raw.criterion_id ?? raw.criterionId)
    if (!criterionId) return null

    return {
        criterion_id: criterionId,
        score: toNumberOrNull(raw.score),
        comment: toNullableString(raw.comment),
    }
}

function extractItemPayload(payload: unknown): unknown | null {
    if (isRecord(payload) && payload.item !== undefined) return payload.item
    if (isRecord(payload) && payload.data !== undefined) return payload.data
    if (isRecord(payload) && isRecord(payload.result) && payload.result.item !== undefined) {
        return payload.result.item
    }
    return isRecord(payload) ? payload : null
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []
    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (isRecord(payload.data) && Array.isArray(payload.data.items)) return payload.data.items
    return []
}

async function readErrorMessage(res: Response, payload: unknown): Promise<string> {
    if (isRecord(payload)) {
        const error = toStringSafe(payload.error)
        if (error) return error

        const message = toStringSafe(payload.message)
        if (message) return message
    }

    try {
        const text = await res.text()
        if (text.trim().length > 0) return text
    } catch {
        // ignore
    }

    return `Request failed (${res.status})`
}

export default function PanelistEvaluationDetailsPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const id = typeof params?.id === "string" ? params.id : ""

    const [item, setItem] = React.useState<EvaluationItem | null>(null)
    const [scores, setScores] = React.useState<EvaluationScoreItem[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [actionLoading, setActionLoading] = React.useState<"submit" | "lock" | null>(null)

    const [notes, setNotes] = React.useState("")

    const loadDetails = React.useCallback(async () => {
        if (!id) return
        setLoading(true)
        setError(null)

        try {
            const [itemRes, scoreRes] = await Promise.all([
                fetch(`/api/evaluations/${id}`, { cache: "no-store" }),
                fetch(`/api/evaluation-scores?evaluation_id=${encodeURIComponent(id)}`, { cache: "no-store" })
                    .catch(() => null),
            ])

            const itemPayload = (await itemRes.json().catch(() => null)) as unknown
            if (!itemRes.ok) {
                const msg = await readErrorMessage(itemRes, itemPayload)
                setError(msg)
                setItem(null)
                setScores([])
                setLoading(false)
                return
            }

            const parsedItem = normalizeEvaluation(extractItemPayload(itemPayload))
            if (!parsedItem) {
                setError("Evaluation response is invalid.")
                setItem(null)
                setScores([])
                setLoading(false)
                return
            }

            setItem(parsedItem)

            if (scoreRes) {
                const scorePayload = (await scoreRes.json().catch(() => null)) as unknown
                if (scoreRes.ok) {
                    const parsedScores = extractArrayPayload(scorePayload)
                        .map(normalizeScore)
                        .filter((s): s is EvaluationScoreItem => s !== null)
                    setScores(parsedScores)
                } else {
                    setScores([])
                }
            } else {
                setScores([])
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to load evaluation.")
            setItem(null)
            setScores([])
        }

        setLoading(false)
    }, [id])

    React.useEffect(() => {
        void loadDetails()
    }, [loadDetails])

    const patchStatus = React.useCallback(
        async (mode: "submit" | "lock") => {
            if (!id) return
            setActionLoading(mode)
            setError(null)

            try {
                const endpoint = mode === "submit" ? `/api/evaluations/${id}/submit` : `/api/evaluations/${id}/lock`
                const res = await fetch(endpoint, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    const msg = await readErrorMessage(res, payload)
                    setError(msg)
                    setActionLoading(null)
                    return
                }

                await loadDetails()
            } catch (err) {
                setError(err instanceof Error ? err.message : "Unable to update evaluation.")
            }

            setActionLoading(null)
        },
        [id, loadDetails],
    )

    return (
        <DashboardLayout
            title="Evaluation Details"
            description="Review this evaluation and perform allowed status actions."
        >
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/dashboard/panelist/evaluations">Back to Evaluations</Link>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
                        Refresh Page State
                    </Button>
                </div>

                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>Action failed</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                {loading ? (
                    <Card>
                        <CardContent className="pt-6">
                            <div className="h-24 animate-pulse rounded-md bg-muted/50" />
                        </CardContent>
                    </Card>
                ) : !item ? (
                    <Alert>
                        <AlertTitle>Evaluation not found</AlertTitle>
                        <AlertDescription>We couldn't locate this evaluation record.</AlertDescription>
                    </Alert>
                ) : (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex flex-wrap items-center gap-2">
                                    <span>{item.id}</span>
                                    <Badge variant={statusVariant(item.status)}>
                                        {toTitleCase(item.status)}
                                    </Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    <Card>
                                        <CardContent className="pt-4">
                                            <p className="text-xs text-muted-foreground">Schedule ID</p>
                                            <p className="font-medium">{item.schedule_id}</p>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-4">
                                            <p className="text-xs text-muted-foreground">Evaluator ID</p>
                                            <p className="font-medium">{item.evaluator_id}</p>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-4">
                                            <p className="text-xs text-muted-foreground">Created</p>
                                            <p className="font-medium">
                                                {item.created_at ? formatDateTime(item.created_at) : "—"}
                                            </p>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-4">
                                            <p className="text-xs text-muted-foreground">Submitted</p>
                                            <p className="font-medium">
                                                {item.submitted_at ? formatDateTime(item.submitted_at) : "—"}
                                            </p>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-4">
                                            <p className="text-xs text-muted-foreground">Locked</p>
                                            <p className="font-medium">
                                                {item.locked_at ? formatDateTime(item.locked_at) : "—"}
                                            </p>
                                        </CardContent>
                                    </Card>
                                </div>

                                <Separator />

                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        onClick={() => void patchStatus("submit")}
                                        disabled={actionLoading !== null || item.status.toLowerCase() !== "pending"}
                                    >
                                        {actionLoading === "submit" ? "Submitting..." : "Submit Evaluation"}
                                    </Button>

                                    <Button
                                        variant="destructive"
                                        onClick={() => void patchStatus("lock")}
                                        disabled={actionLoading !== null || item.status.toLowerCase() === "locked"}
                                    >
                                        {actionLoading === "lock" ? "Locking..." : "Lock Evaluation"}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Criteria Notes</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Use this field for draft notes while reviewing (not persisted)."
                                    className="min-h-28"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Local note helper only. This is not submitted to the API.
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Evaluation Scores</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {scores.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        No score rows found for this evaluation.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {scores.map((score) => (
                                            <Card key={score.criterion_id}>
                                                <CardContent className="pt-4">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div>
                                                            <p className="text-xs text-muted-foreground">
                                                                Criterion ID
                                                            </p>
                                                            <p className="font-medium">{score.criterion_id}</p>
                                                        </div>
                                                        <Badge variant="outline">
                                                            Score: {score.score ?? "—"}
                                                        </Badge>
                                                    </div>
                                                    {score.comment ? (
                                                        <p className="mt-3 text-sm text-muted-foreground">
                                                            {score.comment}
                                                        </p>
                                                    ) : null}
                                                </CardContent>
                                            </Card>
                                        ))}
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
