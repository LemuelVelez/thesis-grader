/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Download, RefreshCw, Printer } from "lucide-react"

import type { ReportsSummary } from "@/lib/reports-admin"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function setUrlQuery(from: string, to: string, days: number, program: string, term: string) {
    try {
        const url = new URL(window.location.href)
        url.searchParams.set("from", from)
        url.searchParams.set("to", to)
        url.searchParams.set("days", String(days))
        if (program.trim()) url.searchParams.set("program", program.trim())
        else url.searchParams.delete("program")
        if (term.trim()) url.searchParams.set("term", term.trim())
        else url.searchParams.delete("term")
        window.history.replaceState({}, "", url.toString())
    } catch {
        // ignore
    }
}

async function fetchSummary(params: { from: string; to: string; days: number; program?: string; term?: string }) {
    const sp = new URLSearchParams()
    sp.set("from", params.from)
    sp.set("to", params.to)
    sp.set("days", String(params.days))
    if (params.program?.trim()) sp.set("program", params.program.trim())
    if (params.term?.trim()) sp.set("term", params.term.trim())

    const res = await fetch(`/api/admin/reports/summary?${sp.toString()}`, { cache: "no-store" })
    const data = await res.json().catch(() => ({} as any))
    if (!res.ok || !data?.ok) {
        throw new Error(data?.message || "Failed to load report summary.")
    }
    return data.summary as ReportsSummary
}

export default function ReportsClient({ initialSummary }: { initialSummary: ReportsSummary }) {
    const [summary, setSummary] = React.useState<ReportsSummary>(initialSummary)
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState<string>("")

    const [preset, setPreset] = React.useState<string>("30")
    const [from, setFrom] = React.useState(summary.range.from)
    const [to, setTo] = React.useState(summary.range.to)

    const [program, setProgram] = React.useState(summary.filters.program ?? "")
    const [term, setTerm] = React.useState(summary.filters.term ?? "")

    React.useEffect(() => {
        setPreset("custom")
    }, [])

    async function apply() {
        setError("")
        const days = preset === "custom" ? 30 : Number(preset)

        if (!from || !to) {
            setError("Please select both From and To dates.")
            return
        }

        setBusy(true)
        const tId = toast.loading("Loading report...")
        try {
            const next = await fetchSummary({ from, to, days, program, term })
            setSummary(next)
            setUrlQuery(from, to, days, program, term)
            toast.success("Report updated.", { id: tId })
        } catch (e: any) {
            const msg = String(e?.message ?? "Failed to load report.")
            setError(msg)
            toast.error(msg, { id: tId })
        } finally {
            setBusy(false)
        }
    }

    async function refresh() {
        setError("")
        setBusy(true)
        const tId = toast.loading("Refreshing...")
        try {
            const next = await fetchSummary({ from, to, days: 30, program, term })
            setSummary(next)
            toast.success("Refreshed.", { id: tId })
        } catch (e: any) {
            const msg = String(e?.message ?? "Refresh failed.")
            setError(msg)
            toast.error(msg, { id: tId })
        } finally {
            setBusy(false)
        }
    }

    function exportAuditCsv() {
        const sp = new URLSearchParams()
        sp.set("from", from)
        sp.set("to", to)
        sp.set("days", preset === "custom" ? "30" : String(preset))
        // audit export is global (not program/term filtered)
        window.location.href = `/api/admin/reports/audit-export?${sp.toString()}`
    }

    function openPrintPdf() {
        const sp = new URLSearchParams()
        sp.set("from", from)
        sp.set("to", to)
        sp.set("days", preset === "custom" ? "30" : String(preset))
        if (program.trim()) sp.set("program", program.trim())
        if (term.trim()) sp.set("term", term.trim())
        window.open(`/api/admin/reports/print?${sp.toString()}`, "_blank", "noopener,noreferrer")
    }

    const s = summary

    return (
        <div className="mx-auto w-full max-w-6xl space-y-4">
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle>Reports</CardTitle>
                    <CardDescription>Admin analytics across users, thesis, schedules, evaluations, and audit logs.</CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    {error ? (
                        <Alert variant="destructive">
                            <AlertTitle>Unable to load report</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-12">
                        <div className="md:col-span-3">
                            <Label>Date range preset</Label>
                            <Select value={preset} onValueChange={(v) => setPreset(v)} disabled={busy}>
                                <SelectTrigger className="mt-2">
                                    <SelectValue placeholder="Choose preset" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="7">Last 7 days</SelectItem>
                                    <SelectItem value="30">Last 30 days</SelectItem>
                                    <SelectItem value="90">Last 90 days</SelectItem>
                                    <SelectItem value="custom">Custom</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="md:col-span-3">
                            <Label>From</Label>
                            <Input className="mt-2" type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} />
                        </div>

                        <div className="md:col-span-3">
                            <Label>To</Label>
                            <Input className="mt-2" type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} />
                        </div>

                        <div className="md:col-span-3 flex items-end gap-2">
                            <Button onClick={apply} disabled={busy}>
                                Apply
                            </Button>
                            <Button variant="outline" onClick={refresh} disabled={busy}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Refresh
                            </Button>
                        </div>

                        <div className="md:col-span-3">
                            <Label>Program (optional)</Label>
                            <Input className="mt-2" value={program} onChange={(e) => setProgram(e.target.value)} placeholder="e.g., BSCS" disabled={busy} />
                        </div>

                        <div className="md:col-span-3">
                            <Label>Term (optional)</Label>
                            <Input className="mt-2" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g., AY 2025–2026" disabled={busy} />
                        </div>

                        <div className="md:col-span-6 flex items-end gap-2">
                            <Button variant="secondary" asChild disabled={busy}>
                                <Link href="/dashboard/admin/audit">Open Audit</Link>
                            </Button>

                            <Button variant="outline" onClick={openPrintPdf} disabled={busy}>
                                <Printer className="mr-2 h-4 w-4" />
                                Print / Save as PDF
                            </Button>

                            <Button variant="outline" onClick={exportAuditCsv} disabled={busy}>
                                <Download className="mr-2 h-4 w-4" />
                                Export Audit CSV
                            </Button>
                        </div>
                    </div>

                    <Separator />

                    {busy ? (
                        <div className="grid gap-4 md:grid-cols-4">
                            <Skeleton className="h-26 w-full" />
                            <Skeleton className="h-26 w-full" />
                            <Skeleton className="h-26 w-full" />
                            <Skeleton className="h-26 w-full" />
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-4">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription>Users</CardDescription>
                                    <CardTitle className="text-2xl">{s.users.total}</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <div className="flex gap-2">
                                        <Badge variant="secondary">active: {s.users.byStatus.active}</Badge>
                                        <Badge variant="outline">disabled: {s.users.byStatus.disabled}</Badge>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription>Thesis groups (filtered)</CardDescription>
                                    <CardTitle className="text-2xl">{s.thesis.groups_total}</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <Badge variant="secondary">unassigned: {s.thesis.unassigned_adviser}</Badge>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription>Defenses (range, filtered)</CardDescription>
                                    <CardTitle className="text-2xl">{s.defenses.total_in_range}</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <Badge variant="secondary">{s.range.from} → {s.range.to}</Badge>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription>Audit logs (range)</CardDescription>
                                    <CardTitle className="text-2xl">{s.audit.total_in_range}</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <Badge variant="secondary">global (not program/term filtered)</Badge>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="w-full justify-start">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="users">Users</TabsTrigger>
                    <TabsTrigger value="thesis">Thesis</TabsTrigger>
                    <TabsTrigger value="defenses">Defenses</TabsTrigger>
                    <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
                    <TabsTrigger value="audit">Audit</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle>Top actions (audit)</CardTitle>
                            <CardDescription>Most common actions within the selected range.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Action</TableHead>
                                        <TableHead className="text-right">Count</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {s.audit.topActions.length ? (
                                        s.audit.topActions.map((r) => (
                                            <TableRow key={r.action}>
                                                <TableCell>
                                                    <Badge>{r.action}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right">{r.count}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-sm text-muted-foreground py-6 text-center">
                                                No audit activity in this range.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle>Top active staff/admin</CardTitle>
                            <CardDescription>Based on audit log volume within the selected range.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Actor</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead className="text-right">Count</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {s.audit.topActors.length ? (
                                        s.audit.topActors.map((r) => (
                                            <TableRow key={r.actor_id}>
                                                <TableCell>
                                                    <div className="text-sm">{r.actor_name ?? "Unknown"}</div>
                                                    <div className="text-xs text-muted-foreground">{r.actor_email ?? ""}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{r.role}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right">{r.count}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-sm text-muted-foreground py-6 text-center">
                                                No staff/admin activity in this range.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="users" className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle>User breakdown</CardTitle>
                            <CardDescription>Counts by role and status.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="secondary">student: {s.users.byRole.student}</Badge>
                                <Badge variant="secondary">staff: {s.users.byRole.staff}</Badge>
                                <Badge variant="secondary">admin: {s.users.byRole.admin}</Badge>
                                <Badge variant="outline">active: {s.users.byStatus.active}</Badge>
                                <Badge variant="outline">disabled: {s.users.byStatus.disabled}</Badge>
                            </div>

                            <Button asChild variant="secondary">
                                <Link href="/dashboard/admin/users">Manage Users</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="thesis" className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle>Thesis programs</CardTitle>
                            <CardDescription>Top programs by number of groups (max 20). Respects Program/Term filters.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Program</TableHead>
                                        <TableHead className="text-right">Groups</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {s.thesis.byProgram.length ? (
                                        s.thesis.byProgram.map((r) => (
                                            <TableRow key={r.program}>
                                                <TableCell>{r.program}</TableCell>
                                                <TableCell className="text-right">{r.count}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-sm text-muted-foreground py-6 text-center">
                                                No thesis groups found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>

                            <Separator className="my-4" />

                            <div className="flex flex-wrap gap-2">
                                <Badge variant="secondary">groups: {s.thesis.groups_total}</Badge>
                                <Badge variant="secondary">memberships: {s.thesis.memberships_total}</Badge>
                                <Badge variant="outline">unassigned adviser: {s.thesis.unassigned_adviser}</Badge>
                            </div>

                            <div className="mt-3">
                                <Button asChild variant="secondary">
                                    <Link href="/dashboard/admin/thesis">Open Thesis</Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="defenses" className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle>Defense schedules (filtered)</CardTitle>
                            <CardDescription>Grouped by status, room, and month within the selected range.</CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-6">
                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <div className="font-medium">By status</div>
                                    <Badge variant="secondary">total: {s.defenses.total_in_range}</Badge>
                                </div>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Count</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {s.defenses.byStatus.length ? (
                                            s.defenses.byStatus.map((r) => (
                                                <TableRow key={r.status}>
                                                    <TableCell>
                                                        <Badge variant="outline">{r.status}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">{r.count}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={2} className="text-sm text-muted-foreground py-6 text-center">
                                                    No defense schedules in this range.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            <Separator />

                            <div>
                                <div className="mb-2 font-medium">By room (top 20)</div>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Room</TableHead>
                                            <TableHead className="text-right">Count</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {s.defenses.byRoom.length ? (
                                            s.defenses.byRoom.map((r) => (
                                                <TableRow key={r.room}>
                                                    <TableCell>{r.room}</TableCell>
                                                    <TableCell className="text-right">{r.count}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={2} className="text-sm text-muted-foreground py-6 text-center">
                                                    No room data.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            <Separator />

                            <div>
                                <div className="mb-2 font-medium">By month</div>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Month</TableHead>
                                            <TableHead className="text-right">Count</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {s.defenses.byMonth.length ? (
                                            s.defenses.byMonth.map((r) => (
                                                <TableRow key={r.month}>
                                                    <TableCell>{r.month}</TableCell>
                                                    <TableCell className="text-right">{r.count}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={2} className="text-sm text-muted-foreground py-6 text-center">
                                                    No monthly data.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="evaluations" className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle>Evaluations (filtered)</CardTitle>
                            <CardDescription>Panel and student evaluations created within the selected range.</CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="font-medium">Panel evaluations</div>
                                    <Badge variant="secondary">total: {s.evaluations.panel.total_in_range}</Badge>
                                </div>

                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Count</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {s.evaluations.panel.byStatus.length ? (
                                            s.evaluations.panel.byStatus.map((r) => (
                                                <TableRow key={`panel-${r.status}`}>
                                                    <TableCell>{r.status}</TableCell>
                                                    <TableCell className="text-right">{r.count}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={2} className="text-sm text-muted-foreground py-6 text-center">
                                                    No panel evaluations in this range.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            <Separator />

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="font-medium">Student evaluations</div>
                                    <Badge variant="secondary">total: {s.evaluations.student.total_in_range}</Badge>
                                </div>

                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Count</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {s.evaluations.student.byStatus.length ? (
                                            s.evaluations.student.byStatus.map((r) => (
                                                <TableRow key={`student-${r.status}`}>
                                                    <TableCell>{r.status}</TableCell>
                                                    <TableCell className="text-right">{r.count}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={2} className="text-sm text-muted-foreground py-6 text-center">
                                                    No student evaluations in this range.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="audit" className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <CardTitle>Audit activity</CardTitle>
                                    <CardDescription>Daily counts across the selected range.</CardDescription>
                                </div>
                                <Button variant="outline" onClick={exportAuditCsv} disabled={busy}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Export CSV
                                </Button>
                            </div>
                        </CardHeader>

                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Day</TableHead>
                                        <TableHead className="text-right">Count</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {s.audit.daily.length ? (
                                        s.audit.daily.map((r) => (
                                            <TableRow key={r.day}>
                                                <TableCell>{r.day}</TableCell>
                                                <TableCell className="text-right">{r.count}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-sm text-muted-foreground py-6 text-center">
                                                No audit entries in this range.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
