import type {
    DbNumeric,
    DefenseScheduleInsert,
    DefenseSchedulePatch,
    DefenseScheduleRow,
    EvaluationOverallPercentageRow,
    EvaluationRow,
    EvaluationScoreRow,
    JsonObject,
    RubricCriteriaRow,
    StudentEvalStatus,
    StudentEvaluationScoreRow,
    StudentFeedbackFormInsert,
    StudentFeedbackFormPatch,
    StudentFeedbackFormRow,
    StudentInsert,
    StudentPatch,
    StudentRow,
    ThesisGroupRankingRow,
    UserInsert,
    UserPatch,
    UserRow,
    UserStatus,
    UUID,
} from '../models/Model';
import type { ListQuery, Services } from '../services/Services';
import StudentFeedbackService, {
    type AdminStudentFeedbackRow,
    type AssignStudentFeedbackFormsInput,
    type AssignStudentFeedbackFormsResult,
    type StudentFeedbackFormSchema,
} from '../services/StudentFeedbackService';
import {
    type RankingTarget,
    type ThesisStudentRankingRow,
    getGroupRankingByGroupIdWithFallback,
    getGroupRankingsWithFallback,
    getStudentRankingByStudentId,
    getStudentRankings,
} from './RankingSupport';

function stripUndefined<T extends object>(input: T): Partial<T> {
    const out: Partial<T> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (value !== undefined) {
            (out as Record<string, unknown>)[key] = value;
        }
    }
    return out;
}

function normalizeNullableString(value: unknown): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function extractErrorCode(error: unknown): string | null {
    if (!error || typeof error !== 'object') return null;
    const maybeCode = (error as { code?: unknown }).code;
    return typeof maybeCode === 'string' && maybeCode.trim().length > 0
        ? maybeCode.trim()
        : null;
}

function isUniqueViolationLike(error: unknown): boolean {
    const code = extractErrorCode(error);
    if (code === '23505') return true;

    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return msg.includes('duplicate key') || msg.includes('unique constraint');
    }

    return false;
}

function toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const t = value.trim();
        if (!t) return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function dbNumericToNumber(value: DbNumeric | null | undefined, fallback = 0): number {
    const n = toNumber(value);
    return n === null ? fallback : n;
}

export type CreateAdminInput = Omit<UserInsert, 'role'>;
export type UpdateAdminInput = Omit<UserPatch, 'role'>;

export interface UpsertStudentProfileInput {
    program?: string | null;
    section?: string | null;
}

export interface UpsertStudentProfileResult {
    item: StudentRow;
    created: boolean;
    roleUpdated: boolean;
}

export interface AdminDefenseScheduleView extends DefenseScheduleRow {
    group_title: string | null;
    rubric_template_name: string | null;
    created_by_name: string | null;
    created_by_email: string | null;
}

/* ----------------------- EVALUATION PREVIEW (ADMIN) ----------------------- */

export type EvaluationPreviewTargetType = EvaluationScoreRow['target_type'];

export interface PanelistScorePreviewItem {
    id: UUID;
    evaluation_id: UUID;
    evaluator_id: UUID;

    target_type: EvaluationPreviewTargetType;
    target_id: UUID;
    target_name: string | null;

    criterion_id: UUID;
    criterion: string | null;
    criterion_description: string | null;

    weight: DbNumeric | null;
    min_score: number | null;
    max_score: number | null;

    score: number;
    comment: string | null;
}

export interface PanelistTargetSummary {
    target_type: EvaluationPreviewTargetType;
    target_id: UUID;
    target_name: string | null;

    criteria_scored: number;
    weighted_score: number;
    weighted_max: number;
    percentage: number;
}

export interface PanelistEvaluationPreview {
    evaluation: EvaluationRow & {
        evaluator_name: string | null;
        evaluator_email: string | null;
    };

    overall: (EvaluationOverallPercentageRow & { schedule_id: UUID }) | null;

    targets: PanelistTargetSummary[];
    scores: PanelistScorePreviewItem[];
}

export interface StudentFeedbackStatusCounts {
    total: number;
    pending: number;
    submitted: number;
    locked: number;
}

export interface AdminEvaluationPreview {
    schedule: AdminDefenseScheduleView;
    student: {
        items: AdminStudentFeedbackRow[];
        count: number;
        includeAnswers: boolean;
        statusCounts: StudentFeedbackStatusCounts;
    };
    panelist: {
        items: PanelistEvaluationPreview[];
        count: number;
        includeScores: boolean;
        includeComments: boolean;
    };
}

export class AdminController {
    private readonly studentFeedback: StudentFeedbackService;

    constructor(private readonly services: Services) {
        this.studentFeedback = new StudentFeedbackService(services);
    }

    /* --------------------------------- CREATE -------------------------------- */

    async create(input: CreateAdminInput): Promise<UserRow> {
        const payload: UserInsert = {
            ...input,
            role: 'admin',
        };
        return this.services.users.create(payload);
    }

    async createDefenseSchedule(input: DefenseScheduleInsert): Promise<DefenseScheduleRow> {
        return this.services.defense_schedules.create(input);
    }

    async createDefenseScheduleDetailed(
        input: DefenseScheduleInsert,
    ): Promise<AdminDefenseScheduleView> {
        const created = await this.createDefenseSchedule(input);
        return this.enrichDefenseSchedule(created);
    }

    /* -------------------------- STUDENT FEEDBACK FORMS ------------------------- */

    async getStudentFeedbackFormSchema(): Promise<StudentFeedbackFormSchema> {
        // Students should only see the ACTIVE schema; admin schema endpoint follows same for consistency.
        return this.studentFeedback.getActiveSchema();
    }

    async getStudentFeedbackSeedAnswersTemplate(): Promise<JsonObject> {
        return this.studentFeedback.getActiveSeedAnswersTemplate();
    }

    async listStudentFeedbackForms(): Promise<StudentFeedbackFormRow[]> {
        return this.studentFeedback.listForms();
    }

    async getStudentFeedbackFormById(id: UUID): Promise<StudentFeedbackFormRow | null> {
        return this.studentFeedback.getFormById(id);
    }

    async createStudentFeedbackForm(input: StudentFeedbackFormInsert): Promise<StudentFeedbackFormRow> {
        return this.studentFeedback.createForm(input);
    }

    async updateStudentFeedbackForm(
        id: UUID,
        patch: StudentFeedbackFormPatch,
    ): Promise<StudentFeedbackFormRow | null> {
        return this.studentFeedback.updateForm(id, patch);
    }

    async activateStudentFeedbackForm(id: UUID): Promise<StudentFeedbackFormRow | null> {
        return this.studentFeedback.activateForm(id);
    }

    async assignStudentFeedbackFormsForSchedule(
        scheduleId: UUID,
        input: AssignStudentFeedbackFormsInput = {},
    ): Promise<AssignStudentFeedbackFormsResult | null> {
        return this.studentFeedback.assignForSchedule(scheduleId, input);
    }

    /**
     * Admin detailed list for a schedule (used by admin pages):
     * - Always returns accurate status (pending/submitted/locked)
     * - Hydrates persisted score summary from student_evaluation_scores when available
     * - Prevents “0 score” from being shown for pending items by normalizing score fields
     */
    async getStudentFeedbackFormsByScheduleDetailed(
        scheduleId: UUID,
    ): Promise<AdminStudentFeedbackRow[]> {
        const rows = await this.studentFeedback.listForScheduleDetailed(scheduleId);
        return this.hydrateStudentFeedbackRowsWithScores(rows);
    }

    async getStudentFeedbackSummaryBySchedule(
        scheduleId: UUID,
    ): Promise<{ scheduleId: UUID; statusCounts: StudentFeedbackStatusCounts }> {
        const items = await this.getStudentFeedbackFormsByScheduleDetailed(scheduleId);
        return { scheduleId, statusCounts: this.computeStudentEvalStatusCounts(items) };
    }

    /* ---------------------------- EVALUATION PREVIEW --------------------------- */

    /**
     * Admin preview endpoint aggregator:
     * - Student evaluations: answers + persisted score summary (from StudentFeedbackService)
     * - Panelist evaluations: rubric scores per target (group/student) + criterion metadata + per-target summary
     */
    async getEvaluationPreviewBySchedule(
        scheduleId: UUID,
        options: {
            includeStudentAnswers?: boolean;
            includePanelistScores?: boolean;
            includePanelistComments?: boolean;
        } = {},
    ): Promise<AdminEvaluationPreview | null> {
        const includeStudentAnswers = options.includeStudentAnswers ?? true;
        const includePanelistScores = options.includePanelistScores ?? true;
        const includePanelistComments = options.includePanelistComments ?? true;

        const scheduleRow = await this.getDefenseScheduleByIdDetailed(scheduleId);
        if (!scheduleRow) return null;

        const [studentItemsRaw, panelistItems] = await Promise.all([
            this.studentFeedback.listForScheduleDetailed(scheduleId),
            this.getPanelistEvaluationPreviewsBySchedule(scheduleRow, {
                includeScores: includePanelistScores,
                includeComments: includePanelistComments,
            }),
        ]);

        const hydratedStudentRaw = await this.hydrateStudentFeedbackRowsWithScores(studentItemsRaw);

        const studentItems: AdminStudentFeedbackRow[] = includeStudentAnswers
            ? hydratedStudentRaw
            : hydratedStudentRaw.map((row) => ({
                ...row,
                // keep shape stable for UI while omitting sensitive payload
                answers: {} as any,
            }));

        const statusCounts = this.computeStudentEvalStatusCounts(hydratedStudentRaw);

        return {
            schedule: scheduleRow,
            student: {
                items: studentItems,
                count: studentItems.length,
                includeAnswers: includeStudentAnswers,
                statusCounts,
            },
            panelist: {
                items: panelistItems,
                count: panelistItems.length,
                includeScores: includePanelistScores,
                includeComments: includePanelistComments,
            },
        };
    }

    private async getPanelistEvaluationPreviewsBySchedule(
        schedule: AdminDefenseScheduleView,
        options: { includeScores: boolean; includeComments: boolean },
    ): Promise<PanelistEvaluationPreview[]> {
        const evaluations: EvaluationRow[] = await this.services.evaluations.findMany({
            where: { schedule_id: schedule.id },
            orderBy: 'created_at',
            orderDirection: 'asc',
            limit: 500,
        });

        if (evaluations.length === 0) return [];

        // Best-effort overall view (if view exists)
        let overallRows: EvaluationOverallPercentageRow[] = [];
        try {
            overallRows = await (this.services as any).v_evaluation_overall_percentages.findMany({
                where: { schedule_id: schedule.id },
                limit: 500,
            });
        } catch {
            overallRows = [];
        }
        const overallByEvalId = new Map<UUID, EvaluationOverallPercentageRow>();
        for (const r of overallRows) overallByEvalId.set(r.evaluation_id, r);

        // Fetch evaluator users
        const evaluatorIds = Array.from(new Set(evaluations.map((e) => e.evaluator_id)));
        const evaluatorRows = await Promise.all(
            evaluatorIds.map(async (id) => this.services.users.findById(id)),
        );
        const evaluatorById = new Map<UUID, UserRow>();
        for (const u of evaluatorRows) {
            if (u) evaluatorById.set(u.id, u);
        }

        // Fetch scores per evaluation (avoid assuming "IN" support)
        const scoresArrays: EvaluationScoreRow[][] = await Promise.all(
            evaluations.map((ev) =>
                this.services.evaluation_scores.findMany({
                    where: { evaluation_id: ev.id },
                    orderBy: 'criterion_id',
                    orderDirection: 'asc',
                    limit: 5000,
                }),
            ),
        );

        const scoresByEvalId = new Map<UUID, EvaluationScoreRow[]>();
        const allScores: EvaluationScoreRow[] = [];
        evaluations.forEach((ev, idx) => {
            const arr = scoresArrays[idx] ?? [];
            scoresByEvalId.set(ev.id, arr);
            allScores.push(...arr);
        });

        // Criterion metadata:
        // Prefer fetching by rubric_template_id if present; otherwise by unique criterion ids used.
        const criteriaById = new Map<UUID, RubricCriteriaRow>();

        if (schedule.rubric_template_id) {
            try {
                const criteria = await this.services.rubric_criteria.findMany({
                    where: { template_id: schedule.rubric_template_id },
                    orderBy: 'created_at',
                    orderDirection: 'asc',
                    limit: 5000,
                });
                for (const c of criteria) criteriaById.set(c.id, c);
            } catch {
                // fall back below
            }
        }

        if (criteriaById.size === 0) {
            const criterionIds = Array.from(new Set(allScores.map((s) => s.criterion_id)));
            const criterionRows = await Promise.all(
                criterionIds.map(async (id) => this.services.rubric_criteria.findById(id)),
            );
            for (const c of criterionRows) {
                if (c) criteriaById.set(c.id, c);
            }
        }

        // Resolve target names (students) best-effort
        const studentTargetIds = Array.from(
            new Set(allScores.filter((s) => s.target_type === 'student').map((s) => s.target_id)),
        );

        const studentUsers = await Promise.all(
            studentTargetIds.map(async (id) => this.services.users.findById(id)),
        );

        const studentNameById = new Map<UUID, string | null>();
        for (const u of studentUsers) {
            if (u) studentNameById.set(u.id, u.name ?? null);
        }

        // Stable ordering: locked/submitted first, then pending; then evaluator name
        const statusOrder: Record<string, number> = {
            locked: 1,
            submitted: 2,
            pending: 3,
        };

        const sortedEvals = [...evaluations].sort((a, b) => {
            const aS = statusOrder[a.status ?? ''] ?? 99;
            const bS = statusOrder[b.status ?? ''] ?? 99;
            if (aS !== bS) return aS - bS;

            const aName = (evaluatorById.get(a.evaluator_id)?.name ?? '').toLowerCase();
            const bName = (evaluatorById.get(b.evaluator_id)?.name ?? '').toLowerCase();
            return aName.localeCompare(bName);
        });

        return sortedEvals.map((ev): PanelistEvaluationPreview => {
            const evaluator = evaluatorById.get(ev.evaluator_id) ?? null;
            const scores = scoresByEvalId.get(ev.id) ?? [];

            const scoreItems: PanelistScorePreviewItem[] = options.includeScores
                ? scores.map((s) => {
                    const c = criteriaById.get(s.criterion_id) ?? null;

                    const targetName =
                        s.target_type === 'group'
                            ? schedule.group_title ?? null
                            : (studentNameById.get(s.target_id) ?? null);

                    return {
                        id: s.id,
                        evaluation_id: s.evaluation_id,
                        evaluator_id: ev.evaluator_id,

                        target_type: s.target_type,
                        target_id: s.target_id,
                        target_name: targetName,

                        criterion_id: s.criterion_id,
                        criterion: c?.criterion ?? null,
                        criterion_description: c?.description ?? null,

                        weight: (c?.weight ?? null) as any,
                        min_score: c?.min_score ?? null,
                        max_score: c?.max_score ?? null,

                        score: s.score,
                        comment: options.includeComments ? s.comment : null,
                    };
                })
                : [];

            const targets = this.computePanelistTargetSummaries(
                scores,
                criteriaById,
                schedule,
                studentNameById,
            );

            const overall = overallByEvalId.get(ev.id) ?? null;

            return {
                evaluation: {
                    ...ev,
                    evaluator_name: evaluator?.name ?? null,
                    evaluator_email: evaluator?.email ?? null,
                },
                overall: overall ? ({ ...overall, schedule_id: schedule.id } as any) : null,
                targets,
                scores: scoreItems,
            };
        });
    }

    private computePanelistTargetSummaries(
        scores: EvaluationScoreRow[],
        criteriaById: Map<UUID, RubricCriteriaRow>,
        schedule: AdminDefenseScheduleView,
        studentNameById: Map<UUID, string | null>,
    ): PanelistTargetSummary[] {
        // Aggregate by target_type + target_id
        type Agg = {
            target_type: EvaluationPreviewTargetType;
            target_id: UUID;
            target_name: string | null;
            criteria_scored: number;
            weighted_score: number;
            weighted_max: number;
        };

        const map = new Map<string, Agg>();

        for (const s of scores) {
            const c = criteriaById.get(s.criterion_id) ?? null;

            const weight = dbNumericToNumber(c?.weight ?? null, 0);
            const maxScore = c?.max_score ?? 0;

            const weightedMax = weight > 0 ? weight : 0;
            const weightedScore =
                weightedMax > 0 && maxScore > 0
                    ? (s.score / maxScore) * weightedMax
                    : 0;

            const targetName =
                s.target_type === 'group'
                    ? schedule.group_title ?? null
                    : (studentNameById.get(s.target_id) ?? null);

            const key = `${s.target_type}:${s.target_id}`;
            const existing = map.get(key);

            if (!existing) {
                map.set(key, {
                    target_type: s.target_type,
                    target_id: s.target_id,
                    target_name: targetName,
                    criteria_scored: 1,
                    weighted_score: weightedScore,
                    weighted_max: weightedMax,
                });
            } else {
                existing.criteria_scored += 1;
                existing.weighted_score += weightedScore;
                existing.weighted_max += weightedMax;
            }
        }

        const out = Array.from(map.values()).map((a) => {
            const percentage = a.weighted_max > 0 ? (a.weighted_score / a.weighted_max) * 100 : 0;
            return {
                target_type: a.target_type,
                target_id: a.target_id,
                target_name: a.target_name,
                criteria_scored: a.criteria_scored,
                weighted_score: Number.isFinite(a.weighted_score) ? a.weighted_score : 0,
                weighted_max: Number.isFinite(a.weighted_max) ? a.weighted_max : 0,
                percentage: Number.isFinite(percentage) ? percentage : 0,
            };
        });

        // Stable ordering: group first then students by name
        return out.sort((a, b) => {
            const aP = a.target_type === 'group' ? 0 : 1;
            const bP = b.target_type === 'group' ? 0 : 1;
            if (aP !== bP) return aP - bP;

            const aName = (a.target_name ?? '').toLowerCase();
            const bName = (b.target_name ?? '').toLowerCase();
            return aName.localeCompare(bName);
        });
    }

    /* ---------------------------------- READ --------------------------------- */

    async getById(id: UUID): Promise<UserRow | null> {
        const user = await this.services.users.findById(id);
        if (!user || user.role !== 'admin') return null;
        return user;
    }

    async getAll(query: Omit<ListQuery<UserRow>, 'where'> = {}): Promise<UserRow[]> {
        return this.services.users.listByRole('admin', query);
    }

    async getStudentProfileByUserId(userId: UUID): Promise<StudentRow | null> {
        return this.services.students.findByUserId(userId);
    }

    async getDefenseScheduleById(id: UUID): Promise<DefenseScheduleRow | null> {
        return this.services.defense_schedules.findById(id);
    }

    async getDefenseScheduleByIdDetailed(
        id: UUID,
    ): Promise<AdminDefenseScheduleView | null> {
        const row = await this.getDefenseScheduleById(id);
        if (!row) return null;
        return this.enrichDefenseSchedule(row);
    }

    // Backward-compatible alias used by routes expecting this method name.
    async getDefenseScheduleDetailed(
        id: UUID,
    ): Promise<AdminDefenseScheduleView | null> {
        return this.getDefenseScheduleByIdDetailed(id);
    }

    async getDefenseSchedules(query: ListQuery<DefenseScheduleRow> = {}): Promise<DefenseScheduleRow[]> {
        return this.services.defense_schedules.findMany(query);
    }

    async getDefenseSchedulesDetailed(
        query: ListQuery<DefenseScheduleRow> = {},
    ): Promise<AdminDefenseScheduleView[]> {
        const rows = await this.getDefenseSchedules(query);
        return Promise.all(rows.map((row) => this.enrichDefenseSchedule(row)));
    }

    async getDefenseSchedulesByGroup(groupId: UUID): Promise<DefenseScheduleRow[]> {
        return this.services.defense_schedules.listByGroup(groupId);
    }

    async getDefenseSchedulesByGroupDetailed(
        groupId: UUID,
    ): Promise<AdminDefenseScheduleView[]> {
        const rows = await this.getDefenseSchedulesByGroup(groupId);
        return Promise.all(rows.map((row) => this.enrichDefenseSchedule(row)));
    }

    async getDefenseSchedulesByPanelist(panelistId: UUID): Promise<DefenseScheduleRow[]> {
        return this.services.defense_schedules.listByPanelist(panelistId);
    }

    async getDefenseSchedulesByPanelistDetailed(
        panelistId: UUID,
    ): Promise<AdminDefenseScheduleView[]> {
        const rows = await this.getDefenseSchedulesByPanelist(panelistId);
        return Promise.all(rows.map((row) => this.enrichDefenseSchedule(row)));
    }

    /* ------------------------------- RANKINGS -------------------------------- */

    async getRankings(
        target: RankingTarget = 'group',
        limit?: number,
    ): Promise<ThesisGroupRankingRow[] | ThesisStudentRankingRow[]> {
        if (target === 'student') {
            return getStudentRankings(this.services, limit);
        }
        return getGroupRankingsWithFallback(this.services, limit);
    }

    async getGroupRankings(limit?: number): Promise<ThesisGroupRankingRow[]> {
        return getGroupRankingsWithFallback(this.services, limit);
    }

    async getGroupRankingByGroupId(groupId: UUID): Promise<ThesisGroupRankingRow | null> {
        return getGroupRankingByGroupIdWithFallback(this.services, groupId);
    }

    async getStudentRankings(limit?: number): Promise<ThesisStudentRankingRow[]> {
        return getStudentRankings(this.services, limit);
    }

    async getStudentRankingByStudentId(
        studentId: UUID,
    ): Promise<ThesisStudentRankingRow | null> {
        return getStudentRankingByStudentId(this.services, studentId);
    }

    /* --------------------------------- UPDATE -------------------------------- */

    async update(id: UUID, patch: UpdateAdminInput): Promise<UserRow | null> {
        const existing = await this.getById(id);
        if (!existing) return null;

        const cleanPatch = stripUndefined(patch) as UpdateAdminInput;
        if (Object.keys(cleanPatch).length === 0) return existing;

        return this.services.users.updateOne({ id }, cleanPatch as UserPatch);
    }

    async setStatus(id: UUID, status: UserStatus): Promise<UserRow | null> {
        const existing = await this.getById(id);
        if (!existing) return null;
        return this.services.users.setStatus(id, status);
    }

    async updateDefenseSchedule(
        id: UUID,
        patch: DefenseSchedulePatch,
    ): Promise<DefenseScheduleRow | null> {
        const existing = await this.services.defense_schedules.findById(id);
        if (!existing) return null;

        const cleanPatch = stripUndefined(patch) as DefenseSchedulePatch;
        if (Object.keys(cleanPatch).length === 0) return existing;

        return this.services.defense_schedules.updateOne({ id }, cleanPatch);
    }

    async updateDefenseScheduleDetailed(
        id: UUID,
        patch: DefenseSchedulePatch,
    ): Promise<AdminDefenseScheduleView | null> {
        const updated = await this.updateDefenseSchedule(id, patch);
        if (!updated) return null;
        return this.enrichDefenseSchedule(updated);
    }

    async setDefenseScheduleStatus(
        id: UUID,
        status: DefenseScheduleRow['status'],
    ): Promise<DefenseScheduleRow | null> {
        const existing = await this.services.defense_schedules.findById(id);
        if (!existing) return null;

        return this.services.defense_schedules.setStatus(id, status);
    }

    async setDefenseScheduleStatusDetailed(
        id: UUID,
        status: DefenseScheduleRow['status'],
    ): Promise<AdminDefenseScheduleView | null> {
        const updated = await this.setDefenseScheduleStatus(id, status);
        if (!updated) return null;
        return this.enrichDefenseSchedule(updated);
    }

    async upsertStudentProfileForUser(
        userId: UUID,
        input: UpsertStudentProfileInput = {},
    ): Promise<UpsertStudentProfileResult | null> {
        return this.services.transaction(async (txServices) => {
            const user = await txServices.users.findById(userId);
            if (!user) return null;

            let roleUpdated = false;
            if (user.role !== 'student') {
                const updatedUser = await txServices.users.updateOne(
                    { id: userId },
                    { role: 'student' },
                );
                if (!updatedUser) return null;
                roleUpdated = updatedUser.role === 'student';
            }

            const normalizedProgram = normalizeNullableString(input.program);
            const normalizedSection = normalizeNullableString(input.section);

            const existing = await txServices.students.findByUserId(userId);

            const patch = stripUndefined<StudentPatch>({
                program: normalizedProgram,
                section: normalizedSection,
            }) as StudentPatch;

            if (existing) {
                if (Object.keys(patch).length === 0) {
                    return {
                        item: existing,
                        created: false,
                        roleUpdated,
                    };
                }

                const updated = await txServices.students.updateOne(
                    { user_id: userId },
                    patch,
                );

                return {
                    item: updated ?? existing,
                    created: false,
                    roleUpdated,
                };
            }

            try {
                const created = await txServices.students.create({
                    user_id: userId,
                    program: normalizedProgram ?? null,
                    section: normalizedSection ?? null,
                } as StudentInsert);

                return {
                    item: created,
                    created: true,
                    roleUpdated,
                };
            } catch (error) {
                if (isUniqueViolationLike(error)) {
                    const racedExisting = await txServices.students.findByUserId(userId);
                    if (racedExisting) {
                        return {
                            item: racedExisting,
                            created: false,
                            roleUpdated,
                        };
                    }
                }
                throw error;
            }
        });
    }

    /* --------------------------------- DELETE -------------------------------- */

    async delete(id: UUID): Promise<number> {
        const existing = await this.getById(id);
        if (!existing) return 0;
        return this.services.users.delete({ id });
    }

    async deleteDefenseSchedule(id: UUID): Promise<number> {
        const existing = await this.services.defense_schedules.findById(id);
        if (!existing) return 0;
        return this.services.defense_schedules.delete({ id });
    }

    /* ------------------------------- INTERNALS ------------------------------- */

    private normalizeStudentEvalStatus(raw: unknown): StudentEvalStatus {
        const s = String(raw ?? '').trim().toLowerCase();
        if (s === 'submitted') return 'submitted';
        if (s === 'locked') return 'locked';
        return 'pending';
    }

    private computeStudentEvalStatusCounts(
        items: Array<{ status?: unknown }>,
    ): StudentFeedbackStatusCounts {
        const counts: StudentFeedbackStatusCounts = {
            total: items.length,
            pending: 0,
            submitted: 0,
            locked: 0,
        };

        for (const it of items) {
            const status = this.normalizeStudentEvalStatus((it as any).status);
            if (status === 'submitted') counts.submitted += 1;
            else if (status === 'locked') counts.locked += 1;
            else counts.pending += 1;
        }

        return counts;
    }

    private getStudentEvaluationIdFromAdminRow(row: AdminStudentFeedbackRow): UUID | null {
        const r = row as any;
        const id = (r.student_evaluation_id ?? r.studentEvaluationId ?? r.id) as unknown;
        if (typeof id === 'string' && id.trim().length > 0) return id as UUID;
        return null;
    }

    /**
     * Fixes the common admin symptom:
     * - Assigned student feedback shows score as 0 (should be Pending)
     * - Submitted feedback still shows 0 because joined summary wasn’t hydrated
     *
     * We hydrate persisted summary from student_evaluation_scores (by student_evaluation_id)
     * and normalize score fields for pending rows.
     */
    private async hydrateStudentFeedbackRowsWithScores(
        rows: AdminStudentFeedbackRow[],
    ): Promise<AdminStudentFeedbackRow[]> {
        if (!rows || rows.length === 0) return [];

        const normalized = rows.map((r) => ({
            ...r,
            status: this.normalizeStudentEvalStatus((r as any).status),
        })) as AdminStudentFeedbackRow[];

        const idsNeedingScores = Array.from(
            new Set(
                normalized
                    .filter((r) => {
                        const st = this.normalizeStudentEvalStatus((r as any).status);
                        return st === 'submitted' || st === 'locked';
                    })
                    .map((r) => this.getStudentEvaluationIdFromAdminRow(r))
                    .filter(Boolean) as UUID[],
            ),
        );

        const scoreByStudentEvalId = new Map<UUID, StudentEvaluationScoreRow>();

        if (idsNeedingScores.length > 0) {
            const svcAny = this.services.student_evaluation_scores as any;

            let scoreRows: StudentEvaluationScoreRow[] = [];

            if (typeof svcAny.listByStudentEvaluationIds === 'function') {
                // Optional bulk helper (if implemented)
                scoreRows = await svcAny.listByStudentEvaluationIds(idsNeedingScores);
            } else {
                // Fallback: N calls (still safe for typical per-schedule sizes)
                const fetched = await Promise.all(
                    idsNeedingScores.map(async (studentEvalId) =>
                        this.services.student_evaluation_scores.findByStudentEvaluationId(studentEvalId),
                    ),
                );
                scoreRows = fetched.filter(Boolean) as StudentEvaluationScoreRow[];
            }

            for (const s of scoreRows) {
                scoreByStudentEvalId.set(s.student_evaluation_id, s);
            }
        }

        return normalized.map((row) => {
            const r: any = { ...row };
            const status = this.normalizeStudentEvalStatus(r.status);
            r.status = status;

            const studentEvalId = this.getStudentEvaluationIdFromAdminRow(row);
            const score = studentEvalId ? (scoreByStudentEvalId.get(studentEvalId) ?? null) : null;

            // Normalize common UI-consumed score fields:
            // - pending => null (NOT 0)
            // - submitted/locked with persisted summary => overwrite with summary values
            // - submitted/locked without summary => null (NOT 0) so UI can show “Submitted” state instead of “0”
            const scoreKeys = ['total_score', 'max_score', 'percentage', 'breakdown', 'computed_at'];

            if (status === 'pending') {
                for (const k of scoreKeys) {
                    if (k in r) {
                        r[k] = null;
                    }
                }
                r.score_ready = false;
                return r as AdminStudentFeedbackRow;
            }

            if (score) {
                r.total_score = score.total_score as any;
                r.max_score = score.max_score as any;
                r.percentage = score.percentage as any;
                r.breakdown = score.breakdown as any;
                r.computed_at = score.computed_at as any;
                r.score_ready = true;
                return r as AdminStudentFeedbackRow;
            }

            for (const k of scoreKeys) {
                if (k in r) {
                    r[k] = null;
                }
            }
            r.score_ready = false;
            return r as AdminStudentFeedbackRow;
        });
    }

    private async resolveCreatedBy(
        schedule: DefenseScheduleRow,
    ): Promise<{ id: UUID | null; name: string | null; email: string | null }> {
        let creatorId: UUID | null = schedule.created_by ?? null;

        if (!creatorId) {
            const candidateEntities = ['defense_schedules', 'defense_schedule'];

            for (const entity of candidateEntities) {
                try {
                    const logs = await this.services.audit_logs.listByEntity(entity, schedule.id);
                    const firstActorLog = logs
                        .filter((log) => !!log.actor_id)
                        .sort((a, b) => {
                            const aTime = new Date(a.created_at).getTime();
                            const bTime = new Date(b.created_at).getTime();
                            return aTime - bTime;
                        })[0];

                    if (firstActorLog?.actor_id) {
                        creatorId = firstActorLog.actor_id;
                        break;
                    }
                } catch {
                    // Best-effort fallback only.
                }
            }
        }

        if (!creatorId) {
            return { id: null, name: null, email: null };
        }

        const creator = await this.services.users.findById(creatorId);
        if (!creator) {
            return { id: creatorId, name: null, email: null };
        }

        return {
            id: creator.id,
            name: creator.name ?? null,
            email: creator.email ?? null,
        };
    }

    private async enrichDefenseSchedule(
        schedule: DefenseScheduleRow,
    ): Promise<AdminDefenseScheduleView> {
        const [group, rubricTemplate, creator] = await Promise.all([
            this.services.thesis_groups.findById(schedule.group_id),
            schedule.rubric_template_id
                ? this.services.rubric_templates.findById(schedule.rubric_template_id)
                : Promise.resolve(null),
            this.resolveCreatedBy(schedule),
        ]);

        return {
            ...schedule,
            created_by: creator.id ?? schedule.created_by,
            group_title: group?.title ?? null,
            rubric_template_name: rubricTemplate?.name ?? null,
            created_by_name: creator.name ?? null,
            created_by_email: creator.email ?? null,
        };
    }
}

export default AdminController;
