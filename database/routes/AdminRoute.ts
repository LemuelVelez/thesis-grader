import { NextRequest, NextResponse } from 'next/server';

import { AdminController } from '../controllers/AdminController';
import type { RankingTarget } from '../controllers/RankingSupport';
import { USER_STATUSES, type UserRow, type UUID } from '../models/Model';
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
    parseBoolean,
    parseListQuery,
    parsePositiveInt,
    parseStudentProfileInput,
    readJsonRecord,
    toErrorMessage,
    toUserStatus,
} from './Route';
import {
    dispatchDefenseSchedulesRequest,
    dispatchSchedulePanelistsRequest,
} from './AdminRouteV2';
import { dispatchThesisGroupsRequest } from './AdminRouteV3';
import {
    dispatchAuditLogsRequest,
    dispatchRubricTemplatesRequest,
} from './AdminRouteV4';

function toRankingTarget(raw: string | null | undefined): RankingTarget {
    const normalized = (raw ?? '').trim().toLowerCase();
    return normalized === 'student' || normalized === 'students' ? 'student' : 'group';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toJsonObject(value: unknown): Record<string, unknown> {
    if (!isRecord(value)) return {};
    return value;
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

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
}

function normalizeNullableString(value: unknown): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function parsePositiveIntFromBody(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value);
    if (typeof value === 'string') {
        const t = value.trim();
        if (!t) return null;
        const n = Number(t);
        if (Number.isFinite(n) && n > 0) return Math.trunc(n);
    }
    return null;
}

function looksLikeMissingRelationError(message: string): boolean {
    const m = (message ?? '').toLowerCase();
    return (
        (m.includes('relation') && m.includes('does not exist')) ||
        (m.includes('table') && m.includes('does not exist')) ||
        m.includes('undefined table')
    );
}

function looksLikeUniqueActiveViolation(message: string): boolean {
    const m = (message ?? '').toLowerCase();
    if (!m.includes('unique') && !m.includes('duplicate key')) return false;
    // Common substrings for partial unique index / constraint naming
    return m.includes('active') && (m.includes('student') || m.includes('feedback') || m.includes('forms') || m.includes('form'));
}

async function dispatchAdminRankingsRequest(
    req: NextRequest,
    tail: string[],
    controller: AdminController,
): Promise<Response> {
    const method = req.method.toUpperCase();
    if (method !== 'GET') return json405(['GET', 'OPTIONS']);

    const limit = parsePositiveInt(req.nextUrl.searchParams.get('limit'));

    const queryTarget = toRankingTarget(
        req.nextUrl.searchParams.get('target') ??
        req.nextUrl.searchParams.get('by') ??
        req.nextUrl.searchParams.get('scope'),
    );

    // /api/admin/rankings?target=group|student
    if (tail.length === 1) {
        if (queryTarget === 'student') {
            const items = await controller.getStudentRankings(limit);
            return json200({ target: 'student', items });
        }

        const items = await controller.getGroupRankings(limit);
        return json200({ target: 'group', items });
    }

    const segment = (tail[1] ?? '').toLowerCase();

    // /api/admin/rankings/groups
    // /api/admin/rankings/groups/:groupId
    if (segment === 'groups' || segment === 'group') {
        if (tail.length === 2) {
            const items = await controller.getGroupRankings(limit);
            return json200({ target: 'group', items });
        }

        if (tail.length === 3) {
            const groupId = tail[2];
            if (!groupId || !isUuidLike(groupId)) {
                return json400('groupId is required and must be a valid UUID.');
            }

            const item = await controller.getGroupRankingByGroupId(groupId as UUID);
            if (!item) return json404Entity('Group ranking');
            return json200({ target: 'group', item });
        }

        return json404Api();
    }

    // /api/admin/rankings/students
    // /api/admin/rankings/students/:studentId
    if (segment === 'students' || segment === 'student') {
        if (tail.length === 2) {
            const items = await controller.getStudentRankings(limit);
            return json200({ target: 'student', items });
        }

        if (tail.length === 3) {
            const studentId = tail[2];
            if (!studentId || !isUuidLike(studentId)) {
                return json400('studentId is required and must be a valid UUID.');
            }

            const item = await controller.getStudentRankingByStudentId(studentId as UUID);
            if (!item) return json404Entity('Student ranking');
            return json200({ target: 'student', item });
        }

        return json404Api();
    }

    // Backward-compat: /api/admin/rankings/:groupId
    if (tail.length === 2 && isUuidLike(tail[1])) {
        const item = await controller.getGroupRankingByGroupId(tail[1] as UUID);
        if (!item) return json404Entity('Group ranking');
        return json200({ target: 'group', item });
    }

    return json404Api();
}

async function dispatchAdminStudentProfileRequest(
    req: NextRequest,
    services: DatabaseServices,
    userId: UUID,
): Promise<Response> {
    const method = req.method.toUpperCase();
    const controller = new AdminController(services);

    if (method === 'GET') {
        const item = await controller.getStudentProfileByUserId(userId);
        if (!item) return json404Entity('Student profile');
        return json200({ item });
    }

    if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
        const body = await readJsonRecord(req);
        const input = parseStudentProfileInput(body);

        try {
            const result = await controller.upsertStudentProfileForUser(userId, input);
            if (!result) return json404Entity('Student user');

            const messageParts: string[] = [
                result.created ? 'Student profile created successfully.' : 'Student profile updated successfully.',
            ];

            if (result.roleUpdated) messageParts.push('User role was set to "student".');

            return NextResponse.json(
                {
                    item: result.item,
                    message: messageParts.join(' '),
                },
                { status: result.created ? 201 : 200 },
            );
        } catch (error) {
            return NextResponse.json(
                {
                    error: 'Failed to save student profile.',
                    message: toErrorMessage(error),
                },
                { status: 500 },
            );
        }
    }

    return json405(['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS']);
}

/* -------------------------- NEW: EVALUATION PREVIEWS -------------------------- */
/**
 * GET /api/admin/evaluation-previews/schedule/:scheduleId
 * GET /api/admin/evaluation-previews/:scheduleId   (uuid shortcut)
 *
 * Query params:
 * - includeStudentAnswers=true|false (default true)
 * - includePanelistScores=true|false (default true)
 * - includePanelistComments=true|false (default true)
 */
async function dispatchAdminEvaluationPreviewsRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = new AdminController(services);
    const method = req.method.toUpperCase();

    if (tail.length === 0) {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);
        return json200({
            service: 'admin.evaluation-previews',
            routes: {
                schedule: 'GET /api/admin/evaluation-previews/schedule/:scheduleId',
                shortcut: 'GET /api/admin/evaluation-previews/:scheduleId',
                query: {
                    includeStudentAnswers: 'boolean (default true)',
                    includePanelistScores: 'boolean (default true)',
                    includePanelistComments: 'boolean (default true)',
                },
            },
        });
    }

    if (method !== 'GET') return json405(['GET', 'OPTIONS']);

    const seg0 = (tail[0] ?? '').toLowerCase();
    const seg1 = (tail[1] ?? '').toLowerCase();

    let scheduleId: string | null = null;

    // /evaluation-previews/schedule/:scheduleId
    if (seg0 === 'schedule' && tail.length >= 2) {
        scheduleId = tail[1] ?? null;
    }

    // /evaluation-previews/:scheduleId (uuid shortcut)
    if (!scheduleId && tail.length === 1) {
        scheduleId = tail[0] ?? null;
    }

    // also accept /evaluation-previews/defense-schedule/:scheduleId
    if (!scheduleId && (seg0 === 'defense-schedule' || seg0 === 'defense-schedules') && tail.length >= 2) {
        scheduleId = tail[1] ?? null;
    }

    if (!scheduleId || !isUuidLike(scheduleId)) {
        return json400('scheduleId is required and must be a valid UUID.');
    }

    const includeStudentAnswers =
        parseBoolean(req.nextUrl.searchParams.get('includeStudentAnswers')) ?? true;

    const includePanelistScores =
        parseBoolean(req.nextUrl.searchParams.get('includePanelistScores')) ?? true;

    const includePanelistComments =
        parseBoolean(req.nextUrl.searchParams.get('includePanelistComments')) ?? true;

    try {
        const preview = await controller.getEvaluationPreviewBySchedule(scheduleId as UUID, {
            includeStudentAnswers,
            includePanelistScores,
            includePanelistComments,
        });

        if (!preview) return json404Entity('Defense schedule');

        return json200({
            scheduleId: preview.schedule.id,
            groupId: preview.schedule.group_id,
            preview,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error: 'Failed to load evaluation previews.',
                message: toErrorMessage(error),
            },
            { status: 500 },
        );
    }
}

async function dispatchAdminStudentFeedbackRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = new AdminController(services);
    const method = req.method.toUpperCase();

    const seg0 = (tail[0] ?? '').toLowerCase();
    const seg1 = (tail[1] ?? '').toLowerCase();
    const seg2 = (tail[2] ?? '').toLowerCase();

    if (tail.length === 0) {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);
        return json200({
            service: 'admin.student-feedback',
            routes: {
                schema: 'GET /api/admin/student-feedback/schema',
                forms: 'GET|POST /api/admin/student-feedback/forms',
                form: 'GET|PATCH /api/admin/student-feedback/forms/:formId',
                activate: 'POST|PATCH /api/admin/student-feedback/forms/:formId/activate',
                listBySchedule: 'GET /api/admin/student-feedback/schedule/:scheduleId',
                assignForSchedule: 'POST /api/admin/student-feedback/schedule/:scheduleId/assign',
            },
        });
    }

    // ACTIVE schema only (students consume this too via StudentRoute)
    if (tail.length === 1 && seg0 === 'schema') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);
        const item = await controller.getStudentFeedbackFormSchema();
        const seedAnswersTemplate = await controller.getStudentFeedbackSeedAnswersTemplate();
        // Return both keys for frontend resilience (item/schema).
        return json200({ item, schema: item, seedAnswersTemplate });
    }

    // /api/admin/student-feedback/forms
    if (tail.length === 1 && (seg0 === 'forms' || seg0 === 'form')) {
        if (method === 'GET') {
            try {
                const items = await controller.listStudentFeedbackForms();
                return json200({ items, count: items.length });
            } catch (error) {
                const message = toErrorMessage(error);

                // If the table isn't migrated yet (or was renamed), don't crash the admin UI.
                // Return an empty list with a warning so the UI can still render.
                if (looksLikeMissingRelationError(message)) {
                    return json200({
                        items: [],
                        count: 0,
                        warning:
                            'Student feedback forms storage is not available (missing table). Run the latest database migrations to enable form CRUD.',
                        message,
                    });
                }

                return NextResponse.json(
                    {
                        error: 'Failed to load student feedback forms.',
                        message,
                    },
                    { status: 500 },
                );
            }
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const schemaRaw = body.schema ?? body.formSchema ?? body.item;
            const schema = toJsonObject(schemaRaw);

            if (Object.keys(schema).length === 0) {
                return json400('schema is required and must be a JSON object.');
            }

            const key = (normalizeString(body.key ?? (schema as any).key) ?? 'student-feedback').slice(0, 120);
            const version = parsePositiveIntFromBody(body.version ?? (schema as any).version) ?? 1;
            const title = (normalizeString(body.title ?? (schema as any).title) ?? 'Student Feedback Form').slice(0, 200);
            const description = normalizeNullableString(body.description ?? (schema as any).description) ?? null;

            // keep schema metadata consistent
            (schema as any).key = key;
            (schema as any).version = version;
            (schema as any).title = title;
            if (description !== null) (schema as any).description = description;

            const activeRaw = body.active ?? body.isActive ?? body.activate;
            const active = typeof activeRaw === 'boolean'
                ? activeRaw
                : (parseBoolean(typeof activeRaw === 'string' ? activeRaw : null) ?? false);

            try {
                const item = await controller.createStudentFeedbackForm({
                    key,
                    version,
                    title,
                    description,
                    schema: schema as any,
                    active,
                } as any);

                return json201({ item });
            } catch (error) {
                const message = toErrorMessage(error);

                if (looksLikeMissingRelationError(message)) {
                    return NextResponse.json(
                        {
                            error:
                                'Student feedback forms storage is not available (missing table). Run the latest database migrations to enable form CRUD.',
                            message,
                        },
                        { status: 503 },
                    );
                }

                // Defensive: if DB enforces a single active form via a unique/partial-unique constraint.
                if (looksLikeUniqueActiveViolation(message)) {
                    return NextResponse.json(
                        {
                            error:
                                'Failed to create the form because another feedback form is already active. Create it as inactive, or activate it after creation.',
                            message,
                        },
                        { status: 409 },
                    );
                }

                return NextResponse.json(
                    {
                        error: 'Failed to create student feedback form.',
                        message,
                    },
                    { status: 500 },
                );
            }
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    // /api/admin/student-feedback/forms/:formId
    // /api/admin/student-feedback/forms/:formId/activate
    if (seg0 === 'forms' && tail.length >= 2) {
        const formId = tail[1];
        if (!formId || !isUuidLike(formId)) {
            return json400('formId is required and must be a valid UUID.');
        }

        // /forms/:formId/activate
        if (tail.length === 3 && seg2 === 'activate') {
            if (method !== 'POST' && method !== 'PATCH') {
                return json405(['POST', 'PATCH', 'OPTIONS']);
            }

            try {
                const item = await controller.activateStudentFeedbackForm(formId as UUID);
                if (!item) return json404Entity('StudentFeedbackForm');

                return json200({
                    item,
                    message: 'Student feedback form activated successfully.',
                });
            } catch (error) {
                const message = toErrorMessage(error);

                if (looksLikeMissingRelationError(message)) {
                    return NextResponse.json(
                        {
                            error:
                                'Student feedback forms storage is not available (missing table). Run the latest database migrations to enable form CRUD.',
                            message,
                        },
                        { status: 503 },
                    );
                }

                return NextResponse.json(
                    {
                        error: 'Failed to activate student feedback form.',
                        message,
                    },
                    { status: 500 },
                );
            }
        }

        // /forms/:formId
        if (tail.length === 2) {
            if (method === 'GET') {
                const item = await controller.getStudentFeedbackFormById(formId as UUID);
                if (!item) return json404Entity('StudentFeedbackForm');
                return json200({ item });
            }

            if (method === 'PATCH' || method === 'PUT') {
                const body = await readJsonRecord(req);
                if (!body) return json400('Invalid JSON body.');

                const patch: any = {};

                if (body.key !== undefined) patch.key = normalizeString(body.key) ?? undefined;
                if (body.version !== undefined) patch.version = parsePositiveIntFromBody(body.version) ?? undefined;
                if (body.title !== undefined) patch.title = normalizeString(body.title) ?? undefined;
                if (body.description !== undefined) patch.description = normalizeNullableString(body.description);

                const schemaRaw = body.schema ?? body.formSchema ?? body.item;
                if (schemaRaw !== undefined) {
                    const schema = toJsonObject(schemaRaw);
                    if (Object.keys(schema).length === 0) return json400('schema must be a non-empty JSON object.');
                    patch.schema = schema;
                }

                const activeRaw = body.active ?? body.isActive;
                if (activeRaw !== undefined) {
                    patch.active = typeof activeRaw === 'boolean'
                        ? activeRaw
                        : (parseBoolean(typeof activeRaw === 'string' ? activeRaw : null) ?? undefined);
                }

                try {
                    const item = await controller.updateStudentFeedbackForm(formId as UUID, patch);
                    if (!item) return json404Entity('StudentFeedbackForm');

                    return json200({
                        item,
                        message: 'Student feedback form updated successfully.',
                    });
                } catch (error) {
                    const message = toErrorMessage(error);

                    if (looksLikeMissingRelationError(message)) {
                        return NextResponse.json(
                            {
                                error:
                                    'Student feedback forms storage is not available (missing table). Run the latest database migrations to enable form CRUD.',
                                message,
                            },
                            { status: 503 },
                        );
                    }

                    if (looksLikeUniqueActiveViolation(message)) {
                        return NextResponse.json(
                            {
                                error:
                                    'Failed to update the form because another feedback form is already active. Activate this form via the activate endpoint.',
                                message,
                            },
                            { status: 409 },
                        );
                    }

                    return NextResponse.json(
                        {
                            error: 'Failed to update student feedback form.',
                            message,
                        },
                        { status: 500 },
                    );
                }
            }

            return json405(['GET', 'PATCH', 'PUT', 'OPTIONS']);
        }

        return json404Api();
    }

    if (seg0 === 'schedule' && tail.length >= 2) {
        const scheduleId = tail[1];
        if (!scheduleId || !isUuidLike(scheduleId)) {
            return json400('scheduleId is required and must be a valid UUID.');
        }

        // GET /api/admin/student-feedback/schedule/:scheduleId
        if (tail.length === 2) {
            if (method !== 'GET') return json405(['GET', 'OPTIONS']);
            const items = await controller.getStudentFeedbackFormsByScheduleDetailed(
                scheduleId as UUID,
            );
            return json200({ scheduleId, items, count: items.length });
        }

        // POST /api/admin/student-feedback/schedule/:scheduleId/assign
        if (tail.length === 3 && seg2 === 'assign') {
            if (method !== 'POST' && method !== 'PATCH') {
                return json405(['POST', 'PATCH', 'OPTIONS']);
            }

            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const studentIds = parseUuidArrayFromBody(body.studentIds ?? body.student_ids);
            const overwritePendingRaw = body.overwritePending ?? body.overwrite_pending ?? body.overwrite ?? body.reset;
            const overwritePending = typeof overwritePendingRaw === 'boolean'
                ? overwritePendingRaw
                : (parseBoolean(typeof overwritePendingRaw === 'string' ? overwritePendingRaw : null) ?? false);

            const seedAnswersRaw =
                body.seedAnswers ??
                body.seed_answers ??
                body.answersTemplate ??
                body.answers_template ??
                body.template;

            const seedAnswers = toJsonObject(seedAnswersRaw);

            const result = await controller.assignStudentFeedbackFormsForSchedule(
                scheduleId as UUID,
                {
                    studentIds: studentIds.length > 0 ? studentIds : undefined,
                    overwritePending,
                    seedAnswers: seedAnswers as any,
                    initialStatus: 'pending',
                },
            );

            if (!result) return json404Entity('Defense schedule');

            const status = result.counts.created > 0 ? 201 : 200;
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
                        result.counts.created > 0
                            ? 'Student feedback forms assigned successfully.'
                            : 'No new student feedback forms were created.',
                },
                { status },
            );
        }

        return json404Api();
    }

    return json404Api();
}

export async function dispatchAdminRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = new AdminController(services);
    const method = req.method.toUpperCase();

    // Normalize if some router variant accidentally includes "admin" as the first segment.
    let t = tail;
    if (t.length > 0) {
        const lead = (t[0] ?? '').toLowerCase();
        if (lead === 'admin' || lead === 'admins') {
            t = t.slice(1);
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

            const item = await controller.create(body as Parameters<AdminController['create']>[0]);
            return json201({ item });
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    const seg0 = (t[0] ?? '').toLowerCase();

    if (
        seg0 === 'evaluation-previews' ||
        seg0 === 'evaluation-preview' ||
        seg0 === 'evaluation-results' ||
        seg0 === 'evaluation-result' ||
        seg0 === 'evaluation-previews-v1'
    ) {
        return dispatchAdminEvaluationPreviewsRequest(req, t.slice(1), services);
    }

    if (
        seg0 === 'student-feedback' ||
        seg0 === 'student-feedback-forms' ||
        seg0 === 'student_feedback' ||
        seg0 === 'student_feedback_forms' ||
        seg0 === 'feedback' ||
        seg0 === 'feedback-forms' ||
        seg0 === 'feedback_forms'
    ) {
        return dispatchAdminStudentFeedbackRequest(req, t.slice(1), services);
    }

    if (
        (seg0 === 'student' || seg0 === 'students') &&
        t.length === 3 &&
        (t[2] ?? '').toLowerCase() === 'profile'
    ) {
        const userId = t[1];
        if (!userId || !isUuidLike(userId)) return json400('student user id must be a valid UUID.');
        return dispatchAdminStudentProfileRequest(req, services, userId as UUID);
    }

    if (seg0 === 'defense-schedules' || seg0 === 'defense-schedule') {
        return dispatchDefenseSchedulesRequest(req, t.slice(1), services);
    }

    if (
        seg0 === 'defense-schedule-panelists' ||
        seg0 === 'defense-schedule-panelist' ||
        seg0 === 'schedule-panelists' ||
        seg0 === 'schedule-panelist'
    ) {
        return dispatchSchedulePanelistsRequest(req, t.slice(1), services);
    }

    if (seg0 === 'rubric-templates' || seg0 === 'rubric-template') {
        return dispatchRubricTemplatesRequest(req, t.slice(1), services);
    }

    if (seg0 === 'audit-logs' || seg0 === 'audit-log') {
        return dispatchAuditLogsRequest(req, t.slice(1), services);
    }

    if (seg0 === 'thesis' && (t[1] ?? '').toLowerCase() === 'groups') {
        return dispatchThesisGroupsRequest(req, t.slice(2), services, {
            autoCreateMissingStudentProfile: true,
        });
    }

    if (seg0 === 'thesis-groups' || seg0 === 'thesis-group' || seg0 === 'groups') {
        return dispatchThesisGroupsRequest(req, t.slice(1), services, {
            autoCreateMissingStudentProfile: true,
        });
    }

    if (seg0 === 'rankings' || seg0 === 'ranking') {
        return dispatchAdminRankingsRequest(req, t, controller);
    }

    const id = t[0];
    if (!id || !isUuidLike(id)) return json404Api();

    if (t.length === 1) {
        if (method === 'GET') {
            const item = await controller.getById(id as UUID);
            if (!item) return json404Entity('Admin');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.update(id as UUID, body as Parameters<AdminController['update']>[1]);
            if (!item) return json404Entity('Admin');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete(id as UUID);
            if (deleted === 0) return json404Entity('Admin');
            return json200({ deleted });
        }

        return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
    }

    if (t.length === 2 && (t[1] ?? '').toLowerCase() === 'status') {
        if (method !== 'PATCH' && method !== 'POST') return json405(['PATCH', 'POST', 'OPTIONS']);

        const body = await readJsonRecord(req);
        if (!body) return json400('Invalid JSON body.');

        const status = toUserStatus(body.status);
        if (!status) return json400(`Invalid status. Allowed: ${USER_STATUSES.join(', ')}`);

        const item = await controller.setStatus(id as UUID, status);
        if (!item) return json404Entity('Admin');
        return json200({ item });
    }

    return json404Api();
}
