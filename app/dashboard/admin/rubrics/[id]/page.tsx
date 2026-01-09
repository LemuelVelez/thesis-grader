/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
    ArrowLeft,
    Plus,
    RefreshCw,
    Save,
    Trash2,
    MoreHorizontal,
    Code2,
    ListChecks,
} from "lucide-react"

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type RubricTemplate = Record<string, any>
type RubricCriterion = Record<string, any>

function getId(obj: any): string {
    return String(obj?.id ?? obj?._id ?? obj?.uuid ?? "")
}

function getName(t: RubricTemplate): string {
    return String(t?.name ?? t?.title ?? t?.label ?? t?.rubricName ?? "Untitled Rubric")
}

function getDescription(t: RubricTemplate): string {
    return String(t?.description ?? t?.desc ?? t?.details ?? "")
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

export default function AdminRubricDetailPage() {
    const router = useRouter()
    const params = useParams<{ id: string }>()
    const templateId = decodeURIComponent(String(params?.id ?? ""))

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const [template, setTemplate] = React.useState<RubricTemplate | null>(null)
    const [criteria, setCriteria] = React.useState<RubricCriterion[]>([])

    // Template form state
    const [name, setName] = React.useState("")
    const [description, setDescription] = React.useState("")
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
    const [criterionJson, setCriterionJson] = React.useState("{}")
    const [criterionJsonError, setCriterionJsonError] = React.useState<string | null>(null)
    const [savingCriterion, setSavingCriterion] = React.useState(false)

    const load = React.useCallback(async () => {
        setError(null)
        setLoading(true)
        try {
            // Best effort: try query by id, else fetch all and find.
            const [tplRes, critRes] = await Promise.allSettled([
                apiFetch<any>(`/api/admin/rubric-templates?id=${encodeURIComponent(templateId)}`),
                apiFetch<any>(`/api/admin/rubric-criteria?templateId=${encodeURIComponent(templateId)}`),
            ])

            let found: RubricTemplate | null = null

            if (tplRes.status === "fulfilled") {
                const value = tplRes.value
                const list = Array.isArray(value) ? value : value?.items ?? value?.data ?? []
                if (Array.isArray(list)) {
                    found = list.find((x) => getId(x) === templateId) ?? null
                } else if (value && typeof value === "object") {
                    // Some APIs return a single object
                    if (getId(value) === templateId) found = value
                }
            }

            if (!found) {
                // fallback: list everything and search
                const all = await apiFetch<any>("/api/admin/rubric-templates")
                const list = Array.isArray(all) ? all : all?.items ?? all?.data ?? []
                if (Array.isArray(list)) {
                    found = list.find((x) => getId(x) === templateId) ?? null
                }
            }

            setTemplate(found)

            if (found) {
                setName(getName(found))
                setDescription(getDescription(found))
                setTemplateJson(prettyJson(found))
                setTemplateJsonError(null)
            }

            if (critRes.status === "fulfilled") {
                const value = critRes.value
                const list = Array.isArray(value) ? value : value?.items ?? value?.data ?? []
                setCriteria(Array.isArray(list) ? list : [])
            } else {
                // fallback: get all and filter
                const all = await apiFetch<any>("/api/admin/rubric-criteria")
                const list = Array.isArray(all) ? all : all?.items ?? all?.data ?? []
                const arr = Array.isArray(list) ? list : []
                const filtered = arr.filter((c) => {
                    const tid = String(c?.templateId ?? c?.rubricTemplateId ?? c?.rubricId ?? "")
                    return tid === templateId
                })
                setCriteria(filtered)
            }

            if (!found) {
                throw new Error("Rubric not found")
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
            const payload: Record<string, any> = {
                ...(template ?? {}),
                name: name.trim() || "Untitled Rubric",
                description: description.trim(),
            }

            const updated = await apiFetch<any>(`/api/admin/rubric-templates/${encodeURIComponent(templateId)}`, {
                method: "PUT",
                body: JSON.stringify(payload),
            })

            const next = updated?.data ?? updated?.item ?? updated
            setTemplate(next)
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
            setName(getName(next))
            setDescription(getDescription(next))
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
        setCriterionJson(
            prettyJson({
                templateId,
                title: "",
                description: "",
                weight: "",
            })
        )
        setCriterionJsonError(null)
        setCriterionDialogOpen(true)
    }

    function openEditCriterion(c: RubricCriterion) {
        setCriterionEditing(c)
        setCriterionTitle(String(c?.title ?? c?.name ?? c?.label ?? ""))
        setCriterionDesc(String(c?.description ?? c?.desc ?? ""))
        setCriterionWeight(String(c?.weight ?? c?.points ?? c?.score ?? ""))
        setCriterionJson(prettyJson(c))
        setCriterionJsonError(null)
        setCriterionDialogOpen(true)
    }

    async function onSaveCriterion() {
        setSavingCriterion(true)
        setError(null)

        // Prefer JSON editor if user changed it; otherwise build from form
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

            // Ensure templateId is present for creates (and for some backends, updates too)
            const payload: Record<string, any> = {
                ...(parsed.value ?? {}),
            }
            if (!payload.templateId && !payload.rubricTemplateId && !payload.rubricId) {
                payload.templateId = templateId
            }

            // If JSON is basically empty, add form fields as fallback
            if (!Object.keys(payload).length) {
                payload.templateId = templateId
                payload.title = criterionTitle
                payload.description = criterionDesc
                if (criterionWeight !== "") payload.weight = criterionWeight
            }

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

    const templateTitle = template ? getName(template) : "Rubric"

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
                                <Skeleton className="h-9 w-55" />
                            ) : (
                                <div className="flex items-center gap-2">
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
                                            This action cannot be undone. Make sure you’ve handled any rubric criteria
                                            that reference this template.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
                                            <Label htmlFor="description">Description</Label>
                                            <Textarea
                                                id="description"
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                placeholder="Optional description"
                                            />
                                        </div>

                                        <div className="flex items-center justify-end gap-2">
                                            <Button onClick={onSaveTemplateForm} disabled={savingTemplate}>
                                                <Save className="mr-2 h-4 w-4" />
                                                {savingTemplate ? "Saving…" : "Save"}
                                            </Button>
                                        </div>

                                        <Alert>
                                            <AlertTitle>Note</AlertTitle>
                                            <AlertDescription>
                                                If your backend uses different field names (e.g., <code>title</code> instead of{" "}
                                                <code>name</code>), use the <strong>Advanced</strong> tab to edit the raw JSON.
                                            </AlertDescription>
                                        </Alert>
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
                                    <DialogContent className="sm:max-w-180">
                                        <DialogHeader>
                                            <DialogTitle>{criterionEditing ? "Edit criterion" : "Add criterion"}</DialogTitle>
                                            <DialogDescription>
                                                Use the form for common fields, or edit the JSON directly if your schema differs.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="grid gap-6 py-2 md:grid-cols-2">
                                            <div className="grid gap-4">
                                                <div className="grid gap-2">
                                                    <Label htmlFor="c-title">Title</Label>
                                                    <Input
                                                        id="c-title"
                                                        value={criterionTitle}
                                                        onChange={(e) => setCriterionTitle(e.target.value)}
                                                        placeholder="e.g., Clarity of Presentation"
                                                    />
                                                </div>

                                                <div className="grid gap-2">
                                                    <Label htmlFor="c-desc">Description</Label>
                                                    <Textarea
                                                        id="c-desc"
                                                        value={criterionDesc}
                                                        onChange={(e) => setCriterionDesc(e.target.value)}
                                                        placeholder="Optional notes"
                                                    />
                                                </div>

                                                <div className="grid gap-2">
                                                    <Label htmlFor="c-weight">Weight / Points</Label>
                                                    <Input
                                                        id="c-weight"
                                                        value={criterionWeight}
                                                        onChange={(e) => setCriterionWeight(e.target.value)}
                                                        placeholder="e.g., 10"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid gap-2">
                                                <Label htmlFor="c-json">Criterion JSON</Label>
                                                <Textarea
                                                    id="c-json"
                                                    value={criterionJson}
                                                    onChange={(e) => setCriterionJson(e.target.value)}
                                                    className="min-h-60 font-mono text-xs"
                                                />
                                                {criterionJsonError ? (
                                                    <p className="text-sm text-destructive">{criterionJsonError}</p>
                                                ) : null}
                                                <p className="text-xs text-muted-foreground">
                                                    Tip: ensure the payload includes <code>templateId</code> (or your equivalent).
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
                                    <div className="min-w-225">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Title</TableHead>
                                                    <TableHead className="w-[45%]">Description</TableHead>
                                                    <TableHead className="text-right">Weight</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>

                                            <TableBody>
                                                {loading ? (
                                                    Array.from({ length: 5 }).map((_, i) => (
                                                        <TableRow key={`skc-${i}`}>
                                                            <TableCell>
                                                                <Skeleton className="h-5 w-55" />
                                                            </TableCell>
                                                            <TableCell>
                                                                <Skeleton className="h-5 w-105" />
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <Skeleton className="ml-auto h-5 w-15" />
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <Skeleton className="ml-auto h-9 w-10" />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : criteria.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                                                            No criteria yet. Click <strong>Add criterion</strong> to create one.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    criteria.map((c) => {
                                                        const cid = getId(c)
                                                        const title = String(c?.title ?? c?.name ?? c?.label ?? "Untitled criterion")
                                                        const desc = String(c?.description ?? c?.desc ?? "")
                                                        const weight = c?.weight ?? c?.points ?? c?.score ?? ""

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
                                                                    {weight !== "" ? <Badge variant="secondary">{String(weight)}</Badge> : "—"}
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
                                    Edit the full rubric template payload. Useful if your backend schema differs from the form fields.
                                </CardDescription>
                            </CardHeader>
                            <Separator />
                            <CardContent className="pt-6">
                                {loading ? (
                                    <Skeleton className="h-70 w-full" />
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
                                                Make sure the object includes the template identifier expected by your backend.
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
