import { NextRequest } from 'next/server';

import { StudentController, StudentEvalStateError } from '../controllers/StudentController';
import {
    USER_STATUSES,
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function dispatchStudentRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = new StudentController(services);
    const method = req.method.toUpperCase();

    if (tail.length === 0) {
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

    const id = tail[0];
    if (!id || !isUuidLike(id)) return json404Api();

    if (tail.length === 1) {
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
     * /api/students/:id/student-evaluations/:evaluationId
     * /api/students/:id/student-evaluations/:evaluationId/submit
     * /api/students/:id/student-evaluations/:evaluationId/lock
     */
    if (tail.length >= 2 && tail[1] === 'student-evaluations') {
        // /:id/student-evaluations
        if (tail.length === 2) {
            if (method === 'GET') {
                // Optional filter: ?scheduleId=<uuid>
                const scheduleIdParam = req.nextUrl.searchParams.get('scheduleId') ?? undefined;
                if (scheduleIdParam && !isUuidLike(scheduleIdParam)) {
                    return json400('Invalid scheduleId. Must be a UUID.');
                }

                // Accept list query params for consistency (limit/offset/orderBy) if your service impl supports it later.
                // For now, controller handles filtering and returns all rows.
                // (Parse to avoid unused query patterns in callers; safe no-op.)
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

                const answersRaw = body.answers;
                if (answersRaw !== undefined && !isRecord(answersRaw)) {
                    return json400('answers must be a JSON object.');
                }

                const item = await controller.ensureStudentEvaluation(id as UUID, {
                    schedule_id: scheduleId as UUID,
                    answers: (answersRaw as Record<string, unknown>) ?? {},
                });

                if (!item) return json404Entity('Student');
                return json201({ item });
            }

            return json405(['GET', 'POST', 'OPTIONS']);
        }

        const evalId = tail[2];
        if (!evalId || !isUuidLike(evalId)) return json404Api();

        // /:id/student-evaluations/:evaluationId
        if (tail.length === 3) {
            if (method === 'GET') {
                const item = await controller.getStudentEvaluation(id as UUID, evalId as UUID);
                if (!item) return json404Entity('StudentEvaluation');
                return json200({ item });
            }

            if (method === 'PATCH' || method === 'PUT') {
                const body = await readJsonRecord(req);
                if (!body) return json400('Invalid JSON body.');

                const answersRaw = body.answers;
                if (!isRecord(answersRaw)) {
                    return json400('answers is required and must be a JSON object.');
                }

                try {
                    const item = await controller.patchStudentEvaluationAnswers(
                        id as UUID,
                        evalId as UUID,
                        { answers: answersRaw },
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

        // /:id/student-evaluations/:evaluationId/submit
        if (tail.length === 4 && tail[3] === 'submit') {
            if (method !== 'POST' && method !== 'PATCH') {
                return json405(['POST', 'PATCH', 'OPTIONS']);
            }

            try {
                const item = await controller.submitStudentEvaluation(id as UUID, evalId as UUID);
                if (!item) return json404Entity('StudentEvaluation');
                return json200({ item });
            } catch (err) {
                if (err instanceof StudentEvalStateError) {
                    return json400(err.message);
                }
                throw err;
            }
        }

        // /:id/student-evaluations/:evaluationId/lock
        if (tail.length === 4 && tail[3] === 'lock') {
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

    if (tail.length === 2 && tail[1] === 'status') {
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
