import type {
    DefenseScheduleRow,
    JsonObject,
    StudentEvaluationPatch,
    StudentEvaluationRow,
    StudentEvaluationScoreInsert,
    StudentEvaluationScoreRow,
    StudentFeedbackFormRow,
    StudentPatch,
    StudentRow,
    ThesisGroupRow,
    UserInsert,
    UserPatch,
    UserRow,
    UserStatus,
    UUID,
} from '../models/Model';
import type { ListQuery, Services } from '../services/Services';
import StudentFeedbackService, {
    type AssignStudentFeedbackFormsInput,
    type AssignStudentFeedbackFormsResult,
    type StudentFeedbackFormSchema,
} from '../services/StudentFeedbackService';

function stripUndefined<T extends object>(input: T): Partial<T> {
    const out: Partial<T> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (value !== undefined) {
            (out as Record<string, unknown>)[key] = value;
        }
    }
    return out;
}

export type CreateStudentInput = Omit<UserInsert, 'role'> & {
    program?: string | null;
    section?: string | null;
};

export type UpdateStudentInput = {
    user?: Omit<UserPatch, 'role'>;
    profile?: StudentPatch;
};

export interface StudentAccount {
    user: UserRow;
    profile: StudentRow | null;
}

/**
 * Student evaluation is NOT grading.
 * It's a feedback/survey/reflection record about the defense experience/process quality
 * (peer/self/adviser/panel feedback, satisfaction, reflection, etc.) stored in JSON answers.
 */
export type CreateOrEnsureStudentEvaluationInput = {
    schedule_id: UUID;
    answers?: JsonObject;
};

export type PatchStudentEvaluationAnswersInput = {
    answers: JsonObject;
};

export class StudentEvalStateError extends Error {
    public readonly code: 'LOCKED' | 'SUBMITTED';
    constructor(code: 'LOCKED' | 'SUBMITTED', message: string) {
        super(message);
        this.name = 'StudentEvalStateError';
        this.code = code;
    }
}

export class StudentEvalValidationError extends Error {
    public readonly code: 'INVALID';
    public readonly missing: string[];
    constructor(message: string, missing: string[] = []) {
        super(message);
        this.name = 'StudentEvalValidationError';
        this.code = 'INVALID';
        this.missing = missing;
    }
}

function nowIso(): string {
    return new Date().toISOString();
}

function isLockedEval(row: StudentEvaluationRow): boolean {
    return row.status === 'locked' || row.locked_at !== null;
}

function isSubmittedEval(row: StudentEvaluationRow): boolean {
    return row.status === 'submitted' || row.submitted_at !== null;
}

type StudentEvaluationContext = {
    /**
     * Hydrated context for frontend UX:
     * - schedule + group objects for rendering thesis/group title and defense schedule details
     * - flattened aliases used by older frontend variants
     */
    schedule: DefenseScheduleRow | null;
    group: ThesisGroupRow | null;

    // flattened aliases (frontend looks for these too)
    group_title: string | null;
    title: string | null;
    scheduled_at: string | null;
    room: string | null;
    program: string | null;
    term: string | null;
};

export class StudentController {
    private readonly studentFeedback: StudentFeedbackService;

    constructor(private readonly services: Services) {
        this.studentFeedback = new StudentFeedbackService(services);
    }

    private async toAccount(user: UserRow): Promise<StudentAccount> {
        const profile = await this.services.students.findByUserId(user.id);
        return { user, profile };
    }

    private async requireStudentUser(tx: Services, userId: UUID): Promise<UserRow | null> {
        const user = await tx.users.findById(userId);
        if (!user || user.role !== 'student') return null;
        return user;
    }

    private async resolveFormAndSchemaForEvaluation(
        tx: Services,
        evaluation: StudentEvaluationRow,
    ): Promise<{ form: StudentFeedbackFormRow | null; schema: StudentFeedbackFormSchema }> {
        let form: StudentFeedbackFormRow | null = null;

        if (evaluation.form_id) {
            form = await tx.student_feedback_forms.findById(evaluation.form_id);
        }

        if (!form) {
            form = await this.studentFeedback.getActiveForm(tx);
        }

        const schemaCandidate = (form?.schema ?? {}) as JsonObject;
        const schema =
            Object.keys(schemaCandidate).length > 0
                ? (schemaCandidate as StudentFeedbackFormSchema)
                : await this.studentFeedback.getActiveSchema(tx);

        return { form, schema };
    }

    private async upsertStudentEvaluationScore(
        tx: Services,
        evaluation: StudentEvaluationRow,
        schema: StudentFeedbackFormSchema,
        formId: UUID | null,
        computedAt: string,
        answersOverride?: JsonObject,
    ): Promise<StudentEvaluationScoreRow> {
        const summary = this.studentFeedback.computeScoreSummary(
            (answersOverride ?? (evaluation.answers ?? {})) as JsonObject,
            schema,
        );

        const createPayload: StudentEvaluationScoreInsert = {
            student_evaluation_id: evaluation.id,
            schedule_id: evaluation.schedule_id,
            student_id: evaluation.student_id,
            form_id: formId ?? evaluation.form_id ?? null,
            total_score: summary.total_score,
            max_score: summary.max_score,
            percentage: summary.percentage,
            breakdown: summary.breakdown,
            computed_at: computedAt,
            created_at: computedAt,
            updated_at: computedAt,
        };

        const patchPayload = {
            form_id: createPayload.form_id,
            total_score: createPayload.total_score,
            max_score: createPayload.max_score,
            percentage: createPayload.percentage,
            breakdown: createPayload.breakdown,
            computed_at: createPayload.computed_at,
            updated_at: computedAt,
        } as any;

        return tx.student_evaluation_scores.upsert(
            { student_evaluation_id: evaluation.id },
            createPayload,
            patchPayload,
        );
    }

    private async hydrateEvaluation(
        tx: Services,
        evaluation: StudentEvaluationRow,
        cache?: {
            schedules: Map<UUID, DefenseScheduleRow | null>;
            groups: Map<UUID, ThesisGroupRow | null>;
        },
    ): Promise<StudentEvaluationRow & StudentEvaluationContext> {
        const schedules = cache?.schedules ?? new Map<UUID, DefenseScheduleRow | null>();
        const groups = cache?.groups ?? new Map<UUID, ThesisGroupRow | null>();

        const getSchedule = async (id: UUID): Promise<DefenseScheduleRow | null> => {
            if (schedules.has(id)) return schedules.get(id) ?? null;
            const row = await tx.defense_schedules.findById(id);
            schedules.set(id, row ?? null);
            return row ?? null;
        };

        const getGroup = async (id: UUID): Promise<ThesisGroupRow | null> => {
            if (groups.has(id)) return groups.get(id) ?? null;
            const row = await tx.thesis_groups.findById(id);
            groups.set(id, row ?? null);
            return row ?? null;
        };

        const schedule = await getSchedule(evaluation.schedule_id);
        const group = schedule ? await getGroup(schedule.group_id) : null;

        const ctx: StudentEvaluationContext = {
            schedule,
            group,
            group_title: group?.title ?? null,
            title: group?.title ?? null,
            scheduled_at: schedule?.scheduled_at ?? null,
            room: schedule?.room ?? null,
            program: group?.program ?? null,
            term: group?.term ?? null,
        };

        return { ...evaluation, ...ctx };
    }

    private async hydrateEvaluations(
        tx: Services,
        evaluations: StudentEvaluationRow[],
    ): Promise<(StudentEvaluationRow & StudentEvaluationContext)[]> {
        const cache = {
            schedules: new Map<UUID, DefenseScheduleRow | null>(),
            groups: new Map<UUID, ThesisGroupRow | null>(),
        };

        return Promise.all(evaluations.map((ev) => this.hydrateEvaluation(tx, ev, cache)));
    }

    /* -------------------------- STUDENT FEEDBACK FORM -------------------------- */

    async getStudentFeedbackFormSchema(): Promise<StudentFeedbackFormSchema> {
        // Students ONLY receive the ACTIVE form schema.
        return this.studentFeedback.getActiveSchema();
    }

    async getStudentFeedbackSeedAnswersTemplate(): Promise<JsonObject> {
        return this.studentFeedback.getActiveSeedAnswersTemplate();
    }

    /**
     * Admin/Staff helper: assigns/ensures student feedback evaluations for a defense schedule.
     * Used by POST /api/student-evaluations (admin alias) so the admin evaluations page
     * can assign student feedback without hitting a 405.
     */
    async assignStudentFeedbackFormsForSchedule(
        scheduleId: UUID,
        input: AssignStudentFeedbackFormsInput = {},
    ): Promise<AssignStudentFeedbackFormsResult | null> {
        return this.studentFeedback.assignForSchedule(scheduleId, input);
    }

    /* --------------------------------- CREATE -------------------------------- */

    async create(input: CreateStudentInput): Promise<StudentAccount> {
        return this.services.transaction<StudentAccount>(async (tx) => {
            const user = await tx.users.create({
                ...input,
                role: 'student',
            });

            await tx.students.create({
                user_id: user.id,
                program: input.program ?? null,
                section: input.section ?? null,
            });

            const profile = await tx.students.findByUserId(user.id);
            return { user, profile };
        });
    }

    /* ---------------------------------- READ --------------------------------- */

    async getById(userId: UUID): Promise<StudentAccount | null> {
        const user = await this.services.users.findById(userId);
        if (!user || user.role !== 'student') return null;
        return this.toAccount(user);
    }

    async getAll(query: Omit<ListQuery<UserRow>, 'where'> = {}): Promise<StudentAccount[]> {
        const users = await this.services.users.listByRole('student', query);
        return Promise.all(users.map((u) => this.toAccount(u)));
    }

    /* --------------------------------- UPDATE -------------------------------- */

    async update(userId: UUID, input: UpdateStudentInput): Promise<StudentAccount | null> {
        const cleanUserPatch = stripUndefined(input.user ?? {}) as Omit<UserPatch, 'role'>;
        const cleanProfilePatch = stripUndefined(input.profile ?? {}) as StudentPatch;

        if (
            Object.keys(cleanUserPatch).length === 0 &&
            Object.keys(cleanProfilePatch).length === 0
        ) {
            return this.getById(userId);
        }

        return this.services.transaction<StudentAccount | null>(async (tx) => {
            const existingUser = await tx.users.findById(userId);
            if (!existingUser || existingUser.role !== 'student') return null;

            let finalUser = existingUser;

            if (Object.keys(cleanUserPatch).length > 0) {
                const updated = await tx.users.updateOne({ id: userId }, cleanUserPatch as UserPatch);
                if (updated) finalUser = updated;
            }

            if (Object.keys(cleanProfilePatch).length > 0) {
                const existingProfile = await tx.students.findByUserId(userId);
                if (existingProfile) {
                    await tx.students.updateOne({ user_id: userId }, cleanProfilePatch);
                } else {
                    await tx.students.create({
                        user_id: userId,
                        ...cleanProfilePatch,
                    });
                }
            }

            const finalProfile = await tx.students.findByUserId(userId);
            return {
                user: finalUser,
                profile: finalProfile,
            };
        });
    }

    async setStatus(userId: UUID, status: UserStatus): Promise<UserRow | null> {
        const existing = await this.getById(userId);
        if (!existing) return null;
        return this.services.users.setStatus(userId, status);
    }

    /* -------------------------- STUDENT EVALUATIONS -------------------------- */

    async listStudentEvaluations(
        studentId: UUID,
        opts: { scheduleId?: UUID } = {},
    ): Promise<StudentEvaluationRow[] | null> {
        const user = await this.services.users.findById(studentId);
        if (!user || user.role !== 'student') return null;

        let rows: StudentEvaluationRow[] = [];

        if (opts.scheduleId) {
            rows = await this.services.student_evaluations.findMany({
                where: { student_id: studentId, schedule_id: opts.scheduleId },
            });
        } else {
            rows = await this.services.student_evaluations.listByStudent(studentId);
        }

        const hydrated = await this.hydrateEvaluations(this.services, rows);
        return hydrated;
    }

    async getStudentEvaluation(studentId: UUID, evaluationId: UUID): Promise<StudentEvaluationRow | null> {
        const user = await this.services.users.findById(studentId);
        if (!user || user.role !== 'student') return null;

        const row = await this.services.student_evaluations.findById(evaluationId);
        if (!row || row.student_id !== studentId) return null;

        const hydrated = await this.hydrateEvaluation(this.services, row);
        return hydrated;
    }

    async getStudentEvaluationScore(
        studentId: UUID,
        evaluationId: UUID,
    ): Promise<StudentEvaluationScoreRow | null> {
        return this.services.transaction<StudentEvaluationScoreRow | null>(async (tx) => {
            const studentUser = await this.requireStudentUser(tx, studentId);
            if (!studentUser) return null;

            const evaluation = await tx.student_evaluations.findById(evaluationId);
            if (!evaluation || evaluation.student_id !== studentId) return null;

            const existingScore = await tx.student_evaluation_scores.findOne({
                student_evaluation_id: evaluationId,
            });

            if (existingScore) return existingScore;

            const { form, schema } = await this.resolveFormAndSchemaForEvaluation(tx, evaluation);
            const computedAt = nowIso();

            const created = await this.upsertStudentEvaluationScore(
                tx,
                evaluation,
                schema,
                form?.id ?? evaluation.form_id ?? null,
                computedAt,
            );

            return created ?? (await tx.student_evaluation_scores.findOne({ student_evaluation_id: evaluationId }));
        });
    }

    async ensureStudentEvaluation(
        studentId: UUID,
        input: CreateOrEnsureStudentEvaluationInput,
    ): Promise<StudentEvaluationRow | null> {
        return this.services.transaction<StudentEvaluationRow | null>(async (tx) => {
            const studentUser = await this.requireStudentUser(tx, studentId);
            if (!studentUser) return null;

            const existing = await tx.student_evaluations.findOne({
                schedule_id: input.schedule_id,
                student_id: studentId,
            });

            if (existing) {
                const hydratedExisting = await this.hydrateEvaluation(tx, existing);
                return hydratedExisting;
            }

            const activeForm = await this.studentFeedback.getActiveForm(tx);
            const schema = (activeForm?.schema ?? {}) as JsonObject;
            const defaultAnswers = input.answers ?? this.studentFeedback.getSeedAnswersTemplateForSchema(schema);

            const createdAt = nowIso();

            const created = await tx.student_evaluations.create({
                schedule_id: input.schedule_id,
                student_id: studentId,
                form_id: activeForm?.id ?? null,
                status: 'pending',
                answers: defaultAnswers,
                submitted_at: null,
                locked_at: null,
                created_at: createdAt,
                updated_at: createdAt,
            });

            try {
                await this.upsertStudentEvaluationScore(
                    tx,
                    created,
                    (schema as StudentFeedbackFormSchema),
                    activeForm?.id ?? null,
                    createdAt,
                    defaultAnswers,
                );
            } catch {
                // best-effort
            }

            const hydrated = await this.hydrateEvaluation(tx, created);
            return hydrated;
        });
    }

    async patchStudentEvaluationAnswers(
        studentId: UUID,
        evaluationId: UUID,
        input: PatchStudentEvaluationAnswersInput,
    ): Promise<StudentEvaluationRow | null> {
        return this.services.transaction<StudentEvaluationRow | null>(async (tx) => {
            const studentUser = await this.requireStudentUser(tx, studentId);
            if (!studentUser) return null;

            const existing = await tx.student_evaluations.findById(evaluationId);
            if (!existing || existing.student_id !== studentId) return null;

            if (isLockedEval(existing)) {
                throw new StudentEvalStateError(
                    'LOCKED',
                    'This feedback is locked and can no longer be edited.',
                );
            }
            if (isSubmittedEval(existing)) {
                throw new StudentEvalStateError(
                    'SUBMITTED',
                    'This feedback has already been submitted and can no longer be edited.',
                );
            }

            const mergedAnswers: JsonObject = {
                ...(existing.answers ?? {}),
                ...(input.answers ?? {}),
            };

            const patchedAt = nowIso();

            const patch: StudentEvaluationPatch = {
                answers: mergedAnswers,
                updated_at: patchedAt,
            };

            const updated = await tx.student_evaluations.updateOne({ id: evaluationId }, patch);
            const finalRow = updated ?? (await tx.student_evaluations.findById(evaluationId));
            if (!finalRow) return null;

            const { form, schema } = await this.resolveFormAndSchemaForEvaluation(tx, finalRow);
            await this.upsertStudentEvaluationScore(
                tx,
                finalRow,
                schema,
                form?.id ?? finalRow.form_id ?? null,
                patchedAt,
                mergedAnswers,
            );

            const hydrated = await this.hydrateEvaluation(tx, finalRow);
            return hydrated;
        });
    }

    async submitStudentEvaluation(studentId: UUID, evaluationId: UUID): Promise<StudentEvaluationRow | null> {
        return this.services.transaction<StudentEvaluationRow | null>(async (tx) => {
            const studentUser = await this.requireStudentUser(tx, studentId);
            if (!studentUser) return null;

            const existing = await tx.student_evaluations.findById(evaluationId);
            if (!existing || existing.student_id !== studentId) return null;

            if (isLockedEval(existing)) {
                throw new StudentEvalStateError(
                    'LOCKED',
                    'This feedback is locked and can no longer be submitted.',
                );
            }

            const { form, schema } = await this.resolveFormAndSchemaForEvaluation(tx, existing);

            const validation = this.studentFeedback.validateRequiredAnswers(
                (existing.answers ?? {}) as JsonObject,
                schema,
            );

            if (!validation.ok) {
                throw new StudentEvalValidationError(
                    'Please answer all required questions before submitting.',
                    validation.missing,
                );
            }

            const submittedAt = nowIso();

            const submitted = await tx.student_evaluations.submit(evaluationId, submittedAt);
            const finalRow =
                submitted ??
                (await tx.student_evaluations.updateOne(
                    { id: evaluationId },
                    { status: 'submitted', submitted_at: submittedAt, updated_at: submittedAt },
                )) ??
                (await tx.student_evaluations.findById(evaluationId));

            if (!finalRow) return null;

            await this.upsertStudentEvaluationScore(
                tx,
                finalRow,
                schema,
                form?.id ?? finalRow.form_id ?? null,
                submittedAt,
            );

            const hydrated = await this.hydrateEvaluation(tx, finalRow);
            return hydrated;
        });
    }

    async lockStudentEvaluation(studentId: UUID, evaluationId: UUID): Promise<StudentEvaluationRow | null> {
        return this.services.transaction<StudentEvaluationRow | null>(async (tx) => {
            const studentUser = await this.requireStudentUser(tx, studentId);
            if (!studentUser) return null;

            const existing = await tx.student_evaluations.findById(evaluationId);
            if (!existing || existing.student_id !== studentId) return null;

            const lockedAt = nowIso();

            const locked = await tx.student_evaluations.lock(evaluationId, lockedAt);
            if (locked) {
                const hydratedLocked = await this.hydrateEvaluation(tx, locked);
                return hydratedLocked;
            }

            const patched = await tx.student_evaluations.updateOne(
                { id: evaluationId },
                { status: 'locked', locked_at: lockedAt, updated_at: lockedAt },
            );

            const finalRow = patched ?? (await tx.student_evaluations.findById(evaluationId));
            if (!finalRow) return null;

            const hydrated = await this.hydrateEvaluation(tx, finalRow);
            return hydrated;
        });
    }

    /* --------------------------------- DELETE -------------------------------- */

    async delete(userId: UUID): Promise<number> {
        return this.services.transaction<number>(async (tx) => {
            const user = await tx.users.findById(userId);
            if (!user || user.role !== 'student') return 0;

            await tx.students.delete({ user_id: userId });
            return tx.users.delete({ id: userId });
        });
    }
}

export default StudentController;
