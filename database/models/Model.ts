/**
 * Central database model types for Thesis Grader
 * Based on migrations:
 * 001..014 in database/migration
 */

export type UUID = string;
export type ISODateTime = string;

/**
 * PostgreSQL NUMERIC columns may come back as string (default pg behavior)
 * unless a custom parser is configured.
 */
export type DbNumeric = number | `${number}`;

/** Keeps literal autocomplete while still allowing future text statuses */
export type LooseString<T extends string> = T | (string & {});

/* --------------------------------- JSON ---------------------------------- */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export interface JsonObject {
    [key: string]: JsonValue;
}

export interface JsonArray extends Array<JsonValue> { }

/* --------------------------------- ENUMS --------------------------------- */

export const THESIS_ROLES = ['student', 'staff', 'admin', 'panelist'] as const;
export type ThesisRole = (typeof THESIS_ROLES)[number];

export const USER_STATUSES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const STUDENT_EVAL_STATUSES = ['pending', 'submitted', 'locked'] as const;
export type StudentEvalStatus = (typeof STUDENT_EVAL_STATUSES)[number];

export const NOTIFICATION_TYPES = [
    'general',
    'evaluation_submitted',
    'evaluation_locked',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const EVALUATION_TARGET_TYPES = ['group', 'student'] as const;
export type EvaluationTargetType = (typeof EVALUATION_TARGET_TYPES)[number];

/**
 * Text statuses in schema (not strict SQL enum columns)
 */
export type DefenseScheduleStatus = LooseString<
    'scheduled' | 'ongoing' | 'completed' | 'cancelled'
>;

export type EvaluationStatus = LooseString<'pending' | 'submitted' | 'locked'>;

/* ------------------------------- TABLE ROWS ------------------------------- */

export interface UserRow {
    id: UUID;
    name: string;
    email: string;
    role: ThesisRole;
    status: UserStatus;
    password_hash: string;
    avatar_key: string | null;
    created_at: ISODateTime;
    updated_at: ISODateTime;
}

export interface SessionRow {
    id: UUID;
    user_id: UUID;
    token_hash: string;
    expires_at: ISODateTime;
    created_at: ISODateTime;
}

export interface PasswordResetRow {
    id: UUID;
    user_id: UUID;
    token_hash: string;
    expires_at: ISODateTime;
    used_at: ISODateTime | null;
    created_at: ISODateTime;
}

export interface ThesisGroupRow {
    id: UUID;
    title: string;
    adviser_id: UUID | null;
    program: string | null;
    term: string | null;
    created_at: ISODateTime;
    updated_at: ISODateTime;
}

/**
 * NOTE:
 * Extending Record<string, unknown> keeps required fields strongly typed
 * while allowing safe structural overlap with generic JSON-like records.
 * This prevents TS2352 when narrowing from Record<string, unknown>.
 */
export interface GroupMemberRow extends Record<string, unknown> {
    group_id: UUID;
    student_id: UUID;
}

export interface DefenseScheduleRow {
    id: UUID;
    group_id: UUID;
    scheduled_at: ISODateTime;
    room: string | null;
    status: DefenseScheduleStatus;
    created_by: UUID | null;
    rubric_template_id: UUID | null;

    /**
     * Pinned student feedback form used for student evaluation assignment for this schedule.
     * Added in migration 014 so assignments consistently use a single ACTIVE form version at time of assignment.
     */
    student_feedback_form_id: UUID | null;

    created_at: ISODateTime;
    updated_at: ISODateTime;
}

export interface SchedulePanelistRow {
    schedule_id: UUID;
    staff_id: UUID; // kept as staff_id in schema for compatibility
}

export interface RubricTemplateRow {
    id: UUID;
    name: string;
    version: number;
    active: boolean;
    description: string | null;
    created_at: ISODateTime;
    updated_at: ISODateTime;
}

export interface RubricCriteriaRow {
    id: UUID;
    template_id: UUID;
    criterion: string;
    description: string | null;
    weight: DbNumeric;
    min_score: number;
    max_score: number;
    created_at: ISODateTime;
}

export interface EvaluationRow {
    id: UUID;
    schedule_id: UUID;
    evaluator_id: UUID;
    status: EvaluationStatus;
    submitted_at: ISODateTime | null;
    locked_at: ISODateTime | null;
    created_at: ISODateTime;
}

export interface EvaluationScoreRow {
    /**
     * Added in migration 010 to support PATCH /api/evaluation-scores/:id
     * and unique scoring per target (group/student) per criterion.
     */
    id: UUID;
    evaluation_id: UUID;
    criterion_id: UUID;

    /**
     * Required by migration 010/011 for per-target persistence.
     * Must never be null once migration backfill is complete.
     */
    target_type: EvaluationTargetType;
    target_id: UUID;

    score: number;
    comment: string | null;
}

export interface AuditLogRow {
    id: UUID;
    actor_id: UUID | null;
    action: string;
    entity: string;
    entity_id: UUID | null;
    details: JsonValue | null;
    created_at: ISODateTime;
}

export interface StudentRow {
    user_id: UUID;
    program: string | null;
    section: string | null;
    created_at: ISODateTime;
}

export interface StaffProfileRow {
    user_id: UUID;
    department: string | null;
    created_at: ISODateTime;
}

export interface StudentEvaluationRow {
    id: UUID;
    schedule_id: UUID;
    student_id: UUID;

    /**
     * Tracks which feedback form definition/version was used for this evaluation.
     * Added in migration 013 to ensure scoring remains consistent over time.
     */
    form_id: UUID | null;

    status: StudentEvalStatus;
    answers: JsonObject;
    submitted_at: ISODateTime | null;
    locked_at: ISODateTime | null;
    created_at: ISODateTime;
    updated_at: ISODateTime;
}

/**
 * Persisted score summary for a student evaluation (feedback form).
 * Added in migration 013.
 */
export interface StudentEvaluationScoreRow {
    id: UUID;
    student_evaluation_id: UUID;
    schedule_id: UUID;
    student_id: UUID;
    form_id: UUID | null;

    total_score: DbNumeric;
    max_score: DbNumeric;
    percentage: DbNumeric;

    breakdown: JsonObject;

    computed_at: ISODateTime;
    created_at: ISODateTime;
    updated_at: ISODateTime;
}

export interface EvaluationExtraRow {
    evaluation_id: UUID;
    data: JsonObject;
    created_at: ISODateTime;
    updated_at: ISODateTime;
}

export interface PanelistProfileRow {
    user_id: UUID;
    expertise: string | null;
    created_at: ISODateTime;
}

export interface RubricScaleLevelRow {
    template_id: UUID;
    score: number; // CHECK (1..5)
    adjectival: string;
    description: string | null;
}

export interface NotificationRow {
    id: UUID;
    user_id: UUID;
    type: NotificationType;
    title: string;
    body: string;
    data: JsonObject;
    read_at: ISODateTime | null;
    created_at: ISODateTime;
}

export interface StudentFeedbackFormRow {
    id: UUID;
    key: string;
    version: number;
    title: string;
    description: string | null;
    schema: JsonObject;
    active: boolean;
    created_at: ISODateTime;
    updated_at: ISODateTime;
}

/* ---------------------------------- VIEWS -------------------------------- */

export interface EvaluationOverallPercentageRow {
    evaluation_id: UUID;
    schedule_id: UUID;
    group_id: UUID;
    evaluator_id: UUID;
    status: EvaluationStatus;
    criteria_count: number;
    criteria_scored: number;
    overall_percentage: DbNumeric;
    weighted_score: DbNumeric;
    weighted_max: DbNumeric;
    submitted_at: ISODateTime | null;
    locked_at: ISODateTime | null;
    created_at: ISODateTime;
}

export interface ThesisGroupRankingRow {
    group_id: UUID;
    group_title: string;
    group_percentage: DbNumeric | null;
    submitted_evaluations: number;
    latest_defense_at: ISODateTime | null;
    rank: number;
}

/* ----------------------------- INSERT HELPERS ----------------------------- */

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Insert payloads (DB defaults are optional here)
 */
export type UserInsert = Optional<
    UserRow,
    'id' | 'status' | 'avatar_key' | 'created_at' | 'updated_at'
>;

export type SessionInsert = Optional<SessionRow, 'id' | 'created_at'>;

export type PasswordResetInsert = Optional<
    PasswordResetRow,
    'id' | 'used_at' | 'created_at'
>;

export type ThesisGroupInsert = Optional<
    ThesisGroupRow,
    'id' | 'adviser_id' | 'program' | 'term' | 'created_at' | 'updated_at'
>;

export type GroupMemberInsert = GroupMemberRow;

export type DefenseScheduleInsert = Optional<
    DefenseScheduleRow,
    | 'id'
    | 'room'
    | 'status'
    | 'created_by'
    | 'rubric_template_id'
    | 'student_feedback_form_id'
    | 'created_at'
    | 'updated_at'
>;

export type SchedulePanelistInsert = SchedulePanelistRow;

export type RubricTemplateInsert = Optional<
    RubricTemplateRow,
    'id' | 'version' | 'active' | 'description' | 'created_at' | 'updated_at'
>;

export type RubricCriteriaInsert = Optional<RubricCriteriaRow, 'id' | 'created_at'>;

export type EvaluationInsert = Optional<
    EvaluationRow,
    'id' | 'status' | 'submitted_at' | 'locked_at' | 'created_at'
>;

export type EvaluationScoreInsert = Optional<
    EvaluationScoreRow,
    'id' | 'comment'
>;

export type AuditLogInsert = Optional<AuditLogRow, 'id' | 'actor_id' | 'entity_id' | 'details' | 'created_at'>;

export type StudentInsert = Optional<StudentRow, 'program' | 'section' | 'created_at'>;

export type StaffProfileInsert = Optional<StaffProfileRow, 'department' | 'created_at'>;

export type StudentEvaluationInsert = Optional<
    StudentEvaluationRow,
    'id'
    | 'form_id'
    | 'status'
    | 'answers'
    | 'submitted_at'
    | 'locked_at'
    | 'created_at'
    | 'updated_at'
>;

export type StudentEvaluationScoreInsert = Optional<
    StudentEvaluationScoreRow,
    'id'
    | 'form_id'
    | 'total_score'
    | 'max_score'
    | 'percentage'
    | 'breakdown'
    | 'computed_at'
    | 'created_at'
    | 'updated_at'
>;

export type EvaluationExtraInsert = Optional<
    EvaluationExtraRow,
    'data' | 'created_at' | 'updated_at'
>;

export type PanelistProfileInsert = Optional<PanelistProfileRow, 'expertise' | 'created_at'>;

export type RubricScaleLevelInsert = Optional<RubricScaleLevelRow, 'description'>;

export type NotificationInsert = Optional<
    NotificationRow,
    'id' | 'type' | 'data' | 'read_at' | 'created_at'
>;

export type StudentFeedbackFormInsert = Optional<
    StudentFeedbackFormRow,
    'id' | 'description' | 'active' | 'created_at' | 'updated_at'
>;

/* ------------------------------ UPDATE HELPERS ---------------------------- */

export type UserPatch = Partial<Omit<UserRow, 'id' | 'created_at'>>;
export type SessionPatch = Partial<Omit<SessionRow, 'id' | 'created_at'>>;
export type PasswordResetPatch = Partial<Omit<PasswordResetRow, 'id' | 'created_at'>>;
export type ThesisGroupPatch = Partial<Omit<ThesisGroupRow, 'id' | 'created_at'>>;
export type DefenseSchedulePatch = Partial<Omit<DefenseScheduleRow, 'id' | 'created_at'>>;
export type RubricTemplatePatch = Partial<Omit<RubricTemplateRow, 'id' | 'created_at'>>;
export type RubricCriteriaPatch = Partial<Omit<RubricCriteriaRow, 'id' | 'template_id' | 'created_at'>>;
export type EvaluationPatch = Partial<Omit<EvaluationRow, 'id' | 'schedule_id' | 'evaluator_id' | 'created_at'>>;
export type EvaluationScorePatch = Partial<
    Omit<
        EvaluationScoreRow,
        'id' | 'evaluation_id' | 'criterion_id' | 'target_type' | 'target_id'
    >
>;
export type AuditLogPatch = Partial<Omit<AuditLogRow, 'id' | 'created_at'>>;
export type StudentPatch = Partial<Omit<StudentRow, 'user_id' | 'created_at'>>;
export type StaffProfilePatch = Partial<Omit<StaffProfileRow, 'user_id' | 'created_at'>>;
export type StudentEvaluationPatch = Partial<
    Omit<StudentEvaluationRow, 'id' | 'schedule_id' | 'student_id' | 'created_at'>
>;
export type StudentEvaluationScorePatch = Partial<
    Omit<
        StudentEvaluationScoreRow,
        'id' | 'student_evaluation_id' | 'schedule_id' | 'student_id' | 'created_at'
    >
>;
export type EvaluationExtraPatch = Partial<Omit<EvaluationExtraRow, 'evaluation_id' | 'created_at'>>;
export type PanelistProfilePatch = Partial<Omit<PanelistProfileRow, 'user_id' | 'created_at'>>;
export type RubricScaleLevelPatch = Partial<Omit<RubricScaleLevelRow, 'template_id' | 'score'>>;
export type NotificationPatch = Partial<Omit<NotificationRow, 'id' | 'user_id' | 'created_at'>>;
export type StudentFeedbackFormPatch = Partial<Omit<StudentFeedbackFormRow, 'id' | 'created_at'>>;

/* ------------------------------- REGISTRY --------------------------------- */

/**
 * Canonical map of table/view name -> row type
 */
export interface DatabaseModels {
    // tables
    users: UserRow;
    sessions: SessionRow;
    password_resets: PasswordResetRow;
    thesis_groups: ThesisGroupRow;
    group_members: GroupMemberRow;
    defense_schedules: DefenseScheduleRow;
    schedule_panelists: SchedulePanelistRow;
    rubric_templates: RubricTemplateRow;
    rubric_criteria: RubricCriteriaRow;
    evaluations: EvaluationRow;
    evaluation_scores: EvaluationScoreRow;
    audit_logs: AuditLogRow;
    students: StudentRow;
    staff_profiles: StaffProfileRow;
    student_evaluations: StudentEvaluationRow;
    student_evaluation_scores: StudentEvaluationScoreRow;
    evaluation_extras: EvaluationExtraRow;
    panelist_profiles: PanelistProfileRow;
    rubric_scale_levels: RubricScaleLevelRow;
    notifications: NotificationRow;
    student_feedback_forms: StudentFeedbackFormRow;

    // views
    v_evaluation_overall_percentages: EvaluationOverallPercentageRow;
    v_thesis_group_rankings: ThesisGroupRankingRow;
}

export type DbEntityName = keyof DatabaseModels;
export type TableName = Exclude<
    DbEntityName,
    'v_evaluation_overall_percentages' | 'v_thesis_group_rankings'
>;
export type ViewName = Extract<
    DbEntityName,
    'v_evaluation_overall_percentages' | 'v_thesis_group_rankings'
>;
