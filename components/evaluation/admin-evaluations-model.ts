export type ThesisRole = "student" | "staff" | "admin" | "panelist" | (string & {})
export type EvaluationStatus = "pending" | "submitted" | "locked" | (string & {})
export type FilterStatus = "all" | "pending" | "submitted" | "locked"
export type EvaluationAction = "submit" | "lock" | "set-pending"
export type FormMode = "create" | "edit"
export type AssigneeRole = "panelist" | "student"
export type AssignmentMode = "all" | "particular"
export type EvaluationKind = "panelist" | "student"

export type AssignmentPreset =
    | "all-panelists"
    | "particular-panelist"
    | "all-students"
    | "particular-student"

export type AssignmentPresetMeta = {
    role: AssigneeRole
    mode: AssignmentMode
    label: string
    description: string
    roleSingular: string
    rolePlural: string
}

export type EvaluationRef = {
    id: string
    kind: EvaluationKind
}

export type PanelistEvaluationApiRecord = {
    id: string
    schedule_id: string
    evaluator_id: string
    status: EvaluationStatus
    submitted_at: string | null
    locked_at: string | null
    created_at: string
}

export type StudentEvaluationApiRecord = {
    id: string
    schedule_id: string
    student_id: string
    status: EvaluationStatus
    submitted_at: string | null
    locked_at: string | null
    created_at: string
    updated_at?: string
}

export type EvaluationRecord = {
    id: string
    schedule_id: string
    evaluator_id: string
    status: EvaluationStatus
    submitted_at: string | null
    locked_at: string | null
    created_at: string
    kind: EvaluationKind
    assignee_role: AssigneeRole
}

export type DefenseScheduleOption = {
    id: string
    group_id: string
    group_title: string | null
    scheduled_at: string
    room: string | null
    status: string
}

export type ThesisGroupOption = {
    id: string
    title: string
}

export type UserOption = {
    id: string
    name: string | null
    email: string | null
    role: ThesisRole
    status?: string
}

export type EvaluationsResponse = {
    items?: unknown[]
    error?: string
    message?: string
}

export type EvaluationResponse = {
    item?: unknown
    error?: string
    message?: string
}

export type DefenseSchedulesResponse = {
    items?: DefenseScheduleOption[]
    error?: string
    message?: string
}

export type UsersResponse = {
    items?: UserOption[]
    error?: string
    message?: string
}

export type EvaluationFormState = {
    schedule_id: string
    evaluator_id: string
    status: EvaluationStatus
}

export type GroupedEvaluationBucket = {
    key: string
    groupName: string
    items: EvaluationRecord[]
    pending: number
    submitted: number
    locked: number
}

export const PANELIST_EVALUATIONS_ENDPOINT = "/api/evaluations"
export const STUDENT_EVALUATIONS_ENDPOINT_CANDIDATES = [
    "/api/student-evaluations",
    "/api/admin/student-evaluations",
    "/api/student/evaluations",
] as const

export const STATUS_FILTERS: FilterStatus[] = ["all", "pending", "submitted", "locked"]
export const ASSIGNMENT_STATUSES: EvaluationStatus[] = ["pending", "submitted", "locked"]
export const GROUP_ENDPOINTS = ["/api/admin/thesis-groups", "/api/thesis-groups"] as const

export const ASSIGNMENT_PRESET_META: Record<AssignmentPreset, AssignmentPresetMeta> = {
    "all-panelists": {
        role: "panelist",
        mode: "all",
        label: "All Panelists (Rubric)",
        description: "Assign rubric scoring to every active panelist",
        roleSingular: "panelist",
        rolePlural: "panelists",
    },
    "particular-panelist": {
        role: "panelist",
        mode: "particular",
        label: "Particular Panelist (Rubric)",
        description: "Assign rubric scoring to one selected panelist",
        roleSingular: "panelist",
        rolePlural: "panelists",
    },
    "all-students": {
        role: "student",
        mode: "all",
        label: "All Students (Feedback)",
        description: "Assign student feedback evaluation to every active student",
        roleSingular: "student",
        rolePlural: "students",
    },
    "particular-student": {
        role: "student",
        mode: "particular",
        label: "Particular Student (Feedback)",
        description: "Assign student feedback evaluation to one selected student",
        roleSingular: "student",
        rolePlural: "students",
    },
}

export const CREATE_PRESETS: AssignmentPreset[] = [
    "all-panelists",
    "particular-panelist",
    "all-students",
    "particular-student",
]

export const EDIT_PRESETS: AssignmentPreset[] = ["particular-panelist", "particular-student"]

export function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

export function isUuidLike(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.trim(),
    )
}

export function toTitleCase(value: string) {
    if (!value) return value
    return value.charAt(0).toUpperCase() + value.slice(1)
}

export function normalizeStatus(value: string): string {
    return value.trim().toLowerCase()
}

export function formatDateTime(value: string | null) {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

export function statusBadgeClass(status: string): string {
    const s = normalizeStatus(status)

    if (s === "submitted") {
        return "border-primary/40 bg-primary/10 text-foreground"
    }

    if (s === "locked") {
        return "border-foreground/30 bg-foreground/10 text-foreground"
    }

    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

export function compactString(value: string | null | undefined) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

export function extractApiMessage(payload: unknown): string {
    if (!isRecord(payload)) return ""
    const error = typeof payload.error === "string" ? payload.error.trim() : ""
    const message = typeof payload.message === "string" ? payload.message.trim() : ""
    return message || error || ""
}

export async function parseJsonSafely<T>(res: Response): Promise<T> {
    let data: unknown = {}
    try {
        data = await res.json()
    } catch {
        data = {}
    }

    if (!res.ok) {
        const extracted = extractApiMessage(data)
        const message = extracted || `Request failed (${res.status})`
        throw new Error(message)
    }

    return data as T
}

export async function parseJsonLoose(res: Response): Promise<unknown> {
    try {
        return await res.json()
    } catch {
        return {}
    }
}

export function extractItems(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []
    if (Array.isArray(payload.items)) return payload.items
    if (payload.item !== undefined) return [payload.item]
    return []
}

export function getEvaluationFormDefault(): EvaluationFormState {
    return {
        schedule_id: "",
        evaluator_id: "",
        status: "pending",
    }
}

export function matchAny(value: string, query: string) {
    return value.toLowerCase().includes(query)
}

export function roleLabel(role: ThesisRole) {
    return toTitleCase(String(role))
}

export function uniqueById<T extends { id: string }>(items: T[]): T[] {
    const seen = new Set<string>()
    const out: T[] = []

    for (const item of items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        out.push(item)
    }

    return out
}

export function uniqueEvaluations(items: EvaluationRecord[]): EvaluationRecord[] {
    const seen = new Set<string>()
    const out: EvaluationRecord[] = []

    for (const item of items) {
        const key = `${item.kind}:${item.id}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push(item)
    }

    return out
}

export function replaceEvaluation(
    list: EvaluationRecord[],
    nextItem: EvaluationRecord,
): EvaluationRecord[] {
    return list.map((item) =>
        item.id === nextItem.id && item.kind === nextItem.kind ? nextItem : item,
    )
}

export function removeEvaluation(list: EvaluationRecord[], target: EvaluationRecord): EvaluationRecord[] {
    return list.filter((item) => !(item.id === target.id && item.kind === target.kind))
}

export function appendAndSortEvaluations(
    current: EvaluationRecord[],
    additions: EvaluationRecord[],
): EvaluationRecord[] {
    const merged = uniqueEvaluations([...additions, ...current])
    return merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export function isSameRef(a: EvaluationRef | null, b: EvaluationRef | null): boolean {
    if (!a || !b) return false
    return a.id === b.id && a.kind === b.kind
}

export function isSameRefRecord(ref: EvaluationRef | null, row: EvaluationRecord): boolean {
    if (!ref) return false
    return ref.id === row.id && ref.kind === row.kind
}

export function isUserAssignable(status?: string): boolean {
    const normalized = normalizeStatus(status ?? "active")
    return !["inactive", "disabled", "blocked", "archived", "suspended"].includes(normalized)
}

export function toAssignmentPreset(role: AssigneeRole, mode: AssignmentMode): AssignmentPreset {
    if (role === "student" && mode === "all") return "all-students"
    if (role === "student" && mode === "particular") return "particular-student"
    if (role === "panelist" && mode === "all") return "all-panelists"
    return "particular-panelist"
}

export function toPanelistApiRecord(value: unknown): PanelistEvaluationApiRecord | null {
    if (!isRecord(value)) return null

    const id = compactString(typeof value.id === "string" ? value.id : null)
    const schedule_id = compactString(typeof value.schedule_id === "string" ? value.schedule_id : null)
    const evaluator_id = compactString(typeof value.evaluator_id === "string" ? value.evaluator_id : null)
    const statusRaw = compactString(typeof value.status === "string" ? value.status : null)
    const created_at = compactString(typeof value.created_at === "string" ? value.created_at : null)

    if (!id || !schedule_id || !evaluator_id || !created_at) return null

    return {
        id,
        schedule_id,
        evaluator_id,
        status: (statusRaw ?? "pending") as EvaluationStatus,
        submitted_at: typeof value.submitted_at === "string" ? value.submitted_at : null,
        locked_at: typeof value.locked_at === "string" ? value.locked_at : null,
        created_at,
    }
}

export function toStudentApiRecord(value: unknown): StudentEvaluationApiRecord | null {
    if (!isRecord(value)) return null

    const id = compactString(typeof value.id === "string" ? value.id : null)
    const schedule_id = compactString(typeof value.schedule_id === "string" ? value.schedule_id : null)
    const student_id = compactString(typeof value.student_id === "string" ? value.student_id : null)
    const statusRaw = compactString(typeof value.status === "string" ? value.status : null)
    const created_at = compactString(typeof value.created_at === "string" ? value.created_at : null)

    if (!id || !schedule_id || !student_id || !created_at) return null

    return {
        id,
        schedule_id,
        student_id,
        status: (statusRaw ?? "pending") as EvaluationStatus,
        submitted_at: typeof value.submitted_at === "string" ? value.submitted_at : null,
        locked_at: typeof value.locked_at === "string" ? value.locked_at : null,
        created_at,
        updated_at: typeof value.updated_at === "string" ? value.updated_at : undefined,
    }
}

export function toUnifiedFromPanelist(item: PanelistEvaluationApiRecord): EvaluationRecord {
    return {
        id: item.id,
        schedule_id: item.schedule_id,
        evaluator_id: item.evaluator_id,
        status: item.status,
        submitted_at: item.submitted_at,
        locked_at: item.locked_at,
        created_at: item.created_at,
        kind: "panelist",
        assignee_role: "panelist",
    }
}

export function toUnifiedFromStudent(item: StudentEvaluationApiRecord): EvaluationRecord {
    return {
        id: item.id,
        schedule_id: item.schedule_id,
        evaluator_id: item.student_id,
        status: item.status,
        submitted_at: item.submitted_at,
        locked_at: item.locked_at,
        created_at: item.created_at,
        kind: "student",
        assignee_role: "student",
    }
}

export function mapApiItemByRole(role: AssigneeRole, item: unknown): EvaluationRecord | null {
    if (role === "panelist") {
        const parsed = toPanelistApiRecord(item)
        return parsed ? toUnifiedFromPanelist(parsed) : null
    }

    const parsed = toStudentApiRecord(item)
    return parsed ? toUnifiedFromStudent(parsed) : null
}

export function mapApiItemByKind(kind: EvaluationKind, item: unknown): EvaluationRecord | null {
    return mapApiItemByRole(kind === "student" ? "student" : "panelist", item)
}
