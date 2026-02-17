"use client"

import * as React from "react"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { fetchFirstAvailableJson as fetchFirstAvailableGroupJson } from "@/components/thesis-groups/thesis-group-api"
import {
    LIST_ENDPOINTS,
    normalizeGroup as normalizeGroupList,
    sortNewest,
    unwrapItem,
    unwrapItems as unwrapListItems,
    type ThesisGroupListItem,
} from "@/components/thesis-groups/thesis-group-utils"
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
    formatDateTime,
    normalizeGroup as normalizeGroupDetail,
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
    fetchFirstAvailableJson as fetchFirstAvailableDetailJson,
    parseResponseBodySafe,
} from "@/components/thesis-groups/thesis-group-details-service"
import {
    STAFF_LIST_ENDPOINTS,
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

type StudentGroupResolution = {
    group: ThesisGroupDetail
    members: GroupMemberItem[]
    schedules: DefenseScheduleItem[]
    source: string
}

const ME_ENDPOINTS = ["/api/auth/me", "/api/me", "/api/users/me", "/api/user/me"] as const

const DIRECT_STUDENT_GROUP_ENDPOINTS = [
    "/api/student/thesis-group",
    "/api/student/thesis-group/me",
    "/api/student/thesis-groups/me",
    "/api/me/thesis-group",
    "/api/thesis-group/me",
] as const

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

function toDetailGroup(item: ThesisGroupListItem): ThesisGroupDetail {
    return {
        id: item.id,
        title: item.title,
        program: item.program,
        term: item.term,
        adviserId: item.adviserId,
        manualAdviserInfo: item.manualAdviserInfo,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    }
}

function isOwnedByViewer(member: GroupMemberItem, viewer: Viewer | null): boolean {
    if (!viewer) return false

    const viewerId = (viewer.id ?? "").trim().toLowerCase()
    const viewerEmail = (viewer.email ?? "").trim().toLowerCase()

    const linkedUserId = (member.linkedUserId ?? "").trim().toLowerCase()
    const studentId = (member.studentId ?? "").trim().toLowerCase()

    if (viewerId && linkedUserId && viewerId === linkedUserId) return true
    if (viewerId && studentId && viewerId === studentId) return true
    if (viewerEmail && studentId && viewerEmail === studentId) return true

    return false
}

function sortSchedules(items: DefenseScheduleItem[]): DefenseScheduleItem[] {
    return [...items].sort((a, b) => {
        const ta = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0
        const tb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0
        return ta - tb
    })
}

async function fetchMembersForGroup(groupId: string, signal: AbortSignal): Promise<GroupMemberItem[]> {
    try {
        const payload = await fetchFirstAvailableDetailJson(memberEndpoints(groupId), signal)
        return sortMembers(
            unwrapItems(payload)
                .map(normalizeMember)
                .filter((item): item is GroupMemberItem => item !== null)
        )
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error
        return []
    }
}

async function fetchSchedulesForGroup(groupId: string, signal: AbortSignal): Promise<DefenseScheduleItem[]> {
    try {
        const payload = await fetchFirstAvailableDetailJson(scheduleEndpoints(groupId), signal)
        return sortSchedules(
            unwrapItems(payload)
                .map(normalizeSchedule)
                .filter((item): item is DefenseScheduleItem => item !== null)
        )
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error
        return []
    }
}

async function fetchAdviserById(adviserId: string, signal: AbortSignal): Promise<StaffUserItem | null> {
    try {
        const results = await fetchAllSuccessfulJson(STAFF_LIST_ENDPOINTS, signal)
        const staff = results
            .flatMap((result) => unwrapItems(result.payload))
            .map(normalizeStaffUser)
            .filter((item): item is StaffUserItem => item !== null)

        return staff.find((item) => item.id === adviserId) ?? null
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error
        return null
    }
}

async function tryDirectStudentGroup(signal: AbortSignal): Promise<StudentGroupResolution | null> {
    for (const endpoint of DIRECT_STUDENT_GROUP_ENDPOINTS) {
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

            const payloadRec = asRecord(payload)
            let candidateRaw: unknown = unwrapDetail(payload)
            let parsedGroup = normalizeGroupDetail(candidateRaw)

            if (!parsedGroup && payloadRec?.group) {
                candidateRaw = payloadRec.group
                parsedGroup = normalizeGroupDetail(candidateRaw)
            }

            if (!parsedGroup) {
                const firstGroup = unwrapListItems(payload)
                    .map(normalizeGroupDetail)
                    .find((item): item is ThesisGroupDetail => item !== null)
                if (firstGroup) parsedGroup = firstGroup
            }

            if (!parsedGroup) continue

            const candidateRec = asRecord(candidateRaw) ?? asRecord(unwrapDetail(payload))

            const embeddedMembers = unwrapItems(
                candidateRec?.members ??
                candidateRec?.group_members ??
                candidateRec?.groupMembers ??
                []
            )
                .map(normalizeMember)
                .filter((item): item is GroupMemberItem => item !== null)

            const embeddedSchedules = unwrapItems(
                candidateRec?.defense_schedules ??
                candidateRec?.schedules ??
                []
            )
                .map(normalizeSchedule)
                .filter((item): item is DefenseScheduleItem => item !== null)

            return {
                group: parsedGroup,
                members: sortMembers(embeddedMembers),
                schedules: sortSchedules(embeddedSchedules),
                source: endpoint,
            }
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") throw error
        }
    }

    return null
}

export default function StudentThesisGroupPage() {
    const [viewer, setViewer] = React.useState<Viewer | null>(null)
    const [group, setGroup] = React.useState<ThesisGroupDetail | null>(null)
    const [members, setMembers] = React.useState<GroupMemberItem[]>([])
    const [schedules, setSchedules] = React.useState<DefenseScheduleItem[]>([])
    const [adviser, setAdviser] = React.useState<StaffUserItem | null>(null)

    const [loading, setLoading] = React.useState<boolean>(true)
    const [error, setError] = React.useState<string | null>(null)
    const [discoveryNote, setDiscoveryNote] = React.useState<string | null>(null)
    const [refreshKey, setRefreshKey] = React.useState<number>(0)

    const load = React.useCallback(async (signal: AbortSignal) => {
        setLoading(true)
        setError(null)
        setDiscoveryNote(null)

        try {
            const viewerSnapshot = await fetchViewer(signal)
            if (!signal.aborted) setViewer(viewerSnapshot)

            if (!viewerSnapshot?.id && !viewerSnapshot?.email) {
                setGroup(null)
                setMembers([])
                setSchedules([])
                setAdviser(null)
                setError("Unable to identify the signed-in student account.")
                return
            }

            let resolvedGroup: ThesisGroupDetail | null = null
            let resolvedMembers: GroupMemberItem[] = []
            let resolvedSchedules: DefenseScheduleItem[] = []
            let resolvedSource: string | null = null

            const directResult = await tryDirectStudentGroup(signal)

            if (directResult) {
                resolvedGroup = directResult.group
                resolvedMembers = directResult.members
                resolvedSchedules = directResult.schedules
                resolvedSource = `Loaded from ${directResult.source}.`

                if (resolvedMembers.length === 0) {
                    resolvedMembers = await fetchMembersForGroup(directResult.group.id, signal)
                }

                if (resolvedSchedules.length === 0) {
                    resolvedSchedules = await fetchSchedulesForGroup(directResult.group.id, signal)
                }
            } else {
                const listResult = await fetchFirstAvailableGroupJson(LIST_ENDPOINTS, signal)

                if (!listResult) {
                    setGroup(null)
                    setMembers([])
                    setSchedules([])
                    setAdviser(null)
                    setError(
                        "No compatible thesis-group API endpoint found. Wire one of: /api/thesis-groups or /api/admin/thesis-groups."
                    )
                    return
                }

                const candidates = sortNewest(
                    unwrapListItems(listResult.payload)
                        .map(normalizeGroupList)
                        .filter((item): item is ThesisGroupListItem => item !== null)
                )

                for (const candidate of candidates) {
                    const candidateMembers = await fetchMembersForGroup(candidate.id, signal)
                    const mine = candidateMembers.some((member) => isOwnedByViewer(member, viewerSnapshot))
                    if (!mine) continue

                    resolvedGroup = toDetailGroup(candidate)
                    resolvedMembers = candidateMembers
                    resolvedSchedules = await fetchSchedulesForGroup(candidate.id, signal)
                    resolvedSource = "Resolved from thesis-group membership scan."
                    break
                }
            }

            if (!resolvedGroup) {
                setGroup(null)
                setMembers([])
                setSchedules([])
                setAdviser(null)
                setDiscoveryNote("No thesis group is currently linked to your account.")
                return
            }

            setGroup(resolvedGroup)
            setMembers(sortMembers(resolvedMembers))
            setSchedules(sortSchedules(resolvedSchedules))
            setDiscoveryNote(resolvedSource)

            if (resolvedGroup.adviserId) {
                const adviserProfile = await fetchAdviserById(resolvedGroup.adviserId, signal)
                setAdviser(adviserProfile)
            } else {
                setAdviser(null)
            }
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") return
            const message = error instanceof Error ? error.message : "Failed to load your thesis-group record."
            setGroup(null)
            setMembers([])
            setSchedules([])
            setAdviser(null)
            setError(message)
            toast.error(message)
        } finally {
            if (!signal.aborted) setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        const controller = new AbortController()
        void load(controller.signal)
        return () => controller.abort()
    }, [load, refreshKey])

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

        if (adviser) {
            return (
                <div className="space-y-0.5 leading-tight">
                    <div className="font-medium">{adviser.name}</div>
                    {adviser.email ? <div className="text-xs text-muted-foreground">{adviser.email}</div> : null}
                </div>
            )
        }

        return (
            <div className="space-y-1">
                <Badge variant="outline">Assigned Staff Adviser</Badge>
                <p className="text-xs text-muted-foreground">
                    Adviser profile details are temporarily unavailable.
                </p>
            </div>
        )
    }, [adviser, group?.adviserId, group?.manualAdviserInfo])

    return (
        <DashboardLayout
            title={group ? `My Thesis Group: ${group.title}` : "My Thesis Group"}
            description="Track your thesis-group profile, member list, and defense schedule in one place."
        >
            <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setRefreshKey((value) => value + 1)}
                        disabled={loading}
                    >
                        <RefreshCw className="mr-2 size-4" />
                        {loading ? "Refreshing..." : "Refresh"}
                    </Button>

                    <Badge variant="outline">Members: {members.length}</Badge>
                    <Badge variant="outline">Schedules: {schedules.length}</Badge>

                    {discoveryNote ? <Badge variant="secondary">{discoveryNote}</Badge> : null}
                </div>

                {error ? (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                {!error && !loading && !group ? (
                    <Alert>
                        <AlertDescription>
                            No thesis group is currently linked to your student account yet.
                        </AlertDescription>
                    </Alert>
                ) : null}

                {loading ? (
                    <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                        Loading your thesis-group record...
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
                                            <TableCell className="w-44 font-medium">Group ID</TableCell>
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
                                            members.map((member) => {
                                                const mine = isOwnedByViewer(member, viewer)

                                                return (
                                                    <TableRow key={member.id}>
                                                        <TableCell>{member.studentId ?? "—"}</TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <span>{member.name ?? "—"}</span>
                                                                {mine ? <Badge variant="secondary">You</Badge> : null}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>{member.program ?? "—"}</TableCell>
                                                        <TableCell>{member.section ?? "—"}</TableCell>
                                                    </TableRow>
                                                )
                                            })
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                                    No members found for this group.
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
                                                    No defense schedules found yet.
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
