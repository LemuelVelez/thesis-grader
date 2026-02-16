import { NextRequest, NextResponse } from 'next/server';

import { AdminController } from '../controllers/AdminController';
import {
    type DefenseScheduleInsert,
    type DefenseSchedulePatch,
    type DefenseScheduleRow,
    type SchedulePanelistInsert,
    type SchedulePanelistRow,
    type UserRow,
    type UUID,
} from '../models/Model';
import type { DatabaseServices } from '../services/Services';
import {
    isForeignKeyViolation,
    isUniqueViolation,
    isUuidLike,
    json200,
    json201,
    json400,
    json404Api,
    json404Entity,
    json405,
    parseListQuery,
    readJsonRecord,
    toErrorMessage,
} from './Route';

export interface DispatchSchedulePanelistsOptions {
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

interface SchedulePanelistUserView {
    id: UUID;
    user_id: UUID;
    staff_id: UUID;
    name: string | null;
    email: string | null;
    role: UserRow['role'] | null;
    status: UserRow['status'] | null;
}

type SchedulePanelistResponseItem = SchedulePanelistRow & SchedulePanelistUserView;

type DefenseScheduleWithOptionalMeta = DefenseScheduleRow &
    Partial<{
        group_title: string | null;
        rubric_template_name: string | null;
        created_by_name: string | null;
        created_by_email: string | null;
    }>;

type DefenseScheduleResponseItem = DefenseScheduleWithOptionalMeta & {
    panelists: SchedulePanelistUserView[];
    schedule_panelists: SchedulePanelistUserView[];
    panelist_count: number;
};

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

function parseSchedulePanelistStaffIdsFromBody(body: Record<string, unknown>): string[] {
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
    if (typeof service.listBySchedule === 'function') return service.listBySchedule(scheduleId);

    if (typeof service.findMany === 'function') {
        const rows = await service.findMany({ where: { schedule_id: scheduleId } });
        return Array.isArray(rows) ? rows : [];
    }

    throw new Error('Schedule panelists service does not support listing by schedule.');
}

async function listSchedulePanelistsByStaff(
    service: SchedulePanelistsServiceLike,
    staffId: UUID,
): Promise<SchedulePanelistRow[]> {
    if (typeof service.listByStaff === 'function') return service.listByStaff(staffId);

    if (typeof service.findMany === 'function') {
        const rows = await service.findMany({ where: { staff_id: staffId } });
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
    if (typeof service.removeMember === 'function') return service.removeMember(scheduleId, staffId);
    if (typeof service.delete === 'function') {
        return service.delete({ schedule_id: scheduleId, staff_id: staffId });
    }
    throw new Error('Schedule panelists service does not support delete/remove.');
}

async function resolveUserByIdCached(
    services: DatabaseServices,
    userId: UUID,
    cache: Map<string, UserRow | null>,
): Promise<UserRow | null> {
    const key = userId.toLowerCase();
    if (cache.has(key)) return cache.get(key) ?? null;

    try {
        const user = await services.users.findById(userId);
        cache.set(key, user ?? null);
        return user ?? null;
    } catch {
        cache.set(key, null);
        return null;
    }
}

function toPanelistUserView(row: SchedulePanelistRow, user: UserRow | null): SchedulePanelistUserView {
    return {
        id: row.staff_id,
        user_id: row.staff_id,
        staff_id: row.staff_id,
        name: user?.name ?? null,
        email: user?.email ?? null,
        role: user?.role ?? null,
        status: user?.status ?? null,
    };
}

async function enrichSchedulePanelistRows(
    rows: SchedulePanelistRow[],
    services: DatabaseServices,
    cache: Map<string, UserRow | null> = new Map<string, UserRow | null>(),
): Promise<SchedulePanelistResponseItem[]> {
    const uniqueIds = Array.from(new Set(rows.map((row) => row.staff_id.toLowerCase())));

    await Promise.all(
        uniqueIds.map(async (lowerId) => {
            const rawId = rows.find((row) => row.staff_id.toLowerCase() === lowerId)?.staff_id;
            if (!rawId) return;
            await resolveUserByIdCached(services, rawId as UUID, cache);
        }),
    );

    return rows.map((row) => {
        const user = cache.get(row.staff_id.toLowerCase()) ?? null;
        const extra = toPanelistUserView(row, user);
        return { ...row, ...extra };
    });
}

async function withSchedulePanelistsMany<T extends DefenseScheduleWithOptionalMeta>(
    schedules: T[],
    services: DatabaseServices,
): Promise<Array<T & Pick<DefenseScheduleResponseItem, 'panelists' | 'schedule_panelists' | 'panelist_count'>>> {
    if (schedules.length === 0) return [];

    const schedulePanelistsService = services.schedule_panelists as unknown as SchedulePanelistsServiceLike;
    const scheduleRowsById = new Map<string, SchedulePanelistRow[]>();

    await Promise.all(
        schedules.map(async (schedule) => {
            try {
                const rows = await listSchedulePanelistsBySchedule(schedulePanelistsService, schedule.id);
                scheduleRowsById.set(schedule.id.toLowerCase(), rows);
            } catch {
                scheduleRowsById.set(schedule.id.toLowerCase(), []);
            }
        }),
    );

    const userCache = new Map<string, UserRow | null>();
    const uniqueStaffIds = new Set<string>();

    for (const rows of scheduleRowsById.values()) {
        for (const row of rows) uniqueStaffIds.add(row.staff_id.toLowerCase());
    }

    await Promise.all(
        Array.from(uniqueStaffIds).map(async (lowerId) => {
            const anyRow = Array.from(scheduleRowsById.values())
                .flat()
                .find((row) => row.staff_id.toLowerCase() === lowerId);
            if (!anyRow) return;
            await resolveUserByIdCached(services, anyRow.staff_id as UUID, userCache);
        }),
    );

    return schedules.map((schedule) => {
        const rows = scheduleRowsById.get(schedule.id.toLowerCase()) ?? [];
        const panelists = rows.map((row) =>
            toPanelistUserView(row, userCache.get(row.staff_id.toLowerCase()) ?? null),
        );
        return {
            ...schedule,
            panelists,
            schedule_panelists: panelists,
            panelist_count: panelists.length,
        };
    });
}

async function withSchedulePanelists<T extends DefenseScheduleWithOptionalMeta>(
    schedule: T,
    services: DatabaseServices,
): Promise<T & Pick<DefenseScheduleResponseItem, 'panelists' | 'schedule_panelists' | 'panelist_count'>> {
    const [item] = await withSchedulePanelistsMany([schedule], services);
    return item ?? { ...schedule, panelists: [], schedule_panelists: [], panelist_count: 0 };
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
    const userCache = new Map<string, UserRow | null>();

    const enrichMany = async (rows: SchedulePanelistRow[]): Promise<SchedulePanelistResponseItem[]> =>
        enrichSchedulePanelistRows(rows, services, userCache);

    const enrichOne = async (row: SchedulePanelistRow | null): Promise<SchedulePanelistResponseItem | null> => {
        if (!row) return null;
        const [item] = await enrichMany([row]);
        return item ?? null;
    };

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

    const getExistingByComposite = async (scheduleId: UUID, staffId: UUID): Promise<SchedulePanelistRow | null> => {
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
    ): Promise<{ items: SchedulePanelistRow[]; createdCount: number; existingCount: number }> => {
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

    const resolveScheduleIdFromBody = (body: Record<string, unknown>): string | null => {
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

    const handleCreateForSchedule = async (scheduleId: UUID, body: Record<string, unknown>): Promise<Response> => {
        const staffIds = parseSchedulePanelistStaffIdsFromBody(body);

        if (staffIds.length === 0) {
            return json400('staffId/panelistId is required. You may also provide staffIds/panelistIds array.');
        }

        for (const staffId of staffIds) {
            if (!isUuidLike(staffId)) return json400(`Invalid staff/panelist id: ${staffId}`);
        }

        const allUsersExist = await Promise.all(staffIds.map((id) => ensureUserExists(id as UUID)));
        const missingIndex = allUsersExist.findIndex((exists) => !exists);
        if (missingIndex >= 0) return json400(`User not found for staff/panelist id: ${staffIds[missingIndex]}`);

        try {
            const { items, createdCount, existingCount } = await createAssignments(scheduleId, staffIds as UUID[]);
            const enrichedItems = await enrichMany(items);

            const payload: Record<string, unknown> = {
                message:
                    createdCount > 0
                        ? `Assigned ${createdCount} panelist(s) to this defense schedule.${existingCount > 0 ? ` ${existingCount} assignment(s) already existed.` : ''
                        }`
                        : 'All provided panelists are already assigned to this defense schedule.',
                createdCount,
                existingCount,
            };

            if (enrichedItems.length === 1) payload.item = enrichedItems[0];
            else payload.items = enrichedItems;

            return NextResponse.json(payload, { status: createdCount > 0 ? 201 : 200 });
        } catch (error) {
            return NextResponse.json(
                { error: 'Failed to assign schedule panelists.', message: toErrorMessage(error) },
                { status: 500 },
            );
        }
    };

    if (forcedScheduleId) {
        if (tail.length === 0) {
            if (method === 'GET') {
                try {
                    const items = await listSchedulePanelistsBySchedule(service, forcedScheduleId);
                    const enriched = await enrichMany(items);
                    return json200({ items: enriched });
                } catch (error) {
                    return NextResponse.json(
                        { error: 'Failed to fetch schedule panelists.', message: toErrorMessage(error) },
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
        if (!staffId || !isUuidLike(staffId)) return json404Api();

        if (tail.length === 1) {
            if (method === 'GET') {
                try {
                    const item = await getExistingByComposite(forcedScheduleId, staffId as UUID);
                    if (!item) return json404Entity('Defense schedule panelist');
                    const enriched = await enrichOne(item);
                    return json200({ item: enriched ?? item });
                } catch (error) {
                    return NextResponse.json(
                        { error: 'Failed to fetch defense schedule panelist.', message: toErrorMessage(error) },
                        { status: 500 },
                    );
                }
            }

            if (method === 'DELETE') {
                try {
                    const deleted = await deleteSchedulePanelist(service, forcedScheduleId, staffId as UUID);
                    if (deleted === 0) return json404Entity('Defense schedule panelist');
                    return json200({ deleted });
                } catch (error) {
                    return NextResponse.json(
                        { error: 'Failed to remove defense schedule panelist.', message: toErrorMessage(error) },
                        { status: 500 },
                    );
                }
            }

            return json405(['GET', 'DELETE', 'OPTIONS']);
        }

        return json404Api();
    }

    if (tail.length === 0) {
        if (method === 'GET') {
            const scheduleIdQuery =
                req.nextUrl.searchParams.get('scheduleId') ?? req.nextUrl.searchParams.get('schedule_id');
            const staffIdQuery =
                req.nextUrl.searchParams.get('staffId') ??
                req.nextUrl.searchParams.get('staff_id') ??
                req.nextUrl.searchParams.get('panelistId') ??
                req.nextUrl.searchParams.get('panelist_id');

            if (scheduleIdQuery) {
                if (!isUuidLike(scheduleIdQuery)) return json400('scheduleId must be a valid UUID.');
                try {
                    const items = await listSchedulePanelistsBySchedule(service, scheduleIdQuery as UUID);
                    const enriched = await enrichMany(items);
                    return json200({ items: enriched });
                } catch (error) {
                    return NextResponse.json(
                        { error: 'Failed to fetch schedule panelists.', message: toErrorMessage(error) },
                        { status: 500 },
                    );
                }
            }

            if (staffIdQuery) {
                if (!isUuidLike(staffIdQuery)) return json400('staffId/panelistId must be a valid UUID.');
                try {
                    const items = await listSchedulePanelistsByStaff(service, staffIdQuery as UUID);
                    const enriched = await enrichMany(items);
                    return json200({ items: enriched });
                } catch (error) {
                    return NextResponse.json(
                        { error: 'Failed to fetch panelist schedules.', message: toErrorMessage(error) },
                        { status: 500 },
                    );
                }
            }

            if (typeof service.findMany === 'function') {
                try {
                    const items = await service.findMany(parseListQuery<SchedulePanelistRow>(req));
                    const rows = Array.isArray(items) ? items : [];
                    const enriched = await enrichMany(rows);
                    return json200({ items: enriched });
                } catch (error) {
                    return NextResponse.json(
                        { error: 'Failed to fetch schedule panelists.', message: toErrorMessage(error) },
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
            if (!scheduleIdRaw) return json400('scheduleId is required.');
            if (!isUuidLike(scheduleIdRaw)) return json400('scheduleId must be a valid UUID.');

            const exists = await ensureScheduleExists(scheduleIdRaw as UUID);
            if (!exists) return json404Entity('Defense schedule');

            return handleCreateForSchedule(scheduleIdRaw as UUID, body);
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    if (tail.length === 1 && isUuidLike(tail[0])) {
        const scheduleId = tail[0] as UUID;

        if (method === 'GET') {
            try {
                const items = await listSchedulePanelistsBySchedule(service, scheduleId);
                const enriched = await enrichMany(items);
                return json200({ items: enriched });
            } catch (error) {
                return NextResponse.json(
                    { error: 'Failed to fetch schedule panelists.', message: toErrorMessage(error) },
                    { status: 500 },
                );
            }
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const exists = await ensureScheduleExists(scheduleId);
            if (!exists) return json404Entity('Defense schedule');

            return handleCreateForSchedule(scheduleId, body);
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    if (tail.length === 2 && (tail[0] === 'schedule' || tail[0] === 'defense-schedule')) {
        const scheduleId = tail[1];
        if (!scheduleId || !isUuidLike(scheduleId)) return json400('scheduleId must be a valid UUID.');
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        try {
            const items = await listSchedulePanelistsBySchedule(service, scheduleId as UUID);
            const enriched = await enrichMany(items);
            return json200({ items: enriched });
        } catch (error) {
            return NextResponse.json(
                { error: 'Failed to fetch schedule panelists.', message: toErrorMessage(error) },
                { status: 500 },
            );
        }
    }

    if (tail.length === 2 && (tail[0] === 'staff' || tail[0] === 'panelist')) {
        const staffId = tail[1];
        if (!staffId || !isUuidLike(staffId)) return json400('staffId/panelistId must be a valid UUID.');
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        try {
            const items = await listSchedulePanelistsByStaff(service, staffId as UUID);
            const enriched = await enrichMany(items);
            return json200({ items: enriched });
        } catch (error) {
            return NextResponse.json(
                { error: 'Failed to fetch panelist schedules.', message: toErrorMessage(error) },
                { status: 500 },
            );
        }
    }

    if (tail.length === 2 && isUuidLike(tail[0]) && isUuidLike(tail[1])) {
        const scheduleId = tail[0] as UUID;
        const staffId = tail[1] as UUID;

        if (method === 'GET') {
            try {
                const item = await getExistingByComposite(scheduleId, staffId);
                if (!item) return json404Entity('Defense schedule panelist');
                const enriched = await enrichOne(item);
                return json200({ item: enriched ?? item });
            } catch (error) {
                return NextResponse.json(
                    { error: 'Failed to fetch defense schedule panelist.', message: toErrorMessage(error) },
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
                    { error: 'Failed to remove defense schedule panelist.', message: toErrorMessage(error) },
                    { status: 500 },
                );
            }
        }

        return json405(['GET', 'DELETE', 'OPTIONS']);
    }

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
                const enriched = await enrichOne(item);
                return json200({ item: enriched ?? item });
            } catch (error) {
                return NextResponse.json(
                    { error: 'Failed to fetch defense schedule panelist.', message: toErrorMessage(error) },
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
                    { error: 'Failed to remove defense schedule panelist.', message: toErrorMessage(error) },
                    { status: 500 },
                );
            }
        }

        return json405(['GET', 'DELETE', 'OPTIONS']);
    }

    return json404Api();
}

export async function dispatchDefenseSchedulesRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = services.defense_schedules;
    const adminController = new AdminController(services);
    const method = req.method.toUpperCase();

    const enrichOne = async (item: DefenseScheduleWithOptionalMeta | null): Promise<DefenseScheduleResponseItem | null> =>
        item ? withSchedulePanelists(item, services) : null;
    const enrichMany = async (items: DefenseScheduleWithOptionalMeta[]): Promise<DefenseScheduleResponseItem[]> =>
        withSchedulePanelistsMany(items, services);

    if (tail.length === 0) {
        if (method === 'GET') {
            const groupId = req.nextUrl.searchParams.get('groupId') ?? req.nextUrl.searchParams.get('group_id');
            const panelistId =
                req.nextUrl.searchParams.get('panelistId') ??
                req.nextUrl.searchParams.get('panelist_id') ??
                req.nextUrl.searchParams.get('staffId') ??
                req.nextUrl.searchParams.get('staff_id');

            if (groupId) {
                if (!isUuidLike(groupId)) return json400('groupId must be a valid UUID.');
                return json200({
                    items: await enrichMany(await adminController.getDefenseSchedulesByGroupDetailed(groupId as UUID)),
                });
            }

            if (panelistId) {
                if (!isUuidLike(panelistId)) return json400('panelistId/staffId must be a valid UUID.');
                return json200({
                    items: await enrichMany(
                        await adminController.getDefenseSchedulesByPanelistDetailed(panelistId as UUID),
                    ),
                });
            }

            const query = parseListQuery<DefenseScheduleRow>(req);
            return json200({ items: await enrichMany(await adminController.getDefenseSchedulesDetailed(query)) });
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');
            const item = await adminController.createDefenseScheduleDetailed(body as DefenseScheduleInsert);
            const enriched = await enrichOne(item);
            return json201({ item: enriched ?? item });
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    const id = tail[0];
    if (!id || !isUuidLike(id)) return json404Api();

    if (tail.length >= 2 && isDefenseSchedulePanelistsSegment(tail[1])) {
        const existing = await controller.findById(id as UUID);
        if (!existing) return json404Entity('Defense schedule');
        return dispatchSchedulePanelistsRequest(req, tail.slice(2), services, { forcedScheduleId: id as UUID });
    }

    if (tail.length === 1) {
        if (method === 'GET') {
            const item = await adminController.getDefenseScheduleDetailed(id as UUID);
            if (!item) return json404Entity('Defense schedule');
            const enriched = await enrichOne(item);
            return json200({ item: enriched ?? item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.updateOne({ id: id as UUID }, body as DefenseSchedulePatch);
            if (!item) return json404Entity('Defense schedule');

            const detailed = await adminController.getDefenseScheduleDetailed(id as UUID);
            const enriched = await enrichOne(detailed ?? (item as DefenseScheduleWithOptionalMeta));
            return json200({ item: enriched ?? item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete({ id: id as UUID });
            if (deleted === 0) return json404Entity('Defense schedule');
            return json200({ deleted });
        }

        return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
    }

    return json404Api();
}

/**
 * Backward-compatible exports so existing imports from AdminRouteV2
 * continue to work while logic is split across V3/V4.
 */
export { dispatchThesisGroupsRequest } from './AdminRouteV3';
export { dispatchRubricTemplatesRequest, dispatchAuditLogsRequest } from './AdminRouteV4';
