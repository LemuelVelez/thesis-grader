"use client"

import * as React from "react"
import { toast } from "sonner"
import {
    ClipboardList,
    Copy,
    Download,
    GripVertical,
    LayoutTemplate,
    MoreVertical,
    Plus,
    Save,
    ShieldCheck,
    Trash2,
    CopyPlus,
    Pencil,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

/* --------------------------------- TYPES --------------------------------- */

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
    required: boolean
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

type FeedbackTemplate = {
    id: string
    name: string
    schema: StudentFeedbackSchema
    createdAt: string
    updatedAt: string
    isDefault?: boolean
}

/* --------------------------------- UTILS --------------------------------- */

const LOCAL_KEY = "thesis-grader:feedback-templates:v1"
const DEFAULT_TEMPLATE_ID = "default"

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

function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

function nowIso() {
    return new Date().toISOString()
}

function makeId(prefix: string) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = (globalThis as any)?.crypto
        if (c?.randomUUID) return `${prefix}_${c.randomUUID()}`
    } catch {
        // ignore
    }
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
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

                    const placeholderRaw = typeof q.placeholder === "string" ? q.placeholder.trim() : ""
                    const placeholder = placeholderRaw.length > 0 ? placeholderRaw : undefined

                    const maxLength =
                        typeof q.maxLength === "number" && Number.isFinite(q.maxLength) ? q.maxLength : undefined

                    let scale: RatingScale | undefined
                    if (isRecord(q.scale)) {
                        const min = toNumber(q.scale.min, 1)
                        const max = toNumber(q.scale.max, 5)
                        const minLabel = typeof q.scale.minLabel === "string" ? q.scale.minLabel : undefined
                        const maxLabel = typeof q.scale.maxLabel === "string" ? q.scale.maxLabel : undefined
                        scale = { min, max, minLabel, maxLabel }
                    }

                    const out: FeedbackQuestion = {
                        id: qid,
                        type: (type || "text") as FeedbackQuestion["type"],
                        label,
                        required,
                    }

                    if (placeholder) out.placeholder = placeholder
                    if (typeof maxLength === "number") out.maxLength = maxLength
                    if (scale) out.scale = scale

                    return out
                })
                .filter((x): x is FeedbackQuestion => x !== null)

            if (!id || !sTitle) return null
            return { id, title: sTitle, questions }
        })
        .filter((x): x is FeedbackSection => x !== null)

    if (!key || !title || sections.length === 0) return null

    const out: StudentFeedbackSchema = {
        version: Math.max(1, Math.floor(version)),
        key,
        title,
        sections,
    }
    if (description.trim().length > 0) out.description = description.trim()
    return out
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
                        id: "notification_timeliness",
                        type: "rating",
                        label: "Timeliness of announcements and notifications (schedule updates, room changes, etc.)",
                        scale: { min: 1, max: 5, minLabel: "Late", maxLabel: "On time" },
                        required: true,
                    },
                    {
                        id: "time_management",
                        type: "rating",
                        label: "Time management during the defense (start/end, pacing, Q&A time)",
                        scale: { min: 1, max: 5, minLabel: "Poor", maxLabel: "Excellent" },
                        required: true,
                    },
                    {
                        id: "venue_comfort",
                        type: "rating",
                        label: "Comfort and suitability of the venue for presenting",
                        scale: { min: 1, max: 5, minLabel: "Poor", maxLabel: "Excellent" },
                        required: false,
                    },
                ],
            },
            {
                id: "preparation",
                title: "Preparation & Support",
                questions: [
                    {
                        id: "rubric_clarity",
                        type: "rating",
                        label: "Clarity of rubric/criteria shared before the defense",
                        scale: { min: 1, max: 5, minLabel: "Unclear", maxLabel: "Very clear" },
                        required: true,
                    },
                    {
                        id: "adviser_support",
                        type: "rating",
                        label: "Support from adviser prior to the defense",
                        scale: { min: 1, max: 5, minLabel: "Low", maxLabel: "High" },
                        required: false,
                    },
                    {
                        id: "staff_support",
                        type: "rating",
                        label: "Support from staff/office in preparing requirements (documents, forms, venue guidance)",
                        scale: { min: 1, max: 5, minLabel: "Low", maxLabel: "High" },
                        required: false,
                    },
                    {
                        id: "prep_time_sufficiency",
                        type: "rating",
                        label: "Sufficiency of time to prepare after schedule was announced",
                        scale: { min: 1, max: 5, minLabel: "Not enough", maxLabel: "Enough" },
                        required: false,
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
                    {
                        id: "qa_opportunity",
                        type: "rating",
                        label: "Opportunity to answer questions and clarify points",
                        scale: { min: 1, max: 5, minLabel: "Too little", maxLabel: "Enough" },
                        required: false,
                    },
                    {
                        id: "respectful_environment",
                        type: "rating",
                        label: "Respectful and supportive environment during the defense",
                        scale: { min: 1, max: 5, minLabel: "Not respectful", maxLabel: "Very respectful" },
                        required: true,
                    },
                ],
            },
            {
                id: "facilities",
                title: "Facilities & Logistics",
                questions: [
                    {
                        id: "venue_readiness",
                        type: "rating",
                        label: "Venue readiness (room, equipment, setup)",
                        scale: { min: 1, max: 5, minLabel: "Poor", maxLabel: "Excellent" },
                        required: true,
                    },
                    {
                        id: "audio_visual",
                        type: "rating",
                        label: "Audio/visual support and presentation setup",
                        scale: { min: 1, max: 5, minLabel: "Poor", maxLabel: "Excellent" },
                        required: true,
                    },
                    {
                        id: "technical_support",
                        type: "rating",
                        label: "Technical support availability when issues occur (projector, audio, files, connectivity)",
                        scale: { min: 1, max: 5, minLabel: "Not available", maxLabel: "Very available" },
                        required: false,
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
                        id: "most_helpful_feedback",
                        type: "text",
                        label: "What was the most helpful feedback you received?",
                        placeholder: "Share the most useful comment/recommendation...",
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
                    {
                        id: "other_comments",
                        type: "text",
                        label: "Other comments",
                        placeholder: "Anything else you want to add...",
                        required: false,
                        maxLength: 1000,
                    },
                ],
            },
        ],
    }
}

function loadLocalTemplates(): FeedbackTemplate[] {
    try {
        const raw = localStorage.getItem(LOCAL_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) return []

        const out: FeedbackTemplate[] = []
        for (const item of parsed) {
            if (!isRecord(item)) continue
            const id = safeString(item.id)
            const name = safeString(item.name)
            const createdAt = safeString(item.createdAt)
            const updatedAt = safeString(item.updatedAt)
            const schema = normalizeSchema(item.schema)

            if (!id || !name || !schema) continue
            out.push({
                id,
                name,
                schema,
                createdAt: createdAt || nowIso(),
                updatedAt: updatedAt || nowIso(),
            })
        }
        return out
    } catch {
        return []
    }
}

function saveLocalTemplates(templates: FeedbackTemplate[]) {
    try {
        const safe = templates
            .filter((t) => t.id !== DEFAULT_TEMPLATE_ID)
            .map((t) => ({
                id: t.id,
                name: t.name,
                schema: t.schema,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
            }))
        localStorage.setItem(LOCAL_KEY, JSON.stringify(safe))
    } catch {
        // ignore
    }
}

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text)
        toast.success("Copied to clipboard.")
    } catch {
        toast.error("Failed to copy. Please copy manually.")
    }
}

function downloadJson(filename: string, data: unknown) {
    try {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        toast.success("Exported JSON.")
    } catch {
        toast.error("Failed to export JSON.")
    }
}

function clampInt(n: number, min: number, max: number) {
    if (!Number.isFinite(n)) return min
    return Math.max(min, Math.min(max, Math.floor(n)))
}

function statusPill(isDefault?: boolean) {
    return isDefault
        ? { label: "Default", className: "border-primary/40 bg-primary/10 text-foreground" }
        : { label: "Custom", className: "border-muted-foreground/30 bg-muted text-muted-foreground" }
}

/* --------------------------------- UI HELPERS ----------------------------- */

function SchemaPreview({ schema }: { schema: StudentFeedbackSchema }) {
    const totalQuestions = schema.sections.reduce((sum, s) => sum + (s.questions?.length ?? 0), 0)

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="space-y-1">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 truncate">{schema.title}</span>
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
            </Card>

            <div className="space-y-3">
                {schema.sections.map((section, sIdx) => (
                    <Card key={section.id} className="border-muted/60">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">
                                {sIdx + 1}. {section.title}
                            </CardTitle>
                            <CardDescription>{section.questions.length} question(s) in this section</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {section.questions.map((q, qIdx) => {
                                const scaleCount =
                                    q.type === "rating" && q.scale ? Math.max(0, q.scale.max - q.scale.min + 1) : 0

                                return (
                                    <div key={q.id} className="rounded-lg border bg-card p-3">
                                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium">
                                                    {sIdx + 1}.{qIdx + 1} {q.label}
                                                </p>
                                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                                    <Badge variant="outline" className="capitalize">
                                                        {q.type}
                                                    </Badge>
                                                    {q.required ? (
                                                        <Badge className="bg-destructive text-destructive-foreground">Required</Badge>
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
                                                {q.type === "rating" && scaleCount > 0 ? (
                                                    <Badge variant="secondary">{scaleCount} choices</Badge>
                                                ) : null}
                                            </div>
                                        </div>

                                        {q.type === "rating" && q.scale ? (
                                            <div className="mt-3 rounded-md border bg-muted/20 p-3">
                                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                                    <span>{q.scale.minLabel ?? "Low"}</span>
                                                    <span>{q.scale.maxLabel ?? "High"}</span>
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {Array.from({ length: scaleCount }).map((_, i) => (
                                                        <div
                                                            key={`${q.id}-rating-${i}`}
                                                            className="flex h-9 w-10 items-center justify-center rounded-md border bg-card text-sm font-medium"
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
                ))}
            </div>
        </div>
    )
}

/* --------------------------------- PAGE ---------------------------------- */

export default function AdminFeedbackFormPage() {
    const [loadingDefault, setLoadingDefault] = React.useState(true)
    const [defaultSchema, setDefaultSchema] = React.useState<StudentFeedbackSchema>(getFallbackSchema())

    const [templates, setTemplates] = React.useState<FeedbackTemplate[]>([])
    const [query, setQuery] = React.useState("")
    const [activeId, setActiveId] = React.useState<string>(DEFAULT_TEMPLATE_ID)

    const [draftName, setDraftName] = React.useState<string>("Default template")
    const [draftSchema, setDraftSchema] = React.useState<StudentFeedbackSchema>(getFallbackSchema())
    const [dirty, setDirty] = React.useState(false)

    const [createOpen, setCreateOpen] = React.useState(false)
    const [renameOpen, setRenameOpen] = React.useState(false)
    const [deleteOpen, setDeleteOpen] = React.useState(false)
    const [discardOpen, setDiscardOpen] = React.useState(false)

    const [pendingSwitchId, setPendingSwitchId] = React.useState<string | null>(null)

    const [createName, setCreateName] = React.useState("")
    const [createKey, setCreateKey] = React.useState("")
    const [renameValue, setRenameValue] = React.useState("")

    const activeTemplate = React.useMemo(() => {
        if (activeId === DEFAULT_TEMPLATE_ID) {
            return {
                id: DEFAULT_TEMPLATE_ID,
                name: "Default template",
                schema: defaultSchema,
                createdAt: "",
                updatedAt: "",
                isDefault: true,
            } satisfies FeedbackTemplate
        }
        return templates.find((t) => t.id === activeId) ?? null
    }, [activeId, defaultSchema, templates])

    const filteredTemplates = React.useMemo(() => {
        const q = query.trim().toLowerCase()
        const all: FeedbackTemplate[] = [
            {
                id: DEFAULT_TEMPLATE_ID,
                name: "Default template",
                schema: defaultSchema,
                createdAt: "",
                updatedAt: "",
                isDefault: true,
            },
            ...templates,
        ]
        if (!q) return all
        return all.filter((t) => t.name.toLowerCase().includes(q) || t.schema.title.toLowerCase().includes(q))
    }, [query, templates, defaultSchema])

    const loadDefaultFromApi = React.useCallback(async () => {
        setLoadingDefault(true)
        try {
            const res = await fetch("/api/admin/student-feedback/schema", { cache: "no-store" })
            const data = await readJsonRecord(res)
            if (!res.ok) throw new Error(await readErrorMessage(res))

            const item = data.item ?? data.schema ?? data
            const normalized = normalizeSchema(item)
            if (!normalized) throw new Error("Schema payload is invalid.")

            setDefaultSchema(normalized)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load default feedback template."
            toast.error(message)
            setDefaultSchema(getFallbackSchema())
        } finally {
            setLoadingDefault(false)
        }
    }, [])

    React.useEffect(() => {
        // local templates
        const local = loadLocalTemplates()
        setTemplates(local)

        // default schema
        void loadDefaultFromApi()
    }, [loadDefaultFromApi])

    // Keep draft in sync when active changes (unless dirty with a pending discard flow)
    React.useEffect(() => {
        if (!activeTemplate) return

        setDraftName(activeTemplate.name)
        setDraftSchema(cloneJson(activeTemplate.schema))
        setDirty(false)
    }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

    const requestSwitchTemplate = React.useCallback(
        (id: string) => {
            if (id === activeId) return
            if (!dirty) {
                setActiveId(id)
                return
            }
            setPendingSwitchId(id)
            setDiscardOpen(true)
        },
        [activeId, dirty],
    )

    const confirmDiscardAndSwitch = React.useCallback(() => {
        const nextId = pendingSwitchId
        setDiscardOpen(false)
        setPendingSwitchId(null)
        setDirty(false)
        if (nextId) setActiveId(nextId)
    }, [pendingSwitchId])

    const updateDraftSchema = React.useCallback((updater: (prev: StudentFeedbackSchema) => StudentFeedbackSchema) => {
        setDraftSchema((prev) => {
            const next = updater(prev)
            return next
        })
        setDirty(true)
    }, [])

    const isDefaultActive = activeId === DEFAULT_TEMPLATE_ID
    const canEdit = !isDefaultActive

    const createTemplateFromDefault = React.useCallback(
        (name: string, key?: string) => {
            const cleanName = name.trim()
            if (!cleanName) {
                toast.error("Template name is required.")
                return null
            }

            const base = cloneJson(defaultSchema)
            const id = makeId("fb_tpl")
            const createdAt = nowIso()

            const schema: StudentFeedbackSchema = {
                ...base,
                key: (key?.trim() || base.key || `student-feedback-${id}`).slice(0, 120),
                title: base.title,
            }

            const item: FeedbackTemplate = {
                id,
                name: cleanName,
                schema,
                createdAt,
                updatedAt: createdAt,
                isDefault: false,
            }

            return item
        },
        [defaultSchema],
    )

    const openCreate = React.useCallback(() => {
        setCreateName("")
        setCreateKey("")
        setCreateOpen(true)
    }, [])

    const submitCreate = React.useCallback(() => {
        const created = createTemplateFromDefault(createName, createKey)
        if (!created) return

        setTemplates((prev) => {
            const next = [created, ...prev]
            saveLocalTemplates(next)
            return next
        })

        setCreateOpen(false)
        toast.success("Template created.")
        setActiveId(created.id)
    }, [createKey, createName, createTemplateFromDefault])

    const openRename = React.useCallback(() => {
        if (!activeTemplate || activeTemplate.id === DEFAULT_TEMPLATE_ID) return
        setRenameValue(activeTemplate.name)
        setRenameOpen(true)
    }, [activeTemplate])

    const submitRename = React.useCallback(() => {
        const value = renameValue.trim()
        if (!value) {
            toast.error("Name is required.")
            return
        }
        if (!activeTemplate || activeTemplate.id === DEFAULT_TEMPLATE_ID) return

        setTemplates((prev) => {
            const next = prev.map((t) =>
                t.id === activeTemplate.id ? { ...t, name: value, updatedAt: nowIso() } : t,
            )
            saveLocalTemplates(next)
            return next
        })

        setDraftName(value)
        setDirty(true)
        setRenameOpen(false)
        toast.success("Renamed.")
    }, [activeTemplate, renameValue])

    const openDelete = React.useCallback(() => {
        if (!activeTemplate || activeTemplate.id === DEFAULT_TEMPLATE_ID) return
        setDeleteOpen(true)
    }, [activeTemplate])

    const confirmDelete = React.useCallback(() => {
        if (!activeTemplate || activeTemplate.id === DEFAULT_TEMPLATE_ID) return

        setTemplates((prev) => {
            const next = prev.filter((t) => t.id !== activeTemplate.id)
            saveLocalTemplates(next)
            return next
        })

        setDeleteOpen(false)
        toast.success("Template deleted.")
        setActiveId(DEFAULT_TEMPLATE_ID)
    }, [activeTemplate])

    const duplicateActive = React.useCallback(() => {
        if (!activeTemplate) return
        const baseName = activeTemplate.name === "Default template" ? "New template" : `${activeTemplate.name} (copy)`
        const created = createTemplateFromDefault(baseName, activeTemplate.schema.key)
        if (!created) return

        created.schema = cloneJson(draftSchema)
        created.schema.key = (createKey?.trim() || created.schema.key || created.schema.key).slice(0, 120)

        setTemplates((prev) => {
            const next = [created, ...prev]
            saveLocalTemplates(next)
            return next
        })

        toast.success("Template duplicated.")
        setActiveId(created.id)
    }, [activeTemplate, createKey, createTemplateFromDefault, draftSchema])

    const saveDraft = React.useCallback(() => {
        if (isDefaultActive) {
            toast.error("Default template cannot be edited. Duplicate it first.")
            return
        }

        const normalized = normalizeSchema(draftSchema)
        if (!normalized) {
            toast.error("Template is invalid. Please complete required fields (key, title, sections, questions).")
            return
        }

        if (!draftName.trim()) {
            toast.error("Template name is required.")
            return
        }

        setTemplates((prev) => {
            const now = nowIso()
            const next = prev.map((t) =>
                t.id === activeId
                    ? {
                        ...t,
                        name: draftName.trim(),
                        schema: normalized,
                        updatedAt: now,
                    }
                    : t,
            )
            saveLocalTemplates(next)
            return next
        })

        setDraftSchema(normalized)
        setDirty(false)
        toast.success("Saved changes.")
    }, [activeId, draftName, draftSchema, isDefaultActive])

    const exportActive = React.useCallback(() => {
        if (!activeTemplate) return
        const filenameBase = (draftName || activeTemplate.name || "feedback-template")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60)

        downloadJson(`${filenameBase || "feedback-template"}.json`, {
            name: draftName,
            schema: draftSchema,
            exportedAt: nowIso(),
        })
    }, [activeTemplate, draftName, draftSchema])

    /* ----------------------------- EDITOR ACTIONS ---------------------------- */

    const addSection = React.useCallback(() => {
        if (!canEdit) {
            toast.error("Duplicate the default template to customize.")
            return
        }
        updateDraftSchema((prev) => {
            const next = cloneJson(prev)
            next.sections = [...next.sections]
            next.sections.push({
                id: makeId("section"),
                title: `New Section ${next.sections.length + 1}`,
                questions: [],
            })
            return next
        })
    }, [canEdit, updateDraftSchema])

    const removeSection = React.useCallback(
        (sectionId: string) => {
            if (!canEdit) return
            updateDraftSchema((prev) => {
                const next = cloneJson(prev)
                next.sections = next.sections.filter((s) => s.id !== sectionId)
                if (next.sections.length === 0) {
                    next.sections = [
                        {
                            id: makeId("section"),
                            title: "Section 1",
                            questions: [],
                        },
                    ]
                }
                return next
            })
        },
        [canEdit, updateDraftSchema],
    )

    const moveSection = React.useCallback(
        (sectionId: string, dir: -1 | 1) => {
            if (!canEdit) return
            updateDraftSchema((prev) => {
                const next = cloneJson(prev)
                const idx = next.sections.findIndex((s) => s.id === sectionId)
                if (idx < 0) return next
                const target = idx + dir
                if (target < 0 || target >= next.sections.length) return next
                const copy = [...next.sections]
                const [item] = copy.splice(idx, 1)
                copy.splice(target, 0, item)
                next.sections = copy
                return next
            })
        },
        [canEdit, updateDraftSchema],
    )

    const updateSectionTitle = React.useCallback(
        (sectionId: string, title: string) => {
            if (!canEdit) return
            updateDraftSchema((prev) => {
                const next = cloneJson(prev)
                next.sections = next.sections.map((s) => (s.id === sectionId ? { ...s, title } : s))
                return next
            })
        },
        [canEdit, updateDraftSchema],
    )

    const addQuestion = React.useCallback(
        (sectionId: string) => {
            if (!canEdit) {
                toast.error("Duplicate the default template to customize.")
                return
            }
            updateDraftSchema((prev) => {
                const next = cloneJson(prev)
                next.sections = next.sections.map((s) => {
                    if (s.id !== sectionId) return s
                    const q: FeedbackQuestion = {
                        id: makeId("q"),
                        type: "rating",
                        label: "New question",
                        required: false,
                        scale: { min: 1, max: 5, minLabel: "Low", maxLabel: "High" },
                    }
                    return { ...s, questions: [...(s.questions ?? []), q] }
                })
                return next
            })
        },
        [canEdit, updateDraftSchema],
    )

    const removeQuestion = React.useCallback(
        (sectionId: string, questionId: string) => {
            if (!canEdit) return
            updateDraftSchema((prev) => {
                const next = cloneJson(prev)
                next.sections = next.sections.map((s) => {
                    if (s.id !== sectionId) return s
                    return { ...s, questions: (s.questions ?? []).filter((q) => q.id !== questionId) }
                })
                return next
            })
        },
        [canEdit, updateDraftSchema],
    )

    const updateQuestion = React.useCallback(
        (sectionId: string, questionId: string, patch: Partial<FeedbackQuestion>) => {
            if (!canEdit) return
            updateDraftSchema((prev) => {
                const next = cloneJson(prev)
                next.sections = next.sections.map((s) => {
                    if (s.id !== sectionId) return s
                    const questions = (s.questions ?? []).map((q) => {
                        if (q.id !== questionId) return q
                        const merged: FeedbackQuestion = { ...q, ...patch }
                        if (merged.type === "rating") {
                            const sc = merged.scale ?? { min: 1, max: 5 }
                            merged.scale = {
                                min: clampInt(toNumber(sc.min, 1), 1, 10),
                                max: clampInt(toNumber(sc.max, 5), 1, 10),
                                minLabel: sc.minLabel,
                                maxLabel: sc.maxLabel,
                            }
                            if (merged.scale.max < merged.scale.min) {
                                merged.scale.max = merged.scale.min
                            }
                        } else {
                            // text
                            delete merged.scale
                        }
                        return merged
                    })
                    return { ...s, questions }
                })
                return next
            })
        },
        [canEdit, updateDraftSchema],
    )

    return (
        <DashboardLayout
            title="Feedback Form Templates"
            description="Create, edit, duplicate, and export student feedback form templates (default included)."
        >
            <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-12">
                    {/* LEFT: TEMPLATES LIST */}
                    <Card className="lg:col-span-4">
                        <CardHeader className="space-y-2">
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <CardTitle className="flex items-center gap-2">
                                        <LayoutTemplate className="h-5 w-5" />
                                        Templates
                                    </CardTitle>
                                    <CardDescription className="max-w-sm">
                                        Manage reusable feedback form templates.
                                    </CardDescription>
                                </div>

                                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                                    <DialogTrigger asChild>
                                        <Button onClick={openCreate} className="gap-2">
                                            <Plus className="h-4 w-4" />
                                            New
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Create template</DialogTitle>
                                            <DialogDescription>
                                                Starts from the default template, then you can customize it.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="space-y-3">
                                            <div className="space-y-2">
                                                <Label>Template name</Label>
                                                <Input
                                                    value={createName}
                                                    onChange={(e) => setCreateName(e.target.value)}
                                                    placeholder="e.g., Midterm Defense Feedback"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Template key (optional)</Label>
                                                <Input
                                                    value={createKey}
                                                    onChange={(e) => setCreateKey(e.target.value)}
                                                    placeholder="e.g., student-feedback-midterm-v1"
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Keys help identify templates in exports/analytics.
                                                </p>
                                            </div>
                                        </div>

                                        <DialogFooter className="gap-2 sm:gap-0">
                                            <DialogClose asChild>
                                                <Button variant="outline">Cancel</Button>
                                            </DialogClose>
                                            <Button onClick={submitCreate} className="gap-2">
                                                <Plus className="h-4 w-4" />
                                                Create
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Search</Label>
                                <Input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search templates..."
                                />
                            </div>
                        </CardHeader>

                        <CardContent className="pt-0">
                            <Separator className="mb-3" />
                            <ScrollArea className="h-96">
                                <div className="space-y-1">
                                    {filteredTemplates.map((t) => {
                                        const active = t.id === activeId
                                        const pill = statusPill(t.isDefault)
                                        return (
                                            <button
                                                key={t.id}
                                                onClick={() => requestSwitchTemplate(t.id)}
                                                className={[
                                                    "w-full rounded-lg border p-3 text-left transition",
                                                    active ? "border-primary/40 bg-primary/5" : "border-muted/60 hover:bg-muted/30",
                                                ].join(" ")}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium">{t.name}</p>
                                                        <p className="mt-1 truncate text-xs text-muted-foreground">{t.schema.title}</p>
                                                    </div>
                                                    <span
                                                        className={[
                                                            "inline-flex shrink-0 rounded-md border px-2 py-1 text-xs font-medium",
                                                            pill.className,
                                                        ].join(" ")}
                                                    >
                                                        {pill.label}
                                                    </span>
                                                </div>

                                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                    <Badge variant="secondary" className="font-mono">
                                                        {t.schema.key}
                                                    </Badge>
                                                    {!t.isDefault ? (
                                                        <span className="truncate">
                                                            Updated: {formatDateTime(t.updatedAt)}
                                                        </span>
                                                    ) : loadingDefault ? (
                                                        <span className="truncate">Loading default…</span>
                                                    ) : (
                                                        <span className="truncate">Loaded from API</span>
                                                    )}
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            </ScrollArea>

                            <Separator className="my-3" />

                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => void loadDefaultFromApi()}
                                    disabled={loadingDefault}
                                    className="gap-2"
                                >
                                    <GripVertical className="h-4 w-4" />
                                    {loadingDefault ? "Refreshing…" : "Refresh default"}
                                </Button>

                                <Button
                                    variant="outline"
                                    onClick={() => void copyText(JSON.stringify(defaultSchema, null, 2))}
                                    className="gap-2"
                                >
                                    <Copy className="h-4 w-4" />
                                    Copy default JSON
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* RIGHT: EDITOR */}
                    <Card className="lg:col-span-8">
                        <CardHeader className="space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <CardTitle className="flex flex-wrap items-center gap-2">
                                        <span className="min-w-0 truncate">{draftName}</span>
                                        {isDefaultActive ? (
                                            <Badge variant="outline" className="gap-1">
                                                <ShieldCheck className="h-3.5 w-3.5" />
                                                Default
                                            </Badge>
                                        ) : dirty ? (
                                            <Badge className="bg-amber-500 text-black">Unsaved</Badge>
                                        ) : (
                                            <Badge variant="secondary">Saved</Badge>
                                        )}
                                    </CardTitle>
                                    <CardDescription className="max-w-3xl">
                                        {isDefaultActive
                                            ? "Duplicate the default template to customize it."
                                            : "Edit sections and questions, then save your template."}
                                    </CardDescription>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <Button variant="outline" onClick={() => void copyText(JSON.stringify(draftSchema, null, 2))} className="gap-2">
                                        <Copy className="h-4 w-4" />
                                        Copy JSON
                                    </Button>

                                    <Button variant="outline" onClick={exportActive} className="gap-2">
                                        <Download className="h-4 w-4" />
                                        Export
                                    </Button>

                                    <Button variant="outline" onClick={duplicateActive} className="gap-2">
                                        <CopyPlus className="h-4 w-4" />
                                        Duplicate
                                    </Button>

                                    <Button onClick={saveDraft} disabled={!dirty || isDefaultActive} className="gap-2">
                                        <Save className="h-4 w-4" />
                                        Save
                                    </Button>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" size="icon" aria-label="Template actions">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56">
                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                            <DropdownMenuSeparator />

                                            <DropdownMenuItem
                                                onClick={() => void copyText(JSON.stringify(draftSchema, null, 2))}
                                                className="gap-2"
                                            >
                                                <Copy className="h-4 w-4" />
                                                Copy JSON
                                            </DropdownMenuItem>

                                            <DropdownMenuItem onClick={exportActive} className="gap-2">
                                                <Download className="h-4 w-4" />
                                                Export JSON
                                            </DropdownMenuItem>

                                            <DropdownMenuItem onClick={duplicateActive} className="gap-2">
                                                <CopyPlus className="h-4 w-4" />
                                                Duplicate
                                            </DropdownMenuItem>

                                            <DropdownMenuSeparator />

                                            <DropdownMenuItem
                                                onClick={openRename}
                                                disabled={isDefaultActive}
                                                className="gap-2"
                                            >
                                                <Pencil className="h-4 w-4" />
                                                Rename
                                            </DropdownMenuItem>

                                            <DropdownMenuItem
                                                onClick={openDelete}
                                                disabled={isDefaultActive}
                                                className="gap-2 text-destructive focus:text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            <Tabs defaultValue="builder">
                                <TabsList className="flex w-full flex-wrap justify-start gap-2">
                                    <TabsTrigger value="builder" className="gap-2">
                                        <LayoutTemplate className="h-4 w-4" />
                                        Builder
                                    </TabsTrigger>
                                    <TabsTrigger value="preview" className="gap-2">
                                        <ClipboardList className="h-4 w-4" />
                                        Preview
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="builder" className="mt-4 space-y-4">
                                    {isDefaultActive ? (
                                        <div className="rounded-lg border bg-muted/20 p-3">
                                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-medium">Default template is protected</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Duplicate it to create a custom template you can edit and save.
                                                    </p>
                                                </div>
                                                <Button onClick={duplicateActive} className="gap-2">
                                                    <CopyPlus className="h-4 w-4" />
                                                    Duplicate now
                                                </Button>
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* TEMPLATE META */}
                                    <Card className="border-muted/60">
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-base">Template details</CardTitle>
                                            <CardDescription>These fields are used in exports and UI labels.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="grid gap-3 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label>Template name</Label>
                                                <Input
                                                    value={draftName}
                                                    onChange={(e) => {
                                                        setDraftName(e.target.value)
                                                        setDirty(true)
                                                    }}
                                                    disabled={!canEdit}
                                                    placeholder="Internal template name..."
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Schema key</Label>
                                                <Input
                                                    value={draftSchema.key}
                                                    onChange={(e) =>
                                                        updateDraftSchema((prev) => ({ ...prev, key: e.target.value }))
                                                    }
                                                    disabled={!canEdit}
                                                    placeholder="student-feedback-v1"
                                                />
                                            </div>

                                            <div className="space-y-2 md:col-span-2">
                                                <Label>Title</Label>
                                                <Input
                                                    value={draftSchema.title}
                                                    onChange={(e) =>
                                                        updateDraftSchema((prev) => ({ ...prev, title: e.target.value }))
                                                    }
                                                    disabled={!canEdit}
                                                    placeholder="Student Feedback Form"
                                                />
                                            </div>

                                            <div className="space-y-2 md:col-span-2">
                                                <Label>Description</Label>
                                                <Textarea
                                                    value={draftSchema.description ?? ""}
                                                    onChange={(e) =>
                                                        updateDraftSchema((prev) => ({
                                                            ...prev,
                                                            description: e.target.value,
                                                        }))
                                                    }
                                                    disabled={!canEdit}
                                                    placeholder="Short instruction shown to students..."
                                                    className="min-h-24"
                                                />
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* SECTIONS */}
                                    <Card className="border-muted/60">
                                        <CardHeader className="pb-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="space-y-1">
                                                    <CardTitle className="text-base">Sections & questions</CardTitle>
                                                    <CardDescription>
                                                        Add sections, then create rating/text questions inside them.
                                                    </CardDescription>
                                                </div>
                                                <Button onClick={addSection} disabled={!canEdit} className="gap-2">
                                                    <Plus className="h-4 w-4" />
                                                    Add section
                                                </Button>
                                            </div>
                                        </CardHeader>

                                        <CardContent className="space-y-3">
                                            {draftSchema.sections.map((section, sIdx) => (
                                                <Card key={section.id} className="border-muted/60">
                                                    <CardHeader className="pb-3">
                                                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                                                <Badge variant="secondary" className="shrink-0">
                                                                    {sIdx + 1}
                                                                </Badge>
                                                                <Input
                                                                    value={section.title}
                                                                    onChange={(e) => updateSectionTitle(section.id, e.target.value)}
                                                                    disabled={!canEdit}
                                                                    className="min-w-0"
                                                                    placeholder="Section title..."
                                                                />
                                                            </div>

                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <Badge variant="secondary">{section.questions.length} question(s)</Badge>

                                                                <Button
                                                                    variant="outline"
                                                                    size="icon"
                                                                    onClick={() => moveSection(section.id, -1)}
                                                                    disabled={!canEdit || sIdx === 0}
                                                                    aria-label="Move section up"
                                                                >
                                                                    <GripVertical className="h-4 w-4 rotate-90" />
                                                                </Button>

                                                                <Button
                                                                    variant="outline"
                                                                    size="icon"
                                                                    onClick={() => moveSection(section.id, 1)}
                                                                    disabled={!canEdit || sIdx === draftSchema.sections.length - 1}
                                                                    aria-label="Move section down"
                                                                >
                                                                    <GripVertical className="h-4 w-4 -rotate-90" />
                                                                </Button>

                                                                <Button
                                                                    variant="outline"
                                                                    size="icon"
                                                                    onClick={() => removeSection(section.id)}
                                                                    disabled={!canEdit}
                                                                    aria-label="Delete section"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </CardHeader>

                                                    <CardContent className="space-y-3">
                                                        {section.questions.length === 0 ? (
                                                            <div className="rounded-lg border bg-muted/10 p-3">
                                                                <p className="text-sm font-medium">No questions yet</p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    Add a rating or text question to this section.
                                                                </p>
                                                            </div>
                                                        ) : null}

                                                        {section.questions.map((q, qIdx) => {
                                                            const isRating = q.type === "rating"
                                                            const scale = q.scale ?? { min: 1, max: 5, minLabel: "Low", maxLabel: "High" }

                                                            return (
                                                                <div key={q.id} className="rounded-lg border bg-card p-3">
                                                                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                                        <div className="flex min-w-0 flex-1 flex-col gap-3">
                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                <Badge variant="secondary" className="shrink-0">
                                                                                    {sIdx + 1}.{qIdx + 1}
                                                                                </Badge>

                                                                                <div className="grid flex-1 gap-2 md:grid-cols-2">
                                                                                    <div className="space-y-1">
                                                                                        <Label className="text-xs text-muted-foreground">Label</Label>
                                                                                        <Input
                                                                                            value={q.label}
                                                                                            onChange={(e) =>
                                                                                                updateQuestion(section.id, q.id, { label: e.target.value })
                                                                                            }
                                                                                            disabled={!canEdit}
                                                                                            placeholder="Question label..."
                                                                                        />
                                                                                    </div>

                                                                                    <div className="space-y-1">
                                                                                        <Label className="text-xs text-muted-foreground">Type</Label>
                                                                                        <Select
                                                                                            value={String(q.type)}
                                                                                            onValueChange={(v) => {
                                                                                                const type = (v === "rating" ? "rating" : "text") as FeedbackQuestion["type"]
                                                                                                const patch: Partial<FeedbackQuestion> = { type }
                                                                                                if (type === "rating") {
                                                                                                    patch.scale = q.scale ?? { min: 1, max: 5, minLabel: "Low", maxLabel: "High" }
                                                                                                    delete patch.placeholder
                                                                                                    delete patch.maxLength
                                                                                                } else {
                                                                                                    patch.placeholder = q.placeholder ?? ""
                                                                                                    patch.maxLength = q.maxLength ?? 1000
                                                                                                    delete patch.scale
                                                                                                }
                                                                                                updateQuestion(section.id, q.id, patch)
                                                                                            }}
                                                                                            disabled={!canEdit}
                                                                                        >
                                                                                            <SelectTrigger>
                                                                                                <SelectValue placeholder="Select type" />
                                                                                            </SelectTrigger>
                                                                                            <SelectContent>
                                                                                                <SelectItem value="rating">Rating</SelectItem>
                                                                                                <SelectItem value="text">Text</SelectItem>
                                                                                            </SelectContent>
                                                                                        </Select>
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <div className="grid gap-3 md:grid-cols-3">
                                                                                <div className="space-y-1 md:col-span-2">
                                                                                    <Label className="text-xs text-muted-foreground">Question ID</Label>
                                                                                    <Input
                                                                                        value={q.id}
                                                                                        onChange={(e) =>
                                                                                            updateQuestion(section.id, q.id, { id: e.target.value })
                                                                                        }
                                                                                        disabled={!canEdit}
                                                                                        className="font-mono text-xs"
                                                                                        placeholder="stable_id"
                                                                                    />
                                                                                </div>

                                                                                <div className="flex items-end justify-between gap-3 rounded-lg border bg-muted/10 p-3">
                                                                                    <div className="min-w-0">
                                                                                        <p className="text-sm font-medium">Required</p>
                                                                                        <p className="text-xs text-muted-foreground">Must be answered</p>
                                                                                    </div>
                                                                                    <Switch
                                                                                        checked={!!q.required}
                                                                                        onCheckedChange={(checked) =>
                                                                                            updateQuestion(section.id, q.id, { required: checked })
                                                                                        }
                                                                                        disabled={!canEdit}
                                                                                    />
                                                                                </div>
                                                                            </div>

                                                                            {isRating ? (
                                                                                <div className="grid gap-3 md:grid-cols-4">
                                                                                    <div className="space-y-1">
                                                                                        <Label className="text-xs text-muted-foreground">Min</Label>
                                                                                        <Input
                                                                                            type="number"
                                                                                            value={String(scale.min)}
                                                                                            onChange={(e) =>
                                                                                                updateQuestion(section.id, q.id, {
                                                                                                    scale: { ...scale, min: toNumber(e.target.value, 1) },
                                                                                                })
                                                                                            }
                                                                                            disabled={!canEdit}
                                                                                        />
                                                                                    </div>

                                                                                    <div className="space-y-1">
                                                                                        <Label className="text-xs text-muted-foreground">Max</Label>
                                                                                        <Input
                                                                                            type="number"
                                                                                            value={String(scale.max)}
                                                                                            onChange={(e) =>
                                                                                                updateQuestion(section.id, q.id, {
                                                                                                    scale: { ...scale, max: toNumber(e.target.value, 5) },
                                                                                                })
                                                                                            }
                                                                                            disabled={!canEdit}
                                                                                        />
                                                                                    </div>

                                                                                    <div className="space-y-1">
                                                                                        <Label className="text-xs text-muted-foreground">Min label</Label>
                                                                                        <Input
                                                                                            value={scale.minLabel ?? ""}
                                                                                            onChange={(e) =>
                                                                                                updateQuestion(section.id, q.id, {
                                                                                                    scale: { ...scale, minLabel: e.target.value },
                                                                                                })
                                                                                            }
                                                                                            disabled={!canEdit}
                                                                                            placeholder="Low"
                                                                                        />
                                                                                    </div>

                                                                                    <div className="space-y-1">
                                                                                        <Label className="text-xs text-muted-foreground">Max label</Label>
                                                                                        <Input
                                                                                            value={scale.maxLabel ?? ""}
                                                                                            onChange={(e) =>
                                                                                                updateQuestion(section.id, q.id, {
                                                                                                    scale: { ...scale, maxLabel: e.target.value },
                                                                                                })
                                                                                            }
                                                                                            disabled={!canEdit}
                                                                                            placeholder="High"
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="grid gap-3 md:grid-cols-3">
                                                                                    <div className="space-y-1 md:col-span-2">
                                                                                        <Label className="text-xs text-muted-foreground">Placeholder</Label>
                                                                                        <Input
                                                                                            value={q.placeholder ?? ""}
                                                                                            onChange={(e) =>
                                                                                                updateQuestion(section.id, q.id, { placeholder: e.target.value })
                                                                                            }
                                                                                            disabled={!canEdit}
                                                                                            placeholder="e.g., Share your thoughts..."
                                                                                        />
                                                                                    </div>

                                                                                    <div className="space-y-1">
                                                                                        <Label className="text-xs text-muted-foreground">Max length</Label>
                                                                                        <Input
                                                                                            type="number"
                                                                                            value={String(q.maxLength ?? 1000)}
                                                                                            onChange={(e) =>
                                                                                                updateQuestion(section.id, q.id, {
                                                                                                    maxLength: clampInt(toNumber(e.target.value, 1000), 10, 10000),
                                                                                                })
                                                                                            }
                                                                                            disabled={!canEdit}
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        <div className="flex shrink-0 items-start gap-2">
                                                                            <Button
                                                                                variant="outline"
                                                                                size="icon"
                                                                                onClick={() => removeQuestion(section.id, q.id)}
                                                                                disabled={!canEdit}
                                                                                aria-label="Delete question"
                                                                            >
                                                                                <Trash2 className="h-4 w-4" />
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}

                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <p className="text-xs text-muted-foreground">
                                                                Keep question IDs stable to avoid breaking analytics/history.
                                                            </p>
                                                            <Button
                                                                variant="outline"
                                                                onClick={() => addQuestion(section.id)}
                                                                disabled={!canEdit}
                                                                className="gap-2"
                                                            >
                                                                <Plus className="h-4 w-4" />
                                                                Add question
                                                            </Button>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </CardContent>
                                    </Card>
                                </TabsContent>

                                <TabsContent value="preview" className="mt-4">
                                    <SchemaPreview schema={draftSchema} />
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* RENAME DIALOG */}
            <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename template</DialogTitle>
                        <DialogDescription>Update the template display name.</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                        <Label>Template name</Label>
                        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="Template name..." />
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button onClick={submitRename} className="gap-2">
                            <Pencil className="h-4 w-4" />
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DELETE CONFIRM */}
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this template?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes the template from your saved templates. This won’t delete any submitted feedback responses.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2 sm:gap-0">
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="gap-2">
                            <Trash2 className="h-4 w-4" />
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* DISCARD UNSAVED */}
            <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
                        <AlertDialogDescription>
                            You have unsaved edits. Switching templates will discard them.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2 sm:gap-0">
                        <AlertDialogCancel
                            onClick={() => {
                                setDiscardOpen(false)
                                setPendingSwitchId(null)
                            }}
                        >
                            Keep editing
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDiscardAndSwitch}>
                            Discard and switch
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DashboardLayout>
    )
}
