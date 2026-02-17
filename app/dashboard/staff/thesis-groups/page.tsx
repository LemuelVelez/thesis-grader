"use client"

import * as React from "react"
import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import DataTable from "@/components/data-table"
import { fetchFirstAvailableJson, fetchMembersCountForGroup } from "@/components/thesis-groups/thesis-group-api"
import {
    LIST_ENDPOINTS,
    asRecord,
    formatDateTime,
    normalizeGroup,
    parseResponseBodySafe,
    sortNewest,
    toStringOrNull,
    unwrapItem,
    unwrapItems,
    type ThesisGroupListItem,
} from "@/components/thesis-groups/thesis-group-utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type Viewer = {
    id: string | null
    name: string | null
    email: string | null
    role: string | null
}

const ME_ENDPOINTS = ["/api/auth/me", "/api/me", "/api/users/me", "/api/user/me"] as const

function parseViewer(payload: unknown): Viewer | null {
    const unwrapped = unwrapItem(payload)
    const rec = asRecord(unwrapped) ?? asRecord(payload)
    if (!rec) return null

    const nestedUser = asRecord(rec.user)
    const source = nestedUser ?? rec

    const id = toStringOrNull(source.id ?? source.user_id ?? source.auth_user_id)
    const name = toStringOrNull(source.name ?? source.full_name)
    const email = toStringOrNull(source.email)
    const role = toStringOrNull(source.role ?? source.user_role)

    if (!id && !name && !email && !role) return null
    return {
        id,
        name,
        email,
        role: role?.toLowerCase() ?? null,
    }
}

async function fetchViewer(signal: AbortSignal): Promise<Viewer | null> {
    for (const endpoint of ME_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, {
                method: "GET",
                credentials: "include",
                cache: "no-store",
                headers: { Accept: "application/json" },
                signal,
            })

            if (res.status === 404 || res.status === 405) continue

            const payload = await parseResponseBodySafe(res)
            if (!res.ok) continue

            const viewer = parseViewer(payload)
            if (viewer) return viewer
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") throw error
        }
    }

    return null
}

function createStaffColumns(membersCountSyncing: boolean): ColumnDef<ThesisGroupListItem>[] {
    return [
        {
            accessorKey: "title",
            header: "Thesis Title",
            cell: ({ row }) => (
                <Button asChild variant="ghost" className="h-auto justify-start px-0 py-0 text-left font-medium">
                    <Link href={`/dashboard/staff/thesis-groups/${row.original.id}`}>{row.original.title}</Link>
                </Button>
            ),
        },
        {
            accessorKey: "program",
            header: "Program",
            cell: ({ row }) => row.original.program ?? "—",
        },
        {
            accessorKey: "term",
            header: "Term",
            cell: ({ row }) => (row.original.term ? <Badge variant="secondary">{row.original.term}</Badge> : "—"),
        },
        {
            accessorKey: "membersCount",
            header: "Members",
            cell: ({ row }) => {
                if (row.original.membersCount === null) {
                    return membersCountSyncing ? (
                        <Badge variant="outline" className="font-normal">
                            Syncing…
                        </Badge>
                    ) : (
                        "—"
                    )
                }
                return String(row.original.membersCount)
            },
        },
        {
            accessorKey: "updatedAt",
            header: "Updated",
            cell: ({ row }) => formatDateTime(row.original.updatedAt),
        },
        {
            id: "open",
            header: "Open",
            cell: ({ row }) => (
                <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/staff/thesis-groups/${row.original.id}`}>View Details</Link>
                </Button>
            ),
        },
    ]
}

export default function StaffThesisGroupsPage() {
    const [viewer, setViewer] = React.useState<Viewer | null>(null)
    const [groups, setGroups] = React.useState<ThesisGroupListItem[]>([])
    const [loading, setLoading] = React.useState<boolean>(true)
    const [membersCountSyncing, setMembersCountSyncing] = React.useState<boolean>(false)
    const [error, setError] = React.useState<string | null>(null)
    const [refreshKey, setRefreshKey] = React.useState<number>(0)

    const hydrateMembersCount = React.useCallback(
        async (items: ThesisGroupListItem[], preferredBaseEndpoint: string | null, signal: AbortSignal) => {
            if (items.length === 0) {
                setMembersCountSyncing(false)
                return
            }

            setMembersCountSyncing(true)

            try {
                const pairs = await Promise.all(
                    items.map(async (item) => {
                        const count = await fetchMembersCountForGroup(item.id, preferredBaseEndpoint, signal)
                        return [item.id, count] as const
                    })
                )

                if (signal.aborted) return

                const resolved = new Map<string, number>()
                for (const [groupId, count] of pairs) {
                    if (count !== null) resolved.set(groupId, count)
                }

                if (resolved.size === 0) return

                setGroups((prev) =>
                    sortNewest(
                        prev.map((group) => {
                            const nextCount = resolved.get(group.id)
                            if (nextCount === undefined || group.membersCount === nextCount) return group
                            return { ...group, membersCount: nextCount }
                        })
                    )
                )
            } catch (error) {
                if (error instanceof Error && error.name === "AbortError") return
                toast.error("Could not sync member counts. Showing available values only.")
            } finally {
                if (!signal.aborted) setMembersCountSyncing(false)
            }
        },
        []
    )

    const load = React.useCallback(
        async (signal: AbortSignal) => {
            setLoading(true)
            setError(null)
            setMembersCountSyncing(false)

            try {
                const viewerSnapshot = await fetchViewer(signal)
                if (!signal.aborted) setViewer(viewerSnapshot)

                const result = await fetchFirstAvailableJson(LIST_ENDPOINTS, signal)

                if (!result) {
                    setGroups([])
                    setError(
                        "No compatible thesis-group API endpoint found. Wire one of: /api/thesis-groups or /api/admin/thesis-groups."
                    )
                    return
                }

                const normalized = unwrapItems(result.payload)
                    .map(normalizeGroup)
                    .filter((item): item is ThesisGroupListItem => item !== null)

                const sorted = sortNewest(normalized)

                const isStaff = (viewerSnapshot?.role ?? "").toLowerCase() === "staff"
                const scoped = isStaff && viewerSnapshot?.id ? sorted.filter((item) => item.adviserId === viewerSnapshot.id) : sorted

                setGroups(scoped)
                void hydrateMembersCount(scoped, result.endpoint, signal)
            } catch (error) {
                if (error instanceof Error && error.name === "AbortError") return
                const message = error instanceof Error ? error.message : "Failed to load thesis groups."
                setGroups([])
                setError(message)
                toast.error(message)
            } finally {
                if (!signal.aborted) setLoading(false)
            }
        },
        [hydrateMembersCount]
    )

    React.useEffect(() => {
        const controller = new AbortController()
        void load(controller.signal)
        return () => controller.abort()
    }, [load, refreshKey])

    const viewerRole = (viewer?.role ?? "").toLowerCase()
    const isStaff = viewerRole === "staff"
    const columns = React.useMemo(() => createStaffColumns(membersCountSyncing), [membersCountSyncing])

    return (
        <DashboardLayout
            title="Thesis Groups"
            description="Browse thesis groups with adviser-focused visibility and quick access to detailed records."
        >
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setRefreshKey((value) => value + 1)}
                        disabled={loading || membersCountSyncing}
                    >
                        <RefreshCw className="mr-2 size-4" />
                        {loading || membersCountSyncing ? "Refreshing..." : "Refresh"}
                    </Button>

                    <Badge variant="outline">{isStaff ? "Scope: My advised groups" : "Scope: All available groups"}</Badge>
                    <Badge variant="outline">{membersCountSyncing ? "Syncing member counts..." : "Member counts ready"}</Badge>
                    <Badge variant="outline">Groups: {groups.length}</Badge>
                </div>

                {error ? (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                {isStaff && !loading && groups.length === 0 ? (
                    <Alert>
                        <AlertDescription>You currently have no thesis groups assigned as adviser.</AlertDescription>
                    </Alert>
                ) : null}

                <DataTable
                    columns={columns}
                    data={groups}
                    filterColumnId="title"
                    filterPlaceholder="Search thesis title..."
                />
            </div>
        </DashboardLayout>
    )
}
