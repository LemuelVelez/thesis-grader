import { NextRequest, NextResponse } from 'next/server';

import { AdminController } from '../controllers/AdminController';
import { NOTIFICATION_TYPES, USER_STATUSES, type AuditLogInsert, type AuditLogPatch, type AuditLogRow, type DefenseScheduleInsert, type DefenseSchedulePatch, type DefenseScheduleRow, type GroupMemberRow, type RubricTemplateInsert, type RubricTemplatePatch, type RubricTemplateRow, type SchedulePanelistInsert, type SchedulePanelistRow, type ThesisGroupInsert, type ThesisGroupPatch, type ThesisGroupRow, type UserRow, type UUID } from '../models/Model';
import type { DatabaseServices } from '../services/Services';
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
    json404Entity,
    json405,
    omitWhere,
    parseBoolean,
    parseGroupMemberStudentIdFromBody,
    parseListQuery,
    parseOptionalIsoDate,
    parsePositiveInt,
    parseStudentProfileInput,
    readJsonRecord,
    resolveCanonicalUserForMember,
    toErrorMessage,
    toUserStatus,
} from './Route';

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
            where: { schedule_id: scheduleId },
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
            where: { staff_id: staffId },
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

export async function dispatchSchedulePanelistsRequest(
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

export async function dispatchThesisGroupsRequest(
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

export async function dispatchDefenseSchedulesRequest(
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

    if (tail.length === 2 && tail[0] === 'group') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        const groupId = tail[1];
        if (!groupId || !isUuidLike(groupId)) {
            return json400('groupId must be a valid UUID.');
        }

        const items = await controller.listByGroup(groupId as UUID);
        return json200({ items });
    }

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

export async function dispatchRubricTemplatesRequest(
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

    if (tail.length === 1 && tail[0] === 'active') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);
        const items = await controller.listActive();
        return json200({ items });
    }

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

export async function dispatchAuditLogsRequest(
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

    if (tail.length === 2 && tail[0] === 'actor') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);
        const actorId = tail[1];
        if (!actorId || !isUuidLike(actorId)) {
            return json400('actorId must be a valid UUID.');
        }

        const items = await controller.listByActor(actorId as UUID);
        return json200({ items });
    }

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
