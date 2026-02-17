export type ThesisGroupListItem = {
    id: string
    title: string
    program: string | null
    term: string | null
    adviserId: string | null
    manualAdviserInfo: string | null
    membersCount: number | null
    createdAt: string | null
    updatedAt: string | null
}

export type StaffUserItem = {
    id: string
    name: string
    email: string | null
    status: string | null
}

export type ThesisGroupFormState = {
    title: string
    program: string
    adviserUserId: string
    semester: string
    customSemester: string
    schoolYearStart: string
}

export type FetchResult = {
    endpoint: string
    payload: unknown | null
    status: number
}

export type MutationWithFallbackResult = {
    result: FetchResult
    payloadUsed: Record<string, unknown>
    usedFallback: boolean
}

export type UserStatus = "active" | "disabled"

export const LIST_ENDPOINTS = [
    "/api/thesis-groups",
    "/api/admin/thesis-groups",
    "/api/thesis/groups",
    "/api/admin/thesis/groups",
] as const

export const STAFF_LIST_ENDPOINTS = [
    "/api/staff",
    `/api/users?where=${encodeURIComponent(JSON.stringify({ role: "staff" }))}`,
    "/api/users?role=staff",
    "/api/users",
] as const

export const WRITE_BASE_ENDPOINTS = [...LIST_ENDPOINTS]

export const STANDARD_SEMESTERS = ["1st Semester", "2nd Semester", "Summer"] as const
export const SEMESTER_NONE_VALUE = "__none__"
export const SEMESTER_OTHER_VALUE = "__other__"
export const ADVISER_NONE_VALUE = "__none_adviser__"
export const CREATE_USER_STATUSES: UserStatus[] = ["active", "disabled"]

export function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

export function toStringOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export function toNumberOrNull(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const n = Number(value)
        if (Number.isFinite(n)) return n
    }
    return null
}

export function toNonNegativeCountOrNull(value: unknown): number | null {
    const n = toNumberOrNull(value)
    if (n === null) return null
    if (n < 0) return null
    return Math.trunc(n)
}

export function unwrapItems(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload

    const rec = asRecord(payload)
    if (!rec) return []

    const directItems = rec.items
    if (Array.isArray(directItems)) return directItems

    const directData = rec.data
    if (Array.isArray(directData)) return directData

    const directGroups = rec.groups
    if (Array.isArray(directGroups)) return directGroups

    return []
}

export function unwrapItem(payload: unknown): unknown {
    const rec = asRecord(payload)
    if (!rec) return payload

    if (rec.item) return rec.item
    if (rec.data) return rec.data

    return payload
}

export function extractRoleLower(rec: Record<string, unknown>): string | null {
    const direct = toStringOrNull(rec.role ?? rec.user_role ?? rec.userRole)
    if (direct) return direct.toLowerCase()

    const userRec = asRecord(rec.user)
    const nested = userRec ? toStringOrNull(userRec.role ?? userRec.user_role) : null
    if (nested) return nested.toLowerCase()

    return null
}

export function normalizeGroup(raw: unknown): ThesisGroupListItem | null {
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

    const scalarMembersCount = toNonNegativeCountOrNull(
        rec.members_count ?? rec.member_count ?? rec.membersCount
    )
    const membersArrayCandidate =
        rec.members ?? rec.group_members ?? rec.groupMembers ?? rec.member_list ?? rec.memberList

    const membersCount =
        scalarMembersCount ?? (Array.isArray(membersArrayCandidate) ? membersArrayCandidate.length : null)

    const createdAt = toStringOrNull(rec.created_at ?? rec.createdAt)
    const updatedAt = toStringOrNull(rec.updated_at ?? rec.updatedAt)

    return {
        id,
        title,
        program,
        term,
        adviserId,
        manualAdviserInfo,
        membersCount,
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

export function extractMembersCountFromPayload(payload: unknown): number | null {
    if (Array.isArray(payload)) {
        return payload.length
    }

    const rec = asRecord(payload)
    if (!rec) return null

    const scalarCount = toNonNegativeCountOrNull(
        rec.count ??
        rec.total ??
        rec.totalCount ??
        rec.membersCount ??
        rec.members_count ??
        rec.memberCount ??
        rec.member_count
    )
    if (scalarCount !== null) return scalarCount

    const arrayCandidates: unknown[] = [
        rec.items,
        rec.data,
        rec.members,
        rec.group_members,
        rec.groupMembers,
    ]

    for (const candidate of arrayCandidates) {
        if (Array.isArray(candidate)) return candidate.length
    }

    return null
}

export function buildGroupMembersEndpointCandidates(
    groupId: string,
    preferredBaseEndpoint: string | null
): string[] {
    const bases = preferredBaseEndpoint
        ? [preferredBaseEndpoint, ...LIST_ENDPOINTS.filter((endpoint) => endpoint !== preferredBaseEndpoint)]
        : [...LIST_ENDPOINTS]

    const candidates: string[] = []
    const seen = new Set<string>()

    const push = (endpoint: string) => {
        const normalized = endpoint.replace(/\/+$/, "")
        if (seen.has(normalized)) return
        seen.add(normalized)
        candidates.push(normalized)
    }

    for (const base of bases) {
        push(`${base}/${groupId}/members`)
    }

    push(`/api/thesis-groups/${groupId}/members`)
    push(`/api/admin/thesis-groups/${groupId}/members`)
    push(`/api/thesis/groups/${groupId}/members`)
    push(`/api/admin/thesis/groups/${groupId}/members`)

    return candidates
}

export function dedupeStaffUsers(items: StaffUserItem[]): StaffUserItem[] {
    const map = new Map<string, StaffUserItem>()

    for (const item of items) {
        const existing = map.get(item.id)
        if (!existing) {
            map.set(item.id, item)
            continue
        }

        map.set(item.id, {
            id: item.id,
            name:
                existing.name === "Unnamed Staff" && item.name !== "Unnamed Staff"
                    ? item.name
                    : existing.name,
            email: existing.email ?? item.email,
            status: existing.status ?? item.status,
        })
    }

    return [...map.values()]
}

export function sortNewest(items: ThesisGroupListItem[]): ThesisGroupListItem[] {
    return [...items].sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return tb - ta
    })
}

export function sortStaff(items: StaffUserItem[]): StaffUserItem[] {
    return [...items].sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name, "en", { sensitivity: "base" })
        if (nameCompare !== 0) return nameCompare
        return a.id.localeCompare(b.id)
    })
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

export function toNullableTrimmed(value: string): string | null {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export function sanitizeSelectValue(value: string, fallback: string): string {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : fallback
}

export function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/**
 * Build payload with required adviser link only (manual adviser entry removed).
 */
export function buildThesisGroupMutationPayload(input: {
    title: string
    program: string
    term: string | null
    adviserId: string
}): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        title: input.title,
        adviser_id: input.adviserId,
        adviserId: input.adviserId,
    }

    const program = toNullableTrimmed(input.program)
    if (program !== null) payload.program = program

    if (input.term !== null) payload.term = input.term

    return payload
}

export function normalizeActionError(error: unknown, fallback: string): string {
    const raw = error instanceof Error ? error.message : fallback
    const msg = (raw ?? "").trim()

    if (!msg) return fallback

    if (/adviserid|adviser_id|foreign key|constraint|violates/i.test(msg)) {
        return "Unable to save adviser assignment due to a server schema mismatch. Please verify adviser user mapping in the API."
    }

    return msg
}

export function parseResponseBodySafe(res: Response): Promise<unknown | null> {
    return res.text().then((text) => {
        if (!text) return null
        try {
            return JSON.parse(text) as unknown
        } catch {
            return { message: text }
        }
    })
}

export function extractErrorMessage(payload: unknown, fallback: string): string {
    const rec = asRecord(payload)
    if (!rec) return fallback
    const error = toStringOrNull(rec.error)
    if (error) return error
    const message = toStringOrNull(rec.message)
    if (message) return message
    return fallback
}

export function currentYearText(): string {
    return String(new Date().getFullYear())
}

export function defaultCreateFormState(): ThesisGroupFormState {
    return {
        title: "",
        program: "",
        adviserUserId: ADVISER_NONE_VALUE,
        semester: "1st Semester",
        customSemester: "",
        schoolYearStart: currentYearText(),
    }
}

export function defaultEditFormState(): ThesisGroupFormState {
    return {
        title: "",
        program: "",
        adviserUserId: ADVISER_NONE_VALUE,
        semester: SEMESTER_NONE_VALUE,
        customSemester: "",
        schoolYearStart: currentYearText(),
    }
}

export function parseTermToFormFields(term: string | null): Pick<
    ThesisGroupFormState,
    "semester" | "customSemester" | "schoolYearStart"
> {
    if (!term || !term.trim()) {
        return {
            semester: SEMESTER_NONE_VALUE,
            customSemester: "",
            schoolYearStart: currentYearText(),
        }
    }

    const raw = term.trim()

    const ayPattern = /^(.+?)\s+AY\s+(\d{4})\s*-\s*(\d{4})$/i
    const match = raw.match(ayPattern)

    let semesterLabel = raw
    let schoolYearStart = ""

    if (match) {
        semesterLabel = match[1].trim()
        schoolYearStart = match[2]
    }

    const known = STANDARD_SEMESTERS.find(
        (value) => value.toLowerCase() === semesterLabel.toLowerCase()
    )

    if (known) {
        return {
            semester: known,
            customSemester: "",
            schoolYearStart: schoolYearStart || currentYearText(),
        }
    }

    return {
        semester: SEMESTER_OTHER_VALUE,
        customSemester: semesterLabel,
        schoolYearStart: schoolYearStart || currentYearText(),
    }
}

export function normalizeSchoolYearStart(raw: string): number | null {
    const text = raw.trim()
    if (!/^\d{4}$/.test(text)) return null

    const year = Number(text)
    if (!Number.isInteger(year)) return null
    if (year < 1900 || year > 9999) return null

    return year
}

export function buildTermFromForm(form: ThesisGroupFormState): { term: string | null; error: string | null } {
    if (form.semester === SEMESTER_NONE_VALUE) {
        return { term: null, error: null }
    }

    const semesterLabel =
        form.semester === SEMESTER_OTHER_VALUE ? form.customSemester.trim() : form.semester.trim()

    if (!semesterLabel) {
        return { term: null, error: "Please specify the semester." }
    }

    const schoolYearStart = normalizeSchoolYearStart(form.schoolYearStart)
    if (schoolYearStart === null) {
        return {
            term: null,
            error: "School Year start must be a valid 4-digit year (e.g., 2026).",
        }
    }

    const schoolYearEnd = schoolYearStart + 1
    return {
        term: `${semesterLabel} AY ${schoolYearStart}-${schoolYearEnd}`,
        error: null,
    }
}

export function buildTermPreview(form: ThesisGroupFormState): string {
    const built = buildTermFromForm(form)
    if (built.error) {
        if (form.semester === SEMESTER_NONE_VALUE) return "No term"
        const semesterLabel =
            form.semester === SEMESTER_OTHER_VALUE ? form.customSemester.trim() : form.semester
        return semesterLabel || "No term"
    }
    return built.term ?? "No term"
}

export function isDisabledStaff(staff: StaffUserItem): boolean {
    return (staff.status ?? "").trim().toLowerCase() === "disabled"
}

export function buildCompatibilityPayloadVariants(
    basePayload: Record<string, unknown>
): Record<string, unknown>[] {
    const variants: Record<string, unknown>[] = []
    const seen = new Set<string>()

    const pushUnique = (candidate: Record<string, unknown>) => {
        if (!candidate || Object.keys(candidate).length === 0) return
        const key = JSON.stringify(candidate)
        if (seen.has(key)) return
        seen.add(key)
        variants.push(candidate)
    }

    // Variant A: send both adviser key styles
    pushUnique({ ...basePayload })

    // Variant B: snake_case only
    if (Object.prototype.hasOwnProperty.call(basePayload, "adviserId")) {
        const next = { ...basePayload }
        delete next.adviserId
        pushUnique(next)
    }

    // Variant C: camelCase only
    if (Object.prototype.hasOwnProperty.call(basePayload, "adviser_id")) {
        const next = { ...basePayload }
        delete next.adviser_id
        pushUnique(next)
    }

    return variants
}

export function shouldAttemptPayloadFallback(message: string): boolean {
    const normalized = message.trim().toLowerCase()
    if (!normalized) return false

    return (
        normalized.includes("internal server error") ||
        normalized.includes("returned 500") ||
        (normalized.includes("column") && normalized.includes("does not exist")) ||
        normalized.includes("schema") ||
        normalized.includes("foreign key") ||
        normalized.includes("constraint") ||
        normalized.includes("violates") ||
        normalized.includes("invalid input syntax")
    )
}
