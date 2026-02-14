import { NextRequest, NextResponse } from 'next/server';

import {
    AdminController,
} from '../controllers/AdminController';
import {
    createAuthController,
    type AuthControllerOptions,
} from '../controllers/AuthController';
import { createMiddlewareController } from '../controllers/Middleware';
import { NotificationController } from '../controllers/NotificationController';
import { PanelistController } from '../controllers/PanelistController';
import { StaffController } from '../controllers/StaffController';
import { StudentController } from '../controllers/StudentController';
import { UserController } from '../controllers/UserController';
import {
    NOTIFICATION_TYPES,
    USER_STATUSES,
    type AuditLogInsert,
    type AuditLogPatch,
    type AuditLogRow,
    type DefenseScheduleInsert,
    type DefenseSchedulePatch,
    type DefenseScheduleRow,
    type EvaluationInsert,
    type EvaluationPatch,
    type EvaluationRow,
    type GroupMemberRow,
    type RubricTemplateInsert,
    type RubricTemplatePatch,
    type RubricTemplateRow,
    type SchedulePanelistInsert,
    type SchedulePanelistRow,
    type ThesisGroupInsert,
    type ThesisGroupPatch,
    type ThesisGroupRow,
    type UserRow,
    type UUID,
} from '../models/Model';
import type { DatabaseServices } from '../services/Services';

import type {
    ApiGuardOptions,
    ApiRoot,
    AuthAction,
    AuthRouteContext,
    CreateApiRouteHandlersOptions,
} from './RouteTypes';
import {
    buildGroupMemberResponse,
    findGroupMemberByIdentifierWithAliasFallback,
    hasExplicitLinkedStudentUserReference,
    isForeignKeyViolation,
    isRecord,
    isThesisGroupMembersSegment,
    isUniqueViolation,
    isUuidLike,
    json200,
    json201,
    json400,
    json404Api,
    json404Auth,
    json404Entity,
    json405,
    normalizeSegments,
    omitWhere,
    parseBoolean,
    parseGroupMemberStudentIdFromBody,
    parseListQuery,
    parseOptionalIsoDate,
    parsePositiveInt,
    parseReadAt,
    parseStudentProfileInput,
    readJsonRecord,
    resolveApiRoot,
    resolveAuthAction,
    resolveCanonicalUserForMember,
    resolveContextSlug,
    toErrorMessage,
    toEvaluationStatus,
    toNotificationType,
    toUserStatus,
} from './Route.utils';

interface DispatchThesisGroupsOptions {
    autoCreateMissingStudentProfile?: boolean;
}

interface DispatchSchedulePanelistsOptions {
    forcedScheduleId?: UUID;
}

interface SchedulePanelistsServiceLike {
    listBySchedule?: (scheduleId: UUID) => Promise<SchedulePanelistRow[]>;
    listByStaff?: (staffId: UUID) => Promise<SchedulePanelistRow[]>;
    findMany?: (query?: unknown) => Promise<SchedulePanelistRow[]>;
    create?: (input: SchedulePanelistInsert) => Promise<SchedulePanelistRow>;
    delete?: (where: Partial<SchedulePanelistRow>) => Promise<number>;
    removeMember?: (scheduleId: UUID, staffId: UUID) => Promise<number>;
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
                result.created
                    ? 'Student profile created successfully.'
                    : 'Student profile updated successfully.',
            ];

            if (result.roleUpdated) {
                messageParts.push('User role was set to "student".');
            }

            return NextResponse.json(
                {
                    item: result.item,
                    message: messageParts.join(' '),
                },
                {
                    status: result.created ? 201 : 200,
                },
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

function isDefenseSchedulePanelistsSegment(value: string | undefined): boolean {
    if (!value) return false;
    return (
        value === 'panelists' ||
        value === 'panelist' ||
        value === 'schedule-panelists' ||
        value === 'schedule-panelist' ||
        value === 'staff' ||
        value === 'staffs'
    );
}

function toNonEmptyTrimmedString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function parseSchedulePanelistStaffIdsFromBody(
    body: Record<string, unknown>,
): string[] {
    const ids: string[] = [];

    const arrayCandidates: unknown[] = [
        body.staff_ids,
        body.staffIds,
        body.panelist_ids,
        body.panelistIds,
        body.user_ids,
        body.userIds,
        body.member_ids,
        body.memberIds,
    ];

    for (const candidate of arrayCandidates) {
        if (!Array.isArray(candidate)) continue;
        for (const entry of candidate) {
            const parsed = toNonEmptyTrimmedString(entry);
            if (parsed) ids.push(parsed);
        }
    }

    const singleCandidates: unknown[] = [
        body.staff_id,
        body.staffId,
        body.panelist_id,
        body.panelistId,
        body.user_id,
        body.userId,
        body.member_id,
        body.memberId,
        body.id,
    ];

    for (const candidate of singleCandidates) {
        const parsed = toNonEmptyTrimmedString(candidate);
        if (parsed) ids.push(parsed);
    }

    const seen = new Set<string>();
    const unique: string[] = [];

    for (const id of ids) {
        const key = id.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(id);
    }

    return unique;
}

async function listSchedulePanelistsBySchedule(
    service: SchedulePanelistsServiceLike,
    scheduleId: UUID,
): Promise<SchedulePanelistRow[]> {
    if (typeof service.listBySchedule === 'function') {
        return service.listBySchedule(scheduleId);
    }

    if (typeof service.findMany === 'function') {
        const rows = await service.findMany({
            where: {
                schedule_id: scheduleId,
            },
        });
        return Array.isArray(rows) ? rows : [];
    }

    throw new Error('Schedule panelists service does not support listing by schedule.');
}

async function listSchedulePanelistsByStaff(
    service: SchedulePanelistsServiceLike,
    staffId: UUID,
): Promise<SchedulePanelistRow[]> {
    if (typeof service.listByStaff === 'function') {
        return service.listByStaff(staffId);
    }

    if (typeof service.findMany === 'function') {
        const rows = await service.findMany({
            where: {
                staff_id: staffId,
            },
        });
        return Array.isArray(rows) ? rows : [];
    }

    throw new Error('Schedule panelists service does not support listing by staff/panelist.');
}

async function createSchedulePanelist(
    service: SchedulePanelistsServiceLike,
    payload: SchedulePanelistInsert,
): Promise<SchedulePanelistRow> {
    if (typeof service.create !== 'function') {
        throw new Error('Schedule panelists service does not support create.');
    }
    return service.create(payload);
}

async function deleteSchedulePanelist(
    service: SchedulePanelistsServiceLike,
    scheduleId: UUID,
    staffId: UUID,
): Promise<number> {
    if (typeof service.removeMember === 'function') {
        return service.removeMember(scheduleId, staffId);
    }

    if (typeof service.delete === 'function') {
        return service.delete({
            schedule_id: scheduleId,
            staff_id: staffId,
        });
    }

    throw new Error('Schedule panelists service does not support delete/remove.');
}

async function dispatchSchedulePanelistsRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
    options: DispatchSchedulePanelistsOptions = {},
): Promise<Response> {
    const method = req.method.toUpperCase();
    const service = services.schedule_panelists as unknown as SchedulePanelistsServiceLike;
    const forcedScheduleId = options.forcedScheduleId ?? null;

    const ensureScheduleExists = async (scheduleId: UUID): Promise<boolean> => {
        try {
            const row = await services.defense_schedules.findById(scheduleId);
            return !!row;
        } catch {
            return false;
        }
    };

    const ensureUserExists = async (userId: UUID): Promise<boolean> => {
        try {
            const user = await services.users.findById(userId);
            return !!user;
        } catch {
            return false;
        }
    };

    const getExistingByComposite = async (
        scheduleId: UUID,
        staffId: UUID,
    ): Promise<SchedulePanelistRow | null> => {
        const rows = await listSchedulePanelistsBySchedule(service, scheduleId);
        return (
            rows.find(
                (row) =>
                    row.schedule_id.toLowerCase() === scheduleId.toLowerCase() &&
                    row.staff_id.toLowerCase() === staffId.toLowerCase(),
            ) ?? null
        );
    };

    const createAssignments = async (
        scheduleId: UUID,
        staffIds: UUID[],
    ): Promise<{
        items: SchedulePanelistRow[];
        createdCount: number;
        existingCount: number;
    }> => {
        const rowsBySchedule = await listSchedulePanelistsBySchedule(service, scheduleId);
        const map = new Map<string, SchedulePanelistRow>();

        for (const row of rowsBySchedule) {
            const key = `${row.schedule_id.toLowerCase()}:${row.staff_id.toLowerCase()}`;
            map.set(key, row);
        }

        const items: SchedulePanelistRow[] = [];
        let createdCount = 0;
        let existingCount = 0;

        for (const staffId of staffIds) {
            const key = `${scheduleId.toLowerCase()}:${staffId.toLowerCase()}`;
            const existing = map.get(key);

            if (existing) {
                items.push(existing);
                existingCount += 1;
                continue;
            }

            try {
                const created = await createSchedulePanelist(service, {
                    schedule_id: scheduleId,
                    staff_id: staffId,
                });
                map.set(key, created);
                items.push(created);
                createdCount += 1;
            } catch (error) {
                if (isUniqueViolation(error)) {
                    const found = await getExistingByComposite(scheduleId, staffId);
                    if (found) {
                        map.set(key, found);
                        items.push(found);
                        existingCount += 1;
                        continue;
                    }
                }

                if (isForeignKeyViolation(error)) {
                    throw new Error(
                        `Invalid staff/panelist user reference: ${staffId}. Make sure the user exists before assignment.`,
                    );
                }

                throw error;
            }
        }

        return { items, createdCount, existingCount };
    };

    const resolveScheduleIdFromBody = (
        body: Record<string, unknown>,
    ): string | null => {
        const candidates: unknown[] = [
            body.schedule_id,
            body.scheduleId,
            body.defense_schedule_id,
            body.defenseScheduleId,
            body.id,
        ];

        for (const candidate of candidates) {
            const parsed = toNonEmptyTrimmedString(candidate);
            if (parsed) return parsed;
        }

        return null;
    };

    const handleCreateForSchedule = async (
        scheduleId: UUID,
        body: Record<string, unknown>,
    ): Promise<Response> => {
        const staffIds = parseSchedulePanelistStaffIdsFromBody(body);

        if (staffIds.length === 0) {
            return json400(
                'staffId/panelistId is required. You may also provide staffIds/panelistIds array.',
            );
        }

        for (const staffId of staffIds) {
            if (!isUuidLike(staffId)) {
                return json400(`Invalid staff/panelist id: ${staffId}`);
            }
        }

        const allUsersExist = await Promise.all(
            staffIds.map((id) => ensureUserExists(id as UUID)),
        );

        const missingIndex = allUsersExist.findIndex((exists) => !exists);
        if (missingIndex >= 0) {
            return json400(
                `User not found for staff/panelist id: ${staffIds[missingIndex]}`,
            );
        }

        try {
            const { items, createdCount, existingCount } =
                await createAssignments(
                    scheduleId,
                    staffIds as UUID[],
                );

            const payload: Record<string, unknown> = {
                message:
                    createdCount > 0
                        ? `Assigned ${createdCount} panelist(s) to this defense schedule.${existingCount > 0 ? ` ${existingCount} assignment(s) already existed.` : ''}`
                        : 'All provided panelists are already assigned to this defense schedule.',
            };

            if (items.length === 1) {
                payload.item = items[0];
            } else {
                payload.items = items;
            }

            payload.createdCount = createdCount;
            payload.existingCount = existingCount;

            return NextResponse.json(payload, {
                status: createdCount > 0 ? 201 : 200,
            });
        } catch (error) {
            return NextResponse.json(
                {
                    error: 'Failed to assign schedule panelists.',
                    message: toErrorMessage(error),
                },
                { status: 500 },
            );
        }
    };

    // Nested mode: /api/*/defense-schedules/:id/panelists[/:staffId]
    if (forcedScheduleId) {
        if (tail.length === 0) {
            if (method === 'GET') {
                try {
                    const items = await listSchedulePanelistsBySchedule(
                        service,
                        forcedScheduleId,
                    );
                    return json200({ items });
                } catch (error) {
                    return NextResponse.json(
                        {
                            error: 'Failed to fetch schedule panelists.',
                            message: toErrorMessage(error),
                        },
                        { status: 500 },
                    );
                }
            }

            if (method === 'POST') {
                const body = await readJsonRecord(req);
                if (!body) return json400('Invalid JSON body.');
                return handleCreateForSchedule(forcedScheduleId, body);
            }

            return json405(['GET', 'POST', 'OPTIONS']);
        }

        const staffId = tail[0];
        if (!staffId || !isUuidLike(staffId)) {
            return json404Api();
        }

        if (tail.length === 1) {
            if (method === 'GET') {
                try {
                    const item = await getExistingByComposite(
                        forcedScheduleId,
                        staffId as UUID,
                    );
                    if (!item) return json404Entity('Defense schedule panelist');
                    return json200({ item });
                } catch (error) {
                    return NextResponse.json(
                        {
                            error: 'Failed to fetch defense schedule panelist.',
                            message: toErrorMessage(error),
                        },
                        { status: 500 },
                    );
                }
            }

            if (method === 'DELETE') {
                try {
                    const deleted = await deleteSchedulePanelist(
                        service,
                        forcedScheduleId,
                        staffId as UUID,
                    );
                    if (deleted === 0) return json404Entity('Defense schedule panelist');
                    return json200({ deleted });
                } catch (error) {
                    return NextResponse.json(
                        {
                            error: 'Failed to remove defense schedule panelist.',
                            message: toErrorMessage(error),
                        },
                        { status: 500 },
                    );
                }
            }

            return json405(['GET', 'DELETE', 'OPTIONS']);
        }

        return json404Api();
    }

    // Top-level mode: /api/*/defense-schedule-panelists...
    if (tail.length === 0) {
        if (method === 'GET') {
            const scheduleIdQuery =
                req.nextUrl.searchParams.get('scheduleId') ??
                req.nextUrl.searchParams.get('schedule_id');
            const staffIdQuery =
                req.nextUrl.searchParams.get('staffId') ??
                req.nextUrl.searchParams.get('staff_id') ??
                req.nextUrl.searchParams.get('panelistId') ??
                req.nextUrl.searchParams.get('panelist_id');

            if (scheduleIdQuery) {
                if (!isUuidLike(scheduleIdQuery)) {
                    return json400('scheduleId must be a valid UUID.');
                }
                try {
                    const items = await listSchedulePanelistsBySchedule(
                        service,
                        scheduleIdQuery as UUID,
                    );
                    return json200({ items });
                } catch (error) {
                    return NextResponse.json(
                        {
                            error: 'Failed to fetch schedule panelists.',
                            message: toErrorMessage(error),
                        },
                        { status: 500 },
                    );
                }
            }

            if (staffIdQuery) {
                if (!isUuidLike(staffIdQuery)) {
                    return json400('staffId/panelistId must be a valid UUID.');
                }
                try {
                    const items = await listSchedulePanelistsByStaff(
                        service,
                        staffIdQuery as UUID,
                    );
                    return json200({ items });
                } catch (error) {
                    return NextResponse.json(
                        {
                            error: 'Failed to fetch panelist schedules.',
                            message: toErrorMessage(error),
                        },
                        { status: 500 },
                    );
                }
            }

            if (typeof service.findMany === 'function') {
                try {
                    const items = await service.findMany(parseListQuery<SchedulePanelistRow>(req));
                    return json200({ items });
                } catch (error) {
                    return NextResponse.json(
                        {
                            error: 'Failed to fetch schedule panelists.',
                            message: toErrorMessage(error),
                        },
                        { status: 500 },
                    );
                }
            }

            return json400('Provide scheduleId or staffId query filter.');
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const scheduleIdRaw = resolveScheduleIdFromBody(body);
            if (!scheduleIdRaw) {
                return json400('scheduleId is required.');
            }

            if (!isUuidLike(scheduleIdRaw)) {
                return json400('scheduleId must be a valid UUID.');
            }

            const exists = await ensureScheduleExists(scheduleIdRaw as UUID);
            if (!exists) {
                return json404Entity('Defense schedule');
            }

            return handleCreateForSchedule(scheduleIdRaw as UUID, body);
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    // /api/*/defense-schedule-panelists/:scheduleId
    if (tail.length === 1 && isUuidLike(tail[0])) {
        const scheduleId = tail[0] as UUID;

        if (method === 'GET') {
            try {
                const items = await listSchedulePanelistsBySchedule(service, scheduleId);
                return json200({ items });
            } catch (error) {
                return NextResponse.json(
                    {
                        error: 'Failed to fetch schedule panelists.',
                        message: toErrorMessage(error),
                    },
                    { status: 500 },
                );
            }
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const exists = await ensureScheduleExists(scheduleId);
            if (!exists) {
                return json404Entity('Defense schedule');
            }

            return handleCreateForSchedule(scheduleId, body);
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    // /api/*/defense-schedule-panelists/schedule/:scheduleId
    if (
        tail.length === 2 &&
        (tail[0] === 'schedule' || tail[0] === 'defense-schedule')
    ) {
        const scheduleId = tail[1];
        if (!scheduleId || !isUuidLike(scheduleId)) {
            return json400('scheduleId must be a valid UUID.');
        }

        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        try {
            const items = await listSchedulePanelistsBySchedule(
                service,
                scheduleId as UUID,
            );
            return json200({ items });
        } catch (error) {
            return NextResponse.json(
                {
                    error: 'Failed to fetch schedule panelists.',
                    message: toErrorMessage(error),
                },
                { status: 500 },
            );
        }
    }

    // /api/*/defense-schedule-panelists/staff/:staffId
    // /api/*/defense-schedule-panelists/panelist/:panelistId
    if (
        tail.length === 2 &&
        (tail[0] === 'staff' || tail[0] === 'panelist')
    ) {
        const staffId = tail[1];
        if (!staffId || !isUuidLike(staffId)) {
            return json400('staffId/panelistId must be a valid UUID.');
        }

        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        try {
            const items = await listSchedulePanelistsByStaff(
                service,
                staffId as UUID,
            );
            return json200({ items });
        } catch (error) {
            return NextResponse.json(
                {
                    error: 'Failed to fetch panelist schedules.',
                    message: toErrorMessage(error),
                },
                { status: 500 },
            );
        }
    }

    // /api/*/defense-schedule-panelists/:scheduleId/:staffId
    if (tail.length === 2 && isUuidLike(tail[0]) && isUuidLike(tail[1])) {
        const scheduleId = tail[0] as UUID;
        const staffId = tail[1] as UUID;

        if (method === 'GET') {
            try {
                const item = await getExistingByComposite(scheduleId, staffId);
                if (!item) return json404Entity('Defense schedule panelist');
                return json200({ item });
            } catch (error) {
                return NextResponse.json(
                    {
                        error: 'Failed to fetch defense schedule panelist.',
                        message: toErrorMessage(error),
                    },
                    { status: 500 },
                );
            }
        }

        if (method === 'DELETE') {
            try {
                const deleted = await deleteSchedulePanelist(service, scheduleId, staffId);
                if (deleted === 0) return json404Entity('Defense schedule panelist');
                return json200({ deleted });
            } catch (error) {
                return NextResponse.json(
                    {
                        error: 'Failed to remove defense schedule panelist.',
                        message: toErrorMessage(error),
                    },
                    { status: 500 },
                );
            }
        }

        return json405(['GET', 'DELETE', 'OPTIONS']);
    }

    // /api/*/defense-schedule-panelists/:scheduleId/staff/:staffId
    // /api/*/defense-schedule-panelists/:scheduleId/panelist/:panelistId
    if (
        tail.length === 3 &&
        isUuidLike(tail[0]) &&
        (tail[1] === 'staff' || tail[1] === 'panelist') &&
        isUuidLike(tail[2])
    ) {
        const scheduleId = tail[0] as UUID;
        const staffId = tail[2] as UUID;

        if (method === 'GET') {
            try {
                const item = await getExistingByComposite(scheduleId, staffId);
                if (!item) return json404Entity('Defense schedule panelist');
                return json200({ item });
            } catch (error) {
                return NextResponse.json(
                    {
                        error: 'Failed to fetch defense schedule panelist.',
                        message: toErrorMessage(error),
                    },
                    { status: 500 },
                );
            }
        }

        if (method === 'DELETE') {
            try {
                const deleted = await deleteSchedulePanelist(service, scheduleId, staffId);
                if (deleted === 0) return json404Entity('Defense schedule panelist');
                return json200({ deleted });
            } catch (error) {
                return NextResponse.json(
                    {
                        error: 'Failed to remove defense schedule panelist.',
                        message: toErrorMessage(error),
                    },
                    { status: 500 },
                );
            }
        }

        return json405(['GET', 'DELETE', 'OPTIONS']);
    }

    return json404Api();
}

async function dispatchAuthRequest(
    req: NextRequest,
    action: AuthAction | null,
    servicesResolver: () => Promise<DatabaseServices>,
    authOptions?: AuthControllerOptions,
): Promise<Response> {
    if (!action) return json404Auth();

    const method = req.method.toUpperCase();

    // Root metadata endpoint
    if (action === 'root') {
        if (method !== 'GET') {
            return json405(['GET', 'OPTIONS']);
        }

        return json200({
            service: 'auth',
            routes: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login',
                logout: 'POST|DELETE /api/auth/logout',
                me: 'GET /api/auth/me',
                refresh: 'POST /api/auth/refresh',
                forgotPassword: 'POST /api/auth/forgot-password',
                resetPassword: 'POST /api/auth/reset-password',
            },
        });
    }

    const services = await servicesResolver();
    const auth = createAuthController(services, authOptions);

    switch (action) {
        case 'register':
            if (method !== 'POST') return json405(['POST', 'OPTIONS']);
            return auth.register(req);

        case 'login':
            if (method !== 'POST') return json405(['POST', 'OPTIONS']);
            return auth.login(req);

        case 'logout':
            if (method !== 'POST' && method !== 'DELETE') {
                return json405(['POST', 'DELETE', 'OPTIONS']);
            }
            return auth.logout(req);

        case 'me':
            if (method !== 'GET') return json405(['GET', 'OPTIONS']);
            return auth.me(req);

        case 'refresh':
            if (method !== 'POST') return json405(['POST', 'OPTIONS']);
            return auth.refresh(req);

        case 'forgot-password':
            if (method !== 'POST') return json405(['POST', 'OPTIONS']);
            return auth.forgotPassword(req);

        case 'reset-password':
            if (method !== 'POST') return json405(['POST', 'OPTIONS']);
            return auth.resetPassword(req);

        default:
            return json404Auth();
    }
}

async function dispatchThesisGroupsRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
    options: DispatchThesisGroupsOptions = {},
): Promise<Response> {
    const controller = services.thesis_groups;
    const method = req.method.toUpperCase();

    if (tail.length === 0) {
        if (method === 'GET') {
            const adviserId =
                req.nextUrl.searchParams.get('adviserId') ??
                req.nextUrl.searchParams.get('adviser_id');

            if (adviserId) {
                if (!isUuidLike(adviserId)) {
                    return json400('adviserId must be a valid UUID.');
                }
                const items = await controller.listByAdviser(adviserId as UUID);
                return json200({ items });
            }

            const query = parseListQuery<ThesisGroupRow>(req);
            const items = await controller.findMany(query);
            return json200({ items });
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.create(body as ThesisGroupInsert);
            return json201({ item });
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    if (tail.length === 2 && tail[0] === 'adviser') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);
        const adviserId = tail[1];
        if (!adviserId || !isUuidLike(adviserId)) {
            return json400('adviserId must be a valid UUID.');
        }

        const items = await controller.listByAdviser(adviserId as UUID);
        return json200({ items });
    }

    const id = tail[0];
    if (!id || !isUuidLike(id)) return json404Api();

    if (tail.length === 1) {
        if (method === 'GET') {
            const item = await controller.findById(id as UUID);
            if (!item) return json404Entity('Thesis group');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.updateOne({ id: id as UUID }, body as ThesisGroupPatch);
            if (!item) return json404Entity('Thesis group');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete({ id: id as UUID });
            if (deleted === 0) return json404Entity('Thesis group');
            return json200({ deleted });
        }

        return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
    }

    // /api/*/thesis-groups/:id/members[/:memberId]
    // Supports aliases: members, member, group-members, group-member
    if (isThesisGroupMembersSegment(tail[1])) {
        const group = await controller.findById(id as UUID);
        if (!group) return json404Entity('Thesis group');

        const membersController = services.group_members;

        if (tail.length === 2) {
            if (method === 'GET') {
                const rows = await membersController.listByGroup(id as UUID);
                const items = await Promise.all(
                    rows.map((row) => buildGroupMemberResponse(row, services)),
                );
                return json200({ items });
            }

            if (method === 'POST') {
                const body = await readJsonRecord(req);
                if (!body) return json400('Invalid JSON body.');

                const incomingStudentId = parseGroupMemberStudentIdFromBody(body);
                if (!incomingStudentId) {
                    return json400('studentId/userId is required.');
                }

                if (!isUuidLike(incomingStudentId)) {
                    return json400('studentId/userId must be a valid UUID.');
                }

                const requiresLinkedStudentUser =
                    hasExplicitLinkedStudentUserReference(body);

                // Canonicalize alias UUID -> users.id before any membership operations.
                const resolvedStudent = await resolveCanonicalUserForMember(
                    services,
                    incomingStudentId,
                );
                const canonicalStudentId = resolvedStudent.canonicalId;
                const studentUser = resolvedStudent.user;

                if (studentUser && studentUser.role !== 'student') {
                    return json400('Resolved user must have role "student".');
                }

                if (requiresLinkedStudentUser && !studentUser) {
                    return json400(
                        'Linked student user was not found. Use a valid student user id or switch to manual entry.',
                    );
                }

                // Pre-check student profile to avoid DB-level FK explosions and opaque 500s.
                let studentProfile = studentUser
                    ? await services.students.findByUserId(canonicalStudentId as UUID).catch(() => null)
                    : null;

                if (
                    studentUser &&
                    !studentProfile &&
                    options.autoCreateMissingStudentProfile
                ) {
                    try {
                        const adminController = new AdminController(services);
                        const autoCreated =
                            await adminController.upsertStudentProfileForUser(
                                canonicalStudentId as UUID,
                                parseStudentProfileInput(body),
                            );
                        if (!autoCreated) {
                            return json404Entity('Student user');
                        }
                        studentProfile = autoCreated.item;
                    } catch (error) {
                        return NextResponse.json(
                            {
                                error:
                                    'Failed to create missing student profile before adding the member.',
                                message: toErrorMessage(error),
                            },
                            { status: 500 },
                        );
                    }
                }

                if (studentUser && !studentProfile) {
                    return json400(
                        'Selected student user does not have a student profile record. Create the student profile first, then add the member.',
                    );
                }

                const existingRows = await membersController.listByGroup(id as UUID);
                const existing = existingRows.find(
                    (row) => row.student_id === canonicalStudentId,
                );
                if (existing) {
                    const item = await buildGroupMemberResponse(existing, services);
                    return json200({ item });
                }

                let created: GroupMemberRow;
                try {
                    created = await membersController.create({
                        group_id: id as UUID,
                        student_id: canonicalStudentId as UUID,
                    });
                } catch (error) {
                    if (isUniqueViolation(error)) {
                        const rows = await membersController.listByGroup(id as UUID);
                        const duplicate = rows.find(
                            (row) => row.student_id === canonicalStudentId,
                        );
                        if (duplicate) {
                            const item = await buildGroupMemberResponse(duplicate, services);
                            return json200({ item });
                        }
                        return json400(
                            'Selected student is already a member of this thesis group.',
                        );
                    }

                    if (isForeignKeyViolation(error)) {
                        if (!studentUser) {
                            return json400(
                                'Manual entries are not supported by the current database schema. Please create/select a Student user first, then add that user as a member.',
                            );
                        }

                        if (!studentProfile) {
                            return json400(
                                'Selected student user does not have a student profile record. Create the student profile first, then add the member.',
                            );
                        }

                        return json400(
                            'Unable to add thesis group member because required student profile records are missing.',
                        );
                    }

                    return NextResponse.json(
                        {
                            error: 'Failed to add thesis group member.',
                            message: toErrorMessage(error),
                        },
                        { status: 500 },
                    );
                }

                const item = await buildGroupMemberResponse(created, services);
                return json201({ item });
            }

            return json405(['GET', 'POST', 'OPTIONS']);
        }

        const rawMemberIdentifier = tail[2];
        if (!rawMemberIdentifier) return json404Api();

        const groupMembers = await membersController.listByGroup(id as UUID);
        const existingMember = await findGroupMemberByIdentifierWithAliasFallback(
            groupMembers,
            rawMemberIdentifier,
            services,
        );
        if (!existingMember) return json404Entity('Thesis group member');

        if (tail.length === 3) {
            if (method === 'GET') {
                const item = await buildGroupMemberResponse(existingMember, services);
                return json200({ item });
            }

            if (method === 'PATCH' || method === 'PUT') {
                const body = await readJsonRecord(req);
                if (!body) return json400('Invalid JSON body.');

                const incomingNextStudentId = parseGroupMemberStudentIdFromBody(body);
                if (!incomingNextStudentId) {
                    return json400('studentId/userId is required.');
                }

                if (!isUuidLike(incomingNextStudentId)) {
                    return json400('studentId/userId must be a valid UUID.');
                }

                const requiresLinkedStudentUser =
                    hasExplicitLinkedStudentUserReference(body);

                // Canonicalize alias UUID -> users.id before replacement create.
                const resolvedNextStudent = await resolveCanonicalUserForMember(
                    services,
                    incomingNextStudentId,
                );
                const nextCanonicalStudentId = resolvedNextStudent.canonicalId;
                const nextStudentUser = resolvedNextStudent.user;

                if (nextStudentUser && nextStudentUser.role !== 'student') {
                    return json400('Resolved user must have role "student".');
                }

                if (requiresLinkedStudentUser && !nextStudentUser) {
                    return json400(
                        'Linked student user was not found. Use a valid student user id or switch to manual entry.',
                    );
                }

                // Pre-check profile before attempting replacement.
                let nextStudentProfile = nextStudentUser
                    ? await services.students.findByUserId(nextCanonicalStudentId as UUID).catch(() => null)
                    : null;

                if (
                    nextStudentUser &&
                    !nextStudentProfile &&
                    options.autoCreateMissingStudentProfile
                ) {
                    try {
                        const adminController = new AdminController(services);
                        const autoCreated =
                            await adminController.upsertStudentProfileForUser(
                                nextCanonicalStudentId as UUID,
                                parseStudentProfileInput(body),
                            );
                        if (!autoCreated) {
                            return json404Entity('Student user');
                        }
                        nextStudentProfile = autoCreated.item;
                    } catch (error) {
                        return NextResponse.json(
                            {
                                error:
                                    'Failed to create missing student profile before updating the member.',
                                message: toErrorMessage(error),
                            },
                            { status: 500 },
                        );
                    }
                }

                if (nextStudentUser && !nextStudentProfile) {
                    return json400(
                        'Selected student user does not have a student profile record. Create the student profile first, then update the member.',
                    );
                }

                if (
                    nextCanonicalStudentId.toLowerCase() ===
                    existingMember.student_id.toLowerCase()
                ) {
                    const item = await buildGroupMemberResponse(existingMember, services);
                    return json200({ item });
                }

                const duplicate = groupMembers.some(
                    (row) => row.student_id === nextCanonicalStudentId,
                );
                if (duplicate) {
                    return json400(
                        'Selected student is already a member of this thesis group.',
                    );
                }

                // Safer order: create replacement first, remove old member second.
                // This prevents accidental data loss if creation fails.
                let replacement: GroupMemberRow;
                try {
                    replacement = await membersController.create({
                        group_id: id as UUID,
                        student_id: nextCanonicalStudentId as UUID,
                    });
                } catch (error) {
                    if (isUniqueViolation(error)) {
                        return json400(
                            'Selected student is already a member of this thesis group.',
                        );
                    }

                    if (isForeignKeyViolation(error)) {
                        if (!nextStudentUser) {
                            return json400(
                                'Manual entries are not supported by the current database schema. Please create/select a Student user first, then add that user as a member.',
                            );
                        }

                        if (!nextStudentProfile) {
                            return json400(
                                'Selected student user does not have a student profile record. Create the student profile first, then update the member.',
                            );
                        }

                        return json400(
                            'Unable to update thesis group member because required student profile records are missing.',
                        );
                    }

                    return NextResponse.json(
                        {
                            error: 'Failed to update thesis group member.',
                            message: toErrorMessage(error),
                        },
                        { status: 500 },
                    );
                }

                const removed = await membersController.removeMember(
                    id as UUID,
                    existingMember.student_id as UUID,
                );

                if (removed === 0) {
                    // Roll back replacement if old member unexpectedly vanished.
                    await membersController.removeMember(
                        id as UUID,
                        replacement.student_id as UUID,
                    );
                    return json404Entity('Thesis group member');
                }

                const item = await buildGroupMemberResponse(replacement, services);
                return json200({ item });
            }

            if (method === 'DELETE') {
                const deleted = await membersController.removeMember(
                    id as UUID,
                    existingMember.student_id as UUID,
                );
                if (deleted === 0) return json404Entity('Thesis group member');
                return json200({ deleted });
            }

            return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
        }

        return json404Api();
    }

    // /api/*/thesis-groups/:id/schedules[/:scheduleId[/status]]
    if (tail[1] === 'schedules' || tail[1] === 'defense-schedules') {
        const group = await controller.findById(id as UUID);
        if (!group) return json404Entity('Thesis group');

        const schedulesController = services.defense_schedules;

        if (tail.length === 2) {
            if (method === 'GET') {
                const items = await schedulesController.listByGroup(id as UUID);
                return json200({ items });
            }

            if (method === 'POST') {
                const body = await readJsonRecord(req);
                if (!body) return json400('Invalid JSON body.');

                const payload: DefenseScheduleInsert = {
                    ...(body as DefenseScheduleInsert),
                    group_id: id as UUID,
                };

                const item = await schedulesController.create(payload);
                return json201({ item });
            }

            return json405(['GET', 'POST', 'OPTIONS']);
        }

        const scheduleId = tail[2];
        if (!scheduleId || !isUuidLike(scheduleId)) return json404Api();

        const existing = await schedulesController.findById(scheduleId as UUID);
        if (!existing || existing.group_id !== id) {
            return json404Entity('Defense schedule');
        }

        if (tail.length === 3) {
            if (method === 'GET') {
                return json200({ item: existing });
            }

            if (method === 'PATCH' || method === 'PUT') {
                const body = await readJsonRecord(req);
                if (!body) return json400('Invalid JSON body.');

                const item = await schedulesController.updateOne(
                    { id: scheduleId as UUID, group_id: id as UUID },
                    body as DefenseSchedulePatch,
                );
                if (!item) return json404Entity('Defense schedule');
                return json200({ item });
            }

            if (method === 'DELETE') {
                const deleted = await schedulesController.delete({
                    id: scheduleId as UUID,
                    group_id: id as UUID,
                });
                if (deleted === 0) return json404Entity('Defense schedule');
                return json200({ deleted });
            }

            return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
        }

        if (tail.length === 4 && tail[3] === 'status') {
            if (method !== 'PATCH' && method !== 'POST') {
                return json405(['PATCH', 'POST', 'OPTIONS']);
            }

            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const status = body.status;
            if (typeof status !== 'string' || status.trim().length === 0) {
                return json400('status must be a non-empty string.');
            }

            const item = await schedulesController.setStatus(
                scheduleId as UUID,
                status.trim() as DefenseScheduleRow['status'],
            );
            if (!item || item.group_id !== id) {
                return json404Entity('Defense schedule');
            }
            return json200({ item });
        }

        return json404Api();
    }

    return json404Api();
}

async function dispatchDefenseSchedulesRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = services.defense_schedules;
    const method = req.method.toUpperCase();

    if (tail.length === 0) {
        if (method === 'GET') {
            const groupId =
                req.nextUrl.searchParams.get('groupId') ??
                req.nextUrl.searchParams.get('group_id');
            const panelistId =
                req.nextUrl.searchParams.get('panelistId') ??
                req.nextUrl.searchParams.get('panelist_id') ??
                req.nextUrl.searchParams.get('staffId') ??
                req.nextUrl.searchParams.get('staff_id');

            if (groupId) {
                if (!isUuidLike(groupId)) {
                    return json400('groupId must be a valid UUID.');
                }
                const items = await controller.listByGroup(groupId as UUID);
                return json200({ items });
            }

            if (panelistId) {
                if (!isUuidLike(panelistId)) {
                    return json400('panelistId/staffId must be a valid UUID.');
                }
                const items = await controller.listByPanelist(panelistId as UUID);
                return json200({ items });
            }

            const query = parseListQuery<DefenseScheduleRow>(req);
            const items = await controller.findMany(query);
            return json200({ items });
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.create(body as DefenseScheduleInsert);
            return json201({ item });
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    // /api/*/defense-schedules/group/:groupId
    if (tail.length === 2 && tail[0] === 'group') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        const groupId = tail[1];
        if (!groupId || !isUuidLike(groupId)) {
            return json400('groupId must be a valid UUID.');
        }

        const items = await controller.listByGroup(groupId as UUID);
        return json200({ items });
    }

    // /api/*/defense-schedules/panelist/:panelistId
    if (tail.length === 2 && (tail[0] === 'panelist' || tail[0] === 'staff')) {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        const panelistId = tail[1];
        if (!panelistId || !isUuidLike(panelistId)) {
            return json400('panelistId/staffId must be a valid UUID.');
        }

        const items = await controller.listByPanelist(panelistId as UUID);
        return json200({ items });
    }

    const id = tail[0];
    if (!id || !isUuidLike(id)) return json404Api();

    if (tail.length === 1) {
        if (method === 'GET') {
            const item = await controller.findById(id as UUID);
            if (!item) return json404Entity('Defense schedule');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.updateOne({ id: id as UUID }, body as DefenseSchedulePatch);
            if (!item) return json404Entity('Defense schedule');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete({ id: id as UUID });
            if (deleted === 0) return json404Entity('Defense schedule');
            return json200({ deleted });
        }

        return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
    }

    // /api/*/defense-schedules/:id/panelists
    // /api/*/defense-schedules/:id/schedule-panelists
    if (tail.length >= 2 && isDefenseSchedulePanelistsSegment(tail[1])) {
        const existing = await controller.findById(id as UUID);
        if (!existing) return json404Entity('Defense schedule');

        return dispatchSchedulePanelistsRequest(req, tail.slice(2), services, {
            forcedScheduleId: id as UUID,
        });
    }

    if (tail.length === 2 && tail[1] === 'status') {
        if (method !== 'PATCH' && method !== 'POST') {
            return json405(['PATCH', 'POST', 'OPTIONS']);
        }

        const body = await readJsonRecord(req);
        if (!body) return json400('Invalid JSON body.');

        const status = body.status;
        if (typeof status !== 'string' || status.trim().length === 0) {
            return json400('status must be a non-empty string.');
        }

        const item = await controller.setStatus(
            id as UUID,
            status.trim() as DefenseScheduleRow['status'],
        );
        if (!item) return json404Entity('Defense schedule');
        return json200({ item });
    }

    return json404Api();
}

async function dispatchRubricTemplatesRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = services.rubric_templates;
    const method = req.method.toUpperCase();

    if (tail.length === 0) {
        if (method === 'GET') {
            const latest = parseBoolean(req.nextUrl.searchParams.get('latest'));
            if (latest === true) {
                const item = await controller.getActiveLatest();
                return json200({ item });
            }

            const active = parseBoolean(req.nextUrl.searchParams.get('active'));
            if (active === true) {
                const items = await controller.listActive();
                return json200({ items });
            }

            const query = parseListQuery<RubricTemplateRow>(req);
            const items = await controller.findMany(query);
            return json200({ items });
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.create(body as RubricTemplateInsert);
            return json201({ item });
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    // /api/*/rubric-templates/active
    if (tail.length === 1 && tail[0] === 'active') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);
        const items = await controller.listActive();
        return json200({ items });
    }

    // /api/*/rubric-templates/active/latest
    if (tail.length === 2 && tail[0] === 'active' && tail[1] === 'latest') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);
        const item = await controller.getActiveLatest();
        return json200({ item });
    }

    const id = tail[0];
    if (!id || !isUuidLike(id)) return json404Api();

    if (tail.length === 1) {
        if (method === 'GET') {
            const item = await controller.findById(id as UUID);
            if (!item) return json404Entity('Rubric template');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.updateOne({ id: id as UUID }, body as RubricTemplatePatch);
            if (!item) return json404Entity('Rubric template');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete({ id: id as UUID });
            if (deleted === 0) return json404Entity('Rubric template');
            return json200({ deleted });
        }

        return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
    }

    if (tail.length === 2 && tail[1] === 'active') {
        if (method !== 'PATCH' && method !== 'POST' && method !== 'PUT') {
            return json405(['PATCH', 'POST', 'PUT', 'OPTIONS']);
        }

        const body = await readJsonRecord(req);
        const activeFromBody = body ? body.active : undefined;
        const activeFromQuery = parseBoolean(req.nextUrl.searchParams.get('active'));

        const active =
            typeof activeFromBody === 'boolean' ? activeFromBody : activeFromQuery;

        if (active === undefined) {
            return json400('active must be provided as a boolean.');
        }

        const item = await controller.setActive(id as UUID, active);
        if (!item) return json404Entity('Rubric template');
        return json200({ item });
    }

    return json404Api();
}

async function dispatchAuditLogsRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = services.audit_logs;
    const method = req.method.toUpperCase();

    if (tail.length === 0) {
        if (method === 'GET') {
            const query = parseListQuery<AuditLogRow>(req);
            const search = req.nextUrl.searchParams;

            const actorId = search.get('actorId') ?? search.get('actor_id');
            const entity = search.get('entity');
            const entityId = search.get('entityId') ?? search.get('entity_id');

            const where: Partial<AuditLogRow> = {
                ...(query.where ?? {}),
            };

            if (actorId) {
                if (!isUuidLike(actorId)) {
                    return json400('actorId must be a valid UUID.');
                }
                where.actor_id = actorId as UUID;
            }

            if (entity) {
                where.entity = entity;
            }

            if (entityId) {
                if (!isUuidLike(entityId)) {
                    return json400('entityId must be a valid UUID.');
                }
                where.entity_id = entityId as UUID;
            }

            if (Object.keys(where).length > 0) {
                query.where = where;
            }

            const items = await controller.findMany(query);
            return json200({ items });
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.create(body as AuditLogInsert);
            return json201({ item });
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    // /api/*/audit-logs/actor/:actorId
    if (tail.length === 2 && tail[0] === 'actor') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);
        const actorId = tail[1];
        if (!actorId || !isUuidLike(actorId)) {
            return json400('actorId must be a valid UUID.');
        }

        const items = await controller.listByActor(actorId as UUID);
        return json200({ items });
    }

    // /api/*/audit-logs/entity/:entity[/entityId]
    if (tail.length >= 2 && tail[0] === 'entity') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);
        const entity = tail[1];
        if (!entity) return json400('entity is required.');

        const entityId = tail[2];
        if (entityId && !isUuidLike(entityId)) {
            return json400('entityId must be a valid UUID.');
        }

        const items = await controller.listByEntity(
            entity,
            entityId ? (entityId as UUID) : undefined,
        );
        return json200({ items });
    }

    const id = tail[0];
    if (!id || !isUuidLike(id)) return json404Api();

    if (tail.length === 1) {
        if (method === 'GET') {
            const item = await controller.findById(id as UUID);
            if (!item) return json404Entity('Audit log');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.updateOne({ id: id as UUID }, body as AuditLogPatch);
            if (!item) return json404Entity('Audit log');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete({ id: id as UUID });
            if (deleted === 0) return json404Entity('Audit log');
            return json200({ deleted });
        }

        return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
    }

    return json404Api();
}

async function dispatchAdminRequest(
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

            const item = await controller.create(
                body as Parameters<AdminController['create']>[0],
            );
            return json201({ item });
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    // /api/admin/student/:userId/profile
    // /api/admin/students/:userId/profile
    if (
        (tail[0] === 'student' || tail[0] === 'students') &&
        tail.length === 3 &&
        tail[2] === 'profile'
    ) {
        const userId = tail[1];
        if (!userId || !isUuidLike(userId)) {
            return json400('student user id must be a valid UUID.');
        }

        return dispatchAdminStudentProfileRequest(
            req,
            services,
            userId as UUID,
        );
    }

    // Namespaced admin resources
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

    if (
        tail[0] === 'thesis-groups' ||
        tail[0] === 'thesis-group' ||
        tail[0] === 'groups'
    ) {
        return dispatchThesisGroupsRequest(req, tail.slice(1), services, {
            autoCreateMissingStudentProfile: true,
        });
    }

    // /api/admin/rankings
    if (tail.length === 1 && tail[0] === 'rankings') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        const limit = parsePositiveInt(req.nextUrl.searchParams.get('limit'));
        const items = await services.v_thesis_group_rankings.leaderboard(limit);
        return json200({ items });
    }

    // /api/admin/rankings/:groupId
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

            const item = await controller.update(
                id as UUID,
                body as Parameters<AdminController['update']>[1],
            );
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
        if (!item) return json404Entity('Admin');
        return json200({ item });
    }

    return json404Api();
}

async function dispatchStudentRequest(
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

async function dispatchStaffRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = new StaffController(services);
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
                body as Parameters<StaffController['create']>[0],
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
            if (!item) return json404Entity('Staff');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.update(
                id as UUID,
                body as Parameters<StaffController['update']>[1],
            );
            if (!item) return json404Entity('Staff');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete(id as UUID);
            if (deleted === 0) return json404Entity('Staff');
            return json200({ deleted });
        }

        return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
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
        if (!item) return json404Entity('Staff');
        return json200({ item });
    }

    return json404Api();
}

async function dispatchPanelistRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = new PanelistController(services);
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
                body as Parameters<PanelistController['create']>[0],
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
            if (!item) return json404Entity('Panelist');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.update(
                id as UUID,
                body as Parameters<PanelistController['update']>[1],
            );
            if (!item) return json404Entity('Panelist');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete(id as UUID);
            if (deleted === 0) return json404Entity('Panelist');
            return json200({ deleted });
        }

        return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
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
        if (!item) return json404Entity('Panelist');
        return json200({ item });
    }

    return json404Api();
}

async function dispatchUsersRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = new UserController(services);
    const method = req.method.toUpperCase();

    if (tail.length === 0) {
        if (method === 'GET') {
            const query = parseListQuery<UserRow>(req);
            const items = await controller.getAll(query);
            return json200({ items });
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.create(
                body as Parameters<UserController['create']>[0],
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
            if (!item) return json404Entity('User');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.update(
                id as UUID,
                body as Parameters<UserController['update']>[1],
            );
            if (!item) return json404Entity('User');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete(id as UUID);
            if (deleted === 0) return json404Entity('User');
            return json200({ deleted });
        }

        return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
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
        if (!item) return json404Entity('User');
        return json200({ item });
    }

    if (tail.length === 2 && tail[1] === 'avatar') {
        if (method !== 'PATCH' && method !== 'PUT' && method !== 'POST') {
            return json405(['PATCH', 'PUT', 'POST', 'OPTIONS']);
        }

        const body = await readJsonRecord(req);
        if (!body) return json400('Invalid JSON body.');

        const value = body.avatarKey ?? body.avatar_key;
        if (!(typeof value === 'string' || value === null)) {
            return json400('avatarKey must be a string or null.');
        }

        const item = await controller.setAvatarKey(id as UUID, value);
        if (!item) return json404Entity('User');
        return json200({ item });
    }

    return json404Api();
}

async function dispatchNotificationsRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = new NotificationController(services);
    const method = req.method.toUpperCase();

    if (tail.length === 0) {
        if (method === 'GET') {
            return json200({
                service: 'notifications',
                routes: {
                    create: 'POST /api/notifications',
                    broadcast: 'POST /api/notifications/broadcast',
                    getById: 'GET /api/notifications/:id',
                    update: 'PATCH|PUT /api/notifications/:id',
                    remove: 'DELETE /api/notifications/:id',
                    markAsRead: 'PATCH|POST /api/notifications/:id/read',
                    listByUser: 'GET /api/notifications/user/:userId',
                    listUnread: 'GET /api/notifications/user/:userId/unread?limit=50',
                    listByType:
                        'GET /api/notifications/user/:userId/type/:type',
                    markAllAsRead:
                        'PATCH|POST /api/notifications/user/:userId/read-all',
                },
            });
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.create(
                body as Parameters<NotificationController['create']>[0],
            );
            return json201({ item });
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    // /api/notifications/broadcast
    if (tail.length === 1 && tail[0] === 'broadcast') {
        if (method !== 'POST') return json405(['POST', 'OPTIONS']);

        const body = await readJsonRecord(req);
        if (!body) return json400('Invalid JSON body.');

        const userIdsRaw = body.userIds;
        const payloadRaw = body.payload;

        if (!Array.isArray(userIdsRaw) || userIdsRaw.length === 0) {
            return json400('userIds must be a non-empty string array.');
        }

        const userIds = userIdsRaw
            .filter((v): v is string => typeof v === 'string')
            .map((v) => v.trim())
            .filter((v) => v.length > 0);

        if (userIds.length === 0) {
            return json400('userIds must contain at least one valid user id.');
        }

        if (!isRecord(payloadRaw)) {
            return json400('payload must be an object.');
        }

        const items = await controller.broadcast(
            userIds as UUID[],
            payloadRaw as Parameters<NotificationController['broadcast']>[1],
        );
        return json201({ items, count: items.length });
    }

    // /api/notifications/user/:userId[...]
    if (tail[0] === 'user') {
        const userId = tail[1];
        if (!userId) return json400('userId is required.');

        if (tail.length === 2) {
            if (method !== 'GET') return json405(['GET', 'OPTIONS']);

            const query = parseListQuery<
                Parameters<NotificationController['getAllByUser']>[1] extends infer Q
                ? Q extends object
                ? Q
                : Record<string, never>
                : Record<string, never>
            >(req);

            const items = await controller.getAllByUser(
                userId as UUID,
                omitWhere(query) as Parameters<
                    NotificationController['getAllByUser']
                >[1],
            );
            return json200({ items });
        }

        if (tail.length === 3 && tail[2] === 'unread') {
            if (method !== 'GET') return json405(['GET', 'OPTIONS']);

            const limit = parsePositiveInt(req.nextUrl.searchParams.get('limit')) ?? 50;
            const items = await controller.getUnread(userId as UUID, limit);
            return json200({ items });
        }

        if (tail.length === 3 && tail[2] === 'read-all') {
            if (method !== 'PATCH' && method !== 'POST') {
                return json405(['PATCH', 'POST', 'OPTIONS']);
            }

            const body = await readJsonRecord(req);
            const readAt = body ? parseReadAt(body) : undefined;
            const updated = await controller.markAllAsRead(userId as UUID, readAt);
            return json200({ updated });
        }

        if (tail.length === 4 && tail[2] === 'type') {
            if (method !== 'GET') return json405(['GET', 'OPTIONS']);

            const type = toNotificationType(tail[3]);
            if (!type) {
                return json400(
                    `Invalid notification type. Allowed: ${NOTIFICATION_TYPES.join(', ')}`,
                );
            }

            const query = parseListQuery<
                Parameters<NotificationController['getByType']>[2] extends infer Q
                ? Q extends object
                ? Q
                : Record<string, never>
                : Record<string, never>
            >(req);

            const items = await controller.getByType(
                userId as UUID,
                type,
                omitWhere(query) as Parameters<NotificationController['getByType']>[2],
            );
            return json200({ items });
        }

        return json404Api();
    }

    // /api/notifications/:id
    const id = tail[0];
    if (!id) return json404Api();

    if (tail.length === 1) {
        if (method === 'GET') {
            const item = await controller.getById(id as UUID);
            if (!item) return json404Entity('Notification');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.update(
                id as UUID,
                body as Parameters<NotificationController['update']>[1],
            );
            if (!item) return json404Entity('Notification');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete(id as UUID);
            if (deleted === 0) return json404Entity('Notification');
            return json200({ deleted });
        }

        return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
    }

    if (tail.length === 2 && tail[1] === 'read') {
        if (method !== 'PATCH' && method !== 'POST') {
            return json405(['PATCH', 'POST', 'OPTIONS']);
        }

        const body = await readJsonRecord(req);
        const readAt = body ? parseReadAt(body) : undefined;

        const item = await controller.markAsRead(id as UUID, readAt);
        if (!item) return json404Entity('Notification');
        return json200({ item });
    }

    return json404Api();
}

async function dispatchEvaluationsRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = services.evaluations;
    const method = req.method.toUpperCase();

    if (tail.length === 0) {
        if (method === 'GET') {
            const query = parseListQuery<EvaluationRow>(req);
            const items = await controller.findMany(query);
            return json200({ items });
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.create(body as EvaluationInsert);
            return json201({ item });
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    // /api/evaluations/schedule/:scheduleId
    if (tail.length === 2 && tail[0] === 'schedule') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        const scheduleId = tail[1];
        if (!scheduleId) return json400('scheduleId is required.');

        const items = await controller.listBySchedule(scheduleId as UUID);
        return json200({ items });
    }

    // /api/evaluations/evaluator/:evaluatorId
    if (tail.length === 2 && tail[0] === 'evaluator') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        const evaluatorId = tail[1];
        if (!evaluatorId) return json400('evaluatorId is required.');

        const items = await controller.listByEvaluator(evaluatorId as UUID);
        return json200({ items });
    }

    const id = tail[0];
    if (!id) return json404Api();

    if (tail.length === 1) {
        if (method === 'GET') {
            const item = await controller.findById(id as UUID);
            if (!item) return json404Entity('Evaluation');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.updateOne({ id: id as UUID }, body as EvaluationPatch);
            if (!item) return json404Entity('Evaluation');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete({ id: id as UUID });
            if (deleted === 0) return json404Entity('Evaluation');
            return json200({ deleted });
        }

        return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
    }

    if (tail.length === 2 && tail[1] === 'status') {
        if (method !== 'PATCH' && method !== 'POST') {
            return json405(['PATCH', 'POST', 'OPTIONS']);
        }

        const body = await readJsonRecord(req);
        if (!body) return json400('Invalid JSON body.');

        const status = toEvaluationStatus(body.status);
        if (!status) {
            return json400('Invalid status. Provide a non-empty status string.');
        }

        const item = await controller.setStatus(id as UUID, status);
        if (!item) return json404Entity('Evaluation');
        return json200({ item });
    }

    if (tail.length === 2 && tail[1] === 'submit') {
        if (method !== 'PATCH' && method !== 'POST') {
            return json405(['PATCH', 'POST', 'OPTIONS']);
        }

        const body = await readJsonRecord(req);
        const submittedAt = body
            ? parseOptionalIsoDate(body.submittedAt ?? body.submitted_at)
            : undefined;

        const item = await controller.submit(id as UUID, submittedAt);
        if (!item) return json404Entity('Evaluation');
        return json200({ item });
    }

    if (tail.length === 2 && tail[1] === 'lock') {
        if (method !== 'PATCH' && method !== 'POST') {
            return json405(['PATCH', 'POST', 'OPTIONS']);
        }

        const body = await readJsonRecord(req);
        const lockedAt = body
            ? parseOptionalIsoDate(body.lockedAt ?? body.locked_at)
            : undefined;

        const item = await controller.lock(id as UUID, lockedAt);
        if (!item) return json404Entity('Evaluation');
        return json200({ item });
    }

    return json404Api();
}

async function enforceApiGuard(
    req: NextRequest,
    resource: ApiRoot,
    services: DatabaseServices,
    guard?: ApiGuardOptions,
): Promise<Response | null> {
    if (resource === 'root' || resource === 'auth') return null;

    const requireAuth = guard?.requireAuth ?? false;
    const requiredRoles = guard?.rolesByResource?.[resource];

    if (!requireAuth && !requiredRoles) {
        return null;
    }

    const middleware = createMiddlewareController(services, guard?.middleware);
    const auth = await middleware.resolve(req);

    if (!auth) {
        return middleware.unauthorized();
    }

    if (requiredRoles && !requiredRoles.includes(auth.user.role)) {
        return middleware.forbidden('Insufficient role.');
    }

    return null;
}

export async function dispatchApiRequest(
    req: NextRequest,
    ctx: AuthRouteContext,
    servicesResolver: () => Promise<DatabaseServices>,
    options: CreateApiRouteHandlersOptions,
): Promise<Response> {
    const method = req.method.toUpperCase();
    const slug = await resolveContextSlug(ctx);
    const segments = normalizeSegments(slug);

    // Legacy alias support:
    // /api/thesis/groups/* -> /api/thesis-groups/*
    const isThesisGroupsAlias =
        segments[0] === 'thesis' && segments[1] === 'groups';

    // New alias support:
    // /api/defense-schedule-panelists/*
    // /api/defense-schedule-panelist/*
    // /api/schedule-panelists/*
    // /api/schedule-panelist/*
    const isSchedulePanelistsAlias =
        segments[0] === 'defense-schedule-panelists' ||
        segments[0] === 'defense-schedule-panelist' ||
        segments[0] === 'schedule-panelists' ||
        segments[0] === 'schedule-panelist';

    if (isSchedulePanelistsAlias) {
        const services = await servicesResolver();
        const guardDenied = await enforceApiGuard(
            req,
            'defense-schedules',
            services,
            options.guard,
        );
        if (guardDenied) return guardDenied;

        return dispatchSchedulePanelistsRequest(req, segments.slice(1), services);
    }

    const root = isThesisGroupsAlias
        ? ('thesis-groups' as ApiRoot)
        : resolveApiRoot(segments[0]);

    if (!root) {
        return json404Api();
    }

    if (root === 'root') {
        if (method !== 'GET') {
            return json405(['GET', 'OPTIONS']);
        }

        return json200({
            service: 'api',
            routes: {
                auth: '/api/auth/*',
                admin: '/api/admin/*',
                student: '/api/student/*',
                staff: '/api/staff/*',
                panelist: '/api/panelist/*',
                users: '/api/users/*',
                notifications: '/api/notifications/*',
                evaluations: '/api/evaluations/*',
                defenseSchedules: '/api/defense-schedules/*',
                defenseSchedulePanelists: '/api/defense-schedule-panelists/*',
                rubricTemplates: '/api/rubric-templates/*',
                thesisGroups: '/api/thesis-groups/*',
                thesisLegacyGroups: '/api/thesis/groups/*',
                auditLogs: '/api/audit-logs/*',
            },
        });
    }

    if (root === 'auth') {
        const action = resolveAuthAction(segments.slice(1));
        return dispatchAuthRequest(req, action, servicesResolver, options.auth);
    }

    const services = await servicesResolver();
    const guardDenied = await enforceApiGuard(req, root, services, options.guard);
    if (guardDenied) return guardDenied;

    const tail = isThesisGroupsAlias ? segments.slice(2) : segments.slice(1);

    switch (root) {
        case 'admin':
            return dispatchAdminRequest(req, tail, services);

        case 'student':
            return dispatchStudentRequest(req, tail, services);

        case 'staff':
            return dispatchStaffRequest(req, tail, services);

        case 'panelist':
            return dispatchPanelistRequest(req, tail, services);

        case 'users':
            return dispatchUsersRequest(req, tail, services);

        case 'notifications':
            return dispatchNotificationsRequest(req, tail, services);

        case 'evaluations':
            return dispatchEvaluationsRequest(req, tail, services);

        case 'defense-schedules':
            return dispatchDefenseSchedulesRequest(req, tail, services);

        case 'rubric-templates':
            return dispatchRubricTemplatesRequest(req, tail, services);

        case 'thesis-groups':
            return dispatchThesisGroupsRequest(req, tail, services);

        case 'audit-logs':
            return dispatchAuditLogsRequest(req, tail, services);

        default:
            return json404Api();
    }
}
