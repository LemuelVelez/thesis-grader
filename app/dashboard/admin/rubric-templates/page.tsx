"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

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

type ActiveFilter = "all" | "active" | "inactive"

function toTitleCase(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1)
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

        // Allow fallback to next known endpoint for common route mismatches.
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

    const [createName, setCreateName] = React.useState("")
    const [createDescription, setCreateDescription] = React.useState("")
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
            setError(err instanceof Error ? err.message : "Failed to fetch rubric templates.")
            setTemplates([])
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
        const name = createName.trim()
        const description = createDescription.trim()

        if (!name) {
            setError("Template name is required.")
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
                    description: description.length > 0 ? description : null,
                }),
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = await readJsonRecord(res)
            const created = normalizeTemplate(data.item ?? data)

            if (created) {
                setTemplates((prev) => [created, ...prev.filter((t) => t.id !== created.id)])
                setCreateName("")
                setCreateDescription("")
                router.push(`/dashboard/admin/rubric-templates/${created.id}`)
                return
            }

            // Fallback when API doesn't return item payload.
            await loadTemplates()
            setCreateName("")
            setCreateDescription("")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create rubric template.")
        } finally {
            setCreating(false)
        }
    }, [createName, createDescription, loadTemplates, router])

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
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to update template status.")
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
                        <div className="grid gap-2 md:grid-cols-2">
                            <Input
                                placeholder="Template name"
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                                disabled={creating}
                            />
                            <Input
                                placeholder="Description (optional)"
                                value={createDescription}
                                onChange={(e) => setCreateDescription(e.target.value)}
                                disabled={creating}
                            />
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
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by name, ID, or description"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by status</p>
                            <div className="flex flex-wrap gap-2">
                                {(["all", "active", "inactive"] as ActiveFilter[]).map((status) => {
                                    const active = activeFilter === status
                                    return (
                                        <Button
                                            key={status}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setActiveFilter(status)}
                                        >
                                            {toTitleCase(status)}
                                        </Button>
                                    )
                                })}
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
