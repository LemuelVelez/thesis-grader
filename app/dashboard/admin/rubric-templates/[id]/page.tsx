"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type RubricTemplate = {
    id: string
    name: string
    version: number
    active: boolean
    description: string | null
    created_at: string
    updated_at: string
}

type RubricCriterion = {
    id: string
    template_id: string
    criterion: string
    description: string | null
    weight: number
    min_score: number
    max_score: number
    created_at: string
}

type TemplateForm = {
    name: string
    description: string
    version: number
    active: boolean
}

type CriterionForm = {
    criterion: string
    description: string
    weight: number
    min_score: number
    max_score: number
}

type SelectOption = {
    value: string
    label: string
    payload: string
}

const NO_DESCRIPTION_SELECT_VALUE = "__none__"

const TEMPLATE_NAME_OPTIONS: SelectOption[] = [
    {
        value: "ccs-thesis-form-3c-draft-2021",
        label: "CCS Thesis Form 3-C (Draft November 2, 2021)",
        payload: "CCS Thesis Form 3-C (Draft November 2, 2021)",
    },
    {
        value: "ccs-thesis-form-3c-rubrics-for-proposal",
        label: "CCS Thesis Form 3-C - Rubrics for Proposal",
        payload: "CCS Thesis Form 3-C - Rubrics for Proposal",
    },
    {
        value: "other",
        label: "Others (please specify)",
        payload: "",
    },
]

const TEMPLATE_DESCRIPTION_OPTIONS: SelectOption[] = [
    {
        value: "proposal-rubric-college-of-computing-studies",
        label: "College of Computing Studies proposal rubric",
        payload: "College of Computing Studies proposal rubric",
    },
    {
        value: "score-scale-0-to-3-adjectival",
        label: "Score scale 0–3 (Absent to Professional/Accomplished)",
        payload: "Score scale 0–3 (Absent to Professional/Accomplished)",
    },
    {
        value: "none",
        label: "No description",
        payload: "",
    },
    {
        value: "other",
        label: "Others (please specify)",
        payload: "",
    },
]

const TEMPLATE_VERSION_OPTIONS = ["1", "2", "3", "4", "5", "other"] as const

const CRITERION_OPTIONS: SelectOption[] = [
    {
        value: "introduction-context-background",
        label: "Introduction (Context/Background)",
        payload: "Introduction (Context/Background)",
    },
    {
        value: "research-concept-question-problem-thesis-hypothesis-purpose-objectives",
        label: "Research Concept (Question/Problem/Thesis/Hypothesis/Purpose/Objectives)",
        payload: "Research Concept (Question/Problem/Thesis/Hypothesis/Purpose/Objectives)",
    },
    {
        value: "methodology-experimental-plan-creative-scholarly-process",
        label: "Methodology/Experimental Plan/Creative–Scholarly Process",
        payload: "Methodology/Experimental Plan/Creative–Scholarly Process",
    },
    {
        value: "project-presentation",
        label: "Project Presentation",
        payload: "Project Presentation",
    },
    // NOTE: kept in source list, but table/add flow below intentionally uses select-only options (without "other")
    {
        value: "other",
        label: "Others (please specify)",
        payload: "",
    },
]

const CRITERION_SELECT_OPTIONS: SelectOption[] = CRITERION_OPTIONS.filter(
    (option) => option.value !== "other",
)

const WEIGHT_OPTIONS: SelectOption[] = [
    { value: "25", label: "25%", payload: "25" },
    { value: "20", label: "20%", payload: "20" },
    { value: "15", label: "15%", payload: "15" },
    { value: "10", label: "10%", payload: "10" },
    { value: "5", label: "5%", payload: "5" },
    // NOTE: kept in source list, but table/add flow below intentionally uses select-only options (without "other")
    { value: "other", label: "Others (please specify)", payload: "" },
]

const WEIGHT_SELECT_OPTIONS: SelectOption[] = WEIGHT_OPTIONS.filter(
    (option) => option.value !== "other",
)

const SCORE_OPTIONS: SelectOption[] = [
    { value: "0", label: "0 - Absent", payload: "0" },
    { value: "1", label: "1 - Developing", payload: "1" },
    { value: "2", label: "2 - Competent", payload: "2" },
    { value: "3", label: "3 - Professional/Accomplished", payload: "3" },
]

const CRITERION_DESCRIPTION_OPTIONS: SelectOption[] = [
    {
        value: "none",
        label: "No description",
        payload: "",
    },
    {
        value: "measurable-and-clear",
        label: "Measurable and clearly stated.",
        payload: "Measurable and clearly stated.",
    },
    {
        value: "aligned-with-objectives",
        label: "Aligned with stated objectives.",
        payload: "Aligned with stated objectives.",
    },
    {
        value: "shows-strong-evidence",
        label: "Shows strong supporting evidence.",
        payload: "Shows strong supporting evidence.",
    },
    {
        value: "partially-meets-expectations",
        label: "Partially meets expectations.",
        payload: "Partially meets expectations.",
    },
]

function getOptionPayload(options: SelectOption[], value: string) {
    return options.find((option) => option.value === value)?.payload ?? ""
}

function findSelectionByPayload(options: SelectOption[], payload: string) {
    const matched = options.find((option) => option.value !== "other" && option.payload === payload)
    return matched?.value ?? "other"
}

function toNumber(value: unknown, fallback = 0) {
    const n = typeof value === "number" ? value : Number(value)
    return Number.isFinite(n) ? n : fallback
}

function formatDate(value: string) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
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

function normalizeTemplate(value: unknown): RubricTemplate | null {
    if (!isRecord(value)) return null

    const id = typeof value.id === "string" ? value.id : ""
    const name = typeof value.name === "string" ? value.name : ""
    if (!id || !name) return null

    return {
        id,
        name,
        version: toNumber(value.version, 1),
        active: Boolean(value.active),
        description: typeof value.description === "string" ? value.description : null,
        created_at: typeof value.created_at === "string" ? value.created_at : "",
        updated_at: typeof value.updated_at === "string" ? value.updated_at : "",
    }
}

function normalizeCriterion(value: unknown): RubricCriterion | null {
    if (!isRecord(value)) return null

    const id = typeof value.id === "string" ? value.id : ""
    const templateId = typeof value.template_id === "string" ? value.template_id : ""
    const criterion = typeof value.criterion === "string" ? value.criterion : ""

    if (!id || !templateId || !criterion) return null

    return {
        id,
        template_id: templateId,
        criterion,
        description: typeof value.description === "string" ? value.description : null,
        weight: toNumber(value.weight, 0),
        min_score: toNumber(value.min_score, 0),
        max_score: toNumber(value.max_score, 3),
        created_at: typeof value.created_at === "string" ? value.created_at : "",
    }
}

function slugifyForValue(input: string) {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
}

function ensureOptionByPayload(
    options: SelectOption[],
    payload: string,
    currentLabelPrefix: string,
): SelectOption[] {
    const normalized = payload.trim()
    if (!normalized) return options

    const exists = options.some((option) => option.payload === normalized)
    if (exists) return options

    return [
        {
            value: `current-${slugifyForValue(normalized)}-${normalized.length}`,
            label: `${currentLabelPrefix}: ${normalized}`,
            payload: normalized,
        },
        ...options,
    ]
}

function ensureNumericPayloadOption(
    options: SelectOption[],
    value: number,
    labelFormatter: (payload: string) => string,
): SelectOption[] {
    const payload = String(value)
    const exists = options.some((option) => option.payload === payload)
    if (exists) return options

    return [
        {
            value: `current-${payload.replace(/[^0-9.-]/g, "")}`,
            label: `Current: ${labelFormatter(payload)}`,
            payload,
        },
        ...options,
    ]
}

function toDescriptionSelectValue(value: string | null | undefined): string {
    const normalized = (value ?? "").trim()
    return normalized.length > 0 ? normalized : NO_DESCRIPTION_SELECT_VALUE
}

function fromDescriptionSelectValue(value: string): string | null {
    return value === NO_DESCRIPTION_SELECT_VALUE ? null : value
}

function buildDescriptionOptionsForCurrent(current: string | null | undefined): SelectOption[] {
    const normalized = (current ?? "").trim()
    const base = [...CRITERION_DESCRIPTION_OPTIONS]

    if (!normalized) return base
    const exists = base.some((option) => option.payload === normalized)
    if (exists) return base

    return [
        {
            value: `current-${slugifyForValue(normalized)}-${normalized.length}`,
            label: `Current: ${normalized}`,
            payload: normalized,
        },
        ...base,
    ]
}

export default function AdminRubricTemplateDetailsPage() {
    const params = useParams() as { id?: string | string[] }
    const templateId = React.useMemo(() => {
        const raw = params?.id
        if (Array.isArray(raw)) return raw[0] ?? ""
        return raw ?? ""
    }, [params])

    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [template, setTemplate] = React.useState<RubricTemplate | null>(null)
    const [form, setForm] = React.useState<TemplateForm>({
        name: "",
        description: "",
        version: 1,
        active: false,
    })

    const [templateNameSelection, setTemplateNameSelection] = React.useState<string>("other")
    const [templateDescriptionSelection, setTemplateDescriptionSelection] =
        React.useState<string>("none")
    const [templateVersionSelection, setTemplateVersionSelection] = React.useState<string>("1")

    const [criteria, setCriteria] = React.useState<RubricCriterion[]>([])
    const [savingTemplate, setSavingTemplate] = React.useState(false)
    const [busyCriterionId, setBusyCriterionId] = React.useState<string | null>(null)
    const [addingCriterion, setAddingCriterion] = React.useState(false)

    const [newCriterionSelection, setNewCriterionSelection] = React.useState<string>(
        CRITERION_SELECT_OPTIONS[0]?.value ?? "",
    )
    const [newCriterionWeightSelection, setNewCriterionWeightSelection] = React.useState<string>(
        WEIGHT_SELECT_OPTIONS[0]?.value ?? "",
    )
    const [newCriterionDescriptionSelection, setNewCriterionDescriptionSelection] =
        React.useState<string>(NO_DESCRIPTION_SELECT_VALUE)

    const [newCriterion, setNewCriterion] = React.useState<CriterionForm>({
        criterion: getOptionPayload(CRITERION_SELECT_OPTIONS, CRITERION_SELECT_OPTIONS[0]?.value ?? ""),
        description: "",
        weight: toNumber(getOptionPayload(WEIGHT_SELECT_OPTIONS, WEIGHT_SELECT_OPTIONS[0]?.value ?? ""), 25),
        min_score: 0,
        max_score: 3,
    })

    const loadTemplateAndCriteria = React.useCallback(async () => {
        if (!templateId) {
            const message = "Invalid template ID."
            setError(message)
            setLoading(false)
            toast.error(message)
            return
        }

        setLoading(true)
        setError(null)

        try {
            const templateRes = await fetch(`/api/rubric-templates/${templateId}`, {
                cache: "no-store",
            })

            if (!templateRes.ok) {
                throw new Error(await readErrorMessage(templateRes))
            }

            const templateData = await readJsonRecord(templateRes)
            const loadedTemplate = normalizeTemplate(templateData.item ?? templateData)

            if (!loadedTemplate) {
                throw new Error("Template payload is invalid.")
            }

            setTemplate(loadedTemplate)
            setForm({
                name: loadedTemplate.name,
                description: loadedTemplate.description ?? "",
                version: loadedTemplate.version,
                active: loadedTemplate.active,
            })

            setTemplateNameSelection(findSelectionByPayload(TEMPLATE_NAME_OPTIONS, loadedTemplate.name))
            setTemplateDescriptionSelection(
                findSelectionByPayload(TEMPLATE_DESCRIPTION_OPTIONS, loadedTemplate.description ?? ""),
            )

            const loadedVersion = String(Math.max(1, Math.floor(loadedTemplate.version)))
            if (TEMPLATE_VERSION_OPTIONS.includes(loadedVersion as (typeof TEMPLATE_VERSION_OPTIONS)[number])) {
                setTemplateVersionSelection(loadedVersion)
            } else {
                setTemplateVersionSelection("other")
            }

            const criteriaRes = await fetch(`/api/rubric-templates/${templateId}/criteria`, {
                cache: "no-store",
            })

            if (criteriaRes.ok) {
                const criteriaData = await readJsonRecord(criteriaRes)
                const rawItems = Array.isArray(criteriaData.items) ? criteriaData.items : []
                const normalized = rawItems
                    .map((item) => normalizeCriterion(item))
                    .filter((item): item is RubricCriterion => item !== null)

                setCriteria(normalized)
            } else if (criteriaRes.status === 404) {
                setCriteria([])
            } else {
                throw new Error(await readErrorMessage(criteriaRes))
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load rubric template."
            setError(message)
            setTemplate(null)
            setCriteria([])
            toast.error(message)
        } finally {
            setLoading(false)
        }
    }, [templateId])

    React.useEffect(() => {
        void loadTemplateAndCriteria()
    }, [loadTemplateAndCriteria])

    const saveTemplate = React.useCallback(async () => {
        if (!templateId) return

        const name =
            templateNameSelection === "other"
                ? form.name.trim()
                : getOptionPayload(TEMPLATE_NAME_OPTIONS, templateNameSelection).trim()

        const descriptionRaw =
            templateDescriptionSelection === "none"
                ? ""
                : templateDescriptionSelection === "other"
                    ? form.description.trim()
                    : getOptionPayload(TEMPLATE_DESCRIPTION_OPTIONS, templateDescriptionSelection).trim()

        const version =
            templateVersionSelection === "other"
                ? Math.max(1, Math.floor(toNumber(form.version, 1)))
                : Math.max(1, Math.floor(toNumber(templateVersionSelection, 1)))

        if (!name) {
            const message = "Template name is required."
            setError(message)
            toast.error(message)
            return
        }

        setSavingTemplate(true)
        setError(null)

        try {
            const res = await fetch(`/api/rubric-templates/${templateId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    description: descriptionRaw.length > 0 ? descriptionRaw : null,
                    version,
                    active: form.active,
                }),
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = await readJsonRecord(res)
            const updated = normalizeTemplate(data.item ?? data)

            if (updated) {
                setTemplate(updated)
                setForm({
                    name: updated.name,
                    description: updated.description ?? "",
                    version: updated.version,
                    active: updated.active,
                })

                setTemplateNameSelection(findSelectionByPayload(TEMPLATE_NAME_OPTIONS, updated.name))
                setTemplateDescriptionSelection(
                    findSelectionByPayload(TEMPLATE_DESCRIPTION_OPTIONS, updated.description ?? ""),
                )

                const updatedVersion = String(Math.max(1, Math.floor(updated.version)))
                if (
                    TEMPLATE_VERSION_OPTIONS.includes(
                        updatedVersion as (typeof TEMPLATE_VERSION_OPTIONS)[number],
                    )
                ) {
                    setTemplateVersionSelection(updatedVersion)
                } else {
                    setTemplateVersionSelection("other")
                }
            } else {
                setTemplate((prev) =>
                    prev
                        ? {
                            ...prev,
                            name,
                            description: descriptionRaw.length > 0 ? descriptionRaw : null,
                            version,
                            active: form.active,
                            updated_at: new Date().toISOString(),
                        }
                        : prev,
                )
            }

            toast.success("Template saved successfully.")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to save template."
            setError(message)
            toast.error(message)
        } finally {
            setSavingTemplate(false)
        }
    }, [
        form.active,
        form.description,
        form.name,
        form.version,
        templateDescriptionSelection,
        templateId,
        templateNameSelection,
        templateVersionSelection,
    ])

    const updateCriterionField = React.useCallback(
        <K extends keyof RubricCriterion>(id: string, key: K, value: RubricCriterion[K]) => {
            setCriteria((prev) =>
                prev.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
            )
        },
        [],
    )

    const addCriterion = React.useCallback(async () => {
        if (!templateId) return

        const criterion = getOptionPayload(CRITERION_SELECT_OPTIONS, newCriterionSelection).trim()
        const description = (fromDescriptionSelectValue(newCriterionDescriptionSelection) ?? "").trim()
        const weight = toNumber(getOptionPayload(WEIGHT_SELECT_OPTIONS, newCriterionWeightSelection), 0)
        const minScore = Math.floor(toNumber(newCriterion.min_score, 0))
        const maxScore = Math.floor(toNumber(newCriterion.max_score, 3))

        if (!criterion) {
            const message = "Criterion title is required."
            setError(message)
            toast.error(message)
            return
        }

        if (maxScore < minScore) {
            const message = "Max score must be greater than or equal to min score."
            setError(message)
            toast.error(message)
            return
        }

        setAddingCriterion(true)
        setError(null)

        try {
            const res = await fetch(`/api/rubric-templates/${templateId}/criteria`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    criterion,
                    description: description.length > 0 ? description : null,
                    weight,
                    min_score: minScore,
                    max_score: maxScore,
                }),
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = await readJsonRecord(res)
            const created = normalizeCriterion(data.item ?? data)

            if (created) {
                setCriteria((prev) => [...prev, created])
            } else {
                await loadTemplateAndCriteria()
            }

            setNewCriterionSelection(CRITERION_SELECT_OPTIONS[0]?.value ?? "")
            setNewCriterionWeightSelection(WEIGHT_SELECT_OPTIONS[0]?.value ?? "")
            setNewCriterionDescriptionSelection(NO_DESCRIPTION_SELECT_VALUE)
            setNewCriterion({
                criterion: getOptionPayload(CRITERION_SELECT_OPTIONS, CRITERION_SELECT_OPTIONS[0]?.value ?? ""),
                description: "",
                weight: toNumber(
                    getOptionPayload(WEIGHT_SELECT_OPTIONS, WEIGHT_SELECT_OPTIONS[0]?.value ?? ""),
                    25,
                ),
                min_score: 0,
                max_score: 3,
            })

            toast.success("Criterion added successfully.")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to add criterion."
            setError(message)
            toast.error(message)
        } finally {
            setAddingCriterion(false)
        }
    }, [
        loadTemplateAndCriteria,
        newCriterion.max_score,
        newCriterion.min_score,
        newCriterionDescriptionSelection,
        newCriterionSelection,
        newCriterionWeightSelection,
        templateId,
    ])

    const saveCriterion = React.useCallback(
        async (criterion: RubricCriterion) => {
            if (!templateId || busyCriterionId) return

            const cleanedCriterion = criterion.criterion.trim()
            const minScore = Math.floor(toNumber(criterion.min_score, 0))
            const maxScore = Math.floor(toNumber(criterion.max_score, 3))

            if (!cleanedCriterion) {
                const message = "Criterion title cannot be empty."
                setError(message)
                toast.error(message)
                return
            }

            if (maxScore < minScore) {
                const message = "Max score must be greater than or equal to min score."
                setError(message)
                toast.error(message)
                return
            }

            setBusyCriterionId(criterion.id)
            setError(null)

            try {
                const res = await fetch(
                    `/api/rubric-templates/${templateId}/criteria/${criterion.id}`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            criterion: cleanedCriterion,
                            description:
                                criterion.description && criterion.description.trim().length > 0
                                    ? criterion.description.trim()
                                    : null,
                            weight: toNumber(criterion.weight, 0),
                            min_score: minScore,
                            max_score: maxScore,
                        }),
                    },
                )

                if (!res.ok) {
                    throw new Error(await readErrorMessage(res))
                }

                const data = await readJsonRecord(res)
                const updated = normalizeCriterion(data.item ?? data)

                if (updated) {
                    setCriteria((prev) =>
                        prev.map((item) => (item.id === criterion.id ? updated : item)),
                    )
                }

                toast.success("Criterion updated successfully.")
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to update criterion."
                setError(message)
                toast.error(message)
            } finally {
                setBusyCriterionId(null)
            }
        },
        [busyCriterionId, templateId],
    )

    const deleteCriterion = React.useCallback(
        async (criterionId: string) => {
            if (!templateId || busyCriterionId) return

            setBusyCriterionId(criterionId)
            setError(null)

            try {
                const res = await fetch(
                    `/api/rubric-templates/${templateId}/criteria/${criterionId}`,
                    {
                        method: "DELETE",
                    },
                )

                if (!res.ok) {
                    throw new Error(await readErrorMessage(res))
                }

                setCriteria((prev) => prev.filter((item) => item.id !== criterionId))
                toast.success("Criterion deleted successfully.")
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to delete criterion."
                setError(message)
                toast.error(message)
            } finally {
                setBusyCriterionId(null)
            }
        },
        [busyCriterionId, templateId],
    )

    return (
        <DashboardLayout
            title="Rubric Template Details"
            description="Edit template metadata and manage weighted criteria."
        >
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/dashboard/admin/rubric-templates">Back to Templates</Link>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void loadTemplateAndCriteria()}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                {loading ? (
                    <div className="space-y-3 rounded-lg border bg-card p-4">
                        <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                        <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                        <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                    </div>
                ) : !template ? (
                    <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                        Template not found.
                    </div>
                ) : (
                    <>
                        <div className="rounded-lg border bg-card p-4">
                            <div className="space-y-3">
                                <div className="flex flex-col gap-1">
                                    <p className="text-sm font-medium">Template Information</p>
                                    <p className="text-xs text-muted-foreground">ID: {template.id}</p>
                                    <p className="text-xs text-muted-foreground">
                                        Last updated: {formatDate(template.updated_at)}
                                    </p>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground">Template name</p>
                                        <Select
                                            value={templateNameSelection}
                                            onValueChange={(value) => {
                                                setTemplateNameSelection(value)
                                                if (value === "other") {
                                                    setForm((prev) => ({ ...prev, name: "" }))
                                                    return
                                                }

                                                const payload = getOptionPayload(TEMPLATE_NAME_OPTIONS, value)
                                                setForm((prev) => ({ ...prev, name: payload }))
                                            }}
                                            disabled={savingTemplate}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select template name" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {TEMPLATE_NAME_OPTIONS.map((option) => (
                                                    <SelectItem key={option.value} value={option.value}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        {templateNameSelection === "other" ? (
                                            <Input
                                                placeholder="Please specify template name"
                                                value={form.name}
                                                onChange={(e) =>
                                                    setForm((prev) => ({ ...prev, name: e.target.value }))
                                                }
                                                disabled={savingTemplate}
                                            />
                                        ) : null}
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground">Version</p>
                                        <Select
                                            value={templateVersionSelection}
                                            onValueChange={(value) => {
                                                setTemplateVersionSelection(value)
                                                if (value === "other") return
                                                setForm((prev) => ({
                                                    ...prev,
                                                    version: Math.max(1, Math.floor(toNumber(value, prev.version))),
                                                }))
                                            }}
                                            disabled={savingTemplate}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select version" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">Version 1</SelectItem>
                                                <SelectItem value="2">Version 2</SelectItem>
                                                <SelectItem value="3">Version 3</SelectItem>
                                                <SelectItem value="4">Version 4</SelectItem>
                                                <SelectItem value="5">Version 5</SelectItem>
                                                <SelectItem value="other">Others (please specify)</SelectItem>
                                            </SelectContent>
                                        </Select>

                                        {templateVersionSelection === "other" ? (
                                            <Input
                                                type="number"
                                                min={1}
                                                step={1}
                                                placeholder="Please specify version"
                                                value={form.version}
                                                onChange={(e) =>
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        version: Math.max(1, toNumber(e.target.value, prev.version)),
                                                    }))
                                                }
                                                disabled={savingTemplate}
                                            />
                                        ) : null}
                                    </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground">Description</p>
                                        <Select
                                            value={templateDescriptionSelection}
                                            onValueChange={(value) => {
                                                setTemplateDescriptionSelection(value)
                                                if (value === "none") {
                                                    setForm((prev) => ({ ...prev, description: "" }))
                                                    return
                                                }
                                                if (value === "other") {
                                                    setForm((prev) => ({ ...prev, description: "" }))
                                                    return
                                                }

                                                const payload = getOptionPayload(TEMPLATE_DESCRIPTION_OPTIONS, value)
                                                setForm((prev) => ({ ...prev, description: payload }))
                                            }}
                                            disabled={savingTemplate}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select description" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {TEMPLATE_DESCRIPTION_OPTIONS.map((option) => (
                                                    <SelectItem key={option.value} value={option.value}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        {templateDescriptionSelection === "other" ? (
                                            <Input
                                                placeholder="Please specify description"
                                                value={form.description}
                                                onChange={(e) =>
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        description: e.target.value,
                                                    }))
                                                }
                                                disabled={savingTemplate}
                                            />
                                        ) : null}
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground">Status</p>
                                        <Select
                                            value={form.active ? "active" : "inactive"}
                                            onValueChange={(value) =>
                                                setForm((prev) => ({ ...prev, active: value === "active" }))
                                            }
                                            disabled={savingTemplate}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select status" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="inactive">Inactive</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <span
                                        className={[
                                            "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                            form.active
                                                ? "border-primary/40 bg-primary/10 text-foreground"
                                                : "border-muted-foreground/30 bg-muted text-muted-foreground",
                                        ].join(" ")}
                                    >
                                        {form.active ? "Active" : "Inactive"}
                                    </span>

                                    <Button onClick={() => void saveTemplate()} disabled={savingTemplate}>
                                        {savingTemplate ? "Saving..." : "Save Template"}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg border bg-card p-4">
                            <div className="space-y-3">
                                <p className="text-sm font-medium">Add Criterion</p>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground">Criterion</p>
                                        <Select
                                            value={newCriterionSelection}
                                            onValueChange={(value) => {
                                                setNewCriterionSelection(value)
                                                const payload = getOptionPayload(CRITERION_SELECT_OPTIONS, value)
                                                setNewCriterion((prev) => ({ ...prev, criterion: payload }))
                                            }}
                                            disabled={addingCriterion}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select criterion" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {CRITERION_SELECT_OPTIONS.map((option) => (
                                                    <SelectItem key={option.value} value={option.value}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground">Description</p>
                                        <Select
                                            value={newCriterionDescriptionSelection}
                                            onValueChange={(value) => {
                                                setNewCriterionDescriptionSelection(value)
                                                setNewCriterion((prev) => ({
                                                    ...prev,
                                                    description: fromDescriptionSelectValue(value) ?? "",
                                                }))
                                            }}
                                            disabled={addingCriterion}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select description" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {CRITERION_DESCRIPTION_OPTIONS.map((option) => {
                                                    const selectValue =
                                                        option.payload.length > 0
                                                            ? option.payload
                                                            : NO_DESCRIPTION_SELECT_VALUE

                                                    return (
                                                        <SelectItem key={option.value} value={selectValue}>
                                                            {option.label}
                                                        </SelectItem>
                                                    )
                                                })}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-3">
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground">Weight</p>
                                        <Select
                                            value={newCriterionWeightSelection}
                                            onValueChange={(value) => {
                                                setNewCriterionWeightSelection(value)
                                                setNewCriterion((prev) => ({
                                                    ...prev,
                                                    weight: toNumber(
                                                        getOptionPayload(WEIGHT_SELECT_OPTIONS, value),
                                                        prev.weight,
                                                    ),
                                                }))
                                            }}
                                            disabled={addingCriterion}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select weight" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {WEIGHT_SELECT_OPTIONS.map((option) => (
                                                    <SelectItem key={option.value} value={option.value}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground">Min score</p>
                                        <Select
                                            value={String(newCriterion.min_score)}
                                            onValueChange={(value) =>
                                                setNewCriterion((prev) => ({
                                                    ...prev,
                                                    min_score: toNumber(value, prev.min_score),
                                                }))
                                            }
                                            disabled={addingCriterion}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select min score" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {SCORE_OPTIONS.map((option) => (
                                                    <SelectItem key={option.value} value={option.payload}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground">Max score</p>
                                        <Select
                                            value={String(newCriterion.max_score)}
                                            onValueChange={(value) =>
                                                setNewCriterion((prev) => ({
                                                    ...prev,
                                                    max_score: toNumber(value, prev.max_score),
                                                }))
                                            }
                                            disabled={addingCriterion}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select max score" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {SCORE_OPTIONS.map((option) => (
                                                    <SelectItem key={option.value} value={option.payload}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <p className="text-xs text-muted-foreground">
                                    Score guide: 0 - Absent, 1 - Developing, 2 - Competent, 3 - Professional/Accomplished.
                                </p>

                                <Button onClick={() => void addCriterion()} disabled={addingCriterion}>
                                    {addingCriterion ? "Adding..." : "Add Criterion"}
                                </Button>
                            </div>
                        </div>

                        <div className="overflow-x-auto rounded-lg border bg-card">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-56">Criterion</TableHead>
                                        <TableHead className="min-w-24">Weight</TableHead>
                                        <TableHead className="min-w-24">Min</TableHead>
                                        <TableHead className="min-w-24">Max</TableHead>
                                        <TableHead className="min-w-56">Description</TableHead>
                                        <TableHead className="min-w-52 text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {criteria.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                                No criteria found for this template.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        criteria.map((item) => {
                                            const busy = busyCriterionId === item.id

                                            const rowCriterionOptions = ensureOptionByPayload(
                                                CRITERION_SELECT_OPTIONS,
                                                item.criterion,
                                                "Current",
                                            )

                                            const rowWeightOptions = ensureNumericPayloadOption(
                                                WEIGHT_SELECT_OPTIONS,
                                                item.weight,
                                                (payload) => `${payload}%`,
                                            )

                                            const rowMinOptions = ensureNumericPayloadOption(
                                                SCORE_OPTIONS,
                                                item.min_score,
                                                (payload) => payload,
                                            )

                                            const rowMaxOptions = ensureNumericPayloadOption(
                                                SCORE_OPTIONS,
                                                item.max_score,
                                                (payload) => payload,
                                            )

                                            const rowDescriptionOptions = buildDescriptionOptionsForCurrent(
                                                item.description,
                                            )

                                            return (
                                                <TableRow key={item.id}>
                                                    <TableCell>
                                                        <Select
                                                            value={item.criterion}
                                                            onValueChange={(value) =>
                                                                updateCriterionField(item.id, "criterion", value)
                                                            }
                                                            disabled={busy}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select criterion" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {rowCriterionOptions.map((option) => (
                                                                    <SelectItem
                                                                        key={`${item.id}-criterion-${option.value}`}
                                                                        value={option.payload}
                                                                    >
                                                                        {option.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>

                                                    <TableCell>
                                                        <Select
                                                            value={String(item.weight)}
                                                            onValueChange={(value) =>
                                                                updateCriterionField(
                                                                    item.id,
                                                                    "weight",
                                                                    toNumber(value, item.weight),
                                                                )
                                                            }
                                                            disabled={busy}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select weight" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {rowWeightOptions.map((option) => (
                                                                    <SelectItem
                                                                        key={`${item.id}-weight-${option.value}`}
                                                                        value={option.payload}
                                                                    >
                                                                        {option.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>

                                                    <TableCell>
                                                        <Select
                                                            value={String(item.min_score)}
                                                            onValueChange={(value) =>
                                                                updateCriterionField(
                                                                    item.id,
                                                                    "min_score",
                                                                    toNumber(value, item.min_score),
                                                                )
                                                            }
                                                            disabled={busy}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select min score" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {rowMinOptions.map((option) => (
                                                                    <SelectItem
                                                                        key={`${item.id}-min-${option.value}`}
                                                                        value={option.payload}
                                                                    >
                                                                        {option.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>

                                                    <TableCell>
                                                        <Select
                                                            value={String(item.max_score)}
                                                            onValueChange={(value) =>
                                                                updateCriterionField(
                                                                    item.id,
                                                                    "max_score",
                                                                    toNumber(value, item.max_score),
                                                                )
                                                            }
                                                            disabled={busy}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select max score" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {rowMaxOptions.map((option) => (
                                                                    <SelectItem
                                                                        key={`${item.id}-max-${option.value}`}
                                                                        value={option.payload}
                                                                    >
                                                                        {option.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>

                                                    <TableCell>
                                                        <Select
                                                            value={toDescriptionSelectValue(item.description)}
                                                            onValueChange={(value) =>
                                                                updateCriterionField(
                                                                    item.id,
                                                                    "description",
                                                                    fromDescriptionSelectValue(value),
                                                                )
                                                            }
                                                            disabled={busy}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select description" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {rowDescriptionOptions.map((option) => {
                                                                    const optionValue =
                                                                        option.payload.length > 0
                                                                            ? option.payload
                                                                            : NO_DESCRIPTION_SELECT_VALUE

                                                                    return (
                                                                        <SelectItem
                                                                            key={`${item.id}-desc-${option.value}`}
                                                                            value={optionValue}
                                                                        >
                                                                            {option.label}
                                                                        </SelectItem>
                                                                    )
                                                                })}
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>

                                                    <TableCell>
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => void saveCriterion(item)}
                                                                disabled={busy}
                                                            >
                                                                {busy ? "Saving..." : "Save"}
                                                            </Button>

                                                            <AlertDialog>
                                                                <AlertDialogTrigger asChild>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        disabled={busy}
                                                                    >
                                                                        Delete
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>
                                                                            Delete criterion?
                                                                        </AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            This action cannot be undone. This will permanently
                                                                            remove{" "}
                                                                            <span className="font-medium text-foreground">
                                                                                {item.criterion}
                                                                            </span>{" "}
                                                                            from this rubric template.
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel disabled={busy}>
                                                                            Cancel
                                                                        </AlertDialogCancel>
                                                                        <AlertDialogAction
                                                                            onClick={() => void deleteCriterion(item.id)}
                                                                            disabled={busy}
                                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                        >
                                                                            {busy ? "Deleting..." : "Delete criterion"}
                                                                        </AlertDialogAction>
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    )
}
