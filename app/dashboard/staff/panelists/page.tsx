"use client"

import * as React from "react"

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

type PanelistStatus = "active" | "disabled" | (string & {})

type PanelistItem = {
    id: string
    name: string
    email: string | null
    status: PanelistStatus
    expertise: string | null
    department: string | null
    created_at: string | null
}

const STATUS_FILTERS = ["all", "active", "disabled"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const ENDPOINT_CANDIDATES = [
    "/api/staff/panelists",
    "/api/panelist",
    "/api/panelists",
    "/api/users?role=panelist",
    "/api/users",
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

function toTitleCase(value: string): string {
    if (!value) return value
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDateTime(value: string | null): string {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function statusTone(status: string): string {
    const normalized = status.toLowerCase()

    if (normalized === "active") {
        return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
    }

    if (normalized === "disabled") {
        return "border-destructive/40 bg-destructive/10 text-destructive"
    }

    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

function normalizePanelist(raw: unknown): PanelistItem | null {
    if (!isRecord(raw)) return null

    const user = isRecord(raw.user) ? raw.user : raw
    const profile =
        isRecord(raw.profile)
            ? raw.profile
            : isRecord(raw.panelist)
                ? raw.panelist
                : isRecord(raw.panelist_profile)
                    ? raw.panelist_profile
                    : raw

    const role = toStringSafe(user.role ?? raw.role)
    if (role && role.toLowerCase() !== "panelist") return null

    const id =
        toStringSafe(user.id ?? raw.id) ??
        toStringSafe(raw.user_id ?? raw.userId ?? raw.staff_id ?? raw.panelist_id)
    if (!id) return null

    const name =
        toStringSafe(user.name ?? raw.name) ??
        toStringSafe(raw.full_name ?? raw.fullName) ??
        `Panelist ${id.slice(0, 8)}`

    const email = toNullableString(user.email ?? raw.email)
    const status = (toStringSafe(user.status ?? raw.status) ?? "active") as PanelistStatus

    const expertise =
        toNullableString(profile.expertise ?? raw.expertise ?? raw.specialization)
    const department =
        toNullableString(profile.department ?? raw.department)

    const created_at =
        toNullableString(user.created_at ?? user.createdAt ?? profile.created_at ?? raw.created_at)

    return {
        id,
        name,
        email,
        status,
        expertise,
        department,
        created_at,
    }
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload.panelists)) return payload.panelists
    if (Array.isArray(payload.users)) return payload.users

    if (isRecord(payload.data)) {
        if (Array.isArray(payload.data.items)) return payload.data.items
        if (Array.isArray(payload.data.panelists)) return payload.data.panelists
        if (Array.isArray(payload.data.users)) return payload.data.users
    }

    if (isRecord(payload.result)) {
        if (Array.isArray(payload.result.items)) return payload.result.items
        if (Array.isArray(payload.result.panelists)) return payload.result.panelists
        if (Array.isArray(payload.result.users)) return payload.result.users
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

export default function StaffPanelistsPage() {
    const [panelists, setPanelists] = React.useState<PanelistItem[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [sourceEndpoint, setSourceEndpoint] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")

    const loadPanelists = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        let loaded = false
        let latestError = "Unable to load panelists."

        for (const endpoint of ENDPOINT_CANDIDATES) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const parsed = extractArrayPayload(payload)
                    .map(normalizePanelist)
                    .filter((item): item is PanelistItem => item !== null)

                setPanelists(parsed)
                setSourceEndpoint(endpoint)
                loaded = true
                break
            } catch (err) {
                latestError =
                    err instanceof Error ? err.message : "Unable to load panelists."
            }
        }

        if (!loaded) {
            setPanelists([])
            setSourceEndpoint(null)
            setError(
                `${latestError} No panelist endpoint responded successfully. ` +
                `Please ensure a panelists API is available.`,
            )
        }

        setLoading(false)
    }, [])

    React.useEffect(() => {
        void loadPanelists()
    }, [loadPanelists])

    const filteredPanelists = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return panelists.filter((item) => {
            if (statusFilter !== "all" && item.status.toLowerCase() !== statusFilter) {
                return false
            }

            if (!q) return true

            return (
                item.id.toLowerCase().includes(q) ||
                item.name.toLowerCase().includes(q) ||
                (item.email ?? "").toLowerCase().includes(q) ||
                (item.expertise ?? "").toLowerCase().includes(q) ||
                (item.department ?? "").toLowerCase().includes(q)
            )
        })
    }, [panelists, search, statusFilter])

    const totals = React.useMemo(() => {
        let active = 0
        let disabled = 0

        for (const item of panelists) {
            const s = item.status.toLowerCase()
            if (s === "active") active += 1
            else if (s === "disabled") disabled += 1
        }

        return {
            all: panelists.length,
            active,
            disabled,
        }
    }, [panelists])

    return (
        <DashboardLayout
            title="Panelists"
            description="View and search panelist records for defense management."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by name, email, ID, expertise, or department"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />

                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={() => void loadPanelists()} disabled={loading}>
                                    Refresh
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by status</p>
                            <div className="flex flex-wrap gap-2">
                                {STATUS_FILTERS.map((status) => {
                                    const active = statusFilter === status
                                    const label = status === "all" ? "All" : toTitleCase(status)

                                    return (
                                        <Button
                                            key={status}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setStatusFilter(status)}
                                        >
                                            {label}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-3">
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">All</p>
                                <p className="text-lg font-semibold">{totals.all}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Active</p>
                                <p className="text-lg font-semibold">{totals.active}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Disabled</p>
                                <p className="text-lg font-semibold">{totals.disabled}</p>
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Showing{" "}
                            <span className="font-semibold text-foreground">{filteredPanelists.length}</span> of{" "}
                            <span className="font-semibold text-foreground">{panelists.length}</span> panelist(s).
                        </p>

                        {sourceEndpoint ? (
                            <p className="text-xs text-muted-foreground">Data source: {sourceEndpoint}</p>
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
                                <TableHead className="min-w-56">Panelist</TableHead>
                                <TableHead className="min-w-56">Email</TableHead>
                                <TableHead className="min-w-44">Expertise</TableHead>
                                <TableHead className="min-w-40">Department</TableHead>
                                <TableHead className="min-w-28">Status</TableHead>
                                <TableHead className="min-w-48">Created</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <TableRow key={`skeleton-${i}`}>
                                        <TableCell colSpan={6}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredPanelists.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                        No panelists found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredPanelists.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{item.name}</span>
                                                <span className="text-xs text-muted-foreground">ID: {item.id}</span>
                                            </div>
                                        </TableCell>

                                        <TableCell className="text-muted-foreground">{item.email ?? "—"}</TableCell>
                                        <TableCell>{item.expertise ?? "—"}</TableCell>
                                        <TableCell>{item.department ?? "—"}</TableCell>

                                        <TableCell>
                                            <span
                                                className={[
                                                    "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                    statusTone(item.status),
                                                ].join(" ")}
                                            >
                                                {toTitleCase(item.status)}
                                            </span>
                                        </TableCell>

                                        <TableCell className="text-muted-foreground">
                                            {formatDateTime(item.created_at)}
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
