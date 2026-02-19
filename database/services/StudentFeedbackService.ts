import type {
    DbNumeric,
    DefenseScheduleRow,
    GroupMemberRow,
    JsonObject,
    StudentEvalStatus,
    StudentEvaluationInsert,
    StudentEvaluationPatch,
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

    min?: number;
    max?: number;
    step?: number;

    /**
     * Optional weight for scoring. If omitted, numeric questions default to 1.
     * Scoring model:
     * - numeric answers are normalized to 0..1 using min/max then multiplied by weight
     * - max points for the question = weight
     */
    weight?: number;

    options?: Array<{ value: string; label?: string } | string>;
}

export interface StudentFeedbackFormSection {
    id: string;
    title?: string;
    description?: string;
    questions?: StudentFeedbackFormQuestion[];
}

export type StudentFeedbackFormSchema = JsonObject & {
    key?: string;
    version?: number;
    title?: string;
    description?: string;
    sections?: StudentFeedbackFormSection[];
};

function flattenQuestions(schema: StudentFeedbackFormSchema): StudentFeedbackFormQuestion[] {
    const sections = Array.isArray(schema.sections) ? schema.sections : [];
    const out: StudentFeedbackFormQuestion[] = [];

    for (const s of sections) {
        const qs = Array.isArray(s.questions) ? s.questions : [];
        for (const q of qs) {
            if (!q || typeof q !== 'object') continue;
            if (typeof q.id !== 'string' || !q.id.trim()) continue;
            out.push(q);
        }
    }

    return out;
}

function isAnswered(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value as object).length > 0;
    return false;
}

function clamp(n: number, min: number, max: number): number {
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

export type ScoreSummary = {
    total_score: number;
    max_score: number;
    percentage: number;
    breakdown: JsonObject;
};

export type ValidateRequiredResult = { ok: true; missing: [] } | { ok: false; missing: string[] };

export type AdminStudentFeedbackRow = {
    // stable identifiers
    id: UUID; // evaluation id
    student_evaluation_id: UUID; // alias for admin hydrator
    schedule_id: UUID;
    student_id: UUID;

    // student display
    student_name: string | null;
    student_email: string | null;

    // status/timestamps
    status: StudentEvalStatus;
    submitted_at: string | null;
    locked_at: string | null;

    // pinned form used
    form_id: UUID | null;
    form_title: string | null;
    form_version: number | null;

    // answers (admin may optionally render)
    answers: JsonObject;

    // (optional) score summary fields; admin controller also hydrates from persisted table
    total_score?: DbNumeric | null;
    max_score?: DbNumeric | null;
    percentage?: DbNumeric | null;
    breakdown?: JsonObject | null;
    computed_at?: string | null;

    // helper for UI
    score_ready?: boolean;
};

export type AssignStudentFeedbackFormsInput = {
    studentIds?: UUID[];
    overwritePending?: boolean;
    seedAnswers?: JsonObject;
    initialStatus?: StudentEvalStatus;
};

export type AssignStudentFeedbackFormsResult = {
    scheduleId: UUID;
    groupId: UUID;
    formId: UUID | null;

    targetedStudentIds: UUID[];

    counts: { created: number; updated: number; existing: number };

    created: StudentEvaluationRow[];
    updated: StudentEvaluationRow[];
    existing: StudentEvaluationRow[];
};

type EnsurePinnedFormResult = {
    schedule: DefenseScheduleRow;
    form: StudentFeedbackFormRow | null;
    schema: StudentFeedbackFormSchema;
};

export default class StudentFeedbackService {
    constructor(private readonly services: Services) { }

    /* --------------------------- FORM RESOLUTION --------------------------- */

    async getActiveForm(tx?: Services): Promise<StudentFeedbackFormRow | null> {
        const s = tx ?? this.services;

        // Prefer service helper if implemented (getActiveLatest)
        try {
            const active = await s.student_feedback_forms.getActiveLatest();
            if (active) return active;
        } catch {
            // fallthrough
        }

        // Fallback: list active
        try {
            const actives = await s.student_feedback_forms.listActive({ limit: 5 } as any);
            if (actives && actives.length > 0) return actives[0] ?? null;
        } catch {
            // fallthrough
        }

        // Final fallback: latest by version
        try {
            const latest = await s.student_feedback_forms.findMany({
                orderBy: 'version' as any,
                orderDirection: 'desc',
                limit: 1,
            } as any);
            return latest[0] ?? null;
        } catch {
            return null;
        }
    }

    async getActiveSchema(tx?: Services): Promise<StudentFeedbackFormSchema> {
        const s = tx ?? this.services;
        const form = await this.getActiveForm(s);
        const schema = toJsonObject(form?.schema ?? {});
        return schema as StudentFeedbackFormSchema;
    }

    async getActiveSeedAnswersTemplate(tx?: Services): Promise<JsonObject> {
        const schema = await this.getActiveSchema(tx);
        return this.getSeedAnswersTemplateForSchema(schema);
    }

    getSeedAnswersTemplateForSchema(schema: StudentFeedbackFormSchema): JsonObject {
        const out: JsonObject = {};
        const questions = flattenQuestions(schema);

        for (const q of questions) {
            const type = String(q.type ?? 'text').trim().toLowerCase();
            if (type === 'text' || type === 'textarea') out[q.id] = '';
            else if (type === 'multiselect') out[q.id] = [];
            else if (type === 'checkbox') out[q.id] = false;
            else out[q.id] = null;
        }

        return out;
    }

    validateRequiredAnswers(answers: JsonObject, schema: StudentFeedbackFormSchema): ValidateRequiredResult {
        const missing: string[] = [];
        const questions = flattenQuestions(schema);

        for (const q of questions) {
            if (!q.required) continue;
            const value = (answers as any)[q.id];
            if (!isAnswered(value)) missing.push(q.id);
        }

        return missing.length === 0 ? { ok: true, missing: [] } : { ok: false, missing };
    }

    computeScoreSummary(answers: JsonObject, schema: StudentFeedbackFormSchema): ScoreSummary {
        const questions = flattenQuestions(schema);

        let total = 0;
        let maxTotal = 0;

        const breakdown: JsonObject = {};

        for (const q of questions) {
            const type = String(q.type ?? '').trim().toLowerCase();
            const weight = typeof q.weight === 'number' && Number.isFinite(q.weight) && q.weight > 0 ? q.weight : 1;

            const min = typeof q.min === 'number' && Number.isFinite(q.min) ? q.min : 1;
            const max = typeof q.max === 'number' && Number.isFinite(q.max) ? q.max : 5;

            const raw = (answers as any)[q.id];

            const isNumeric =
                type === 'rating' || type === 'scale' || type === 'number';

            if (!isNumeric) {
                // keep a lightweight breakdown entry for completeness
                breakdown[q.id] = {
                    type,
                    answered: isAnswered(raw),
                } as any;
                continue;
            }

            const v = toNumber(raw);
            maxTotal += weight;

            if (v === null) {
                breakdown[q.id] = {
                    type,
                    value: null,
                    score: 0,
                    max: weight,
                    normalized: 0,
                } as any;
                continue;
            }

            const denom = max - min;
            const normalized =
                denom > 0 ? clamp((v - min) / denom, 0, 1) : 0;

            const score = normalized * weight;

            total += score;

            breakdown[q.id] = {
                type,
                value: v,
                score,
                max: weight,
                normalized,
            } as any;
        }

        const percentage = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

        return {
            total_score: Number.isFinite(total) ? total : 0,
            max_score: Number.isFinite(maxTotal) ? maxTotal : 0,
            percentage: Number.isFinite(percentage) ? percentage : 0,
            breakdown,
        };
    }

    /* ------------------------------ FORM CRUD ------------------------------ */

    async listForms(): Promise<StudentFeedbackFormRow[]> {
        return this.services.student_feedback_forms.findMany({
            orderBy: 'version' as any,
            orderDirection: 'desc',
            limit: 500,
        } as any);
    }

    async getFormById(id: UUID): Promise<StudentFeedbackFormRow | null> {
        return this.services.student_feedback_forms.findById(id);
    }

    async createForm(input: StudentFeedbackFormInsert): Promise<StudentFeedbackFormRow> {
        // Safer: create as inactive, then activate if requested (prevents unique-active constraints)
        const activeRequested = !!(input as any).active;

        const created = await this.services.student_feedback_forms.create({
            ...input,
            active: false,
            created_at: (input as any).created_at ?? nowIso(),
            updated_at: (input as any).updated_at ?? nowIso(),
        } as any);

        if (activeRequested) {
            const activated = await this.activateForm(created.id);
            return activated ?? created;
        }

        return created;
    }

    async updateForm(id: UUID, patch: StudentFeedbackFormPatch): Promise<StudentFeedbackFormRow | null> {
        const activeRequested = (patch as any).active === true;

        // If they want to activate, route through activateForm for single-active semantics.
        if (activeRequested) {
            // Apply patch without "active" first
            const { active: _active, ...rest } = patch as any;
            if (Object.keys(rest).length > 0) {
                await this.services.student_feedback_forms.updateOne(
                    { id },
                    { ...rest, updated_at: nowIso() } as any,
                );
            }
            return this.activateForm(id);
        }

        // Normal patch
        const updated = await this.services.student_feedback_forms.updateOne(
            { id },
            { ...patch, updated_at: nowIso() } as any,
        );
        return updated;
    }

    async activateForm(id: UUID): Promise<StudentFeedbackFormRow | null> {
        return this.services.transaction(async (tx) => {
            // deactivate all active forms first (best-effort)
            try {
                await tx.student_feedback_forms.update({ active: true } as any, { active: false, updated_at: nowIso() } as any);
            } catch {
                // ignore
            }

            const updated = await tx.student_feedback_forms.updateOne(
                { id },
                { active: true, updated_at: nowIso() } as any,
            );

            return updated ?? (await tx.student_feedback_forms.findById(id));
        });
    }

    /* ---------------------------- ASSIGNMENT CORE --------------------------- */

    private async ensurePinnedFormForSchedule(
        tx: Services,
        scheduleId: UUID,
    ): Promise<EnsurePinnedFormResult | null> {
        const schedule = await tx.defense_schedules.findById(scheduleId);
        if (!schedule) return null;

        // Prefer pinned schedule form (migration 014)
        const pinnedId = (schedule.student_feedback_form_id ?? null) as UUID | null;

        let form: StudentFeedbackFormRow | null = null;

        if (pinnedId) {
            form = await tx.student_feedback_forms.findById(pinnedId);
        }

        if (!form) {
            form = await this.getActiveForm(tx);
            // pin it (best UX: consistent for the schedule)
            if (form && !schedule.student_feedback_form_id) {
                try {
                    await tx.defense_schedules.updateOne(
                        { id: scheduleId },
                        { student_feedback_form_id: form.id, updated_at: nowIso() } as any,
                    );
                    schedule.student_feedback_form_id = form.id;
                } catch {
                    // best-effort
                }
            }
        }

        const schemaObj = toJsonObject(form?.schema ?? {});
        const schema = schemaObj as StudentFeedbackFormSchema;

        return { schedule, form, schema };
    }

    private async listGroupMemberStudentIds(
        tx: Services,
        groupId: UUID,
    ): Promise<UUID[]> {
        const members: GroupMemberRow[] = await tx.group_members.listByGroup(groupId);
        const seen = new Set<string>();
        const out: UUID[] = [];

        for (const m of members) {
            const sid = (m as any).student_id as unknown;
            if (typeof sid !== 'string' || !sid.trim()) continue;
            const key = sid.trim().toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(sid.trim() as UUID);
        }

        return out;
    }

    private async loadUsersByIds(
        tx: Services,
        userIds: UUID[],
    ): Promise<Map<UUID, UserRow>> {
        const rows = await Promise.all(userIds.map((id) => tx.users.findById(id)));
        const map = new Map<UUID, UserRow>();
        for (const u of rows) {
            if (u) map.set(u.id, u);
        }
        return map;
    }

    private async upsertScoreSummaryForEvaluation(
        tx: Services,
        evaluation: StudentEvaluationRow,
        schema: StudentFeedbackFormSchema,
        formId: UUID | null,
        computedAt: string,
    ): Promise<StudentEvaluationScoreRow | null> {
        const summary = this.computeScoreSummary((evaluation.answers ?? {}) as JsonObject, schema);

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

        try {
            const upserted = await tx.student_evaluation_scores.upsert(
                { student_evaluation_id: evaluation.id },
                createPayload,
                patchPayload,
            );
            return upserted;
        } catch {
            return null;
        }
    }

    async assignForSchedule(
        scheduleId: UUID,
        input: AssignStudentFeedbackFormsInput = {},
    ): Promise<AssignStudentFeedbackFormsResult | null> {
        return this.services.transaction(async (tx) => {
            const pinned = await this.ensurePinnedFormForSchedule(tx, scheduleId);
            if (!pinned) return null;

            const { schedule, form, schema } = pinned;

            const groupMemberStudentIds = await this.listGroupMemberStudentIds(tx, schedule.group_id);

            // if studentIds provided, only assign to students that belong to the schedule's group
            const targetedStudentIds = (() => {
                const requested = Array.isArray(input.studentIds) ? input.studentIds : [];
                if (requested.length === 0) return groupMemberStudentIds;

                const allowed = new Set(groupMemberStudentIds.map((id) => id.toLowerCase()));
                return requested
                    .filter((id) => typeof id === 'string' && allowed.has(id.toLowerCase()))
                    .map((id) => id as UUID);
            })();

            const overwritePending = !!input.overwritePending;
            const initialStatus: StudentEvalStatus = normalizeStatus(input.initialStatus ?? 'pending');

            const seedAnswers =
                input.seedAnswers && Object.keys(input.seedAnswers).length > 0
                    ? input.seedAnswers
                    : this.getSeedAnswersTemplateForSchema(schema);

            const created: StudentEvaluationRow[] = [];
            const updated: StudentEvaluationRow[] = [];
            const existing: StudentEvaluationRow[] = [];

            const ts = nowIso();

            for (const studentId of targetedStudentIds) {
                const found = await tx.student_evaluations.findOne({
                    schedule_id: scheduleId,
                    student_id: studentId,
                });

                if (found) {
                    const status = normalizeStatus(found.status);

                    if (overwritePending && status === 'pending') {
                        const patch: StudentEvaluationPatch = {
                            form_id: form?.id ?? found.form_id ?? null,
                            status: initialStatus,
                            answers: seedAnswers,
                            submitted_at: null,
                            locked_at: null,
                            updated_at: ts,
                        } as any;

                        const patched =
                            (await tx.student_evaluations.updateOne({ id: found.id }, patch)) ??
                            (await tx.student_evaluations.findById(found.id));

                        if (patched) {
                            updated.push(patched);
                            await this.upsertScoreSummaryForEvaluation(tx, patched, schema, form?.id ?? null, ts);
                        } else {
                            existing.push(found);
                        }
                    } else {
                        existing.push(found);
                    }

                    continue;
                }

                const payload: StudentEvaluationInsert = {
                    schedule_id: scheduleId,
                    student_id: studentId,
                    form_id: form?.id ?? null,
                    status: initialStatus,
                    answers: seedAnswers,
                    submitted_at: null,
                    locked_at: null,
                    created_at: ts,
                    updated_at: ts,
                };

                const ev = await tx.student_evaluations.create(payload);
                created.push(ev);
                await this.upsertScoreSummaryForEvaluation(tx, ev, schema, form?.id ?? null, ts);
            }

            return {
                scheduleId,
                groupId: schedule.group_id,
                formId: form?.id ?? schedule.student_feedback_form_id ?? null,
                targetedStudentIds,
                counts: {
                    created: created.length,
                    updated: updated.length,
                    existing: existing.length,
                },
                created,
                updated,
                existing,
            };
        });
    }

    /* --------------------------- ADMIN LIST (DETAILED) --------------------------- */

    async listForScheduleDetailed(scheduleId: UUID): Promise<AdminStudentFeedbackRow[]> {
        return this.services.transaction(async (tx) => {
            const schedule = await tx.defense_schedules.findById(scheduleId);
            if (!schedule) return [];

            const rows = await tx.student_evaluations.listBySchedule(scheduleId);

            const studentIds = Array.from(new Set(rows.map((r) => r.student_id)));
            const userById = await this.loadUsersByIds(tx, studentIds);

            // Resolve pinned form once
            const pinnedFormId = schedule.student_feedback_form_id ?? null;
            const pinnedForm = pinnedFormId ? await tx.student_feedback_forms.findById(pinnedFormId) : null;

            // Optional: fetch score summaries (best-effort)
            const scoreByEvalId = new Map<UUID, StudentEvaluationScoreRow>();
            try {
                const scores = await tx.student_evaluation_scores.listBySchedule(scheduleId);
                for (const s of scores) scoreByEvalId.set(s.student_evaluation_id, s);
            } catch {
                // ignore
            }

            const out: AdminStudentFeedbackRow[] = rows.map((ev) => {
                const u = userById.get(ev.student_id) ?? null;

                const score = scoreByEvalId.get(ev.id) ?? null;

                const formId = ev.form_id ?? pinnedForm?.id ?? pinnedFormId ?? null;

                const st = normalizeStatus(ev.status);

                const base: AdminStudentFeedbackRow = {
                    id: ev.id,
                    student_evaluation_id: ev.id,
                    schedule_id: ev.schedule_id,
                    student_id: ev.student_id,
                    student_name: u?.name ?? null,
                    student_email: u?.email ?? null,
                    status: st,
                    submitted_at: ev.submitted_at ?? null,
                    locked_at: ev.locked_at ?? null,
                    form_id: formId,
                    form_title: pinnedForm?.title ?? null,
                    form_version: typeof pinnedForm?.version === 'number' ? pinnedForm.version : null,
                    answers: (ev.answers ?? {}) as JsonObject,
                };

                if (score) {
                    base.total_score = score.total_score ?? null;
                    base.max_score = score.max_score ?? null;
                    base.percentage = score.percentage ?? null;
                    base.breakdown = (score.breakdown ?? {}) as any;
                    base.computed_at = score.computed_at ?? null;
                    base.score_ready = st === 'submitted' || st === 'locked';
                } else {
                    base.total_score = null;
                    base.max_score = null;
                    base.percentage = null;
                    base.breakdown = null;
                    base.computed_at = null;
                    base.score_ready = false;
                }

                return base;
            });

            // Stable ordering for admin UX: locked/submitted first, then pending; then student name
            const statusOrder: Record<StudentEvalStatus, number> = { locked: 1, submitted: 2, pending: 3 };

            return out.sort((a, b) => {
                const aS = statusOrder[a.status] ?? 99;
                const bS = statusOrder[b.status] ?? 99;
                if (aS !== bS) return aS - bS;

                const aName = (a.student_name ?? '').toLowerCase();
                const bName = (b.student_name ?? '').toLowerCase();
                return aName.localeCompare(bName);
            });
        });
    }
}
