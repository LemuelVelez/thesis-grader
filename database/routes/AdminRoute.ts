import { NextRequest, NextResponse } from 'next/server';

import { AdminController } from '../controllers/AdminController';
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
} from './AdminRouteV3';
import {
    dispatchAuditLogsRequest,
    dispatchRubricTemplatesRequest,
    dispatchThesisGroupsRequest,
} from './AdminRouteV4';

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

    if (tail.length === 1 && tail[0] === 'rankings') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);
        const limit = parsePositiveInt(req.nextUrl.searchParams.get('limit'));
        const items = await services.v_thesis_group_rankings.leaderboard(limit);
        return json200({ items });
    }

    if (tail.length === 2 && tail[0] === 'rankings') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);
        const groupId = tail[1];
        if (!groupId || !isUuidLike(groupId)) {
            return json400('groupId is required and must be a valid UUID.');
        }

        const item = await services.v_thesis_group_rankings.byGroup(groupId as UUID);
        if (!item) return json404Entity('Ranking');
        return json200({ item });
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
