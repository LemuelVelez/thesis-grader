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
    CopyPlus,
    Power,
    PowerOff,
    Trash2,
    RefreshCw,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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

type StudentFeedbackForm = {
    id: string
    key: string
    version: number
    title: string
    description: string | null
    schema: StudentFeedbackSchema
    active: boolean
    createdAt: string
    updatedAt: string
}

/* --------------------------------- UTILS --------------------------------- */

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

function clampInt(n: number, min: number, max: number) {
    if (!Number.isFinite(n)) return min
    return Math.max(min, Math.min(max, Math.floor(n)))
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
                ],
            },
            {
                id: "open_ended",
                title: "Suggestions",
                questions: [
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

function statusPill(active: boolean) {
    return active
        ? { label: "Active", className: "border-emerald-500/30 bg-emerald-500/10 text-foreground" }
        : { label: "Inactive", className: "border-muted-foreground/30 bg-muted text-muted-foreground" }
}

function normalizeFormRow(value: unknown): StudentFeedbackForm | null {
    if (!isRecord(value)) return null

    const id = safeString(value.id)
    if (!id) return null

    const active = typeof value.active === "boolean" ? value.active : false
    const key = safeString(value.key)
    const title = safeString(value.title)
    const version = Math.max(1, Math.floor(toNumber(value.version, 1)))
    const description =
        value.description === null ? null : typeof value.description === "string" ? value.description : null

    const createdAt = safeString((value as Record<string, unknown>).created_at ?? value.createdAt) || nowIso()
    const updatedAt = safeString((value as Record<string, unknown>).updated_at ?? value.updatedAt) || nowIso()

    const schemaCandidate = value.schema
    const normalized = normalizeSchema(schemaCandidate)
    const schema: StudentFeedbackSchema =
        normalized ??
        (() => {
            const fb = getFallbackSchema()
            return {
                ...fb,
                key: key || fb.key,
                title: title || fb.title,
                version: version || fb.version,
                description: description ?? fb.description,
            }
        })()

    return {
        id,
        key: schema.key || key,
        version: schema.version || version,
        title: schema.title || title,
        description: schema.description ?? description ?? null,
        schema,
        active,
        createdAt,
        updatedAt,
    }
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
                                    q.type === "rating" && q.scale
                                        ? Math.max(0, q.scale.max - q.scale.min + 1)
                                        : 0

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
    const [loading, setLoading] = React.useState(true)
    const [forms, setForms] = React.useState<StudentFeedbackForm[]>([])
    const [query, setQuery] = React.useState("")
    const [activeId, setActiveId] = React.useState<string | null>(null)

    const [draftSchema, setDraftSchema] = React.useState<StudentFeedbackSchema>(getFallbackSchema())
    const [dirty, setDirty] = React.useState(false)

    const [storageWarning, setStorageWarning] = React.useState<string | null>(null)
    const [storageMessage, setStorageMessage] = React.useState<string | null>(null)

    const [createOpen, setCreateOpen] = React.useState(false)
    const [discardOpen, setDiscardOpen] = React.useState(false)
    const [deactivateOpen, setDeactivateOpen] = React.useState(false)

    const [pendingSwitchId, setPendingSwitchId] = React.useState<string | null>(null)

    const [createTitle, setCreateTitle] = React.useState("")
    const [createKey, setCreateKey] = React.useState("")
    const [createVersion, setCreateVersion] = React.useState("1")
    const [createDescription, setCreateDescription] = React.useState("")
    const [createActivate, setCreateActivate] = React.useState(true)
    const [createBase, setCreateBase] = React.useState<"active" | "fallback">("active")

    const activeForm = React.useMemo(() => forms.find((f) => f.active) ?? null, [forms])

    const selectedForm = React.useMemo(() => {
        if (!activeId) return null
        return forms.find((f) => f.id === activeId) ?? null
    }, [activeId, forms])

    const isTemplateMode = !selectedForm

    const filteredForms = React.useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return forms
        return forms.filter((f) => {
            const hay = `${f.title} ${f.key} v${f.version}`.toLowerCase()
            const schemaTitle = (f.schema?.title ?? "").toLowerCase()
            return hay.includes(q) || schemaTitle.includes(q)
        })
    }, [forms, query])

    const loadForms = React.useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/admin/student-feedback/forms", { cache: "no-store" })
            const data = await readJsonRecord(res)
            if (!res.ok) throw new Error(await readErrorMessage(res))

            const warning = typeof data.warning === "string" ? data.warning : null
            const message = typeof data.message === "string" ? data.message : null
            setStorageWarning(warning)
            setStorageMessage(message)

            const rawItems = Array.isArray(data.items) ? data.items : []
            const parsed = rawItems.map(normalizeFormRow).filter((x): x is StudentFeedbackForm => x !== null)

            const sorted = [...parsed].sort((a, b) => {
                if (a.active !== b.active) return a.active ? -1 : 1
                if (a.version !== b.version) return b.version - a.version
                const aT = new Date(a.updatedAt).getTime()
                const bT = new Date(b.updatedAt).getTime()
                return bT - aT
            })

            setForms(sorted)

            const preferredId = (sorted.find((x) => x.active)?.id ?? sorted[0]?.id) ?? null
            setActiveId((prev) => prev ?? preferredId)

            if (warning) {
                toast.info(warning)
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load feedback forms."
            toast.error(message)
            setForms([])
            setActiveId(null)
            setStorageWarning(null)
            setStorageMessage(null)
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void loadForms()
    }, [loadForms])

    React.useEffect(() => {
        if (!selectedForm) return
        setDraftSchema(cloneJson(selectedForm.schema))
        setDirty(false)
    }, [selectedForm?.id]) // eslint-disable-line react-hooks/exhaustive-deps

    const requestSwitchForm = React.useCallback(
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
        setDraftSchema((prev) => updater(prev))
        setDirty(true)
    }, [])

    const resetToFallbackTemplate = React.useCallback(() => {
        setDraftSchema(getFallbackSchema())
        setDirty(true)
        toast.success("Template reset.")
    }, [])

    /* ------------------------------- API CALLS ------------------------------- */

    const apiCreateForm = React.useCallback(
        async (schema: StudentFeedbackSchema, activate: boolean) => {
            const payload = {
                key: schema.key,
                version: schema.version,
                title: schema.title,
                description: schema.description ?? null,
                schema,
                active: activate,
            }

            const res = await fetch("/api/admin/student-feedback/forms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            const data = await readJsonRecord(res)
            if (!res.ok) throw new Error(await readErrorMessage(res))

            const item = normalizeFormRow(data.item)
            if (!item) throw new Error("Server returned an invalid form payload.")
            return item
        },
        [],
    )

    const apiUpdateForm = React.useCallback(async (id: string, patch: Record<string, unknown>) => {
        const res = await fetch(`/api/admin/student-feedback/forms/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
        })
        const data = await readJsonRecord(res)
        if (!res.ok) throw new Error(await readErrorMessage(res))

        const item = normalizeFormRow(data.item)
        if (!item) throw new Error("Server returned an invalid form payload.")
        return item
    }, [])

    const apiActivateForm = React.useCallback(async (id: string) => {
        const res = await fetch(`/api/admin/student-feedback/forms/${id}/activate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        })
        const data = await readJsonRecord(res)
        if (!res.ok) throw new Error(await readErrorMessage(res))

        const item = normalizeFormRow(data.item)
        if (!item) throw new Error("Server returned an invalid form payload.")
        return item
    }, [])

    /* ----------------------------- TOP ACTIONS ----------------------------- */

    const openCreate = React.useCallback(() => {
        const suggestedVersion = String(Math.max(1, (forms[0]?.version ?? 0) + 1))
        setCreateTitle("")
        setCreateKey("")
        setCreateVersion(suggestedVersion)
        setCreateDescription("")
        setCreateActivate(true)
        setCreateBase("active")
        setCreateOpen(true)
    }, [forms])

    const submitCreate = React.useCallback(async () => {
        const title = createTitle.trim()
        if (!title) {
            toast.error("Title is required.")
            return
        }

        const version = Math.max(1, Math.floor(toNumber(createVersion, 1)))
        const key = (createKey.trim() || `student-feedback-${makeId("v")}`).slice(0, 120)

        const baseSchema =
            createBase === "active" && activeForm?.schema ? cloneJson(activeForm.schema) : cloneJson(getFallbackSchema())

        const schema: StudentFeedbackSchema = {
            ...baseSchema,
            key,
            version,
            title,
            sections:
                Array.isArray(baseSchema.sections) && baseSchema.sections.length > 0
                    ? baseSchema.sections
                    : getFallbackSchema().sections,
        }

        const desc = createDescription.trim()
        if (desc.length > 0) schema.description = desc
        else delete schema.description

        try {
            const created = await apiCreateForm(schema, createActivate)
            setCreateOpen(false)

            setForms((prev) => {
                const next = [created, ...prev]
                if (created.active) {
                    return next.map((f) => (f.id === created.id ? f : { ...f, active: false }))
                }
                return next
            })

            setActiveId(created.id)
            setDraftSchema(cloneJson(created.schema))
            setDirty(false)

            toast.success(createActivate ? "Form created and activated." : "Form created.")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to create feedback form."
            toast.error(message)
        }
    }, [
        activeForm?.schema,
        apiCreateForm,
        createActivate,
        createBase,
        createDescription,
        createKey,
        createTitle,
        createVersion,
    ])

    const createFromTemplate = React.useCallback(
        async (activate: boolean) => {
            const normalized = normalizeSchema(draftSchema)
            if (!normalized) {
                toast.error("Template schema is invalid. Please complete required fields (key, title, sections, questions).")
                return
            }

            try {
                const created = await apiCreateForm(normalized, activate)

                setForms((prev) => {
                    const next = [created, ...prev]
                    if (created.active) {
                        return next.map((f) => (f.id === created.id ? f : { ...f, active: false }))
                    }
                    return next
                })

                setActiveId(created.id)
                setDraftSchema(cloneJson(created.schema))
                setDirty(false)

                toast.success(activate ? "Form created and activated." : "Form created.")
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to create feedback form."
                toast.error(message)
            }
        },
        [apiCreateForm, draftSchema],
    )

    const saveDraft = React.useCallback(async () => {
        if (!selectedForm) {
            toast.error("Select a feedback form first.")
            return
        }

        const normalized = normalizeSchema(draftSchema)
        if (!normalized) {
            toast.error("Form schema is invalid. Please complete required fields (key, title, sections, questions).")
            return
        }

        try {
            const patch = {
                key: normalized.key,
                version: normalized.version,
                title: normalized.title,
                description: normalized.description ?? null,
                schema: normalized,
            }

            const updated = await apiUpdateForm(selectedForm.id, patch)

            setForms((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
            setDraftSchema(cloneJson(updated.schema))
            setDirty(false)
            toast.success("Saved changes.")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to save changes."
            toast.error(message)
        }
    }, [apiUpdateForm, draftSchema, selectedForm])

    const activateSelected = React.useCallback(async () => {
        if (!selectedForm) return
        try {
            const activated = await apiActivateForm(selectedForm.id)

            setForms((prev) =>
                prev.map((f) => {
                    if (f.id === activated.id) return { ...activated, active: true }
                    return { ...f, active: false }
                }),
            )

            toast.success("Activated for student evaluations.")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to activate feedback form."
            toast.error(message)
        }
    }, [apiActivateForm, selectedForm])

    const deactivateSelected = React.useCallback(async () => {
        if (!selectedForm) return
        try {
            const updated = await apiUpdateForm(selectedForm.id, { active: false })

            setForms((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
            setDeactivateOpen(false)
            toast.success("Deactivated.")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to deactivate feedback form."
            toast.error(message)
        }
    }, [apiUpdateForm, selectedForm])

    const exportCurrent = React.useCallback(() => {
        const baseTitle = (draftSchema.title || selectedForm?.title || "student-feedback-form")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60)

        downloadJson(`${baseTitle || "student-feedback-form"}.json`, {
            formId: selectedForm?.id ?? null,
            active: selectedForm?.active ?? null,
            schema: draftSchema,
            exportedAt: nowIso(),
        })
    }, [draftSchema, selectedForm])

    const duplicateSelected = React.useCallback(() => {
        if (!selectedForm) return
        setCreateTitle(`${selectedForm.title} (copy)`)
        setCreateKey(`${selectedForm.key}-copy-${Date.now()}`.slice(0, 120))
        setCreateVersion(String(Math.max(1, selectedForm.version + 1)))
        setCreateDescription(selectedForm.description ?? "")
        setCreateActivate(false)
        setCreateBase("active")
        setCreateOpen(true)
    }, [selectedForm])

    /* ----------------------------- EDITOR ACTIONS ---------------------------- */

    const canEdit = true

    const addSection = React.useCallback(() => {
        if (!canEdit) return
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
            if (!canEdit) return
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
                            if (merged.scale.max < merged.scale.min) merged.scale.max = merged.scale.min
                        } else {
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

    const headerPill = selectedForm ? statusPill(selectedForm.active) : statusPill(false)

    return (
        <DashboardLayout
            title="Feedback Forms"
            description="Activate a feedback form to be used for student evaluations, and manage the form content."
        >
            <div className="space-y-4">
                {storageWarning ? (
                    <Alert>
                        <AlertTitle>Student feedback forms storage not ready</AlertTitle>
                        <AlertDescription>
                            {storageWarning}
                            {storageMessage ? <span className="block mt-2 text-xs text-muted-foreground">{storageMessage}</span> : null}
                        </AlertDescription>
                    </Alert>
                ) : null}

                <Card className="border-muted/60">
                    <CardHeader className="space-y-2">
                        <CardTitle className="flex flex-wrap items-center gap-2">
                            <Power className="h-5 w-5" />
                            Active feedback form for student evaluations
                        </CardTitle>
                        <CardDescription className="max-w-3xl">
                            Students will use the currently active feedback form schema during evaluations.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="gap-2">
                                    {activeForm ? (
                                        <>
                                            <ShieldCheck className="h-4 w-4" />
                                            Active: {activeForm.title} (v{activeForm.version})
                                        </>
                                    ) : (
                                        <>
                                            <PowerOff className="h-4 w-4" />
                                            No active form selected
                                        </>
                                    )}
                                </Badge>
                                {activeForm ? (
                                    <Badge variant="secondary" className="font-mono">
                                        {activeForm.key}
                                    </Badge>
                                ) : null}
                            </div>

                            {!activeForm ? (
                                <p className="text-xs text-muted-foreground">
                                    No forms yet. Start from the default template on the right, then click{" "}
                                    <span className="font-medium">Create & Activate</span>.
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    Tip: Select a form on the left, then click <span className="font-medium">Activate</span>.
                                </p>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" onClick={() => void loadForms()} disabled={loading} className="gap-2">
                                <RefreshCw className="h-4 w-4" />
                                {loading ? "Refreshing…" : "Refresh"}
                            </Button>

                            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                                <DialogTrigger asChild>
                                    <Button onClick={openCreate} className="gap-2">
                                        <Plus className="h-4 w-4" />
                                        New form
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Create feedback form</DialogTitle>
                                        <DialogDescription>
                                            Create a new form schema. You can activate it immediately or later.
                                        </DialogDescription>
                                    </DialogHeader>

                                    <div className="space-y-4">
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div className="space-y-2 md:col-span-2">
                                                <Label>Title</Label>
                                                <Input
                                                    value={createTitle}
                                                    onChange={(e) => setCreateTitle(e.target.value)}
                                                    placeholder="e.g., Final Defense Student Feedback"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Key</Label>
                                                <Input
                                                    value={createKey}
                                                    onChange={(e) => setCreateKey(e.target.value)}
                                                    placeholder="e.g., student-feedback-final-v1"
                                                />
                                                <p className="text-xs text-muted-foreground">Used as an identifier in exports/analytics.</p>
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Version</Label>
                                                <Input value={createVersion} onChange={(e) => setCreateVersion(e.target.value)} type="number" />
                                            </div>

                                            <div className="space-y-2 md:col-span-2">
                                                <Label>Description (optional)</Label>
                                                <Textarea
                                                    value={createDescription}
                                                    onChange={(e) => setCreateDescription(e.target.value)}
                                                    placeholder="Short instruction shown to students..."
                                                    className="min-h-24"
                                                />
                                            </div>

                                            <div className="space-y-2 md:col-span-2">
                                                <Label>Base schema</Label>
                                                <Select
                                                    value={createBase}
                                                    onValueChange={(v) => setCreateBase(v === "fallback" ? "fallback" : "active")}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Choose base" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="active">Copy active form</SelectItem>
                                                        <SelectItem value="fallback">Use fallback starter</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-xs text-muted-foreground">
                                                    Copying the active form is the fastest way to create a new version.
                                                </p>
                                            </div>

                                            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/10 p-3 md:col-span-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium">Activate after create</p>
                                                    <p className="text-xs text-muted-foreground">Make this the active form for student evaluations</p>
                                                </div>
                                                <Switch checked={createActivate} onCheckedChange={setCreateActivate} />
                                            </div>
                                        </div>
                                    </div>

                                    <DialogFooter className="gap-2 sm:gap-0">
                                        <DialogClose asChild>
                                            <Button variant="outline" className="mx-2">
                                                Cancel
                                            </Button>
                                        </DialogClose>
                                        <Button onClick={() => void submitCreate()} className="gap-2">
                                            <Plus className="h-4 w-4" />
                                            Create
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-12">
                    {/* LEFT: FORMS LIST */}
                    <Card className="lg:col-span-4">
                        <CardHeader className="space-y-2">
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <CardTitle className="flex items-center gap-2">
                                        <LayoutTemplate className="h-5 w-5" />
                                        Forms
                                    </CardTitle>
                                    <CardDescription className="max-w-sm">Select a form, then activate/deactivate it.</CardDescription>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Search</Label>
                                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search forms..." />
                            </div>
                        </CardHeader>

                        <CardContent className="pt-0">
                            <Separator className="mb-3" />
                            <ScrollArea className="h-96">
                                <div className="space-y-1">
                                    {loading ? (
                                        <div className="rounded-lg border bg-muted/10 p-3">
                                            <p className="text-sm font-medium">Loading forms…</p>
                                            <p className="text-xs text-muted-foreground">Fetching from the database.</p>
                                        </div>
                                    ) : filteredForms.length === 0 ? (
                                        <div className="rounded-lg border bg-muted/10 p-3">
                                            <p className="text-sm font-medium">No forms found</p>
                                            <p className="text-xs text-muted-foreground">
                                                Use the default template on the right to create your first form.
                                            </p>
                                        </div>
                                    ) : (
                                        filteredForms.map((f) => {
                                            const isSelected = f.id === activeId
                                            const pill = statusPill(f.active)
                                            return (
                                                <Button
                                                    key={f.id}
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() => requestSwitchForm(f.id)}
                                                    className="h-auto w-full justify-start p-0"
                                                >
                                                    <div
                                                        className={[
                                                            "w-full rounded-lg border p-3 text-left transition",
                                                            isSelected ? "border-primary/40 bg-primary/5" : "border-muted/60 hover:bg-muted/30",
                                                        ].join(" ")}
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-medium">{f.title}</p>
                                                                <p className="mt-1 truncate text-xs text-muted-foreground">
                                                                    v{f.version} • {f.schema.sections.length} section(s)
                                                                </p>
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
                                                                {f.key}
                                                            </Badge>
                                                            <span className="truncate">Updated: {formatDateTime(f.updatedAt)}</span>
                                                        </div>
                                                    </div>
                                                </Button>
                                            )
                                        })
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    {/* RIGHT: EDITOR */}
                    <Card className="lg:col-span-8">
                        <CardHeader className="space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <CardTitle className="flex flex-wrap items-center gap-2">
                                        <span className="min-w-0 truncate">
                                            {selectedForm ? selectedForm.title : "Default template"}
                                        </span>

                                        {selectedForm ? (
                                            <span
                                                className={[
                                                    "inline-flex shrink-0 rounded-md border px-2 py-1 text-xs font-medium",
                                                    headerPill.className,
                                                ].join(" ")}
                                            >
                                                {headerPill.label}
                                            </span>
                                        ) : (
                                            <Badge variant="secondary">Template</Badge>
                                        )}

                                        {selectedForm ? (
                                            <Badge variant="outline" className="gap-1">
                                                <ShieldCheck className="h-3.5 w-3.5" />
                                                v{selectedForm.version}
                                            </Badge>
                                        ) : null}

                                        {selectedForm ? <Badge variant="secondary" className="font-mono">{selectedForm.key}</Badge> : null}
                                        {dirty ? <Badge className="bg-amber-500 text-black">Unsaved</Badge> : null}
                                    </CardTitle>

                                    <CardDescription className="max-w-3xl">
                                        {selectedForm
                                            ? "Edit the schema, then save. Use Activate/Deactivate to control the form used for student evaluations."
                                            : "Edit the default template, then create your first feedback form (or keep it as a reusable starter)."}
                                    </CardDescription>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => void copyText(JSON.stringify(draftSchema, null, 2))}
                                        className="gap-2"
                                    >
                                        <Copy className="h-4 w-4" />
                                        Copy JSON
                                    </Button>

                                    <Button variant="outline" onClick={exportCurrent} className="gap-2">
                                        <Download className="h-4 w-4" />
                                        Export
                                    </Button>

                                    {selectedForm ? (
                                        <>
                                            <Button variant="outline" onClick={duplicateSelected} className="gap-2">
                                                <CopyPlus className="h-4 w-4" />
                                                Duplicate
                                            </Button>

                                            <Button onClick={() => void saveDraft()} disabled={!dirty} className="gap-2">
                                                <Save className="h-4 w-4" />
                                                Save
                                            </Button>

                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" size="icon" aria-label="Form actions">
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

                                                    <DropdownMenuItem onClick={exportCurrent} className="gap-2">
                                                        <Download className="h-4 w-4" />
                                                        Export JSON
                                                    </DropdownMenuItem>

                                                    <DropdownMenuItem onClick={duplicateSelected} className="gap-2">
                                                        <CopyPlus className="h-4 w-4" />
                                                        Duplicate
                                                    </DropdownMenuItem>

                                                    <DropdownMenuSeparator />

                                                    <DropdownMenuItem
                                                        onClick={() => void activateSelected()}
                                                        disabled={!!selectedForm?.active}
                                                        className="gap-2"
                                                    >
                                                        <Power className="h-4 w-4" />
                                                        Activate
                                                    </DropdownMenuItem>

                                                    <DropdownMenuItem
                                                        onClick={() => setDeactivateOpen(true)}
                                                        disabled={!selectedForm?.active}
                                                        className="gap-2 text-destructive focus:text-destructive"
                                                    >
                                                        <PowerOff className="h-4 w-4" />
                                                        Deactivate
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </>
                                    ) : (
                                        <>
                                            <Button onClick={() => void createFromTemplate(true)} className="gap-2">
                                                <Power className="h-4 w-4" />
                                                Create & Activate
                                            </Button>
                                            <Button variant="outline" onClick={resetToFallbackTemplate} className="gap-2">
                                                <RefreshCw className="h-4 w-4" />
                                                Reset
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {selectedForm ? (
                                <Card className="border-muted/60">
                                    <CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium">Activation</p>
                                            <p className="text-xs text-muted-foreground">
                                                {selectedForm.active
                                                    ? "This form is currently active for student evaluations."
                                                    : "This form is not active. Activate it to use for student evaluations."}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button onClick={() => void activateSelected()} disabled={selectedForm.active} className="gap-2">
                                                <Power className="h-4 w-4" />
                                                Activate
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => setDeactivateOpen(true)}
                                                disabled={!selectedForm.active}
                                                className="gap-2"
                                            >
                                                <PowerOff className="h-4 w-4" />
                                                Deactivate
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : (
                                <Card className="border-muted/60">
                                    <CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium">Starter template</p>
                                            <p className="text-xs text-muted-foreground">
                                                Edit this template, then click <span className="font-medium">Create & Activate</span> to generate the first saved form.
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button onClick={() => void createFromTemplate(true)} className="gap-2">
                                                <Power className="h-4 w-4" />
                                                Create & Activate
                                            </Button>
                                            <Button variant="outline" onClick={resetToFallbackTemplate} className="gap-2">
                                                <RefreshCw className="h-4 w-4" />
                                                Reset
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
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
                                    {/* META */}
                                    <Card className="border-muted/60">
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-base">Form details</CardTitle>
                                            <CardDescription>Keep schema metadata consistent (key, title, version).</CardDescription>
                                        </CardHeader>
                                        <CardContent className="grid gap-3 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label>Schema key</Label>
                                                <Input
                                                    value={draftSchema.key}
                                                    onChange={(e) => updateDraftSchema((prev) => ({ ...prev, key: e.target.value }))}
                                                    placeholder="student-feedback-v1"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Version</Label>
                                                <Input
                                                    type="number"
                                                    value={String(draftSchema.version)}
                                                    onChange={(e) =>
                                                        updateDraftSchema((prev) => ({
                                                            ...prev,
                                                            version: Math.max(1, Math.floor(toNumber(e.target.value, 1))),
                                                        }))
                                                    }
                                                />
                                            </div>

                                            <div className="space-y-2 md:col-span-2">
                                                <Label>Title</Label>
                                                <Input
                                                    value={draftSchema.title}
                                                    onChange={(e) => updateDraftSchema((prev) => ({ ...prev, title: e.target.value }))}
                                                    placeholder="Student Feedback Form"
                                                />
                                            </div>

                                            <div className="space-y-2 md:col-span-2">
                                                <Label>Description</Label>
                                                <Textarea
                                                    value={draftSchema.description ?? ""}
                                                    onChange={(e) => updateDraftSchema((prev) => ({ ...prev, description: e.target.value }))}
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
                                                    <CardDescription>Add sections, then create rating/text questions inside them.</CardDescription>
                                                </div>
                                                <Button onClick={addSection} className="gap-2">
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
                                                                    disabled={sIdx === 0}
                                                                    aria-label="Move section up"
                                                                >
                                                                    <GripVertical className="h-4 w-4 rotate-90" />
                                                                </Button>

                                                                <Button
                                                                    variant="outline"
                                                                    size="icon"
                                                                    onClick={() => moveSection(section.id, 1)}
                                                                    disabled={sIdx === draftSchema.sections.length - 1}
                                                                    aria-label="Move section down"
                                                                >
                                                                    <GripVertical className="h-4 w-4 -rotate-90" />
                                                                </Button>

                                                                <Button
                                                                    variant="outline"
                                                                    size="icon"
                                                                    onClick={() => removeSection(section.id)}
                                                                    aria-label="Delete section"
                                                                    className="text-destructive focus:text-destructive"
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
                                                            const scale =
                                                                q.scale ?? { min: 1, max: 5, minLabel: "Low", maxLabel: "High" }

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
                                                                                                    patch.scale =
                                                                                                        q.scale ?? { min: 1, max: 5, minLabel: "Low", maxLabel: "High" }
                                                                                                    delete patch.placeholder
                                                                                                    delete patch.maxLength
                                                                                                } else {
                                                                                                    patch.placeholder = q.placeholder ?? ""
                                                                                                    patch.maxLength = q.maxLength ?? 1000
                                                                                                    delete patch.scale
                                                                                                }
                                                                                                updateQuestion(section.id, q.id, patch)
                                                                                            }}
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
                                                                                        onChange={(e) => updateQuestion(section.id, q.id, { id: e.target.value })}
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
                                                                                aria-label="Delete question"
                                                                                className="text-destructive focus:text-destructive"
                                                                            >
                                                                                <Trash2 className="h-4 w-4" />
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}

                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <p className="text-xs text-muted-foreground">Keep question IDs stable for reporting/history.</p>
                                                            <Button variant="outline" onClick={() => addQuestion(section.id)} className="gap-2">
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

            {/* DISCARD UNSAVED */}
            <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
                        <AlertDialogDescription>You have unsaved edits. Switching forms will discard them.</AlertDialogDescription>
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
                        <AlertDialogAction onClick={confirmDiscardAndSwitch}>Discard and switch</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* DEACTIVATE CONFIRM */}
            <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate this feedback form?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deactivating will remove it as the active form used for student evaluations until another form is activated.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2 sm:gap-0">
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void deactivateSelected()} className="gap-2 ml-2">
                            <PowerOff className="h-4 w-4" />
                            Deactivate
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DashboardLayout>
    )
}
