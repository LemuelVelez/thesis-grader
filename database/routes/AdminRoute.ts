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

    const segment = tail[1]?.toLowerCase();

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

async function dispatchAdminStudentFeedbackRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = new AdminController(services);
    const method = req.method.toUpperCase();

    if (tail.length === 0) {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);
        return json200({
            service: 'admin.student-feedback',
            routes: {
                schema: 'GET /api/admin/student-feedback/schema',
                listBySchedule: 'GET /api/admin/student-feedback/schedule/:scheduleId',
                assignForSchedule: 'POST /api/admin/student-feedback/schedule/:scheduleId/assign',
            },
        });
    }

    if (tail.length === 1 && tail[0] === 'schema') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);
        const item = controller.getStudentFeedbackFormSchema();
        // Return both keys for frontend resilience (item/schema).
        return json200({ item, schema: item });
    }

    if (tail[0] === 'schedule' && tail.length >= 2) {
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
        if (tail.length === 3 && tail[2] === 'assign') {
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

    if (tail.length === 0) {
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

    if (
        tail[0] === 'student-feedback' ||
        tail[0] === 'student-feedback-forms' ||
        tail[0] === 'feedback' ||
        tail[0] === 'feedback-forms'
    ) {
        return dispatchAdminStudentFeedbackRequest(req, tail.slice(1), services);
    }

    if (
        (tail[0] === 'student' || tail[0] === 'students') &&
        tail.length === 3 &&
        tail[2] === 'profile'
    ) {
        const userId = tail[1];
        if (!userId || !isUuidLike(userId)) return json400('student user id must be a valid UUID.');
        return dispatchAdminStudentProfileRequest(req, services, userId as UUID);
    }

    if (tail[0] === 'defense-schedules' || tail[0] === 'defense-schedule') {
        return dispatchDefenseSchedulesRequest(req, tail.slice(1), services);
    }

    if (
        tail[0] === 'defense-schedule-panelists' ||
        tail[0] === 'defense-schedule-panelist' ||
        tail[0] === 'schedule-panelists' ||
        tail[0] === 'schedule-panelist'
    ) {
        return dispatchSchedulePanelistsRequest(req, tail.slice(1), services);
    }

    if (tail[0] === 'rubric-templates' || tail[0] === 'rubric-template') {
        return dispatchRubricTemplatesRequest(req, tail.slice(1), services);
    }

    if (tail[0] === 'audit-logs' || tail[0] === 'audit-log') {
        return dispatchAuditLogsRequest(req, tail.slice(1), services);
    }

    if (tail[0] === 'thesis' && tail[1] === 'groups') {
        return dispatchThesisGroupsRequest(req, tail.slice(2), services, {
            autoCreateMissingStudentProfile: true,
        });
    }

    if (tail[0] === 'thesis-groups' || tail[0] === 'thesis-group' || tail[0] === 'groups') {
        return dispatchThesisGroupsRequest(req, tail.slice(1), services, {
            autoCreateMissingStudentProfile: true,
        });
    }

    if (tail[0] === 'rankings' || tail[0] === 'ranking') {
        return dispatchAdminRankingsRequest(req, tail, controller);
    }

    const id = tail[0];
    if (!id || !isUuidLike(id)) return json404Api();

    if (tail.length === 1) {
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

    if (tail.length === 2 && tail[1] === 'status') {
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
