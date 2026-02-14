"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { MoreHorizontal, Plus } from "lucide-react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
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
    manualAdviserInfo: string | null
    createdAt: string | null
    updatedAt: string | null
}

type StaffUserItem = {
    id: string
    name: string
    email: string | null
    status: string | null
}

type StudentUserItem = {
    id: string
    name: string
    email: string | null
    status: string | null
    program: string | null
    section: string | null
}

type GroupMemberItem = {
    id: string
    memberId: string | null
    linkedUserId: string | null
    studentId: string | null
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

type FetchResult = {
    endpoint: string
    payload: unknown | null
    status: number
}

type MemberDialogMode = "create" | "edit"
type MemberSource = "student" | "manual"

type MemberFormState = {
    source: MemberSource
    studentUserId: string
    manualStudentId: string
    name: string
    program: string
    section: string
}

const MEMBER_SOURCE_STUDENT: MemberSource = "student"
const MEMBER_SOURCE_MANUAL: MemberSource = "manual"
const STUDENT_NONE_VALUE = "__none_student__"

const STAFF_LIST_ENDPOINTS = [
    "/api/staff",
    `/api/users?where=${encodeURIComponent(JSON.stringify({ role: "staff" }))}`,
    "/api/users?role=staff",
    "/api/users",
    "/api/admin/users",
] as const

const STUDENT_LIST_ENDPOINTS = [
    "/api/students",
    `/api/users?where=${encodeURIComponent(JSON.stringify({ role: "student" }))}`,
    "/api/users?role=student",
    "/api/users",
    "/api/admin/users",
] as const

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

function toNullableTrimmed(value: string): string | null {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function isUuidLike(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.trim()
    )
}

function generateUuid(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID()
    }

    const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
    return template.replace(/[xy]/g, (char) => {
        const rand = Math.floor(Math.random() * 16)
        const value = char === "x" ? rand : (rand & 0x3) | 0x8
        return value.toString(16)
    })
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

function extractRoleLower(rec: Record<string, unknown>): string | null {
    const direct = toStringOrNull(rec.role ?? rec.user_role ?? rec.userRole)
    if (direct) return direct.toLowerCase()

    const userRec = asRecord(rec.user)
    const nested = userRec ? toStringOrNull(userRec.role ?? userRec.user_role) : null
    if (nested) return nested.toLowerCase()

    return null
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
    const manualAdviserInfo = toStringOrNull(
        rec.manual_adviser_info ??
        rec.manualAdviserInfo ??
        rec.adviser_name ??
        rec.adviserName ??
        rec.adviser
    )
    const createdAt = toStringOrNull(rec.created_at ?? rec.createdAt)
    const updatedAt = toStringOrNull(rec.updated_at ?? rec.updatedAt)

    return {
        id,
        title,
        program,
        term,
        adviserId,
        manualAdviserInfo,
        createdAt,
        updatedAt,
    }
}

function normalizeStaffUser(raw: unknown): StaffUserItem | null {
    const rec = asRecord(raw)
    if (!rec) return null

    const id = toStringOrNull(rec.id ?? rec.user_id)
    if (!id) return null

    const role = extractRoleLower(rec)
    if (role && role !== "staff") return null

    const name = toStringOrNull(rec.name ?? rec.full_name) ?? "Unnamed Staff"

    return {
        id,
        name,
        email: toStringOrNull(rec.email),
        status: toStringOrNull(rec.status),
    }
}

function normalizeStudentUser(raw: unknown): StudentUserItem | null {
    const rec = asRecord(raw)
    if (!rec) return null

    const id = toStringOrNull(rec.id ?? rec.user_id)
    if (!id) return null

    const role = extractRoleLower(rec)
    if (role && role !== "student") return null

    const name = toStringOrNull(rec.name ?? rec.full_name) ?? "Unnamed Student"

    return {
        id,
        name,
        email: toStringOrNull(rec.email),
        status: toStringOrNull(rec.status),
        program: toStringOrNull(rec.program ?? rec.course),
        section: toStringOrNull(rec.section),
    }
}

function normalizeMember(raw: unknown): GroupMemberItem | null {
    const rec = asRecord(raw)
    if (!rec) return null

    const memberId = toStringOrNull(rec.member_id ?? rec.memberId ?? rec.id)
    const linkedUserId = toStringOrNull(
        rec.user_id ?? rec.userId ?? rec.student_user_id ?? rec.studentUserId
    )
    const studentId = toStringOrNull(
        rec.student_no ??
        rec.studentNo ??
        rec.student_id ??
        rec.studentId ??
        linkedUserId
    )

    const id = memberId ?? linkedUserId ?? studentId
    if (!id) return null

    return {
        id,
        memberId,
        linkedUserId,
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

function sortMembers(items: GroupMemberItem[]): GroupMemberItem[] {
    return [...items].sort((a, b) => {
        const nameA = (a.name ?? "").trim()
        const nameB = (b.name ?? "").trim()

        if (nameA && nameB) {
            const byName = nameA.localeCompare(nameB, "en", { sensitivity: "base" })
            if (byName !== 0) return byName
        }

        const sidA = (a.studentId ?? a.id).toLowerCase()
        const sidB = (b.studentId ?? b.id).toLowerCase()
        return sidA.localeCompare(sidB)
    })
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
    const map = new Map<string, T>()
    for (const item of items) {
        if (!map.has(item.id)) {
            map.set(item.id, item)
            continue
        }

        const prev = map.get(item.id)!
        map.set(item.id, { ...prev, ...item })
    }
    return [...map.values()]
}

function isDisabledStatus(status: string | null): boolean {
    return (status ?? "").trim().toLowerCase() === "disabled"
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

function parseResponseBodySafe(res: Response): Promise<unknown | null> {
    return res.text().then((text) => {
        if (!text) return null
        try {
            return JSON.parse(text) as unknown
        } catch {
            return { message: text }
        }
    })
}

function extractErrorMessage(payload: unknown, fallback: string): string {
    const rec = asRecord(payload)
    if (!rec) return fallback
    const error = toStringOrNull(rec.error)
    if (error) return error
    const message = toStringOrNull(rec.message)
    if (message) return message
    return fallback
}

async function fetchFirstAvailableJson(
    endpoints: readonly string[],
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

            const payload = await parseResponseBodySafe(res)

            if (!res.ok) {
                const message = extractErrorMessage(payload, `${endpoint} returned ${res.status}`)
                lastError = new Error(message)
                continue
            }

            return payload
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

async function fetchAllSuccessfulJson(
    endpoints: readonly string[],
    signal: AbortSignal
): Promise<FetchResult[]> {
    const results: FetchResult[] = []
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

            if (res.status === 404 || res.status === 405) continue

            const payload = await parseResponseBodySafe(res)

            if (!res.ok) {
                lastError = new Error(extractErrorMessage(payload, `${endpoint} returned ${res.status}`))
                continue
            }

            results.push({
                endpoint,
                payload,
                status: res.status,
            })
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") throw error
            lastError = error instanceof Error ? error : new Error("Request failed")
        }
    }

    if (results.length === 0 && lastError) throw lastError
    return results
}

async function requestFirstAvailable(
    endpoints: readonly string[],
    init: RequestInit
): Promise<FetchResult> {
    let lastError: Error | null = null

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, {
                ...init,
                credentials: "include",
                cache: "no-store",
                headers: {
                    Accept: "application/json",
                    ...(init.headers ?? {}),
                },
            })

            if (res.status === 404 || res.status === 405) continue

            const payload = await parseResponseBodySafe(res)

            if (!res.ok) {
                lastError = new Error(extractErrorMessage(payload, `${endpoint} returned ${res.status}`))
                continue
            }

            return {
                endpoint,
                payload,
                status: res.status,
            }
        } catch (error) {
            lastError = error instanceof Error ? error : new Error("Request failed")
        }
    }

    if (lastError) throw lastError
    throw new Error("No compatible thesis group member endpoint found for this action.")
}

function defaultMemberForm(source: MemberSource, selectedStudentId: string): MemberFormState {
    return {
        source,
        studentUserId: selectedStudentId,
        manualStudentId: "",
        name: "",
        program: "",
        section: "",
    }
}

export default function AdminThesisGroupDetailsPage() {
    const params = useParams<{ id: string | string[] }>()
    const groupId = React.useMemo(() => {
        const raw = params?.id
        if (Array.isArray(raw)) return raw[0] ?? ""
        return raw ?? ""
    }, [params])

    const [group, setGroup] = React.useState<ThesisGroupDetail | null>(null)
    const [staffUsers, setStaffUsers] = React.useState<StaffUserItem[]>([])
    const [studentUsers, setStudentUsers] = React.useState<StudentUserItem[]>([])
    const [members, setMembers] = React.useState<GroupMemberItem[]>([])
    const [schedules, setSchedules] = React.useState<DefenseScheduleItem[]>([])

    const [loading, setLoading] = React.useState<boolean>(true)
    const [staffLoading, setStaffLoading] = React.useState<boolean>(true)
    const [studentsLoading, setStudentsLoading] = React.useState<boolean>(true)

    const [error, setError] = React.useState<string | null>(null)
    const [staffError, setStaffError] = React.useState<string | null>(null)
    const [studentsError, setStudentsError] = React.useState<string | null>(null)

    const [refreshKey, setRefreshKey] = React.useState<number>(0)

    const [memberDialogOpen, setMemberDialogOpen] = React.useState(false)
    const [memberDialogMode, setMemberDialogMode] = React.useState<MemberDialogMode>("create")
    const [memberTarget, setMemberTarget] = React.useState<GroupMemberItem | null>(null)
    const [memberSubmitting, setMemberSubmitting] = React.useState(false)
    const [memberActionError, setMemberActionError] = React.useState<string | null>(null)

    const [deleteMemberOpen, setDeleteMemberOpen] = React.useState(false)
    const [deleteMemberTarget, setDeleteMemberTarget] = React.useState<GroupMemberItem | null>(null)

    const [memberForm, setMemberForm] = React.useState<MemberFormState>(() =>
        defaultMemberForm(MEMBER_SOURCE_MANUAL, STUDENT_NONE_VALUE)
    )

    const staffById = React.useMemo(() => {
        const map = new Map<string, StaffUserItem>()
        for (const item of staffUsers) map.set(item.id, item)
        return map
    }, [staffUsers])

    const studentsById = React.useMemo(() => {
        const map = new Map<string, StudentUserItem>()
        for (const item of studentUsers) map.set(item.id, item)
        return map
    }, [studentUsers])

    const studentIdsAlreadyUsed = React.useMemo(() => {
        const set = new Set<string>()
        for (const member of members) {
            if (member.linkedUserId) set.add(member.linkedUserId)
            if (member.studentId && studentsById.has(member.studentId)) set.add(member.studentId)
        }
        return set
    }, [members, studentsById])

    const currentEditStudentUserId = React.useMemo(() => {
        if (!memberTarget) return null
        if (memberTarget.linkedUserId) return memberTarget.linkedUserId
        if (memberTarget.studentId && studentsById.has(memberTarget.studentId)) {
            return memberTarget.studentId
        }
        return null
    }, [memberTarget, studentsById])

    const availableStudentsForCreate = React.useMemo(() => {
        return studentUsers.filter(
            (student) => !studentIdsAlreadyUsed.has(student.id) && !isDisabledStatus(student.status)
        )
    }, [studentIdsAlreadyUsed, studentUsers])

    const availableStudentsForEdit = React.useMemo(() => {
        return studentUsers.filter((student) => {
            const isCurrent = currentEditStudentUserId === student.id
            const usedByOther = studentIdsAlreadyUsed.has(student.id) && !isCurrent
            if (usedByOther) return false
            if (isDisabledStatus(student.status) && !isCurrent) return false
            return true
        })
    }, [currentEditStudentUserId, studentIdsAlreadyUsed, studentUsers])

    const availableStudentsForDialog =
        memberDialogMode === "edit" ? availableStudentsForEdit : availableStudentsForCreate

    const manualEntryForced = availableStudentsForDialog.length === 0

    const canShowManualOption =
        manualEntryForced ||
        memberForm.source === MEMBER_SOURCE_MANUAL ||
        (memberDialogMode === "edit" &&
            memberTarget !== null &&
            (currentEditStudentUserId === null || memberForm.source === MEMBER_SOURCE_MANUAL))

    const selectedStudentMissing =
        memberForm.source === MEMBER_SOURCE_STUDENT &&
        memberForm.studentUserId !== STUDENT_NONE_VALUE &&
        !availableStudentsForDialog.some((item) => item.id === memberForm.studentUserId)

    const editableStudentIds = React.useMemo(() => {
        const set = new Set(studentIdsAlreadyUsed)
        if (currentEditStudentUserId) set.delete(currentEditStudentUserId)
        return set
    }, [currentEditStudentUserId, studentIdsAlreadyUsed])

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
                    setMembers(sortMembers(embeddedMembers))
                } else {
                    const membersPayload = await fetchFirstAvailableJson(memberEndpoints(groupId), signal)
                    const memberItems = unwrapItems(membersPayload)
                        .map(normalizeMember)
                        .filter((m): m is GroupMemberItem => m !== null)
                    setMembers(sortMembers(memberItems))
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
                const message =
                    e instanceof Error ? e.message : "Failed to load thesis group details."
                setGroup(null)
                setMembers([])
                setSchedules([])
                setError(message)
                toast.error(message)
            } finally {
                setLoading(false)
            }
        },
        [groupId]
    )

    const refreshMembersOnly = React.useCallback(async () => {
        if (!groupId) return
        try {
            const controller = new AbortController()
            const payload = await fetchFirstAvailableJson(memberEndpoints(groupId), controller.signal)
            const items = unwrapItems(payload)
                .map(normalizeMember)
                .filter((item): item is GroupMemberItem => item !== null)
            setMembers(sortMembers(items))
        } catch (e) {
            const message =
                e instanceof Error ? e.message : "Failed to refresh thesis group members."
            toast.error(message)
        }
    }, [groupId])

    const loadStaffUsers = React.useCallback(async (signal: AbortSignal) => {
        setStaffLoading(true)
        setStaffError(null)

        try {
            const results = await fetchAllSuccessfulJson(STAFF_LIST_ENDPOINTS, signal)

            if (results.length === 0) {
                setStaffUsers([])
                setStaffError(
                    "No compatible staff endpoint found. Adviser profile preview is unavailable."
                )
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
        } catch (e) {
            if (e instanceof Error && e.name === "AbortError") return
            const message =
                e instanceof Error
                    ? e.message
                    : "Failed to load staff users for adviser preview."
            setStaffUsers([])
            setStaffError(message)
            toast.error(message)
        } finally {
            setStaffLoading(false)
        }
    }, [])

    const loadStudentUsers = React.useCallback(async (signal: AbortSignal) => {
        setStudentsLoading(true)
        setStudentsError(null)

        try {
            const results = await fetchAllSuccessfulJson(STUDENT_LIST_ENDPOINTS, signal)

            if (results.length === 0) {
                setStudentUsers([])
                setStudentsError(
                    "No compatible student endpoint found. Member form will allow manual entry."
                )
                return
            }

            const items = results
                .flatMap((result) => unwrapItems(result.payload))
                .map(normalizeStudentUser)
                .filter((item): item is StudentUserItem => item !== null)

            const merged = dedupeById(items).sort((a, b) =>
                a.name.localeCompare(b.name, "en", { sensitivity: "base" })
            )

            setStudentUsers(merged)

            if (merged.length === 0) {
                setStudentsError(
                    "No student users were returned from available endpoints. You may add members manually."
                )
            }
        } catch (e) {
            if (e instanceof Error && e.name === "AbortError") return
            const message =
                e instanceof Error
                    ? e.message
                    : "Failed to load student users for member assignment."
            setStudentUsers([])
            setStudentsError(message)
            toast.error(message)
        } finally {
            setStudentsLoading(false)
        }
    }, [])

    React.useEffect(() => {
        const controller = new AbortController()
        void load(controller.signal)
        void loadStaffUsers(controller.signal)
        void loadStudentUsers(controller.signal)
        return () => controller.abort()
    }, [load, loadStaffUsers, loadStudentUsers, refreshKey])

    React.useEffect(() => {
        if (!memberDialogOpen) return
        if (memberForm.source !== MEMBER_SOURCE_STUDENT) return

        if (manualEntryForced) {
            setMemberForm((prev) => ({
                ...prev,
                source: MEMBER_SOURCE_MANUAL,
                studentUserId: STUDENT_NONE_VALUE,
            }))
            return
        }

        const exists = availableStudentsForDialog.some(
            (student) => student.id === memberForm.studentUserId
        )
        if (exists) return

        const firstStudent = availableStudentsForDialog[0]?.id ?? STUDENT_NONE_VALUE
        setMemberForm((prev) => ({ ...prev, studentUserId: firstStudent }))
    }, [
        availableStudentsForDialog,
        manualEntryForced,
        memberDialogOpen,
        memberForm.source,
        memberForm.studentUserId,
    ])

    const adviserContent = React.useMemo(() => {
        if (!group?.adviserId) {
            if (group?.manualAdviserInfo) {
                return (
                    <div className="space-y-1">
                        <Badge variant="outline">Manual Adviser</Badge>
                        <p className="text-sm">{group.manualAdviserInfo}</p>
                    </div>
                )
            }

            return <span className="text-muted-foreground">Not assigned</span>
        }

        const staff = staffById.get(group.adviserId)
        if (!staff) {
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
                <div className="font-medium">{staff.name}</div>
                {staff.email ? (
                    <div className="text-xs text-muted-foreground">{staff.email}</div>
                ) : null}
            </div>
        )
    }, [group?.adviserId, group?.manualAdviserInfo, staffById, staffLoading])

    const resetCreateMemberForm = React.useCallback(() => {
        const firstStudentId = availableStudentsForCreate[0]?.id ?? STUDENT_NONE_VALUE
        setMemberForm({
            source: availableStudentsForCreate.length > 0 ? MEMBER_SOURCE_STUDENT : MEMBER_SOURCE_MANUAL,
            studentUserId: firstStudentId,
            manualStudentId: "",
            name: "",
            program: group?.program ?? "",
            section: "",
        })
    }, [availableStudentsForCreate, group?.program])

    const openCreateMemberDialog = React.useCallback(() => {
        setMemberDialogMode("create")
        setMemberTarget(null)
        resetCreateMemberForm()
        setMemberActionError(null)
        setMemberDialogOpen(true)
    }, [resetCreateMemberForm])

    const openEditMemberDialog = React.useCallback(
        (member: GroupMemberItem) => {
            const linkedId =
                member.linkedUserId ??
                (member.studentId && studentsById.has(member.studentId) ? member.studentId : null)

            const fallbackStudentId = availableStudentsForEdit[0]?.id ?? STUDENT_NONE_VALUE

            const source: MemberSource = linkedId ? MEMBER_SOURCE_STUDENT : MEMBER_SOURCE_MANUAL
            const selectedStudentId = linkedId ?? fallbackStudentId

            setMemberDialogMode("edit")
            setMemberTarget(member)
            setMemberForm({
                source,
                studentUserId: selectedStudentId,
                manualStudentId: member.studentId ?? "",
                name: member.name ?? "",
                program: member.program ?? group?.program ?? "",
                section: member.section ?? "",
            })
            setMemberActionError(null)
            setMemberDialogOpen(true)
        },
        [availableStudentsForEdit, group?.program, studentsById]
    )

    const openDeleteMemberDialog = React.useCallback((member: GroupMemberItem) => {
        setDeleteMemberTarget(member)
        setMemberActionError(null)
        setDeleteMemberOpen(true)
    }, [])

    const onMemberSubmit = React.useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault()

            if (!groupId) {
                const message = "Invalid thesis group id."
                setMemberActionError(message)
                toast.error(message)
                return
            }

            setMemberSubmitting(true)
            setMemberActionError(null)

            try {
                let payload: Record<string, unknown> = {}
                let manualUuidWasGenerated = false

                if (memberForm.source === MEMBER_SOURCE_STUDENT) {
                    const selectedId =
                        memberForm.studentUserId === STUDENT_NONE_VALUE ? null : memberForm.studentUserId

                    if (!selectedId) {
                        throw new Error("Please select a student user.")
                    }

                    const selected = studentsById.get(selectedId)
                    if (!selected) {
                        throw new Error("Selected student user is no longer available.")
                    }

                    if (memberDialogMode === "create" && studentIdsAlreadyUsed.has(selected.id)) {
                        throw new Error("Selected student is already a member of this thesis group.")
                    }

                    if (
                        memberDialogMode === "edit" &&
                        editableStudentIds.has(selected.id) &&
                        selected.id !== currentEditStudentUserId
                    ) {
                        throw new Error("Selected student is already assigned to this thesis group.")
                    }

                    payload = {
                        user_id: selected.id,
                        userId: selected.id,
                        student_user_id: selected.id,
                        studentUserId: selected.id,
                        student_id: selected.id,
                        studentId: selected.id,
                        name: selected.name,
                        program:
                            toNullableTrimmed(memberForm.program) ??
                            toNullableTrimmed(selected.program ?? "") ??
                            null,
                        section:
                            toNullableTrimmed(memberForm.section) ??
                            toNullableTrimmed(selected.section ?? "") ??
                            null,
                    }
                } else {
                    const manualStudentIdInput = toNullableTrimmed(memberForm.manualStudentId)
                    const manualName = toNullableTrimmed(memberForm.name)
                    const manualProgram = toNullableTrimmed(memberForm.program)
                    const manualSection = toNullableTrimmed(memberForm.section)

                    if (!manualStudentIdInput && !manualName) {
                        throw new Error("Provide at least Student ID or Student Name for manual entry.")
                    }

                    const manualUuid =
                        manualStudentIdInput && isUuidLike(manualStudentIdInput)
                            ? manualStudentIdInput
                            : generateUuid()

                    manualUuidWasGenerated = !manualStudentIdInput || !isUuidLike(manualStudentIdInput)

                    payload = {
                        student_id: manualUuid,
                        studentId: manualUuid,
                        ...(manualStudentIdInput
                            ? {
                                student_no: manualStudentIdInput,
                                studentNo: manualStudentIdInput,
                            }
                            : {}),
                        name: manualName,
                        program: manualProgram,
                        section: manualSection,
                    }
                }

                if (memberDialogMode === "create") {
                    const result = await requestFirstAvailable(memberEndpoints(groupId), {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    })

                    const created = normalizeMember(unwrapDetail(result.payload))

                    if (created) {
                        setMembers((prev) => sortMembers([created, ...prev.filter((item) => item.id !== created.id)]))
                    } else {
                        await refreshMembersOnly()
                    }

                    if (memberForm.source === MEMBER_SOURCE_MANUAL && manualUuidWasGenerated) {
                        toast.success("Member added successfully.", {
                            description:
                                "Manual entry saved with an auto-generated UUID for API compatibility.",
                        })
                    } else {
                        toast.success("Member added successfully.")
                    }
                } else {
                    if (!memberTarget) throw new Error("No member selected for editing.")

                    const identifier =
                        memberTarget.memberId ??
                        memberTarget.linkedUserId ??
                        memberTarget.studentId ??
                        memberTarget.id

                    if (!identifier) throw new Error("Unable to resolve member identifier for update.")

                    const endpoints = memberEndpoints(groupId).map(
                        (base) => `${base}/${encodeURIComponent(identifier)}`
                    )

                    const result = await requestFirstAvailable(endpoints, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    })

                    const updated = normalizeMember(unwrapDetail(result.payload))

                    if (updated) {
                        setMembers((prev) => {
                            const withoutTarget = prev.filter((item) => item.id !== memberTarget.id)
                            return sortMembers([updated, ...withoutTarget.filter((item) => item.id !== updated.id)])
                        })
                    } else {
                        await refreshMembersOnly()
                    }

                    if (memberForm.source === MEMBER_SOURCE_MANUAL && manualUuidWasGenerated) {
                        toast.success("Member updated successfully.", {
                            description:
                                "Manual entry was normalized with an auto-generated UUID for API compatibility.",
                        })
                    } else {
                        toast.success("Member updated successfully.")
                    }
                }

                setMemberDialogOpen(false)
                setMemberTarget(null)
            } catch (e) {
                const message = e instanceof Error ? e.message : "Failed to save member."
                setMemberActionError(message)
                toast.error(message)
            } finally {
                setMemberSubmitting(false)
            }
        },
        [
            currentEditStudentUserId,
            editableStudentIds,
            groupId,
            memberDialogMode,
            memberForm,
            memberTarget,
            refreshMembersOnly,
            studentIdsAlreadyUsed,
            studentsById,
        ]
    )

    const onDeleteMemberConfirm = React.useCallback(async () => {
        if (!deleteMemberTarget || !groupId) return

        setMemberSubmitting(true)
        setMemberActionError(null)

        try {
            const identifier =
                deleteMemberTarget.memberId ??
                deleteMemberTarget.linkedUserId ??
                deleteMemberTarget.studentId ??
                deleteMemberTarget.id

            if (!identifier) {
                throw new Error("Unable to resolve member identifier for delete.")
            }

            const endpoints = memberEndpoints(groupId).map(
                (base) => `${base}/${encodeURIComponent(identifier)}`
            )

            await requestFirstAvailable(endpoints, { method: "DELETE" })

            setMembers((prev) => prev.filter((item) => item.id !== deleteMemberTarget.id))
            setDeleteMemberOpen(false)
            setDeleteMemberTarget(null)
            toast.success("Member removed successfully.")
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to remove member."
            setMemberActionError(message)
            toast.error(message)
        } finally {
            setMemberSubmitting(false)
        }
    }, [deleteMemberTarget, groupId])

    const memberDialogTitle = memberDialogMode === "create" ? "Add Thesis Group Member" : "Edit Thesis Group Member"
    const memberDialogDescription =
        memberDialogMode === "create"
            ? "Add a member by selecting an existing Student user. Manual entries automatically receive a system UUID when needed."
            : "Update member details. Student-user linked members can be reassigned if available. Manual entries are UUID-safe."

    return (
        <DashboardLayout
            title={group ? `Thesis Group: ${group.title}` : "Thesis Group Details"}
            description="View thesis group profile, members, defense schedules, and assigned staff adviser."
        >
            <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline">
                        <Link href="/dashboard/admin/thesis-groups">Back to Thesis Groups</Link>
                    </Button>

                    <Button
                        onClick={() => setRefreshKey((v) => v + 1)}
                        disabled={loading || staffLoading || studentsLoading}
                    >
                        {loading || staffLoading || studentsLoading ? "Refreshing..." : "Refresh"}
                    </Button>
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

                {studentsError ? (
                    <Alert>
                        <AlertDescription>{studentsError}</AlertDescription>
                    </Alert>
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
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h2 className="text-sm font-semibold">Members ({members.length})</h2>

                                <div className="flex items-center gap-2">
                                    <Badge variant="outline">
                                        {studentsLoading
                                            ? "Loading students..."
                                            : `Available students: ${availableStudentsForCreate.length}`}
                                    </Badge>

                                    <Button onClick={openCreateMemberDialog} size="sm">
                                        <Plus className="mr-2 size-4" />
                                        Add Member
                                    </Button>
                                </div>
                            </div>

                            <div className="overflow-hidden rounded-lg border">
                                <Table>
                                    <TableHeader className="bg-muted/40">
                                        <TableRow>
                                            <TableHead>Student ID</TableHead>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Program</TableHead>
                                            <TableHead>Section</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
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
                                                    <TableCell className="text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" aria-label="Member actions">
                                                                    <MoreHorizontal className="size-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-40">
                                                                <DropdownMenuItem onClick={() => openEditMemberDialog(member)}>
                                                                    Edit
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    className="text-destructive focus:text-destructive"
                                                                    onClick={() => openDeleteMemberDialog(member)}
                                                                >
                                                                    Delete
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
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

            <Dialog
                open={memberDialogOpen}
                onOpenChange={(open) => {
                    if (!memberSubmitting) setMemberDialogOpen(open)
                    if (!open) {
                        setMemberTarget(null)
                        setMemberActionError(null)
                    }
                }}
            >
                <DialogContent className="sm:max-w-xl max-h-[82vh] p-0">
                    <ScrollArea className="max-h-[82vh]">
                        <div className="p-6">
                            <DialogHeader>
                                <DialogTitle>{memberDialogTitle}</DialogTitle>
                                <DialogDescription>{memberDialogDescription}</DialogDescription>
                            </DialogHeader>

                            <form onSubmit={onMemberSubmit} className="mt-4 space-y-4">
                                {memberActionError ? (
                                    <Alert variant="destructive">
                                        <AlertDescription>{memberActionError}</AlertDescription>
                                    </Alert>
                                ) : null}

                                <div className="space-y-2">
                                    <Label>Entry Mode</Label>
                                    <Select
                                        value={memberForm.source}
                                        onValueChange={(value) => {
                                            const next = value as MemberSource
                                            if (next === MEMBER_SOURCE_MANUAL && !canShowManualOption) return
                                            if (next === MEMBER_SOURCE_STUDENT && manualEntryForced) return

                                            setMemberForm((prev) => ({
                                                ...prev,
                                                source: next,
                                                studentUserId:
                                                    next === MEMBER_SOURCE_STUDENT
                                                        ? prev.studentUserId !== STUDENT_NONE_VALUE
                                                            ? prev.studentUserId
                                                            : availableStudentsForDialog[0]?.id ?? STUDENT_NONE_VALUE
                                                        : STUDENT_NONE_VALUE,
                                            }))
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select entry mode" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={MEMBER_SOURCE_STUDENT} disabled={manualEntryForced}>
                                                Select existing student user
                                            </SelectItem>
                                            <SelectItem value={MEMBER_SOURCE_MANUAL} disabled={!canShowManualOption}>
                                                Manual student entry
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>

                                    {manualEntryForced ? (
                                        <p className="text-xs text-amber-600">
                                            No available student users right now. Manual entry is enabled.
                                        </p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            Choose a student user for direct assignment. Manual entry is available when needed.
                                        </p>
                                    )}
                                </div>

                                {memberForm.source === MEMBER_SOURCE_STUDENT ? (
                                    <>
                                        <div className="space-y-2">
                                            <Label>Student User</Label>
                                            <Select
                                                value={memberForm.studentUserId}
                                                onValueChange={(value) =>
                                                    setMemberForm((prev) => ({ ...prev, studentUserId: value }))
                                                }
                                                disabled={studentsLoading || availableStudentsForDialog.length === 0}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue
                                                        placeholder={
                                                            studentsLoading
                                                                ? "Loading student users..."
                                                                : "Select a student user"
                                                        }
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {selectedStudentMissing ? (
                                                        <SelectItem value={memberForm.studentUserId}>
                                                            Current linked student (profile unavailable)
                                                        </SelectItem>
                                                    ) : null}

                                                    {availableStudentsForDialog.map((student) => {
                                                        const label = student.email
                                                            ? `${student.name} (${student.email})`
                                                            : student.name

                                                        return (
                                                            <SelectItem key={`student-option-${student.id}`} value={student.id}>
                                                                {label}
                                                            </SelectItem>
                                                        )
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="member-program">Program (Optional)</Label>
                                                <Input
                                                    id="member-program"
                                                    value={memberForm.program}
                                                    onChange={(event) =>
                                                        setMemberForm((prev) => ({
                                                            ...prev,
                                                            program: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="e.g., BSIT"
                                                    autoComplete="off"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="member-section">Section (Optional)</Label>
                                                <Input
                                                    id="member-section"
                                                    value={memberForm.section}
                                                    onChange={(event) =>
                                                        setMemberForm((prev) => ({
                                                            ...prev,
                                                            section: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="e.g., 4A"
                                                    autoComplete="off"
                                                />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <Alert>
                                            <AlertDescription>
                                                You can enter any Student ID format. The system will auto-generate a valid UUID in
                                                the background when needed.
                                            </AlertDescription>
                                        </Alert>

                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="manual-student-id">Student ID / School ID (Optional)</Label>
                                                <Input
                                                    id="manual-student-id"
                                                    value={memberForm.manualStudentId}
                                                    onChange={(event) =>
                                                        setMemberForm((prev) => ({
                                                            ...prev,
                                                            manualStudentId: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="e.g., 2022-00001"
                                                    autoComplete="off"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="manual-student-name">Student Name (Optional)</Label>
                                                <Input
                                                    id="manual-student-name"
                                                    value={memberForm.name}
                                                    onChange={(event) =>
                                                        setMemberForm((prev) => ({
                                                            ...prev,
                                                            name: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="e.g., Juan Dela Cruz"
                                                    autoComplete="off"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="manual-program">Program (Optional)</Label>
                                                <Input
                                                    id="manual-program"
                                                    value={memberForm.program}
                                                    onChange={(event) =>
                                                        setMemberForm((prev) => ({
                                                            ...prev,
                                                            program: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="e.g., BSIT"
                                                    autoComplete="off"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="manual-section">Section (Optional)</Label>
                                                <Input
                                                    id="manual-section"
                                                    value={memberForm.section}
                                                    onChange={(event) =>
                                                        setMemberForm((prev) => ({
                                                            ...prev,
                                                            section: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="e.g., 4A"
                                                    autoComplete="off"
                                                />
                                            </div>
                                        </div>

                                        <p className="text-xs text-muted-foreground">
                                            For manual entry, provide at least Student ID or Student Name. UUID mapping is handled automatically.
                                        </p>
                                    </>
                                )}

                                <DialogFooter>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setMemberDialogOpen(false)}
                                        disabled={memberSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={memberSubmitting}>
                                        {memberSubmitting
                                            ? memberDialogMode === "create"
                                                ? "Adding..."
                                                : "Saving..."
                                            : memberDialogMode === "create"
                                                ? "Add Member"
                                                : "Save Changes"}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={deleteMemberOpen}
                onOpenChange={(open) => {
                    if (!memberSubmitting) setDeleteMemberOpen(open)
                    if (!open) {
                        setDeleteMemberTarget(null)
                        setMemberActionError(null)
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete thesis group member?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone.{" "}
                            {deleteMemberTarget ? (
                                <>
                                    You are deleting{" "}
                                    <span className="font-medium">
                                        {deleteMemberTarget.name ?? deleteMemberTarget.studentId ?? "this member"}
                                    </span>
                                    .
                                </>
                            ) : null}
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {memberActionError ? (
                        <Alert variant="destructive">
                            <AlertDescription>{memberActionError}</AlertDescription>
                        </Alert>
                    ) : null}

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={memberSubmitting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                event.preventDefault()
                                void onDeleteMemberConfirm()
                            }}
                            disabled={memberSubmitting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {memberSubmitting ? "Deleting..." : "Delete Member"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DashboardLayout>
    )
}
