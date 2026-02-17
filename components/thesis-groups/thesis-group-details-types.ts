export type ThesisGroupDetail = {
    id: string
    title: string
    program: string | null
    term: string | null
    adviserId: string | null
    manualAdviserInfo: string | null
    createdAt: string | null
    updatedAt: string | null
}

export type StaffUserItem = {
    id: string
    name: string
    email: string | null
    status: string | null
}

export type StudentUserItem = {
    id: string
    name: string
    email: string | null
    status: string | null
    program: string | null
    section: string | null
}

export type GroupMemberItem = {
    id: string
    memberId: string | null
    linkedUserId: string | null
    studentId: string | null
    name: string | null
    program: string | null
    section: string | null
}

export type DefenseScheduleItem = {
    id: string
    scheduledAt: string | null
    room: string | null
    status: string | null
    rubricTemplateId: string | null
}

export type FetchResult = {
    endpoint: string
    payload: unknown | null
    status: number
}

export type MemberDialogMode = "create" | "edit"

export type MemberFormState = {
    studentUserId: string
    program: string
    section: string
}

export type UserStatus = "active" | "disabled"

export const STUDENT_NONE_VALUE = "__none_student__"
export const CREATE_USER_STATUSES: UserStatus[] = ["active", "disabled"]

export const STAFF_LIST_ENDPOINTS = [
    "/api/staff",
    `/api/users?where=${encodeURIComponent(JSON.stringify({ role: "staff" }))}`,
    "/api/users?role=staff",
    "/api/users",
] as const

export const STUDENT_LIST_ENDPOINTS = [
    "/api/student",
    `/api/users?where=${encodeURIComponent(JSON.stringify({ role: "student" }))}`,
    "/api/users?role=student",
    "/api/users",
] as const

export function detailEndpoints(id: string): string[] {
    return [
        `/api/admin/thesis-groups/${id}`,
        `/api/admin/thesis/groups/${id}`,
        `/api/thesis-groups/${id}`,
        `/api/thesis/groups/${id}`,
    ]
}

export function memberEndpoints(id: string): string[] {
    return [
        `/api/admin/thesis-groups/${id}/members`,
        `/api/admin/thesis/groups/${id}/members`,
        `/api/thesis-groups/${id}/members`,
        `/api/thesis/groups/${id}/members`,
    ]
}

export function scheduleEndpoints(id: string): string[] {
    return [
        `/api/admin/thesis-groups/${id}/schedules`,
        `/api/admin/thesis/groups/${id}/schedules`,
        `/api/thesis-groups/${id}/schedules`,
        `/api/thesis/groups/${id}/schedules`,
    ]
}

/**
 * Preferred dedicated endpoints for creating/updating student profile rows.
 */
export function studentProfileEndpoints(userId: string): string[] {
    const encoded = encodeURIComponent(userId)
    return [
        `/api/student/${encoded}/profile`,
        `/api/students/${encoded}/profile`,
        `/api/admin/student/${encoded}/profile`,
        `/api/admin/students/${encoded}/profile`,
    ]
}

/**
 * Compatibility fallback endpoints if dedicated /profile routes are unavailable.
 * Some backends wire student profile upsert through PATCH /student/:id.
 */
export function studentProfileFallbackEndpoints(userId: string): string[] {
    const encoded = encodeURIComponent(userId)
    return [
        `/api/student/${encoded}`,
        `/api/students/${encoded}`,
        `/api/admin/student/${encoded}`,
        `/api/admin/students/${encoded}`,
        `/api/users/${encoded}`,
    ]
}
