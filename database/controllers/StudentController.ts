import type {
    JsonObject,
    StudentEvalStatus,
    StudentEvaluationPatch,
    StudentEvaluationRow,
    StudentPatch,
    StudentRow,
    UserInsert,
    UserPatch,
    UserRow,
    UserStatus,
    UUID,
} from '../models/Model';
import type { ListQuery, Services } from '../services/Services';

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
    constructor(private readonly services: Services) { }

    private async toAccount(user: UserRow): Promise<StudentAccount> {
        const profile = await this.services.students.findByUserId(user.id);
        return { user, profile };
    }

    private async requireStudentUser(tx: Services, userId: UUID): Promise<UserRow | null> {
        const user = await tx.users.findById(userId);
        if (!user || user.role !== 'student') return null;
        return user;
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

            const created = await tx.student_evaluations.create({
                schedule_id: input.schedule_id,
                student_id: studentId,
                status: 'pending',
                answers: input.answers ?? {},
                submitted_at: null,
                locked_at: null,
                created_at: nowIso(),
                updated_at: nowIso(),
            });

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

            const patch: StudentEvaluationPatch = {
                answers: mergedAnswers,
                updated_at: nowIso(),
            };

            const updated = await tx.student_evaluations.updateOne({ id: evaluationId }, patch);
            return updated ?? (await tx.student_evaluations.findById(evaluationId));
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

            const submittedAt = nowIso();

            // Prefer service convenience if implemented
            const submitted = await tx.student_evaluations.submit(evaluationId, submittedAt);
            if (submitted) return submitted;

            // Fallback
            const patched = await tx.student_evaluations.updateOne(
                { id: evaluationId },
                { status: 'submitted', submitted_at: submittedAt, updated_at: submittedAt },
            );
            return patched ?? (await tx.student_evaluations.findById(evaluationId));
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
