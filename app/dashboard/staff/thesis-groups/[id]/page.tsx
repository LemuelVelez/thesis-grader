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
    adviser_id: string | null
    description: string | null
    created_at: string | null
    updated_at: string | null
}

type GroupMemberItem = {
    student_id: string
    name: string
    email: string | null
    program: string | null
    section: string | null
}

type GroupScheduleItem = {
    id: string
    scheduled_at: string | null
    room: string | null
    status: string
}

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

function toEpoch(value: string | null): number {
    if (!value) return 0
    const d = new Date(value)
    const ms = d.getTime()
    return Number.isNaN(ms) ? 0 : ms
}

function formatDateTime(value: string | null): string {
    if (!value) return "TBA"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function statusTone(status: string): string {
    const normalized = status.toLowerCase()

    if (normalized === "scheduled") {
        return "border-primary/40 bg-primary/10 text-foreground"
    }

    if (normalized === "ongoing") {
        return "border-amber-500/40 bg-amber-500/10 text-foreground"
    }

    if (normalized === "completed") {
        return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
    }

    if (normalized === "cancelled") {
        return "border-destructive/40 bg-destructive/10 text-destructive"
    }

    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

function extractRecordPayload(payload: unknown): Record<string, unknown> | null {
    if (!isRecord(payload)) return null

    if (isRecord(payload.item)) return extractRecordPayload(payload.item)
    if (isRecord(payload.data)) return extractRecordPayload(payload.data)
    if (isRecord(payload.result)) return extractRecordPayload(payload.result)

    return payload
}

function extractArrayPayload(payload: unknown, keys: string[]): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    for (const key of keys) {
        const value = payload[key]
        if (Array.isArray(value)) return value
    }

    const nestedKeys: Array<"item" | "data" | "result"> = ["item", "data", "result"]

    for (const key of nestedKeys) {
        const nested = payload[key]
        if (Array.isArray(nested) || isRecord(nested)) {
            const found = extractArrayPayload(nested, keys)
            if (found.length > 0) return found
        }
    }

    return []
}

function normalizeGroup(raw: unknown, fallbackId?: string): ThesisGroupDetail | null {
    if (!isRecord(raw)) return null

    const id =
        toStringSafe(raw.id) ??
        toStringSafe(raw.group_id) ??
        toStringSafe(raw.groupId) ??
        (fallbackId && fallbackId.trim().length > 0 ? fallbackId : null)

    if (!id) return null

    return {
        id,
        title:
            toStringSafe(raw.title) ??
            toStringSafe(raw.group_title) ??
            toStringSafe(raw.name) ??
            `Group ${id}`,
        program: toNullableString(raw.program),
        term: toNullableString(raw.term),
        adviser_id: toNullableString(raw.adviser_id ?? raw.advisor_id),
        description: toNullableString(raw.description),
        created_at: toNullableString(raw.created_at ?? raw.createdAt),
        updated_at: toNullableString(raw.updated_at ?? raw.updatedAt),
    }
}

function normalizeMember(raw: unknown): GroupMemberItem | null {
    if (!isRecord(raw)) return null

    const nestedStudent = isRecord(raw.student) ? raw.student : null

    const studentId =
        toStringSafe(raw.student_id) ??
        toStringSafe(raw.studentId) ??
        toStringSafe(raw.id) ??
        (nestedStudent ? toStringSafe(nestedStudent.id) : null)

    if (!studentId) return null

    const name =
        toStringSafe(raw.name) ??
        toStringSafe(raw.student_name) ??
        toStringSafe(raw.full_name) ??
        (nestedStudent
            ? toStringSafe(nestedStudent.name) ?? toStringSafe(nestedStudent.full_name)
            : null) ??
        "Unnamed Student"

    const email =
        toNullableString(raw.email) ??
        (nestedStudent ? toNullableString(nestedStudent.email) : null)

    const program =
        toNullableString(raw.program) ??
        toNullableString(raw.course) ??
        (nestedStudent ? toNullableString(nestedStudent.program) : null)

    const section =
        toNullableString(raw.section) ??
        toNullableString(raw.block) ??
        (nestedStudent ? toNullableString(nestedStudent.section) : null)

    return {
        student_id: studentId,
        name,
        email,
        program,
        section,
    }
}

function normalizeSchedule(raw: unknown): GroupScheduleItem | null {
    if (!isRecord(raw)) return null

    const id =
        toStringSafe(raw.id) ??
        toStringSafe(raw.schedule_id) ??
        toStringSafe(raw.scheduleId)

    if (!id) return null

    const status = toStringSafe(raw.status) ?? "scheduled"

    return {
        id,
        scheduled_at: toNullableString(raw.scheduled_at ?? raw.scheduledAt),
        room: toNullableString(raw.room),
        status,
    }
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

export default function StaffThesisGroupDetailsPage() {
    const params = useParams() as { id?: string | string[] }

    const groupId = React.useMemo(() => {
        const raw = params?.id
        if (Array.isArray(raw)) return raw[0] ?? ""
        return raw ?? ""
    }, [params])

    const [group, setGroup] = React.useState<ThesisGroupDetail | null>(null)
    const [members, setMembers] = React.useState<GroupMemberItem[]>([])
    const [schedules, setSchedules] = React.useState<GroupScheduleItem[]>([])

    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [groupEndpoint, setGroupEndpoint] = React.useState<string | null>(null)
    const [membersEndpoint, setMembersEndpoint] = React.useState<string | null>(null)
    const [schedulesEndpoint, setSchedulesEndpoint] = React.useState<string | null>(null)

    const loadDetails = React.useCallback(async () => {
        if (!groupId) {
            setLoading(false)
            setError("Missing thesis group ID.")
            return
        }

        setLoading(true)
        setError(null)

        const encodedId = encodeURIComponent(groupId)

        const groupCandidates = [
            `/api/staff/thesis-groups/${encodedId}`,
            `/api/thesis-groups/${encodedId}`,
            `/api/admin/thesis-groups/${encodedId}`,
            `/api/groups/${encodedId}`,
            `/api/admin/rankings/${encodedId}`,
        ]

        const memberCandidates = [
            `/api/staff/thesis-groups/${encodedId}/members`,
            `/api/thesis-groups/${encodedId}/members`,
            `/api/group-members?groupId=${encodedId}`,
        ]

        const scheduleCandidates = [
            `/api/staff/thesis-groups/${encodedId}/defense-schedules`,
            `/api/thesis-groups/${encodedId}/defense-schedules`,
            `/api/defense-schedules?groupId=${encodedId}`,
        ]

        let latestError = "Unable to load thesis group details."
        let groupLoaded = false
        let membersFromGroupPayload: GroupMemberItem[] = []
        let schedulesFromGroupPayload: GroupScheduleItem[] = []

        for (const endpoint of groupCandidates) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const root = extractRecordPayload(payload)
                if (!root) continue

                const normalizedGroup = normalizeGroup(root, groupId)
                if (!normalizedGroup) continue

                membersFromGroupPayload = extractArrayPayload(payload, [
                    "members",
                    "students",
                    "group_members",
                    "items",
                ])
                    .map(normalizeMember)
                    .filter((item): item is GroupMemberItem => item !== null)

                schedulesFromGroupPayload = extractArrayPayload(payload, [
                    "schedules",
                    "defense_schedules",
                    "items",
                ])
                    .map(normalizeSchedule)
                    .filter((item): item is GroupScheduleItem => item !== null)
                    .sort(
                        (a, b) => toEpoch(a.scheduled_at) - toEpoch(b.scheduled_at),
                    )

                setGroup(normalizedGroup)
                setMembers(membersFromGroupPayload)
                setSchedules(schedulesFromGroupPayload)
                setGroupEndpoint(endpoint)
                groupLoaded = true
                break
            } catch (err) {
                latestError =
                    err instanceof Error
                        ? err.message
                        : "Unable to load thesis group details."
            }
        }

        if (!groupLoaded) {
            setGroup(null)
            setMembers([])
            setSchedules([])
            setGroupEndpoint(null)
            setMembersEndpoint(null)
            setSchedulesEndpoint(null)
            setError(
                `${latestError} No group-details endpoint responded successfully.`,
            )
            setLoading(false)
            return
        }

        if (membersFromGroupPayload.length === 0) {
            for (const endpoint of memberCandidates) {
                try {
                    const res = await fetch(endpoint, { cache: "no-store" })
                    const payload = (await res.json().catch(() => null)) as unknown
                    if (!res.ok) continue

                    const parsed = extractArrayPayload(payload, [
                        "members",
                        "students",
                        "group_members",
                        "items",
                        "data",
                    ])
                        .map(normalizeMember)
                        .filter((item): item is GroupMemberItem => item !== null)

                    setMembers(parsed)
                    setMembersEndpoint(endpoint)
                    break
                } catch {
                    // ignore member endpoint errors
                }
            }
        } else {
            setMembersEndpoint(groupEndpoint)
        }

        if (schedulesFromGroupPayload.length === 0) {
            for (const endpoint of scheduleCandidates) {
                try {
                    const res = await fetch(endpoint, { cache: "no-store" })
                    const payload = (await res.json().catch(() => null)) as unknown
                    if (!res.ok) continue

                    const parsed = extractArrayPayload(payload, [
                        "schedules",
                        "defense_schedules",
                        "items",
                        "data",
                    ])
                        .map(normalizeSchedule)
                        .filter((item): item is GroupScheduleItem => item !== null)
                        .sort(
                            (a, b) => toEpoch(a.scheduled_at) - toEpoch(b.scheduled_at),
                        )

                    setSchedules(parsed)
                    setSchedulesEndpoint(endpoint)
                    break
                } catch {
                    // ignore schedule endpoint errors
                }
            }
        } else {
            setSchedulesEndpoint(groupEndpoint)
        }

        setLoading(false)
    }, [groupId, groupEndpoint])

    React.useEffect(() => {
        void loadDetails()
    }, [loadDetails])

    const effectiveTitle = group?.title ?? "Thesis Group Details"

    return (
        <DashboardLayout
            title={effectiveTitle}
            description="View thesis group profile, members, and defense schedule details."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                            <p className="text-sm font-medium">
                                Group ID:{" "}
                                <span className="font-semibold text-foreground">
                                    {group?.id ?? groupId}
                                </span>
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Open a group to review members and schedules in one view.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button asChild variant="outline">
                                <Link href="/dashboard/staff/thesis-groups">Back to Groups</Link>
                            </Button>
                            <Button variant="outline" onClick={() => void loadDetails()} disabled={loading}>
                                Refresh
                            </Button>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Program</p>
                            <p className="text-sm font-semibold">{group?.program ?? "—"}</p>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Term</p>
                            <p className="text-sm font-semibold">{group?.term ?? "—"}</p>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Adviser ID</p>
                            <p className="text-sm font-semibold">{group?.adviser_id ?? "Unassigned"}</p>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Members</p>
                            <p className="text-sm font-semibold">{members.length}</p>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Schedules</p>
                            <p className="text-sm font-semibold">{schedules.length}</p>
                        </div>
                    </div>

                    {group?.description ? (
                        <div className="mt-4 rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Description</p>
                            <p className="mt-1 text-sm">{group.description}</p>
                        </div>
                    ) : null}

                    <div className="mt-4 grid gap-1">
                        {groupEndpoint ? (
                            <p className="text-xs text-muted-foreground">Group source: {groupEndpoint}</p>
                        ) : null}
                        {membersEndpoint ? (
                            <p className="text-xs text-muted-foreground">Members source: {membersEndpoint}</p>
                        ) : null}
                        {schedulesEndpoint ? (
                            <p className="text-xs text-muted-foreground">Schedules source: {schedulesEndpoint}</p>
                        ) : null}
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                <div className="rounded-lg border bg-card">
                    <div className="border-b px-4 py-3">
                        <h2 className="text-sm font-semibold">Group Members</h2>
                        <p className="text-xs text-muted-foreground">
                            Student roster associated with this thesis group.
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="min-w-56">Student</TableHead>
                                    <TableHead className="min-w-56">Email</TableHead>
                                    <TableHead className="min-w-40">Program</TableHead>
                                    <TableHead className="min-w-32">Section</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 4 }).map((_, i) => (
                                        <TableRow key={`member-skeleton-${i}`}>
                                            <TableCell colSpan={4}>
                                                <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : members.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={4}
                                            className="h-20 text-center text-muted-foreground"
                                        >
                                            No members found for this group.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    members.map((member) => (
                                        <TableRow key={member.student_id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{member.name}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        ID: {member.student_id}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {member.email ?? "—"}
                                            </TableCell>
                                            <TableCell>{member.program ?? "—"}</TableCell>
                                            <TableCell>{member.section ?? "—"}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div className="rounded-lg border bg-card">
                    <div className="border-b px-4 py-3">
                        <h2 className="text-sm font-semibold">Defense Schedules</h2>
                        <p className="text-xs text-muted-foreground">
                            Upcoming and completed defense schedules associated with this group.
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="min-w-40">Schedule</TableHead>
                                    <TableHead className="min-w-48">Date & Time</TableHead>
                                    <TableHead className="min-w-36">Room</TableHead>
                                    <TableHead className="min-w-32">Status</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 4 }).map((_, i) => (
                                        <TableRow key={`schedule-skeleton-${i}`}>
                                            <TableCell colSpan={4}>
                                                <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : schedules.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={4}
                                            className="h-20 text-center text-muted-foreground"
                                        >
                                            No defense schedules found for this group.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    schedules.map((schedule) => (
                                        <TableRow key={schedule.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{schedule.id}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        Group ID: {group?.id ?? groupId}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {formatDateTime(schedule.scheduled_at)}
                                            </TableCell>
                                            <TableCell>{schedule.room ?? "TBA"}</TableCell>
                                            <TableCell>
                                                <span
                                                    className={[
                                                        "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                        statusTone(schedule.status),
                                                    ].join(" ")}
                                                >
                                                    {toTitleCase(schedule.status)}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
