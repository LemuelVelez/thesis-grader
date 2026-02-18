import { NextRequest, NextResponse } from 'next/server';

import {
    StudentController,
    StudentEvalStateError,
    StudentEvalValidationError,
} from '../controllers/StudentController';
import { createMiddlewareController } from '../controllers/Middleware';
import {
    USER_STATUSES,
    type JsonObject,
    type JsonPrimitive,
    type JsonValue,
    type StudentEvaluationRow,
    type UserRow,
    type UUID,
} from '../models/Model';
import type { DatabaseServices } from '../services/Services';
import StudentFeedbackService, {
    type AssignStudentFeedbackFormsInput,
} from '../services/StudentFeedbackService';
import {
    isUuidLike,
    json200,
    json201,
    json400,
    json404Api,
    json404Entity,
    json405,
    omitWhere,
    parseBoolean,
    parseListQuery,
    readJsonRecord,
    toUserStatus,
} from './Route';

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
    return (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    );
}

function isJsonValue(value: unknown): value is JsonValue {
    if (isJsonPrimitive(value)) return true;

    if (Array.isArray(value)) {
        return value.every((v) => isJsonValue(v));
    }

    if (typeof value === 'object' && value !== null) {
        for (const v of Object.values(value as Record<string, unknown>)) {
            if (!isJsonValue(v)) return false;
        }
        return true;
    }

    return false;
}

function isJsonObject(value: unknown): value is JsonObject {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

    for (const v of Object.values(value as Record<string, unknown>)) {
        if (!isJsonValue(v)) return false;
    }
    return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toJsonObject(value: unknown): JsonObject {
    if (!isRecord(value)) return {};
    // Ensure JSON-safe: only allow JsonValue leaves
    if (!isJsonObject(value)) return {};
    return value as JsonObject;
}

function extractErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message.trim();
    }

    if (error && typeof error === 'object') {
        const maybe = error as Record<string, unknown>;
        const message =
            typeof maybe.message === 'string' ? maybe.message.trim() : '';
        if (message.length > 0) return message;

        const detail =
            typeof maybe.detail === 'string' ? maybe.detail.trim() : '';
        if (detail.length > 0) return detail;
    }

    return 'Unknown error.';
}

/**
 * Fallback schema so schema endpoints never throw 500s when the backing storage
 * (or service wiring) is temporarily unavailable.
 *
 * Frontend should treat this as a minimal/default form.
 */
const FALLBACK_STUDENT_FEEDBACK_SCHEMA: JsonObject = {
    id: 'student-feedback-form',
    title: 'Student Evaluation',
    version: 1,
    description: 'Student feedback form schema (fallback).',
    sections: [
        {
            id: 'overall',
            title: 'Overall Feedback',
            questions: [
                {
                    id: 'overall_rating',
                    label: 'Overall experience',
                    type: 'rating',
                    min: 1,
                    max: 5,
                    required: true,
                },
                {
                    id: 'comments',
                    label: 'Comments / suggestions',
                    type: 'textarea',
                    required: false,
                },
            ],
        },
    ],
};

const FALLBACK_SEED_ANSWERS_TEMPLATE: JsonObject = {
    overall_rating: null,
    comments: '',
};

async function getStudentFeedbackSchemaSafe(
    controller: StudentController,
): Promise<{
    schema: JsonObject;
    seedAnswersTemplate: JsonObject;
    warning?: string;
}> {
    try {
        const [schema, seedAnswersTemplate] = await Promise.all([
            controller.getStudentFeedbackFormSchema() as unknown as Promise<JsonObject>,
            controller.getStudentFeedbackSeedAnswersTemplate() as unknown as Promise<JsonObject>,
        ]);

        // Defensive: ensure returned values are JSON objects
        const safeSchema = isJsonObject(schema) ? schema : FALLBACK_STUDENT_FEEDBACK_SCHEMA;
        const safeSeed = isJsonObject(seedAnswersTemplate)
            ? seedAnswersTemplate
            : FALLBACK_SEED_ANSWERS_TEMPLATE;

        const warning =
            safeSchema === FALLBACK_STUDENT_FEEDBACK_SCHEMA ||
                safeSeed === FALLBACK_SEED_ANSWERS_TEMPLATE
                ? 'Schema service returned an unexpected shape; using fallback.'
                : undefined;

        return { schema: safeSchema, seedAnswersTemplate: safeSeed, warning };
    } catch (error) {
        return {
            schema: FALLBACK_STUDENT_FEEDBACK_SCHEMA,
            seedAnswersTemplate: FALLBACK_SEED_ANSWERS_TEMPLATE,
            warning: `Schema service unavailable; using fallback. (${extractErrorMessage(error)})`,
        };
    }
}

/**
 * Resolve the authenticated user id for "me/current" style routes.
 * This intentionally supports multiple header/cookie keys to match different auth adapters.
 * Note: this is best-effort and does NOT validate role.
 */
function resolveAuthedUserIdFromRequest(req: NextRequest): UUID | null {
    const headerCandidates = [
        req.headers.get('x-user-id'),
        req.headers.get('x-auth-user-id'),
        req.headers.get('x-thesis-user-id'),
        req.headers.get('x-thesisgrader-user-id'),
        req.headers.get('x-thesis-grader-user-id'),
        req.headers.get('x-user'),
        req.headers.get('x-auth-user'),
    ]
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean);

    for (const raw of headerCandidates) {
        // Allow "uuid,role" or "uuid|role" style values
        const first = raw.split(/[,\s|;]/)[0]?.trim();
        if (first && isUuidLike(first)) return first as UUID;
        if (isUuidLike(raw)) return raw as UUID;
    }

    const cookieCandidates = [
        req.cookies.get('user_id')?.value,
        req.cookies.get('userId')?.value,
        req.cookies.get('uid')?.value,
        req.cookies.get('thesis_user_id')?.value,
        req.cookies.get('thesisUserId')?.value,
    ]
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean);

    for (const raw of cookieCandidates) {
        if (isUuidLike(raw)) return raw as UUID;
    }

    const qpCandidates = [
        req.nextUrl.searchParams.get('userId'),
        req.nextUrl.searchParams.get('user_id'),
        req.nextUrl.searchParams.get('uid'),
    ]
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean);

    for (const raw of qpCandidates) {
        if (isUuidLike(raw)) return raw as UUID;
    }

    return null;
}

async function resolveAuthedUser(
    req: NextRequest,
    services: DatabaseServices,
): Promise<UserRow | null> {
    // 1) direct id from headers/cookies/query params
    const direct = resolveAuthedUserIdFromRequest(req);
    if (direct) {
        try {
            const user = await services.users.findById(direct);
            return user ?? null;
        } catch {
            // fall through
        }
    }

    // 2) middleware session resolver
    try {
        const mw = createMiddlewareController(services);
        const auth = await mw.resolve(req);
        if (!auth) return null;
        return auth.user ?? null;
    } catch {
        return null;
    }
}

/**
 * Resolve the current authenticated STUDENT id.
 * Supports:
 * - forwarded headers (x-user-id, etc.)
 * - explicit user_id cookies
 * - session cookie (tg_session) via MiddlewareController resolver
 */
async function resolveAuthedStudentId(
    req: NextRequest,
    services: DatabaseServices,
): Promise<UUID | null> {
    const user = await resolveAuthedUser(req, services);
    if (!user) return null;
    if (user.role !== 'student') return null;
    return user.id as UUID;
}

function isMeAlias(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized === 'me' || normalized === 'current' || normalized === 'self';
}

async function resolveStudentIdFromAlias(
    id: string,
    req: NextRequest,
    services: DatabaseServices,
): Promise<UUID | null> {
    const normalized = id.trim().toLowerCase();
    if (isUuidLike(id)) return id as UUID;
    if (normalized === 'me' || normalized === 'current' || normalized === 'self') {
        return resolveAuthedStudentId(req, services);
    }
    return null;
}

function withListAliases<T>(items: T[]) {
    // Frontend resilience: support multiple legacy payload shapes
    return {
        items,
        evaluations: items,
        student_evaluations: items,
        count: items.length,
    };
}

function withItemAliases<T>(item: T) {
    return {
        item,
        evaluation: item,
        student_evaluation: item,
    };
}

function parseUuidArrayFromBody(value: unknown): UUID[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const out: UUID[] = [];

    for (const item of value) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        if (!trimmed || !isUuidLike(trimmed)) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(trimmed as UUID);
    }

    return out;
}

/**
 * Student self endpoints (no explicit :id), used by the frontend:
 * - GET /api/student-evaluations/schema
 * - GET /api/student-evaluations/form/schema
 * - GET /api/student-evaluations/active-form
 * - GET /api/student-evaluations/my
 * - GET /api/student-evaluations/me
 * - GET /api/student-evaluations/:evaluationId
 * - GET /api/student-evaluations/:evaluationId/(me|item|detail)
 * - PATCH /api/student-evaluations/:evaluationId/(answers|draft|response)
 * - POST/PATCH /api/student-evaluations/:evaluationId/(submit|finalize|lock)
 * - GET /api/student-evaluations/:evaluationId/score
 *
 * NEW (for admin/staff assignment compatibility):
 * - POST /api/student-evaluations   (assign feedback forms for a schedule to students)
 *   Body: { schedule_id|scheduleId, studentIds|student_ids?, overwritePending?, seedAnswers? }
 */
async function dispatchStudentSelfEvaluationsRequest(
    req: NextRequest,
    tail: string[],
    controller: StudentController,
    services: DatabaseServices,
): Promise<Response> {
    const method = req.method.toUpperCase();

    // Root "/api/student-evaluations"
    if (tail.length === 0) {
        // ✅ FIX: accept POST here (admin/staff assignment or student self ensure)
        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const scheduleIdRaw =
                (typeof body.schedule_id === 'string' ? body.schedule_id : null) ??
                (typeof body.scheduleId === 'string' ? body.scheduleId : null) ??
                (typeof body.defense_schedule_id === 'string' ? body.defense_schedule_id : null) ??
                (typeof body.defenseScheduleId === 'string' ? body.defenseScheduleId : null);

            if (!scheduleIdRaw || !isUuidLike(scheduleIdRaw)) {
                return json400('schedule_id is required and must be a valid UUID.');
            }

            const seedAnswersRaw =
                body.seedAnswers ??
                body.seed_answers ??
                body.answersTemplate ??
                body.answers_template ??
                body.template ??
                body.answers ??
                undefined;

            const seedAnswers = toJsonObject(seedAnswersRaw);

            const overwritePendingRaw =
                body.overwritePending ??
                body.overwrite_pending ??
                body.overwrite ??
                body.reset ??
                body.replacePending;

            const overwritePending = typeof overwritePendingRaw === 'boolean'
                ? overwritePendingRaw
                : (parseBoolean(typeof overwritePendingRaw === 'string' ? overwritePendingRaw : null) ?? false);

            const studentIds = (() => {
                const many = parseUuidArrayFromBody(body.studentIds ?? body.student_ids ?? body.students);
                if (many.length > 0) return many;

                const single =
                    typeof body.student_id === 'string' ? body.student_id :
                        (typeof body.studentId === 'string' ? body.studentId : null);

                if (single && isUuidLike(single)) return [single as UUID];
                return [];
            })();

            const authed = await resolveAuthedUser(req, services);
            if (!authed) {
                return NextResponse.json(
                    { error: 'Unauthorized.', message: 'Sign in is required to assign student feedback evaluations.' },
                    { status: 401 },
                );
            }

            // Admin/Staff: assign to students for schedule (compat with admin evaluations page)
            if (authed.role === 'admin' || authed.role === 'staff') {
                try {
                    const feedback = new StudentFeedbackService(services);

                    const input: AssignStudentFeedbackFormsInput = {
                        studentIds: studentIds.length > 0 ? studentIds : undefined,
                        overwritePending,
                        seedAnswers: Object.keys(seedAnswers).length > 0 ? (seedAnswers as any) : undefined,
                        initialStatus: 'pending',
                    };

                    const result = await feedback.assignForSchedule(scheduleIdRaw as UUID, input);
                    if (!result) return json404Entity('Defense schedule');

                    const status = result.counts?.created > 0 ? 201 : 200;

                    return NextResponse.json(
                        {
                            scheduleId: result.scheduleId,
                            groupId: result.groupId,
                            counts: result.counts,
                            created: result.created,
                            updated: result.updated,
                            existing: result.existing,
                            targetedStudentIds: result.targetedStudentIds,
                            message:
                                result.counts?.created > 0
                                    ? 'Student feedback evaluations assigned successfully.'
                                    : 'No new student feedback evaluations were created.',
                        },
                        { status },
                    );
                } catch (error) {
                    return NextResponse.json(
                        {
                            error: 'Failed to assign student feedback evaluations.',
                            message: extractErrorMessage(error),
                        },
                        { status: 500 },
                    );
                }
            }

            // Student: allow self-ensure via POST /api/student-evaluations (best-effort compat)
            if (authed.role === 'student') {
                try {
                    const before = await controller.listStudentEvaluations(authed.id as UUID, {
                        scheduleId: scheduleIdRaw as UUID,
                    });
                    if (!before) return json404Entity('Student');

                    const item = await controller.ensureStudentEvaluation(authed.id as UUID, {
                        schedule_id: scheduleIdRaw as UUID,
                        answers: Object.keys(seedAnswers).length > 0 ? (seedAnswers as JsonObject) : undefined,
                    });

                    if (!item) return json404Entity('Student');

                    const created = before.length === 0;
                    return NextResponse.json(
                        { ...withItemAliases(item), created },
                        { status: created ? 201 : 200 },
                    );
                } catch (error) {
                    return NextResponse.json(
                        { error: 'Failed to create student evaluation.', message: extractErrorMessage(error) },
                        { status: 500 },
                    );
                }
            }

            return NextResponse.json(
                { error: 'Forbidden.', message: 'Only admin/staff can assign evaluations to students.' },
                { status: 403 },
            );
        }

        // Original behavior (GET only)
        if (method !== 'GET') return json405(['GET', 'POST', 'OPTIONS']);

        const studentId = await resolveAuthedStudentId(req, services);
        if (!studentId) {
            return json200({
                service: 'student.evaluations',
                routes: {
                    schema: 'GET /api/student-evaluations/schema',
                    formSchema: 'GET /api/student-evaluations/form/schema',
                    activeForm: 'GET /api/student-evaluations/active-form',
                    my: 'GET /api/student-evaluations/my',
                    me: 'GET /api/student-evaluations/me',
                    detail: 'GET /api/student-evaluations/:evaluationId',
                    detailAliases: 'GET /api/student-evaluations/:evaluationId/(me|item|detail)',
                    saveDraft: 'PATCH /api/student-evaluations/:evaluationId/(answers|draft|response)',
                    submit: 'POST /api/student-evaluations/:evaluationId/(submit|finalize)',
                    lock: 'POST /api/student-evaluations/:evaluationId/lock',
                    score: 'GET /api/student-evaluations/:evaluationId/score',
                    // New compat:
                    assign: 'POST /api/student-evaluations  (admin/staff assignment compat)',
                    // Backward/compat:
                    studentsMeSchema: 'GET /api/students/me/student-evaluations/schema',
                    studentsCurrentSchema: 'GET /api/students/current/student-evaluations/schema',
                },
            });
        }

        parseListQuery<StudentEvaluationRow>(req);

        // Controller hydrates schedule + group context (so thesis/group + defense schedule are not empty)
        const items = await controller.listStudentEvaluations(studentId, {});
        if (!items) return json404Entity('Student');

        return json200({
            studentId,
            ...withListAliases(items),
            routes: {
                schema: 'GET /api/student-evaluations/schema',
                formSchema: 'GET /api/student-evaluations/form/schema',
                activeForm: 'GET /api/student-evaluations/active-form',
                my: 'GET /api/student-evaluations/my',
                me: 'GET /api/student-evaluations/me',
                detail: 'GET /api/student-evaluations/:evaluationId',
                saveDraft: 'PATCH /api/student-evaluations/:evaluationId',
                submit: 'POST /api/student-evaluations/:evaluationId/submit',
                lock: 'POST /api/student-evaluations/:evaluationId/lock',
                score: 'GET /api/student-evaluations/:evaluationId/score',
            },
        });
    }

    const seg0 = (tail[0] ?? '').toLowerCase();
    const seg1 = (tail[1] ?? '').toLowerCase();

    // GET /api/student-evaluations/schema
    // GET /api/student-evaluations/form/schema
    // GET /api/student-evaluations/active-form
    if (
        (tail.length === 1 && (seg0 === 'schema' || seg0 === 'active-form')) ||
        (tail.length === 2 && seg0 === 'form' && seg1 === 'schema')
    ) {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        const { schema, seedAnswersTemplate, warning } =
            await getStudentFeedbackSchemaSafe(controller);

        // Return both keys for frontend resilience (item/schema).
        return json200({
            schema,
            item: schema,
            seedAnswersTemplate,
            ...(warning ? { warning } : {}),
        });
    }

    // GET /api/student-evaluations/my
    // GET /api/student-evaluations/me
    if (tail.length === 1 && (seg0 === 'my' || seg0 === 'me')) {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        const studentId = await resolveAuthedStudentId(req, services);
        if (!studentId) {
            return json400(
                'Unable to resolve current student id. Ensure you are signed in and the session cookie is present.',
            );
        }

        const scheduleIdParam =
            req.nextUrl.searchParams.get('scheduleId') ??
            req.nextUrl.searchParams.get('schedule_id') ??
            undefined;

        if (scheduleIdParam && !isUuidLike(scheduleIdParam)) {
            return json400('Invalid scheduleId. Must be a UUID.');
        }

        parseListQuery<StudentEvaluationRow>(req);

        // Controller hydrates schedule + group context (so thesis/group + defense schedule are not empty)
        const items = await controller.listStudentEvaluations(studentId, {
            scheduleId: scheduleIdParam as UUID | undefined,
        });

        if (!items) return json404Entity('Student');

        // UX-friendly: do NOT 404 when there is simply no evaluation yet.
        if (seg0 === 'me') {
            return json200({
                studentId,
                ...withItemAliases(items[0] ?? null),
            });
        }

        return json200({
            studentId,
            ...withListAliases(items),
        });
    }

    // -------------------- evaluationId-based self routes --------------------
    if (tail.length >= 1 && isUuidLike(tail[0])) {
        const evaluationId = tail[0] as UUID;
        const action = (tail[1] ?? '').toLowerCase();

        const studentId = await resolveAuthedStudentId(req, services);
        if (!studentId) {
            return json400(
                'Unable to resolve current student id. Ensure you are signed in and the session cookie is present.',
            );
        }

        const getDetail = async () => {
            const item = await controller.getStudentEvaluation(studentId, evaluationId);
            if (!item) return null;
            return item;
        };

        // GET detail (and alias endpoints used by the frontend)
        if (
            method === 'GET' &&
            (tail.length === 1 ||
                (tail.length === 2 && (action === 'me' || action === 'item' || action === 'detail')))
        ) {
            const item = await getDetail();
            if (!item) return json404Entity('StudentEvaluation');
            return json200({ studentId, ...withItemAliases(item) });
        }

        // GET score
        if (method === 'GET' && tail.length === 2 && action === 'score') {
            const item = await controller.getStudentEvaluationScore(studentId, evaluationId);
            if (!item) return json404Entity('StudentEvaluationScore');
            return json200({ studentId, item });
        }

        // PATCH answers (supports multiple alias endpoints)
        if (
            (method === 'PATCH' || method === 'PUT') &&
            (tail.length === 1 ||
                (tail.length === 2 &&
                    (action === 'answers' || action === 'draft' || action === 'response' || action === 'status')))
        ) {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const answersRaw = body.answers as unknown | undefined;
            if (answersRaw !== undefined && !isJsonObject(answersRaw)) {
                return json400('answers must be a JSON object with JSON-serializable values.');
            }

            const statusRaw =
                typeof body.status === 'string' ? body.status.trim().toLowerCase() : null;

            let current = await getDetail();
            if (!current) return json404Entity('StudentEvaluation');

            // If answers provided, patch them first.
            if (answersRaw !== undefined) {
                try {
                    const patched = await controller.patchStudentEvaluationAnswers(studentId, evaluationId, {
                        answers: answersRaw as JsonObject,
                    });
                    if (!patched) return json404Entity('StudentEvaluation');
                    current = patched;
                } catch (err) {
                    if (err instanceof StudentEvalStateError) {
                        return json400(err.message);
                    }
                    throw err;
                }
            }

            // Optional: allow status transition through PATCH for frontend resilience.
            if (statusRaw === 'submitted') {
                try {
                    const submitted = await controller.submitStudentEvaluation(studentId, evaluationId);
                    if (!submitted) return json404Entity('StudentEvaluation');
                    return json200({ studentId, ...withItemAliases(submitted) });
                } catch (err) {
                    if (err instanceof StudentEvalValidationError) {
                        return NextResponse.json(
                            {
                                error: 'Validation failed.',
                                message: err.message,
                                missing: err.missing,
                            },
                            { status: 400 },
                        );
                    }
                    if (err instanceof StudentEvalStateError) {
                        return json400(err.message);
                    }
                    throw err;
                }
            }

            if (statusRaw === 'locked') {
                try {
                    const locked = await controller.lockStudentEvaluation(studentId, evaluationId);
                    if (!locked) return json404Entity('StudentEvaluation');
                    return json200({ studentId, ...withItemAliases(locked) });
                } catch (err) {
                    if (err instanceof StudentEvalStateError) {
                        return json400(err.message);
                    }
                    throw err;
                }
            }

            return json200({ studentId, ...withItemAliases(current) });
        }

        // POST/PATCH submit (aliases: submit, finalize)
        if (
            (method === 'POST' || method === 'PATCH') &&
            tail.length === 2 &&
            (action === 'submit' || action === 'finalize')
        ) {
            const body = await readJsonRecord(req);
            // body is optional; if provided and has answers, patch first for best UX.
            const answersRaw = body?.answers as unknown;
            if (answersRaw !== undefined && !isJsonObject(answersRaw)) {
                return json400('answers must be a JSON object with JSON-serializable values.');
            }

            if (answersRaw !== undefined) {
                try {
                    const patched = await controller.patchStudentEvaluationAnswers(studentId, evaluationId, {
                        answers: answersRaw as JsonObject,
                    });
                    if (!patched) return json404Entity('StudentEvaluation');
                } catch (err) {
                    if (err instanceof StudentEvalStateError) {
                        return json400(err.message);
                    }
                    throw err;
                }
            }

            try {
                const item = await controller.submitStudentEvaluation(studentId, evaluationId);
                if (!item) return json404Entity('StudentEvaluation');
                return json200({ studentId, ...withItemAliases(item) });
            } catch (err) {
                if (err instanceof StudentEvalValidationError) {
                    return NextResponse.json(
                        {
                            error: 'Validation failed.',
                            message: err.message,
                            missing: err.missing,
                        },
                        { status: 400 },
                    );
                }
                if (err instanceof StudentEvalStateError) {
                    return json400(err.message);
                }
                throw err;
            }
        }

        // POST/PATCH lock
        if ((method === 'POST' || method === 'PATCH') && tail.length === 2 && action === 'lock') {
            try {
                const item = await controller.lockStudentEvaluation(studentId, evaluationId);
                if (!item) return json404Entity('StudentEvaluation');
                return json200({ studentId, ...withItemAliases(item) });
            } catch (err) {
                if (err instanceof StudentEvalStateError) {
                    return json400(err.message);
                }
                throw err;
            }
        }

        return json404Api();
    }
    // -------------------------------------------------------------------------

    return json404Api();
}

export async function dispatchStudentRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = new StudentController(services);
    const method = req.method.toUpperCase();

    // If the incoming URL is "/api/student-evaluations/*", treat it as the self-evaluation service
    // even if the outer router already stripped the leading segment.
    const pathname = req.nextUrl.pathname ?? '';
    const isStudentEvaluationsPath =
        /^\/api\/student-evaluations(?:\/|$)/i.test(pathname) ||
        /^\/api\/student-evaluation(?:\/|$)/i.test(pathname);

    if (isStudentEvaluationsPath) {
        let t = tail;
        if (t.length > 0) {
            const lead = (t[0] ?? '').toLowerCase();
            if (lead === 'student-evaluations' || lead === 'student-evaluation') {
                t = t.slice(1);
            }
        }
        return dispatchStudentSelfEvaluationsRequest(req, t, controller, services);
    }

    // Accept both "/api/student-evaluations/*" and "/api/students/*" style paths.
    // Some callers include a leading "students" segment; normalize it away.
    let t = tail;

    if (t.length > 0) {
        const lead = (t[0] ?? '').toLowerCase();
        if (lead === 'students' || lead === 'student') {
            t = t.slice(1);
        }
    }

    // If some router variant still passes "student-evaluations" inside this handler, normalize and dispatch.
    if (t.length > 0) {
        const lead = (t[0] ?? '').toLowerCase();
        if (lead === 'student-evaluations' || lead === 'student-evaluation') {
            return dispatchStudentSelfEvaluationsRequest(req, t.slice(1), controller, services);
        }
    }

    if (t.length === 0) {
        if (method === 'GET') {
            const query = parseListQuery<UserRow>(req);
            const items = await controller.getAll(omitWhere(query));
            return json200({ items });
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.create(
                body as Parameters<StudentController['create']>[0],
            );
            return json201({ item });
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    const idRaw = t[0];
    if (!idRaw) return json404Api();

    // Special-case: schema should be retrievable even if "me/current" can't be resolved,
    // because schema itself is not student-specific.
    const seg1Peek = (t[1] ?? '').toLowerCase();
    const seg2Peek = (t[2] ?? '').toLowerCase();
    if (
        method === 'GET' &&
        isMeAlias(idRaw) &&
        t.length === 3 &&
        (seg1Peek === 'student-evaluations' || seg1Peek === 'student-evaluation') &&
        seg2Peek === 'schema'
    ) {
        const { schema, seedAnswersTemplate, warning } =
            await getStudentFeedbackSchemaSafe(controller);

        return json200({
            schema,
            item: schema,
            seedAnswersTemplate,
            ...(warning ? { warning } : {}),
        });
    }

    const resolvedStudentId = await resolveStudentIdFromAlias(idRaw, req, services);
    if (!resolvedStudentId) {
        // If they used "me/current/self" but we couldn't resolve auth, return a helpful 400 (not a misleading 404).
        if (isMeAlias(idRaw)) {
            return json400(
                'Unable to resolve current student id. Ensure you are signed in and the session cookie is present.',
            );
        }
        return json404Api();
    }

    // Keep original param in route shape, but use resolved UUID everywhere below.
    const id = resolvedStudentId;

    if (t.length === 1) {
        if (method === 'GET') {
            const item = await controller.getById(id as UUID);
            if (!item) return json404Entity('Student');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.update(
                id as UUID,
                body as Parameters<StudentController['update']>[1],
            );
            if (!item) return json404Entity('Student');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete(id as UUID);
            if (deleted === 0) return json404Entity('Student');
            return json200({ deleted });
        }

        return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
    }

    /**
     * Student feedback/survey/reflection endpoints
     * /api/students/:id/student-evaluations
     * /api/students/:id/student-evaluations/schema
     * /api/students/:id/student-evaluations/schedule/:scheduleId
     * /api/students/:id/student-evaluations/:evaluationId
     * /api/students/:id/student-evaluations/:evaluationId/score
     * /api/students/:id/student-evaluations/:evaluationId/submit
     * /api/students/:id/student-evaluations/:evaluationId/lock
     */
    const seg1 = (t[1] ?? '').toLowerCase();

    if (t.length >= 2 && (seg1 === 'student-evaluations' || seg1 === 'student-evaluation')) {
        const seg2 = (t[2] ?? '').toLowerCase();

        // /:id/student-evaluations/schema
        if (t.length === 3 && seg2 === 'schema') {
            if (method !== 'GET') return json405(['GET', 'OPTIONS']);

            const { schema, seedAnswersTemplate, warning } =
                await getStudentFeedbackSchemaSafe(controller);

            return json200({
                schema,
                item: schema,
                seedAnswersTemplate,
                ...(warning ? { warning } : {}),
            });
        }

        // /:id/student-evaluations/schedule/:scheduleId
        if (t.length === 4 && seg2 === 'schedule') {
            const scheduleId = t[3];
            if (!scheduleId || !isUuidLike(scheduleId)) {
                return json400('scheduleId is required and must be a UUID.');
            }

            if (method === 'GET') {
                const items = await controller.listStudentEvaluations(id as UUID, {
                    scheduleId: scheduleId as UUID,
                });

                if (!items) return json404Entity('Student');

                const item = items[0] ?? null;
                if (!item) return json404Entity('StudentEvaluation');

                return json200({ ...withItemAliases(item) });
            }

            if (method === 'POST' || method === 'PUT') {
                const before = await controller.listStudentEvaluations(id as UUID, {
                    scheduleId: scheduleId as UUID,
                });

                if (!before) return json404Entity('Student');

                const body = await readJsonRecord(req);
                const answersRaw = body?.answers as unknown;

                if (answersRaw !== undefined && !isJsonObject(answersRaw)) {
                    return json400('answers must be a JSON object with JSON-serializable values.');
                }

                const item = await controller.ensureStudentEvaluation(id as UUID, {
                    schedule_id: scheduleId as UUID,
                    answers: answersRaw as JsonObject | undefined,
                });

                if (!item) return json404Entity('Student');

                const created = before.length === 0;
                return NextResponse.json(
                    { ...withItemAliases(item), created },
                    { status: created ? 201 : 200 },
                );
            }

            return json405(['GET', 'POST', 'PUT', 'OPTIONS']);
        }

        // /:id/student-evaluations
        if (t.length === 2) {
            if (method === 'GET') {
                // Optional filter: ?scheduleId=<uuid>
                const scheduleIdParam = req.nextUrl.searchParams.get('scheduleId') ?? undefined;
                if (scheduleIdParam && !isUuidLike(scheduleIdParam)) {
                    return json400('Invalid scheduleId. Must be a UUID.');
                }

                parseListQuery<StudentEvaluationRow>(req);

                const items = await controller.listStudentEvaluations(id as UUID, {
                    scheduleId: scheduleIdParam as UUID | undefined,
                });

                if (!items) return json404Entity('Student');
                return json200({ ...withListAliases(items) });
            }

            if (method === 'POST') {
                const body = await readJsonRecord(req);
                if (!body) return json400('Invalid JSON body.');

                const scheduleId = body.schedule_id;
                if (typeof scheduleId !== 'string' || !isUuidLike(scheduleId)) {
                    return json400('schedule_id is required and must be a UUID.');
                }

                const answersRaw = body.answers as unknown;
                if (answersRaw !== undefined && !isJsonObject(answersRaw)) {
                    return json400('answers must be a JSON object with JSON-serializable values.');
                }

                const item = await controller.ensureStudentEvaluation(id as UUID, {
                    schedule_id: scheduleId as UUID,
                    answers: answersRaw as JsonObject | undefined,
                });

                if (!item) return json404Entity('Student');
                return json201({ ...withItemAliases(item) });
            }

            return json405(['GET', 'POST', 'OPTIONS']);
        }

        // evaluationId-based routes (must be UUID)
        const evalId = t[2];
        if (!evalId || !isUuidLike(evalId)) return json404Api();

        // /:id/student-evaluations/:evaluationId
        if (t.length === 3) {
            if (method === 'GET') {
                const item = await controller.getStudentEvaluation(id as UUID, evalId as UUID);
                if (!item) return json404Entity('StudentEvaluation');
                return json200({ ...withItemAliases(item) });
            }

            if (method === 'PATCH' || method === 'PUT') {
                const body = await readJsonRecord(req);
                if (!body) return json400('Invalid JSON body.');

                const answersRaw = body.answers as unknown;
                if (!isJsonObject(answersRaw)) {
                    return json400('answers is required and must be a JSON object with JSON-serializable values.');
                }

                try {
                    const item = await controller.patchStudentEvaluationAnswers(
                        id as UUID,
                        evalId as UUID,
                        { answers: answersRaw as JsonObject },
                    );
                    if (!item) return json404Entity('StudentEvaluation');
                    return json200({ ...withItemAliases(item) });
                } catch (err) {
                    if (err instanceof StudentEvalStateError) {
                        return json400(err.message);
                    }
                    throw err;
                }
            }

            return json405(['GET', 'PATCH', 'PUT', 'OPTIONS']);
        }

        // /:id/student-evaluations/:evaluationId/score
        if (t.length === 4 && (t[3] ?? '').toLowerCase() === 'score') {
            if (method !== 'GET') return json405(['GET', 'OPTIONS']);
            const item = await controller.getStudentEvaluationScore(id as UUID, evalId as UUID);
            if (!item) return json404Entity('StudentEvaluationScore');
            return json200({ item });
        }

        // /:id/student-evaluations/:evaluationId/submit (aliases: submit/finalize)
        if (
            t.length === 4 &&
            (t[3] ?? '').toLowerCase() &&
            ((t[3] ?? '').toLowerCase() === 'submit' || (t[3] ?? '').toLowerCase() === 'finalize')
        ) {
            if (method !== 'POST' && method !== 'PATCH') return json405(['POST', 'PATCH', 'OPTIONS']);

            const body = await readJsonRecord(req);
            const answersRaw = body?.answers as unknown;

            if (answersRaw !== undefined && !isJsonObject(answersRaw)) {
                return json400('answers must be a JSON object with JSON-serializable values.');
            }

            if (answersRaw !== undefined) {
                try {
                    const patched = await controller.patchStudentEvaluationAnswers(
                        id as UUID,
                        evalId as UUID,
                        { answers: answersRaw as JsonObject },
                    );
                    if (!patched) return json404Entity('StudentEvaluation');
                } catch (err) {
                    if (err instanceof StudentEvalStateError) {
                        return json400(err.message);
                    }
                    throw err;
                }
            }

            try {
                const item = await controller.submitStudentEvaluation(id as UUID, evalId as UUID);
                if (!item) return json404Entity('StudentEvaluation');
                return json200({ ...withItemAliases(item) });
            } catch (err) {
                if (err instanceof StudentEvalValidationError) {
                    return NextResponse.json(
                        {
                            error: 'Validation failed.',
                            message: err.message,
                            missing: err.missing,
                        },
                        { status: 400 },
                    );
                }
                if (err instanceof StudentEvalStateError) {
                    return json400(err.message);
                }
                throw err;
            }
        }

        // /:id/student-evaluations/:evaluationId/lock
        if (t.length === 4 && (t[3] ?? '').toLowerCase() === 'lock') {
            if (method !== 'POST' && method !== 'PATCH') return json405(['POST', 'PATCH', 'OPTIONS']);
            try {
                const item = await controller.lockStudentEvaluation(id as UUID, evalId as UUID);
                if (!item) return json404Entity('StudentEvaluation');
                return json200({ ...withItemAliases(item) });
            } catch (err) {
                if (err instanceof StudentEvalStateError) {
                    return json400(err.message);
                }
                throw err;
            }
        }

        return json404Api();
    }

    // staff/admin status toggle etc (unchanged)
    const seg2 = (t[2] ?? '').toLowerCase();
    if (t.length === 2 && seg2 === 'status') {
        if (method !== 'PATCH' && method !== 'POST') return json405(['PATCH', 'POST', 'OPTIONS']);

        const body = await readJsonRecord(req);
        if (!body) return json400('Invalid JSON body.');

        const status = toUserStatus(body.status);
        if (!status) return json400(`Invalid status. Allowed: ${USER_STATUSES.join(', ')}`);

        const item = await controller.setStatus(id as UUID, status);
        if (!item) return json404Entity('Student');
        return json200({ item });
    }

    return json404Api();
}
