// app/dashboard/admin/thesis/page.tsx
import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import {
    BookOpen,
    ChevronLeft,
    ChevronRight,
    Plus,
    Search,
    Trash2,
} from "lucide-react"

import { db } from "@/lib/db"
import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth"
import { requireRole } from "@/lib/rbac"
import { isValidEmail } from "@/lib/security"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SearchParams = Record<string, string | string[] | undefined>

type ThesisGroupRow = {
    id: string
    title: string
    program: string | null
    term: string | null
    created_at: string
    updated_at: string
    adviser_name: string | null
    adviser_email: string | null
    members_count: number
    next_defense_at: string | null
}

function clampInt(v: unknown, fallback: number, min: number, max: number) {
    const n = typeof v === "string" ? Number(v) : Number.NaN
    if (!Number.isFinite(n)) return fallback
    const i = Math.trunc(n)
    return Math.min(Math.max(i, min), max)
}

function pickOne(v: string | string[] | undefined) {
    if (Array.isArray(v)) return v[0]
    return v
}

function formatDate(iso: string | null | undefined) {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(d)
}

function buildHref(base: string, params: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
        if (v != null && String(v).length > 0) sp.set(k, String(v))
    })
    const qs = sp.toString()
    return qs ? `${base}?${qs}` : base
}

async function requireAdminActor() {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) redirect("/login")

    const actor = await getUserFromSession(token)
    if (!actor) redirect("/login")

    try {
        requireRole(actor, ["admin"])
    } catch {
        redirect("/dashboard")
    }

    return actor
}

async function resolveAdviserIdByEmail(email: string) {
    const q = `
    select id, role
    from users
    where lower(email) = lower($1)
    limit 1
  `
    const { rows } = await db.query(q, [email])
    const row = rows[0] as { id: string; role: "student" | "staff" | "admin" } | undefined
    if (!row) return { ok: false as const, message: "Adviser email not found." }
    if (row.role !== "staff" && row.role !== "admin") {
        return { ok: false as const, message: "Adviser must be a staff or admin user." }
    }
    return { ok: true as const, adviserId: row.id }
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const actor = await requireAdminActor()

    const q = String(pickOne(searchParams.q) ?? "").trim()
    const page = clampInt(pickOne(searchParams.page), 1, 1, 999999)
    const limit = clampInt(pickOne(searchParams.limit), 20, 5, 200)
    const offset = (page - 1) * limit

    const notice = String(pickOne(searchParams.notice) ?? "").trim()
    const err = String(pickOne(searchParams.err) ?? "").trim()

    // Server Actions
    async function createGroup(formData: FormData) {
        "use server"
        const actor = await requireAdminActor()

        const title = String(formData.get("title") ?? "").trim()
        const program = String(formData.get("program") ?? "").trim()
        const term = String(formData.get("term") ?? "").trim()
        const adviserEmail = String(formData.get("adviser_email") ?? "").trim()

        if (!title) {
            redirect(buildHref("/dashboard/admin/thesis", { err: "Title is required." }))
        }

        let adviserId: string | null = null
        if (adviserEmail) {
            if (!isValidEmail(adviserEmail)) {
                redirect(buildHref("/dashboard/admin/thesis", { err: "Invalid adviser email." }))
            }
            const resolved = await resolveAdviserIdByEmail(adviserEmail)
            if (!resolved.ok) {
                redirect(buildHref("/dashboard/admin/thesis", { err: resolved.message }))
            }
            adviserId = resolved.adviserId
        }

        try {
            const insertQ = `
        insert into thesis_groups (title, adviser_id, program, term)
        values ($1, $2, $3, $4)
        returning id
      `
            const { rows } = await db.query(insertQ, [
                title,
                adviserId,
                program || null,
                term || null,
            ])

            const groupId = rows[0]?.id as string | undefined

            await db.query(
                `
          insert into audit_logs (actor_id, action, entity, entity_id, details)
          values ($1, 'thesis_group_created', 'thesis_groups', $2, $3::jsonb)
        `,
                [actor.id, groupId ?? null, JSON.stringify({ title, program: program || null, term: term || null, adviserEmail: adviserEmail || null })]
            )

            revalidatePath("/dashboard/admin/thesis")
            redirect(buildHref("/dashboard/admin/thesis", { notice: "Thesis group created." }))
        } catch {
            redirect(buildHref("/dashboard/admin/thesis", { err: "Failed to create thesis group." }))
        }
    }

    async function deleteGroup(formData: FormData) {
        "use server"
        const actor = await requireAdminActor()
        const id = String(formData.get("id") ?? "").trim()
        if (!id) redirect(buildHref("/dashboard/admin/thesis", { err: "Missing group id." }))

        try {
            const delQ = `delete from thesis_groups where id = $1`
            await db.query(delQ, [id])

            await db.query(
                `
          insert into audit_logs (actor_id, action, entity, entity_id, details)
          values ($1, 'thesis_group_deleted', 'thesis_groups', $2, $3::jsonb)
        `,
                [actor.id, id, JSON.stringify({})]
            )

            revalidatePath("/dashboard/admin/thesis")
            redirect(buildHref("/dashboard/admin/thesis", { notice: "Thesis group deleted." }))
        } catch {
            redirect(buildHref("/dashboard/admin/thesis", { err: "Failed to delete thesis group." }))
        }
    }

    // Stats
    const statsRes = await db.query(`
    select
      (select count(*)::int from thesis_groups) as groups_total,
      (select count(*)::int from group_members) as memberships_total,
      (select count(*)::int from defense_schedules where scheduled_at > now() and scheduled_at < now() + interval '30 days') as upcoming_30d
  `)
    const stats = statsRes.rows[0] as
        | { groups_total: number; memberships_total: number; upcoming_30d: number }
        | undefined

    // List + Search
    const where: string[] = []
    const params: Array<string | number> = []

    if (q) {
        params.push(`%${q}%`)
        const i = params.length
        where.push(
            `(g.title ilike $${i}
        or coalesce(g.program,'') ilike $${i}
        or coalesce(g.term,'') ilike $${i}
        or coalesce(a.name,'') ilike $${i}
        or coalesce(a.email,'') ilike $${i})`
        )
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : ""

    const countQ = `
    select count(*)::int as total
    from thesis_groups g
    left join users a on a.id = g.adviser_id
    ${whereSql}
  `
    const countRes = await db.query(countQ, params)
    const total = (countRes.rows[0]?.total as number | undefined) ?? 0
    const totalPages = Math.max(1, Math.ceil(total / limit))

    const listQ = `
    select
      g.id,
      g.title,
      g.program,
      g.term,
      g.created_at,
      g.updated_at,
      a.name as adviser_name,
      a.email as adviser_email,
      coalesce(m.members_count, 0)::int as members_count,
      d.next_defense_at
    from thesis_groups g
    left join users a on a.id = g.adviser_id
    left join (
      select group_id, count(*)::int as members_count
      from group_members
      group by group_id
    ) m on m.group_id = g.id
    left join (
      select group_id, min(scheduled_at) as next_defense_at
      from defense_schedules
      where scheduled_at > now()
      group by group_id
    ) d on d.group_id = g.id
    ${whereSql}
    order by g.created_at desc
    limit $${params.length + 1}
    offset $${params.length + 2}
  `
    const listRes = await db.query(listQ, [...params, limit, offset])
    const groups = (listRes.rows as ThesisGroupRow[]) ?? []

    const baseHref = "/dashboard/admin/thesis"
    const prevHref =
        page > 1
            ? buildHref(baseHref, { q: q || undefined, page: String(page - 1), limit: String(limit) })
            : null
    const nextHref =
        page < totalPages
            ? buildHref(baseHref, { q: q || undefined, page: String(page + 1), limit: String(limit) })
            : null

    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        <h1 className="text-2xl font-semibold tracking-tight">Thesis Records</h1>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Manage thesis groups, advisers, and view quick status at a glance.
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Signed in as: <span className="font-medium">{actor.name}</span> ({actor.email})
                    </p>
                </div>

                <form method="get" className="flex w-full gap-2 md:w-105">
                    <div className="relative w-full">
                        <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            name="q"
                            defaultValue={q}
                            placeholder="Search by title, program, term, adviser…"
                            className="pl-8"
                        />
                    </div>
                    <input type="hidden" name="limit" value={String(limit)} />
                    <Button type="submit" variant="secondary">
                        Search
                    </Button>
                </form>
            </div>

            {(notice || err) && (
                <Alert variant={err ? "destructive" : "default"}>
                    <AlertTitle>{err ? "Something went wrong" : "Success"}</AlertTitle>
                    <AlertDescription>{err || notice}</AlertDescription>
                </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total thesis groups</CardDescription>
                        <CardTitle className="text-2xl">{stats?.groups_total ?? 0}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <Badge variant="secondary">All terms</Badge>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total memberships</CardDescription>
                        <CardTitle className="text-2xl">{stats?.memberships_total ?? 0}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <Badge variant="secondary">Students assigned</Badge>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Upcoming defenses (30 days)</CardDescription>
                        <CardTitle className="text-2xl">{stats?.upcoming_30d ?? 0}</CardTitle>
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
                    <CardDescription>
                        Create a new thesis group record. Adviser is optional (must be staff/admin).
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <form action={createGroup} className="grid gap-4 md:grid-cols-12">
                        <div className="space-y-2 md:col-span-4">
                            <Label htmlFor="title">Title</Label>
                            <Input id="title" name="title" placeholder="e.g., Smart Campus Attendance System" required />
                        </div>

                        <div className="space-y-2 md:col-span-3">
                            <Label htmlFor="program">Program</Label>
                            <Input id="program" name="program" placeholder="e.g., BSCS" />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="term">Term</Label>
                            <Input id="term" name="term" placeholder="e.g., AY 2025–2026" />
                        </div>

                        <div className="space-y-2 md:col-span-3">
                            <Label htmlFor="adviser_email">Adviser email (optional)</Label>
                            <Input id="adviser_email" name="adviser_email" placeholder="staff@school.edu" />
                        </div>

                        <div className="md:col-span-12">
                            <Separator className="my-1" />
                            <div className="flex items-center justify-end">
                                <Button type="submit">Create group</Button>
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Thesis groups</CardTitle>
                    <CardDescription>
                        Showing <span className="font-medium">{groups.length}</span> of{" "}
                        <span className="font-medium">{total}</span> result(s).
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <Table>
                        <TableCaption>
                            Use search to filter. Pagination is available below.
                        </TableCaption>

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
                            {groups.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                                        No thesis groups found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                groups.map((g) => (
                                    <TableRow key={g.id}>
                                        <TableCell className="font-medium">
                                            <div className="space-y-1">
                                                <div className="line-clamp-1">{g.title}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    Created {formatDate(g.created_at)}
                                                </div>
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
                                                <Button asChild variant="secondary" size="sm">
                                                    <Link href={`/dashboard/admin/thesis/${g.id}`}>View</Link>
                                                </Button>

                                                <form action={deleteGroup}>
                                                    <input type="hidden" name="id" value={g.id} />
                                                    <Button type="submit" variant="destructive" size="sm">
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Delete
                                                    </Button>
                                                </form>
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
                    Page <span className="font-medium text-foreground">{page}</span> of{" "}
                    <span className="font-medium text-foreground">{totalPages}</span>
                </div>

                <div className="flex items-center justify-end gap-2">
                    <Button asChild variant="outline" disabled={!prevHref}>
                        <Link href={prevHref ?? buildHref(baseHref, { q: q || undefined, page: "1", limit: String(limit) })}>
                            <ChevronLeft className="mr-2 h-4 w-4" />
                            Previous
                        </Link>
                    </Button>

                    <Button asChild variant="outline" disabled={!nextHref}>
                        <Link href={nextHref ?? buildHref(baseHref, { q: q || undefined, page: String(totalPages), limit: String(limit) })}>
                            Next
                            <ChevronRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
