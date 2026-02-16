import { NextRequest, NextResponse } from 'next/server';

import { AdminController } from '../controllers/AdminController';
import {
    type DefenseScheduleInsert,
    type GroupMemberRow,
    type ThesisGroupInsert,
    type ThesisGroupPatch,
    type ThesisGroupRow,
    type UUID,
} from '../models/Model';
import type { DatabaseServices } from '../services/Services';
import {
    buildGroupMemberResponse,
    findGroupMemberByIdentifierWithAliasFallback,
    hasExplicitLinkedStudentUserReference,
    isForeignKeyViolation,
    isThesisGroupMembersSegment,
    isUniqueViolation,
    isUuidLike,
    json200,
    json201,
    json400,
    json404Api,
    json404Entity,
    json405,
    parseGroupMemberStudentIdFromBody,
    parseListQuery,
    parseStudentProfileInput,
    readJsonRecord,
    resolveCanonicalUserForMember,
    toErrorMessage,
} from './Route';

export interface DispatchThesisGroupsOptions {
    autoCreateMissingStudentProfile?: boolean;
}

interface GroupMembersServiceLike {
    listByGroup: (groupId: UUID) => Promise<GroupMemberRow[]>;
    create: (input: { group_id: UUID; student_id: UUID }) => Promise<GroupMemberRow>;
    removeMember: (groupId: UUID, studentId: UUID) => Promise<number>;
    updateOne?: (
        where: Partial<GroupMemberRow>,
        patch: Partial<GroupMemberRow>,
    ) => Promise<GroupMemberRow | null>;
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
            const adviserId = req.nextUrl.searchParams.get('adviserId') ?? req.nextUrl.searchParams.get('adviser_id');
            if (adviserId) {
                if (!isUuidLike(adviserId)) return json400('adviserId must be a valid UUID.');
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
        if (!adviserId || !isUuidLike(adviserId)) return json400('adviserId must be a valid UUID.');
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

        const membersController = services.group_members as unknown as GroupMembersServiceLike;

        if (tail.length === 2) {
            if (method === 'GET') {
                const rows = await membersController.listByGroup(id as UUID);
                const items = await Promise.all(rows.map((row) => buildGroupMemberResponse(row, services)));
                return json200({ items });
            }

            if (method === 'POST') {
                const body = await readJsonRecord(req);
                if (!body) return json400('Invalid JSON body.');

                const incomingStudentId = parseGroupMemberStudentIdFromBody(body);
                if (!incomingStudentId) return json400('studentId/userId is required.');
                if (!isUuidLike(incomingStudentId)) return json400('studentId/userId must be a valid UUID.');

                const requiresLinkedStudentUser = hasExplicitLinkedStudentUserReference(body);
                const resolvedStudent = await resolveCanonicalUserForMember(services, incomingStudentId);
                const canonicalStudentId = resolvedStudent.canonicalId;
                const studentUser = resolvedStudent.user;

                if (studentUser && studentUser.role !== 'student') return json400('Resolved user must have role "student".');
                if (requiresLinkedStudentUser && !studentUser) {
                    return json400('Linked student user was not found. Use a valid student user id or switch to manual entry.');
                }

                let studentProfile = studentUser
                    ? await services.students.findByUserId(canonicalStudentId as UUID).catch(() => null)
                    : null;

                if (studentUser && !studentProfile && options.autoCreateMissingStudentProfile) {
                    try {
                        const adminController = new AdminController(services);
                        const autoCreated = await adminController.upsertStudentProfileForUser(
                            canonicalStudentId as UUID,
                            parseStudentProfileInput(body),
                        );
                        if (!autoCreated) return json404Entity('Student user');
                        studentProfile = autoCreated.item;
                    } catch (error) {
                        return NextResponse.json(
                            {
                                error: 'Failed to create missing student profile before adding the member.',
                                message: toErrorMessage(error),
                            },
                            { status: 500 },
                        );
                    }
                }

                if (studentUser && !studentProfile) {
                    return json400('Selected student user does not have a student profile record. Create the student profile first, then add the member.');
                }

                const existingRows = await membersController.listByGroup(id as UUID);
                const existing = existingRows.find((row) => row.student_id.toLowerCase() === canonicalStudentId.toLowerCase());
                if (existing) return json200({ item: await buildGroupMemberResponse(existing, services) });

                let created: GroupMemberRow;
                try {
                    created = await membersController.create({
                        group_id: id as UUID,
                        student_id: canonicalStudentId as UUID,
                    });
                } catch (error) {
                    if (isUniqueViolation(error)) {
                        const rows = await membersController.listByGroup(id as UUID);
                        const duplicate = rows.find((row) => row.student_id.toLowerCase() === canonicalStudentId.toLowerCase());
                        if (duplicate) return json200({ item: await buildGroupMemberResponse(duplicate, services) });
                        return json400('Selected student is already a member of this thesis group.');
                    }

                    if (isForeignKeyViolation(error)) {
                        if (!studentUser) {
                            return json400('Manual entries are not supported by the current database schema. Please create/select a Student user first, then add that user as a member.');
                        }
                        if (!studentProfile) {
                            return json400('Selected student user does not have a student profile record. Create the student profile first, then add the member.');
                        }
                        return json400('Unable to add thesis group member because required student profile records are missing.');
                    }

                    return NextResponse.json(
                        { error: 'Failed to add thesis group member.', message: toErrorMessage(error) },
                        { status: 500 },
                    );
                }

                return json201({ item: await buildGroupMemberResponse(created, services) });
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
            if (method === 'GET') return json200({ item: await buildGroupMemberResponse(existingMember, services) });

            if (method === 'PATCH' || method === 'PUT') {
                const body = await readJsonRecord(req);
                if (!body) return json400('Invalid JSON body.');

                const incomingNextStudentId = parseGroupMemberStudentIdFromBody(body);
                if (!incomingNextStudentId) return json400('studentId/userId is required.');
                if (!isUuidLike(incomingNextStudentId)) return json400('studentId/userId must be a valid UUID.');

                const requiresLinkedStudentUser = hasExplicitLinkedStudentUserReference(body);
                const resolvedStudent = await resolveCanonicalUserForMember(services, incomingNextStudentId);
                const canonicalNextStudentId = resolvedStudent.canonicalId;
                const nextStudentUser = resolvedStudent.user;

                if (nextStudentUser && nextStudentUser.role !== 'student') {
                    return json400('Resolved user must have role "student".');
                }

                if (requiresLinkedStudentUser && !nextStudentUser) {
                    return json400('Linked student user was not found. Use a valid student user id or switch to manual entry.');
                }

                let nextStudentProfile = nextStudentUser
                    ? await services.students.findByUserId(canonicalNextStudentId as UUID).catch(() => null)
                    : null;

                if (nextStudentUser && !nextStudentProfile && options.autoCreateMissingStudentProfile) {
                    try {
                        const adminController = new AdminController(services);
                        const autoCreated = await adminController.upsertStudentProfileForUser(
                            canonicalNextStudentId as UUID,
                            parseStudentProfileInput(body),
                        );
                        if (!autoCreated) return json404Entity('Student user');
                        nextStudentProfile = autoCreated.item;
                    } catch (error) {
                        return NextResponse.json(
                            {
                                error: 'Failed to create missing student profile before updating the member.',
                                message: toErrorMessage(error),
                            },
                            { status: 500 },
                        );
                    }
                }

                if (nextStudentUser && !nextStudentProfile) {
                    return json400('Selected student user does not have a student profile record. Create the student profile first, then update the member.');
                }

                if (canonicalNextStudentId.toLowerCase() === existingMember.student_id.toLowerCase()) {
                    return json200({ item: await buildGroupMemberResponse(existingMember, services) });
                }

                const duplicate = groupMembers.find(
                    (row) =>
                        row.student_id.toLowerCase() === canonicalNextStudentId.toLowerCase() &&
                        row.student_id.toLowerCase() !== existingMember.student_id.toLowerCase(),
                );
                if (duplicate) return json400('Selected student is already a member of this thesis group.');

                const where: Partial<GroupMemberRow> = {
                    group_id: id as UUID,
                    student_id: existingMember.student_id as UUID,
                };
                const patch: Partial<GroupMemberRow> = {
                    student_id: canonicalNextStudentId as UUID,
                };

                if (typeof membersController.updateOne === 'function') {
                    try {
                        const updated = await membersController.updateOne(where, patch);
                        if (!updated) return json404Entity('Thesis group member');
                        return json200({ item: await buildGroupMemberResponse(updated, services) });
                    } catch (error) {
                        if (isUniqueViolation(error)) {
                            return json400('Selected student is already a member of this thesis group.');
                        }

                        if (isForeignKeyViolation(error)) {
                            if (!nextStudentUser) {
                                return json400(
                                    'Manual entries are not supported by the current database schema. Please create/select a Student user first, then assign that user as a member.',
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
                            { error: 'Failed to update thesis group member.', message: toErrorMessage(error) },
                            { status: 500 },
                        );
                    }
                }

                try {
                    const created = await membersController.create({
                        group_id: id as UUID,
                        student_id: canonicalNextStudentId as UUID,
                    });

                    const removed = await membersController.removeMember(id as UUID, existingMember.student_id as UUID);
                    if (removed === 0) {
                        try {
                            await membersController.removeMember(id as UUID, canonicalNextStudentId as UUID);
                        } catch {
                            // no-op best effort rollback
                        }
                        return NextResponse.json(
                            {
                                error: 'Failed to update thesis group member.',
                                message:
                                    'Could not remove the previous member after creating the replacement entry.',
                            },
                            { status: 500 },
                        );
                    }

                    return json200({ item: await buildGroupMemberResponse(created, services) });
                } catch (error) {
                    if (isUniqueViolation(error)) {
                        return json400('Selected student is already a member of this thesis group.');
                    }

                    if (isForeignKeyViolation(error)) {
                        if (!nextStudentUser) {
                            return json400(
                                'Manual entries are not supported by the current database schema. Please create/select a Student user first, then assign that user as a member.',
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
                        { error: 'Failed to update thesis group member.', message: toErrorMessage(error) },
                        { status: 500 },
                    );
                }
            }

            if (method === 'DELETE') {
                const deleted = await membersController.removeMember(id as UUID, existingMember.student_id as UUID);
                if (deleted === 0) return json404Entity('Thesis group member');
                return json200({ deleted });
            }

            return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
        }

        return json404Api();
    }

    if (tail[1] === 'schedules' || tail[1] === 'defense-schedules') {
        const group = await controller.findById(id as UUID);
        if (!group) return json404Entity('Thesis group');

        const schedulesController = services.defense_schedules;
        if (tail.length === 2) {
            if (method === 'GET') return json200({ items: await schedulesController.listByGroup(id as UUID) });
            if (method === 'POST') {
                const body = await readJsonRecord(req);
                if (!body) return json400('Invalid JSON body.');
                const payload: DefenseScheduleInsert = { ...(body as DefenseScheduleInsert), group_id: id as UUID };
                return json201({ item: await schedulesController.create(payload) });
            }
            return json405(['GET', 'POST', 'OPTIONS']);
        }
    }

    return json404Api();
}
