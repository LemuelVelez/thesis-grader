"use client"

import * as React from "react"
import { toast } from "sonner"
import {
    ClipboardList,
    Copy,
    RefreshCcw,
    Send,
    ShieldCheck,
    FileJson2,
    LayoutTemplate,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type RatingScale = {
    min: number
    max: number
    minLabel?: string
    maxLabel?: string
}

type FeedbackQuestion = {
    id: string
    type: "rating" | "text" | (string & {})
    label: string
    required?: boolean
    placeholder?: string
    maxLength?: number
    scale?: RatingScale
}

type FeedbackSection = {
    id: string
    title: string
    questions: FeedbackQuestion[]
}

type StudentFeedbackSchema = {
    version: number
    key: string
    title: string
    description?: string
    sections: FeedbackSection[]
}

type AssignResult = {
    scheduleId: string
    groupId: string
    message?: string
    counts?: {
        targeted: number
        created: number
        updated: number
        existing: number
    }
    targetedStudentIds?: string[]
}

type StudentInfo = {
    id: string
    name: string | null
    email: string | null
    program: string | null
    section: string | null
}

type FeedbackRow = {
    id: string
    schedule_id: string
    student_id: string
    status: string
    submitted_at: string | null
    locked_at: string | null
    updated_at: string | null
    created_at: string | null
    student?: StudentInfo
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

async function readJsonRecord(res: Response): Promise<Record<string, unknown>> {
    try {
        const data = (await res.json()) as unknown
        return isRecord(data) ? data : {}
    } catch {
        return {}
    }
}

async function readErrorMessage(res: Response): Promise<string> {
    const data = await readJsonRecord(res)
    const error = typeof data.error === "string" ? data.error : null
    const message = typeof data.message === "string" ? data.message : null
    return error || message || `Request failed (${res.status})`
}

function safeString(value: unknown): string {
    return typeof value === "string" ? value : ""
}

function toNumber(value: unknown, fallback = 0) {
    const n = typeof value === "number" ? value : Number(value)
    return Number.isFinite(n) ? n : fallback
}

function formatDateTime(value: string | null | undefined) {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function normalizeSchema(value: unknown): StudentFeedbackSchema | null {
    if (!isRecord(value)) return null

    const version = toNumber(value.version, 1)
    const key = safeString(value.key)
    const title = safeString(value.title)
    const description = typeof value.description === "string" ? value.description : ""

    const sectionsRaw = Array.isArray(value.sections) ? value.sections : []
    const sections: FeedbackSection[] = sectionsRaw
        .map((s) => {
            if (!isRecord(s)) return null
            const id = safeString(s.id)
            const sTitle = safeString(s.title)
            const questionsRaw = Array.isArray(s.questions) ? s.questions : []
            const questions: FeedbackQuestion[] = questionsRaw
                .map((q) => {
                    if (!isRecord(q)) return null
                    const qid = safeString(q.id)
                    const type = safeString(q.type) as FeedbackQuestion["type"]
                    const label = safeString(q.label)
                    if (!qid || !label) return null

                    const required = typeof q.required === "boolean" ? q.required : false
                    const placeholder = typeof q.placeholder === "string" ? q.placeholder : undefined
                    const maxLength = typeof q.maxLength === "number" ? q.maxLength : undefined

                    let scale: RatingScale | undefined
                    if (isRecord(q.scale)) {
                        const min = toNumber(q.scale.min, 1)
                        const max = toNumber(q.scale.max, 5)
                        const minLabel = typeof q.scale.minLabel === "string" ? q.scale.minLabel : undefined
                        const maxLabel = typeof q.scale.maxLabel === "string" ? q.scale.maxLabel : undefined
                        scale = { min, max, minLabel, maxLabel }
                    }

                    return {
                        id: qid,
                        type: type || "text",
                        label,
                        required,
                        placeholder,
                        maxLength,
                        scale,
                    }
                })
                .filter((x): x is FeedbackQuestion => x !== null)

            if (!id || !sTitle) return null
            return { id, title: sTitle, questions }
        })
        .filter((x): x is FeedbackSection => x !== null)

    if (!key || !title || sections.length === 0) return null
    return {
        version: Math.max(1, Math.floor(version)),
        key,
        title,
        description,
        sections,
    }
}

function getFallbackSchema(): StudentFeedbackSchema {
    return {
        version: 1,
        key: "student-feedback-v1",
        title: "Student Feedback Form",
        description: "Your feedback helps improve the thesis defense experience. Please answer honestly.",
        sections: [
            {
                id: "overall",
                title: "Overall Experience",
                questions: [
                    {
                        id: "overall_satisfaction",
                        type: "rating",
                        label: "Overall satisfaction with the defense process",
                        scale: { min: 1, max: 5, minLabel: "Poor", maxLabel: "Excellent" },
                        required: true,
                    },
                    {
                        id: "schedule_clarity",
                        type: "rating",
                        label: "Clarity of schedule, venue, and instructions",
                        scale: { min: 1, max: 5, minLabel: "Unclear", maxLabel: "Very clear" },
                        required: true,
                    },
                    {
                        id: "time_management",
                        type: "rating",
                        label: "Time management during the defense",
                        scale: { min: 1, max: 5, minLabel: "Poor", maxLabel: "Excellent" },
                        required: true,
                    },
                ],
            },
            {
                id: "panel",
                title: "Panel & Feedback Quality",
                questions: [
                    {
                        id: "feedback_helpfulness",
                        type: "rating",
                        label: "Helpfulness of panel feedback",
                        scale: { min: 1, max: 5, minLabel: "Not helpful", maxLabel: "Very helpful" },
                        required: true,
                    },
                    {
                        id: "feedback_fairness",
                        type: "rating",
                        label: "Fairness and professionalism of evaluation",
                        scale: { min: 1, max: 5, minLabel: "Unfair", maxLabel: "Very fair" },
                        required: true,
                    },
                    {
                        id: "feedback_clarity",
                        type: "rating",
                        label: "Clarity of comments and recommendations",
                        scale: { min: 1, max: 5, minLabel: "Unclear", maxLabel: "Very clear" },
                        required: true,
                    },
                ],
            },
            {
                id: "open_ended",
                title: "Suggestions",
                questions: [
                    {
                        id: "what_went_well",
                        type: "text",
                        label: "What went well during the defense?",
                        placeholder: "Share what worked best...",
                        required: false,
                        maxLength: 1000,
                    },
                    {
                        id: "what_to_improve",
                        type: "text",
                        label: "What should be improved?",
                        placeholder: "Share suggestions...",
                        required: false,
                        maxLength: 1000,
                    },
                ],
            },
        ],
    }
}

function statusBadgeVariant(status: string): { label: string; className: string } {
    const s = String(status || "").toLowerCase()
    if (s === "submitted") {
        return { label: "Submitted", className: "border-primary/40 bg-primary/10 text-foreground" }
    }
    if (s === "locked") {
        return { label: "Locked", className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" }
    }
    if (s === "pending") {
        return { label: "Pending", className: "border-muted-foreground/30 bg-muted text-muted-foreground" }
    }
    return { label: status || "Unknown", className: "border-muted-foreground/30 bg-muted text-muted-foreground" }
}

function parseStudentIds(input: string): string[] {
    const raw = input
        .split(/[\n,]+/g)
        .map((x) => x.trim())
        .filter(Boolean)

    const seen = new Set<string>()
    const out: string[] = []
    for (const id of raw) {
        const key = id.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(id)
    }
    return out
}

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text)
        toast.success("Copied to clipboard.")
    } catch {
        toast.error("Failed to copy. Please copy manually.")
    }
}

export default function AdminFeedbackFormPage() {
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [schema, setSchema] = React.useState<StudentFeedbackSchema>(getFallbackSchema())
    const [schemaJson, setSchemaJson] = React.useState<string>(JSON.stringify(getFallbackSchema(), null, 2))
    const [schemaJsonError, setSchemaJsonError] = React.useState<string | null>(null)

    const [scheduleId, setScheduleId] = React.useState("")
    const [studentIdsText, setStudentIdsText] = React.useState("")
    const [overwritePending, setOverwritePending] = React.useState(false)

    const [assigning, setAssigning] = React.useState(false)
    const [assignResult, setAssignResult] = React.useState<AssignResult | null>(null)

    const [listing, setListing] = React.useState(false)
    const [rows, setRows] = React.useState<FeedbackRow[]>([])
    const [rowsError, setRowsError] = React.useState<string | null>(null)

    const totalQuestions = React.useMemo(() => {
        return schema.sections.reduce((sum, s) => sum + (s.questions?.length ?? 0), 0)
    }, [schema.sections])

    const loadSchema = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        setSchemaJsonError(null)

        try {
            const res = await fetch("/api/admin/student-feedback/schema", { cache: "no-store" })
            const data = await readJsonRecord(res)

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const item = data.item ?? data.schema ?? data
            const normalized = normalizeSchema(item)

            if (!normalized) {
                throw new Error("Schema payload is invalid.")
            }

            setSchema(normalized)
            setSchemaJson(JSON.stringify(normalized, null, 2))
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load feedback form schema."
            setError(message)
            toast.error(message)

            const fallback = getFallbackSchema()
            setSchema(fallback)
            setSchemaJson(JSON.stringify(fallback, null, 2))
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void loadSchema()
    }, [loadSchema])

    const resetToDefault = React.useCallback(() => {
        const fallback = getFallbackSchema()
        setSchema(fallback)
        setSchemaJson(JSON.stringify(fallback, null, 2))
        setSchemaJsonError(null)
        toast.success("Reset to default template.")
    }, [])

    const applyJsonToPreview = React.useCallback(() => {
        setSchemaJsonError(null)
        try {
            const parsed = JSON.parse(schemaJson) as unknown
            const normalized = normalizeSchema(parsed)
            if (!normalized) {
                setSchemaJsonError("Invalid schema shape. Please check required fields (key, title, sections, questions).")
                toast.error("Invalid schema JSON.")
                return
            }
            setSchema(normalized)
            setSchemaJson(JSON.stringify(normalized, null, 2))
            toast.success("Preview updated from JSON.")
        } catch {
            setSchemaJsonError("Invalid JSON format. Please fix JSON syntax.")
            toast.error("Invalid JSON format.")
        }
    }, [schemaJson])

    const assignForms = React.useCallback(async () => {
        const sid = scheduleId.trim()
        if (!sid) {
            toast.error("Schedule ID is required.")
            return
        }

        setAssigning(true)
        setAssignResult(null)
        setRows([])
        setRowsError(null)

        try {
            const studentIds = parseStudentIds(studentIdsText)
            const body: Record<string, unknown> = {
                overwritePending,
            }
            if (studentIds.length > 0) body.studentIds = studentIds

            const res = await fetch(`/api/admin/student-feedback/schedule/${encodeURIComponent(sid)}/assign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            })

            const data = await readJsonRecord(res)
            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const result: AssignResult = {
                scheduleId: safeString(data.scheduleId ?? data.schedule_id ?? sid),
                groupId: safeString(data.groupId ?? data.group_id ?? ""),
                message: typeof data.message === "string" ? data.message : undefined,
                counts: isRecord(data.counts)
                    ? {
                        targeted: toNumber(data.counts.targeted, 0),
                        created: toNumber(data.counts.created, 0),
                        updated: toNumber(data.counts.updated, 0),
                        existing: toNumber(data.counts.existing, 0),
                    }
                    : undefined,
                targetedStudentIds: Array.isArray(data.targetedStudentIds) ? (data.targetedStudentIds as string[]) : undefined,
            }

            setAssignResult(result)

            const created = result.counts?.created ?? 0
            const updated = result.counts?.updated ?? 0
            const existing = result.counts?.existing ?? 0

            toast.success(
                result.message ||
                `Assigned feedback forms. Created: ${created}, Updated: ${updated}, Existing: ${existing}.`,
            )
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to assign feedback forms."
            toast.error(message)
        } finally {
            setAssigning(false)
        }
    }, [overwritePending, scheduleId, studentIdsText])

    const loadAssignedForSchedule = React.useCallback(async () => {
        const sid = scheduleId.trim()
        if (!sid) {
            toast.error("Schedule ID is required.")
            return
        }

        setListing(true)
        setRows([])
        setRowsError(null)

        try {
            const res = await fetch(`/api/admin/student-feedback/schedule/${encodeURIComponent(sid)}`, {
                cache: "no-store",
            })

            const data = await readJsonRecord(res)
            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const itemsRaw = Array.isArray(data.items) ? data.items : []
            const normalized: FeedbackRow[] = itemsRaw
                .map((r) => {
                    if (!isRecord(r)) return null
                    const id = safeString(r.id)
                    const schedule_id = safeString(r.schedule_id ?? data.scheduleId ?? sid)
                    const student_id = safeString(r.student_id)
                    const status = safeString(r.status || "pending")

                    const student = isRecord(r.student)
                        ? {
                            id: safeString(r.student.id ?? student_id),
                            name: typeof r.student.name === "string" ? r.student.name : null,
                            email: typeof r.student.email === "string" ? r.student.email : null,
                            program: typeof r.student.program === "string" ? r.student.program : null,
                            section: typeof r.student.section === "string" ? r.student.section : null,
                        }
                        : undefined

                    if (!id || !schedule_id || !student_id) return null

                    return {
                        id,
                        schedule_id,
                        student_id,
                        status,
                        submitted_at: typeof r.submitted_at === "string" ? r.submitted_at : null,
                        locked_at: typeof r.locked_at === "string" ? r.locked_at : null,
                        updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
                        created_at: typeof r.created_at === "string" ? r.created_at : null,
                        student,
                    }
                })
                .filter((x): x is FeedbackRow => x !== null)

            setRows(normalized)
            toast.success(`Loaded ${normalized.length} feedback row(s).`)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load assigned feedback forms."
            setRowsError(message)
            toast.error(message)
        } finally {
            setListing(false)
        }
    }, [scheduleId])

    return (
        <DashboardLayout
            title="Student Feedback Form Template"
            description="Preview the feedback template, copy JSON, and assign feedback forms to a defense schedule."
        >
            <div className="space-y-4">
                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                <Tabs defaultValue="template">
                    <TabsList className="flex w-full flex-wrap justify-start gap-2">
                        <TabsTrigger value="template" className="gap-2">
                            <LayoutTemplate className="h-4 w-4" />
                            Template Preview
                        </TabsTrigger>
                        <TabsTrigger value="json" className="gap-2">
                            <FileJson2 className="h-4 w-4" />
                            JSON Editor
                        </TabsTrigger>
                        <TabsTrigger value="assign" className="gap-2">
                            <Send className="h-4 w-4" />
                            Assign to Schedule
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="template" className="mt-4 space-y-4">
                        <Card>
                            <CardHeader className="space-y-1">
                                <CardTitle className="flex flex-wrap items-center gap-2">
                                    <span>{schema.title}</span>
                                    <Badge variant="outline" className="gap-1">
                                        <ShieldCheck className="h-3.5 w-3.5" />
                                        v{schema.version}
                                    </Badge>
                                    <Badge variant="secondary" className="gap-1">
                                        <ClipboardList className="h-3.5 w-3.5" />
                                        {schema.sections.length} section(s)
                                    </Badge>
                                    <Badge variant="secondary">{totalQuestions} question(s)</Badge>
                                </CardTitle>
                                {schema.description ? (
                                    <CardDescription className="max-w-3xl">{schema.description}</CardDescription>
                                ) : null}
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => void loadSchema()}
                                        disabled={loading}
                                        className="gap-2"
                                    >
                                        <RefreshCcw className="h-4 w-4" />
                                        {loading ? "Loading..." : "Reload from API"}
                                    </Button>

                                    <Button
                                        variant="outline"
                                        onClick={() => void copyText(JSON.stringify(schema, null, 2))}
                                        className="gap-2"
                                    >
                                        <Copy className="h-4 w-4" />
                                        Copy JSON
                                    </Button>

                                    <Button variant="outline" onClick={resetToDefault}>
                                        Reset to default
                                    </Button>
                                </div>

                                <Separator />

                                <div className="space-y-3">
                                    {loading ? (
                                        <div className="space-y-2">
                                            <div className="h-10 w-full animate-pulse rounded-md bg-muted/50" />
                                            <div className="h-10 w-full animate-pulse rounded-md bg-muted/50" />
                                            <div className="h-10 w-full animate-pulse rounded-md bg-muted/50" />
                                        </div>
                                    ) : (
                                        schema.sections.map((section, sIdx) => (
                                            <Card key={section.id} className="border-muted/60">
                                                <CardHeader className="pb-3">
                                                    <CardTitle className="text-base">
                                                        {sIdx + 1}. {section.title}
                                                    </CardTitle>
                                                    <CardDescription>
                                                        {section.questions.length} question(s) in this section
                                                    </CardDescription>
                                                </CardHeader>
                                                <CardContent className="space-y-3">
                                                    {section.questions.map((q, qIdx) => {
                                                        const required = !!q.required
                                                        return (
                                                            <div
                                                                key={q.id}
                                                                className="rounded-lg border bg-card p-3"
                                                            >
                                                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                                                    <div className="min-w-0">
                                                                        <p className="text-sm font-medium">
                                                                            {sIdx + 1}.{qIdx + 1} {q.label}
                                                                        </p>
                                                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                                                            <Badge variant="outline" className="capitalize">
                                                                                {q.type}
                                                                            </Badge>
                                                                            {required ? (
                                                                                <Badge className="bg-destructive text-destructive-foreground">
                                                                                    Required
                                                                                </Badge>
                                                                            ) : (
                                                                                <Badge variant="secondary">Optional</Badge>
                                                                            )}
                                                                            <Badge variant="secondary" className="font-mono">
                                                                                {q.id}
                                                                            </Badge>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        {q.type === "rating" && q.scale ? (
                                                                            <Badge variant="secondary">
                                                                                Scale: {q.scale.min}–{q.scale.max}
                                                                            </Badge>
                                                                        ) : null}
                                                                        {q.type === "text" && typeof q.maxLength === "number" ? (
                                                                            <Badge variant="secondary">Max {q.maxLength} chars</Badge>
                                                                        ) : null}
                                                                    </div>
                                                                </div>

                                                                {q.type === "rating" && q.scale ? (
                                                                    <div className="mt-3 rounded-md border bg-muted/20 p-3">
                                                                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                                                            <span>{q.scale.minLabel ?? "Low"}</span>
                                                                            <span>{q.scale.maxLabel ?? "High"}</span>
                                                                        </div>
                                                                        <div className="mt-2 grid grid-cols-5 gap-2">
                                                                            {Array.from({ length: q.scale.max - q.scale.min + 1 }).map((_, i) => (
                                                                                <div
                                                                                    key={`${q.id}-rating-${i}`}
                                                                                    className="flex h-9 items-center justify-center rounded-md border bg-card text-sm font-medium"
                                                                                >
                                                                                    {q.scale!.min + i}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                ) : null}

                                                                {q.type === "text" ? (
                                                                    <div className="mt-3">
                                                                        <Label className="text-xs text-muted-foreground">Preview</Label>
                                                                        <Textarea
                                                                            className="mt-2"
                                                                            placeholder={q.placeholder ?? "Type your answer..."}
                                                                            value=""
                                                                            readOnly
                                                                        />
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        )
                                                    })}
                                                </CardContent>
                                            </Card>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="json" className="mt-4 space-y-4">
                        <Card>
                            <CardHeader className="space-y-1">
                                <CardTitle>JSON Template Editor</CardTitle>
                                <CardDescription>
                                    Paste/edit the schema JSON and apply it to the preview. (This edits preview only.)
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button onClick={applyJsonToPreview} className="gap-2">
                                        <LayoutTemplate className="h-4 w-4" />
                                        Apply to Preview
                                    </Button>
                                    <Button variant="outline" onClick={() => void copyText(schemaJson)} className="gap-2">
                                        <Copy className="h-4 w-4" />
                                        Copy JSON
                                    </Button>
                                    <Button variant="outline" onClick={resetToDefault}>
                                        Reset to default
                                    </Button>
                                </div>

                                {schemaJsonError ? (
                                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                                        {schemaJsonError}
                                    </div>
                                ) : null}

                                <Textarea
                                    value={schemaJson}
                                    onChange={(e) => {
                                        setSchemaJson(e.target.value)
                                        if (schemaJsonError) setSchemaJsonError(null)
                                    }}
                                    className="min-h-105 font-mono text-xs leading-5"
                                    spellCheck={false}
                                />

                                <p className="text-xs text-muted-foreground">
                                    Tip: Keep IDs stable (section/question IDs) to avoid breaking downstream analytics.
                                </p>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="assign" className="mt-4 space-y-4">
                        <Card>
                            <CardHeader className="space-y-1">
                                <CardTitle>Assign Feedback Forms</CardTitle>
                                <CardDescription>
                                    Create (or optionally reset) feedback rows for students in a defense schedule.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Defense Schedule ID</Label>
                                        <Input
                                            placeholder="Paste schedule UUID..."
                                            value={scheduleId}
                                            onChange={(e) => setScheduleId(e.target.value)}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Use the schedule ID from your Defense Schedules page.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Overwrite pending rows</Label>
                                        <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium">Reset pending answers</p>
                                                <p className="text-xs text-muted-foreground">
                                                    When enabled, pending rows can be reset to the seed template. Submitted/locked are never overwritten.
                                                </p>
                                            </div>
                                            <Switch checked={overwritePending} onCheckedChange={setOverwritePending} />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Optional: Target specific Student IDs</Label>
                                    <Textarea
                                        value={studentIdsText}
                                        onChange={(e) => setStudentIdsText(e.target.value)}
                                        placeholder="Paste student UUIDs (comma or newline separated). Leave blank to auto-detect group members."
                                        className="min-h-24"
                                    />
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <Button onClick={() => void assignForms()} disabled={assigning} className="gap-2">
                                        <Send className="h-4 w-4" />
                                        {assigning ? "Assigning..." : "Assign forms"}
                                    </Button>

                                    <Button
                                        variant="outline"
                                        onClick={() => void loadAssignedForSchedule()}
                                        disabled={listing}
                                        className="gap-2"
                                    >
                                        <RefreshCcw className="h-4 w-4" />
                                        {listing ? "Loading..." : "Load assigned list"}
                                    </Button>

                                    <Button
                                        variant="outline"
                                        onClick={() => void copyText(JSON.stringify(schema, null, 2))}
                                        className="gap-2"
                                    >
                                        <Copy className="h-4 w-4" />
                                        Copy template JSON
                                    </Button>
                                </div>

                                {assignResult ? (
                                    <div className="rounded-lg border bg-muted/20 p-3">
                                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                            <div className="space-y-1">
                                                <p className="text-sm font-medium">Latest assignment</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Schedule: <span className="font-mono">{assignResult.scheduleId}</span>{" "}
                                                    {assignResult.groupId ? (
                                                        <>
                                                            · Group: <span className="font-mono">{assignResult.groupId}</span>
                                                        </>
                                                    ) : null}
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge variant="secondary">
                                                    Targeted: {assignResult.counts?.targeted ?? 0}
                                                </Badge>
                                                <Badge variant="secondary">
                                                    Created: {assignResult.counts?.created ?? 0}
                                                </Badge>
                                                <Badge variant="secondary">
                                                    Updated: {assignResult.counts?.updated ?? 0}
                                                </Badge>
                                                <Badge variant="secondary">
                                                    Existing: {assignResult.counts?.existing ?? 0}
                                                </Badge>
                                            </div>
                                        </div>

                                        {assignResult.message ? (
                                            <p className="mt-2 text-sm text-muted-foreground">{assignResult.message}</p>
                                        ) : null}
                                    </div>
                                ) : null}

                                {rowsError ? (
                                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                                        {rowsError}
                                    </div>
                                ) : null}

                                <div className="overflow-x-auto rounded-lg border bg-card">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="min-w-60">Student</TableHead>
                                                <TableHead className="min-w-44">Program / Section</TableHead>
                                                <TableHead className="min-w-28">Status</TableHead>
                                                <TableHead className="min-w-52">Submitted</TableHead>
                                                <TableHead className="min-w-52">Updated</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {listing ? (
                                                Array.from({ length: 6 }).map((_, i) => (
                                                    <TableRow key={`sk-${i}`}>
                                                        <TableCell colSpan={5}>
                                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : rows.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                                                        No rows loaded yet. Use “Load assigned list” after entering a Schedule ID.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                rows.map((r) => {
                                                    const badge = statusBadgeVariant(r.status)
                                                    const name = r.student?.name ?? "—"
                                                    const email = r.student?.email ?? "—"
                                                    const program = r.student?.program ?? "—"
                                                    const section = r.student?.section ?? "—"

                                                    return (
                                                        <TableRow key={r.id}>
                                                            <TableCell>
                                                                <div className="flex flex-col">
                                                                    <span className="font-medium">{name}</span>
                                                                    <span className="text-xs text-muted-foreground">{email}</span>
                                                                    <span className="mt-1 text-xs text-muted-foreground font-mono">
                                                                        {r.student_id}
                                                                    </span>
                                                                </div>
                                                            </TableCell>

                                                            <TableCell>
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm">{program}</span>
                                                                    <span className="text-xs text-muted-foreground">{section}</span>
                                                                </div>
                                                            </TableCell>

                                                            <TableCell>
                                                                <span
                                                                    className={[
                                                                        "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                                        badge.className,
                                                                    ].join(" ")}
                                                                >
                                                                    {badge.label}
                                                                </span>
                                                            </TableCell>

                                                            <TableCell className="text-muted-foreground">
                                                                {formatDateTime(r.submitted_at)}
                                                            </TableCell>

                                                            <TableCell className="text-muted-foreground">
                                                                {formatDateTime(r.updated_at)}
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>

                                <p className="text-xs text-muted-foreground">
                                    Note: Assignment is safe by default—submitted/locked responses are never overwritten.
                                </p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    )
}
