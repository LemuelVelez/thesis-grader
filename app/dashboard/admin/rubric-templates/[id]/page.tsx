"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
        min_score: toNumber(value.min_score, 1),
        max_score: toNumber(value.max_score, 5),
        created_at: typeof value.created_at === "string" ? value.created_at : "",
    }
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

    const [criteria, setCriteria] = React.useState<RubricCriterion[]>([])
    const [savingTemplate, setSavingTemplate] = React.useState(false)
    const [busyCriterionId, setBusyCriterionId] = React.useState<string | null>(null)
    const [addingCriterion, setAddingCriterion] = React.useState(false)

    const [newCriterion, setNewCriterion] = React.useState<CriterionForm>({
        criterion: "",
        description: "",
        weight: 0,
        min_score: 1,
        max_score: 5,
    })

    const loadTemplateAndCriteria = React.useCallback(async () => {
        if (!templateId) {
            setError("Invalid template ID.")
            setLoading(false)
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
                // Optional endpoint fallback: allow detail page to still render.
                setCriteria([])
            } else {
                throw new Error(await readErrorMessage(criteriaRes))
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load rubric template.")
            setTemplate(null)
            setCriteria([])
        } finally {
            setLoading(false)
        }
    }, [templateId])

    React.useEffect(() => {
        void loadTemplateAndCriteria()
    }, [loadTemplateAndCriteria])

    const saveTemplate = React.useCallback(async () => {
        if (!templateId) return

        const name = form.name.trim()
        const description = form.description.trim()
        const version = Math.max(1, Math.floor(toNumber(form.version, 1)))

        if (!name) {
            setError("Template name is required.")
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
                    description: description.length > 0 ? description : null,
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
            } else {
                setTemplate((prev) =>
                    prev
                        ? {
                            ...prev,
                            name,
                            description: description.length > 0 ? description : null,
                            version,
                            active: form.active,
                            updated_at: new Date().toISOString(),
                        }
                        : prev,
                )
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save template.")
        } finally {
            setSavingTemplate(false)
        }
    }, [form, templateId])

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

        const criterion = newCriterion.criterion.trim()
        const description = newCriterion.description.trim()
        const weight = toNumber(newCriterion.weight, 0)
        const minScore = Math.floor(toNumber(newCriterion.min_score, 1))
        const maxScore = Math.floor(toNumber(newCriterion.max_score, 5))

        if (!criterion) {
            setError("Criterion title is required.")
            return
        }

        if (maxScore < minScore) {
            setError("Max score must be greater than or equal to min score.")
            return
        }

        setAddingCriterion(true)
        setError(null)

        try {
            const res = await fetch(`/api/rubric-templates/${templateId}/criteria`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    template_id: templateId,
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

            setNewCriterion({
                criterion: "",
                description: "",
                weight: 0,
                min_score: 1,
                max_score: 5,
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to add criterion.")
        } finally {
            setAddingCriterion(false)
        }
    }, [loadTemplateAndCriteria, newCriterion, templateId])

    const saveCriterion = React.useCallback(
        async (criterion: RubricCriterion) => {
            if (!templateId || busyCriterionId) return

            setBusyCriterionId(criterion.id)
            setError(null)

            try {
                const res = await fetch(
                    `/api/rubric-templates/${templateId}/criteria/${criterion.id}`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            criterion: criterion.criterion.trim(),
                            description:
                                criterion.description && criterion.description.trim().length > 0
                                    ? criterion.description.trim()
                                    : null,
                            weight: toNumber(criterion.weight, 0),
                            min_score: Math.floor(toNumber(criterion.min_score, 1)),
                            max_score: Math.floor(toNumber(criterion.max_score, 5)),
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
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to update criterion.")
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
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to delete criterion.")
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

                                <div className="grid gap-2 md:grid-cols-2">
                                    <Input
                                        placeholder="Template name"
                                        value={form.name}
                                        onChange={(e) =>
                                            setForm((prev) => ({ ...prev, name: e.target.value }))
                                        }
                                        disabled={savingTemplate}
                                    />
                                    <Input
                                        type="number"
                                        min={1}
                                        step={1}
                                        placeholder="Version"
                                        value={form.version}
                                        onChange={(e) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                version: toNumber(e.target.value, prev.version),
                                            }))
                                        }
                                        disabled={savingTemplate}
                                    />
                                </div>

                                <Input
                                    placeholder="Description (optional)"
                                    value={form.description}
                                    onChange={(e) =>
                                        setForm((prev) => ({ ...prev, description: e.target.value }))
                                    }
                                    disabled={savingTemplate}
                                />

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

                                    <Button
                                        variant="outline"
                                        onClick={() =>
                                            setForm((prev) => ({ ...prev, active: !prev.active }))
                                        }
                                        disabled={savingTemplate}
                                    >
                                        {form.active ? "Set Inactive" : "Set Active"}
                                    </Button>

                                    <Button onClick={() => void saveTemplate()} disabled={savingTemplate}>
                                        {savingTemplate ? "Saving..." : "Save Template"}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg border bg-card p-4">
                            <div className="space-y-3">
                                <p className="text-sm font-medium">Add Criterion</p>
                                <div className="grid gap-2 md:grid-cols-2">
                                    <Input
                                        placeholder="Criterion title"
                                        value={newCriterion.criterion}
                                        onChange={(e) =>
                                            setNewCriterion((prev) => ({
                                                ...prev,
                                                criterion: e.target.value,
                                            }))
                                        }
                                        disabled={addingCriterion}
                                    />
                                    <Input
                                        placeholder="Description (optional)"
                                        value={newCriterion.description}
                                        onChange={(e) =>
                                            setNewCriterion((prev) => ({
                                                ...prev,
                                                description: e.target.value,
                                            }))
                                        }
                                        disabled={addingCriterion}
                                    />
                                </div>

                                <div className="grid gap-2 md:grid-cols-3">
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min={0}
                                        placeholder="Weight"
                                        value={newCriterion.weight}
                                        onChange={(e) =>
                                            setNewCriterion((prev) => ({
                                                ...prev,
                                                weight: toNumber(e.target.value, prev.weight),
                                            }))
                                        }
                                        disabled={addingCriterion}
                                    />
                                    <Input
                                        type="number"
                                        step={1}
                                        min={0}
                                        placeholder="Min score"
                                        value={newCriterion.min_score}
                                        onChange={(e) =>
                                            setNewCriterion((prev) => ({
                                                ...prev,
                                                min_score: toNumber(e.target.value, prev.min_score),
                                            }))
                                        }
                                        disabled={addingCriterion}
                                    />
                                    <Input
                                        type="number"
                                        step={1}
                                        min={0}
                                        placeholder="Max score"
                                        value={newCriterion.max_score}
                                        onChange={(e) =>
                                            setNewCriterion((prev) => ({
                                                ...prev,
                                                max_score: toNumber(e.target.value, prev.max_score),
                                            }))
                                        }
                                        disabled={addingCriterion}
                                    />
                                </div>

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

                                            return (
                                                <TableRow key={item.id}>
                                                    <TableCell>
                                                        <Input
                                                            value={item.criterion}
                                                            onChange={(e) =>
                                                                updateCriterionField(
                                                                    item.id,
                                                                    "criterion",
                                                                    e.target.value,
                                                                )
                                                            }
                                                            disabled={busy}
                                                        />
                                                    </TableCell>

                                                    <TableCell>
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            min={0}
                                                            value={item.weight}
                                                            onChange={(e) =>
                                                                updateCriterionField(
                                                                    item.id,
                                                                    "weight",
                                                                    toNumber(e.target.value, item.weight),
                                                                )
                                                            }
                                                            disabled={busy}
                                                        />
                                                    </TableCell>

                                                    <TableCell>
                                                        <Input
                                                            type="number"
                                                            step={1}
                                                            min={0}
                                                            value={item.min_score}
                                                            onChange={(e) =>
                                                                updateCriterionField(
                                                                    item.id,
                                                                    "min_score",
                                                                    toNumber(e.target.value, item.min_score),
                                                                )
                                                            }
                                                            disabled={busy}
                                                        />
                                                    </TableCell>

                                                    <TableCell>
                                                        <Input
                                                            type="number"
                                                            step={1}
                                                            min={0}
                                                            value={item.max_score}
                                                            onChange={(e) =>
                                                                updateCriterionField(
                                                                    item.id,
                                                                    "max_score",
                                                                    toNumber(e.target.value, item.max_score),
                                                                )
                                                            }
                                                            disabled={busy}
                                                        />
                                                    </TableCell>

                                                    <TableCell>
                                                        <Input
                                                            value={item.description ?? ""}
                                                            onChange={(e) =>
                                                                updateCriterionField(
                                                                    item.id,
                                                                    "description",
                                                                    e.target.value,
                                                                )
                                                            }
                                                            disabled={busy}
                                                        />
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
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => void deleteCriterion(item.id)}
                                                                disabled={busy}
                                                            >
                                                                {busy ? "Deleting..." : "Delete"}
                                                            </Button>
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
