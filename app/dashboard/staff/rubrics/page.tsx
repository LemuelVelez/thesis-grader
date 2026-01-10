/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { MoreHorizontal, RefreshCw, Search, Eye } from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/hooks/use-auth"

type RubricTemplate = {
    id: string
    name: string
    version: number
    active: boolean
    description: string | null
    createdAt: string
    updatedAt: string
}

type ListResponse = {
    ok: true
    total: number
    templates: RubricTemplate[]
}

type ActiveFilter = "all" | "active" | "inactive"

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
    })

    const text = await res.text()
    let data: any = null
    try {
        data = text ? JSON.parse(text) : null
    } catch {
        data = null
    }

    if (res.status === 401) {
        throw Object.assign(new Error("Session expired"), { status: 401 })
    }

    if (!res.ok) {
        throw new Error(data?.message || `Request failed (${res.status})`)
    }

    if (data && data.ok === false) {
        throw new Error(data?.message || "Request failed")
    }

    return data as T
}

function formatDate(iso: string) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
    }).format(d)
}

function ActiveBadge({ active }: { active: boolean }) {
    return active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>
}

export default function StaffRubricsPage() {
    const router = useRouter()
    const { user, isLoading } = useAuth() as any

    const [loading, setLoading] = React.useState(false)
    const [q, setQ] = React.useState("")
    const [filter, setFilter] = React.useState<ActiveFilter>("all")
    const [templates, setTemplates] = React.useState<RubricTemplate[]>([])
    const [total, setTotal] = React.useState(0)

    const role = String(user?.role ?? "").toLowerCase()
    const canView = role === "staff" || role === "admin"

    const load = React.useCallback(async () => {
        setLoading(true)
        try {
            const query = q.trim()
            const url =
                `/api/evaluation?resource=rubricTemplates` +
                `&q=${encodeURIComponent(query)}` +
                `&limit=200&offset=0`

            const res = await fetchJson<ListResponse>(url)

            const list = Array.isArray(res.templates) ? res.templates : []
            setTemplates(list)
            setTotal(Number(res.total ?? list.length) || list.length)
        } catch (err: any) {
            if (err?.status === 401) {
                toast.error("Session expired", { description: "Please log in again." })
                router.push("/login")
                return
            }
            toast.error("Failed to load rubrics", { description: err?.message ?? "Please try again." })
        } finally {
            setLoading(false)
        }
    }, [q, router])

    React.useEffect(() => {
        if (isLoading) return
        if (!canView) return
        load()
    }, [isLoading, canView, load])

    const visible = React.useMemo(() => {
        let list = templates

        if (filter === "active") list = list.filter((t) => t.active)
        if (filter === "inactive") list = list.filter((t) => !t.active)

        const s = q.trim().toLowerCase()
        if (!s) return list

        return list.filter((t) => {
            const a = String(t.name ?? "").toLowerCase()
            const b = String(t.description ?? "").toLowerCase()
            const v = String(t.version ?? "")
            return a.includes(s) || b.includes(s) || v.includes(s)
        })
    }, [templates, filter, q])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold">Rubrics</h1>
                        <p className="text-sm text-muted-foreground">
                            View rubric templates and criteria used for evaluations.
                        </p>
                    </div>

                    <Button onClick={load} disabled={loading || isLoading || !canView}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                    </Button>
                </div>

                {!canView ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Forbidden</CardTitle>
                            <CardDescription>This page is for Staff/Admin only.</CardDescription>
                        </CardHeader>
                    </Card>
                ) : (
                    <Card>
                        <CardHeader className="space-y-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                <div className="space-y-1">
                                    <CardTitle>Rubric Templates</CardTitle>
                                    <CardDescription>
                                        {total} total • {visible.length} shown
                                    </CardDescription>
                                </div>

                                <div className="relative w-full sm:max-w-md">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        placeholder="Search name, version, description..."
                                        className="pl-9"
                                    />
                                </div>
                            </div>

                            <Separator />

                            <Tabs value={filter} onValueChange={(v) => setFilter(v as ActiveFilter)}>
                                <TabsList className="grid w-full grid-cols-3 sm:max-w-sm">
                                    <TabsTrigger value="all">All</TabsTrigger>
                                    <TabsTrigger value="active">Active</TabsTrigger>
                                    <TabsTrigger value="inactive">Inactive</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </CardHeader>

                        <CardContent>
                            {loading ? (
                                <div className="space-y-3">
                                    <Skeleton className="h-10 w-full" />
                                    <Skeleton className="h-10 w-full" />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                            ) : visible.length === 0 ? (
                                <div className="text-sm text-muted-foreground">No rubric templates found.</div>
                            ) : (
                                <div className="w-full overflow-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Name</TableHead>
                                                <TableHead className="w-24">Version</TableHead>
                                                <TableHead className="w-28">Status</TableHead>
                                                <TableHead className="w-36">Updated</TableHead>
                                                <TableHead className="w-14 text-right"></TableHead>
                                            </TableRow>
                                        </TableHeader>

                                        <TableBody>
                                            {visible.map((t) => (
                                                <TableRow key={t.id}>
                                                    <TableCell className="min-w-72">
                                                        <div className="font-medium">{t.name}</div>
                                                        {t.description ? (
                                                            <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                                                {t.description}
                                                            </div>
                                                        ) : (
                                                            <div className="mt-1 text-xs text-muted-foreground">—</div>
                                                        )}
                                                    </TableCell>

                                                    <TableCell>
                                                        <Badge variant="outline">v{t.version}</Badge>
                                                    </TableCell>

                                                    <TableCell>
                                                        <ActiveBadge active={t.active} />
                                                    </TableCell>

                                                    <TableCell className="text-sm text-muted-foreground">
                                                        {formatDate(t.updatedAt)}
                                                    </TableCell>

                                                    <TableCell className="text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" aria-label="Open menu">
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem asChild>
                                                                    <Link href={`/dashboard/staff/rubrics/${t.id}`}>
                                                                        <span className="flex items-center">
                                                                            <Eye className="mr-2 h-4 w-4" />
                                                                            View criteria
                                                                        </span>
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </DashboardLayout>
    )
}
