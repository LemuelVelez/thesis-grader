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
import {
    isUuidLike,
    json200,
    json201,
    json400,
    json404Api,
    json404Entity,
    json405,
    omitWhere,
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
    const direct = resolveAuthedUserIdFromRequest(req);
    if (direct) return direct as UUID;

    try {
        const mw = createMiddlewareController(services);
        const auth = await mw.resolve(req);
        if (!auth) return null;
        if (auth.user.role !== 'student') return null;
        return auth.user.id as UUID;
    } catch {
        return null;
    }
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

/**
 * Student self endpoints (no explicit :id), used by the frontend:
 * - GET /api/student-evaluations/schema
 * - GET /api/student-evaluations/form/schema
 * - GET /api/student-evaluations/active-form
 * - GET /api/student-evaluations/my
 * - GET /api/student-evaluations/me
 */
async function dispatchStudentSelfEvaluationsRequest(
    req: NextRequest,
    tail: string[],
    controller: StudentController,
    services: DatabaseServices,
): Promise<Response> {
    const method = req.method.toUpperCase();

    // Helpful default: if called at "/api/student-evaluations" (no tail),
    // return the caller's items when authenticated; otherwise return the route map.
    if (tail.length === 0) {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

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
                    // Backward/compat:
                    studentsMeSchema: 'GET /api/students/me/student-evaluations/schema',
                    studentsCurrentSchema: 'GET /api/students/current/student-evaluations/schema',
                },
            });
        }

        parseListQuery<StudentEvaluationRow>(req);

        const items = await controller.listStudentEvaluations(studentId, {});
        if (!items) return json404Entity('Student');

        return json200({
            studentId,
            items,
            count: items.length,
            routes: {
                schema: 'GET /api/student-evaluations/schema',
                formSchema: 'GET /api/student-evaluations/form/schema',
                activeForm: 'GET /api/student-evaluations/active-form',
                my: 'GET /api/student-evaluations/my',
                me: 'GET /api/student-evaluations/me',
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

        const schema = await controller.getStudentFeedbackFormSchema();
        const seedAnswersTemplate = await controller.getStudentFeedbackSeedAnswersTemplate();

        // Return both keys for frontend resilience (item/schema).
        return json200({
            schema,
            item: schema,
            seedAnswersTemplate,
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

        const items = await controller.listStudentEvaluations(studentId, {
            scheduleId: scheduleIdParam as UUID | undefined,
        });

        if (!items) return json404Entity('Student');

        // UX-friendly: do NOT 404 when there is simply no evaluation yet.
        if (seg0 === 'me') {
            return json200({ studentId, item: items[0] ?? null });
        }

        return json200({ studentId, items, count: items.length });
    }

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
        const schema = await controller.getStudentFeedbackFormSchema();
        const seedAnswersTemplate = await controller.getStudentFeedbackSeedAnswersTemplate();
        return json200({ schema, item: schema, seedAnswersTemplate });
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

            const schema = await controller.getStudentFeedbackFormSchema();
            const seedAnswersTemplate = await controller.getStudentFeedbackSeedAnswersTemplate();

            return json200({
                schema,
                item: schema,
                seedAnswersTemplate,
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

                return json200({ item });
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
                    { item, created },
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
                return json200({ items });
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
                return json201({ item });
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
                return json200({ item });
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
                    return json200({ item });
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

        // /:id/student-evaluations/:evaluationId/submit
        if (t.length === 4 && (t[3] ?? '').toLowerCase() === 'submit') {
            if (method !== 'POST' && method !== 'PATCH') {
                return json405(['POST', 'PATCH', 'OPTIONS']);
            }

            try {
                const item = await controller.submitStudentEvaluation(id as UUID, evalId as UUID);
                if (!item) return json404Entity('StudentEvaluation');
                return json200({ item });
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
            if (method !== 'POST' && method !== 'PATCH') {
                return json405(['POST', 'PATCH', 'OPTIONS']);
            }

            try {
                const item = await controller.lockStudentEvaluation(id as UUID, evalId as UUID);
                if (!item) return json404Entity('StudentEvaluation');
                return json200({ item });
            } catch (err) {
                if (err instanceof StudentEvalStateError) {
                    return json400(err.message);
                }
                throw err;
            }
        }

        return json404Api();
    }

    if (t.length === 2 && (t[1] ?? '').toLowerCase() === 'status') {
        if (method !== 'PATCH' && method !== 'POST') {
            return json405(['PATCH', 'POST', 'OPTIONS']);
        }

        const body = await readJsonRecord(req);
        if (!body) return json400('Invalid JSON body.');

        const status = toUserStatus(body.status);
        if (!status) {
            return json400(`Invalid status. Allowed: ${USER_STATUSES.join(', ')}`);
        }

        const item = await controller.setStatus(id as UUID, status);
        if (!item) return json404Entity('Student');
        return json200({ item });
    }

    return json404Api();
}
