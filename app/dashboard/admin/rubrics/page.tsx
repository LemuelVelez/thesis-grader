/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreHorizontal, Plus, RefreshCw, Search, Trash2, Pencil, ExternalLink } from "lucide-react"

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
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

type RubricTemplate = Record<string, any>

type RubricTemplatesResponse =
    | { ok: true; total?: number; templates?: RubricTemplate[] }
    | { ok: false; message?: string; error?: string }

type RubricCriteriaResponse =
    | { ok: true; criteria?: any[] }
    | { ok: false; message?: string; error?: string }

function getId(obj: any): string {
    return String(obj?.id ?? obj?._id ?? obj?.uuid ?? "")
}

function getName(t: RubricTemplate): string {
    return String(t?.name ?? t?.title ?? t?.label ?? t?.rubricName ?? "Untitled Rubric")
}

function getDescription(t: RubricTemplate): string {
    return String(t?.description ?? t?.desc ?? t?.details ?? "")
}

function formatDate(value: any): string {
    if (!value) return ""
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleString()
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

async function fetchCriteriaCount(templateId: string): Promise<number> {
    const qs = new URLSearchParams({
        resource: "rubricCriteria",
        templateId,
    })
    const res = await apiFetch<RubricCriteriaResponse>(`/api/evaluation?${qs.toString()}`)
    if ((res as any)?.ok && Array.isArray((res as any)?.criteria)) return (res as any).criteria.length
    return 0
}

export default function AdminRubricsPage() {
    const router = useRouter()

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const [templates, setTemplates] = React.useState<RubricTemplate[]>([])

    const [countsLoading, setCountsLoading] = React.useState(false)
    const [countsByTemplateId, setCountsByTemplateId] = React.useState<Record<string, number>>({})
    const [criteriaTotal, setCriteriaTotal] = React.useState(0)

    const [search, setSearch] = React.useState("")

    // Create dialog state
    const [createOpen, setCreateOpen] = React.useState(false)
    const [createName, setCreateName] = React.useState("")
    const [createDescription, setCreateDescription] = React.useState("")
    const [creating, setCreating] = React.useState(false)

    const filtered = React.useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return templates
        return templates.filter((t) => {
            const hay = `${getName(t)} ${getDescription(t)} ${getId(t)}`.toLowerCase()
            return hay.includes(q)
        })
    }, [templates, search])

    const loadCounts = React.useCallback(async (list: RubricTemplate[]) => {
        const ids = list.map(getId).filter(Boolean)
        setCountsLoading(true)
        try {
            const out: Record<string, number> = {}
            let total = 0

            // simple concurrency limiter
            const chunkSize = 8
            for (let i = 0; i < ids.length; i += chunkSize) {
                const chunk = ids.slice(i, i + chunkSize)
                const settled = await Promise.allSettled(chunk.map((id) => fetchCriteriaCount(id)))
                for (let j = 0; j < chunk.length; j++) {
                    const id = chunk[j]
                    const r = settled[j]
                    const n = r.status === "fulfilled" ? r.value : 0
                    out[id] = n
                    total += n
                }
            }

            setCountsByTemplateId(out)
            setCriteriaTotal(total)
        } catch {
            setCountsByTemplateId({})
            setCriteriaTotal(0)
        } finally {
            setCountsLoading(false)
        }
    }, [])

    const load = React.useCallback(async () => {
        setError(null)
        setLoading(true)
        setCountsByTemplateId({})
        setCriteriaTotal(0)

        try {
            const qs = new URLSearchParams({
                resource: "rubricTemplates",
                limit: "200",
                offset: "0",
                q: "",
            })

            const res = await apiFetch<RubricTemplatesResponse>(`/api/evaluation?${qs.toString()}`)

            if (!(res as any)?.ok) {
                throw new Error((res as any)?.message ?? (res as any)?.error ?? "Failed to load rubrics")
            }

            const list = Array.isArray((res as any)?.templates) ? ((res as any).templates as RubricTemplate[]) : []
            setTemplates(list)

            // criteria counts (API returns criteria per templateId)
            void loadCounts(list)
        } catch (e: any) {
            setTemplates([])
            setError(e?.message ?? "Failed to load rubrics")
        } finally {
            setLoading(false)
        }
    }, [loadCounts])

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

    async function onCreate() {
        setCreating(true)
        setError(null)
        try {
            const payload: Record<string, any> = {
                name: createName.trim() || "Untitled Rubric",
            }
            if (createDescription.trim()) payload.description = createDescription.trim()

            const qs = new URLSearchParams({ resource: "rubricTemplates" })
            const created = await apiFetch<any>(`/api/evaluation?${qs.toString()}`, {
                method: "POST",
                body: JSON.stringify(payload),
            })

            if (!created?.ok) throw new Error(created?.message ?? created?.error ?? "Failed to create rubric")

            const tpl = created?.template ?? null
            const id = getId(tpl) || getId(created?.data) || getId(created?.item)
            setCreateOpen(false)
            setCreateName("")
            setCreateDescription("")
            await load()
            if (id) router.push(`/dashboard/admin/rubrics/${encodeURIComponent(id)}`)
        } catch (e: any) {
            setError(e?.message ?? "Failed to create rubric")
        } finally {
            setCreating(false)
        }
    }

    async function onDelete(templateId: string) {
        setError(null)
        try {
            const qs = new URLSearchParams({ resource: "rubricTemplates", id: templateId })
            const res = await apiFetch<any>(`/api/evaluation?${qs.toString()}`, {
                method: "DELETE",
            })
            if (!res?.ok) throw new Error(res?.message ?? res?.error ?? "Failed to delete rubric")
            await load()
        } catch (e: any) {
            setError(e?.message ?? "Failed to delete rubric")
        }
    }

    return (
        <DashboardLayout title="Rubrics">
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
                                <BreadcrumbPage>Rubrics</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight">Rubrics</h1>
                            <p className="text-sm text-muted-foreground">
                                Create, manage, and maintain rubric templates and their criteria.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={onRefresh} disabled={loading || refreshing}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Refresh
                            </Button>

                            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                                <DialogTrigger asChild>
                                    <Button>
                                        <Plus className="mr-2 h-4 w-4" />
                                        New rubric
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-130">
                                    <DialogHeader>
                                        <DialogTitle>Create rubric</DialogTitle>
                                        <DialogDescription>
                                            Start with a name and optional description. You can add criteria after.
                                        </DialogDescription>
                                    </DialogHeader>

                                    <div className="grid gap-4 py-2">
                                        <div className="grid gap-2">
                                            <Label htmlFor="rubric-name">Name</Label>
                                            <Input
                                                id="rubric-name"
                                                value={createName}
                                                onChange={(e) => setCreateName(e.target.value)}
                                                placeholder="e.g., Thesis Defense Rubric"
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="rubric-desc">Description</Label>
                                            <Textarea
                                                id="rubric-desc"
                                                value={createDescription}
                                                onChange={(e) => setCreateDescription(e.target.value)}
                                                placeholder="Optional notes about when/how to use this rubric…"
                                            />
                                        </div>
                                    </div>

                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                                            Cancel
                                        </Button>
                                        <Button onClick={onCreate} disabled={creating}>
                                            {creating ? "Creating…" : "Create"}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </div>

                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>Something went wrong</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Total rubrics</CardTitle>
                            <CardDescription>Templates available in the system</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-semibold">{templates.length}</div>}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Total criteria</CardTitle>
                            <CardDescription>Across all templates</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading || countsLoading ? (
                                <Skeleton className="h-8 w-20" />
                            ) : (
                                <div className="text-3xl font-semibold">{criteriaTotal}</div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Quick search</CardTitle>
                            <CardDescription>Filter by name, description, or ID</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search rubrics…"
                                    className="pl-9"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <CardTitle>Rubric templates</CardTitle>
                            <CardDescription>Click a rubric to manage its criteria.</CardDescription>
                        </div>
                        <Badge variant="secondary">{filtered.length} shown</Badge>
                    </CardHeader>

                    <Separator />

                    <CardContent className="pt-4">
                        <ScrollArea className="w-full">
                            <div className="min-w-225">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead className="w-[40%]">Description</TableHead>
                                            <TableHead className="text-right">Criteria</TableHead>
                                            <TableHead>Updated</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>

                                    <TableBody>
                                        {loading
                                            ? Array.from({ length: 6 }).map((_, i) => (
                                                <TableRow key={`sk-${i}`}>
                                                    <TableCell>
                                                        <Skeleton className="h-5 w-55" />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Skeleton className="h-5 w-105" />
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Skeleton className="ml-auto h-5 w-12.5" />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Skeleton className="h-5 w-40" />
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Skeleton className="ml-auto h-9 w-10" />
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                            : filtered.length === 0
                                                ? (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                                                            No rubrics found.
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                                : filtered.map((t) => {
                                                    const id = getId(t)
                                                    const name = getName(t)
                                                    const desc = getDescription(t)
                                                    const updated = t?.updatedAt ?? t?.updated_at ?? t?.modifiedAt ?? t?.createdAt
                                                    const criteriaCount = countsByTemplateId[id] ?? 0

                                                    return (
                                                        <TableRow key={id || name}>
                                                            <TableCell className="font-medium">
                                                                <div className="flex items-center gap-2">
                                                                    <Link
                                                                        href={`/dashboard/admin/rubrics/${encodeURIComponent(id)}`}
                                                                        className="hover:underline"
                                                                    >
                                                                        {name}
                                                                    </Link>
                                                                    {id ? (
                                                                        <Badge variant="outline" className="font-mono text-[10px]">
                                                                            {id}
                                                                        </Badge>
                                                                    ) : null}
                                                                </div>
                                                            </TableCell>

                                                            <TableCell className="text-sm text-muted-foreground">
                                                                {desc ? desc : <span className="italic text-muted-foreground/70">No description</span>}
                                                            </TableCell>

                                                            <TableCell className="text-right">
                                                                {countsLoading ? (
                                                                    <Skeleton className="ml-auto h-6 w-10" />
                                                                ) : (
                                                                    <Badge variant={criteriaCount > 0 ? "secondary" : "outline"}>
                                                                        {criteriaCount}
                                                                    </Badge>
                                                                )}
                                                            </TableCell>

                                                            <TableCell className="text-sm text-muted-foreground">
                                                                {formatDate(updated) || <span className="italic text-muted-foreground/70">—</span>}
                                                            </TableCell>

                                                            <TableCell className="text-right">
                                                                <div className="flex justify-end gap-2">
                                                                    <Button asChild variant="outline" size="sm">
                                                                        <Link href={`/dashboard/admin/rubrics/${encodeURIComponent(id)}`}>
                                                                            <ExternalLink className="mr-2 h-4 w-4" />
                                                                            Open
                                                                        </Link>
                                                                    </Button>

                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger asChild>
                                                                            <Button variant="ghost" size="icon">
                                                                                <MoreHorizontal className="h-4 w-4" />
                                                                            </Button>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="end">
                                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                            <DropdownMenuSeparator />
                                                                            <DropdownMenuItem asChild>
                                                                                <Link href={`/dashboard/admin/rubrics/${encodeURIComponent(id)}`}>
                                                                                    <Pencil className="mr-2 h-4 w-4" />
                                                                                    Edit
                                                                                </Link>
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
                                                                                        <AlertDialogTitle>Delete rubric?</AlertDialogTitle>
                                                                                        <AlertDialogDescription>
                                                                                            This will permanently delete the rubric template and its criteria.
                                                                                        </AlertDialogDescription>
                                                                                    </AlertDialogHeader>
                                                                                    <AlertDialogFooter>
                                                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                                        <AlertDialogAction
                                                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                                            onClick={() => id && onDelete(id)}
                                                                                        >
                                                                                            Delete
                                                                                        </AlertDialogAction>
                                                                                    </AlertDialogFooter>
                                                                                </AlertDialogContent>
                                                                            </AlertDialog>
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })}
                                    </TableBody>
                                </Table>
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
