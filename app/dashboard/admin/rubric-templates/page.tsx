"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
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

type ActiveFilter = "all" | "active" | "inactive"

type SelectOption = {
    value: string
    label: string
    payload: string
}

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

function getOptionPayload(options: SelectOption[], value: string) {
    return options.find((option) => option.value === value)?.payload ?? ""
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

async function patchTemplateActive(templateId: string, active: boolean): Promise<RubricTemplate | null> {
    const candidateEndpoints = [
        `/api/rubric-templates/${templateId}`,
        `/api/rubric-templates/${templateId}/active`,
    ]

    let lastError = "Failed to update template status."

    for (const endpoint of candidateEndpoints) {
        const res = await fetch(endpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active }),
        })

        if (res.ok) {
            const data = await readJsonRecord(res)
            return normalizeTemplate(data.item ?? data)
        }

        if (res.status === 404 || res.status === 405) {
            lastError = await readErrorMessage(res)
            continue
        }

        throw new Error(await readErrorMessage(res))
    }

    throw new Error(lastError)
}

export default function AdminRubricTemplatesPage() {
    const router = useRouter()

    const [templates, setTemplates] = React.useState<RubricTemplate[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>("all")

    const [createNameOption, setCreateNameOption] = React.useState<string>(
        TEMPLATE_NAME_OPTIONS[0]?.value ?? "other",
    )
    const [createNameOther, setCreateNameOther] = React.useState("")

    const [createDescriptionOption, setCreateDescriptionOption] = React.useState<string>(
        TEMPLATE_DESCRIPTION_OPTIONS[0]?.value ?? "none",
    )
    const [createDescriptionOther, setCreateDescriptionOther] = React.useState("")

    const [creating, setCreating] = React.useState(false)
    const [busyTemplateId, setBusyTemplateId] = React.useState<string | null>(null)

    const loadTemplates = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const res = await fetch("/api/rubric-templates", { cache: "no-store" })
            const data = await readJsonRecord(res)

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const rawItems = Array.isArray(data.items) ? data.items : []
            const normalized = rawItems
                .map((item) => normalizeTemplate(item))
                .filter((item): item is RubricTemplate => item !== null)

            setTemplates(normalized)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to fetch rubric templates."
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

    const filteredTemplates = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return templates.filter((template) => {
            if (activeFilter === "active" && !template.active) return false
            if (activeFilter === "inactive" && template.active) return false

            if (!q) return true

            return (
                template.id.toLowerCase().includes(q) ||
                template.name.toLowerCase().includes(q) ||
                (template.description ?? "").toLowerCase().includes(q)
            )
        })
    }, [templates, search, activeFilter])

    const createTemplate = React.useCallback(async () => {
        const name =
            createNameOption === "other"
                ? createNameOther.trim()
                : getOptionPayload(TEMPLATE_NAME_OPTIONS, createNameOption).trim()

        const descriptionRaw =
            createDescriptionOption === "other"
                ? createDescriptionOther.trim()
                : getOptionPayload(TEMPLATE_DESCRIPTION_OPTIONS, createDescriptionOption).trim()

        if (!name) {
            const message = "Template name is required."
            setError(message)
            toast.error(message)
            return
        }

        setCreating(true)
        setError(null)

        try {
            const res = await fetch("/api/rubric-templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    description: descriptionRaw.length > 0 ? descriptionRaw : null,
                }),
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = await readJsonRecord(res)
            const created = normalizeTemplate(data.item ?? data)

            if (created) {
                setTemplates((prev) => [created, ...prev.filter((t) => t.id !== created.id)])
                setCreateNameOption(TEMPLATE_NAME_OPTIONS[0]?.value ?? "other")
                setCreateNameOther("")
                setCreateDescriptionOption(TEMPLATE_DESCRIPTION_OPTIONS[0]?.value ?? "none")
                setCreateDescriptionOther("")
                toast.success(`Template "${created.name}" created successfully.`)
                router.push(`/dashboard/admin/rubric-templates/${created.id}`)
                return
            }

            await loadTemplates()
            setCreateNameOption(TEMPLATE_NAME_OPTIONS[0]?.value ?? "other")
            setCreateNameOther("")
            setCreateDescriptionOption(TEMPLATE_DESCRIPTION_OPTIONS[0]?.value ?? "none")
            setCreateDescriptionOther("")
            toast.success("Template created successfully.")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to create rubric template."
            setError(message)
            toast.error(message)
        } finally {
            setCreating(false)
        }
    }, [
        createDescriptionOption,
        createDescriptionOther,
        createNameOption,
        createNameOther,
        loadTemplates,
        router,
    ])

    const toggleTemplateActive = React.useCallback(
        async (template: RubricTemplate) => {
            if (busyTemplateId) return

            const nextActive = !template.active
            setBusyTemplateId(template.id)
            setError(null)

            try {
                const updated = await patchTemplateActive(template.id, nextActive)

                if (updated) {
                    setTemplates((prev) =>
                        prev.map((item) => (item.id === template.id ? updated : item)),
                    )
                } else {
                    setTemplates((prev) =>
                        prev.map((item) =>
                            item.id === template.id ? { ...item, active: nextActive } : item,
                        ),
                    )
                }

                toast.success(
                    `Template "${template.name}" is now ${nextActive ? "active" : "inactive"}.`,
                )
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Failed to update template status."
                setError(message)
                toast.error(message)
            } finally {
                setBusyTemplateId(null)
            }
        },
        [busyTemplateId],
    )

    return (
        <DashboardLayout
            title="Rubric Templates"
            description="Create, view, and manage rubric templates used in evaluations."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="space-y-3">
                        <p className="text-sm font-medium">Create New Template</p>

                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Template name</p>
                                <Select
                                    value={createNameOption}
                                    onValueChange={(value) => {
                                        setCreateNameOption(value)
                                        if (value !== "other") {
                                            setCreateNameOther("")
                                        }
                                    }}
                                    disabled={creating}
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

                                {createNameOption === "other" ? (
                                    <Input
                                        placeholder="Please specify template name"
                                        value={createNameOther}
                                        onChange={(e) => setCreateNameOther(e.target.value)}
                                        disabled={creating}
                                    />
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Template description</p>
                                <Select
                                    value={createDescriptionOption}
                                    onValueChange={(value) => {
                                        setCreateDescriptionOption(value)
                                        if (value !== "other") {
                                            setCreateDescriptionOther("")
                                        }
                                    }}
                                    disabled={creating}
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

                                {createDescriptionOption === "other" ? (
                                    <Input
                                        placeholder="Please specify description"
                                        value={createDescriptionOther}
                                        onChange={(e) => setCreateDescriptionOther(e.target.value)}
                                        disabled={creating}
                                    />
                                ) : null}
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={() => void createTemplate()} disabled={creating}>
                                {creating ? "Creating..." : "Create Template"}
                            </Button>
                            <Button variant="outline" onClick={() => void loadTemplates()} disabled={loading}>
                                Refresh
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                            <div className="w-full md:max-w-xl">
                                <p className="mb-2 text-xs font-medium text-muted-foreground">Search</p>
                                <Input
                                    placeholder="Search by name, ID, or description"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>

                            <div className="w-full md:w-60">
                                <p className="mb-2 text-xs font-medium text-muted-foreground">Filter by status</p>
                                <Select
                                    value={activeFilter}
                                    onValueChange={(value) => setActiveFilter(value as ActiveFilter)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="All status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="inactive">Inactive</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Showing{" "}
                            <span className="font-semibold text-foreground">{filteredTemplates.length}</span> of{" "}
                            <span className="font-semibold text-foreground">{templates.length}</span> template(s).
                        </p>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                <div className="overflow-x-auto rounded-lg border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-56">Template</TableHead>
                                <TableHead className="min-w-20">Version</TableHead>
                                <TableHead className="min-w-28">Status</TableHead>
                                <TableHead className="min-w-44">Updated</TableHead>
                                <TableHead className="min-w-52 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <TableRow key={`skeleton-${i}`}>
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
                                    const busy = busyTemplateId === template.id

                                    return (
                                        <TableRow key={template.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{template.name}</span>
                                                    <span className="text-xs text-muted-foreground">{template.id}</span>
                                                    {template.description ? (
                                                        <span className="mt-1 text-xs text-muted-foreground">
                                                            {template.description}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </TableCell>

                                            <TableCell>{template.version}</TableCell>

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
                                                    <Button asChild size="sm" variant="outline">
                                                        <Link href={`/dashboard/admin/rubric-templates/${template.id}`}>
                                                            View
                                                        </Link>
                                                    </Button>

                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={busy}
                                                        onClick={() => void toggleTemplateActive(template)}
                                                    >
                                                        {busy
                                                            ? "Updating..."
                                                            : template.active
                                                                ? "Deactivate"
                                                                : "Activate"}
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
        </DashboardLayout>
    )
}
