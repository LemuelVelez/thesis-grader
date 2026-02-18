import type {
    JsonObject,
    StudentEvalStatus,
    StudentEvaluationPatch,
    StudentEvaluationRow,
    StudentEvaluationScoreInsert,
    StudentEvaluationScoreRow,
    StudentFeedbackFormRow,
    StudentPatch,
    StudentRow,
    UserInsert,
    UserPatch,
    UserRow,
    UserStatus,
    UUID,
} from '../models/Model';
import type { ListQuery, Services } from '../services/Services';
import StudentFeedbackService, {
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

    /* -------------------------- STUDENT FEEDBACK FORM -------------------------- */

    async getStudentFeedbackFormSchema(): Promise<StudentFeedbackFormSchema> {
        // Students ONLY receive the ACTIVE form schema.
        return this.studentFeedback.getActiveSchema();
    }

    async getStudentFeedbackSeedAnswersTemplate(): Promise<JsonObject> {
        return this.studentFeedback.getActiveSeedAnswersTemplate();
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

    /**
     * List all feedback/survey/reflection entries of a student.
     * Optional filter by schedule_id.
     */
    async listStudentEvaluations(
        studentId: UUID,
        opts: { scheduleId?: UUID } = {},
    ): Promise<StudentEvaluationRow[] | null> {
        const user = await this.services.users.findById(studentId);
        if (!user || user.role !== 'student') return null;

        if (opts.scheduleId) {
            return this.services.student_evaluations.findMany({
                where: { student_id: studentId, schedule_id: opts.scheduleId },
            });
        }

        return this.services.student_evaluations.listByStudent(studentId);
    }

    /**
     * Get a single student evaluation ensuring ownership.
     */
    async getStudentEvaluation(studentId: UUID, evaluationId: UUID): Promise<StudentEvaluationRow | null> {
        const user = await this.services.users.findById(studentId);
        if (!user || user.role !== 'student') return null;

        const row = await this.services.student_evaluations.findById(evaluationId);
        if (!row || row.student_id !== studentId) return null;
        return row;
    }

    /**
     * Get the persisted score summary for a student evaluation (ensures ownership).
     * If missing, it will be computed and upserted based on the evaluation's form schema.
     */
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

    /**
     * Create (if missing) the student's survey/feedback/reflection for a defense schedule.
     * If already exists, returns the existing row (idempotent).
     */
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

            if (existing) return existing;

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

            // Seed a score record immediately (so analytics/admin views have it from the start).
            // This stays updated whenever answers are patched.
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
                // Score is best-effort; evaluation creation should still succeed.
            }

            return created;
        });
    }

    /**
     * Patch answers while still editable.
     * - pending: allowed
     * - submitted/locked: not allowed
     */
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

            // Keep persisted score summary in sync while pending/editable.
            const { form, schema } = await this.resolveFormAndSchemaForEvaluation(tx, finalRow);
            await this.upsertStudentEvaluationScore(
                tx,
                finalRow,
                schema,
                form?.id ?? finalRow.form_id ?? null,
                patchedAt,
                mergedAnswers,
            );

            return finalRow;
        });
    }

    /**
     * Submit the student's feedback/survey/reflection.
     * Once submitted, it becomes read-only (unless your admin flow unlocks it elsewhere).
     */
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

            // Validate required questions before submitting (backend safety) using the evaluation's form schema.
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

            // Prefer service convenience if implemented
            const submitted = await tx.student_evaluations.submit(evaluationId, submittedAt);
            const finalRow =
                submitted ??
                (await tx.student_evaluations.updateOne(
                    { id: evaluationId },
                    { status: 'submitted', submitted_at: submittedAt, updated_at: submittedAt },
                )) ??
                (await tx.student_evaluations.findById(evaluationId));

            if (!finalRow) return null;

            // Persist (and refresh) score on submit.
            await this.upsertStudentEvaluationScore(
                tx,
                finalRow,
                schema,
                form?.id ?? finalRow.form_id ?? null,
                submittedAt,
            );

            return finalRow;
        });
    }

    /**
     * Lock the student's feedback entry (typically used by staff/admin workflows).
     */
    async lockStudentEvaluation(studentId: UUID, evaluationId: UUID): Promise<StudentEvaluationRow | null> {
        return this.services.transaction<StudentEvaluationRow | null>(async (tx) => {
            const studentUser = await this.requireStudentUser(tx, studentId);
            if (!studentUser) return null;

            const existing = await tx.student_evaluations.findById(evaluationId);
            if (!existing || existing.student_id !== studentId) return null;

            const lockedAt = nowIso();

            const locked = await tx.student_evaluations.lock(evaluationId, lockedAt);
            if (locked) return locked;

            const patched = await tx.student_evaluations.updateOne(
                { id: evaluationId },
                { status: 'locked', locked_at: lockedAt, updated_at: lockedAt },
            );
            return patched ?? (await tx.student_evaluations.findById(evaluationId));
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
