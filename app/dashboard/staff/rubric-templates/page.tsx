"use client"

import * as React from "react"
import { Eye, RefreshCw, Search, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
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

type ActiveFilter = "all" | "active" | "inactive"
type SortBy = "updated_desc" | "updated_asc" | "name_asc" | "name_desc"

function toNumber(value: unknown, fallback = 0) {
    const n = typeof value === "number" ? value : Number(value)
    return Number.isFinite(n) ? n : fallback
}

function toTimestamp(value: string) {
    const t = new Date(value).getTime()
    return Number.isFinite(t) ? t : 0
}

function formatDate(value: string) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value || "—"
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
        version: Math.max(1, Math.floor(toNumber(value.version, 1))),
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

export default function StaffRubricTemplatesPage() {
    const [templates, setTemplates] = React.useState<RubricTemplate[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>("all")
    const [sortBy, setSortBy] = React.useState<SortBy>("updated_desc")

    const [previewOpen, setPreviewOpen] = React.useState(false)
    const [previewTemplate, setPreviewTemplate] = React.useState<RubricTemplate | null>(null)
    const [previewCriteria, setPreviewCriteria] = React.useState<RubricCriterion[]>([])
    const [previewLoading, setPreviewLoading] = React.useState(false)
    const [previewError, setPreviewError] = React.useState<string | null>(null)
    const [previewBusyTemplateId, setPreviewBusyTemplateId] = React.useState<string | null>(null)

    const loadTemplates = React.useCallback(async (showSuccessToast = false) => {
        setLoading(true)
        setError(null)

        try {
            const res = await fetch("/api/rubric-templates", { cache: "no-store" })
            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = await readJsonRecord(res)
            const rawItems = Array.isArray(data.items) ? data.items : []
            const normalized = rawItems
                .map((item) => normalizeTemplate(item))
                .filter((item): item is RubricTemplate => item !== null)

            setTemplates(normalized)

            if (showSuccessToast) {
                toast.success(`Loaded ${normalized.length} rubric template(s).`)
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load rubric templates."
            setError(message)
            setTemplates([])
            toast.error(message)
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void loadTemplates()
    }, [loadTemplates])

    const fetchTemplateCriteria = React.useCallback(async (templateId: string) => {
        const res = await fetch(`/api/rubric-templates/${templateId}/criteria`, {
            cache: "no-store",
        })

        if (res.ok) {
            const data = await readJsonRecord(res)
            const rawItems = Array.isArray(data.items) ? data.items : []
            return rawItems
                .map((item) => normalizeCriterion(item))
                .filter((item): item is RubricCriterion => item !== null)
        }

        if (res.status === 404) return []

        throw new Error(await readErrorMessage(res))
    }, [])

    const openTemplatePreview = React.useCallback(
        async (template: RubricTemplate) => {
            setPreviewOpen(true)
            setPreviewTemplate(template)
            setPreviewCriteria([])
            setPreviewError(null)
            setPreviewLoading(true)
            setPreviewBusyTemplateId(template.id)

            try {
                const criteria = await fetchTemplateCriteria(template.id)
                setPreviewCriteria(criteria)
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Failed to load template criteria."
                setPreviewError(message)
                toast.error(message)
            } finally {
                setPreviewLoading(false)
                setPreviewBusyTemplateId(null)
            }
        },
        [fetchTemplateCriteria],
    )

    const reloadPreview = React.useCallback(async () => {
        if (!previewTemplate) return
        setPreviewLoading(true)
        setPreviewError(null)

        try {
            const criteria = await fetchTemplateCriteria(previewTemplate.id)
            setPreviewCriteria(criteria)
            toast.success("Template preview refreshed.")
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to refresh template preview."
            setPreviewError(message)
            toast.error(message)
        } finally {
            setPreviewLoading(false)
        }
    }, [fetchTemplateCriteria, previewTemplate])

    const stats = React.useMemo(() => {
        const total = templates.length
        const active = templates.filter((t) => t.active).length
        const inactive = total - active
        return { total, active, inactive }
    }, [templates])

    const filteredTemplates = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        const filtered = templates.filter((template) => {
            if (activeFilter === "active" && !template.active) return false
            if (activeFilter === "inactive" && template.active) return false

            if (!q) return true

            return (
                template.id.toLowerCase().includes(q) ||
                template.name.toLowerCase().includes(q) ||
                (template.description ?? "").toLowerCase().includes(q)
            )
        })

        const sorted = [...filtered].sort((a, b) => {
            if (sortBy === "updated_desc") return toTimestamp(b.updated_at) - toTimestamp(a.updated_at)
            if (sortBy === "updated_asc") return toTimestamp(a.updated_at) - toTimestamp(b.updated_at)
            if (sortBy === "name_asc") return a.name.localeCompare(b.name)
            return b.name.localeCompare(a.name)
        })

        return sorted
    }, [templates, activeFilter, search, sortBy])

    const previewWeightTotal = React.useMemo(
        () => previewCriteria.reduce((sum, item) => sum + toNumber(item.weight, 0), 0),
        [previewCriteria],
    )

    return (
        <DashboardLayout
            title="Rubric Templates"
            description="Browse and preview rubric templates available for staff workflows."
        >
            <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border bg-card p-4">
                        <p className="text-xs font-medium text-muted-foreground">Total Templates</p>
                        <p className="mt-2 text-2xl font-semibold tracking-tight">{stats.total}</p>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                        <p className="text-xs font-medium text-muted-foreground">Active</p>
                        <p className="mt-2 text-2xl font-semibold tracking-tight">{stats.active}</p>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                        <p className="text-xs font-medium text-muted-foreground">Inactive</p>
                        <p className="mt-2 text-2xl font-semibold tracking-tight">{stats.inactive}</p>
                    </div>
                </div>

                <div className="rounded-xl border bg-card p-4">
                    <div className="grid gap-3 md:grid-cols-12">
                        <div className="relative md:col-span-6">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by template name, ID, or description"
                                className="pl-9"
                            />
                        </div>

                        <div className="md:col-span-3">
                            <Select
                                value={activeFilter}
                                onValueChange={(value) => setActiveFilter(value as ActiveFilter)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Filter status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All status</SelectItem>
                                    <SelectItem value="active">Active only</SelectItem>
                                    <SelectItem value="inactive">Inactive only</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="md:col-span-3">
                            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
                                <SelectTrigger>
                                    <div className="flex items-center gap-2">
                                        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                                        <SelectValue placeholder="Sort by" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="updated_desc">Latest updated</SelectItem>
                                    <SelectItem value="updated_asc">Oldest updated</SelectItem>
                                    <SelectItem value="name_asc">Name A–Z</SelectItem>
                                    <SelectItem value="name_desc">Name Z–A</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-muted-foreground">
                            Showing{" "}
                            <span className="font-semibold text-foreground">{filteredTemplates.length}</span> of{" "}
                            <span className="font-semibold text-foreground">{templates.length}</span> template(s)
                        </p>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void loadTemplates(true)}
                            disabled={loading}
                        >
                            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                            {loading ? "Refreshing..." : "Refresh"}
                        </Button>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                <div className="overflow-x-auto rounded-xl border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-64">Template</TableHead>
                                <TableHead className="min-w-24">Version</TableHead>
                                <TableHead className="min-w-28">Status</TableHead>
                                <TableHead className="min-w-44">Updated</TableHead>
                                <TableHead className="min-w-36 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <TableRow key={`template-skeleton-${i}`}>
                                        <TableCell colSpan={5}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredTemplates.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                        No rubric templates found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredTemplates.map((template) => {
                                    const previewBusy = previewBusyTemplateId === template.id

                                    return (
                                        <TableRow key={template.id}>
                                            <TableCell>
                                                <div className="flex min-w-0 flex-col">
                                                    <span className="font-medium wrap-break-word">{template.name}</span>
                                                    <span className="text-xs text-muted-foreground break-all">
                                                        {template.id}
                                                    </span>
                                                    {template.description ? (
                                                        <span className="mt-1 text-xs text-muted-foreground wrap-break-word">
                                                            {template.description}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </TableCell>

                                            <TableCell>v{template.version}</TableCell>

                                            <TableCell>
                                                <span
                                                    className={[
                                                        "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                        template.active
                                                            ? "border-primary/40 bg-primary/10 text-foreground"
                                                            : "border-muted-foreground/30 bg-muted text-muted-foreground",
                                                    ].join(" ")}
                                                >
                                                    {template.active ? "Active" : "Inactive"}
                                                </span>
                                            </TableCell>

                                            <TableCell className="text-muted-foreground">
                                                {formatDate(template.updated_at)}
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={previewBusy}
                                                        onClick={() => void openTemplatePreview(template)}
                                                    >
                                                        <Eye className="mr-2 h-4 w-4" />
                                                        {previewBusy ? "Loading..." : "Preview"}
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
            </div>

            <Dialog
                open={previewOpen}
                onOpenChange={(open) => {
                    setPreviewOpen(open)
                    if (!open) setPreviewError(null)
                }}
            >
                <DialogContent className="w-full max-w-5xl overflow-hidden p-0">
                    <div className="max-h-[85vh] overflow-y-auto p-6">
                        <DialogHeader className="pr-8">
                            <DialogTitle>Template Preview</DialogTitle>
                            <DialogDescription>
                                Review rubric criteria and scoring range before using this template.
                            </DialogDescription>
                        </DialogHeader>

                        {previewTemplate ? (
                            <div className="mt-4 space-y-3">
                                <div className="grid gap-3 md:grid-cols-3">
                                    <div className="rounded-lg border bg-muted/30 p-3">
                                        <p className="text-xs text-muted-foreground">Template</p>
                                        <p className="mt-1 text-sm font-medium wrap-break-word">
                                            {previewTemplate.name}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border bg-muted/30 p-3">
                                        <p className="text-xs text-muted-foreground">Version</p>
                                        <p className="mt-1 text-sm font-medium">v{previewTemplate.version}</p>
                                    </div>
                                    <div className="rounded-lg border bg-muted/30 p-3">
                                        <p className="text-xs text-muted-foreground">Status</p>
                                        <p className="mt-1 text-sm font-medium">
                                            {previewTemplate.active ? "Active" : "Inactive"}
                                        </p>
                                    </div>
                                </div>

                                {previewTemplate.description ? (
                                    <div className="rounded-lg border bg-card p-3">
                                        <p className="text-xs text-muted-foreground">Description</p>
                                        <p className="mt-1 text-sm wrap-break-word">{previewTemplate.description}</p>
                                    </div>
                                ) : null}

                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="inline-flex rounded-md border bg-muted px-2 py-1 text-xs font-medium text-foreground">
                                            {previewCriteria.length} criterion
                                            {previewCriteria.length === 1 ? "" : "a"}
                                        </span>
                                        <span
                                            className={[
                                                "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                Math.abs(previewWeightTotal - 100) < 0.0001
                                                    ? "border-primary/40 bg-primary/10 text-foreground"
                                                    : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                                            ].join(" ")}
                                        >
                                            Total weight: {previewWeightTotal}%
                                        </span>
                                    </div>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => void reloadPreview()}
                                        disabled={previewLoading || !previewTemplate}
                                    >
                                        <RefreshCw
                                            className={`mr-2 h-4 w-4 ${previewLoading ? "animate-spin" : ""}`}
                                        />
                                        {previewLoading ? "Reloading..." : "Reload"}
                                    </Button>
                                </div>

                                {previewLoading ? (
                                    <div className="space-y-2 rounded-lg border bg-card p-3">
                                        <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                    </div>
                                ) : previewError ? (
                                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                                        {previewError}
                                    </div>
                                ) : previewCriteria.length === 0 ? (
                                    <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                                        No criteria found for this template yet.
                                    </div>
                                ) : (
                                    <div className="min-w-0 overflow-x-auto rounded-lg border">
                                        <Table className="w-full">
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-10 whitespace-nowrap">#</TableHead>
                                                    <TableHead className="whitespace-nowrap">Criterion</TableHead>
                                                    <TableHead className="w-24 whitespace-nowrap">Weight</TableHead>
                                                    <TableHead className="w-20 whitespace-nowrap">Min</TableHead>
                                                    <TableHead className="w-20 whitespace-nowrap">Max</TableHead>
                                                    <TableHead className="whitespace-nowrap">Description</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {previewCriteria.map((criterion, index) => (
                                                    <TableRow key={criterion.id}>
                                                        <TableCell className="whitespace-nowrap">
                                                            {index + 1}
                                                        </TableCell>
                                                        <TableCell className="font-medium whitespace-normal wrap-break-word">
                                                            {criterion.criterion}
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            {criterion.weight}%
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            {criterion.min_score}
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            {criterion.max_score}
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground whitespace-normal wrap-break-word">
                                                            {criterion.description || "—"}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="mt-4 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                                Select a template to preview.
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </DashboardLayout>
    )
}
