/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    apiEnvelopeSchema,
    thesisContracts,
    scheduleContracts,
    evaluationContracts,
    profileContracts,
} from "@/lib/apiContracts"

export class ApiError extends Error {
    status: number
    code?: string
    issues?: Array<{ path: string; message: string }>
    data?: unknown

    constructor(message: string, opts: { status: number; code?: string; issues?: Array<{ path: string; message: string }>; data?: unknown }) {
        super(message)
        this.name = "ApiError"
        this.status = opts.status
        this.code = opts.code
        this.issues = opts.issues
        this.data = opts.data
    }
}

export type ApiClientConfig = {
    /**
     * Use "" in the browser (relative).
     * On server/tests you can pass env.APP_URL like "http://localhost:3000".
     */
    baseUrl?: string
    fetchFn?: typeof fetch
    defaultHeaders?: HeadersInit
}

function toQueryString(query: Record<string, unknown> | undefined) {
    if (!query) return ""
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue
        if (Array.isArray(v)) {
            for (const item of v) sp.append(k, String(item))
        } else {
            sp.set(k, String(v))
        }
    }
    const s = sp.toString()
    return s ? `?${s}` : ""
}

async function readResponse(res: Response) {
    const ct = res.headers.get("content-type") ?? ""
    if (ct.includes("application/json")) {
        try {
            return await res.json()
        } catch {
            return null
        }
    }
    try {
        const text = await res.text()
        return text ? { message: text } : null
    } catch {
        return null
    }
}

export function createApiClient(config: ApiClientConfig = {}) {
    const baseUrl = config.baseUrl ?? ""
    const fetchFn = config.fetchFn ?? fetch
    const defaultHeaders = config.defaultHeaders ?? {}

    async function requestOk<TOut extends Record<string, any> = Record<string, any>>(args: {
        path: string
        method: "GET" | "POST" | "PATCH" | "DELETE"
        query?: Record<string, unknown>
        body?: unknown
    }): Promise<TOut> {
        const qs = toQueryString(args.query)
        const url = baseUrl ? `${baseUrl}${args.path}${qs}` : `${args.path}${qs}`

        const init: RequestInit = {
            method: args.method,
            credentials: "include",
            headers: {
                ...defaultHeaders,
                ...(args.body ? { "content-type": "application/json" } : {}),
            },
            body: args.body ? JSON.stringify(args.body) : undefined,
        }

        const res = await fetchFn(url, init)
        const data = await readResponse(res)

        // Try to understand the API envelope if it's JSON-ish
        const envelope = data && typeof data === "object" ? apiEnvelopeSchema.safeParse(data) : null

        if (!res.ok) {
            const msg = (data as any)?.message ?? `Request failed (${res.status})`
            const code = (data as any)?.code
            const issues = Array.isArray((data as any)?.issues) ? (data as any).issues : undefined
            throw new ApiError(msg, { status: res.status, code, issues, data })
        }

        if (envelope?.success && envelope.data.ok === false) {
            const msg = (envelope.data as any)?.message ?? "Request failed"
            const code = (envelope.data as any)?.code
            const issues = Array.isArray((envelope.data as any)?.issues) ? (envelope.data as any).issues : undefined
            throw new ApiError(msg, { status: res.status, code, issues, data: envelope.data })
        }

        if (!envelope?.success) {
            // If server returned non-envelope JSON but 2xx, just return it
            return (data ?? {}) as TOut
        }

        const { ...rest } = envelope.data as any
        return rest as TOut
    }

    const paths = {
        thesis: "/api/thesis",
        schedule: "/api/schedule",
        evaluation: "/api/evaluation",
        profiles: "/api/profiles",
    } as const

    return {
        paths,

        thesis: {
            listGroups: async (input?: { q?: string; limit?: number; offset?: number }) => {
                const q = thesisContracts.groupsGetQuerySchema.parse({
                    resource: "groups",
                    q: input?.q ?? "",
                    limit: input?.limit ?? undefined,
                    offset: input?.offset ?? undefined,
                })
                return requestOk<{ total: number; groups: any[] }>({
                    path: paths.thesis,
                    method: "GET",
                    query: q,
                })
            },

            getGroupById: async (id: string) => {
                const q = thesisContracts.groupsGetQuerySchema.parse({ resource: "groups", id })
                return requestOk<{ group: any }>({
                    path: paths.thesis,
                    method: "GET",
                    query: q,
                })
            },

            createGroup: async (body: unknown) => {
                const b = thesisContracts.createGroupBodySchema.parse(body)
                return requestOk<{ group: any }>({
                    path: paths.thesis,
                    method: "POST",
                    query: { resource: "groups" },
                    body: b,
                })
            },

            updateGroup: async (id: string, patch: unknown) => {
                const b = thesisContracts.updateGroupBodySchema.parse(patch)
                return requestOk<{ group: any }>({
                    path: paths.thesis,
                    method: "PATCH",
                    query: { resource: "groups", id },
                    body: b,
                })
            },

            deleteGroup: async (id: string) => {
                const q = thesisContracts.deleteGroupQuerySchema.parse({ resource: "groups", id })
                return requestOk<{ id: string }>({
                    path: paths.thesis,
                    method: "DELETE",
                    query: q,
                })
            },

            listMembers: async (groupId: string) => {
                const q = thesisContracts.membersGetQuerySchema.parse({ resource: "members", groupId })
                return requestOk<{ members: any[] }>({
                    path: paths.thesis,
                    method: "GET",
                    query: q,
                })
            },

            addMember: async (body: unknown) => {
                const b = thesisContracts.addMemberBodySchema.parse(body)
                return requestOk<{ member: any }>({
                    path: paths.thesis,
                    method: "POST",
                    query: { resource: "members" },
                    body: b,
                })
            },

            setMembers: async (body: unknown) => {
                const b = thesisContracts.setMembersBodySchema.parse(body)
                return requestOk<{ members: any[] }>({
                    path: paths.thesis,
                    method: "PATCH",
                    query: { resource: "members" },
                    body: b,
                })
            },

            removeMember: async (groupId: string, studentId: string) => {
                const q = thesisContracts.deleteMemberQuerySchema.parse({ resource: "members", groupId, studentId })
                return requestOk<{ member: any }>({
                    path: paths.thesis,
                    method: "DELETE",
                    query: q,
                })
            },
        },

        schedule: {
            listSchedules: async (input?: {
                q?: string
                groupId?: string
                status?: string
                from?: string
                to?: string
                limit?: number
                offset?: number
            }) => {
                const q = scheduleContracts.schedulesGetQuerySchema.parse({
                    resource: "schedules",
                    q: input?.q ?? "",
                    groupId: input?.groupId ?? undefined,
                    status: input?.status ?? undefined,
                    from: input?.from ?? undefined,
                    to: input?.to ?? undefined,
                    limit: input?.limit ?? undefined,
                    offset: input?.offset ?? undefined,
                })
                return requestOk<{ total: number; schedules: any[] }>({
                    path: paths.schedule,
                    method: "GET",
                    query: q,
                })
            },

            getScheduleById: async (id: string) => {
                const q = scheduleContracts.schedulesGetQuerySchema.parse({ resource: "schedules", id })
                return requestOk<{ schedule: any }>({
                    path: paths.schedule,
                    method: "GET",
                    query: q,
                })
            },

            createSchedule: async (body: unknown) => {
                const b = scheduleContracts.createScheduleBodySchema.parse(body)
                return requestOk<{ schedule: any }>({
                    path: paths.schedule,
                    method: "POST",
                    query: { resource: "schedules" },
                    body: b,
                })
            },

            updateSchedule: async (id: string, patch: unknown) => {
                const b = scheduleContracts.updateScheduleBodySchema.parse(patch)
                return requestOk<{ schedule: any }>({
                    path: paths.schedule,
                    method: "PATCH",
                    query: { resource: "schedules", id },
                    body: b,
                })
            },

            deleteSchedule: async (id: string) => {
                const q = scheduleContracts.deleteScheduleQuerySchema.parse({ resource: "schedules", id })
                return requestOk<{ id: string }>({
                    path: paths.schedule,
                    method: "DELETE",
                    query: q,
                })
            },

            listPanelists: async (scheduleId: string) => {
                const q = scheduleContracts.panelistsGetQuerySchema.parse({ resource: "panelists", scheduleId })
                return requestOk<{ panelists: any[] }>({
                    path: paths.schedule,
                    method: "GET",
                    query: q,
                })
            },

            addPanelist: async (body: unknown) => {
                const b = scheduleContracts.addPanelistBodySchema.parse(body)
                return requestOk<{ panelist: any }>({
                    path: paths.schedule,
                    method: "POST",
                    query: { resource: "panelists" },
                    body: b,
                })
            },

            setPanelists: async (body: unknown) => {
                const b = scheduleContracts.setPanelistsBodySchema.parse(body)
                return requestOk<{ panelists: any[] }>({
                    path: paths.schedule,
                    method: "PATCH",
                    query: { resource: "panelists" },
                    body: b,
                })
            },

            removePanelist: async (scheduleId: string, staffId: string) => {
                const q = scheduleContracts.deletePanelistQuerySchema.parse({ resource: "panelists", scheduleId, staffId })
                return requestOk<{ panelist: any }>({
                    path: paths.schedule,
                    method: "DELETE",
                    query: q,
                })
            },
        },

        evaluation: {
            listRubricTemplates: async (input?: { q?: string; limit?: number; offset?: number }) => {
                const q = evaluationContracts.getRubricTemplatesQuerySchema.parse({
                    resource: "rubricTemplates",
                    q: input?.q ?? "",
                    limit: input?.limit ?? undefined,
                    offset: input?.offset ?? undefined,
                })
                return requestOk<{ total: number; templates: any[] }>({
                    path: paths.evaluation,
                    method: "GET",
                    query: q,
                })
            },

            getRubricTemplateById: async (id: string) => {
                const q = evaluationContracts.getRubricTemplatesQuerySchema.parse({ resource: "rubricTemplates", id })
                return requestOk<{ template: any }>({
                    path: paths.evaluation,
                    method: "GET",
                    query: q,
                })
            },

            createRubricTemplate: async (body: unknown) => {
                const b = evaluationContracts.createRubricTemplateBodySchema.parse(body)
                return requestOk<{ template: any }>({
                    path: paths.evaluation,
                    method: "POST",
                    query: { resource: "rubricTemplates" },
                    body: b,
                })
            },

            listRubricCriteria: async (templateId: string) => {
                const q = evaluationContracts.getRubricCriteriaQuerySchema.parse({ resource: "rubricCriteria", templateId })
                return requestOk<{ criteria: any[] }>({
                    path: paths.evaluation,
                    method: "GET",
                    query: q,
                })
            },

            createRubricCriterion: async (body: unknown) => {
                const b = evaluationContracts.createRubricCriterionBodySchema.parse(body)
                return requestOk<{ criterion: any }>({
                    path: paths.evaluation,
                    method: "POST",
                    query: { resource: "rubricCriteria" },
                    body: b,
                })
            },

            listEvaluations: async (input?: {
                scheduleId?: string
                evaluatorId?: string
                status?: string
                limit?: number
                offset?: number
            }) => {
                const q = evaluationContracts.getEvaluationsQuerySchema.parse({
                    resource: "evaluations",
                    scheduleId: input?.scheduleId ?? undefined,
                    evaluatorId: input?.evaluatorId ?? undefined,
                    status: input?.status ?? undefined,
                    limit: input?.limit ?? undefined,
                    offset: input?.offset ?? undefined,
                })
                return requestOk<{ evaluations: any[] }>({
                    path: paths.evaluation,
                    method: "GET",
                    query: q,
                })
            },

            getEvaluationById: async (id: string) => {
                const q = evaluationContracts.getEvaluationsQuerySchema.parse({ resource: "evaluations", id })
                return requestOk<{ evaluation: any }>({
                    path: paths.evaluation,
                    method: "GET",
                    query: q,
                })
            },

            getEvaluationByAssignment: async (scheduleId: string, evaluatorId: string) => {
                const q = evaluationContracts.getEvaluationsQuerySchema.parse({
                    resource: "evaluations",
                    scheduleId,
                    evaluatorId,
                    byAssignment: true,
                })
                return requestOk<{ evaluation: any }>({
                    path: paths.evaluation,
                    method: "GET",
                    query: q,
                })
            },

            createEvaluation: async (body: unknown) => {
                const b = evaluationContracts.createEvaluationBodySchema.parse(body)
                return requestOk<{ evaluation: any }>({
                    path: paths.evaluation,
                    method: "POST",
                    query: { resource: "evaluations" },
                    body: b,
                })
            },

            listEvaluationScores: async (evaluationId: string) => {
                const q = evaluationContracts.getEvaluationScoresQuerySchema.parse({ resource: "evaluationScores", evaluationId })
                return requestOk<{ scores: any[] }>({
                    path: paths.evaluation,
                    method: "GET",
                    query: q,
                })
            },

            upsertEvaluationScore: async (body: unknown) => {
                const b = evaluationContracts.upsertEvaluationScoreBodySchema.parse(body)
                return requestOk<{ score: any }>({
                    path: paths.evaluation,
                    method: "POST",
                    query: { resource: "evaluationScores" },
                    body: b,
                })
            },

            bulkUpsertEvaluationScores: async (body: unknown) => {
                const b = evaluationContracts.bulkUpsertEvaluationScoresBodySchema.parse(body)
                return requestOk<{ scores: any[] }>({
                    path: paths.evaluation,
                    method: "POST",
                    query: { resource: "evaluationScoresBulk" },
                    body: b,
                })
            },

            listStudentEvaluations: async (input?: {
                scheduleId?: string
                studentId?: string
                status?: string
                limit?: number
                offset?: number
            }) => {
                const q = evaluationContracts.getStudentEvaluationsQuerySchema.parse({
                    resource: "studentEvaluations",
                    scheduleId: input?.scheduleId ?? undefined,
                    studentId: input?.studentId ?? undefined,
                    status: input?.status ?? undefined,
                    limit: input?.limit ?? undefined,
                    offset: input?.offset ?? undefined,
                })
                return requestOk<{ items: any[] }>({
                    path: paths.evaluation,
                    method: "GET",
                    query: q,
                })
            },

            upsertStudentEvaluation: async (body: unknown) => {
                const b = evaluationContracts.upsertStudentEvaluationBodySchema.parse(body)
                return requestOk<{ studentEvaluation: any }>({
                    path: paths.evaluation,
                    method: "POST",
                    query: { resource: "studentEvaluations" },
                    body: b,
                })
            },
        },

        profiles: {
            listUsers: async (input?: { q?: string; role?: string; status?: string; limit?: number; offset?: number }) => {
                const q = profileContracts.usersGetQuerySchema.parse({
                    resource: "users",
                    q: input?.q ?? "",
                    role: input?.role ?? undefined,
                    status: input?.status ?? undefined,
                    limit: input?.limit ?? undefined,
                    offset: input?.offset ?? undefined,
                })
                return requestOk<{ total: number; users: any[] }>({
                    path: paths.profiles,
                    method: "GET",
                    query: q,
                })
            },

            getUserById: async (id: string) => {
                const q = profileContracts.usersGetQuerySchema.parse({ resource: "users", id })
                return requestOk<{ user: any }>({
                    path: paths.profiles,
                    method: "GET",
                    query: q,
                })
            },

            updateUser: async (id: string, patch: unknown) => {
                const b = profileContracts.patchUserBodySchema.parse(patch)
                return requestOk<{ user: any }>({
                    path: paths.profiles,
                    method: "PATCH",
                    query: { resource: "users", id },
                    body: b,
                })
            },

            getStudentProfile: async (userId: string) => {
                const q = profileContracts.studentProfileGetQuerySchema.parse({ resource: "students", userId })
                return requestOk<{ profile: any }>({
                    path: paths.profiles,
                    method: "GET",
                    query: q,
                })
            },

            upsertStudentProfile: async (body: unknown) => {
                const b = profileContracts.upsertStudentProfileBodySchema.parse(body)
                return requestOk<{ profile: any }>({
                    path: paths.profiles,
                    method: "POST",
                    query: { resource: "students" },
                    body: b,
                })
            },

            getStaffProfile: async (userId: string) => {
                const q = profileContracts.staffProfileGetQuerySchema.parse({ resource: "staffProfiles", userId })
                return requestOk<{ profile: any }>({
                    path: paths.profiles,
                    method: "GET",
                    query: q,
                })
            },

            upsertStaffProfile: async (body: unknown) => {
                const b = profileContracts.upsertStaffProfileBodySchema.parse(body)
                return requestOk<{ profile: any }>({
                    path: paths.profiles,
                    method: "POST",
                    query: { resource: "staffProfiles" },
                    body: b,
                })
            },
        },
    }
}
