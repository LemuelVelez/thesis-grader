/**
 * Central database service contracts for Thesis Grader.
 *
 * This file is intentionally implementation-agnostic:
 * - it defines the shape of service-layer APIs
 * - it provides strongly-typed mapping between DB entities and services
 * - concrete implementations (e.g., pg/knex/prisma) should satisfy these contracts
 */

import type {
    AuditLogInsert,
    AuditLogPatch,
    AuditLogRow,
    DatabaseModels,
    DbEntityName,
    DefenseScheduleInsert,
    DefenseSchedulePatch,
    DefenseScheduleRow,
    EvaluationExtraInsert,
    EvaluationExtraPatch,
    EvaluationExtraRow,
    EvaluationInsert,
    EvaluationOverallPercentageRow,
    EvaluationPatch,
    EvaluationRow,
    EvaluationScoreInsert,
    EvaluationScorePatch,
    EvaluationScoreRow,
    EvaluationStatus,
    GroupMemberInsert,
    GroupMemberRow,
    ISODateTime,
    JsonObject,
    NotificationInsert,
    NotificationPatch,
    NotificationRow,
    NotificationType,
    PanelistProfileInsert,
    PanelistProfilePatch,
    PanelistProfileRow,
    PasswordResetInsert,
    PasswordResetPatch,
    PasswordResetRow,
    RubricCriteriaInsert,
    RubricCriteriaPatch,
    RubricCriteriaRow,
    RubricScaleLevelInsert,
    RubricScaleLevelPatch,
    RubricScaleLevelRow,
    RubricTemplateInsert,
    RubricTemplatePatch,
    RubricTemplateRow,
    SchedulePanelistInsert,
    SchedulePanelistRow,
    SessionInsert,
    SessionPatch,
    SessionRow,
    StaffProfileInsert,
    StaffProfilePatch,
    StaffProfileRow,
    StudentEvalStatus,
    StudentEvaluationInsert,
    StudentEvaluationPatch,
    StudentEvaluationRow,
    StudentInsert,
    StudentPatch,
    StudentRow,
    TableName,
    ThesisGroupInsert,
    ThesisGroupPatch,
    ThesisGroupRankingRow,
    ThesisGroupRow,
    ThesisRole,
    UserInsert,
    UserPatch,
    UserRow,
    UserStatus,
    UUID,
    ViewName,
} from '../models/Model';

/* -------------------------------------------------------------------------- */
/*                                  CORE TYPES                                */
/* -------------------------------------------------------------------------- */

export type SortDirection = 'asc' | 'desc';

export interface ListQuery<Row extends object> {
    where?: Partial<Row>;
    limit?: number;
    offset?: number;
    orderBy?: keyof Row;
    orderDirection?: SortDirection;
}

export interface PageResult<Row> {
    items: Row[];
    total: number;
    limit: number;
    offset: number;
}

export interface ReadonlyService<Row extends object> {
    findOne(where: Partial<Row>): Promise<Row | null>;
    findMany(query?: ListQuery<Row>): Promise<Row[]>;
    count(where?: Partial<Row>): Promise<number>;
    exists(where: Partial<Row>): Promise<boolean>;
    findPage(query?: ListQuery<Row>): Promise<PageResult<Row>>;
}

export interface TableService<Row extends object, Insert extends object, Patch extends object>
    extends ReadonlyService<Row> {
    create(payload: Insert): Promise<Row>;
    createMany(payloads: Insert[]): Promise<Row[]>;
    update(where: Partial<Row>, patch: Patch): Promise<Row[]>;
    updateOne(where: Partial<Row>, patch: Patch): Promise<Row | null>;
    delete(where: Partial<Row>): Promise<number>;
    upsert(where: Partial<Row>, create: Insert, patch?: Patch): Promise<Row>;
}

/**
 * Join/link tables usually do not need "update" semantics.
 */
export interface JoinTableService<Row extends object, Insert extends object>
    extends ReadonlyService<Row> {
    create(payload: Insert): Promise<Row>;
    createMany(payloads: Insert[]): Promise<Row[]>;
    delete(where: Partial<Row>): Promise<number>;
}

/* -------------------------------------------------------------------------- */
/*                      ENTITY -> INSERT/PATCH TYPE MAPS                      */
/* -------------------------------------------------------------------------- */

export type TableRowMap = Pick<DatabaseModels, TableName>;
export type ViewRowMap = Pick<DatabaseModels, ViewName>;

export interface PushSubscriptionRow {
    id: UUID;
    user_id: UUID;
    endpoint: string;
    p256dh: string;
    auth: string;
    content_encoding: string | null;
    subscription: JsonObject;
    created_at: ISODateTime;
    updated_at: ISODateTime;
}

export interface PushSubscriptionInsert {
    user_id: UUID;
    endpoint: string;
    p256dh: string;
    auth: string;
    content_encoding?: string | null;
    subscription?: JsonObject;
    created_at?: ISODateTime;
    updated_at?: ISODateTime;
}

export interface PushSubscriptionPatch {
    user_id?: UUID;
    endpoint?: string;
    p256dh?: string;
    auth?: string;
    content_encoding?: string | null;
    subscription?: JsonObject;
    updated_at?: ISODateTime;
}

export interface TableInsertMap {
    users: UserInsert;
    sessions: SessionInsert;
    password_resets: PasswordResetInsert;
    thesis_groups: ThesisGroupInsert;
    group_members: GroupMemberInsert;
    defense_schedules: DefenseScheduleInsert;
    schedule_panelists: SchedulePanelistInsert;
    rubric_templates: RubricTemplateInsert;
    rubric_criteria: RubricCriteriaInsert;
    evaluations: EvaluationInsert;
    evaluation_scores: EvaluationScoreInsert;
    audit_logs: AuditLogInsert;
    students: StudentInsert;
    staff_profiles: StaffProfileInsert;
    student_evaluations: StudentEvaluationInsert;
    evaluation_extras: EvaluationExtraInsert;
    panelist_profiles: PanelistProfileInsert;
    rubric_scale_levels: RubricScaleLevelInsert;
    notifications: NotificationInsert;
    push_subscriptions: PushSubscriptionInsert;
}

export interface TablePatchMap {
    users: UserPatch;
    sessions: SessionPatch;
    password_resets: PasswordResetPatch;
    thesis_groups: ThesisGroupPatch;
    group_members: Partial<GroupMemberRow>;
    defense_schedules: DefenseSchedulePatch;
    schedule_panelists: Partial<SchedulePanelistRow>;
    rubric_templates: RubricTemplatePatch;
    rubric_criteria: RubricCriteriaPatch;
    evaluations: EvaluationPatch;
    evaluation_scores: EvaluationScorePatch;
    audit_logs: AuditLogPatch;
    students: StudentPatch;
    staff_profiles: StaffProfilePatch;
    student_evaluations: StudentEvaluationPatch;
    evaluation_extras: EvaluationExtraPatch;
    panelist_profiles: PanelistProfilePatch;
    rubric_scale_levels: RubricScaleLevelPatch;
    notifications: NotificationPatch;
    push_subscriptions: PushSubscriptionPatch;
}

/* -------------------------------------------------------------------------- */
/*                              TABLE SERVICES                                */
/* -------------------------------------------------------------------------- */

export interface UsersService extends TableService<UserRow, UserInsert, UserPatch> {
    findById(id: UUID): Promise<UserRow | null>;
    findByEmail(email: string): Promise<UserRow | null>;
    listByRole(role: ThesisRole, query?: Omit<ListQuery<UserRow>, 'where'>): Promise<UserRow[]>;
    setStatus(userId: UUID, status: UserStatus): Promise<UserRow | null>;
    setAvatarKey(userId: UUID, avatarKey: string | null): Promise<UserRow | null>;
}

export interface SessionsService extends TableService<SessionRow, SessionInsert, SessionPatch> {
    findById(id: UUID): Promise<SessionRow | null>;
    findByTokenHash(tokenHash: string): Promise<SessionRow | null>;
    revokeByUser(userId: UUID): Promise<number>;
    revokeExpired(now?: ISODateTime): Promise<number>;
}

export interface PasswordResetsService
    extends TableService<PasswordResetRow, PasswordResetInsert, PasswordResetPatch> {
    findById(id: UUID): Promise<PasswordResetRow | null>;
    findByTokenHash(tokenHash: string): Promise<PasswordResetRow | null>;
    markUsed(id: UUID, usedAt?: ISODateTime): Promise<PasswordResetRow | null>;
    purgeExpired(now?: ISODateTime): Promise<number>;
}

export interface ThesisGroupsService
    extends TableService<ThesisGroupRow, ThesisGroupInsert, ThesisGroupPatch> {
    findById(id: UUID): Promise<ThesisGroupRow | null>;
    listByAdviser(adviserId: UUID): Promise<ThesisGroupRow[]>;
}

export interface GroupMembersService
    extends JoinTableService<GroupMemberRow, GroupMemberInsert> {
    listByGroup(groupId: UUID): Promise<GroupMemberRow[]>;
    listByStudent(studentId: UUID): Promise<GroupMemberRow[]>;
    removeMember(groupId: UUID, studentId: UUID): Promise<number>;
}

export interface DefenseSchedulesService
    extends TableService<DefenseScheduleRow, DefenseScheduleInsert, DefenseSchedulePatch> {
    findById(id: UUID): Promise<DefenseScheduleRow | null>;
    listByGroup(groupId: UUID): Promise<DefenseScheduleRow[]>;
    listByPanelist(staffId: UUID): Promise<DefenseScheduleRow[]>;
    setStatus(id: UUID, status: DefenseScheduleRow['status']): Promise<DefenseScheduleRow | null>;
}

export interface SchedulePanelistsService
    extends JoinTableService<SchedulePanelistRow, SchedulePanelistInsert> {
    listBySchedule(scheduleId: UUID): Promise<SchedulePanelistRow[]>;
    listByStaff(staffId: UUID): Promise<SchedulePanelistRow[]>;
    removePanelist(scheduleId: UUID, staffId: UUID): Promise<number>;
}

export interface RubricTemplatesService
    extends TableService<RubricTemplateRow, RubricTemplateInsert, RubricTemplatePatch> {
    findById(id: UUID): Promise<RubricTemplateRow | null>;
    listActive(): Promise<RubricTemplateRow[]>;
    getActiveLatest(): Promise<RubricTemplateRow | null>;
    setActive(templateId: UUID, active: boolean): Promise<RubricTemplateRow | null>;
}

export interface RubricCriteriaService
    extends TableService<RubricCriteriaRow, RubricCriteriaInsert, RubricCriteriaPatch> {
    findById(id: UUID): Promise<RubricCriteriaRow | null>;
    listByTemplate(templateId: UUID): Promise<RubricCriteriaRow[]>;
}

export interface EvaluationsService
    extends TableService<EvaluationRow, EvaluationInsert, EvaluationPatch> {
    findById(id: UUID): Promise<EvaluationRow | null>;
    listBySchedule(scheduleId: UUID): Promise<EvaluationRow[]>;
    listByEvaluator(evaluatorId: UUID): Promise<EvaluationRow[]>;
    submit(evaluationId: UUID, submittedAt?: ISODateTime): Promise<EvaluationRow | null>;
    lock(evaluationId: UUID, lockedAt?: ISODateTime): Promise<EvaluationRow | null>;
    setStatus(evaluationId: UUID, status: EvaluationStatus): Promise<EvaluationRow | null>;
}

export interface EvaluationScoresService
    extends TableService<EvaluationScoreRow, EvaluationScoreInsert, EvaluationScorePatch> {
    listByEvaluation(evaluationId: UUID): Promise<EvaluationScoreRow[]>;
    upsertScore(payload: EvaluationScoreInsert): Promise<EvaluationScoreRow>;
}

export interface AuditLogsService extends TableService<AuditLogRow, AuditLogInsert, AuditLogPatch> {
    findById(id: UUID): Promise<AuditLogRow | null>;
    listByActor(actorId: UUID): Promise<AuditLogRow[]>;
    listByEntity(entity: string, entityId?: UUID): Promise<AuditLogRow[]>;
}

export interface StudentsService extends TableService<StudentRow, StudentInsert, StudentPatch> {
    findByUserId(userId: UUID): Promise<StudentRow | null>;
}

export interface StaffProfilesService
    extends TableService<StaffProfileRow, StaffProfileInsert, StaffProfilePatch> {
    findByUserId(userId: UUID): Promise<StaffProfileRow | null>;
}

/**
 * Student Evaluations are feedback/survey/reflection entries (NOT grading scores).
 * answers: JsonObject allows flexible form sections (peer/self/adviser/panel/process quality/satisfaction/etc.)
 */
export interface StudentEvaluationsService
    extends TableService<StudentEvaluationRow, StudentEvaluationInsert, StudentEvaluationPatch> {
    findById(id: UUID): Promise<StudentEvaluationRow | null>;
    listBySchedule(scheduleId: UUID): Promise<StudentEvaluationRow[]>;
    listByStudent(studentId: UUID): Promise<StudentEvaluationRow[]>;
    submit(id: UUID, submittedAt?: ISODateTime): Promise<StudentEvaluationRow | null>;
    lock(id: UUID, lockedAt?: ISODateTime): Promise<StudentEvaluationRow | null>;
    setStatus(id: UUID, status: StudentEvalStatus): Promise<StudentEvaluationRow | null>;

    /**
     * Optional convenience helpers (safe to omit in implementations).
     * Controllers can always fall back to findOne/findMany/upsert.
     */
    findByScheduleAndStudent?: (
        scheduleId: UUID,
        studentId: UUID,
    ) => Promise<StudentEvaluationRow | null>;
}

export interface EvaluationExtrasService
    extends TableService<EvaluationExtraRow, EvaluationExtraInsert, EvaluationExtraPatch> {
    findByEvaluationId(evaluationId: UUID): Promise<EvaluationExtraRow | null>;
}

export interface PanelistProfilesService
    extends TableService<PanelistProfileRow, PanelistProfileInsert, PanelistProfilePatch> {
    findByUserId(userId: UUID): Promise<PanelistProfileRow | null>;
}

export interface RubricScaleLevelsService
    extends TableService<RubricScaleLevelRow, RubricScaleLevelInsert, RubricScaleLevelPatch> {
    listByTemplate(templateId: UUID): Promise<RubricScaleLevelRow[]>;
    findByTemplateAndScore(
        templateId: UUID,
        score: number,
    ): Promise<RubricScaleLevelRow | null>;
}

export type NotificationBroadcastPayload = Omit<NotificationInsert, 'user_id'>;

export interface NotificationsService
    extends TableService<NotificationRow, NotificationInsert, NotificationPatch> {
    findById(id: UUID): Promise<NotificationRow | null>;
    listByUser(userId: UUID, query?: Omit<ListQuery<NotificationRow>, 'where'>): Promise<NotificationRow[]>;
    listUnread(userId: UUID, limit?: number): Promise<NotificationRow[]>;
    listByType(
        userId: UUID,
        type: NotificationType,
        query?: Omit<ListQuery<NotificationRow>, 'where'>,
    ): Promise<NotificationRow[]>;
    markAsRead(id: UUID, readAt?: ISODateTime): Promise<NotificationRow | null>;
    markAllAsRead(userId: UUID, readAt?: ISODateTime): Promise<number>;
    createForUsers(userIds: UUID[], payload: NotificationBroadcastPayload): Promise<NotificationRow[]>;
}

export interface PushSubscriptionsService
    extends TableService<PushSubscriptionRow, PushSubscriptionInsert, PushSubscriptionPatch> {
    findById(id: UUID): Promise<PushSubscriptionRow | null>;
    findByEndpoint(endpoint: string): Promise<PushSubscriptionRow | null>;
    listByUser(userId: UUID): Promise<PushSubscriptionRow[]>;
    listByUsers(userIds: UUID[]): Promise<PushSubscriptionRow[]>;
    deleteByEndpoint(endpoint: string): Promise<number>;
}

/* -------------------------------------------------------------------------- */
/*                               VIEW SERVICES                                */
/* -------------------------------------------------------------------------- */

export interface EvaluationOverallPercentagesViewService
    extends ReadonlyService<EvaluationOverallPercentageRow> {
    listBySchedule(scheduleId: UUID): Promise<EvaluationOverallPercentageRow[]>;
    listByGroup(groupId: UUID): Promise<EvaluationOverallPercentageRow[]>;
    listByEvaluator(evaluatorId: UUID): Promise<EvaluationOverallPercentageRow[]>;
}

export interface ThesisGroupRankingsViewService
    extends ReadonlyService<ThesisGroupRankingRow> {
    leaderboard(limit?: number): Promise<ThesisGroupRankingRow[]>;
    byGroup(groupId: UUID): Promise<ThesisGroupRankingRow | null>;
}

/* -------------------------------------------------------------------------- */
/*                           SERVICE REGISTRY (ROOT)                          */
/* -------------------------------------------------------------------------- */

export interface TableServiceMap {
    users: UsersService;
    sessions: SessionsService;
    password_resets: PasswordResetsService;
    thesis_groups: ThesisGroupsService;
    group_members: GroupMembersService;
    defense_schedules: DefenseSchedulesService;
    schedule_panelists: SchedulePanelistsService;
    rubric_templates: RubricTemplatesService;
    rubric_criteria: RubricCriteriaService;
    evaluations: EvaluationsService;
    evaluation_scores: EvaluationScoresService;
    audit_logs: AuditLogsService;
    students: StudentsService;
    staff_profiles: StaffProfilesService;
    student_evaluations: StudentEvaluationsService;
    evaluation_extras: EvaluationExtrasService;
    panelist_profiles: PanelistProfilesService;
    rubric_scale_levels: RubricScaleLevelsService;
    notifications: NotificationsService;
    push_subscriptions: PushSubscriptionsService;
}

export interface ViewServiceMap {
    v_evaluation_overall_percentages: EvaluationOverallPercentagesViewService;
    v_thesis_group_rankings: ThesisGroupRankingsViewService;
}

export interface EntityServiceMap extends TableServiceMap, ViewServiceMap { }

export interface DatabaseServices extends EntityServiceMap {
    /**
     * Generic entity accessor when the caller only knows the entity name at runtime.
     */
    get<K extends DbEntityName>(entity: K): EntityServiceMap[K];

    /**
     * Execute service operations atomically.
     * Implementation should provide real DB transaction semantics.
     */
    transaction<T>(work: (services: DatabaseServices) => Promise<T>): Promise<T>;
}

export type Services = DatabaseServices;

/* -------------------------------------------------------------------------- */
/*                         COMPILE-TIME COVERAGE CHECKS                       */
/* -------------------------------------------------------------------------- */

/**
 * Ensures every DB entity has a corresponding service.
 */
export type EntityServiceCoverageCheck = {
    [K in DbEntityName]: K extends keyof EntityServiceMap ? true : never;
};

/**
 * Ensures no extra service keys exist outside declared DB entities.
 */
export type NoExtraEntityServiceKeysCheck = {
    [K in keyof EntityServiceMap]: K extends DbEntityName ? true : never;
};
