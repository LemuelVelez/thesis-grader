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

type GetTemplateResponse =
    | { ok: true; template: RubricTemplate }
    | { ok: false; message?: string; error?: string }

type ListCriteriaResponse =
    | { ok: true; criteria: RubricCriterion[] }
    | { ok: false; message?: string; error?: string }

type OkResponse = { ok: true;[k: string]: any } | { ok: false; message?: string; error?: string }

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
    const v = c?.minScore ?? c?.min_score ?? ""
    return v === null || v === undefined ? "" : String(v)
}

function getCriterionMaxScore(c: RubricCriterion): string {
    const v = c?.maxScore ?? c?.max_score ?? ""
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
            message = data?.message ?? data?.error ?? message
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

function toNumberOrUndefined(v: any) {
    if (v === null || v === undefined || v === "") return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
}

function toNumberOrString(v: any) {
    if (v === null || v === undefined || v === "") return undefined
    if (typeof v === "number") return v
    const s = String(v).trim()
    if (!s) return undefined
    const n = Number(s)
    return Number.isFinite(n) ? n : s
}

function pickTemplatePatch(obj: any) {
    const patch: Record<string, any> = {}

    if (obj && typeof obj === "object") {
        if (obj.name !== undefined) patch.name = String(obj.name)
        if (obj.description !== undefined) {
            const d = String(obj.description ?? "").trim()
            patch.description = d ? d : null
        }
        if (obj.version !== undefined) {
            const v = toNumberOrUndefined(obj.version)
            patch.version = v && v > 0 ? v : 1
        }
        if (obj.active !== undefined) patch.active = Boolean(obj.active)
    }

    return patch
}

function normalizeCriterionCreatePayload(raw: any, templateId: string) {
    const obj = raw && typeof raw === "object" ? raw : {}

    const title = obj.criterion ?? obj.title ?? obj.name ?? obj.label
    const desc = obj.description ?? obj.desc

    const payload: Record<string, any> = {
        templateId:
            obj.templateId ??
            obj.template_id ??
            obj.rubricTemplateId ??
            obj.rubric_template_id ??
            obj.rubricId ??
            templateId,
        criterion: title !== undefined ? String(title) : "",
        description: desc !== undefined && String(desc).trim() ? String(desc).trim() : null,
        weight: toNumberOrString(obj.weight ?? obj.points ?? obj.score) ?? 1,
        minScore: toNumberOrUndefined(obj.minScore ?? obj.min_score) ?? 1,
        maxScore: toNumberOrUndefined(obj.maxScore ?? obj.max_score) ?? 5,
    }

    return payload
}

function normalizeCriterionPatchPayload(raw: any) {
    const obj = raw && typeof raw === "object" ? raw : {}

    const title = obj.criterion ?? obj.title ?? obj.name ?? obj.label
    const desc = obj.description ?? obj.desc

    const payload: Record<string, any> = {}

    if (title !== undefined) payload.criterion = String(title)
    if (desc !== undefined) {
        const d = String(desc ?? "").trim()
        payload.description = d ? d : null
    }
    if (obj.weight !== undefined) payload.weight = toNumberOrString(obj.weight)
    if (obj.minScore !== undefined || obj.min_score !== undefined) payload.minScore = toNumberOrUndefined(obj.minScore ?? obj.min_score)
    if (obj.maxScore !== undefined || obj.max_score !== undefined) payload.maxScore = toNumberOrUndefined(obj.maxScore ?? obj.max_score)

    return payload
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
            if (!templateId) throw new Error("Missing rubric id")

            // Template
            const tQs = new URLSearchParams({ resource: "rubricTemplates", id: templateId })
            const tRes = await apiFetch<GetTemplateResponse>(`/api/evaluation?${tQs.toString()}`)
            if (!(tRes as any)?.ok) throw new Error((tRes as any)?.message ?? (tRes as any)?.error ?? "Rubric not found")

            const foundTemplate = (tRes as any).template as RubricTemplate
            setTemplate(foundTemplate)
            setName(getTemplateName(foundTemplate))
            setDescription(getTemplateDescription(foundTemplate))
            setVersion(String(getTemplateVersion(foundTemplate)))
            setActive(getTemplateActive(foundTemplate))
            setTemplateJson(prettyJson(foundTemplate))
            setTemplateJsonError(null)

            // Criteria
            const cQs = new URLSearchParams({ resource: "rubricCriteria", templateId })
            const cRes = await apiFetch<ListCriteriaResponse>(`/api/evaluation?${cQs.toString()}`)
            if (!(cRes as any)?.ok) throw new Error((cRes as any)?.message ?? (cRes as any)?.error ?? "Failed to load criteria")

            setCriteria(Array.isArray((cRes as any)?.criteria) ? ((cRes as any).criteria as RubricCriterion[]) : [])
        } catch (e: any) {
            setError(e?.message ?? "Failed to load rubric")
            setTemplate(null)
            setCriteria([])
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

            const patch: Record<string, any> = {
                name: name.trim() || "Untitled Rubric",
                description: descTrim ? descTrim : null,
                version: Number.isFinite(vNum) && vNum > 0 ? vNum : 1,
                active: Boolean(active),
            }

            const qs = new URLSearchParams({ resource: "rubricTemplates", id: templateId })
            const updated = await apiFetch<OkResponse>(`/api/evaluation?${qs.toString()}`, {
                method: "PATCH",
                body: JSON.stringify(patch),
            })

            if (!(updated as any)?.ok) throw new Error((updated as any)?.message ?? (updated as any)?.error ?? "Failed to save rubric")

            await load()
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
            const patch = pickTemplatePatch(parsed.value)

            const qs = new URLSearchParams({ resource: "rubricTemplates", id: templateId })
            const updated = await apiFetch<OkResponse>(`/api/evaluation?${qs.toString()}`, {
                method: "PATCH",
                body: JSON.stringify(patch),
            })

            if (!(updated as any)?.ok) throw new Error((updated as any)?.message ?? (updated as any)?.error ?? "Failed to save rubric")

            await load()
        } catch (e: any) {
            setError(e?.message ?? "Failed to save rubric")
        } finally {
            setSavingTemplate(false)
        }
    }

    async function onDeleteTemplate() {
        setError(null)
        try {
            const qs = new URLSearchParams({ resource: "rubricTemplates", id: templateId })
            const res = await apiFetch<OkResponse>(`/api/evaluation?${qs.toString()}`, { method: "DELETE" })
            if (!(res as any)?.ok) throw new Error((res as any)?.message ?? (res as any)?.error ?? "Failed to delete rubric")
            router.push("/dashboard/admin/rubrics")
        } catch (e: any) {
            setError(e?.message ?? "Failed to delete rubric")
        }
    }

    function openCreateCriterion() {
        setCriterionEditing(null)
        setCriterionTitle("")
        setCriterionDesc("")
        setCriterionWeight("1")
        setCriterionMinScore("1")
        setCriterionMaxScore("5")

        setCriterionJson(
            prettyJson({
                templateId,
                criterion: "",
                description: "",
                weight: 1,
                minScore: 1,
                maxScore: 5,
            })
        )
        setCriterionJsonError(null)
        setCriterionDialogOpen(true)
    }

    function openEditCriterion(c: RubricCriterion) {
        setCriterionEditing(c)
        setCriterionTitle(getCriterionTitle(c))
        setCriterionDesc(getCriterionDescription(c))
        setCriterionWeight(getCriterionWeight(c) || "1")
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

            if (!isEdit) {
                const payload = normalizeCriterionCreatePayload(parsed.value, templateId)

                // overlay form values (form wins)
                const formTitle = criterionTitle.trim()
                if (formTitle) payload.criterion = formTitle

                const formDescTrim = criterionDesc.trim()
                payload.description = formDescTrim ? formDescTrim : null

                if (criterionWeight.trim()) payload.weight = toNumberOrString(criterionWeight.trim()) ?? payload.weight
                if (criterionMinScore.trim()) payload.minScore = toNumberOrUndefined(criterionMinScore.trim()) ?? payload.minScore
                if (criterionMaxScore.trim()) payload.maxScore = toNumberOrUndefined(criterionMaxScore.trim()) ?? payload.maxScore

                const qs = new URLSearchParams({ resource: "rubricCriteria" })
                const res = await apiFetch<OkResponse>(`/api/evaluation?${qs.toString()}`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                })
                if (!(res as any)?.ok) throw new Error((res as any)?.message ?? (res as any)?.error ?? "Failed to save criterion")
            } else {
                const patch = normalizeCriterionPatchPayload(parsed.value)

                const formTitle = criterionTitle.trim()
                if (formTitle) patch.criterion = formTitle

                const formDescTrim = criterionDesc.trim()
                patch.description = formDescTrim ? formDescTrim : null

                if (criterionWeight.trim()) patch.weight = toNumberOrString(criterionWeight.trim())
                if (criterionMinScore.trim()) patch.minScore = toNumberOrUndefined(criterionMinScore.trim())
                if (criterionMaxScore.trim()) patch.maxScore = toNumberOrUndefined(criterionMaxScore.trim())

                const qs = new URLSearchParams({ resource: "rubricCriteria", id: cid })
                const res = await apiFetch<OkResponse>(`/api/evaluation?${qs.toString()}`, {
                    method: "PATCH",
                    body: JSON.stringify(patch),
                })
                if (!(res as any)?.ok) throw new Error((res as any)?.message ?? (res as any)?.error ?? "Failed to save criterion")
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
            const qs = new URLSearchParams({ resource: "rubricCriteria", id: cid })
            const res = await apiFetch<OkResponse>(`/api/evaluation?${qs.toString()}`, { method: "DELETE" })
            if (!(res as any)?.ok) throw new Error((res as any)?.message ?? (res as any)?.error ?? "Failed to delete criterion")
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
                                            This action cannot be undone. Any criteria attached to this rubric template will be deleted as well (via DB cascade).
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
                                                    Tip: create expects <code>templateId</code>, <code>criterion</code>, and optional fields.
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
                                    Edit the rubric template fields persisted by the backend:{" "}
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
                                                We only PATCH persisted fields to match your API contracts.
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
