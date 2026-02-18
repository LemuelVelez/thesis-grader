import type {
    DbNumeric,
    DefenseScheduleRow,
    GroupMemberRow,
    ISODateTime,
    JsonObject,
    JsonValue,
    StudentEvaluationPatch,
    StudentEvaluationRow,
    StudentEvalStatus,
    StudentFeedbackFormInsert,
    StudentFeedbackFormPatch,
    StudentFeedbackFormRow,
    StudentRow,
    UUID,
    UserRow,
} from '../models/Model';
import type { Services } from './Services';

/**
 * Public schema type consumed by controllers/routes.
 * We intentionally keep it flexible (stored as JSON in DB).
 */
export type StudentFeedbackFormSchema = JsonObject;

export interface RequiredAnswersValidation {
    ok: boolean;
    missing: string[];
}

/**
 * Backward/forward-compatible input for assigning/ensuring student feedback entries for a schedule.
 * Supports both snake_case (service-style) and camelCase (route-style).
 */
export interface AssignStudentFeedbackFormsInput {
    /** Prefer assigning using a specific form; otherwise ACTIVE is used */
    form_id?: UUID;
    formId?: UUID;

    /**
     * If true, overwrite existing answers (route calls this overwritePending).
     * NOTE: We do not hard-restrict to "pending" here; controllers/routes decide.
     */
    force?: boolean;
    overwritePending?: boolean;

    /** Optional answer template override */
    seed_answers?: JsonObject;
    seedAnswers?: JsonObject;

    /** Optional subset targeting */
    student_ids?: UUID[];
    studentIds?: UUID[];

    /** Initial status for created entries */
    initialStatus?: StudentEvalStatus;
}

export interface AssignStudentFeedbackFormsCounts {
    created: number;
    existing: number;
    updated: number;
    total: number;
}

/**
 * Backward/forward-compatible result shape:
 * - snake_case for internal/service usage
 * - camelCase + counts + targetedStudentIds for AdminRoute expectations
 */
export interface AssignStudentFeedbackFormsResult {
    // canonical snake_case
    schedule_id: UUID;
    group_id: UUID;
    form_id: UUID | null;
    total_students: number;
    created: number;
    existing: number;
    updated: number;

    // route-friendly aliases
    scheduleId: UUID;
    groupId: UUID;
    formId: UUID | null;
    targetedStudentIds: UUID[];
    counts: AssignStudentFeedbackFormsCounts;
}

/**
 * Admin detailed row: student evaluation entry + student identity/profile.
 * Includes persisted score summary when available.
 */
export interface AdminStudentFeedbackRow extends StudentEvaluationRow {
    student_name: string | null;
    student_email: string | null;
    program: string | null;
    section: string | null;

    score_total: DbNumeric | null;
    score_max: DbNumeric | null;
    score_percentage: DbNumeric | null;
    score_computed_at: ISODateTime | null;
}

function nowIso(): ISODateTime {
    return new Date().toISOString();
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.trim().length > 0;
}

function isMissingAnswer(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
    return false;
}

/**
 * Extract "required keys" from various possible schema shapes:
 * - Custom form: { sections: [{ questions: [{ key/id/name, required: true }] }] }
 * - Flat: { questions: [...] } or { fields: [...] }
 * - JSON Schema-ish: { required: [...], properties: {...} }
 *
 * We walk the structure safely and collect keys.
 */
function collectRequiredKeys(node: JsonValue, out: Set<string>): void {
    if (node === null) return;

    if (Array.isArray(node)) {
        for (const item of node) collectRequiredKeys(item, out);
        return;
    }

    if (typeof node !== 'object') return;

    const obj = node as Record<string, unknown>;

    // JSON-schema style: { required: ["a","b"], properties: {...} }
    if (Array.isArray(obj.required)) {
        for (const k of obj.required) {
            if (isNonEmptyString(k)) out.add(k);
        }
    }

    // Custom question/field arrays
    const maybeArrays: unknown[] = [];
    if (Array.isArray(obj.questions)) maybeArrays.push(...obj.questions);
    if (Array.isArray(obj.fields)) maybeArrays.push(...obj.fields);

    for (const item of maybeArrays) {
        if (!item || typeof item !== 'object') continue;
        const q = item as Record<string, unknown>;

        const required = q.required === true;
        if (!required) continue;

        const key =
            (isNonEmptyString(q.key) && q.key) ||
            (isNonEmptyString(q.id) && q.id) ||
            (isNonEmptyString(q.name) && q.name) ||
            null;

        if (key) out.add(key);
    }

    // Recurse through object values
    for (const v of Object.values(obj)) {
        collectRequiredKeys(v as JsonValue, out);
    }
}

function requiredKeysFromSchema(schema: StudentFeedbackFormSchema): string[] {
    const keys = new Set<string>();
    collectRequiredKeys(schema as unknown as JsonValue, keys);
    return Array.from(keys);
}

type RatingQuestion = {
    id: string;
    label: string | null;
    min: number;
    max: number;
};

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const t = value.trim();
        if (!t) return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

function collectRatingQuestions(node: JsonValue, out: RatingQuestion[]): void {
    if (node === null) return;

    if (Array.isArray(node)) {
        for (const item of node) collectRatingQuestions(item, out);
        return;
    }

    if (typeof node !== 'object') return;

    const obj = node as Record<string, unknown>;

    const type = typeof obj.type === 'string' ? obj.type.trim().toLowerCase() : null;
    if (type === 'rating') {
        const id =
            (isNonEmptyString(obj.id) && obj.id) ||
            (isNonEmptyString(obj.key) && obj.key) ||
            (isNonEmptyString(obj.name) && obj.name) ||
            null;

        if (id) {
            const label = isNonEmptyString(obj.label) ? obj.label : null;

            const scale = (obj.scale && typeof obj.scale === 'object' && !Array.isArray(obj.scale))
                ? (obj.scale as Record<string, unknown>)
                : null;

            const min = clamp(toFiniteNumber(scale?.min) ?? 1, -1_000_000, 1_000_000);
            const max = clamp(toFiniteNumber(scale?.max) ?? 5, -1_000_000, 1_000_000);

            const normalizedMin = Math.min(min, max);
            const normalizedMax = Math.max(min, max);

            out.push({
                id,
                label,
                min: normalizedMin,
                max: normalizedMax,
            });
        }
    }

    for (const v of Object.values(obj)) {
        collectRatingQuestions(v as JsonValue, out);
    }
}

export type StudentFeedbackScoreSummary = {
    total_score: number;
    max_score: number;
    percentage: number;
    breakdown: JsonObject;
};

function seedAnswersForSchema(schema: StudentFeedbackFormSchema): JsonObject {
    const requiredKeys = requiredKeysFromSchema(schema);
    const out: JsonObject = {};
    for (const k of requiredKeys) out[k] = null;
    return out;
}

export class StudentFeedbackService {
    constructor(private readonly services: Services) { }

    private svc(override?: Services): Services {
        return override ?? this.services;
    }

    /* ------------------------------- FORMS CRUD ------------------------------ */

    async listForms(override?: Services): Promise<StudentFeedbackFormRow[]> {
        const s = this.svc(override);
        return s.student_feedback_forms.findMany({
            orderBy: 'version',
            orderDirection: 'desc',
            limit: 500,
        });
    }

    async getFormById(id: UUID, override?: Services): Promise<StudentFeedbackFormRow | null> {
        const s = this.svc(override);
        return s.student_feedback_forms.findById(id);
    }

    async createForm(input: StudentFeedbackFormInsert, override?: Services): Promise<StudentFeedbackFormRow> {
        const s = this.svc(override);
        const ts = nowIso();

        const row: StudentFeedbackFormInsert = {
            ...input,
            active: input.active ?? false,
            created_at: input.created_at ?? ts,
            updated_at: input.updated_at ?? ts,
        };

        // If creating an ACTIVE form, keep "single active" consistent.
        // This prevents 500s caused by unique/partial-unique constraints on active=true.
        if (row.active) {
            if (override) {
                await s.student_feedback_forms.update(
                    { active: true },
                    { active: false, updated_at: row.updated_at ?? ts },
                );
                return s.student_feedback_forms.create(row);
            }

            return s.transaction(async (tx) => {
                await tx.student_feedback_forms.update(
                    { active: true },
                    { active: false, updated_at: row.updated_at ?? ts },
                );
                return tx.student_feedback_forms.create(row);
            });
        }

        return s.student_feedback_forms.create(row);
    }

    async updateForm(
        id: UUID,
        patch: StudentFeedbackFormPatch,
        override?: Services,
    ): Promise<StudentFeedbackFormRow | null> {
        const s = this.svc(override);
        const updatedAt = patch.updated_at ?? nowIso();
        const nextPatch: StudentFeedbackFormPatch = { ...patch, updated_at: updatedAt };

        // If turning ACTIVE via patch, ensure single-active consistency without nuking active state on invalid ids.
        if (nextPatch.active === true) {
            if (override) {
                const exists = await s.student_feedback_forms.findById(id);
                if (!exists) return null;

                await s.student_feedback_forms.update({ active: true }, { active: false, updated_at: updatedAt });
                const updated = await s.student_feedback_forms.updateOne({ id }, nextPatch);
                return updated ?? (await s.student_feedback_forms.findById(id));
            }

            return s.transaction(async (tx) => {
                const exists = await tx.student_feedback_forms.findById(id);
                if (!exists) return null;

                await tx.student_feedback_forms.update({ active: true }, { active: false, updated_at: updatedAt });
                const updated = await tx.student_feedback_forms.updateOne({ id }, nextPatch);
                return updated ?? (await tx.student_feedback_forms.findById(id));
            });
        }

        return s.student_feedback_forms.updateOne({ id }, nextPatch);
    }

    /**
     * Activates a single form and deactivates all other forms.
     */
    async activateForm(id: UUID, override?: Services): Promise<StudentFeedbackFormRow | null> {
        const s = this.svc(override);

        if (override) {
            // already inside a transaction context (best-effort, no nesting)
            return this.activateFormInTx(id, s);
        }

        return s.transaction(async (tx) => this.activateFormInTx(id, tx));
    }

    private async activateFormInTx(id: UUID, tx: Services): Promise<StudentFeedbackFormRow | null> {
        const existing = await tx.student_feedback_forms.findById(id);
        if (!existing) return null;

        const ts = nowIso();

        // Deactivate existing active ones
        await tx.student_feedback_forms.update({ active: true }, { active: false, updated_at: ts });

        // Activate target
        const updated = await tx.student_feedback_forms.updateOne(
            { id },
            { active: true, updated_at: ts },
        );

        return updated ?? existing;
    }

    /* ------------------------------- ACTIVE FORM ----------------------------- */

    private async getActiveFormRow(override?: Services): Promise<StudentFeedbackFormRow | null> {
        const s = this.svc(override);

        const active = await s.student_feedback_forms.findMany({
            where: { active: true },
            orderBy: 'version',
            orderDirection: 'desc',
            limit: 1,
        });
        if (active[0]) return active[0];

        const latest = await s.student_feedback_forms.findMany({
            orderBy: 'version',
            orderDirection: 'desc',
            limit: 1,
        });
        return latest[0] ?? null;
    }

    /**
     * Public accessor for the currently active form row (or latest as fallback).
     */
    async getActiveForm(override?: Services): Promise<StudentFeedbackFormRow | null> {
        return this.getActiveFormRow(override);
    }

    async getActiveSchema(override?: Services): Promise<StudentFeedbackFormSchema> {
        const form = await this.getActiveFormRow(override);
        const schema = (form?.schema ?? {}) as JsonObject;
        return schema as StudentFeedbackFormSchema;
    }

    async getSchemaByFormId(formId: UUID, override?: Services): Promise<StudentFeedbackFormSchema | null> {
        const s = this.svc(override);
        const form = await s.student_feedback_forms.findById(formId);
        if (!form) return null;
        const schema = (form.schema ?? {}) as JsonObject;
        return schema as StudentFeedbackFormSchema;
    }

    async getActiveSeedAnswersTemplate(override?: Services): Promise<JsonObject> {
        const schema = await this.getActiveSchema(override);
        return seedAnswersForSchema(schema);
    }

    /**
     * Seed answers template for any schema (used when assigning specific form versions).
     */
    getSeedAnswersTemplateForSchema(schema: StudentFeedbackFormSchema): JsonObject {
        return seedAnswersForSchema(schema);
    }

    /* ------------------------------ VALIDATION ------------------------------- */

    validateRequiredAnswers(
        answers: JsonObject,
        schema: StudentFeedbackFormSchema,
    ): RequiredAnswersValidation {
        const requiredKeys = requiredKeysFromSchema(schema);
        const missing: string[] = [];

        for (const key of requiredKeys) {
            const value = (answers as Record<string, unknown>)[key];
            if (isMissingAnswer(value)) missing.push(key);
        }

        return { ok: missing.length === 0, missing };
    }

    /* ------------------------------- SCORING -------------------------------- */

    /**
     * Computes a persisted-friendly score summary:
     * - totals across all "rating" questions found in schema
     * - missing/non-numeric answers contribute 0 (still counted in max_score)
     */
    computeScoreSummary(
        answers: JsonObject,
        schema: StudentFeedbackFormSchema,
    ): StudentFeedbackScoreSummary {
        const questions: RatingQuestion[] = [];
        collectRatingQuestions(schema as unknown as JsonValue, questions);

        // De-dup by question id (schema can be nested; defensive).
        const seen = new Set<string>();
        const uniq = questions.filter((q) => {
            const key = q.id.trim().toLowerCase();
            if (!key) return false;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        let total = 0;
        let maxTotal = 0;

        const breakdownQuestions: Record<string, JsonValue> = {};

        for (const q of uniq) {
            maxTotal += q.max;

            const raw = (answers as Record<string, unknown>)[q.id];
            const n = toFiniteNumber(raw);
            const scored = n === null ? 0 : clamp(n, q.min, q.max);

            total += scored;

            breakdownQuestions[q.id] = {
                label: q.label,
                value: n,
                min: q.min,
                max: q.max,
                score: scored,
            } as unknown as JsonValue;
        }

        const percentage = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

        const breakdown: JsonObject = {
            totals: {
                total_score: total,
                max_score: maxTotal,
                percentage,
                rating_questions: uniq.length,
            } as unknown as JsonValue,
            questions: breakdownQuestions as unknown as JsonValue,
        };

        return {
            total_score: total,
            max_score: maxTotal,
            percentage,
            breakdown,
        };
    }

    /* ------------------------------ ASSIGNMENT ------------------------------- */

    async assignForSchedule(
        scheduleId: UUID,
        input: AssignStudentFeedbackFormsInput = {},
    ): Promise<AssignStudentFeedbackFormsResult | null> {
        return this.services.transaction(async (tx) => {
            const schedule = await tx.defense_schedules.findById(scheduleId);
            if (!schedule) return null;

            const groupMembers: GroupMemberRow[] = await tx.group_members.listByGroup(schedule.group_id);
            const groupStudentIds = Array.from(
                new Set(
                    groupMembers
                        .map((m) => (m as unknown as { student_id?: UUID }).student_id)
                        .filter((id): id is UUID => !!id),
                ),
            );

            const requestedIds = (input.studentIds ?? input.student_ids) ?? [];
            const targetedStudentIds =
                requestedIds.length > 0
                    ? groupStudentIds.filter((id) => requestedIds.includes(id))
                    : groupStudentIds;

            const formId = input.form_id ?? input.formId;

            const form =
                formId
                    ? await tx.student_feedback_forms.findById(formId)
                    : await this.getActiveFormRow(tx);

            const formSchema = (form?.schema ?? {}) as JsonObject;

            const force = input.force ?? input.overwritePending ?? false;

            const seedOverride = input.seed_answers ?? input.seedAnswers;

            const seed =
                seedOverride ??
                this.getSeedAnswersTemplateForSchema(formSchema as StudentFeedbackFormSchema);

            const initialStatus: StudentEvalStatus = input.initialStatus ?? 'pending';

            let created = 0;
            let existing = 0;
            let updated = 0;

            const now = nowIso();

            for (const studentId of targetedStudentIds) {
                const already = await tx.student_evaluations.findOne({
                    schedule_id: scheduleId,
                    student_id: studentId,
                });

                if (!already) {
                    await tx.student_evaluations.create({
                        schedule_id: scheduleId,
                        student_id: studentId,
                        form_id: form?.id ?? null,
                        status: initialStatus,
                        answers: seed,
                        submitted_at: null,
                        locked_at: null,
                        created_at: now,
                        updated_at: now,
                    });
                    created += 1;
                    continue;
                }

                existing += 1;

                if (force) {
                    const patch: StudentEvaluationPatch = {
                        answers: seed,
                        form_id: form?.id ?? already.form_id ?? null,
                        updated_at: now,
                    };

                    const changed = await tx.student_evaluations.updateOne({ id: already.id }, patch);
                    if (changed) updated += 1;
                }
            }

            const counts: AssignStudentFeedbackFormsCounts = {
                created,
                existing,
                updated,
                total: targetedStudentIds.length,
            };

            return {
                // snake_case
                schedule_id: scheduleId,
                group_id: schedule.group_id,
                form_id: form?.id ?? null,
                total_students: targetedStudentIds.length,
                created,
                existing,
                updated,

                // camelCase + extras for AdminRoute.ts compatibility
                scheduleId,
                groupId: schedule.group_id,
                formId: form?.id ?? null,
                targetedStudentIds,
                counts,
            };
        });
    }

    async listForScheduleDetailed(scheduleId: UUID): Promise<AdminStudentFeedbackRow[]> {
        const evaluations: StudentEvaluationRow[] = await this.services.student_evaluations.listBySchedule(
            scheduleId,
        );

        const rows = await Promise.all(
            evaluations.map(async (ev): Promise<AdminStudentFeedbackRow> => {
                const [user, profile, scoreRow] = await Promise.all([
                    this.services.users.findById(ev.student_id),
                    this.services.students.findByUserId(ev.student_id),
                    this.services.student_evaluation_scores.findOne({ student_evaluation_id: ev.id }),
                ]);

                const u = user as UserRow | null;
                const p = profile as StudentRow | null;

                return {
                    ...ev,
                    student_name: u?.name ?? null,
                    student_email: u?.email ?? null,
                    program: p?.program ?? null,
                    section: p?.section ?? null,

                    score_total: scoreRow?.total_score ?? null,
                    score_max: scoreRow?.max_score ?? null,
                    score_percentage: scoreRow?.percentage ?? null,
                    score_computed_at: scoreRow?.computed_at ?? null,
                };
            }),
        );

        // Stable ordering: submitted first, then pending, then locked; within each by name.
        const statusOrder: Record<StudentEvalStatus, number> = {
            submitted: 1,
            pending: 2,
            locked: 3,
        };

        return rows.sort((a, b) => {
            const aS = statusOrder[a.status] ?? 99;
            const bS = statusOrder[b.status] ?? 99;
            if (aS !== bS) return aS - bS;

            const aName = (a.student_name ?? '').toLowerCase();
            const bName = (b.student_name ?? '').toLowerCase();
            return aName.localeCompare(bName);
        });
    }

    /* ------------------------------- HELPERS -------------------------------- */

    async getSchedule(scheduleId: UUID): Promise<DefenseScheduleRow | null> {
        return this.services.defense_schedules.findById(scheduleId);
    }
}

export default StudentFeedbackService;
