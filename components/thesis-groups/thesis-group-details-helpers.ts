import type {
    DefenseScheduleItem,
    GroupMemberItem,
    MemberFormState,
    StaffUserItem,
    StudentUserItem,
    ThesisGroupDetail,
} from "./thesis-group-details-types"
import { STUDENT_NONE_VALUE } from "./thesis-group-details-types"

export function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

export function toStringOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export function toNullableTrimmed(value: string): string | null {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export function toTitleCase(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) return value
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

export function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isMissingStudentProfileMessage(value: string): boolean {
    const normalized = value.trim().toLowerCase()
    return (
        normalized.includes("does not have a student profile record") ||
        normalized.includes("create the student profile first")
    )
}

/**
 * Guarantees non-empty values for Radix/Shadcn Select components.
 * Empty string is invalid for <SelectItem value="...">.
 */
export function sanitizeStudentSelectValue(value: string | null | undefined): string {
    const trimmed = (value ?? "").trim()
    return trimmed.length > 0 ? trimmed : STUDENT_NONE_VALUE
}

export function defaultMemberForm(selectedStudentId: string): MemberFormState {
    return {
        studentUserId: sanitizeStudentSelectValue(selectedStudentId),
        program: "",
        section: "",
    }
}

export function unwrapItems(payload: unknown): unknown[] {
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

export function unwrapDetail(payload: unknown): unknown {
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

export function extractRoleLowerFromPayload(payload: unknown): string | null {
    const detailRec = asRecord(unwrapDetail(payload))
    if (!detailRec) return null
    return extractRoleLower(detailRec)
}

export function normalizeGroup(raw: unknown): ThesisGroupDetail | null {
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

export function normalizeStaffUser(raw: unknown): StaffUserItem | null {
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

export function normalizeStudentUser(raw: unknown): StudentUserItem | null {
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

export function normalizeMember(raw: unknown): GroupMemberItem | null {
    const rec = asRecord(raw)
    if (!rec) return null

    const memberId = toStringOrNull(rec.member_id ?? rec.memberId ?? rec.id)
    const linkedUserId = toStringOrNull(
        rec.user_id ?? rec.userId ?? rec.student_user_id ?? rec.studentUserId
    )
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

export function normalizeSchedule(raw: unknown): DefenseScheduleItem | null {
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

export function sortMembers(items: GroupMemberItem[]): GroupMemberItem[] {
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

export function dedupeById<T extends { id: string }>(items: T[]): T[] {
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

export function isDisabledStatus(status: string | null): boolean {
    return (status ?? "").trim().toLowerCase() === "disabled"
}

export function formatDateTime(value: string | null): string {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(d)
}

function isGenericFailureMessage(value: string): boolean {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return false
    if (normalized === "internal server error.") return true
    return /^failed to [a-z0-9\s-]+\.$/.test(normalized)
}

export function extractErrorMessage(payload: unknown, fallback: string, status?: number): string {
    const rec = asRecord(payload)
    if (!rec) return fallback

    const error = toStringOrNull(rec.error)
    const message = toStringOrNull(rec.message)

    if (
        message &&
        (status === 500 ||
            status === 502 ||
            status === 503 ||
            status === 504 ||
            !error ||
            isGenericFailureMessage(error))
    ) {
        return message
    }

    if (error) return error
    if (message) return message
    return fallback
}
