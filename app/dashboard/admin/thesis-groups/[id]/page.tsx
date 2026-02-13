"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type ThesisGroupDetail = {
    id: string
    title: string
    program: string | null
    term: string | null
    adviserId: string | null
    createdAt: string | null
    updatedAt: string | null
}

type GroupMemberItem = {
    studentId: string
    name: string | null
    program: string | null
    section: string | null
}

type DefenseScheduleItem = {
    id: string
    scheduledAt: string | null
    room: string | null
    status: string | null
    rubricTemplateId: string | null
}

function detailEndpoints(id: string): string[] {
    return [
        `/api/thesis-groups/${id}`,
        `/api/admin/thesis-groups/${id}`,
        `/api/thesis/groups/${id}`,
        `/api/admin/thesis/groups/${id}`,
    ]
}

function memberEndpoints(id: string): string[] {
    return [
        `/api/thesis-groups/${id}/members`,
        `/api/admin/thesis-groups/${id}/members`,
        `/api/thesis/groups/${id}/members`,
        `/api/admin/thesis/groups/${id}/members`,
    ]
}

function scheduleEndpoints(id: string): string[] {
    return [
        `/api/thesis-groups/${id}/schedules`,
        `/api/admin/thesis-groups/${id}/schedules`,
        `/api/thesis/groups/${id}/schedules`,
        `/api/admin/thesis/groups/${id}/schedules`,
    ]
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

function toStringOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function unwrapItems(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload

    const rec = asRecord(payload)
    if (!rec) return []

    const items = rec.items
    if (Array.isArray(items)) return items

    const data = rec.data
    if (Array.isArray(data)) return data

    const members = rec.members
    if (Array.isArray(members)) return members

    const schedules = rec.schedules
    if (Array.isArray(schedules)) return schedules

    return []
}

function unwrapDetail(payload: unknown): unknown {
    const rec = asRecord(payload)
    if (!rec) return payload

    if (asRecord(rec.item)) return rec.item
    if (asRecord(rec.data)) return rec.data

    return rec
}

function normalizeGroup(raw: unknown): ThesisGroupDetail | null {
    const rec = asRecord(raw)
    if (!rec) return null

    const id = toStringOrNull(rec.id ?? rec.group_id)
    if (!id) return null

    const title = toStringOrNull(rec.title ?? rec.group_title) ?? `Group ${id.slice(0, 8)}`
    const program = toStringOrNull(rec.program)
    const term = toStringOrNull(rec.term)
    const adviserId = toStringOrNull(rec.adviser_id ?? rec.adviserId)
    const createdAt = toStringOrNull(rec.created_at ?? rec.createdAt)
    const updatedAt = toStringOrNull(rec.updated_at ?? rec.updatedAt)

    return {
        id,
        title,
        program,
        term,
        adviserId,
        createdAt,
        updatedAt,
    }
}

function normalizeMember(raw: unknown): GroupMemberItem | null {
    const rec = asRecord(raw)
    if (!rec) return null

    const studentId = toStringOrNull(rec.student_id ?? rec.user_id ?? rec.id)
    if (!studentId) return null

    return {
        studentId,
        name: toStringOrNull(rec.name ?? rec.student_name ?? rec.full_name),
        program: toStringOrNull(rec.program),
        section: toStringOrNull(rec.section),
    }
}

function normalizeSchedule(raw: unknown): DefenseScheduleItem | null {
    const rec = asRecord(raw)
    if (!rec) return null

    const id = toStringOrNull(rec.id ?? rec.schedule_id)
    if (!id) return null

    return {
        id,
        scheduledAt: toStringOrNull(rec.scheduled_at ?? rec.scheduledAt),
        room: toStringOrNull(rec.room),
        status: toStringOrNull(rec.status),
        rubricTemplateId: toStringOrNull(rec.rubric_template_id ?? rec.rubricTemplateId),
    }
}

function formatDateTime(value: string | null): string {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(d)
}

async function fetchFirstAvailableJson(
    endpoints: string[],
    signal: AbortSignal
): Promise<unknown | null> {
    let lastError: Error | null = null

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, {
                method: "GET",
                credentials: "include",
                cache: "no-store",
                headers: {
                    Accept: "application/json",
                },
                signal,
            })

            if (res.status === 404 || res.status === 405) {
                continue
            }

            if (!res.ok) {
                lastError = new Error(`${endpoint} returned ${res.status}`)
                continue
            }

            return (await res.json()) as unknown
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw error
            }
            lastError = error instanceof Error ? error : new Error("Request failed")
        }
    }

    if (lastError) throw lastError
    return null
}

export default function AdminThesisGroupDetailsPage() {
    const params = useParams<{ id: string | string[] }>()
    const groupId = React.useMemo(() => {
        const raw = params?.id
        if (Array.isArray(raw)) return raw[0] ?? ""
        return raw ?? ""
    }, [params])

    const [group, setGroup] = React.useState<ThesisGroupDetail | null>(null)
    const [members, setMembers] = React.useState<GroupMemberItem[]>([])
    const [schedules, setSchedules] = React.useState<DefenseScheduleItem[]>([])
    const [loading, setLoading] = React.useState<boolean>(true)
    const [error, setError] = React.useState<string | null>(null)
    const [refreshKey, setRefreshKey] = React.useState<number>(0)

    const load = React.useCallback(
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
                const detailPayload = await fetchFirstAvailableJson(detailEndpoints(groupId), signal)

                if (!detailPayload) {
                    setGroup(null)
                    setMembers([])
                    setSchedules([])
                    setError(
                        "No compatible thesis-group detail endpoint found. Wire one of: /api/thesis-groups/:id or /api/admin/thesis-groups/:id."
                    )
                    setLoading(false)
                    return
                }

                const rawDetail = unwrapDetail(detailPayload)
                const parsedGroup = normalizeGroup(rawDetail)

                if (!parsedGroup) {
                    setGroup(null)
                    setMembers([])
                    setSchedules([])
                    setError("Group record was returned, but with an invalid shape.")
                    setLoading(false)
                    return
                }

                setGroup(parsedGroup)

                const detailRec = asRecord(rawDetail)

                const embeddedMembers = detailRec
                    ? unwrapItems(detailRec.members)
                        .map(normalizeMember)
                        .filter((m): m is GroupMemberItem => m !== null)
                    : []

                const embeddedSchedules = detailRec
                    ? unwrapItems(detailRec.defense_schedules ?? detailRec.schedules)
                        .map(normalizeSchedule)
                        .filter((s): s is DefenseScheduleItem => s !== null)
                    : []

                if (embeddedMembers.length > 0) {
                    setMembers(embeddedMembers)
                } else {
                    const membersPayload = await fetchFirstAvailableJson(memberEndpoints(groupId), signal)
                    const memberItems = unwrapItems(membersPayload)
                        .map(normalizeMember)
                        .filter((m): m is GroupMemberItem => m !== null)
                    setMembers(memberItems)
                }

                if (embeddedSchedules.length > 0) {
                    setSchedules(embeddedSchedules)
                } else {
                    const schedulesPayload = await fetchFirstAvailableJson(
                        scheduleEndpoints(groupId),
                        signal
                    )
                    const scheduleItems = unwrapItems(schedulesPayload)
                        .map(normalizeSchedule)
                        .filter((s): s is DefenseScheduleItem => s !== null)
                    setSchedules(scheduleItems)
                }
            } catch (e) {
                if (e instanceof Error && e.name === "AbortError") return
                setGroup(null)
                setMembers([])
                setSchedules([])
                setError(e instanceof Error ? e.message : "Failed to load thesis group details.")
            } finally {
                setLoading(false)
            }
        },
        [groupId]
    )

    React.useEffect(() => {
        const controller = new AbortController()
        void load(controller.signal)
        return () => controller.abort()
    }, [load, refreshKey])

    return (
        <DashboardLayout
            title={group ? `Thesis Group: ${group.title}` : "Thesis Group Details"}
            description="View thesis group profile, members, and defense schedules."
        >
            <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline">
                        <Link href="/dashboard/admin/thesis-groups">Back to Thesis Groups</Link>
                    </Button>

                    <Button onClick={() => setRefreshKey((v) => v + 1)} disabled={loading}>
                        {loading ? "Refreshing..." : "Refresh"}
                    </Button>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                {!group && loading ? (
                    <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                        Loading thesis group details...
                    </div>
                ) : null}

                {!group && !loading ? (
                    <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                        No group data found for this record.
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
                                            <TableCell className="font-medium">Adviser ID</TableCell>
                                            <TableCell>{group.adviserId ?? "—"}</TableCell>
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
                                                <TableRow key={member.studentId}>
                                                    <TableCell>{member.studentId}</TableCell>
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
