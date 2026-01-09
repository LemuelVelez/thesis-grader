/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
    MoreHorizontal,
    Plus,
    RefreshCw,
    Search,
    Trash2,
    Pencil,
    ExternalLink,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

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

function isActive(t: RubricTemplate): boolean {
    // default true if missing (matches earlier behavior)
    return Boolean(t?.active ?? true)
}

function formatDate(value: any): string {
    if (!value) return ""
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleString()
}

function normalizeList(value: any): any[] {
    if (Array.isArray(value)) return value
    const list = value?.items ?? value?.data ?? value?.rows
    if (Array.isArray(list)) return list
    return []
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

export default function StaffRubricsPage() {
    const router = useRouter()

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const [templates, setTemplates] = React.useState<RubricTemplate[]>([])
    const [criteria, setCriteria] = React.useState<RubricCriterion[]>([])

    const [search, setSearch] = React.useState("")
    const [tab, setTab] = React.useState<"all" | "active" | "inactive">("all")

    // Create dialog state
    const [createOpen, setCreateOpen] = React.useState(false)
    const [createName, setCreateName] = React.useState("")
    const [createDescription, setCreateDescription] = React.useState("")
    const [creating, setCreating] = React.useState(false)

    const countsByTemplateId = React.useMemo(() => {
        const map = new Map<string, number>()
        for (const c of criteria) {
            const templateId = String(
                c?.template_id ??
                c?.templateId ??
                c?.rubricTemplateId ??
                c?.rubric_template_id ??
                c?.rubricId ??
                ""
            )
            if (!templateId) continue
            map.set(templateId, (map.get(templateId) ?? 0) + 1)
        }
        return map
    }, [criteria])

    const filtered = React.useMemo(() => {
        const q = search.trim().toLowerCase()
        let base = templates

        if (tab === "active") base = base.filter((t) => isActive(t))
        if (tab === "inactive") base = base.filter((t) => !isActive(t))

        if (!q) return base
        return base.filter((t) => {
            const hay = `${getName(t)} ${getDescription(t)} ${getId(t)}`.toLowerCase()
            return hay.includes(q)
        })
    }, [templates, search, tab])

    const load = React.useCallback(async () => {
        setError(null)
        setLoading(true)
        try {
            const [t, c] = await Promise.allSettled([
                apiFetch<any>("/api/staff/rubric-templates"),
                apiFetch<any>("/api/staff/rubric-criteria"),
            ])

            if (t.status === "fulfilled") {
                setTemplates(normalizeList(t.value))
            } else {
                setTemplates([])
            }

            if (c.status === "fulfilled") {
                setCriteria(normalizeList(c.value))
            } else {
                setCriteria([])
            }

            if (t.status === "rejected" && c.status === "rejected") {
                throw t.reason
            }
        } catch (e: any) {
            setError(e?.message ?? "Failed to load rubrics")
        } finally {
            setLoading(false)
        }
    }, [])

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

            const created = await apiFetch<any>("/api/staff/rubric-templates", {
                method: "POST",
                body: JSON.stringify(payload),
            })

            const id = getId(created) || getId(created?.data) || getId(created?.item)
            setCreateOpen(false)
            setCreateName("")
            setCreateDescription("")
            await load()
            if (id) router.push(`/dashboard/staff/rubrics/${encodeURIComponent(id)}`)
        } catch (e: any) {
            setError(e?.message ?? "Failed to create rubric")
        } finally {
            setCreating(false)
        }
    }

    async function onDelete(templateId: string) {
        setError(null)
        try {
            await apiFetch(`/api/staff/rubric-templates/${encodeURIComponent(templateId)}`, {
                method: "DELETE",
            })
            await load()
        } catch (e: any) {
            setError(e?.message ?? "Failed to delete rubric")
        }
    }

    const totalActive = React.useMemo(
        () => templates.filter((t) => isActive(t)).length,
        [templates]
    )

    return (
        <DashboardLayout title="Rubrics">
            <div className="space-y-6">
                <div className="flex flex-col gap-3">
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbLink asChild>
                                    <Link href="/dashboard/staff">Staff</Link>
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
                                Browse rubric templates and criteria for evaluations.
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
                            <CardDescription>Templates available</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-semibold">{templates.length}</div>}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Active rubrics</CardTitle>
                            <CardDescription>Enabled templates</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-semibold">{totalActive}</div>}
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
                            <CardDescription>Open a rubric to view and manage its criteria.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary">{filtered.length} shown</Badge>
                        </div>
                    </CardHeader>

                    <Separator />

                    <CardContent className="pt-4">
                        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <TabsList>
                                    <TabsTrigger value="all">All</TabsTrigger>
                                    <TabsTrigger value="active">Active</TabsTrigger>
                                    <TabsTrigger value="inactive">Inactive</TabsTrigger>
                                </TabsList>

                                <p className="text-xs text-muted-foreground">
                                    Tip: active/inactive comes from <code>rubric_templates.active</code>.
                                </p>
                            </div>

                            <TabsContent value="all" className="mt-4">
                                <RubricsTable
                                    loading={loading}
                                    items={filtered}
                                    countsByTemplateId={countsByTemplateId}
                                    onDelete={onDelete}
                                />
                            </TabsContent>

                            <TabsContent value="active" className="mt-4">
                                <RubricsTable
                                    loading={loading}
                                    items={filtered}
                                    countsByTemplateId={countsByTemplateId}
                                    onDelete={onDelete}
                                />
                            </TabsContent>

                            <TabsContent value="inactive" className="mt-4">
                                <RubricsTable
                                    loading={loading}
                                    items={filtered}
                                    countsByTemplateId={countsByTemplateId}
                                    onDelete={onDelete}
                                />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}

function RubricsTable({
    loading,
    items,
    countsByTemplateId,
    onDelete,
}: {
    loading: boolean
    items: RubricTemplate[]
    countsByTemplateId: Map<string, number>
    onDelete: (templateId: string) => Promise<void>
}) {
    return (
        <ScrollArea className="w-full">
            <div className="min-w-225">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead className="w-[40%]">Description</TableHead>
                            <TableHead className="text-right">Criteria</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Updated</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>

                    <TableBody>
                        {loading ? (
                            Array.from({ length: 6 }).map((_, i) => (
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
                                        <Skeleton className="h-5 w-18" />
                                    </TableCell>
                                    <TableCell>
                                        <Skeleton className="h-5 w-40" />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Skeleton className="ml-auto h-9 w-10" />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                                    No rubrics found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            items.map((t) => {
                                const id = getId(t)
                                const name = getName(t)
                                const desc = getDescription(t)
                                const updated = t?.updatedAt ?? t?.updated_at ?? t?.modifiedAt ?? t?.createdAt
                                const criteriaCount = countsByTemplateId.get(id) ?? 0
                                const active = Boolean(t?.active ?? true)

                                return (
                                    <TableRow key={id || name}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <Link
                                                    href={`/dashboard/staff/rubrics/${encodeURIComponent(id)}`}
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
                                            <Badge variant={criteriaCount > 0 ? "secondary" : "outline"}>{criteriaCount}</Badge>
                                        </TableCell>

                                        <TableCell>
                                            <Badge variant={active ? "secondary" : "outline"}>{active ? "Active" : "Inactive"}</Badge>
                                        </TableCell>

                                        <TableCell className="text-sm text-muted-foreground">
                                            {formatDate(updated) || <span className="italic text-muted-foreground/70">—</span>}
                                        </TableCell>

                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button asChild variant="outline" size="sm">
                                                    <Link href={`/dashboard/staff/rubrics/${encodeURIComponent(id)}`}>
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
                                                            <Link href={`/dashboard/staff/rubrics/${encodeURIComponent(id)}`}>
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
                                                                        This will permanently delete the rubric template. Criteria may be deleted too if your DB cascades.
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
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </ScrollArea>
    )
}
