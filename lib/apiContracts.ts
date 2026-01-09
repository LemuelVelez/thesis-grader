
import { z } from "zod"
import {
    zUuid,
    zLimit,
    zOffset,
    zBoolFromString,
    zDateTimeString,
    zNonEmptyString,
} from "@/lib/validate"

/**
 * Shared API contracts (client + server).
 * - Request schemas: query/body validation + defaults
 * - Basic envelope schema: { ok: boolean, ... }
 */

export const apiEnvelopeSchema = z.object({ ok: z.boolean() }).passthrough()
export type ApiEnvelope = z.infer<typeof apiEnvelopeSchema>

/* ----------------------------- THESIS CONTRACTS ---------------------------- */

export const thesisContracts = {
    resourceSchema: z.enum(["groups", "members"]),
    baseQuerySchema: z.object({
        resource: z.enum(["groups", "members"]).default("groups"),
    }),

    // GET
    groupsGetQuerySchema: z.object({
        resource: z.literal("groups"),
        id: zUuid.optional(),
        q: z.string().optional().default(""),
        limit: zLimit,
        offset: zOffset,
    }),

    membersGetQuerySchema: z.object({
        resource: z.literal("members"),
        groupId: zUuid,
    }),

    // POST
    createGroupBodySchema: z.object({
        title: zNonEmptyString("title"),
        adviserId: zUuid.nullable().optional(),
        program: z.string().nullable().optional(),
        term: z.string().nullable().optional(),
    }),

    addMemberBodySchema: z.object({
        groupId: zUuid,
        studentId: zUuid,
    }),

    // PATCH
    updateGroupBodySchema: z.object({
        id: zUuid.optional(),
        title: z.string().trim().min(1).optional(),
        adviserId: zUuid.nullable().optional(),
        program: z.string().nullable().optional(),
        term: z.string().nullable().optional(),
    }),

    setMembersBodySchema: z.object({
        groupId: zUuid,
        studentIds: z.array(zUuid).default([]),
    }),

    // DELETE
    deleteGroupQuerySchema: z.object({
        resource: z.literal("groups").default("groups"),
        id: zUuid,
    }),

    deleteMemberQuerySchema: z.object({
        resource: z.literal("members"),
        groupId: zUuid,
        studentId: zUuid,
    }),
}

export type ThesisResource = z.infer<typeof thesisContracts.resourceSchema>
export type ThesisGroupsGetQuery = z.infer<typeof thesisContracts.groupsGetQuerySchema>
export type ThesisMembersGetQuery = z.infer<typeof thesisContracts.membersGetQuerySchema>
export type ThesisCreateGroupBody = z.infer<typeof thesisContracts.createGroupBodySchema>
export type ThesisAddMemberBody = z.infer<typeof thesisContracts.addMemberBodySchema>
export type ThesisUpdateGroupBody = z.infer<typeof thesisContracts.updateGroupBodySchema>
export type ThesisSetMembersBody = z.infer<typeof thesisContracts.setMembersBodySchema>

/* ---------------------------- SCHEDULE CONTRACTS --------------------------- */

export const scheduleContracts = {
    resourceSchema: z.enum(["schedules", "panelists"]),
    baseQuerySchema: z.object({
        resource: z.enum(["schedules", "panelists"]).default("schedules"),
    }),

    // GET
    schedulesGetQuerySchema: z.object({
        resource: z.literal("schedules"),
        id: zUuid.optional(),
        q: z.string().optional().default(""),
        groupId: zUuid.optional(),
        status: z.string().optional(),
        from: zDateTimeString.optional(),
        to: zDateTimeString.optional(),
        limit: zLimit,
        offset: zOffset,
    }),

    panelistsGetQuerySchema: z.object({
        resource: z.literal("panelists"),
        scheduleId: zUuid,
    }),

    // POST
    createScheduleBodySchema: z.object({
        groupId: zUuid,
        scheduledAt: zDateTimeString,
        room: z.string().nullable().optional(),
        status: z.string().optional(),
        createdBy: zUuid.nullable().optional(),
    }),

    addPanelistBodySchema: z.object({
        scheduleId: zUuid,
        staffId: zUuid,
    }),

    // PATCH
    updateScheduleBodySchema: z.object({
        id: zUuid.optional(),
        groupId: zUuid.optional(),
        scheduledAt: zDateTimeString.optional(),
        room: z.string().nullable().optional(),
        status: z.string().optional(),
        createdBy: zUuid.nullable().optional(),
    }),

    setPanelistsBodySchema: z.object({
        scheduleId: zUuid,
        staffIds: z.array(zUuid).default([]),
    }),

    // DELETE
    deleteScheduleQuerySchema: z.object({
        resource: z.literal("schedules").default("schedules"),
        id: zUuid,
    }),

    deletePanelistQuerySchema: z.object({
        resource: z.literal("panelists"),
        scheduleId: zUuid,
        staffId: zUuid,
    }),
}

export type ScheduleResource = z.infer<typeof scheduleContracts.resourceSchema>
export type SchedulesGetQuery = z.infer<typeof scheduleContracts.schedulesGetQuerySchema>
export type PanelistsGetQuery = z.infer<typeof scheduleContracts.panelistsGetQuerySchema>
export type CreateScheduleBody = z.infer<typeof scheduleContracts.createScheduleBodySchema>
export type AddPanelistBody = z.infer<typeof scheduleContracts.addPanelistBodySchema>
export type UpdateScheduleBody = z.infer<typeof scheduleContracts.updateScheduleBodySchema>
export type SetPanelistsBody = z.infer<typeof scheduleContracts.setPanelistsBodySchema>

/* --------------------------- EVALUATION CONTRACTS -------------------------- */

export const evaluationContracts = {
    resourceSchema: z.enum([
        "rubricTemplates",
        "rubricCriteria",
        "evaluations",
        "evaluationScores",
        "evaluationScoresBulk",
        "studentEvaluations",
    ]),
    baseQuerySchema: z.object({
        resource: z
            .enum([
                "rubricTemplates",
                "rubricCriteria",
                "evaluations",
                "evaluationScores",
                "evaluationScoresBulk",
                "studentEvaluations",
            ])
            .default("rubricTemplates"),
    }),

    // GET
    getRubricTemplatesQuerySchema: z.object({
        resource: z.literal("rubricTemplates"),
        id: zUuid.optional(),
        q: z.string().optional().default(""),
        limit: zLimit,
        offset: zOffset,
    }),

    getRubricCriteriaQuerySchema: z.object({
        resource: z.literal("rubricCriteria"),
        templateId: zUuid,
    }),

    getEvaluationsQuerySchema: z.object({
        resource: z.literal("evaluations"),
        id: zUuid.optional(),
        scheduleId: zUuid.optional(),
        evaluatorId: zUuid.optional(),
        status: z.string().optional(),
        byAssignment: zBoolFromString.optional(),
        limit: zLimit,
        offset: zOffset,
    }),

    getEvaluationScoresQuerySchema: z.object({
        resource: z.literal("evaluationScores"),
        evaluationId: zUuid,
    }),

    getStudentEvaluationsQuerySchema: z.object({
        resource: z.literal("studentEvaluations"),
        id: zUuid.optional(),
        scheduleId: zUuid.optional(),
        studentId: zUuid.optional(),
        status: z.string().optional(),
        limit: zLimit,
        offset: zOffset,
    }),

    // POST
    createRubricTemplateBodySchema: z.object({
        name: zNonEmptyString("name"),
        description: z.string().nullable().optional(),
        version: z.coerce.number().int().min(1).optional(),
        active: z.coerce.boolean().optional(),
    }),

    createRubricCriterionBodySchema: z.object({
        templateId: zUuid,
        criterion: zNonEmptyString("criterion"),
        description: z.string().nullable().optional(),
        weight: z.coerce.number().positive().optional(),
        minScore: z.coerce.number().int().min(0).optional(),
        maxScore: z.coerce.number().int().min(1).optional(),
    }),

    createEvaluationBodySchema: z.object({
        scheduleId: zUuid,
        evaluatorId: zUuid,
        status: z.string().optional(),
    }),

    upsertEvaluationScoreBodySchema: z.object({
        evaluationId: zUuid,
        criterionId: zUuid,
        score: z.coerce.number().int(),
        comment: z.string().nullable().optional(),
    }),

    bulkUpsertEvaluationScoresBodySchema: z.object({
        evaluationId: zUuid,
        items: z
            .array(
                z.object({
                    criterionId: zUuid,
                    score: z.coerce.number().int(),
                    comment: z.string().nullable().optional(),
                })
            )
            .min(1),
    }),

    upsertStudentEvaluationBodySchema: z.object({
        scheduleId: zUuid,
        studentId: zUuid,
        status: z.enum(["pending", "submitted", "locked"]).optional(),
        answers: z.unknown().optional(),
        submittedAt: zDateTimeString.nullable().optional(),
        lockedAt: zDateTimeString.nullable().optional(),
    }),

    // PATCH
    patchRubricTemplateBodySchema: z.object({
        id: zUuid.optional(),
        name: z.string().trim().min(1).optional(),
        description: z.string().nullable().optional(),
        version: z.coerce.number().int().min(1).optional(),
        active: z.coerce.boolean().optional(),
    }),

    patchRubricCriterionBodySchema: z.object({
        id: zUuid.optional(),
        criterion: z.string().trim().min(1).optional(),
        description: z.string().nullable().optional(),
        weight: z.coerce.number().positive().optional(),
        minScore: z.coerce.number().int().min(0).optional(),
        maxScore: z.coerce.number().int().min(1).optional(),
    }),

    patchEvaluationBodySchema: z.object({
        id: zUuid.optional(),
        status: z.string().optional(),
        submittedAt: zDateTimeString.nullable().optional(),
        lockedAt: zDateTimeString.nullable().optional(),
    }),

    patchStudentEvaluationBodySchema: z.object({
        id: zUuid.optional(),
        status: z.enum(["pending", "submitted", "locked"]).optional(),
        answers: z.unknown().optional(),
        submittedAt: zDateTimeString.nullable().optional(),
        lockedAt: zDateTimeString.nullable().optional(),
    }),

    // DELETE
    deleteRubricTemplateQuerySchema: z.object({
        resource: z.literal("rubricTemplates"),
        id: zUuid,
    }),

    deleteRubricCriterionQuerySchema: z.object({
        resource: z.literal("rubricCriteria"),
        id: zUuid,
    }),

    deleteEvaluationScoresQuerySchema: z.object({
        resource: z.literal("evaluationScores"),
        evaluationId: zUuid,
    }),

    deleteStudentEvaluationQuerySchema: z.object({
        resource: z.literal("studentEvaluations"),
        id: zUuid,
    }),
}

export type EvaluationResource = z.infer<typeof evaluationContracts.resourceSchema>

/* ----------------------------- PROFILE CONTRACTS --------------------------- */

export const profileContracts = {
    resourceSchema: z.enum(["users", "students", "staffProfiles"]),
    baseQuerySchema: z.object({
        resource: z.enum(["users", "students", "staffProfiles"]).default("users"),
    }),

    // GET
    usersGetQuerySchema: z.object({
        resource: z.literal("users"),
        id: zUuid.optional(),
        q: z.string().optional().default(""),
        role: z.string().optional(),
        status: z.string().optional(),
        limit: zLimit,
        offset: zOffset,
    }),

    studentProfileGetQuerySchema: z.object({
        resource: z.literal("students"),
        userId: zUuid,
    }),

    staffProfileGetQuerySchema: z.object({
        resource: z.literal("staffProfiles"),
        userId: zUuid,
    }),

    // POST
    upsertStudentProfileBodySchema: z.object({
        userId: zUuid,
        program: z.string().nullable().optional(),
        section: z.string().nullable().optional(),
    }),

    upsertStaffProfileBodySchema: z.object({
        userId: zUuid,
        department: z.string().nullable().optional(),
    }),

    // PATCH
    patchUserBodySchema: z.object({
        id: zUuid.optional(),
        name: z.string().trim().min(1).optional(),
        email: z.string().email().optional(),
        role: z.enum(["student", "staff", "admin"]).optional(),
        status: z.enum(["active", "disabled"]).optional(),
        avatarKey: z.string().nullable().optional(),
    }),
}

export type ProfileResource = z.infer<typeof profileContracts.resourceSchema>
