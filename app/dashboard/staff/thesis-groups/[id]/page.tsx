"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

import {
    asRecord,
    dedupeById,
    formatDateTime,
    normalizeGroup,
    normalizeMember,
    normalizeSchedule,
    normalizeStaffUser,
    sortMembers,
    toStringOrNull,
    unwrapDetail,
    unwrapItems,
} from "@/components/thesis-groups/thesis-group-details-helpers"
import {
    fetchAllSuccessfulJson,
    fetchFirstAvailableJson,
    parseResponseBodySafe,
} from "@/components/thesis-groups/thesis-group-details-service"
import {
    STAFF_LIST_ENDPOINTS,
    detailEndpoints,
    memberEndpoints,
    scheduleEndpoints,
    type DefenseScheduleItem,
    type GroupMemberItem,
    type StaffUserItem,
    type ThesisGroupDetail,
} from "@/components/thesis-groups/thesis-group-details-types"

type Viewer = {
    id: string | null
    name: string | null
    email: string | null
    role: string | null
}

const ME_ENDPOINTS = ["/api/auth/me", "/api/me", "/api/users/me", "/api/user/me"] as const

function parseViewer(payload: unknown): Viewer | null {
    const detail = unwrapDetail(payload)
    const rec = asRecord(detail) ?? asRecord(payload)
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

function sortSchedules(items: DefenseScheduleItem[]): DefenseScheduleItem[] {
    return [...items].sort((a, b) => {
        const ta = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0
        const tb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0
        return ta - tb
    })
}

export default function StaffThesisGroupDetailsPage() {
    const params = useParams<{ id: string | string[] }>()
    const groupId = React.useMemo(() => {
        const raw = params?.id
        if (Array.isArray(raw)) return raw[0] ?? ""
        return raw ?? ""
    }, [params])

    const [viewer, setViewer] = React.useState<Viewer | null>(null)

    const [group, setGroup] = React.useState<ThesisGroupDetail | null>(null)
    const [members, setMembers] = React.useState<GroupMemberItem[]>([])
    const [schedules, setSchedules] = React.useState<DefenseScheduleItem[]>([])
    const [staffUsers, setStaffUsers] = React.useState<StaffUserItem[]>([])

    const [loading, setLoading] = React.useState<boolean>(true)
    const [staffLoading, setStaffLoading] = React.useState<boolean>(true)

    const [error, setError] = React.useState<string | null>(null)
    const [staffError, setStaffError] = React.useState<string | null>(null)

    const [refreshKey, setRefreshKey] = React.useState<number>(0)

    const staffById = React.useMemo(() => {
        const map = new Map<string, StaffUserItem>()
        for (const item of staffUsers) map.set(item.id, item)
        return map
    }, [staffUsers])

    const loadGroup = React.useCallback(
        async (signal: AbortSignal) => {
            if (!groupId) {
                setGroup(null)
                setMembers([])
                setSchedules([])
                setError("Invalid thesis group id.")
                setLoading(false)
                return
            }

            setLoading(true)
            setError(null)

            try {
                const payload = await fetchFirstAvailableJson(detailEndpoints(groupId), signal)

                if (!payload) {
                    setGroup(null)
                    setMembers([])
                    setSchedules([])
                    setError(
                        "No compatible thesis-group detail endpoint found. Wire one of: /api/thesis-groups/:id or /api/admin/thesis-groups/:id."
                    )
                    return
                }

                const rawDetail = unwrapDetail(payload)
                const parsedGroup = normalizeGroup(rawDetail)

                if (!parsedGroup) {
                    setGroup(null)
                    setMembers([])
                    setSchedules([])
                    setError("Group record was returned, but with an invalid shape.")
                    return
                }

                setGroup(parsedGroup)

                const detailRec = asRecord(rawDetail)

                const embeddedMembers = detailRec
                    ? unwrapItems(detailRec.members)
                        .map(normalizeMember)
                        .filter((item): item is GroupMemberItem => item !== null)
                    : []

                const embeddedSchedules = detailRec
                    ? unwrapItems(detailRec.defense_schedules ?? detailRec.schedules)
                        .map(normalizeSchedule)
                        .filter((item): item is DefenseScheduleItem => item !== null)
                    : []

                if (embeddedMembers.length > 0) {
                    setMembers(sortMembers(embeddedMembers))
                } else {
                    const membersPayload = await fetchFirstAvailableJson(memberEndpoints(groupId), signal)
                    const items = unwrapItems(membersPayload)
                        .map(normalizeMember)
                        .filter((item): item is GroupMemberItem => item !== null)
                    setMembers(sortMembers(items))
                }

                if (embeddedSchedules.length > 0) {
                    setSchedules(sortSchedules(embeddedSchedules))
                } else {
                    const schedulesPayload = await fetchFirstAvailableJson(scheduleEndpoints(groupId), signal)
                    const items = unwrapItems(schedulesPayload)
                        .map(normalizeSchedule)
                        .filter((item): item is DefenseScheduleItem => item !== null)
                    setSchedules(sortSchedules(items))
                }
            } catch (error) {
                if (error instanceof Error && error.name === "AbortError") return
                const message = error instanceof Error ? error.message : "Failed to load thesis group details."
                setGroup(null)
                setMembers([])
                setSchedules([])
                setError(message)
                toast.error(message)
            } finally {
                if (!signal.aborted) setLoading(false)
            }
        },
        [groupId]
    )

    const loadStaffUsers = React.useCallback(async (signal: AbortSignal) => {
        setStaffLoading(true)
        setStaffError(null)

        try {
            const results = await fetchAllSuccessfulJson(STAFF_LIST_ENDPOINTS, signal)

            if (results.length === 0) {
                setStaffUsers([])
                setStaffError("No compatible staff endpoint found. Adviser profile preview is unavailable.")
                return
            }

            const items = results
                .flatMap((result) => unwrapItems(result.payload))
                .map(normalizeStaffUser)
                .filter((item): item is StaffUserItem => item !== null)

            const merged = dedupeById(items).sort((a, b) =>
                a.name.localeCompare(b.name, "en", { sensitivity: "base" })
            )

            setStaffUsers(merged)

            if (merged.length === 0) {
                setStaffError("No staff users were returned from the available endpoints.")
            }
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") return
            const message = error instanceof Error ? error.message : "Failed to load staff users for adviser preview."
            setStaffUsers([])
            setStaffError(message)
            toast.error(message)
        } finally {
            if (!signal.aborted) setStaffLoading(false)
        }
    }, [])

    const loadViewer = React.useCallback(async (signal: AbortSignal) => {
        try {
            const next = await fetchViewer(signal)
            if (!signal.aborted) setViewer(next)
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") return
        }
    }, [])

    React.useEffect(() => {
        const controller = new AbortController()
        void loadGroup(controller.signal)
        void loadStaffUsers(controller.signal)
        void loadViewer(controller.signal)
        return () => controller.abort()
    }, [loadGroup, loadStaffUsers, loadViewer, refreshKey])

    const adviserContent = React.useMemo(() => {
        if (!group?.adviserId) {
            if (group?.manualAdviserInfo) {
                return (
                    <div className="space-y-1">
                        <Badge variant="outline">Legacy Manual Adviser</Badge>
                        <p className="text-sm">{group.manualAdviserInfo}</p>
                    </div>
                )
            }

            return <span className="text-muted-foreground">Not assigned</span>
        }

        const adviser = staffById.get(group.adviserId)
        if (!adviser) {
            if (staffLoading) {
                return <span className="text-muted-foreground">Loading adviser profile…</span>
            }

            return (
                <div className="space-y-1">
                    <Badge variant="outline">Assigned Staff Adviser</Badge>
                    <p className="text-xs text-muted-foreground">
                        Staff profile details are not available from the current endpoint.
                    </p>
                </div>
            )
        }

        return (
            <div className="space-y-0.5 leading-tight">
                <div className="font-medium">{adviser.name}</div>
                {adviser.email ? <div className="text-xs text-muted-foreground">{adviser.email}</div> : null}
            </div>
        )
    }, [group?.adviserId, group?.manualAdviserInfo, staffById, staffLoading])

    const isStaffViewer = (viewer?.role ?? "").toLowerCase() === "staff"
    const isAdviserMismatch =
        isStaffViewer && !!viewer?.id && !!group?.adviserId && viewer.id !== group.adviserId

    return (
        <DashboardLayout
            title={group ? `Thesis Group: ${group.title}` : "Thesis Group Details"}
            description="Review group profile, members, schedules, and adviser assignment."
        >
            <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline">
                        <Link href="/dashboard/staff/thesis-groups">Back to Thesis Groups</Link>
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => setRefreshKey((value) => value + 1)}
                        disabled={loading || staffLoading}
                    >
                        <RefreshCw className="mr-2 size-4" />
                        {loading || staffLoading ? "Refreshing..." : "Refresh"}
                    </Button>

                    <Badge variant="outline">Members: {members.length}</Badge>
                    <Badge variant="outline">Schedules: {schedules.length}</Badge>
                </div>

                {error ? (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                {staffError ? (
                    <Alert>
                        <AlertDescription>{staffError}</AlertDescription>
                    </Alert>
                ) : null}

                {isAdviserMismatch ? (
                    <Alert>
                        <AlertDescription>
                            This thesis group is currently assigned to a different adviser account.
                        </AlertDescription>
                    </Alert>
                ) : null}

                {!group && loading ? (
                    <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                        Loading thesis group details...
                    </div>
                ) : null}

                {!group && !loading ? (
                    <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                        No thesis group data found for this record.
                    </div>
                ) : null}

                {group ? (
                    <>
                        <section className="space-y-2">
                            <h2 className="text-sm font-semibold">Overview</h2>
                            <div className="overflow-hidden rounded-lg border">
                                <Table>
                                    <TableBody>
                                        <TableRow>
                                            <TableCell className="w-48 font-medium">Group ID</TableCell>
                                            <TableCell>{group.id}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="font-medium">Title</TableCell>
                                            <TableCell>{group.title}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="font-medium">Program</TableCell>
                                            <TableCell>{group.program ?? "—"}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="font-medium">Term</TableCell>
                                            <TableCell>{group.term ?? "—"}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="font-medium">Adviser</TableCell>
                                            <TableCell>{adviserContent}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="font-medium">Created</TableCell>
                                            <TableCell>{formatDateTime(group.createdAt)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="font-medium">Last Updated</TableCell>
                                            <TableCell>{formatDateTime(group.updatedAt)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </div>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-sm font-semibold">Members ({members.length})</h2>
                            <div className="overflow-hidden rounded-lg border">
                                <Table>
                                    <TableHeader className="bg-muted/40">
                                        <TableRow>
                                            <TableHead>Student ID</TableHead>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Program</TableHead>
                                            <TableHead>Section</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {members.length > 0 ? (
                                            members.map((member) => (
                                                <TableRow key={member.id}>
                                                    <TableCell>{member.studentId ?? "—"}</TableCell>
                                                    <TableCell>{member.name ?? "—"}</TableCell>
                                                    <TableCell>{member.program ?? "—"}</TableCell>
                                                    <TableCell>{member.section ?? "—"}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                                    No group members found.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-sm font-semibold">Defense Schedules ({schedules.length})</h2>
                            <div className="overflow-hidden rounded-lg border">
                                <Table>
                                    <TableHeader className="bg-muted/40">
                                        <TableRow>
                                            <TableHead>Schedule ID</TableHead>
                                            <TableHead>Scheduled At</TableHead>
                                            <TableHead>Room</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Rubric Template</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {schedules.length > 0 ? (
                                            schedules.map((schedule) => (
                                                <TableRow key={schedule.id}>
                                                    <TableCell>{schedule.id}</TableCell>
                                                    <TableCell>{formatDateTime(schedule.scheduledAt)}</TableCell>
                                                    <TableCell>{schedule.room ?? "—"}</TableCell>
                                                    <TableCell>{schedule.status ?? "—"}</TableCell>
                                                    <TableCell>{schedule.rubricTemplateId ?? "—"}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                                    No schedules found for this group.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </section>
                    </>
                ) : null}
            </div>
        </DashboardLayout>
    )
}
