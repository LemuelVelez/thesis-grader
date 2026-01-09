/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    ArrowLeft,
    ClipboardCopy,
    FileText,
    Loader2,
    Lock,
    RefreshCw,
    Save,
    Trash2,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

type EvaluationRow = {
    id: string
    schedule_id: string
    evaluator_id: string
    status: string
    submitted_at: string | null
    locked_at: string | null
    created_at: string
}

function safeStr(v: any) {
    return typeof v === "string" ? v : v == null ? "" : String(v)
}

function shortId(id: string) {
    const s = safeStr(id)
    if (s.length <= 12) return s
    return `${s.slice(0, 6)}…${s.slice(-4)}`
}

function formatTs(v: string | null | undefined) {
    if (!v) return "—"
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return v
    return d.toLocaleString()
}

function badgeVariantFromStatus(status: string): "default" | "secondary" | "outline" | "destructive" {
    const s = safeStr(status).toLowerCase()
    if (s === "submitted") return "default"
    if (s === "locked") return "destructive"
    if (s === "pending" || s === "draft") return "secondary"
    return "outline"
}

async function fetchJson(url: string, init?: RequestInit) {
    const res = await fetch(url, init)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
        const msg = data?.error || data?.message || `Request failed (${res.status})`
        throw new Error(msg)
    }
    return data
}

export default function StaffEvaluationDetailsPage() {
    const router = useRouter()
    const params = useParams() as any
    const { me, loading: authLoading } = useAuth() as any

    const id = safeStr(params?.id || "")

    const [row, setRow] = React.useState<EvaluationRow | null>(null)
    const [busy, setBusy] = React.useState(false)

    // status editor
    const [statusOpen, setStatusOpen] = React.useState(false)
    const [statusValue, setStatusValue] = React.useState("pending")

    // notes (local-only UI helper)
    const [notes, setNotes] = React.useState("")

    // delete confirm
    const [deleteOpen, setDeleteOpen] = React.useState(false)

    const canUse = React.useMemo(() => {
        if (!me) return false
        const r = safeStr(me.role).toLowerCase()
        return r === "staff" || r === "admin"
    }, [me])

    async function load() {
        if (!id) return
        setBusy(true)
        const t = toast.loading("Loading evaluation...")
        try {
            const data = await fetchJson(`/api/staff/evaluations/${encodeURIComponent(id)}`)
            setRow(data && typeof data === "object" ? (data as EvaluationRow) : null)
            setStatusValue(safeStr((data as any)?.status || "pending"))
            toast.success("Loaded.", { id: t })
        } catch (e: any) {
            setRow(null)
            toast.error(e?.message || "Failed to load evaluation.", { id: t })
        } finally {
            setBusy(false)
        }
    }

    React.useEffect(() => {
        load()
    }, [id])

    async function copyText(text: string, label = "Copied") {
        try {
            await navigator.clipboard.writeText(text)
            toast.success(label)
        } catch {
            toast.error("Failed to copy.")
        }
    }

    async function updateStatus(nextStatus: string) {
        if (!row) return
        const t = toast.loading("Updating status...")
        try {
            await fetchJson(`/api/staff/evaluations/${encodeURIComponent(row.id)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: nextStatus }),
            })
            toast.success("Status updated.", { id: t })
            setStatusOpen(false)
            await load()
        } catch (e: any) {
            toast.error(e?.message || "Failed to update status.", { id: t })
        }
    }

    async function submitEvaluation() {
        if (!row) return
        const t = toast.loading("Submitting evaluation...")
        try {
            await fetchJson(`/api/staff/evaluations/${encodeURIComponent(row.id)}/submit`, { method: "POST" })
            toast.success("Submitted.", { id: t })
            await load()
        } catch (e: any) {
            toast.error(e?.message || "Failed to submit.", { id: t })
        }
    }

    async function lockEvaluation() {
        if (!row) return
        const t = toast.loading("Locking evaluation...")
        try {
            await fetchJson(`/api/staff/evaluations/${encodeURIComponent(row.id)}/lock`, { method: "POST" })
            toast.success("Locked.", { id: t })
            await load()
        } catch (e: any) {
            toast.error(e?.message || "Failed to lock.", { id: t })
        }
    }

    async function deleteEvaluation() {
        if (!row) return
        const t = toast.loading("Deleting evaluation...")
        try {
            await fetchJson(`/api/staff/evaluations/${encodeURIComponent(row.id)}`, { method: "DELETE" })
            toast.success("Deleted.", { id: t })
            router.push("/dashboard/staff/evaluations")
        } catch (e: any) {
            toast.error(e?.message || "Failed to delete.", { id: t })
        } finally {
            setDeleteOpen(false)
        }
    }

    const isLocked = safeStr(row?.status).toLowerCase() === "locked"
    const isSubmitted = safeStr(row?.status).toLowerCase() === "submitted"

    return (
        <DashboardLayout title="Evaluation" description="Review, submit, lock, or update an evaluation.">
            <div className="space-y-6">
                {authLoading ? (
                    <Card>
                        <CardHeader>
                            <Skeleton className="h-6 w-44" />
                            <Skeleton className="h-4 w-80" />
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-56 w-full" />
                        </CardContent>
                    </Card>
                ) : !me ? (
                    <Alert>
                        <AlertTitle>Not signed in</AlertTitle>
                        <AlertDescription>
                            Please sign in to access staff evaluations.{" "}
                            <Link className="underline" href="/auth/login">
                                Go to login
                            </Link>
                            .
                        </AlertDescription>
                    </Alert>
                ) : !canUse ? (
                    <Alert variant="destructive">
                        <AlertTitle>Access denied</AlertTitle>
                        <AlertDescription>Your account does not have permission to view this page.</AlertDescription>
                    </Alert>
                ) : !id ? (
                    <Alert variant="destructive">
                        <AlertTitle>Missing ID</AlertTitle>
                        <AlertDescription>The evaluation id is missing from the route.</AlertDescription>
                    </Alert>
                ) : (
                    <>
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={() => router.back()}>
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Back
                                </Button>

                                <Button variant="secondary" onClick={load} disabled={busy}>
                                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                    Refresh
                                </Button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => copyText(id, "Evaluation ID copied")}
                                >
                                    <ClipboardCopy className="mr-2 h-4 w-4" />
                                    Copy ID
                                </Button>

                                <Button
                                    onClick={() => setStatusOpen(true)}
                                    disabled={!row}
                                >
                                    <Save className="mr-2 h-4 w-4" />
                                    Update Status
                                </Button>

                                <Button
                                    variant="secondary"
                                    onClick={submitEvaluation}
                                    disabled={!row || isSubmitted || isLocked}
                                >
                                    <FileText className="mr-2 h-4 w-4" />
                                    Submit
                                </Button>

                                <Button
                                    variant="destructive"
                                    onClick={lockEvaluation}
                                    disabled={!row || isLocked}
                                >
                                    <Lock className="mr-2 h-4 w-4" />
                                    Lock
                                </Button>

                                <Button
                                    variant="outline"
                                    className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => setDeleteOpen(true)}
                                    disabled={!row}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                </Button>
                            </div>
                        </div>

                        {!row ? (
                            <Alert>
                                <AlertTitle>Not found</AlertTitle>
                                <AlertDescription>
                                    No evaluation was returned by the API for this ID.
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <>
                                <div className="grid gap-4 md:grid-cols-3">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Evaluation</CardTitle>
                                            <CardDescription>ID & status</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-2 text-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-muted-foreground">ID</span>
                                                <span className="font-mono">{shortId(row.id)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-muted-foreground">Status</span>
                                                <Badge variant={badgeVariantFromStatus(row.status)} className="capitalize">
                                                    {safeStr(row.status || "unknown")}
                                                </Badge>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Assignment</CardTitle>
                                            <CardDescription>Schedule & evaluator</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-2 text-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-muted-foreground">Schedule</span>
                                                <span className="font-mono">{shortId(row.schedule_id)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-muted-foreground">Evaluator</span>
                                                <span className="font-mono">{shortId(row.evaluator_id)}</span>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Timestamps</CardTitle>
                                            <CardDescription>Submission/lock tracking</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-2 text-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-muted-foreground">Created</span>
                                                <span>{formatTs(row.created_at)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-muted-foreground">Submitted</span>
                                                <span>{formatTs(row.submitted_at)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-muted-foreground">Locked</span>
                                                <span>{formatTs(row.locked_at)}</span>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                <Tabs defaultValue="overview">
                                    <TabsList className="grid w-full grid-cols-3">
                                        <TabsTrigger value="overview">Overview</TabsTrigger>
                                        <TabsTrigger value="notes">Notes</TabsTrigger>
                                        <TabsTrigger value="raw">Raw</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="overview" className="mt-4 space-y-4">
                                        <Card>
                                            <CardHeader>
                                                <CardTitle>Quick actions</CardTitle>
                                                <CardDescription>Common workflow: update status → submit → lock</CardDescription>
                                            </CardHeader>
                                            <CardContent className="grid gap-3 md:grid-cols-3">
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setStatusOpen(true)}
                                                    disabled={isLocked}
                                                >
                                                    <Save className="mr-2 h-4 w-4" />
                                                    Change status
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    onClick={submitEvaluation}
                                                    disabled={isSubmitted || isLocked}
                                                >
                                                    <FileText className="mr-2 h-4 w-4" />
                                                    Submit
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    onClick={lockEvaluation}
                                                    disabled={isLocked}
                                                >
                                                    <Lock className="mr-2 h-4 w-4" />
                                                    Lock
                                                </Button>
                                            </CardContent>
                                        </Card>

                                        <Card>
                                            <CardHeader>
                                                <CardTitle>At-a-glance</CardTitle>
                                                <CardDescription>What this evaluation currently looks like</CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="overflow-auto rounded-md border">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead className="w-45">Field</TableHead>
                                                                <TableHead>Value</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            <TableRow>
                                                                <TableCell className="text-muted-foreground">Evaluation ID</TableCell>
                                                                <TableCell className="font-mono">{row.id}</TableCell>
                                                            </TableRow>
                                                            <TableRow>
                                                                <TableCell className="text-muted-foreground">Schedule ID</TableCell>
                                                                <TableCell className="font-mono">{row.schedule_id}</TableCell>
                                                            </TableRow>
                                                            <TableRow>
                                                                <TableCell className="text-muted-foreground">Evaluator ID</TableCell>
                                                                <TableCell className="font-mono">{row.evaluator_id}</TableCell>
                                                            </TableRow>
                                                            <TableRow>
                                                                <TableCell className="text-muted-foreground">Status</TableCell>
                                                                <TableCell>
                                                                    <Badge variant={badgeVariantFromStatus(row.status)} className="capitalize">
                                                                        {safeStr(row.status)}
                                                                    </Badge>
                                                                </TableCell>
                                                            </TableRow>
                                                            <TableRow>
                                                                <TableCell className="text-muted-foreground">Created</TableCell>
                                                                <TableCell>{formatTs(row.created_at)}</TableCell>
                                                            </TableRow>
                                                            <TableRow>
                                                                <TableCell className="text-muted-foreground">Submitted</TableCell>
                                                                <TableCell>{formatTs(row.submitted_at)}</TableCell>
                                                            </TableRow>
                                                            <TableRow>
                                                                <TableCell className="text-muted-foreground">Locked</TableCell>
                                                                <TableCell>{formatTs(row.locked_at)}</TableCell>
                                                            </TableRow>
                                                        </TableBody>
                                                    </Table>
                                                </div>

                                                <Separator className="my-4" />

                                                <Alert>
                                                    <AlertTitle>Scores UI</AlertTitle>
                                                    <AlertDescription>
                                                        This page focuses on evaluation lifecycle (status/submit/lock). If you want scoring here too,
                                                        tell me your scores API route (e.g. <span className="font-mono">/api/staff/evaluation-scores?evaluation_id=...</span>)
                                                        and your rubric/criteria shape, and I’ll wire the editable scoring table.
                                                    </AlertDescription>
                                                </Alert>
                                            </CardContent>
                                        </Card>
                                    </TabsContent>

                                    <TabsContent value="notes" className="mt-4 space-y-4">
                                        <Card>
                                            <CardHeader>
                                                <CardTitle>Staff notes (local)</CardTitle>
                                                <CardDescription>
                                                    Optional notes for you while reviewing. (Not saved to DB unless you connect an API endpoint.)
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                <div className="space-y-2">
                                                    <Label htmlFor="notes">Notes</Label>
                                                    <Textarea
                                                        id="notes"
                                                        value={notes}
                                                        onChange={(e) => setNotes(e.target.value)}
                                                        placeholder="Write notes about this evaluation..."
                                                        className="min-h-40"
                                                    />
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Button variant="secondary" onClick={() => setNotes("")}>
                                                        Clear
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => copyText(notes || "", "Notes copied")}
                                                        disabled={!notes.trim()}
                                                    >
                                                        <ClipboardCopy className="mr-2 h-4 w-4" />
                                                        Copy notes
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </TabsContent>

                                    <TabsContent value="raw" className="mt-4 space-y-4">
                                        <Card>
                                            <CardHeader>
                                                <CardTitle>Raw JSON</CardTitle>
                                                <CardDescription>Helpful for debugging.</CardDescription>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Button variant="outline" onClick={() => copyText(JSON.stringify(row, null, 2), "JSON copied")}>
                                                        <ClipboardCopy className="mr-2 h-4 w-4" />
                                                        Copy JSON
                                                    </Button>
                                                </div>
                                                <pre className="max-h-105 overflow-auto rounded-md border bg-muted p-3 text-xs">
                                                    {JSON.stringify(row, null, 2)}
                                                </pre>
                                            </CardContent>
                                        </Card>
                                    </TabsContent>
                                </Tabs>
                            </>
                        )}

                        <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
                            <DialogContent className="sm:max-w-lg">
                                <DialogHeader>
                                    <DialogTitle>Update status</DialogTitle>
                                    <DialogDescription>
                                        Set a new status string (e.g. pending, submitted, locked).
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="space-y-2">
                                    <Label htmlFor="status">Status</Label>
                                    <Input
                                        id="status"
                                        value={statusValue}
                                        onChange={(e) => setStatusValue(e.target.value)}
                                        placeholder="pending"
                                        disabled={isLocked}
                                    />
                                    {isLocked ? (
                                        <Alert variant="destructive">
                                            <AlertTitle>Locked</AlertTitle>
                                            <AlertDescription>This evaluation is locked. Status updates are disabled.</AlertDescription>
                                        </Alert>
                                    ) : null}
                                </div>

                                <DialogFooter className="gap-2 sm:gap-0">
                                    <Button variant="outline" onClick={() => setStatusOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button onClick={() => updateStatus(statusValue)} disabled={!row || !statusValue.trim() || isLocked}>
                                        <Save className="mr-2 h-4 w-4" />
                                        Save
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete evaluation?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will permanently delete the evaluation record. This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                                        onClick={deleteEvaluation}
                                    >
                                        Delete
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </>
                )}
            </div>
        </DashboardLayout>
    )
}
