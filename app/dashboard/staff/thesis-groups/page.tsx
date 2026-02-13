"use client"

import * as React from "react"
import Link from "next/link"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type ThesisGroupItem = {
    id: string
    title: string
    adviser_id: string | null
    program: string | null
    term: string | null
    members_count: number
    created_at: string | null
    updated_at: string | null
}

const ENDPOINT_CANDIDATES = [
    "/api/staff/thesis-groups",
    "/api/staff/thesis-groups/mine",
    "/api/thesis-groups",
    "/api/admin/thesis-groups",
    "/api/admin/rankings",
]

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function toStringSafe(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function toNullableString(value: unknown): string | null {
    if (value === null) return null
    return toStringSafe(value)
}

function toNumberSafe(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value
    }

    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }

    return null
}

function toEpoch(value: string | null): number {
    if (!value) return 0
    const d = new Date(value)
    const ms = d.getTime()
    return Number.isNaN(ms) ? 0 : ms
}

function formatDateTime(value: string | null): string {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function normalizeGroup(raw: unknown): ThesisGroupItem | null {
    if (!isRecord(raw)) return null

    const id =
        toStringSafe(raw.id) ??
        toStringSafe(raw.group_id) ??
        toStringSafe(raw.groupId)
    if (!id) return null

    const title =
        toStringSafe(raw.title) ??
        toStringSafe(raw.group_title) ??
        toStringSafe(raw.name) ??
        "Untitled Group"

    const membersScalar =
        toNumberSafe(raw.members_count) ??
        toNumberSafe(raw.member_count) ??
        toNumberSafe(raw.membersCount)

    const membersFromArray = Array.isArray(raw.members)
        ? raw.members.length
        : Array.isArray(raw.group_members)
            ? raw.group_members.length
            : null

    return {
        id,
        title,
        adviser_id: toNullableString(raw.adviser_id ?? raw.advisor_id),
        program: toNullableString(raw.program),
        term: toNullableString(raw.term),
        members_count: Math.max(
            0,
            Math.floor(membersScalar ?? membersFromArray ?? 0),
        ),
        created_at: toNullableString(raw.created_at ?? raw.createdAt),
        updated_at: toNullableString(raw.updated_at ?? raw.updatedAt),
    }
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload.groups)) return payload.groups
    if (Array.isArray(payload.rankings)) return payload.rankings

    if (isRecord(payload.data)) {
        if (Array.isArray(payload.data.items)) return payload.data.items
        if (Array.isArray(payload.data.groups)) return payload.data.groups
    }

    if (isRecord(payload.result)) {
        if (Array.isArray(payload.result.items)) return payload.result.items
        if (Array.isArray(payload.result.groups)) return payload.result.groups
    }

    return []
}

async function readErrorMessage(res: Response, payload: unknown): Promise<string> {
    if (isRecord(payload)) {
        const error = toStringSafe(payload.error)
        if (error) return error

        const message = toStringSafe(payload.message)
        if (message) return message
    }

    try {
        const text = await res.text()
        if (text.trim().length > 0) return text
    } catch {
        // ignore
    }

    return `Request failed (${res.status})`
}

export default function StaffThesisGroupsPage() {
    const [groups, setGroups] = React.useState<ThesisGroupItem[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [sourceEndpoint, setSourceEndpoint] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")

    const loadGroups = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        let loaded = false
        let latestError = "Unable to load thesis groups."

        for (const endpoint of ENDPOINT_CANDIDATES) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const parsed = extractArrayPayload(payload)
                    .map(normalizeGroup)
                    .filter((item): item is ThesisGroupItem => item !== null)

                setGroups(parsed)
                setSourceEndpoint(endpoint)
                loaded = true
                break
            } catch (err) {
                latestError =
                    err instanceof Error
                        ? err.message
                        : "Unable to load thesis groups."
            }
        }

        if (!loaded) {
            setGroups([])
            setSourceEndpoint(null)
            setError(
                `${latestError} No thesis-groups endpoint responded successfully. ` +
                `Please ensure a thesis groups API is available.`,
            )
        }

        setLoading(false)
    }, [])

    React.useEffect(() => {
        void loadGroups()
    }, [loadGroups])

    const filteredGroups = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return [...groups]
            .filter((item) => {
                if (!q) return true
                return (
                    item.id.toLowerCase().includes(q) ||
                    item.title.toLowerCase().includes(q) ||
                    (item.program ?? "").toLowerCase().includes(q) ||
                    (item.term ?? "").toLowerCase().includes(q) ||
                    (item.adviser_id ?? "").toLowerCase().includes(q)
                )
            })
            .sort(
                (a, b) =>
                    toEpoch(b.updated_at ?? b.created_at) -
                    toEpoch(a.updated_at ?? a.created_at),
            )
    }, [groups, search])

    const totals = React.useMemo(() => {
        let withProgram = 0
        let withTerm = 0
        let withAdviser = 0
        let withMembers = 0

        for (const item of groups) {
            if (item.program) withProgram += 1
            if (item.term) withTerm += 1
            if (item.adviser_id) withAdviser += 1
            if (item.members_count > 0) withMembers += 1
        }

        return {
            all: groups.length,
            withProgram,
            withTerm,
            withAdviser,
            withMembers,
        }
    }, [groups])

    return (
        <DashboardLayout
            title="Thesis Groups"
            description="Browse thesis groups, search quickly, and open each group for details."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by title, ID, program, term, or adviser ID"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => void loadGroups()}
                                    disabled={loading}
                                >
                                    Refresh
                                </Button>
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">All Groups</p>
                                <p className="text-lg font-semibold">{totals.all}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">With Program</p>
                                <p className="text-lg font-semibold">{totals.withProgram}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">With Term</p>
                                <p className="text-lg font-semibold">{totals.withTerm}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">With Adviser</p>
                                <p className="text-lg font-semibold">{totals.withAdviser}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">With Members</p>
                                <p className="text-lg font-semibold">{totals.withMembers}</p>
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Showing{" "}
                            <span className="font-semibold text-foreground">
                                {filteredGroups.length}
                            </span>{" "}
                            of{" "}
                            <span className="font-semibold text-foreground">
                                {groups.length}
                            </span>{" "}
                            group(s).
                        </p>

                        {sourceEndpoint ? (
                            <p className="text-xs text-muted-foreground">
                                Data source: {sourceEndpoint}
                            </p>
                        ) : null}
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                <div className="overflow-x-auto rounded-lg border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-44">Group</TableHead>
                                <TableHead className="min-w-36">Program</TableHead>
                                <TableHead className="min-w-36">Term</TableHead>
                                <TableHead className="min-w-28">Members</TableHead>
                                <TableHead className="min-w-52">Adviser</TableHead>
                                <TableHead className="min-w-48">Updated</TableHead>
                                <TableHead className="min-w-32 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <TableRow key={`skeleton-${i}`}>
                                        <TableCell colSpan={7}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredGroups.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="h-24 text-center text-muted-foreground"
                                    >
                                        No thesis groups found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredGroups.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{item.title}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    ID: {item.id}
                                                </span>
                                            </div>
                                        </TableCell>

                                        <TableCell>{item.program ?? "—"}</TableCell>
                                        <TableCell>{item.term ?? "—"}</TableCell>
                                        <TableCell>{item.members_count}</TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {item.adviser_id ?? "Unassigned"}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {formatDateTime(item.updated_at ?? item.created_at)}
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex items-center justify-end">
                                                <Button asChild variant="outline" size="sm">
                                                    <Link
                                                        href={`/dashboard/staff/thesis-groups/${item.id}`}
                                                    >
                                                        View
                                                    </Link>
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </DashboardLayout>
    )
}
