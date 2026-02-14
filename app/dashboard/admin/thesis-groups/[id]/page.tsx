/* eslint-disable @typescript-eslint/no-explicit-any */
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

type StudentProfileProvisionAttempt = {
    endpoint: string
    method: "PATCH" | "POST"
    body: Record<string, unknown>
}

type MemberDialogMode = "create" | "edit"

type MemberFormState = {
    studentUserId: string
    program: string
    section: string
}

type UserStatus = "active" | "disabled"

const STUDENT_NONE_VALUE = "__none_student__"
const CREATE_USER_STATUSES: UserStatus[] = ["active", "disabled"]

const STAFF_LIST_ENDPOINTS = [
    "/api/staff",
    `/api/users?where=${encodeURIComponent(JSON.stringify({ role: "staff" }))}`,
    "/api/users?role=staff",
    "/api/users",
] as const

const STUDENT_LIST_ENDPOINTS = [
    "/api/student",
    `/api/users?where=${encodeURIComponent(JSON.stringify({ role: "student" }))}`,
    "/api/users?role=student",
    "/api/users",
] as const

function detailEndpoints(id: string): string[] {
    return [
        `/api/admin/thesis-groups/${id}`,
        `/api/admin/thesis/groups/${id}`,
        `/api/thesis-groups/${id}`,
        `/api/thesis/groups/${id}`,
    ]
}

function memberEndpoints(id: string): string[] {
    return [
        `/api/admin/thesis-groups/${id}/members`,
        `/api/admin/thesis/groups/${id}/members`,
        `/api/thesis-groups/${id}/members`,
        `/api/thesis/groups/${id}/members`,
    ]
}

function scheduleEndpoints(id: string): string[] {
    return [
        `/api/admin/thesis-groups/${id}/schedules`,
        `/api/admin/thesis/groups/${id}/schedules`,
        `/api/thesis-groups/${id}/schedules`,
        `/api/thesis/groups/${id}/schedules`,
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

function toTitleCase(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) return value
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/**
 * Guarantees non-empty values for Radix/Shadcn Select components.
 * Empty string is invalid for <SelectItem value="...">.
 */
function sanitizeStudentSelectValue(value: string | null | undefined): string {
    const trimmed = (value ?? "").trim()
    return trimmed.length > 0 ? trimmed : STUDENT_NONE_VALUE
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

function extractRoleLowerFromPayload(payload: unknown): string | null {
    const detailRec = asRecord(unwrapDetail(payload))
    if (!detailRec) return null
    return extractRoleLower(detailRec)
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

    const explicitUserId = toStringOrNull(
        rec.user_id ??
        rec.userId ??
        rec.student_user_id ??
        rec.studentUserId ??
        rec.linked_user_id ??
        rec.linkedUserId
    )
    const fallbackId = toStringOrNull(rec.id ?? rec.auth_user_id ?? rec.authUserId)
    const id = explicitUserId ?? fallbackId
    if (!id) return null

    const role = extractRoleLower(rec)
    if (role && role !== "student") return null
    if (!role && !explicitUserId) return null

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
    const linkedUserId = toStringOrNull(rec.user_id ?? rec.userId ?? rec.student_user_id ?? rec.studentUserId)
    const studentId = toStringOrNull(
        rec.student_no ?? rec.studentNo ?? rec.student_id ?? rec.studentId ?? linkedUserId
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

function isGenericFailureMessage(value: string): boolean {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return false
    if (normalized === "internal server error.") return true
    return /^failed to [a-z0-9\s-]+\.$/.test(normalized)
}

function isMissingStudentProfileError(message: string): boolean {
    return /does not have a student profile record/i.test(message)
}

function extractErrorMessage(payload: unknown, fallback: string, status?: number): string {
    const rec = asRecord(payload)
    if (!rec) return fallback

    const error = toStringOrNull(rec.error)
    const message = toStringOrNull(rec.message)

    if (
        message &&
        (status === 500 || status === 502 || status === 503 || status === 504 || !error || isGenericFailureMessage(error))
    ) {
        return message
    }

    if (error) return error
    if (message) return message
    return fallback
}

async function fetchFirstAvailableJson(endpoints: readonly string[], signal: AbortSignal): Promise<unknown | null> {
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
                const message = extractErrorMessage(payload, `${endpoint} returned ${res.status}`, res.status)
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

async function fetchAllSuccessfulJson(endpoints: readonly string[], signal: AbortSignal): Promise<FetchResult[]> {
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
                lastError = new Error(extractErrorMessage(payload, `${endpoint} returned ${res.status}`, res.status))
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

/**
 * IMPORTANT for UX:
 * - We only fallback on route-shape incompatibility (404/405).
 * - For validation/auth/server errors on a compatible route, stop immediately
 *   so we don't spam multiple POST/PATCH/DELETE attempts.
 */
async function requestFirstAvailable(endpoints: readonly string[], init: RequestInit): Promise<FetchResult> {
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
                throw new Error(extractErrorMessage(payload, `${endpoint} returned ${res.status}`, res.status))
            }

            return {
                endpoint,
                payload,
                status: res.status,
            }
        } catch (error) {
            lastError = error instanceof Error ? error : new Error("Request failed")
            break
        }
    }

    if (lastError) throw lastError
    throw new Error("No compatible thesis group member endpoint found for this action.")
}

function defaultMemberForm(selectedStudentId: string): MemberFormState {
    return {
        studentUserId: sanitizeStudentSelectValue(selectedStudentId),
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
        defaultMemberForm(STUDENT_NONE_VALUE)
    )

    const [createStudentOpen, setCreateStudentOpen] = React.useState(false)
    const [creatingStudentUser, setCreatingStudentUser] = React.useState(false)
    const [createStudentError, setCreateStudentError] = React.useState<string | null>(null)
    const [createStudentName, setCreateStudentName] = React.useState("")
    const [createStudentEmail, setCreateStudentEmail] = React.useState("")
    const [createStudentStatus, setCreateStudentStatus] = React.useState<UserStatus>("active")

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

    const normalizedMemberSelectValue = React.useMemo(
        () => sanitizeStudentSelectValue(memberForm.studentUserId),
        [memberForm.studentUserId]
    )

    const selectedStudentMissing =
        normalizedMemberSelectValue !== STUDENT_NONE_VALUE &&
        !availableStudentsForDialog.some((item) => item.id === normalizedMemberSelectValue)

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
                    const schedulesPayload = await fetchFirstAvailableJson(scheduleEndpoints(groupId), signal)
                    const scheduleItems = unwrapItems(schedulesPayload)
                        .map(normalizeSchedule)
                        .filter((s): s is DefenseScheduleItem => s !== null)
                    setSchedules(scheduleItems)
                }
            } catch (e) {
                if (e instanceof Error && e.name === "AbortError") return
                const message = e instanceof Error ? e.message : "Failed to load thesis group details."
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
            const message = e instanceof Error ? e.message : "Failed to refresh thesis group members."
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
                setStaffError("No compatible staff endpoint found. Adviser profile preview is unavailable.")
                return
            }

            const items = results
                .flatMap((result) => unwrapItems(result.payload))
                .map(normalizeStaffUser)
                .filter((item): item is StaffUserItem => item !== null)

            const merged = dedupeById(items).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))

            setStaffUsers(merged)

            if (merged.length === 0) {
                setStaffError("No staff users were returned from the available endpoints.")
            }
        } catch (e) {
            if (e instanceof Error && e.name === "AbortError") return
            const message = e instanceof Error ? e.message : "Failed to load staff users for adviser preview."
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
                setStudentsError("No compatible student endpoint found. Create a Student user to add members.")
                return
            }

            const items = results
                .flatMap((result) => unwrapItems(result.payload))
                .map(normalizeStudentUser)
                .filter((item): item is StudentUserItem => item !== null)

            const merged = dedupeById(items).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))

            setStudentUsers(merged)

            if (merged.length === 0) {
                setStudentsError("No student users were returned from available endpoints. Create a Student user to continue.")
            }
        } catch (e) {
            if (e instanceof Error && e.name === "AbortError") return
            const message = e instanceof Error ? e.message : "Failed to load student users for member assignment."
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
        if (memberForm.studentUserId === normalizedMemberSelectValue) return
        setMemberForm((prev) => ({ ...prev, studentUserId: normalizedMemberSelectValue }))
    }, [memberForm.studentUserId, normalizedMemberSelectValue])

    React.useEffect(() => {
        if (!memberDialogOpen) return

        const exists = availableStudentsForDialog.some((student) => student.id === normalizedMemberSelectValue)
        if (exists) return

        const firstStudent = availableStudentsForDialog[0]?.id ?? STUDENT_NONE_VALUE
        setMemberForm((prev) => ({ ...prev, studentUserId: sanitizeStudentSelectValue(firstStudent) }))
    }, [availableStudentsForDialog, memberDialogOpen, normalizedMemberSelectValue])

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
                {staff.email ? <div className="text-xs text-muted-foreground">{staff.email}</div> : null}
            </div>
        )
    }, [group?.adviserId, group?.manualAdviserInfo, staffById, staffLoading])

    const resetCreateMemberForm = React.useCallback(() => {
        const firstStudentId = sanitizeStudentSelectValue(availableStudentsForCreate[0]?.id ?? STUDENT_NONE_VALUE)
        setMemberForm({
            studentUserId: firstStudentId,
            program: group?.program ?? "",
            section: "",
        })
    }, [availableStudentsForCreate, group?.program])

    const resetCreateStudentForm = React.useCallback(() => {
        setCreateStudentName("")
        setCreateStudentEmail("")
        setCreateStudentStatus("active")
        setCreateStudentError(null)
    }, [])

    /**
     * Defensive guard:
     * - Ensure selected user has role "student" before member save.
     */
    const ensureUserRoleIsStudent = React.useCallback(async (candidateUserId: string) => {
        const normalizedId = candidateUserId.trim()
        if (!normalizedId) {
            return { existed: false, updated: false, roleBefore: null as string | null }
        }

        const endpoint = `/api/users/${encodeURIComponent(normalizedId)}`
        const getRes = await fetch(endpoint, {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: { Accept: "application/json" },
        })

        const getPayload = await parseResponseBodySafe(getRes)

        if (getRes.status === 404) {
            return { existed: false, updated: false, roleBefore: null as string | null }
        }

        if (!getRes.ok) {
            throw new Error(extractErrorMessage(getPayload, "Unable to verify student role.", getRes.status))
        }

        const roleBefore = extractRoleLowerFromPayload(getPayload)

        if (roleBefore === "student") {
            return { existed: true, updated: false, roleBefore }
        }

        const patchRes = await fetch(endpoint, {
            method: "PATCH",
            credentials: "include",
            cache: "no-store",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ role: "student" }),
        })

        const patchPayload = await parseResponseBodySafe(patchRes)

        if (!patchRes.ok) {
            throw new Error(
                extractErrorMessage(
                    patchPayload,
                    'Failed to automatically set role to "student" before member save.',
                    patchRes.status
                )
            )
        }

        return { existed: true, updated: true, roleBefore }
    }, [])

    /**
     * Best-effort profile provisioning for selected student before retrying member save.
     * This is intentionally defensive and tries multiple compatible route shapes.
     */
    const provisionStudentProfile = React.useCallback(
        async (
            studentUserId: string,
            program?: string | null,
            section?: string | null
        ) => {
            const normalizedId = studentUserId.trim()
            if (!normalizedId) {
                throw new Error("Invalid student id for profile provisioning.")
            }

            const normalizedProgram = toNullableTrimmed(program ?? "")
            const normalizedSection = toNullableTrimmed(section ?? "")

            const patchPayload: Record<string, unknown> = {
                program: normalizedProgram,
                section: normalizedSection,
            }

            const createPayload: Record<string, unknown> = {
                user_id: normalizedId,
                userId: normalizedId,
                student_user_id: normalizedId,
                studentUserId: normalizedId,
                ...patchPayload,
            }

            const encodedId = encodeURIComponent(normalizedId)

            const attempts: StudentProfileProvisionAttempt[] = [
                { endpoint: `/api/student/${encodedId}`, method: "PATCH", body: patchPayload },
                { endpoint: `/api/students/${encodedId}`, method: "PATCH", body: patchPayload },
                { endpoint: `/api/student/${encodedId}/profile`, method: "PATCH", body: patchPayload },
                { endpoint: `/api/students/${encodedId}/profile`, method: "PATCH", body: patchPayload },
                { endpoint: `/api/student-profiles/${encodedId}`, method: "PATCH", body: patchPayload },
                { endpoint: "/api/student-profiles", method: "POST", body: createPayload },
                { endpoint: "/api/students/profiles", method: "POST", body: createPayload },
            ]

            let lastError: Error | null = null

            for (const attempt of attempts) {
                try {
                    const res = await fetch(attempt.endpoint, {
                        method: attempt.method,
                        credentials: "include",
                        cache: "no-store",
                        headers: {
                            Accept: "application/json",
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(attempt.body),
                    })

                    if (res.status === 404 || res.status === 405) {
                        continue
                    }

                    const payload = await parseResponseBodySafe(res)

                    if (!res.ok) {
                        const message = extractErrorMessage(
                            payload,
                            `${attempt.endpoint} returned ${res.status}`,
                            res.status
                        )

                        // Continue probing other compatible endpoint shapes first.
                        if (res.status === 400 || res.status === 409 || res.status === 422) {
                            lastError = new Error(message)
                            continue
                        }

                        throw new Error(message)
                    }

                    return
                } catch (error) {
                    if (error instanceof Error && error.name === "AbortError") throw error
                    lastError = error instanceof Error ? error : new Error("Failed to provision student profile.")
                }
            }

            if (lastError) throw lastError
            throw new Error(
                "Unable to provision student profile automatically. Please create the student profile, then retry adding the member."
            )
        },
        []
    )

    const handleCreateStudentUser = React.useCallback(async () => {
        if (creatingStudentUser) return

        const name = createStudentName.trim()
        const email = createStudentEmail.trim().toLowerCase()

        setCreateStudentError(null)

        if (!name) {
            const msg = "Student name is required."
            setCreateStudentError(msg)
            toast.error(msg)
            return
        }

        if (!email) {
            const msg = "Student email is required."
            setCreateStudentError(msg)
            toast.error(msg)
            return
        }

        if (!isValidEmail(email)) {
            const msg = "Please provide a valid email address."
            setCreateStudentError(msg)
            toast.error(msg)
            return
        }

        setCreatingStudentUser(true)
        const loadingToastId = toast.loading("Creating student user...")

        try {
            const res = await fetch("/api/users/provision", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                cache: "no-store",
                body: JSON.stringify({
                    name,
                    email,
                    role: "student",
                    status: createStudentStatus,
                    sendLoginDetails: true,
                }),
            })

            const payload = await parseResponseBodySafe(res)
            const body = asRecord(payload)

            if (!res.ok) {
                throw new Error(extractErrorMessage(payload, "Failed to create student user.", res.status))
            }

            const createdRaw = body?.item ?? body?.data ?? null
            const createdStudent = normalizeStudentUser(createdRaw)

            if (!createdStudent) {
                throw new Error(
                    "Student user was created but returned data shape is unsupported for member assignment."
                )
            }

            setStudentUsers((prev) =>
                dedupeById([createdStudent, ...prev]).sort((a, b) =>
                    a.name.localeCompare(b.name, "en", { sensitivity: "base" })
                )
            )

            setMemberForm((prev) =>
                prev.studentUserId === STUDENT_NONE_VALUE
                    ? { ...prev, studentUserId: sanitizeStudentSelectValue(createdStudent.id) }
                    : prev
            )

            const successMessage =
                toStringOrNull(body?.message) ??
                "Student user created successfully. Login details were sent to email."

            toast.success(successMessage, { id: loadingToastId })
            setCreateStudentOpen(false)
            resetCreateStudentForm()
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to create student user."
            setCreateStudentError(message)
            toast.error(message, { id: loadingToastId })
        } finally {
            setCreatingStudentUser(false)
        }
    }, [
        createStudentEmail,
        createStudentName,
        createStudentStatus,
        creatingStudentUser,
        resetCreateStudentForm,
    ])

    const openCreateStudentDialog = React.useCallback(() => {
        resetCreateStudentForm()
        setCreateStudentOpen(true)
    }, [resetCreateStudentForm])

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
                member.linkedUserId ?? (member.studentId && studentsById.has(member.studentId) ? member.studentId : null)

            const fallbackStudentId = availableStudentsForEdit[0]?.id ?? STUDENT_NONE_VALUE
            const selectedStudentId = sanitizeStudentSelectValue(linkedId ?? fallbackStudentId)

            setMemberDialogMode("edit")
            setMemberTarget(member)
            setMemberForm({
                studentUserId: selectedStudentId,
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
                const selectedId = normalizedMemberSelectValue === STUDENT_NONE_VALUE ? null : normalizedMemberSelectValue
                if (!selectedId) {
                    throw new Error("Please select a student user. If none is available, create one first.")
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

                const successNotes: string[] = []

                const roleFix = await ensureUserRoleIsStudent(selected.id)
                if (roleFix.updated) {
                    const fromRole = roleFix.roleBefore ? ` from "${roleFix.roleBefore}"` : ""
                    successNotes.push(`Linked user role was auto-updated${fromRole} to "student".`)
                }

                const payload = {
                    user_id: selected.id,
                    userId: selected.id,
                    student_user_id: selected.id,
                    studentUserId: selected.id,
                    student_id: selected.id,
                    studentId: selected.id,
                    name: selected.name,
                    program: toNullableTrimmed(memberForm.program) ?? toNullableTrimmed(selected.program ?? "") ?? null,
                    section: toNullableTrimmed(memberForm.section) ?? toNullableTrimmed(selected.section ?? "") ?? null,
                }

                const runMemberSaveWithAutoProfileProvision = async (
                    executeSave: () => Promise<FetchResult>
                ): Promise<FetchResult> => {
                    try {
                        return await executeSave()
                    } catch (firstError) {
                        const firstMessage = firstError instanceof Error ? firstError.message : "Failed to save member."
                        if (!isMissingStudentProfileError(firstMessage)) {
                            throw firstError
                        }

                        const provisioningToastId = toast.loading("Creating missing student profile...")

                        try {
                            await provisionStudentProfile(
                                selected.id,
                                payload.program,
                                payload.section
                            )
                            toast.success("Student profile created. Retrying member save...", { id: provisioningToastId })
                        } catch (provisionError) {
                            const provisionMessage =
                                provisionError instanceof Error
                                    ? provisionError.message
                                    : "Failed to create student profile automatically."
                            toast.error(provisionMessage, { id: provisioningToastId })
                            throw new Error(provisionMessage)
                        }

                        const retried = await executeSave()
                        successNotes.push("Missing student profile was created automatically.")
                        return retried
                    }
                }

                if (memberDialogMode === "create") {
                    const result = await runMemberSaveWithAutoProfileProvision(() =>
                        requestFirstAvailable(memberEndpoints(groupId), {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(payload),
                        })
                    )

                    const created = normalizeMember(unwrapDetail(result.payload))

                    if (created) {
                        setMembers((prev) => sortMembers([created, ...prev.filter((item) => item.id !== created.id)]))
                    } else {
                        await refreshMembersOnly()
                    }

                    if (successNotes.length > 0) {
                        toast.success("Member added successfully.", { description: successNotes.join(" ") })
                    } else {
                        toast.success("Member added successfully.")
                    }
                } else {
                    if (!memberTarget) throw new Error("No member selected for editing.")

                    const identifier =
                        memberTarget.memberId ?? memberTarget.linkedUserId ?? memberTarget.studentId ?? memberTarget.id

                    if (!identifier) throw new Error("Unable to resolve member identifier for update.")

                    const endpoints = memberEndpoints(groupId).map(
                        (base) => `${base}/${encodeURIComponent(identifier)}`
                    )

                    const result = await runMemberSaveWithAutoProfileProvision(() =>
                        requestFirstAvailable(endpoints, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(payload),
                        })
                    )

                    const updated = normalizeMember(unwrapDetail(result.payload))

                    if (updated) {
                        setMembers((prev) => {
                            const withoutTarget = prev.filter((item) => item.id !== memberTarget.id)
                            return sortMembers([updated, ...withoutTarget.filter((item) => item.id !== updated.id)])
                        })
                    } else {
                        await refreshMembersOnly()
                    }

                    if (successNotes.length > 0) {
                        toast.success("Member updated successfully.", { description: successNotes.join(" ") })
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
            ensureUserRoleIsStudent,
            groupId,
            memberDialogMode,
            memberForm,
            memberTarget,
            normalizedMemberSelectValue,
            provisionStudentProfile,
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
            ? "Select an existing Student user to add as a member."
            : "Update member assignment and optional profile details."

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

                    <Button onClick={() => setRefreshKey((v) => v + 1)} disabled={loading || staffLoading || studentsLoading}>
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
                    <div className="rounded-lg border p-4 text-sm text-muted-foreground">Loading thesis group details...</div>
                ) : null}

                {!group && !loading ? (
                    <div className="rounded-lg border p-4 text-sm text-muted-foreground">No group data found for this record.</div>
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

                                    {!studentsLoading && availableStudentsForCreate.length === 0 ? (
                                        <Button size="sm" variant="secondary" onClick={openCreateStudentDialog}>
                                            <Plus className="mr-2 size-4" />
                                            Create Student User
                                        </Button>
                                    ) : null}

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

                                {availableStudentsForDialog.length === 0 ? (
                                    <Alert>
                                        <AlertDescription>
                                            <div className="space-y-3">
                                                <p>No available student users right now. Create a Student user first.</p>
                                                <Button type="button" size="sm" variant="secondary" onClick={openCreateStudentDialog}>
                                                    <Plus className="mr-2 size-4" />
                                                    Create Student User
                                                </Button>
                                            </div>
                                        </AlertDescription>
                                    </Alert>
                                ) : null}

                                <div className="space-y-2">
                                    <Label>Student User</Label>
                                    <Select
                                        value={normalizedMemberSelectValue}
                                        onValueChange={(value) =>
                                            setMemberForm((prev) => ({
                                                ...prev,
                                                studentUserId: sanitizeStudentSelectValue(value),
                                            }))
                                        }
                                        disabled={studentsLoading || availableStudentsForDialog.length === 0}
                                    >
                                        <SelectTrigger>
                                            <SelectValue
                                                placeholder={studentsLoading ? "Loading student users..." : "Select a student user"}
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={STUDENT_NONE_VALUE} disabled>
                                                No student selected
                                            </SelectItem>

                                            {selectedStudentMissing ? (
                                                <SelectItem value={normalizedMemberSelectValue}>
                                                    Current linked student (profile unavailable)
                                                </SelectItem>
                                            ) : null}

                                            {availableStudentsForDialog.map((student) => {
                                                const label = student.email ? `${student.name} (${student.email})` : student.name

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
                                            onChange={(event) => setMemberForm((prev) => ({ ...prev, program: event.target.value }))}
                                            placeholder="e.g., BSIT"
                                            autoComplete="off"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="member-section">Section (Optional)</Label>
                                        <Input
                                            id="member-section"
                                            value={memberForm.section}
                                            onChange={(event) => setMemberForm((prev) => ({ ...prev, section: event.target.value }))}
                                            placeholder="e.g., 4A"
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>

                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={() => setMemberDialogOpen(false)} disabled={memberSubmitting}>
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

            <Dialog
                open={createStudentOpen}
                onOpenChange={(open) => {
                    if (!creatingStudentUser) setCreateStudentOpen(open)
                    if (!open) resetCreateStudentForm()
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create Student User</DialogTitle>
                        <DialogDescription>
                            A login credential email will be sent automatically after user creation.
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        className="space-y-4"
                        onSubmit={(event) => {
                            event.preventDefault()
                            void handleCreateStudentUser()
                        }}
                    >
                        {createStudentError ? (
                            <Alert variant="destructive">
                                <AlertDescription>{createStudentError}</AlertDescription>
                            </Alert>
                        ) : null}

                        <div className="space-y-2">
                            <Label htmlFor="create-student-name">Name</Label>
                            <Input
                                id="create-student-name"
                                value={createStudentName}
                                onChange={(e) => setCreateStudentName(e.target.value)}
                                placeholder="e.g., Juan Dela Cruz"
                                autoComplete="off"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="create-student-email">Email</Label>
                            <Input
                                id="create-student-email"
                                type="email"
                                value={createStudentEmail}
                                onChange={(e) => setCreateStudentEmail(e.target.value)}
                                placeholder="e.g., juan.delacruz@example.edu"
                                autoComplete="off"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select
                                value={createStudentStatus}
                                onValueChange={(value) =>
                                    setCreateStudentStatus(value === "disabled" ? "disabled" : "active")
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    {CREATE_USER_STATUSES.map((status) => (
                                        <SelectItem key={`student-status-${status}`} value={status}>
                                            {toTitleCase(status)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCreateStudentOpen(false)} disabled={creatingStudentUser}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={creatingStudentUser}>
                                {creatingStudentUser ? "Creating..." : "Create Student User"}
                            </Button>
                        </DialogFooter>
                    </form>
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
