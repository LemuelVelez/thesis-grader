"use client"

import * as React from "react"

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

type RubricTemplateItem = {
    id: string
    name: string
    version: number
    active: boolean
    description: string | null
    created_at: string | null
    updated_at: string | null
}

type RubricCriterionItem = {
    id: string
    template_id: string
    criterion: string
    description: string | null
    weight: number | null
    min_score: number | null
    max_score: number | null
    created_at: string | null
}

type RubricScaleLevelItem = {
    template_id: string
    score: number
    adjectival: string
    description: string | null
}

type ActiveFilter = "all" | "active" | "inactive"

const ACTIVE_FILTERS = ["all", "active", "inactive"] as const

const TEMPLATE_ENDPOINT_CANDIDATES = [
    "/api/rubric-templates?limit=300&orderBy=updated_at&orderDirection=desc",
    "/api/rubric-templates?limit=300",
    "/api/rubric/template?limit=300",
    "/api/staff/rubric-templates?limit=300",
    "/api/admin/rubric-templates?limit=300",
]

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

function toNumberSafe(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return null
}

function toIntSafe(value: unknown, fallback = 0): number {
    const n = toNumberSafe(value)
    if (n === null) return fallback
    return Math.trunc(n)
}

function toBooleanSafe(value: unknown): boolean | null {
    if (typeof value === "boolean") return value
    if (typeof value === "number") return value !== 0

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase()

        if (
            normalized === "true" ||
            normalized === "1" ||
            normalized === "yes" ||
            normalized === "active"
        ) {
            return true
        }

        if (
            normalized === "false" ||
            normalized === "0" ||
            normalized === "no" ||
            normalized === "inactive"
        ) {
            return false
        }
    }

    return null
}

function toTitleCase(value: string): string {
    if (!value) return value
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDateTime(value: string | null): string {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function formatWeight(value: number | null): string {
    if (value === null || Number.isNaN(value)) return "—"
    return value.toFixed(2)
}

function formatScoreRange(minScore: number | null, maxScore: number | null): string {
    if (minScore === null && maxScore === null) return "—"
    if (minScore === null) return `≤ ${maxScore}`
    if (maxScore === null) return `≥ ${minScore}`
    return `${minScore} - ${maxScore}`
}

function templateStatusTone(active: boolean): string {
    if (active) {
        return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
    }
    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload.templates)) return payload.templates
    if (Array.isArray(payload.criteria)) return payload.criteria
    if (Array.isArray(payload.scale_levels)) return payload.scale_levels
    if (Array.isArray(payload.scaleLevels)) return payload.scaleLevels

    if (isRecord(payload.data)) {
        if (Array.isArray(payload.data.items)) return payload.data.items
        if (Array.isArray(payload.data.templates)) return payload.data.templates
        if (Array.isArray(payload.data.criteria)) return payload.data.criteria
        if (Array.isArray(payload.data.scale_levels)) return payload.data.scale_levels
        if (Array.isArray(payload.data.scaleLevels)) return payload.data.scaleLevels
    }

    if (isRecord(payload.result)) {
        if (Array.isArray(payload.result.items)) return payload.result.items
        if (Array.isArray(payload.result.templates)) return payload.result.templates
        if (Array.isArray(payload.result.criteria)) return payload.result.criteria
        if (Array.isArray(payload.result.scale_levels)) return payload.result.scale_levels
        if (Array.isArray(payload.result.scaleLevels)) return payload.result.scaleLevels
    }

    return []
}

function normalizeTemplate(raw: unknown): RubricTemplateItem | null {
    if (!isRecord(raw)) return null

    const source = isRecord(raw.template) ? raw.template : raw

    const id = toStringSafe(source.id ?? raw.id)
    if (!id) return null

    const name =
        toStringSafe(source.name ?? source.title ?? raw.name ?? raw.title) ?? "Untitled Template"

    const version = toIntSafe(source.version ?? raw.version, 1)
    const active = toBooleanSafe(source.active ?? source.is_active ?? raw.active) ?? false

    return {
        id,
        name,
        version: version > 0 ? version : 1,
        active,
        description: toNullableString(source.description ?? raw.description),
        created_at: toNullableString(source.created_at ?? source.createdAt ?? raw.created_at),
        updated_at: toNullableString(source.updated_at ?? source.updatedAt ?? raw.updated_at),
    }
}

function normalizeCriterion(raw: unknown): RubricCriterionItem | null {
    if (!isRecord(raw)) return null

    const source = isRecord(raw.criterion_data) ? raw.criterion_data : raw

    const id = toStringSafe(source.id ?? raw.id)
    const template_id = toStringSafe(source.template_id ?? source.templateId ?? raw.template_id)
    const criterion = toStringSafe(source.criterion ?? source.name ?? source.title ?? raw.criterion)

    if (!id || !template_id || !criterion) return null

    return {
        id,
        template_id,
        criterion,
        description: toNullableString(source.description ?? raw.description),
        weight: toNumberSafe(source.weight ?? raw.weight),
        min_score: toNumberSafe(source.min_score ?? source.minScore ?? raw.min_score),
        max_score: toNumberSafe(source.max_score ?? source.maxScore ?? raw.max_score),
        created_at: toNullableString(source.created_at ?? source.createdAt ?? raw.created_at),
    }
}

function normalizeScaleLevel(raw: unknown): RubricScaleLevelItem | null {
    if (!isRecord(raw)) return null

    const source = isRecord(raw.scale_level) ? raw.scale_level : raw

    const template_id = toStringSafe(source.template_id ?? source.templateId ?? raw.template_id)
    const score = toIntSafe(source.score ?? raw.score, Number.NaN)
    const adjectival =
        toStringSafe(source.adjectival ?? source.label ?? source.title ?? raw.adjectival) ??
        "Unlabeled"

    if (!template_id || !Number.isFinite(score)) return null

    return {
        template_id,
        score,
        adjectival,
        description: toNullableString(source.description ?? raw.description),
    }
}

function readErrorMessage(res: Response, payload: unknown): string {
    if (isRecord(payload)) {
        const error = toStringSafe(payload.error)
        if (error) return error

        const message = toStringSafe(payload.message)
        if (message) return message
    }

    return `Request failed (${res.status})`
}

function buildCriteriaCandidates(templateId: string): string[] {
    const where = encodeURIComponent(JSON.stringify({ template_id: templateId }))
    const encodedId = encodeURIComponent(templateId)

    return [
        `/api/rubric-templates/${encodedId}/criteria`,
        `/api/staff/rubric-templates/${encodedId}/criteria`,
        `/api/admin/rubric-templates/${encodedId}/criteria`,
        `/api/rubric-criteria?templateId=${encodedId}&limit=500`,
        `/api/rubric-criteria?template_id=${encodedId}&limit=500`,
        `/api/rubric-criteria?where=${where}&limit=500`,
    ]
}

function buildScaleCandidates(templateId: string): string[] {
    const encodedId = encodeURIComponent(templateId)
    const where = encodeURIComponent(JSON.stringify({ template_id: templateId }))

    return [
        `/api/rubric-templates/${encodedId}/scale-levels`,
        `/api/staff/rubric-templates/${encodedId}/scale-levels`,
        `/api/admin/rubric-templates/${encodedId}/scale-levels`,
        `/api/rubric-scale-levels?templateId=${encodedId}&limit=200`,
        `/api/rubric-scale-levels?template_id=${encodedId}&limit=200`,
        `/api/rubric-scale-levels?where=${where}&limit=200`,
    ]
}

export default function StaffRubricTemplatesPage() {
    const [templates, setTemplates] = React.useState<RubricTemplateItem[]>([])
    const [criteriaByTemplate, setCriteriaByTemplate] = React.useState<
        Record<string, RubricCriterionItem[]>
    >({})
    const [scaleLevelsByTemplate, setScaleLevelsByTemplate] = React.useState<
        Record<string, RubricScaleLevelItem[]>
    >({})

    const [loading, setLoading] = React.useState(true)
    const [detailsLoading, setDetailsLoading] = React.useState(false)

    const [error, setError] = React.useState<string | null>(null)
    const [detailsError, setDetailsError] = React.useState<string | null>(null)

    const [templateSource, setTemplateSource] = React.useState<string | null>(null)
    const [criteriaSource, setCriteriaSource] = React.useState<string | null>(null)
    const [scaleSource, setScaleSource] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>("all")
    const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | null>(null)

    const [copyMessage, setCopyMessage] = React.useState<string | null>(null)

    const loadTemplates = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        let loaded = false
        let latestError = "Unable to load rubric templates."

        for (const endpoint of TEMPLATE_ENDPOINT_CANDIDATES) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = readErrorMessage(res, payload)
                    continue
                }

                const parsed = extractArrayPayload(payload)
                    .map(normalizeTemplate)
                    .filter((item): item is RubricTemplateItem => item !== null)
                    .sort((a, b) => {
                        const ta = new Date(a.updated_at ?? a.created_at ?? 0).getTime()
                        const tb = new Date(b.updated_at ?? b.created_at ?? 0).getTime()
                        return tb - ta
                    })

                setTemplates(parsed)
                setTemplateSource(endpoint)
                setSelectedTemplateId((prev) => {
                    if (prev && parsed.some((item) => item.id === prev)) return prev
                    return parsed[0]?.id ?? null
                })

                loaded = true
                break
            } catch (err) {
                latestError = err instanceof Error ? err.message : "Unable to load rubric templates."
            }
        }

        if (!loaded) {
            setTemplates([])
            setTemplateSource(null)
            setSelectedTemplateId(null)
            setError(`${latestError} No rubric template endpoint responded successfully.`)
        }

        setLoading(false)
    }, [])

    const loadTemplateDetails = React.useCallback(async (templateId: string) => {
        setDetailsLoading(true)
        setDetailsError(null)
        setCriteriaSource(null)
        setScaleSource(null)

        let criteriaLoaded = false
        let scaleLoaded = false

        let latestCriteriaError = "Unable to load criteria."
        let latestScaleError = "Unable to load scale levels."

        for (const endpoint of buildCriteriaCandidates(templateId)) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestCriteriaError = readErrorMessage(res, payload)
                    continue
                }

                const parsed = extractArrayPayload(payload)
                    .map(normalizeCriterion)
                    .filter((item): item is RubricCriterionItem => item !== null)
                    .sort((a, b) => {
                        const wa = a.weight ?? 0
                        const wb = b.weight ?? 0
                        return wb - wa
                    })

                setCriteriaByTemplate((prev) => ({ ...prev, [templateId]: parsed }))
                setCriteriaSource(endpoint)
                criteriaLoaded = true
                break
            } catch (err) {
                latestCriteriaError = err instanceof Error ? err.message : "Unable to load criteria."
            }
        }

        if (!criteriaLoaded) {
            setCriteriaByTemplate((prev) => ({ ...prev, [templateId]: [] }))
        }

        for (const endpoint of buildScaleCandidates(templateId)) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestScaleError = readErrorMessage(res, payload)
                    continue
                }

                const parsed = extractArrayPayload(payload)
                    .map(normalizeScaleLevel)
                    .filter((item): item is RubricScaleLevelItem => item !== null)
                    .sort((a, b) => a.score - b.score)

                setScaleLevelsByTemplate((prev) => ({ ...prev, [templateId]: parsed }))
                setScaleSource(endpoint)
                scaleLoaded = true
                break
            } catch (err) {
                latestScaleError = err instanceof Error ? err.message : "Unable to load scale levels."
            }
        }

        if (!scaleLoaded) {
            setScaleLevelsByTemplate((prev) => ({ ...prev, [templateId]: [] }))
        }

        if (!criteriaLoaded || !scaleLoaded) {
            const errors: string[] = []
            if (!criteriaLoaded) errors.push(`${latestCriteriaError} Criteria table may be empty.`)
            if (!scaleLoaded) errors.push(`${latestScaleError} Scale levels table may be empty.`)
            setDetailsError(errors.join(" "))
        }

        setDetailsLoading(false)
    }, [])

    React.useEffect(() => {
        void loadTemplates()
    }, [loadTemplates])

    React.useEffect(() => {
        if (!selectedTemplateId) return

        const hasCriteria = Object.prototype.hasOwnProperty.call(criteriaByTemplate, selectedTemplateId)
        const hasScale = Object.prototype.hasOwnProperty.call(scaleLevelsByTemplate, selectedTemplateId)

        if (hasCriteria && hasScale) return

        void loadTemplateDetails(selectedTemplateId)
    }, [selectedTemplateId, criteriaByTemplate, scaleLevelsByTemplate, loadTemplateDetails])

    const filteredTemplates = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return templates.filter((item) => {
            if (activeFilter === "active" && !item.active) return false
            if (activeFilter === "inactive" && item.active) return false

            if (!q) return true

            return (
                item.id.toLowerCase().includes(q) ||
                item.name.toLowerCase().includes(q) ||
                (item.description?.toLowerCase().includes(q) ?? false)
            )
        })
    }, [templates, search, activeFilter])

    const selectedTemplate = React.useMemo(() => {
        if (!selectedTemplateId) return null
        return templates.find((item) => item.id === selectedTemplateId) ?? null
    }, [templates, selectedTemplateId])

    const selectedCriteria = React.useMemo(() => {
        if (!selectedTemplateId) return []
        return criteriaByTemplate[selectedTemplateId] ?? []
    }, [criteriaByTemplate, selectedTemplateId])

    const selectedScaleLevels = React.useMemo(() => {
        if (!selectedTemplateId) return []
        return scaleLevelsByTemplate[selectedTemplateId] ?? []
    }, [scaleLevelsByTemplate, selectedTemplateId])

    const totals = React.useMemo(() => {
        const total = templates.length
        const active = templates.filter((item) => item.active).length
        const inactive = total - active
        const shown = filteredTemplates.length

        return {
            total,
            active,
            inactive,
            shown,
        }
    }, [templates, filteredTemplates])

    const refreshAll = React.useCallback(() => {
        setCriteriaByTemplate({})
        setScaleLevelsByTemplate({})
        setDetailsError(null)
        setCopyMessage(null)
        void loadTemplates()
    }, [loadTemplates])

    const exportSelectedAsJson = React.useCallback(() => {
        if (!selectedTemplateId || !selectedTemplate) return

        const data = {
            template: selectedTemplate,
            criteria: selectedCriteria,
            scale_levels: selectedScaleLevels,
        }

        const json = JSON.stringify(data, null, 2)
        const blob = new Blob([json], { type: "application/json;charset=utf-8;" })
        const url = URL.createObjectURL(blob)

        const safeName = selectedTemplate.name
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-_]/g, "")
        const filename = `rubric-template-${safeName || selectedTemplate.id}.json`

        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = filename
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()

        URL.revokeObjectURL(url)
    }, [selectedTemplateId, selectedTemplate, selectedCriteria, selectedScaleLevels])

    const copySelectedJson = React.useCallback(async () => {
        if (!selectedTemplateId || !selectedTemplate) return

        const data = {
            template: selectedTemplate,
            criteria: selectedCriteria,
            scale_levels: selectedScaleLevels,
        }

        try {
            await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
            setCopyMessage("Template JSON copied to clipboard.")
        } catch {
            setCopyMessage("Clipboard access failed. Use Export JSON instead.")
        }
    }, [selectedTemplateId, selectedTemplate, selectedCriteria, selectedScaleLevels])

    React.useEffect(() => {
        if (!copyMessage) return
        const timer = window.setTimeout(() => setCopyMessage(null), 2500)
        return () => window.clearTimeout(timer)
    }, [copyMessage])

    return (
        <DashboardLayout
            title="Rubric Templates"
            description="Review template versions, criteria, and scale levels used in staff evaluations."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <Input
                                placeholder="Search by template name, ID, or description"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full lg:max-w-xl"
                            />

                            <div className="flex flex-wrap items-center gap-2">
                                <Button variant="outline" onClick={refreshAll} disabled={loading}>
                                    Refresh
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={copySelectedJson}
                                    disabled={!selectedTemplateId || detailsLoading}
                                >
                                    Copy JSON
                                </Button>
                                <Button
                                    onClick={exportSelectedAsJson}
                                    disabled={!selectedTemplateId || detailsLoading}
                                >
                                    Export JSON
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by status</p>
                            <div className="flex flex-wrap gap-2">
                                {ACTIVE_FILTERS.map((status) => {
                                    const active = activeFilter === status
                                    const label = toTitleCase(status)

                                    return (
                                        <Button
                                            key={status}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setActiveFilter(status)}
                                        >
                                            {label}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Total Templates</p>
                                <p className="text-lg font-semibold">{totals.total}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Active</p>
                                <p className="text-lg font-semibold">{totals.active}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Inactive</p>
                                <p className="text-lg font-semibold">{totals.inactive}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Showing</p>
                                <p className="text-lg font-semibold">{totals.shown}</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                            {templateSource ? <p>Template source: {templateSource}</p> : null}
                            {criteriaSource ? <p>Criteria source: {criteriaSource}</p> : null}
                            {scaleSource ? <p>Scale source: {scaleSource}</p> : null}
                            {copyMessage ? <p className="text-foreground">{copyMessage}</p> : null}
                        </div>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                {detailsError ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                        {detailsError}
                    </div>
                ) : null}

                <div className="overflow-x-auto rounded-lg border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-64">Template</TableHead>
                                <TableHead className="min-w-24">Version</TableHead>
                                <TableHead className="min-w-32">Status</TableHead>
                                <TableHead className="min-w-28 text-right">Criteria</TableHead>
                                <TableHead className="min-w-28 text-right">Scale Levels</TableHead>
                                <TableHead className="min-w-52">Updated</TableHead>
                                <TableHead className="min-w-24 text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <TableRow key={`skeleton-template-${i}`}>
                                        <TableCell colSpan={7}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredTemplates.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                        No rubric templates found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredTemplates.map((item) => {
                                    const isSelected = item.id === selectedTemplateId
                                    const criteriaCount = criteriaByTemplate[item.id]?.length
                                    const scaleCount = scaleLevelsByTemplate[item.id]?.length

                                    return (
                                        <TableRow key={item.id} className={isSelected ? "bg-muted/40" : undefined}>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-medium">{item.name}</span>
                                                    <span className="text-xs text-muted-foreground">ID: {item.id}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{item.version}</TableCell>
                                            <TableCell>
                                                <span
                                                    className={[
                                                        "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                        templateStatusTone(item.active),
                                                    ].join(" ")}
                                                >
                                                    {item.active ? "Active" : "Inactive"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">{criteriaCount ?? "—"}</TableCell>
                                            <TableCell className="text-right">{scaleCount ?? "—"}</TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {formatDateTime(item.updated_at ?? item.created_at)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    size="sm"
                                                    variant={isSelected ? "default" : "outline"}
                                                    onClick={() => {
                                                        setSelectedTemplateId(item.id)
                                                        if (
                                                            !Object.prototype.hasOwnProperty.call(criteriaByTemplate, item.id) ||
                                                            !Object.prototype.hasOwnProperty.call(scaleLevelsByTemplate, item.id)
                                                        ) {
                                                            void loadTemplateDetails(item.id)
                                                        }
                                                    }}
                                                >
                                                    {isSelected ? "Selected" : "View"}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>

                <div className="rounded-lg border bg-card p-4">
                    {!selectedTemplate ? (
                        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                            Select a rubric template to view criteria and scale levels.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div className="space-y-1">
                                    <h2 className="text-base font-semibold">{selectedTemplate.name}</h2>
                                    <p className="text-sm text-muted-foreground">
                                        Version {selectedTemplate.version} •{" "}
                                        {selectedTemplate.active ? "Active template" : "Inactive template"}
                                    </p>
                                    {selectedTemplate.description ? (
                                        <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
                                    ) : null}
                                </div>

                                <div className="text-xs text-muted-foreground">
                                    Updated: {formatDateTime(selectedTemplate.updated_at ?? selectedTemplate.created_at)}
                                </div>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-2">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-semibold">Criteria</h3>
                                        <p className="text-xs text-muted-foreground">
                                            {selectedCriteria.length} item(s)
                                        </p>
                                    </div>

                                    <div className="overflow-x-auto rounded-lg border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="min-w-56">Criterion</TableHead>
                                                    <TableHead className="min-w-24 text-right">Weight</TableHead>
                                                    <TableHead className="min-w-28 text-right">Score Range</TableHead>
                                                </TableRow>
                                            </TableHeader>

                                            <TableBody>
                                                {detailsLoading ? (
                                                    Array.from({ length: 5 }).map((_, i) => (
                                                        <TableRow key={`criteria-skeleton-${i}`}>
                                                            <TableCell colSpan={3}>
                                                                <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : selectedCriteria.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                                                            No criteria available for this template.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    selectedCriteria.map((item) => (
                                                        <TableRow key={item.id}>
                                                            <TableCell>
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="font-medium">{item.criterion}</span>
                                                                    {item.description ? (
                                                                        <span className="text-xs text-muted-foreground">
                                                                            {item.description}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right">{formatWeight(item.weight)}</TableCell>
                                                            <TableCell className="text-right">
                                                                {formatScoreRange(item.min_score, item.max_score)}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-semibold">Scale Levels</h3>
                                        <p className="text-xs text-muted-foreground">
                                            {selectedScaleLevels.length} item(s)
                                        </p>
                                    </div>

                                    <div className="overflow-x-auto rounded-lg border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="min-w-20 text-right">Score</TableHead>
                                                    <TableHead className="min-w-40">Adjectival</TableHead>
                                                    <TableHead className="min-w-60">Description</TableHead>
                                                </TableRow>
                                            </TableHeader>

                                            <TableBody>
                                                {detailsLoading ? (
                                                    Array.from({ length: 5 }).map((_, i) => (
                                                        <TableRow key={`scale-skeleton-${i}`}>
                                                            <TableCell colSpan={3}>
                                                                <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : selectedScaleLevels.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                                                            No scale levels available for this template.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    selectedScaleLevels.map((item) => (
                                                        <TableRow key={`${item.template_id}-${item.score}`}>
                                                            <TableCell className="text-right font-medium">{item.score}</TableCell>
                                                            <TableCell>{item.adjectival}</TableCell>
                                                            <TableCell className="text-muted-foreground">
                                                                {item.description ?? "—"}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    )
}
