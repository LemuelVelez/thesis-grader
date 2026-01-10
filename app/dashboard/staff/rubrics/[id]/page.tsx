/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, RefreshCw } from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

type RubricCriterion = {
    id: string
    templateId: string
    criterion: string
    description: string | null
    weight: string
    minScore: number
    maxScore: number
    createdAt: string
}

type TemplateResponse = { ok: true; template: RubricTemplate }
type CriteriaResponse = { ok: true; criteria: RubricCriterion[] }

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

function ActiveBadge({ active }: { active: boolean }) {
    return active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>
}

function fmtDateTime(iso: string) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(d)
}

function asNumberWeight(w: string) {
    const x = Number(w)
    return Number.isFinite(x) ? x : 0
}

export default function StaffRubricDetailPage() {
    const router = useRouter()
    const params = useParams() as { id?: string }
    const { user, isLoading } = useAuth() as any

    const id = String(params?.id ?? "")
    const role = String(user?.role ?? "").toLowerCase()
    const canView = role === "staff" || role === "admin"

    const [loading, setLoading] = React.useState(false)
    const [template, setTemplate] = React.useState<RubricTemplate | null>(null)
    const [criteria, setCriteria] = React.useState<RubricCriterion[]>([])

    const load = React.useCallback(async () => {
        if (!id) return
        setLoading(true)
        try {
            const [tRes, cRes] = await Promise.all([
                fetchJson<TemplateResponse>(`/api/evaluation?resource=rubricTemplates&id=${encodeURIComponent(id)}`),
                fetchJson<CriteriaResponse>(`/api/evaluation?resource=rubricCriteria&templateId=${encodeURIComponent(id)}`),
            ])

            setTemplate(tRes.template ?? null)
            setCriteria(Array.isArray(cRes.criteria) ? cRes.criteria : [])
        } catch (err: any) {
            if (err?.status === 401) {
                toast.error("Session expired", { description: "Please log in again." })
                router.push("/login")
                return
            }
            toast.error("Failed to load rubric", { description: err?.message ?? "Please try again." })
        } finally {
            setLoading(false)
        }
    }, [id, router])

    React.useEffect(() => {
        if (isLoading) return
        if (!canView) return
        load()
    }, [isLoading, canView, load])

    const totals = React.useMemo(() => {
        const totalWeight = criteria.reduce((sum, c) => sum + asNumberWeight(c.weight), 0)
        const totalMax = criteria.reduce((sum, c) => sum + (Number(c.maxScore) || 0), 0)
        const totalMin = criteria.reduce((sum, c) => sum + (Number(c.minScore) || 0), 0)
        return { totalWeight, totalMin, totalMax }
    }, [criteria])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" asChild>
                                <Link href="/dashboard/staff/rubrics">
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Back
                                </Link>
                            </Button>

                            <Button onClick={load} disabled={loading || !canView}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Refresh
                            </Button>
                        </div>

                        <div>
                            <h1 className="text-2xl font-semibold">Rubric Details</h1>
                            <p className="text-sm text-muted-foreground">Template info and scoring criteria.</p>
                        </div>
                    </div>
                </div>

                {!canView ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Forbidden</CardTitle>
                            <CardDescription>This page is for Staff/Admin only.</CardDescription>
                        </CardHeader>
                    </Card>
                ) : loading && !template ? (
                    <div className="space-y-3">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-64 w-full" />
                    </div>
                ) : !template ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Not found</CardTitle>
                            <CardDescription>This rubric template does not exist or you don’t have access.</CardDescription>
                        </CardHeader>
                    </Card>
                ) : (
                    <Tabs defaultValue="criteria" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 sm:max-w-sm">
                            <TabsTrigger value="criteria">Criteria</TabsTrigger>
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                        </TabsList>

                        <TabsContent value="criteria" className="mt-4">
                            <div className="grid grid-cols-12 gap-4">
                                <Card className="col-span-12 lg:col-span-4">
                                    <CardHeader>
                                        <CardTitle className="flex items-center justify-between gap-2">
                                            <span className="truncate">{template.name}</span>
                                            <Badge variant="outline">v{template.version}</Badge>
                                        </CardTitle>
                                        <CardDescription className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <ActiveBadge active={template.active} />
                                                <Badge variant="outline">{criteria.length} criteria</Badge>
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                Updated: {fmtDateTime(template.updatedAt)}
                                            </div>
                                        </CardDescription>
                                    </CardHeader>

                                    <CardContent className="space-y-3">
                                        <Separator />
                                        <div className="space-y-1">
                                            <div className="text-sm font-medium">Description</div>
                                            <div className="text-sm text-muted-foreground">
                                                {template.description ?? "—"}
                                            </div>
                                        </div>

                                        <Separator />

                                        <div className="grid gap-2">
                                            <div className="text-sm font-medium">Totals</div>
                                            <div className="text-sm text-muted-foreground">
                                                Weight: <span className="font-medium text-foreground">{totals.totalWeight}</span>
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                Score range:{" "}
                                                <span className="font-medium text-foreground">
                                                    {totals.totalMin} – {totals.totalMax}
                                                </span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="col-span-12 lg:col-span-8">
                                    <CardHeader>
                                        <CardTitle>Criteria</CardTitle>
                                        <CardDescription>Weights and score ranges used during evaluation.</CardDescription>
                                    </CardHeader>

                                    <CardContent>
                                        {criteria.length === 0 ? (
                                            <div className="text-sm text-muted-foreground">No criteria found for this template.</div>
                                        ) : (
                                            <ScrollArea className="h-96 rounded-md border">
                                                <div className="w-full overflow-auto">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead className="min-w-64">Criterion</TableHead>
                                                                <TableHead className="min-w-72">Description</TableHead>
                                                                <TableHead className="w-24">Weight</TableHead>
                                                                <TableHead className="w-40">Score range</TableHead>
                                                            </TableRow>
                                                        </TableHeader>

                                                        <TableBody>
                                                            {criteria.map((c) => (
                                                                <TableRow key={c.id}>
                                                                    <TableCell className="font-medium">
                                                                        {c.criterion}
                                                                    </TableCell>
                                                                    <TableCell className="text-sm text-muted-foreground">
                                                                        {c.description ?? "—"}
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Badge variant="outline">{c.weight}</Badge>
                                                                    </TableCell>
                                                                    <TableCell className="text-sm text-muted-foreground">
                                                                        {c.minScore} – {c.maxScore}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </ScrollArea>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        <TabsContent value="overview" className="mt-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Rubric overview</CardTitle>
                                    <CardDescription>Quick summary for panelists.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="outline">Template ID: {template.id}</Badge>
                                        <ActiveBadge active={template.active} />
                                        <Badge variant="outline">v{template.version}</Badge>
                                        <Badge variant="outline">{criteria.length} criteria</Badge>
                                    </div>

                                    <Separator />

                                    <div className="grid gap-2">
                                        <div className="text-sm font-medium">What you do as Staff</div>
                                        <div className="text-sm text-muted-foreground">
                                            Use the criteria list while scoring and leaving feedback. Scores are typically saved
                                            per criterion and then finalized/locked during submission.
                                        </div>
                                    </div>

                                    <div className="grid gap-2">
                                        <div className="text-sm font-medium">Tip</div>
                                        <div className="text-sm text-muted-foreground">
                                            If the rubric is inactive, it may be kept for historical evaluations. Active templates
                                            are usually the default for new assignments.
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </DashboardLayout>
    )
}
