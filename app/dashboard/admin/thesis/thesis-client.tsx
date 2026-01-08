/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Plus, Search, Trash2 } from "lucide-react"

import type { ThesisGroupRow } from "@/lib/thesis-admin"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function formatDate(iso: string | null | undefined) {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d)
}

function buildHref(base: string, params: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
        if (v != null && String(v).length > 0) sp.set(k, String(v))
    })
    const qs = sp.toString()
    return qs ? `${base}?${qs}` : base
}

export default function ThesisAdminClient(props: {
    actor: { name: string; email: string }
    q: string
    page: number
    limit: number
    total: number
    totalPages: number
    groups: ThesisGroupRow[]
    stats: { groups_total: number; memberships_total: number; upcoming_30d: number }
    notice: string
    err: string
}) {
    const router = useRouter()
    const baseHref = "/dashboard/admin/thesis"

    const [busy, setBusy] = React.useState(false)

    // Controlled create form (prevents weird reload/glitch)
    const [title, setTitle] = React.useState("")
    const [program, setProgram] = React.useState("")
    const [term, setTerm] = React.useState("")
    const [adviserEmail, setAdviserEmail] = React.useState("")

    async function onCreate(e: React.FormEvent) {
        e.preventDefault()
        if (busy) return

        const payload = {
            title: title.trim(),
            program: program.trim() || null,
            term: term.trim() || null,
            adviserEmail: adviserEmail.trim() || null,
        }

        if (!payload.title) {
            toast.error("Title is required.")
            return
        }

        setBusy(true)
        const tId = toast.loading("Creating thesis group...")
        try {
            const res = await fetch("/api/admin/thesis-groups", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const data = (await res.json().catch(() => ({}))) as any

            if (!res.ok || !data?.ok) {
                toast.error(data?.message || "Failed to create thesis group.", { id: tId })
                return
            }

            toast.success("Thesis group created.", { id: tId })

            // reset inputs
            setTitle("")
            setProgram("")
            setTerm("")
            setAdviserEmail("")

            // refresh server data without breaking sidebar state
            router.refresh()
        } catch {
            toast.error("Network error while creating thesis group.", { id: tId })
        } finally {
            setBusy(false)
        }
    }

    async function onDelete(groupId: string) {
        if (busy) return
        const ok = window.confirm("Delete this thesis group? This cannot be undone.")
        if (!ok) return

        setBusy(true)
        const tId = toast.loading("Deleting thesis group...")
        try {
            const res = await fetch(`/api/admin/thesis-groups/${encodeURIComponent(groupId)}`, {
                method: "DELETE",
            })
            const data = (await res.json().catch(() => ({}))) as any

            if (!res.ok || !data?.ok) {
                toast.error(data?.message || "Failed to delete thesis group.", { id: tId })
                return
            }

            toast.success("Thesis group deleted.", { id: tId })
            router.refresh()
        } catch {
            toast.error("Network error while deleting thesis group.", { id: tId })
        } finally {
            setBusy(false)
        }
    }

    const prevHref =
        props.page > 1
            ? buildHref(baseHref, { q: props.q || undefined, page: String(props.page - 1), limit: String(props.limit) })
            : null

    const nextHref =
        props.page < props.totalPages
            ? buildHref(baseHref, { q: props.q || undefined, page: String(props.page + 1), limit: String(props.limit) })
            : null

    return (
        <div className="mx-auto w-full max-w-6xl space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                        Manage thesis groups, advisers, and view quick status at a glance.
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Signed in as: <span className="font-medium">{props.actor.name}</span> ({props.actor.email})
                    </p>
                </div>

                <form method="get" className="flex w-full gap-2 md:w-105">
                    <div className="relative w-full">
                        <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            name="q"
                            defaultValue={props.q}
                            placeholder="Search by title, program, term, adviser…"
                            className="pl-8"
                        />
                    </div>
                    <input type="hidden" name="limit" value={String(props.limit)} />
                    <Button type="submit" variant="secondary" disabled={busy}>
                        Search
                    </Button>
                </form>
            </div>

            {(props.notice || props.err) && (
                <Alert variant={props.err ? "destructive" : "default"}>
                    <AlertTitle>{props.err ? "Something went wrong" : "Success"}</AlertTitle>
                    <AlertDescription>{props.err || props.notice}</AlertDescription>
                </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total thesis groups</CardDescription>
                        <CardTitle className="text-2xl">{props.stats.groups_total}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <Badge variant="secondary">All terms</Badge>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total memberships</CardDescription>
                        <CardTitle className="text-2xl">{props.stats.memberships_total}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <Badge variant="secondary">Students assigned</Badge>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Upcoming defenses (30 days)</CardDescription>
                        <CardTitle className="text-2xl">{props.stats.upcoming_30d}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <Badge variant="secondary">Next 30 days</Badge>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Create thesis group
                    </CardTitle>
                    <CardDescription>Create a new thesis group record. Adviser is optional (must be staff/admin).</CardDescription>
                </CardHeader>

                <CardContent>
                    <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-12">
                        <div className="space-y-2 md:col-span-4">
                            <Label htmlFor="title">Title</Label>
                            <Input
                                id="title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g., Smart Campus Attendance System"
                                required
                                disabled={busy}
                            />
                        </div>

                        <div className="space-y-2 md:col-span-3">
                            <Label htmlFor="program">Program</Label>
                            <Input
                                id="program"
                                value={program}
                                onChange={(e) => setProgram(e.target.value)}
                                placeholder="e.g., BSCS"
                                disabled={busy}
                            />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="term">Term</Label>
                            <Input
                                id="term"
                                value={term}
                                onChange={(e) => setTerm(e.target.value)}
                                placeholder="e.g., AY 2025–2026"
                                disabled={busy}
                            />
                        </div>

                        <div className="space-y-2 md:col-span-3">
                            <Label htmlFor="adviser_email">Adviser email (optional)</Label>
                            <Input
                                id="adviser_email"
                                value={adviserEmail}
                                onChange={(e) => setAdviserEmail(e.target.value)}
                                placeholder="staff@school.edu"
                                disabled={busy}
                            />
                        </div>

                        <div className="md:col-span-12">
                            <Separator className="my-1" />
                            <div className="flex items-center justify-end">
                                <Button type="submit" disabled={busy}>
                                    {busy ? "Working..." : "Create group"}
                                </Button>
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Thesis groups</CardTitle>
                    <CardDescription>
                        Showing <span className="font-medium">{props.groups.length}</span> of{" "}
                        <span className="font-medium">{props.total}</span> result(s).
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <Table>
                        <TableCaption>Use search to filter. Pagination is available below.</TableCaption>

                        <TableHeader>
                            <TableRow>
                                <TableHead>Title</TableHead>
                                <TableHead className="hidden md:table-cell">Program</TableHead>
                                <TableHead className="hidden md:table-cell">Term</TableHead>
                                <TableHead>Adviser</TableHead>
                                <TableHead className="hidden lg:table-cell">Members</TableHead>
                                <TableHead className="hidden lg:table-cell">Next defense</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {props.groups.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                                        No thesis groups found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                props.groups.map((g) => (
                                    <TableRow key={g.id}>
                                        <TableCell className="font-medium">
                                            <div className="space-y-1">
                                                <div className="line-clamp-1">{g.title}</div>
                                                <div className="text-xs text-muted-foreground">Created {formatDate(g.created_at)}</div>
                                            </div>
                                        </TableCell>

                                        <TableCell className="hidden md:table-cell">
                                            {g.program ? <Badge variant="secondary">{g.program}</Badge> : "—"}
                                        </TableCell>

                                        <TableCell className="hidden md:table-cell">{g.term ?? "—"}</TableCell>

                                        <TableCell>
                                            {g.adviser_name ? (
                                                <div className="space-y-0.5">
                                                    <div className="line-clamp-1">{g.adviser_name}</div>
                                                    <div className="text-xs text-muted-foreground">{g.adviser_email ?? ""}</div>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">Unassigned</span>
                                            )}
                                        </TableCell>

                                        <TableCell className="hidden lg:table-cell">
                                            <Badge variant="outline">{g.members_count}</Badge>
                                        </TableCell>

                                        <TableCell className="hidden lg:table-cell">{formatDate(g.next_defense_at)}</TableCell>

                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button asChild variant="secondary" size="sm" disabled={busy}>
                                                    <Link href={`/dashboard/admin/thesis/${g.id}`}>View</Link>
                                                </Button>

                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="sm"
                                                    disabled={busy}
                                                    onClick={() => onDelete(g.id)}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Delete
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                    Page <span className="font-medium text-foreground">{props.page}</span> of{" "}
                    <span className="font-medium text-foreground">{props.totalPages}</span>
                </div>

                <div className="flex items-center justify-end gap-2">
                    <Button asChild variant="outline" disabled={!prevHref || busy}>
                        <Link href={prevHref ?? buildHref(baseHref, { q: props.q || undefined, page: "1", limit: String(props.limit) })}>
                            <ChevronLeft className="mr-2 h-4 w-4" />
                            Previous
                        </Link>
                    </Button>

                    <Button asChild variant="outline" disabled={!nextHref || busy}>
                        <Link
                            href={
                                nextHref ??
                                buildHref(baseHref, { q: props.q || undefined, page: String(props.totalPages), limit: String(props.limit) })
                            }
                        >
                            Next
                            <ChevronRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
