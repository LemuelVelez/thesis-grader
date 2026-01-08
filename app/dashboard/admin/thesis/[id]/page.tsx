/* eslint-disable @typescript-eslint/no-explicit-any */
// app/dashboard/admin/thesis/[id]/page.tsx

import { notFound } from "next/navigation"
import Link from "next/link"

import DashboardLayout from "@/components/dashboard-layout"
import { requireAdminActor } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { env } from "@/lib/env"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function formatDateTime(iso: string | null | undefined) {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d)
}

function formatDate(iso: string | null | undefined) {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(d)
}

function isUuid(v: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

type GroupDetailsRow = {
    id: string
    title: string
    program: string | null
    term: string | null
    created_at: string
    updated_at: string
    adviser_id: string | null
    adviser_name: string | null
    adviser_email: string | null
}

type MemberRow = {
    id: string
    name: string
    email: string
    program: string | null
    section: string | null
    status: "active" | "disabled"
}

type ScheduleRow = {
    id: string
    scheduled_at: string
    room: string | null
    status: string
    panelists_count: number
}

async function readParams(params: { id: string } | Promise<{ id: string }>) {
    return await Promise.resolve(params as any)
}

export default async function Page({ params }: { params: { id: string } | Promise<{ id: string }> }) {
    const actor = await requireAdminActor()

    if (!env.DATABASE_URL) {
        return (
            <DashboardLayout title="Thesis Group">
                <div className="mx-auto w-full max-w-6xl space-y-4">
                    <Alert variant="destructive">
                        <AlertTitle>Database not configured</AlertTitle>
                        <AlertDescription>DATABASE_URL is missing.</AlertDescription>
                    </Alert>
                    <Button asChild variant="secondary">
                        <Link href="/dashboard/admin/thesis">Back</Link>
                    </Button>
                </div>
            </DashboardLayout>
        )
    }

    const p = await readParams(params)
    const groupId = String(p?.id ?? "").trim()

    if (!groupId || !isUuid(groupId)) {
        notFound()
    }

    // 1) Group core details + adviser info
    const groupQ = `
    select
      g.id,
      g.title,
      g.program,
      g.term,
      g.created_at,
      g.updated_at,
      g.adviser_id,
      a.name as adviser_name,
      a.email as adviser_email
    from thesis_groups g
    left join users a on a.id = g.adviser_id
    where g.id = $1
    limit 1
  `
    const groupRes = await db.query(groupQ, [groupId])
    const group = groupRes.rows[0] as GroupDetailsRow | undefined
    if (!group) notFound()

    // 2) Members (students) + student profile (program/section)
    const membersQ = `
    select
      u.id,
      u.name,
      u.email,
      u.status,
      s.program,
      s.section
    from group_members gm
    join users u on u.id = gm.student_id
    left join students s on s.user_id = u.id
    where gm.group_id = $1
    order by u.name asc
  `
    const membersRes = await db.query(membersQ, [groupId])
    const members = (membersRes.rows as MemberRow[]) ?? []

    // 3) Defense schedules for this group (latest first) + panelists count
    const schedulesQ = `
    select
      ds.id,
      ds.scheduled_at,
      ds.room,
      ds.status,
      coalesce(p.panelists_count, 0)::int as panelists_count
    from defense_schedules ds
    left join (
      select schedule_id, count(*)::int as panelists_count
      from schedule_panelists
      group by schedule_id
    ) p on p.schedule_id = ds.id
    where ds.group_id = $1
    order by ds.scheduled_at desc
    limit 50
  `
    const schedulesRes = await db.query(schedulesQ, [groupId])
    const schedules = (schedulesRes.rows as ScheduleRow[]) ?? []

    return (
        <DashboardLayout title="Thesis Group">
            <div className="mx-auto w-full max-w-6xl space-y-6">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <Button asChild variant="outline" size="sm">
                                <Link href="/dashboard/admin/thesis">← Back to Thesis Records</Link>
                            </Button>
                            <Badge variant="secondary">Group</Badge>
                            {group.program ? <Badge variant="outline">{group.program}</Badge> : null}
                            {group.term ? <Badge variant="outline">{group.term}</Badge> : null}
                        </div>

                        <h1 className="text-xl font-semibold leading-tight">{group.title}</h1>

                        <p className="text-xs text-muted-foreground">
                            Signed in as: <span className="font-medium">{actor.name}</span> ({actor.email})
                        </p>
                    </div>

                    <div className="text-xs text-muted-foreground">
                        Created: <span className="font-medium text-foreground">{formatDateTime(group.created_at)}</span>
                        <span className="mx-2">•</span>
                        Updated: <span className="font-medium text-foreground">{formatDateTime(group.updated_at)}</span>
                    </div>
                </div>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle>Overview</CardTitle>
                        <CardDescription>Basic information for this thesis group.</CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-3">
                            <div>
                                <div className="text-xs text-muted-foreground">Program</div>
                                <div className="mt-1">{group.program ? <Badge variant="secondary">{group.program}</Badge> : "—"}</div>
                            </div>

                            <div>
                                <div className="text-xs text-muted-foreground">Term</div>
                                <div className="mt-1">{group.term ?? "—"}</div>
                            </div>

                            <div>
                                <div className="text-xs text-muted-foreground">Adviser</div>
                                <div className="mt-1">
                                    {group.adviser_name ? (
                                        <div className="space-y-0.5">
                                            <div className="text-sm font-medium">{group.adviser_name}</div>
                                            <div className="text-xs text-muted-foreground">{group.adviser_email ?? ""}</div>
                                        </div>
                                    ) : (
                                        <span className="text-muted-foreground">Unassigned</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <Separator />
                        <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">members: {members.length}</Badge>
                            <Badge variant="outline">schedules: {schedules.length}</Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle>Members</CardTitle>
                        <CardDescription>Students currently assigned to this thesis group.</CardDescription>
                    </CardHeader>

                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead className="hidden md:table-cell">Program</TableHead>
                                    <TableHead className="hidden md:table-cell">Section</TableHead>
                                    <TableHead className="text-right">Status</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {members.length ? (
                                    members.map((m) => (
                                        <TableRow key={m.id}>
                                            <TableCell>
                                                <div className="space-y-0.5">
                                                    <div className="text-sm font-medium">{m.name}</div>
                                                    <div className="text-xs text-muted-foreground">{m.email}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell">{m.program ?? "—"}</TableCell>
                                            <TableCell className="hidden md:table-cell">{m.section ?? "—"}</TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant={m.status === "active" ? "secondary" : "outline"}>{m.status}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                                            No members assigned to this group.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle>Defense schedules</CardTitle>
                        <CardDescription>Latest 50 schedules for this group (most recent first).</CardDescription>
                    </CardHeader>

                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Room</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Panelists</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {schedules.length ? (
                                    schedules.map((s) => (
                                        <TableRow key={s.id}>
                                            <TableCell>
                                                <div className="space-y-0.5">
                                                    <div className="text-sm font-medium">{formatDateTime(s.scheduled_at)}</div>
                                                    <div className="text-xs text-muted-foreground">{formatDate(s.scheduled_at)}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{s.room ?? "—"}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{s.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant="secondary">{s.panelists_count}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                                            No defense schedules for this group yet.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <div className="flex items-center justify-between">
                    <Button asChild variant="outline">
                        <Link href="/dashboard/admin/thesis">← Back</Link>
                    </Button>

                    <div className="text-xs text-muted-foreground">
                        Group ID: <span className="font-mono">{group.id}</span>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
