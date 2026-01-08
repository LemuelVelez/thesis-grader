/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link"
import { cookies } from "next/headers"

import { db } from "@/lib/db"
import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth"

import DashboardLayout from "@/components/dashboard-layout"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type AuditRow = {
    id: string
    actor_id: string | null
    actor_name: string | null
    actor_email: string | null
    action: string
    entity: string
    entity_id: string | null
    details: any
    created_at: string
}

function roleBasePath(role: string) {
    const r = String(role ?? "").toLowerCase()
    if (r === "student") return "/dashboard/student"
    if (r === "staff") return "/dashboard/staff"
    if (r === "admin") return "/dashboard/admin"
    return "/dashboard"
}

function clampInt(v: unknown, def: number, min: number, max: number) {
    const raw = Array.isArray(v) ? v[0] : v
    const n = typeof raw === "string" ? Number(raw) : Number(raw)
    if (!Number.isFinite(n)) return def
    return Math.max(min, Math.min(max, Math.trunc(n)))
}

function toStr(v: unknown) {
    if (v === undefined || v === null) return ""
    if (Array.isArray(v)) return String(v[0] ?? "")
    return String(v)
}

function safeJson(details: any) {
    try {
        if (details === null || details === undefined) return ""
        if (typeof details === "string") return details
        return JSON.stringify(details, null, 2)
    } catch {
        return String(details ?? "")
    }
}

function truncate(s: string, n = 140) {
    const t = String(s ?? "")
    if (t.length <= n) return t
    return t.slice(0, n - 1) + "…"
}

function fmtTs(ts: string) {
    try {
        const d = new Date(ts)
        if (Number.isNaN(d.getTime())) return String(ts)
        return d.toISOString().replace("T", " ").slice(0, 19) + "Z"
    } catch {
        return String(ts)
    }
}

function buildSearchParams(current: Record<string, string>, patch: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    const merged: Record<string, string> = { ...current }
    for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete merged[k]
        else merged[k] = v
    }
    for (const [k, v] of Object.entries(merged)) {
        if (v) sp.set(k, v)
    }
    return sp.toString()
}

export default async function AdminAuditPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const sp = await searchParams

    // -------- Auth (server-side) --------
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    const currentUser = token ? await getUserFromSession(token).catch(() => undefined) : undefined

    if (!currentUser) {
        return (
            <DashboardLayout title="Audit Logs">
                <Card>
                    <CardContent className="p-6">
                        <div className="text-sm text-muted-foreground">Please sign in.</div>
                    </CardContent>
                </Card>
            </DashboardLayout>
        )
    }

    if (String(currentUser.role).toLowerCase() !== "admin") {
        return (
            <DashboardLayout title="Audit Logs">
                <Alert>
                    <AlertTitle>Forbidden</AlertTitle>
                    <AlertDescription>
                        Admins only. Go back to your dashboard:{" "}
                        <Link className="underline" href={roleBasePath(currentUser.role)}>
                            {roleBasePath(currentUser.role)}
                        </Link>
                    </AlertDescription>
                </Alert>
            </DashboardLayout>
        )
    }

    // -------- Filters (query params) --------
    const q = toStr(sp.q).trim()
    const action = toStr(sp.action).trim()
    const entity = toStr(sp.entity).trim()
    const actor = toStr(sp.actor).trim()
    const from = toStr(sp.from).trim()
    const to = toStr(sp.to).trim()

    const page = clampInt(sp.page, 1, 1, 999999)
    const pageSize = clampInt(sp.pageSize, 50, 10, 200)
    const view = toStr(sp.view).trim()

    const currentParams: Record<string, string> = {
        q,
        action,
        entity,
        actor,
        from,
        to,
        page: String(page),
        pageSize: String(pageSize),
        view,
    }

    // -------- SQL build --------
    const whereParts: string[] = []
    const params: any[] = []

    if (q) {
        params.push(`%${q.toLowerCase()}%`)
        const p = `$${params.length}`
        whereParts.push(
            `(
        lower(a.action) like ${p}
        or lower(a.entity) like ${p}
        or coalesce(a.entity_id::text,'') like ${p}
        or lower(coalesce(u.name,'')) like ${p}
        or lower(coalesce(u.email,'')) like ${p}
        or lower(coalesce(a.details::text,'')) like ${p}
      )`
        )
    }

    if (action) {
        params.push(action)
        whereParts.push(`a.action = $${params.length}`)
    }

    if (entity) {
        params.push(entity)
        whereParts.push(`a.entity = $${params.length}`)
    }

    if (actor) {
        params.push(`%${actor.toLowerCase()}%`)
        const p = `$${params.length}`
        whereParts.push(`(lower(coalesce(u.name,'')) like ${p} or lower(coalesce(u.email,'')) like ${p})`)
    }

    if (from) {
        params.push(from)
        whereParts.push(`a.created_at >= ($${params.length})::date`)
    }

    if (to) {
        params.push(to)
        whereParts.push(`a.created_at < (($${params.length})::date + interval '1 day')`)
    }

    const whereSql = whereParts.length ? `where ${whereParts.join(" and ")}` : ""

    // Count
    const countRes = await db.query(
        `
      select count(*)::int as count
      from audit_logs a
      left join users u on u.id = a.actor_id
      ${whereSql}
    `,
        params
    )
    const total = countRes.rows?.[0]?.count ?? 0

    const offset = (page - 1) * pageSize
    const pageParams = [...params, pageSize, offset]

    const listRes = await db.query(
        `
      select
        a.id,
        a.actor_id,
        u.name as actor_name,
        u.email as actor_email,
        a.action,
        a.entity,
        a.entity_id,
        a.details,
        a.created_at
      from audit_logs a
      left join users u on u.id = a.actor_id
      ${whereSql}
      order by a.created_at desc
      limit $${pageParams.length - 1}
      offset $${pageParams.length}
    `,
        pageParams
    )

    const rows = (listRes.rows ?? []) as AuditRow[]

    // Optional detail panel
    let viewed: AuditRow | null = null
    if (view) {
        const vRes = await db.query(
            `
        select
          a.id,
          a.actor_id,
          u.name as actor_name,
          u.email as actor_email,
          a.action,
          a.entity,
          a.entity_id,
          a.details,
          a.created_at
        from audit_logs a
        left join users u on u.id = a.actor_id
        where a.id = $1
        limit 1
      `,
            [view]
        )
        viewed = (vRes.rows?.[0] as AuditRow | undefined) ?? null
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const startIndex = total ? offset + 1 : 0
    const endIndex = Math.min(total, offset + rows.length)

    const baseWithoutView = buildSearchParams({ ...currentParams, view: "" }, { view: undefined })

    return (
        <DashboardLayout title="Audit Logs">
            {/* Prevent page-level overflow; table itself will scroll horizontally */}
            <div className="space-y-4 w-full min-w-0 overflow-x-hidden">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle>Audit Logs</CardTitle>
                        <CardDescription>
                            Review admin/system actions (users, schedules, etc.). Showing{" "}
                            <span className="font-medium text-foreground">
                                {startIndex}-{endIndex}
                            </span>{" "}
                            of <span className="font-medium text-foreground">{total}</span>.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="pt-0 min-w-0">
                        <form method="GET" className="flex flex-col gap-3 min-w-0">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 min-w-0">
                                <Input name="q" defaultValue={q} placeholder="Search action/entity/actor/details..." className="w-full min-w-0" />
                                <Input name="action" defaultValue={action} placeholder="Action (exact)" className="w-full min-w-0" />
                                <Input name="entity" defaultValue={entity} placeholder="Entity (exact)" className="w-full min-w-0" />
                                <Input name="actor" defaultValue={actor} placeholder="Actor name/email" className="w-full min-w-0" />
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
                                <Input name="from" defaultValue={from} type="date" className="w-full min-w-0" />
                                <Input name="to" defaultValue={to} type="date" className="w-full min-w-0" />
                                <Input
                                    name="pageSize"
                                    defaultValue={String(pageSize)}
                                    type="number"
                                    min={10}
                                    max={200}
                                    placeholder="Page size"
                                    className="w-full min-w-0"
                                />
                            </div>

                            <input type="hidden" name="page" value="1" />

                            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center min-w-0">
                                <Button type="submit" className="w-full sm:w-auto">
                                    Apply filters
                                </Button>

                                <Button variant="outline" asChild className="w-full sm:w-auto">
                                    <Link href={`/dashboard/admin/audit`}>Clear</Link>
                                </Button>

                                <Button variant="ghost" asChild className="w-full sm:w-auto">
                                    <Link href={`/dashboard/admin/audit?${buildSearchParams(currentParams, {})}`}>Refresh</Link>
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {viewed ? (
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-w-0">
                                <div className="min-w-0">
                                    <CardTitle className="text-base">Log Details</CardTitle>
                                    <CardDescription className="break-all">{viewed.id}</CardDescription>
                                </div>

                                <Button variant="outline" asChild className="w-full sm:w-auto">
                                    <Link href={`/dashboard/admin/audit?${baseWithoutView}`}>Close</Link>
                                </Button>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-3 min-w-0">
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="secondary">{fmtTs(viewed.created_at)}</Badge>
                                <Badge>{viewed.action}</Badge>
                                <Badge variant="outline">{viewed.entity}</Badge>
                                {viewed.entity_id ? <Badge variant="secondary">entity_id: {viewed.entity_id}</Badge> : null}
                            </div>

                            <Separator />

                            <div className="text-sm min-w-0">
                                <div className="text-muted-foreground">Actor</div>
                                <div className="font-medium break-all">
                                    {viewed.actor_email
                                        ? `${viewed.actor_name ?? "Unknown"} (${viewed.actor_email})`
                                        : viewed.actor_name ?? "System/Unknown"}
                                </div>
                            </div>

                            <div className="space-y-2 min-w-0">
                                <div className="text-sm text-muted-foreground">Details (JSON)</div>
                                <Textarea readOnly value={safeJson(viewed.details)} className="min-h-55 font-mono text-xs" />
                            </div>
                        </CardContent>
                    </Card>
                ) : null}

                {/* Mobile: cards only (no table) */}
                <div className="space-y-3 md:hidden min-w-0">
                    {rows.length ? (
                        rows.map((r) => {
                            const detailsStr = safeJson(r.details)
                            const actorLabel = r.actor_email
                                ? `${r.actor_name ?? "Unknown"} (${r.actor_email})`
                                : r.actor_name ?? "System/Unknown"
                            const qs = buildSearchParams(currentParams, { view: r.id })

                            return (
                                <Card key={r.id}>
                                    <CardContent className="p-4 space-y-3 min-w-0">
                                        <div className="flex flex-wrap gap-2">
                                            <Badge variant="secondary">{fmtTs(r.created_at)}</Badge>
                                            <Badge>{r.action}</Badge>
                                            <Badge variant="outline">{r.entity}</Badge>
                                        </div>

                                        <div className="text-sm min-w-0">
                                            <div className="text-muted-foreground">Actor</div>
                                            <div className="font-medium break-all">{actorLabel}</div>
                                            {r.actor_id ? <div className="text-xs text-muted-foreground break-all">{r.actor_id}</div> : null}
                                        </div>

                                        <div className="text-sm min-w-0">
                                            <div className="text-muted-foreground">Entity ID</div>
                                            {r.entity_id ? (
                                                <div className="font-mono text-xs break-all">{r.entity_id}</div>
                                            ) : (
                                                <div className="text-xs text-muted-foreground">—</div>
                                            )}
                                        </div>

                                        <div className="text-sm min-w-0">
                                            <div className="text-muted-foreground">Details</div>
                                            <div className="font-mono text-xs whitespace-pre-wrap break-all text-muted-foreground">
                                                {detailsStr ? truncate(detailsStr, 220) : "—"}
                                            </div>
                                        </div>

                                        <div className="pt-1">
                                            <Button variant="outline" size="sm" asChild className="w-full">
                                                <Link href={`/dashboard/admin/audit?${qs}`}>View</Link>
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })
                    ) : (
                        <Card>
                            <CardContent className="p-6 text-sm text-muted-foreground">
                                No audit logs found for the current filters.
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Desktop: table WITH horizontal scrollbar */}
                <Card className="hidden md:block">
                    <CardContent className="p-0 min-w-0">
                        {/* ✅ THIS is the horizontal scroll container */}
                        <div className="w-full min-w-0 overflow-x-auto">
                            <Table className="w-max min-w-full">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="whitespace-nowrap">Time (UTC)</TableHead>
                                        <TableHead className="whitespace-nowrap">Actor</TableHead>
                                        <TableHead className="whitespace-nowrap">Action</TableHead>
                                        <TableHead className="whitespace-nowrap">Entity</TableHead>
                                        <TableHead className="whitespace-nowrap">Entity ID</TableHead>
                                        <TableHead className="whitespace-nowrap">Details</TableHead>
                                        <TableHead className="whitespace-nowrap text-right">View</TableHead>
                                    </TableRow>
                                </TableHeader>

                                <TableBody>
                                    {rows.length ? (
                                        rows.map((r) => {
                                            const detailsStr = safeJson(r.details)
                                            const actorLabel = r.actor_email
                                                ? `${r.actor_name ?? "Unknown"} (${r.actor_email})`
                                                : r.actor_name ?? "System/Unknown"

                                            const qs = buildSearchParams(currentParams, { view: r.id })

                                            return (
                                                <TableRow key={r.id}>
                                                    <TableCell className="align-top whitespace-nowrap">
                                                        <span className="text-sm">{fmtTs(r.created_at)}</span>
                                                    </TableCell>

                                                    <TableCell className="align-top">
                                                        <div className="text-sm break-all">{actorLabel}</div>
                                                        {r.actor_id ? <div className="text-xs text-muted-foreground break-all">{r.actor_id}</div> : null}
                                                    </TableCell>

                                                    <TableCell className="align-top whitespace-nowrap">
                                                        <Badge className="whitespace-nowrap">{r.action}</Badge>
                                                    </TableCell>

                                                    <TableCell className="align-top whitespace-nowrap">
                                                        <Badge variant="outline" className="whitespace-nowrap">
                                                            {r.entity}
                                                        </Badge>
                                                    </TableCell>

                                                    <TableCell className="align-top">
                                                        {r.entity_id ? (
                                                            <code className="text-xs break-all">{r.entity_id}</code>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">—</span>
                                                        )}
                                                    </TableCell>

                                                    <TableCell className="align-top">
                                                        <div className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-all max-w-130">
                                                            {detailsStr ? truncate(detailsStr, 220) : "—"}
                                                        </div>
                                                    </TableCell>

                                                    <TableCell className="align-top text-right whitespace-nowrap">
                                                        <Button variant="outline" size="sm" asChild>
                                                            <Link href={`/dashboard/admin/audit?${qs}`}>View</Link>
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={7}>
                                                <div className="p-6 text-sm text-muted-foreground">
                                                    No audit logs found for the current filters.
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="text-sm text-muted-foreground">
                                Page <span className="font-medium text-foreground">{page}</span> of{" "}
                                <span className="font-medium text-foreground">{totalPages}</span>
                            </div>

                            <Pagination>
                                <PaginationContent>
                                    <PaginationItem>
                                        <PaginationPrevious
                                            href={`/dashboard/admin/audit?${buildSearchParams(currentParams, {
                                                page: String(Math.max(1, page - 1)),
                                                view: "",
                                            })}`}
                                            aria-disabled={page <= 1}
                                        />
                                    </PaginationItem>

                                    <PaginationItem>
                                        <PaginationLink
                                            href={`/dashboard/admin/audit?${buildSearchParams(currentParams, { page: "1", view: "" })}`}
                                            isActive={page === 1}
                                        >
                                            1
                                        </PaginationLink>
                                    </PaginationItem>

                                    {totalPages >= 2 ? (
                                        <PaginationItem>
                                            <PaginationLink
                                                href={`/dashboard/admin/audit?${buildSearchParams(currentParams, {
                                                    page: String(Math.min(totalPages, Math.max(2, page))),
                                                    view: "",
                                                })}`}
                                                isActive={page !== 1 && page !== totalPages}
                                            >
                                                {String(Math.min(totalPages, Math.max(2, page)))}
                                            </PaginationLink>
                                        </PaginationItem>
                                    ) : null}

                                    {totalPages >= 3 ? (
                                        <PaginationItem>
                                            <PaginationLink
                                                href={`/dashboard/admin/audit?${buildSearchParams(currentParams, {
                                                    page: String(totalPages),
                                                    view: "",
                                                })}`}
                                                isActive={page === totalPages}
                                            >
                                                {String(totalPages)}
                                            </PaginationLink>
                                        </PaginationItem>
                                    ) : null}

                                    <PaginationItem>
                                        <PaginationNext
                                            href={`/dashboard/admin/audit?${buildSearchParams(currentParams, {
                                                page: String(Math.min(totalPages, page + 1)),
                                                view: "",
                                            })}`}
                                            aria-disabled={page >= totalPages}
                                        />
                                    </PaginationItem>
                                </PaginationContent>
                            </Pagination>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
