import type {
    DbNumeric,
    JsonObject,
    StudentEvalStatus,
    StudentEvaluationRow,
    StudentEvaluationScoreInsert,
    StudentEvaluationScoreRow,
    StudentFeedbackFormInsert,
    StudentFeedbackFormPatch,
    StudentFeedbackFormRow,
    UUID,
    UserRow,
} from '../models/Model';
import type { Services } from './Services';

function nowIso(): string {
    return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toJsonObject(value: unknown): JsonObject {
    if (!isRecord(value)) return {};
    return value as JsonObject;
}

function normalizeStatus(raw: unknown): StudentEvalStatus {
    const s = String(raw ?? '').trim().toLowerCase();
    if (s === 'submitted') return 'submitted';
    if (s === 'locked') return 'locked';
    return 'pending';
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

/* -------------------------- Schema / Question Types ------------------------- */

export type StudentFeedbackFormQuestionType =
    | 'rating'
    | 'scale'
    | 'number'
    | 'text'
    | 'textarea'
    | 'select'
    | 'multiselect'
    | 'checkbox'
    | 'radio'
    | 'date'
    | (string & {});

export interface StudentFeedbackFormQuestion {
    id: string;
    label?: string;
    type?: StudentFeedbackFormQuestionType;
    required?: boolean;

    // numeric-ish types
    min?: number;
    max?: number;
    weight?: number;

    // select-ish types
    options?: Array<{ value: string; label?: string } | string>;
    placeholder?: string;
}

export interface StudentFeedbackFormSection {
    id?: string;
    title?: string;
    description?: string;
    questions?: StudentFeedbackFormQuestion[];
}

/**
 * Stored schema format used by staff/student endpoints.
 * Kept intentionally flexible (JsonObject) while providing useful typed accessors.
 */
export type StudentFeedbackFormSchema = JsonObject & {
    id?: string;
    key?: string;
    title?: string;
    version?: number;
    description?: string;
    sections?: StudentFeedbackFormSection[];
};

/* --------------------------------- Results -------------------------------- */

export type AssignStudentFeedbackFormsInput = {
    studentIds?: UUID[];
    overwritePending?: boolean;
    seedAnswers?: JsonObject;
    initialStatus?: StudentEvalStatus;
};

export type AssignStudentFeedbackCounts = {
    created: number;
    updated: number;
    existing: number;
};

export type AssignStudentFeedbackFormsResult = {
    scheduleId: UUID;
    groupId: UUID;
    counts: AssignStudentFeedbackCounts;
    created: UUID[]; // student_evaluation ids
    updated: UUID[]; // student_evaluation ids
    existing: UUID[]; // student_evaluation ids
    targetedStudentIds: UUID[]; // resolved student user ids
};

export type AdminStudentFeedbackRow = (StudentEvaluationRow & {
    // aliases used by different frontend variants
    student_evaluation_id?: UUID;
    studentEvaluationId?: UUID;

    student_name?: string | null;
    student_email?: string | null;

    // optional score aliases (admin UI reads multiple keys)
    total_score?: DbNumeric | null;
    max_score?: DbNumeric | null;
    percentage?: DbNumeric | null;
    breakdown?: JsonObject | null;
    computed_at?: string | null;

    score_total?: DbNumeric | null;
    score_max?: DbNumeric | null;
    score_percentage?: DbNumeric | null;

    score_ready?: boolean;
});

/* ------------------------------ Score Summary ------------------------------ */

export type StudentFeedbackScoreSummary = {
    total_score: number;
    max_score: number;
    percentage: number;
    breakdown: JsonObject;
};

export default class StudentFeedbackService {
    constructor(private readonly services: Services) { }

    /* ----------------------------- Form / Schema ----------------------------- */

    async listForms(tx?: Services): Promise<StudentFeedbackFormRow[]> {
        const svc = tx ?? this.services;
        return svc.student_feedback_forms.findMany({
            orderBy: 'created_at',
            orderDirection: 'desc',
            limit: 500,
        });
    }

    async getFormById(id: UUID, tx?: Services): Promise<StudentFeedbackFormRow | null> {
        const svc = tx ?? this.services;
        return svc.student_feedback_forms.findById(id);
    }

    async createForm(input: StudentFeedbackFormInsert, tx?: Services): Promise<StudentFeedbackFormRow> {
        const svc = tx ?? this.services;
        const t = nowIso();
        const payload: StudentFeedbackFormInsert = {
            ...input,
            active: (input as any).active ?? false,
            created_at: (input as any).created_at ?? t,
            updated_at: (input as any).updated_at ?? t,
        } as any;

        return svc.student_feedback_forms.create(payload);
    }

    async updateForm(id: UUID, patch: StudentFeedbackFormPatch, tx?: Services): Promise<StudentFeedbackFormRow | null> {
        const svc = tx ?? this.services;
        const t = nowIso();
        const payload: StudentFeedbackFormPatch = {
            ...patch,
            updated_at: (patch as any).updated_at ?? t,
        } as any;

        return svc.student_feedback_forms.updateOne({ id }, payload as any);
    }

    async activateForm(id: UUID, tx?: Services): Promise<StudentFeedbackFormRow | null> {
        const svc = tx ?? this.services;

        return svc.transaction(async (tx2) => {
            const current = await tx2.student_feedback_forms.findById(id);
            if (!current) return null;

            // best-effort: deactivate other active forms to satisfy "single active" expectation
            try {
                const actives = await tx2.student_feedback_forms.findMany({
                    where: { active: true as any },
                    limit: 500,
                } as any);

                await Promise.all(
                    actives
                        .filter((f) => f.id !== id)
                        .map((f) =>
                            tx2.student_feedback_forms.updateOne(
                                { id: f.id },
                                { active: false, updated_at: nowIso() } as any,
                            ),
                        ),
                );
            } catch {
                // ignore; DB may already enforce single active.
            }

            const updated =
                (await tx2.student_feedback_forms.updateOne(
                    { id },
                    { active: true, updated_at: nowIso() } as any,
                )) ?? (await tx2.student_feedback_forms.findById(id));

            return updated ?? null;
        });
    }

    async getActiveForm(tx?: Services): Promise<StudentFeedbackFormRow | null> {
        const svc = tx ?? this.services;

        // Prefer explicit active=true
        try {
            const actives = await svc.student_feedback_forms.findMany({
                where: { active: true as any },
                orderBy: 'updated_at',
                orderDirection: 'desc',
                limit: 1,
            } as any);

            if (actives && actives.length > 0) return actives[0] ?? null;
        } catch {
            // ignore
        }

        // Fallback: latest form
        try {
            const latest = await svc.student_feedback_forms.findMany({
                orderBy: 'updated_at',
                orderDirection: 'desc',
                limit: 1,
            });

            return latest[0] ?? null;
        } catch {
            return null;
        }
    }

    async getActiveSchema(tx?: Services): Promise<StudentFeedbackFormSchema> {
        const form = await this.getActiveForm(tx);
        const schema = toJsonObject(form?.schema ?? {});
        return schema as StudentFeedbackFormSchema;
    }

    async getActiveSeedAnswersTemplate(tx?: Services): Promise<JsonObject> {
        const schema = await this.getActiveSchema(tx);
        return this.getSeedAnswersTemplateForSchema(schema);
    }

    /* ---------------------- Schema helpers (seed/score) ---------------------- */

    private iterateQuestions(schema: StudentFeedbackFormSchema): StudentFeedbackFormQuestion[] {
        const s = (schema ?? {}) as any;
        const sections = Array.isArray(s.sections) ? (s.sections as any[]) : [];
        const out: StudentFeedbackFormQuestion[] = [];

        for (const secRaw of sections) {
            const sec = isRecord(secRaw) ? (secRaw as any) : {};
            const questions = Array.isArray(sec.questions) ? (sec.questions as any[]) : [];
            for (const qRaw of questions) {
                const q = isRecord(qRaw) ? (qRaw as any) : null;
                const id = typeof q?.id === 'string' && q.id.trim().length > 0 ? q.id.trim() : null;
                if (!id) continue;

                out.push({
                    id,
                    label: typeof q.label === 'string' ? q.label : undefined,
                    type: (typeof q.type === 'string' ? q.type : undefined) as any,
                    required: typeof q.required === 'boolean' ? q.required : undefined,
                    min: typeof q.min === 'number' ? q.min : undefined,
                    max: typeof q.max === 'number' ? q.max : undefined,
                    weight: typeof q.weight === 'number' ? q.weight : undefined,
                    options: Array.isArray(q.options) ? q.options : undefined,
                    placeholder: typeof q.placeholder === 'string' ? q.placeholder : undefined,
                });
            }
        }

        return out;
    }

    getSeedAnswersTemplateForSchema(schema: StudentFeedbackFormSchema): JsonObject {
        const out: JsonObject = {};
        const questions = this.iterateQuestions(schema);

        for (const q of questions) {
            const t = String(q.type ?? '').toLowerCase();
            if (t === 'checkbox') {
                out[q.id] = false;
            } else if (t === 'multiselect') {
                out[q.id] = [];
            } else if (t === 'textarea' || t === 'text') {
                out[q.id] = '';
            } else if (t === 'rating' || t === 'scale' || t === 'number') {
                out[q.id] = null;
            } else {
                out[q.id] = null;
            }
        }

        return out;
    }

    validateRequiredAnswers(answers: JsonObject, schema: StudentFeedbackFormSchema): { ok: boolean; missing: string[] } {
        const a = (answers ?? {}) as JsonObject;
        const questions = this.iterateQuestions(schema);

        const missing: string[] = [];
        for (const q of questions) {
            if (!q.required) continue;

            const v = (a as any)[q.id];

            // treat empty strings / null / undefined as missing
            if (v === null || v === undefined) {
                missing.push(q.id);
                continue;
            }
            if (typeof v === 'string' && v.trim().length === 0) {
                missing.push(q.id);
                continue;
            }
            if (Array.isArray(v) && v.length === 0) {
                missing.push(q.id);
                continue;
            }
        }

        return { ok: missing.length === 0, missing };
    }

    computeScoreSummary(answers: JsonObject, schema: StudentFeedbackFormSchema): StudentFeedbackScoreSummary {
        const a = (answers ?? {}) as JsonObject;
        const questions = this.iterateQuestions(schema);

        let total = 0;
        let max = 0;

        const breakdown: JsonObject = {};

        for (const q of questions) {
            const t = String(q.type ?? '').toLowerCase();
            const weight = typeof q.weight === 'number' && Number.isFinite(q.weight) && q.weight > 0 ? q.weight : 1;

            if (t === 'rating' || t === 'scale' || t === 'number') {
                const qMax = typeof q.max === 'number' && Number.isFinite(q.max) && q.max > 0 ? q.max : 5;
                const v = (a as any)[q.id];
                const n = toNumber(v);

                max += qMax * weight;

                if (n !== null) {
                    const clamped = Math.max(0, Math.min(qMax, n));
                    total += clamped * weight;
                    breakdown[q.id] = { value: clamped, max: qMax, weight };
                } else {
                    breakdown[q.id] = { value: null, max: qMax, weight };
                }

                continue;
            }

            // Non-numeric questions contribute 0 to score; still capture presence for debugging/preview UX
            const v = (a as any)[q.id];
            breakdown[q.id] = { value: v ?? null, weight };
        }

        const pct = max > 0 ? (total / max) * 100 : 0;

        return {
            total_score: Number.isFinite(total) ? total : 0,
            max_score: Number.isFinite(max) ? max : 0,
            percentage: Number.isFinite(pct) ? pct : 0,
            breakdown,
        };
    }

    /* ------------------------------ Assignments ------------------------------ */

    private async resolveStudentUserId(tx: Services, id: UUID): Promise<UUID | null> {
        // 1) direct user id (preferred)
        try {
            const u = await tx.users.findById(id);
            if (u && u.role === 'student') return u.id as UUID;
        } catch {
            // ignore
        }

        // 2) already a student user id but user lookup failed (rare) — try student profile by user id
        try {
            const prof = await tx.students.findByUserId(id);
            if (prof) return id;
        } catch {
            // ignore
        }

        // 3) if someone accidentally sent a "students table primary key" (if it exists), best-effort map to user_id
        try {
            const anyStudents = tx.students as any;
            if (typeof anyStudents.findById === 'function') {
                const row = await anyStudents.findById(id);
                const userId = row?.user_id;
                if (typeof userId === 'string' && userId.trim().length > 0) return userId as UUID;
            }
        } catch {
            // ignore
        }

        return null;
    }

    private async listGroupStudentIdsBestEffort(tx: Services, groupId: UUID): Promise<UUID[]> {
        const candidates: Array<{
            svc: any;
            fn: 'listByGroup' | 'findMany';
            whereKey?: string;
        }> = [];

        const anyTx = tx as any;

        // Common service names seen across codebases
        const svcNames = [
            'thesis_group_students',
            'thesis_group_members',
            'group_students',
            'group_members',
            'thesis_group_student_members',
        ];

        for (const name of svcNames) {
            const svc = anyTx[name];
            if (!svc) continue;

            if (typeof svc.listByGroup === 'function') {
                candidates.push({ svc, fn: 'listByGroup' });
            }
            if (typeof svc.findMany === 'function') {
                candidates.push({ svc, fn: 'findMany', whereKey: 'group_id' });
            }
        }

        for (const c of candidates) {
            try {
                const rows =
                    c.fn === 'listByGroup'
                        ? await c.svc.listByGroup(groupId)
                        : await c.svc.findMany({ where: { [c.whereKey ?? 'group_id']: groupId } });

                if (!Array.isArray(rows) || rows.length === 0) continue;

                const ids: UUID[] = [];
                for (const r of rows) {
                    const row = isRecord(r) ? (r as any) : {};
                    const raw =
                        row.student_id ??
                        row.user_id ??
                        row.member_id ??
                        row.student_user_id ??
                        row.studentId ??
                        row.userId ??
                        null;

                    if (typeof raw === 'string' && raw.trim().length > 0) ids.push(raw as UUID);
                }

                if (ids.length > 0) return ids;
            } catch {
                // try next
            }
        }

        return [];
    }

    private async upsertScoreBestEffort(
        tx: Services,
        evaluation: StudentEvaluationRow,
        schema: StudentFeedbackFormSchema,
        formId: UUID | null,
        computedAt: string,
        answersOverride?: JsonObject,
    ): Promise<StudentEvaluationScoreRow | null> {
        const summary = this.computeScoreSummary(
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

        const anyScores = tx.student_evaluation_scores as any;

        // Preferred: native upsert method used elsewhere in codebase
        if (typeof anyScores.upsert === 'function') {
            try {
                return await anyScores.upsert(
                    { student_evaluation_id: evaluation.id },
                    createPayload,
                    patchPayload,
                );
            } catch {
                // fall back below
            }
        }

        // Fallback: manual upsert
        try {
            const existing =
                (typeof anyScores.findOne === 'function'
                    ? await anyScores.findOne({ student_evaluation_id: evaluation.id })
                    : null) ??
                (typeof anyScores.findByStudentEvaluationId === 'function'
                    ? await anyScores.findByStudentEvaluationId(evaluation.id)
                    : null);

            if (existing && typeof anyScores.updateOne === 'function') {
                const updated = await anyScores.updateOne(
                    { student_evaluation_id: evaluation.id },
                    patchPayload,
                );
                return (updated ?? existing) as StudentEvaluationScoreRow;
            }

            if (typeof anyScores.create === 'function') {
                return (await anyScores.create(createPayload)) as StudentEvaluationScoreRow;
            }
        } catch {
            // ignore
        }

        return null;
    }

    async assignForSchedule(
        scheduleId: UUID,
        input: AssignStudentFeedbackFormsInput = {},
    ): Promise<AssignStudentFeedbackFormsResult | null> {
        return this.services.transaction(async (tx) => {
            const schedule = await tx.defense_schedules.findById(scheduleId);
            if (!schedule) return null;

            const groupId = schedule.group_id as UUID;

            const overwritePending = input.overwritePending ?? false;
            const initialStatus: StudentEvalStatus = normalizeStatus(input.initialStatus ?? 'pending');

            const activeForm = await this.getActiveForm(tx);
            const schema = toJsonObject(activeForm?.schema ?? {}) as StudentFeedbackFormSchema;

            const seedAnswers =
                input.seedAnswers && Object.keys(input.seedAnswers).length > 0
                    ? input.seedAnswers
                    : this.getSeedAnswersTemplateForSchema(schema);

            const rawStudentIds = Array.isArray(input.studentIds) ? input.studentIds : [];

            let targetedStudentIds: UUID[] = [];

            if (rawStudentIds.length > 0) {
                const resolved = await Promise.all(rawStudentIds.map((id) => this.resolveStudentUserId(tx, id)));
                targetedStudentIds = resolved.filter(Boolean) as UUID[];
            } else {
                const groupStudents = await this.listGroupStudentIdsBestEffort(tx, groupId);
                const resolved = await Promise.all(groupStudents.map((id) => this.resolveStudentUserId(tx, id)));
                targetedStudentIds = resolved.filter(Boolean) as UUID[];
            }

            // de-dupe
            targetedStudentIds = Array.from(new Set(targetedStudentIds.map((x) => x.toLowerCase()))).map(
                (x) => x as UUID,
            );

            const created: UUID[] = [];
            const updated: UUID[] = [];
            const existingIds: UUID[] = [];

            const t = nowIso();

            for (const studentUserId of targetedStudentIds) {
                const existing = await tx.student_evaluations.findOne({
                    schedule_id: scheduleId,
                    student_id: studentUserId,
                });

                if (existing) {
                    const st = normalizeStatus(existing.status);

                    // Only reset/overwrite when it's pending (to avoid clobbering submissions)
                    if (st === 'pending' && overwritePending) {
                        const patched = await tx.student_evaluations.updateOne(
                            { id: existing.id },
                            {
                                answers: seedAnswers,
                                form_id: activeForm?.id ?? existing.form_id ?? null,
                                status: initialStatus,
                                submitted_at: null,
                                locked_at: null,
                                updated_at: t,
                            } as any,
                        );

                        const final = patched ?? (await tx.student_evaluations.findById(existing.id));
                        if (final) {
                            updated.push(final.id);
                            await this.upsertScoreBestEffort(
                                tx,
                                final,
                                schema,
                                activeForm?.id ?? final.form_id ?? null,
                                t,
                                seedAnswers,
                            );
                        } else {
                            existingIds.push(existing.id);
                        }
                    } else {
                        existingIds.push(existing.id);
                    }

                    continue;
                }

                const createdRow = await tx.student_evaluations.create({
                    schedule_id: scheduleId,
                    student_id: studentUserId,
                    form_id: activeForm?.id ?? null,
                    status: initialStatus,
                    answers: seedAnswers,
                    submitted_at: null,
                    locked_at: null,
                    created_at: t,
                    updated_at: t,
                } as any);

                if (createdRow) {
                    created.push(createdRow.id);
                    await this.upsertScoreBestEffort(
                        tx,
                        createdRow,
                        schema,
                        activeForm?.id ?? createdRow.form_id ?? null,
                        t,
                        seedAnswers,
                    );
                }
            }

            return {
                scheduleId,
                groupId,
                counts: {
                    created: created.length,
                    updated: updated.length,
                    existing: existingIds.length,
                },
                created,
                updated,
                existing: existingIds,
                targetedStudentIds,
            };
        });
    }

    /* ------------------------------- Admin Lists ------------------------------ */

    async listForScheduleDetailed(scheduleId: UUID, tx?: Services): Promise<AdminStudentFeedbackRow[]> {
        const svc = tx ?? this.services;

        const rows = await svc.student_evaluations.findMany({
            where: { schedule_id: scheduleId },
            orderBy: 'created_at',
            orderDirection: 'asc',
            limit: 5000,
        });

        if (!rows || rows.length === 0) return [];

        const studentIds = Array.from(new Set(rows.map((r) => (r.student_id as string).toLowerCase()))).map(
            (s) => s as UUID,
        );

        const users = await Promise.all(
            studentIds.map(async (id) => {
                try {
                    return await svc.users.findById(id);
                } catch {
                    return null;
                }
            }),
        );

        const userById = new Map<UUID, UserRow>();
        for (const u of users) {
            if (u) userById.set(u.id as UUID, u);
        }

        // Best UX ordering: show pending first (actionable), then submitted, then locked
        const statusOrder: Record<StudentEvalStatus, number> = {
            pending: 1,
            submitted: 2,
            locked: 3,
        };

        const mapped: AdminStudentFeedbackRow[] = rows
            .map((r) => {
                const u = userById.get(r.student_id as UUID) ?? null;

                const status = normalizeStatus((r as any).status);

                const base: AdminStudentFeedbackRow = {
                    ...(r as any),
                    status,
                    // aliases for frontend matching
                    student_evaluation_id: r.id,
                    studentEvaluationId: r.id,

                    student_name: u?.name ?? null,
                    student_email: u?.email ?? null,

                    // default score fields (hydrated later by AdminController)
                    total_score: null,
                    max_score: null,
                    percentage: null,
                    breakdown: null,
                    computed_at: null,

                    // extra aliases UI might read
                    score_total: null,
                    score_max: null,
                    score_percentage: null,

                    score_ready: false,
                };

                return base;
            })
            .sort((a, b) => {
                const aS = statusOrder[normalizeStatus(a.status)] ?? 99;
                const bS = statusOrder[normalizeStatus(b.status)] ?? 99;
                if (aS !== bS) return aS - bS;

                const aName = String(a.student_name ?? '').toLowerCase();
                const bName = String(b.student_name ?? '').toLowerCase();
                return aName.localeCompare(bName);
            });

        return mapped;
    }
}
