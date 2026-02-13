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

type ThesisGroupMember = {
    student_id: string | null
    name: string | null
    email: string | null
    program: string | null
    section: string | null
}

type ThesisGroupItem = {
    id: string
    title: string
    adviser_id: string | null
    adviser_name: string | null
    program: string | null
    term: string | null
    created_at: string | null
    updated_at: string | null
    members: ThesisGroupMember[]
}

const GROUP_ENDPOINT_CANDIDATES = [
    "/api/student/thesis-group/me",
    "/api/student/thesis-group",
    "/api/thesis-groups/my",
    "/api/thesis-groups/me",
    "/api/thesis-groups",
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

function formatDateTime(value: string | null): string {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload.groups)) return payload.groups

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

function getNestedRecord(input: Record<string, unknown>, key: string): Record<string, unknown> | null {
    const value = input[key]
    return isRecord(value) ? value : null
}

function normalizeMember(raw: unknown): ThesisGroupMember | null {
    if (!isRecord(raw)) return null

    const source = getNestedRecord(raw, "member") ?? raw
    const user = getNestedRecord(source, "user")
    const student = getNestedRecord(source, "student")

    const student_id =
        toNullableString(
            source.student_id ??
            source.studentId ??
            source.user_id ??
            source.userId ??
            source.id ??
            student?.user_id ??
            user?.id,
        ) ?? null

    const name =
        toNullableString(
            source.name ??
            source.student_name ??
            source.studentName ??
            user?.name ??
            student?.name,
        ) ?? null

    const email =
        toNullableString(source.email ?? source.student_email ?? source.studentEmail ?? user?.email) ?? null

    const program =
        toNullableString(source.program ?? student?.program) ?? null

    const section =
        toNullableString(source.section ?? student?.section) ?? null

    if (!student_id && !name && !email) return null

    return {
        student_id,
        name,
        email,
        program,
        section,
    }
}

function normalizeGroup(raw: unknown): ThesisGroupItem | null {
    if (!isRecord(raw)) return null

    const source = getNestedRecord(raw, "group") ?? raw
    const adviser = getNestedRecord(source, "adviser")

    const id = toStringSafe(source.id ?? source.group_id ?? source.groupId)
    if (!id) return null

    const title =
        toStringSafe(
            source.title ?? source.group_title ?? source.groupTitle ?? source.name,
        ) ?? "Untitled Thesis Group"

    const memberArrays: unknown[] = [
        source.members,
        source.group_members,
        source.groupMembers,
        raw.members,
        raw.group_members,
        raw.groupMembers,
    ]

    const members: ThesisGroupMember[] = memberArrays
        .filter((candidate): candidate is unknown[] => Array.isArray(candidate))
        .flatMap((arr) => arr.map(normalizeMember).filter((item): item is ThesisGroupMember => item !== null))

    return {
        id,
        title,
        adviser_id: toNullableString(source.adviser_id ?? source.adviserId ?? adviser?.id),
        adviser_name: toNullableString(source.adviser_name ?? source.adviserName ?? adviser?.name),
        program: toNullableString(source.program),
        term: toNullableString(source.term),
        created_at: toNullableString(source.created_at ?? source.createdAt),
        updated_at: toNullableString(source.updated_at ?? source.updatedAt),
        members,
    }
}

function extractGroupPayload(payload: unknown): { group: ThesisGroupItem | null; members: ThesisGroupMember[] } {
    if (Array.isArray(payload)) {
        const group = normalizeGroup(payload[0])
        return { group, members: group?.members ?? [] }
    }

    if (!isRecord(payload)) {
        return { group: null, members: [] }
    }

    const data = getNestedRecord(payload, "data")
    const result = getNestedRecord(payload, "result")

    const groupCandidates: unknown[] = [
        payload.item,
        payload.group,
        payload.thesis_group,
        data?.item,
        data?.group,
        data?.thesis_group,
        result?.item,
        result?.group,
        result?.thesis_group,
    ]

    for (const candidate of groupCandidates) {
        const parsed = normalizeGroup(candidate)
        if (parsed) {
            return { group: parsed, members: parsed.members }
        }
    }

    const groupsFromArray = extractArrayPayload(payload).map(normalizeGroup).filter((item): item is ThesisGroupItem => item !== null)
    if (groupsFromArray.length > 0) {
        return { group: groupsFromArray[0], members: groupsFromArray[0].members }
    }

    const memberArrays: unknown[] = [
        payload.members,
        payload.group_members,
        payload.groupMembers,
        data?.members,
        data?.group_members,
        data?.groupMembers,
        result?.members,
        result?.group_members,
        result?.groupMembers,
    ]

    const members = memberArrays
        .filter((candidate): candidate is unknown[] => Array.isArray(candidate))
        .flatMap((arr) => arr.map(normalizeMember).filter((item): item is ThesisGroupMember => item !== null))

    return { group: null, members }
}

async function readErrorMessage(res: Response, payload: unknown): Promise<string> {
    if (isRecord(payload)) {
        const message = toStringSafe(payload.error) ?? toStringSafe(payload.message)
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

export default function StudentThesisGroupPage() {
    const [group, setGroup] = React.useState<ThesisGroupItem | null>(null)
    const [members, setMembers] = React.useState<ThesisGroupMember[]>([])

    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [source, setSource] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")

    const loadGroup = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        let latestError = "Unable to load thesis group data."
        let loaded = false

        for (const endpoint of GROUP_ENDPOINT_CANDIDATES) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    latestError = await readErrorMessage(res, payload)
                    continue
                }

                const parsed = extractGroupPayload(payload)

                if (!parsed.group && parsed.members.length === 0) {
                    continue
                }

                setGroup(parsed.group)
                setMembers(parsed.group?.members.length ? parsed.group.members : parsed.members)
                setSource(endpoint)
                loaded = true
                break
            } catch (err) {
                latestError = err instanceof Error ? err.message : "Unable to load thesis group data."
            }
        }

        if (!loaded) {
            setGroup(null)
            setMembers([])
            setSource(null)
            setError(`${latestError} No thesis-group endpoint responded successfully.`)
        }

        setLoading(false)
    }, [])

    React.useEffect(() => {
        void loadGroup()
    }, [loadGroup])

    const filteredMembers = React.useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return members

        return members.filter((member) => {
            const fields = [
                member.student_id ?? "",
                member.name ?? "",
                member.email ?? "",
                member.program ?? "",
                member.section ?? "",
            ]
            return fields.some((field) => field.toLowerCase().includes(q))
        })
    }, [members, search])

    return (
        <DashboardLayout
            title="Thesis Group"
            description="View your assigned thesis group, adviser, and members."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                            <p className="text-sm font-medium">My Group Overview</p>
                            <p className="text-xs text-muted-foreground">
                                {source ? `Data source: ${source}` : "No data source detected yet."}
                            </p>
                        </div>

                        <Button variant="outline" onClick={() => void loadGroup()} disabled={loading}>
                            Refresh
                        </Button>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Group ID</p>
                            <p className="text-sm font-semibold">{group?.id ?? "—"}</p>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Group Title</p>
                            <p className="text-sm font-semibold">{group?.title ?? "—"}</p>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Program / Term</p>
                            <p className="text-sm font-semibold">
                                {[group?.program ?? "—", group?.term ?? "—"].join(" • ")}
                            </p>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Adviser</p>
                            <p className="text-sm font-semibold">{group?.adviser_name ?? group?.adviser_id ?? "—"}</p>
                        </div>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Created</p>
                            <p className="text-sm">{formatDateTime(group?.created_at ?? null)}</p>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Updated</p>
                            <p className="text-sm">{formatDateTime(group?.updated_at ?? null)}</p>
                        </div>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                <div className="rounded-lg border bg-card p-4">
                    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-sm font-medium">Group Members</p>
                            <p className="text-xs text-muted-foreground">
                                Showing <span className="font-semibold text-foreground">{filteredMembers.length}</span> of{" "}
                                <span className="font-semibold text-foreground">{members.length}</span> member(s)
                            </p>
                        </div>

                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search member ID, name, email, program, section"
                            className="w-full md:max-w-sm"
                        />
                    </div>

                    <div className="overflow-x-auto rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="min-w-40">Student ID</TableHead>
                                    <TableHead className="min-w-48">Name</TableHead>
                                    <TableHead className="min-w-52">Email</TableHead>
                                    <TableHead className="min-w-36">Program</TableHead>
                                    <TableHead className="min-w-28">Section</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={`group-member-skeleton-${i}`}>
                                            <TableCell colSpan={5}>
                                                <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredMembers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                                            No group members found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredMembers.map((member, index) => (
                                        <TableRow key={`${member.student_id ?? "member"}-${index}`}>
                                            <TableCell className="font-medium">{member.student_id ?? "—"}</TableCell>
                                            <TableCell>{member.name ?? "—"}</TableCell>
                                            <TableCell>{member.email ?? "—"}</TableCell>
                                            <TableCell>{member.program ?? "—"}</TableCell>
                                            <TableCell>{member.section ?? "—"}</TableCell>
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
