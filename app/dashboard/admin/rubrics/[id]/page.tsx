/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Plus, RefreshCw, Save, Trash2, MoreHorizontal, Code2, ListChecks } from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type RubricTemplate = Record<string, any>
type RubricCriterion = Record<string, any>

function getId(obj: any): string {
    return String(obj?.id ?? obj?._id ?? obj?.uuid ?? "")
}

function getTemplateName(t: RubricTemplate): string {
    return String(t?.name ?? t?.title ?? t?.label ?? t?.rubricName ?? "Untitled Rubric")
}

function getTemplateDescription(t: RubricTemplate): string {
    return String(t?.description ?? t?.desc ?? t?.details ?? "")
}

function getTemplateVersion(t: RubricTemplate): number {
    const v = t?.version
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : 1
}

function getTemplateActive(t: RubricTemplate): boolean {
    return Boolean(t?.active ?? true)
}

function getCriterionTemplateId(c: RubricCriterion): string {
    return String(c?.template_id ?? c?.templateId ?? c?.rubricTemplateId ?? c?.rubric_template_id ?? c?.rubricId ?? "")
}

function getCriterionTitle(c: RubricCriterion): string {
    return String(c?.criterion ?? c?.title ?? c?.name ?? c?.label ?? "Untitled criterion")
}

function getCriterionDescription(c: RubricCriterion): string {
    return String(c?.description ?? c?.desc ?? "")
}

function getCriterionWeight(c: RubricCriterion): string {
    const w = c?.weight ?? c?.points ?? c?.score ?? ""
    return w === null || w === undefined ? "" : String(w)
}

function getCriterionMinScore(c: RubricCriterion): string {
    const v = c?.min_score ?? c?.minScore ?? ""
    return v === null || v === undefined ? "" : String(v)
}

function getCriterionMaxScore(c: RubricCriterion): string {
    const v = c?.max_score ?? c?.maxScore ?? ""
    return v === null || v === undefined ? "" : String(v)
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
        },
        cache: "no-store",
    })

    if (!res.ok) {
        let message = `Request failed (${res.status})`
        try {
            const data = await res.json()
            message = data?.error ?? message
        } catch {
            // ignore
        }
        throw new Error(message)
    }

    return (await res.json()) as T
}

function safeJsonParse(text: string): { ok: true; value: any } | { ok: false; error: string } {
    try {
        return { ok: true, value: JSON.parse(text) }
    } catch (e: any) {
        return { ok: false, error: e?.message ?? "Invalid JSON" }
    }
}

function prettyJson(value: any) {
    try {
        return JSON.stringify(value ?? {}, null, 2)
    } catch {
        return "{}"
    }
}

function normalizeList(value: any): any[] {
    if (Array.isArray(value)) return value
    const list = value?.items ?? value?.data ?? value?.rows
    if (Array.isArray(list)) return list
    return []
}

export default function AdminRubricDetailPage() {
    const router = useRouter()
    const params = useParams<{ id: string }>()
    const templateId = decodeURIComponent(String(params?.id ?? "")).trim()

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const [template, setTemplate] = React.useState<RubricTemplate | null>(null)
    const [criteria, setCriteria] = React.useState<RubricCriterion[]>([])

    // Template form state
    const [name, setName] = React.useState("")
    const [description, setDescription] = React.useState("")
    const [version, setVersion] = React.useState<string>("1")
    const [active, setActive] = React.useState<boolean>(true)
    const [savingTemplate, setSavingTemplate] = React.useState(false)

    // JSON editor state
    const [templateJson, setTemplateJson] = React.useState("{}")
    const [templateJsonError, setTemplateJsonError] = React.useState<string | null>(null)

    // Criteria create/edit dialog state
    const [criterionDialogOpen, setCriterionDialogOpen] = React.useState(false)
    const [criterionEditing, setCriterionEditing] = React.useState<RubricCriterion | null>(null)
    const [criterionTitle, setCriterionTitle] = React.useState("")
    const [criterionDesc, setCriterionDesc] = React.useState("")
    const [criterionWeight, setCriterionWeight] = React.useState<string>("")
    const [criterionMinScore, setCriterionMinScore] = React.useState<string>("")
    const [criterionMaxScore, setCriterionMaxScore] = React.useState<string>("")
    const [criterionJson, setCriterionJson] = React.useState("{}")
    const [criterionJsonError, setCriterionJsonError] = React.useState<string | null>(null)
    const [savingCriterion, setSavingCriterion] = React.useState(false)

    const load = React.useCallback(async () => {
        setError(null)
        setLoading(true)

        try {
            let foundTemplate: RubricTemplate | null = null

            // 1) GET /api/admin/rubric-templates/:id
            try {
                const one = await apiFetch<any>(`/api/admin/rubric-templates/${encodeURIComponent(templateId)}`)
                foundTemplate = one?.data ?? one?.item ?? one
            } catch {
                // 2) fallback GET /api/admin/rubric-templates?id=:id
                try {
                    const one = await apiFetch<any>(`/api/admin/rubric-templates?id=${encodeURIComponent(templateId)}`)
                    if (one && typeof one === "object" && !Array.isArray(one)) {
                        const maybe = one?.data ?? one?.item ?? one
                        if (maybe && typeof maybe === "object" && getId(maybe) === templateId) {
                            foundTemplate = maybe
                        } else {
                            const list = normalizeList(one)
                            foundTemplate = list.find((x) => getId(x) === templateId) ?? null
                        }
                    } else {
                        const list = normalizeList(one)
                        foundTemplate = list.find((x) => getId(x) === templateId) ?? null
                    }
                } catch {
                    // 3) fallback list all then find
                    const all = await apiFetch<any>("/api/admin/rubric-templates")
                    const list = normalizeList(all)
                    foundTemplate = list.find((x) => getId(x) === templateId) ?? null
                }
            }

            if (!foundTemplate) throw new Error("Rubric not found")

            setTemplate(foundTemplate)
            setName(getTemplateName(foundTemplate))
            setDescription(getTemplateDescription(foundTemplate))
            setVersion(String(getTemplateVersion(foundTemplate)))
            setActive(getTemplateActive(foundTemplate))
            setTemplateJson(prettyJson(foundTemplate))
            setTemplateJsonError(null)

            // Criteria: fetch by templateId (preferred)
            try {
                const crit = await apiFetch<any>(`/api/admin/rubric-criteria?templateId=${encodeURIComponent(templateId)}`)
                setCriteria(normalizeList(crit))
            } catch {
                // fallback: fetch all and filter
                const all = await apiFetch<any>("/api/admin/rubric-criteria")
                const list = normalizeList(all)
                const filtered = list.filter((c) => getCriterionTemplateId(c) === templateId)
                setCriteria(filtered)
            }
        } catch (e: any) {
            setError(e?.message ?? "Failed to load rubric")
        } finally {
            setLoading(false)
        }
    }, [templateId])

    React.useEffect(() => {
        void load()
    }, [load])

    async function onRefresh() {
        setRefreshing(true)
        try {
            await load()
        } finally {
            setRefreshing(false)
        }
    }

    async function onSaveTemplateForm() {
        if (!templateId) return
        setSavingTemplate(true)
        setError(null)

        try {
            const vNum = Number(version)
            const descTrim = description.trim()

            const payload: Record<string, any> = {
                ...(template ?? {}),
                name: name.trim() || "Untitled Rubric",
                // ✅ send null if empty to allow clearing
                description: descTrim ? descTrim : null,
                version: Number.isFinite(vNum) && vNum > 0 ? vNum : 1,
                active: Boolean(active),
            }

            const updated = await apiFetch<any>(`/api/admin/rubric-templates/${encodeURIComponent(templateId)}`, {
                method: "PUT",
                body: JSON.stringify(payload),
            })

            const next = updated?.data ?? updated?.item ?? updated
            setTemplate(next)
            setName(getTemplateName(next))
            setDescription(getTemplateDescription(next))
            setVersion(String(getTemplateVersion(next)))
            setActive(getTemplateActive(next))
            setTemplateJson(prettyJson(next))
            setTemplateJsonError(null)
        } catch (e: any) {
            setError(e?.message ?? "Failed to save rubric")
        } finally {
            setSavingTemplate(false)
        }
    }

    async function onSaveTemplateJson() {
        if (!templateId) return
        setSavingTemplate(true)
        setError(null)

        const parsed = safeJsonParse(templateJson)
        if (!parsed.ok) {
            setTemplateJsonError(parsed.error)
            setSavingTemplate(false)
            return
        }
        setTemplateJsonError(null)

        try {
            const updated = await apiFetch<any>(`/api/admin/rubric-templates/${encodeURIComponent(templateId)}`, {
                method: "PUT",
                body: JSON.stringify(parsed.value),
            })
            const next = updated?.data ?? updated?.item ?? updated
            setTemplate(next)
            setName(getTemplateName(next))
            setDescription(getTemplateDescription(next))
            setVersion(String(getTemplateVersion(next)))
            setActive(getTemplateActive(next))
            setTemplateJson(prettyJson(next))
        } catch (e: any) {
            setError(e?.message ?? "Failed to save rubric")
        } finally {
            setSavingTemplate(false)
        }
    }

    async function onDeleteTemplate() {
        setError(null)
        try {
            await apiFetch(`/api/admin/rubric-templates/${encodeURIComponent(templateId)}`, { method: "DELETE" })
            router.push("/dashboard/admin/rubrics")
        } catch (e: any) {
            setError(e?.message ?? "Failed to delete rubric")
        }
    }

    function openCreateCriterion() {
        setCriterionEditing(null)
        setCriterionTitle("")
        setCriterionDesc("")
        setCriterionWeight("")
        setCriterionMinScore("1")
        setCriterionMaxScore("5")

        setCriterionJson(
            prettyJson({
                template_id: templateId,
                criterion: "",
                description: "",
                weight: 1,
                min_score: 1,
                max_score: 5,
            })
        )
        setCriterionJsonError(null)
        setCriterionDialogOpen(true)
    }

    function openEditCriterion(c: RubricCriterion) {
        setCriterionEditing(c)
        setCriterionTitle(getCriterionTitle(c))
        setCriterionDesc(getCriterionDescription(c))
        setCriterionWeight(getCriterionWeight(c))
        setCriterionMinScore(getCriterionMinScore(c) || "1")
        setCriterionMaxScore(getCriterionMaxScore(c) || "5")
        setCriterionJson(prettyJson(c))
        setCriterionJsonError(null)
        setCriterionDialogOpen(true)
    }

    async function onSaveCriterion() {
        setSavingCriterion(true)
        setError(null)

        const parsed = safeJsonParse(criterionJson)
        if (!parsed.ok) {
            setCriterionJsonError(parsed.error)
            setSavingCriterion(false)
            return
        }
        setCriterionJsonError(null)

        try {
            const isEdit = Boolean(criterionEditing && getId(criterionEditing))
            const cid = isEdit ? getId(criterionEditing) : ""

            const payload: Record<string, any> = { ...(parsed.value ?? {}) }

            if (
                !payload.template_id &&
                !payload.templateId &&
                !payload.rubricTemplateId &&
                !payload.rubric_template_id &&
                !payload.rubricId
            ) {
                payload.template_id = templateId
            }

            // ✅ Ensure title saves from the form if JSON is missing/empty
            const formTitle = criterionTitle.trim()
            if (!payload.criterion && !payload.title && !payload.name && !payload.label) {
                payload.criterion = formTitle
            } else if (payload.criterion !== undefined && String(payload.criterion).trim() === "" && formTitle) {
                payload.criterion = formTitle
            }

            // ✅ FIX: ensure description saves from the form if JSON has "" / missing
            const formDescTrim = criterionDesc.trim()
            if (payload.description === undefined || payload.description === "") {
                payload.description = formDescTrim ? formDescTrim : null
            }

            if (criterionWeight !== "" && payload.weight === undefined) payload.weight = criterionWeight
            if (criterionMinScore !== "" && payload.min_score === undefined) payload.min_score = criterionMinScore
            if (criterionMaxScore !== "" && payload.max_score === undefined) payload.max_score = criterionMaxScore

            if (isEdit) {
                await apiFetch(`/api/admin/rubric-criteria/${encodeURIComponent(cid)}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                })
            } else {
                await apiFetch(`/api/admin/rubric-criteria`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                })
            }

            setCriterionDialogOpen(false)
            await load()
        } catch (e: any) {
            setError(e?.message ?? "Failed to save criterion")
        } finally {
            setSavingCriterion(false)
        }
    }

    async function onDeleteCriterion(cid: string) {
        setError(null)
        try {
            await apiFetch(`/api/admin/rubric-criteria/${encodeURIComponent(cid)}`, { method: "DELETE" })
            await load()
        } catch (e: any) {
            setError(e?.message ?? "Failed to delete criterion")
        }
    }

    const templateTitle = template ? getTemplateName(template) : "Rubric"

    return (
        <DashboardLayout title="Rubric">
            <div className="space-y-6">
                <div className="flex flex-col gap-3">
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbLink asChild>
                                    <Link href="/dashboard/admin">Admin</Link>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbLink asChild>
                                    <Link href="/dashboard/admin/rubrics">Rubrics</Link>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbPage>{loading ? "Loading…" : templateTitle}</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <Button asChild variant="outline">
                                <Link href="/dashboard/admin/rubrics">
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Back
                                </Link>
                            </Button>

                            {loading ? (
                                <Skeleton className="h-9 w-60" />
                            ) : (
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                                    <h1 className="text-2xl font-semibold tracking-tight">{templateTitle}</h1>
                                    <Badge variant="outline" className="font-mono text-[10px]">
                                        {templateId}
                                    </Badge>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={onRefresh} disabled={loading || refreshing}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Refresh
                            </Button>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" disabled={loading}>
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete this rubric?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This action cannot be undone. Any criteria attached to this rubric template
                                            will be deleted as well (via DB cascade).
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                            className="bg-destructive text-white hover:bg-destructive/90"
                                            onClick={onDeleteTemplate}
                                        >
                                            Delete
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                </div>

                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>Something went wrong</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                <Tabs defaultValue="template" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="template">
                            <Save className="mr-2 h-4 w-4" />
                            Template
                        </TabsTrigger>
                        <TabsTrigger value="criteria">
                            <ListChecks className="mr-2 h-4 w-4" />
                            Criteria
                        </TabsTrigger>
                        <TabsTrigger value="advanced">
                            <Code2 className="mr-2 h-4 w-4" />
                            Advanced
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="template" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Template details</CardTitle>
                                <CardDescription>Edit the rubric template information.</CardDescription>
                            </CardHeader>
                            <Separator />
                            <CardContent className="pt-6">
                                {loading ? (
                                    <div className="grid gap-4">
                                        <Skeleton className="h-10 w-[320px]" />
                                        <Skeleton className="h-24 w-full" />
                                        <Skeleton className="h-10 w-55" />
                                        <Skeleton className="h-10 w-65" />
                                        <Skeleton className="h-10 w-40" />
                                    </div>
                                ) : (
                                    <div className="grid gap-6">
                                        <div className="grid gap-2">
                                            <Label htmlFor="name">Name</Label>
                                            <Input
                                                id="name"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                placeholder="Rubric name"
                                            />
                                        </div>

                                        {/* ✅ NEW: Template Description field */}
                                        <div className="grid gap-2">
                                            <Label htmlFor="t-desc">Description</Label>
                                            <Textarea
                                                id="t-desc"
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                placeholder="Optional notes about this rubric template…"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Stored in <code>rubric_templates.description</code>.
                                            </p>
                                        </div>

                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <div className="grid gap-2">
                                                <Label htmlFor="version">Version</Label>
                                                <Input
                                                    id="version"
                                                    inputMode="numeric"
                                                    value={version}
                                                    onChange={(e) => setVersion(e.target.value)}
                                                    placeholder="1"
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Stored in <code>rubric_templates.version</code>.
                                                </p>
                                            </div>

                                            <div className="grid gap-2">
                                                <Label>Active</Label>
                                                <div className="flex items-center justify-between rounded-md border p-3">
                                                    <div className="space-y-1">
                                                        <p className="text-sm font-medium">Active template</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            Stored in <code>rubric_templates.active</code>.
                                                        </p>
                                                    </div>
                                                    <Switch checked={active} onCheckedChange={setActive} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-end gap-2">
                                            <Button onClick={onSaveTemplateForm} disabled={savingTemplate}>
                                                <Save className="mr-2 h-4 w-4" />
                                                {savingTemplate ? "Saving…" : "Save"}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="criteria" className="mt-4">
                        <Card>
                            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <CardTitle>Criteria</CardTitle>
                                    <CardDescription>Manage the criteria attached to this rubric template.</CardDescription>
                                </div>

                                <Dialog open={criterionDialogOpen} onOpenChange={setCriterionDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button onClick={openCreateCriterion} disabled={loading}>
                                            <Plus className="mr-2 h-4 w-4" />
                                            Add criterion
                                        </Button>
                                    </DialogTrigger>

                                    <DialogContent className="sm:max-w-4xl">
                                        <DialogHeader>
                                            <DialogTitle>{criterionEditing ? "Edit criterion" : "Add criterion"}</DialogTitle>
                                            <DialogDescription>
                                                Use the form for common fields (matches your SQL schema), or edit the JSON directly.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="grid gap-6 py-2 md:grid-cols-2">
                                            <div className="grid gap-4">
                                                <div className="grid gap-2">
                                                    <Label htmlFor="c-title">Criterion</Label>
                                                    <Input
                                                        id="c-title"
                                                        value={criterionTitle}
                                                        onChange={(e) => setCriterionTitle(e.target.value)}
                                                        placeholder="e.g., Clarity of Presentation"
                                                    />
                                                    <p className="text-xs text-muted-foreground">
                                                        Stored as <code>rubric_criteria.criterion</code>.
                                                    </p>
                                                </div>

                                                <div className="grid gap-2">
                                                    <Label htmlFor="c-desc">Description</Label>
                                                    <Textarea
                                                        id="c-desc"
                                                        value={criterionDesc}
                                                        onChange={(e) => setCriterionDesc(e.target.value)}
                                                        placeholder="Optional notes"
                                                    />
                                                    <p className="text-xs text-muted-foreground">
                                                        Stored as <code>rubric_criteria.description</code>.
                                                    </p>
                                                </div>

                                                <div className="grid gap-4 sm:grid-cols-3">
                                                    <div className="grid gap-2">
                                                        <Label htmlFor="c-weight">Weight</Label>
                                                        <Input
                                                            id="c-weight"
                                                            value={criterionWeight}
                                                            onChange={(e) => setCriterionWeight(e.target.value)}
                                                            placeholder="1"
                                                        />
                                                    </div>

                                                    <div className="grid gap-2">
                                                        <Label htmlFor="c-min">Min score</Label>
                                                        <Input
                                                            id="c-min"
                                                            value={criterionMinScore}
                                                            onChange={(e) => setCriterionMinScore(e.target.value)}
                                                            placeholder="1"
                                                        />
                                                    </div>

                                                    <div className="grid gap-2">
                                                        <Label htmlFor="c-max">Max score</Label>
                                                        <Input
                                                            id="c-max"
                                                            value={criterionMaxScore}
                                                            onChange={(e) => setCriterionMaxScore(e.target.value)}
                                                            placeholder="5"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid gap-2">
                                                <Label htmlFor="c-json">Criterion JSON</Label>
                                                <Textarea
                                                    id="c-json"
                                                    value={criterionJson}
                                                    onChange={(e) => setCriterionJson(e.target.value)}
                                                    className="min-h-64 font-mono text-xs"
                                                />
                                                {criterionJsonError ? (
                                                    <p className="text-sm text-destructive">{criterionJsonError}</p>
                                                ) : null}
                                                <p className="text-xs text-muted-foreground">
                                                    Tip: ensure the payload includes <code>template_id</code> (or your equivalent alias).
                                                </p>
                                            </div>
                                        </div>

                                        <DialogFooter>
                                            <Button
                                                variant="outline"
                                                onClick={() => setCriterionDialogOpen(false)}
                                                disabled={savingCriterion}
                                            >
                                                Cancel
                                            </Button>
                                            <Button onClick={onSaveCriterion} disabled={savingCriterion}>
                                                <Save className="mr-2 h-4 w-4" />
                                                {savingCriterion ? "Saving…" : "Save"}
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </CardHeader>

                            <Separator />

                            <CardContent className="pt-4">
                                <ScrollArea className="w-full">
                                    <div className="min-w-245">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Criterion</TableHead>
                                                    <TableHead className="w-[45%]">Description</TableHead>
                                                    <TableHead className="text-right">Weight</TableHead>
                                                    <TableHead className="text-right">Range</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>

                                            <TableBody>
                                                {loading ? (
                                                    Array.from({ length: 5 }).map((_, i) => (
                                                        <TableRow key={`skc-${i}`}>
                                                            <TableCell>
                                                                <Skeleton className="h-5 w-60" />
                                                            </TableCell>
                                                            <TableCell>
                                                                <Skeleton className="h-5 w-105" />
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <Skeleton className="ml-auto h-5 w-16" />
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <Skeleton className="ml-auto h-5 w-22.5" />
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <Skeleton className="ml-auto h-9 w-10" />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : criteria.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                                                            No criteria yet. Click <strong>Add criterion</strong> to create one.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    criteria.map((c) => {
                                                        const cid = getId(c)
                                                        const title = getCriterionTitle(c)
                                                        const desc = getCriterionDescription(c)
                                                        const weight = getCriterionWeight(c)
                                                        const minS = getCriterionMinScore(c)
                                                        const maxS = getCriterionMaxScore(c)

                                                        return (
                                                            <TableRow key={cid || title}>
                                                                <TableCell className="font-medium">
                                                                    <div className="flex items-center gap-2">
                                                                        <span>{title}</span>
                                                                        {cid ? (
                                                                            <Badge variant="outline" className="font-mono text-[10px]">
                                                                                {cid}
                                                                            </Badge>
                                                                        ) : null}
                                                                    </div>
                                                                </TableCell>

                                                                <TableCell className="text-sm text-muted-foreground">
                                                                    {desc ? desc : <span className="italic text-muted-foreground/70">—</span>}
                                                                </TableCell>

                                                                <TableCell className="text-right">
                                                                    {weight !== "" ? <Badge variant="secondary">{weight}</Badge> : "—"}
                                                                </TableCell>

                                                                <TableCell className="text-right">
                                                                    {minS !== "" || maxS !== "" ? (
                                                                        <Badge variant="outline">
                                                                            {minS || "?"}–{maxS || "?"}
                                                                        </Badge>
                                                                    ) : (
                                                                        "—"
                                                                    )}
                                                                </TableCell>

                                                                <TableCell className="text-right">
                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger asChild>
                                                                            <Button variant="ghost" size="icon">
                                                                                <MoreHorizontal className="h-4 w-4" />
                                                                            </Button>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="end">
                                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                            <DropdownMenuSeparator />
                                                                            <DropdownMenuItem onClick={() => openEditCriterion(c)}>
                                                                                Edit
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuSeparator />

                                                                            <AlertDialog>
                                                                                <AlertDialogTrigger asChild>
                                                                                    <DropdownMenuItem
                                                                                        onSelect={(e) => e.preventDefault()}
                                                                                        className="text-destructive focus:text-destructive"
                                                                                    >
                                                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                                                        Delete
                                                                                    </DropdownMenuItem>
                                                                                </AlertDialogTrigger>
                                                                                <AlertDialogContent>
                                                                                    <AlertDialogHeader>
                                                                                        <AlertDialogTitle>Delete criterion?</AlertDialogTitle>
                                                                                        <AlertDialogDescription>
                                                                                            This action cannot be undone.
                                                                                        </AlertDialogDescription>
                                                                                    </AlertDialogHeader>
                                                                                    <AlertDialogFooter>
                                                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                                        <AlertDialogAction
                                                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                                            onClick={() => cid && onDeleteCriterion(cid)}
                                                                                        >
                                                                                            Delete
                                                                                        </AlertDialogAction>
                                                                                    </AlertDialogFooter>
                                                                                </AlertDialogContent>
                                                                            </AlertDialog>
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                </TableCell>
                                                            </TableRow>
                                                        )
                                                    })
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="advanced" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Advanced (JSON)</CardTitle>
                                <CardDescription>
                                    Edit the full rubric template payload. Your backend persists{" "}
                                    <code>name</code>, <code>description</code>, <code>version</code>, and <code>active</code>.
                                </CardDescription>
                            </CardHeader>
                            <Separator />
                            <CardContent className="pt-6">
                                {loading ? (
                                    <Skeleton className="h-72 w-full" />
                                ) : (
                                    <div className="grid gap-3">
                                        <Textarea
                                            value={templateJson}
                                            onChange={(e) => setTemplateJson(e.target.value)}
                                            className="min-h-80 font-mono text-xs"
                                        />
                                        {templateJsonError ? (
                                            <p className="text-sm text-destructive">{templateJsonError}</p>
                                        ) : null}

                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs text-muted-foreground">
                                                Make sure the object includes valid values for fields your backend persists.
                                            </p>
                                            <Button onClick={onSaveTemplateJson} disabled={savingTemplate}>
                                                <Save className="mr-2 h-4 w-4" />
                                                {savingTemplate ? "Saving…" : "Save JSON"}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    )
}
