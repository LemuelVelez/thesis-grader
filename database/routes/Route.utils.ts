import { NextRequest, NextResponse } from 'next/server';

import type { UpsertStudentProfileInput } from '../controllers/AdminController';
import { UserController } from '../controllers/UserController';
import {
    NOTIFICATION_TYPES,
    USER_STATUSES,
    type EvaluationStatus,
    type GroupMemberRow,
    type NotificationType,
    type StudentRow,
    type UserRow,
    type UserStatus,
    type UUID,
} from '../models/Model';
import type { DatabaseServices, ListQuery } from '../services/Services';

import type {
    ApiRoot,
    AuthAction,
    AuthRouteContext,
} from './Route.types';

export function normalizeSegment(value: string): string {
    return value.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

export function normalizeSegments(slug?: string[]): string[] {
    return (slug ?? []).map(normalizeSegment).filter(Boolean);
}

export async function resolveContextSlug(
    ctx?: AuthRouteContext,
): Promise<string[] | undefined> {
    const params = await ctx?.params;
    return params?.slug;
}

export function resolveAuthAction(slug?: string[]): AuthAction | null {
    if (!slug || slug.length === 0) return 'root';

    const normalized = slug.map(normalizeSegment).filter(Boolean).join('/');

    switch (normalized) {
        case 'root':
        case 'index':
            return 'root';

        case 'register':
            return 'register';

        case 'login':
        case 'sign-in':
        case 'signin':
            return 'login';

        case 'logout':
        case 'sign-out':
        case 'signout':
            return 'logout';

        case 'me':
        case 'profile':
        case 'session':
            return 'me';

        case 'refresh':
        case 'rotate':
        case 'refresh-token':
            return 'refresh';

        case 'forgot':
        case 'forgot-password':
        case 'forgotpassword':
        case 'forgot/password':
            return 'forgot-password';

        case 'reset':
        case 'reset-password':
        case 'resetpassword':
        case 'reset/password':
            return 'reset-password';

        default:
            return null;
    }
}

export function resolveApiRoot(segment: string | undefined): ApiRoot | null {
    if (!segment) return 'root';

    switch (segment) {
        case 'auth':
            return 'auth';

        case 'admin':
        case 'admins':
            return 'admin';

        case 'student':
        case 'students':
            return 'student';

        case 'staff':
            return 'staff';

        case 'panelist':
        case 'panelists':
            return 'panelist';

        case 'user':
        case 'users':
            return 'users';

        case 'notification':
        case 'notifications':
            return 'notifications';

        case 'evaluation':
        case 'evaluations':
            return 'evaluations';

        case 'defense-schedule':
        case 'defense-schedules':
        case 'defenses':
            return 'defense-schedules';

        case 'rubric-template':
        case 'rubric-templates':
        case 'rubrics':
            return 'rubric-templates';

        case 'thesis-group':
        case 'thesis-groups':
            return 'thesis-groups';

        case 'audit-log':
        case 'audit-logs':
            return 'audit-logs';

        default:
            return null;
    }
}

export function json405(allow: string[]): NextResponse {
    return NextResponse.json(
        { error: 'Method not allowed.' },
        {
            status: 405,
            headers: {
                Allow: allow.join(', '),
            },
        },
    );
}

export function json404Auth(): NextResponse {
    return NextResponse.json({ error: 'Auth route not found.' }, { status: 404 });
}

export function json404Api(): NextResponse {
    return NextResponse.json({ error: 'API route not found.' }, { status: 404 });
}

export function json404Entity(entity: string): NextResponse {
    return NextResponse.json({ error: `${entity} not found.` }, { status: 404 });
}

export function json400(message: string): NextResponse {
    return NextResponse.json({ error: message }, { status: 400 });
}

export function json200(payload: Record<string, unknown>): NextResponse {
    return NextResponse.json(payload, { status: 200 });
}

export function json201(payload: Record<string, unknown>): NextResponse {
    return NextResponse.json(payload, { status: 201 });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

export async function readJsonRecord(
    req: NextRequest,
): Promise<Record<string, unknown> | null> {
    try {
        const body = (await req.json()) as unknown;
        return isRecord(body) ? body : null;
    } catch {
        return null;
    }
}

export function parsePositiveInt(raw: string | null): number | undefined {
    if (!raw) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return undefined;
    if (!Number.isInteger(parsed)) return undefined;
    return parsed > 0 ? parsed : undefined;
}

export function parseNonNegativeInt(raw: string | null): number | undefined {
    if (!raw) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return undefined;
    if (!Number.isInteger(parsed)) return undefined;
    return parsed >= 0 ? parsed : undefined;
}

export function parseBoolean(raw: string | null): boolean | undefined {
    if (raw == null) return undefined;
    const normalized = raw.trim().toLowerCase();

    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;

    return undefined;
}

export function isUuidLike(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.trim(),
    );
}

export function parseListQuery<Row extends object>(req: NextRequest): ListQuery<Row> {
    const search = req.nextUrl.searchParams;
    const out: ListQuery<Row> = {};

    const limit = parsePositiveInt(search.get('limit'));
    if (limit !== undefined) out.limit = limit;

    const offset = parseNonNegativeInt(search.get('offset'));
    if (offset !== undefined) out.offset = offset;

    const directionRaw = search.get('orderDirection');
    if (directionRaw === 'asc' || directionRaw === 'desc') {
        out.orderDirection = directionRaw;
    }

    const orderByRaw = search.get('orderBy');
    if (orderByRaw && orderByRaw.trim().length > 0) {
        out.orderBy = orderByRaw as keyof Row;
    }

    const whereRaw = search.get('where');
    if (whereRaw) {
        try {
            const parsed = JSON.parse(whereRaw) as unknown;
            if (isRecord(parsed)) {
                out.where = parsed as Partial<Row>;
            }
        } catch {
            // ignore invalid where JSON
        }
    }

    return out;
}

export function omitWhere<Row extends object>(
    query: ListQuery<Row>,
): Omit<ListQuery<Row>, 'where'> {
    const { where: _where, ...rest } = query;
    return rest;
}

export function toUserStatus(value: unknown): UserStatus | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return (USER_STATUSES as readonly string[]).includes(normalized)
        ? (normalized as UserStatus)
        : null;
}

export function toNotificationType(value: unknown): NotificationType | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return (NOTIFICATION_TYPES as readonly string[]).includes(normalized)
        ? (normalized as NotificationType)
        : null;
}

export function toEvaluationStatus(value: unknown): EvaluationStatus | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    return normalized as EvaluationStatus;
}

export function parseReadAt(body: Record<string, unknown>): string | undefined {
    const readAt = body.readAt;
    if (typeof readAt === 'string' && readAt.trim().length > 0) {
        return readAt.trim();
    }
    return undefined;
}

export function parseOptionalIsoDate(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
    }
    return undefined;
}

export function toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function hasOwn(body: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(body, key);
}

function parseNullableProfileField(value: unknown): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function parseStudentProfileInput(
    body: Record<string, unknown> | null,
): UpsertStudentProfileInput {
    if (!body) return {};

    const out: UpsertStudentProfileInput = {};

    const hasProgram = hasOwn(body, 'program') || hasOwn(body, 'course');
    if (hasProgram) {
        const rawProgram = hasOwn(body, 'program') ? body.program : body.course;
        const program = parseNullableProfileField(rawProgram);
        if (program !== undefined) out.program = program;
    }

    if (hasOwn(body, 'section')) {
        const section = parseNullableProfileField(body.section);
        if (section !== undefined) out.section = section;
    }

    return out;
}

export function parseGroupMemberStudentIdFromBody(
    body: Record<string, unknown>,
): string | null {
    const candidates: unknown[] = [
        body.student_id,
        body.studentId,
        body.student_user_id,
        body.studentUserId,
        body.user_id,
        body.userId,
        body.member_id,
        body.memberId,
        body.id,
    ];

    for (const candidate of candidates) {
        const parsed = toNonEmptyString(candidate);
        if (parsed) return parsed;
    }

    return null;
}

export function hasExplicitLinkedStudentUserReference(
    body: Record<string, unknown>,
): boolean {
    const candidates: unknown[] = [
        body.user_id,
        body.userId,
        body.student_user_id,
        body.studentUserId,
        body.linked_user_id,
        body.linkedUserId,
    ];

    return candidates.some((candidate) => toNonEmptyString(candidate) !== null);
}

export function toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message.trim();
    }

    if (isRecord(error)) {
        const message = toNonEmptyString(error.message);
        if (message) return message;

        const detail = toNonEmptyString(error.detail);
        if (detail) return detail;
    }

    return 'Unknown error.';
}

function toErrorCode(error: unknown): string | null {
    if (!isRecord(error)) return null;
    const raw = error.code;
    if (typeof raw !== 'string') return null;
    const code = raw.trim();
    return code.length > 0 ? code : null;
}

export function isForeignKeyViolation(error: unknown): boolean {
    const code = toErrorCode(error);
    if (code === '23503') return true;

    const msg = toErrorMessage(error).toLowerCase();
    return msg.includes('foreign key');
}

export function isUniqueViolation(error: unknown): boolean {
    const code = toErrorCode(error);
    if (code === '23505') return true;

    const msg = toErrorMessage(error).toLowerCase();
    return msg.includes('duplicate key') || msg.includes('unique constraint');
}

export function isThesisGroupMembersSegment(value: string | undefined): boolean {
    if (!value) return false;
    return (
        value === 'members' ||
        value === 'member' ||
        value === 'group-members' ||
        value === 'group-member'
    );
}

function extractUuidFromText(value: string): string | null {
    const matches = value.match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
    );
    if (!matches || matches.length === 0) return null;
    return matches[matches.length - 1] ?? null;
}

function findGroupMemberByIdentifier(
    members: GroupMemberRow[],
    rawIdentifier: string,
): GroupMemberRow | null {
    let normalized = rawIdentifier.trim();

    try {
        normalized = decodeURIComponent(rawIdentifier).trim();
    } catch {
        // keep raw
    }

    if (!normalized) return null;

    const exact = members.find((member) => member.student_id === normalized);
    if (exact) return exact;

    const uuid = extractUuidFromText(normalized);
    if (!uuid) return null;

    const lower = uuid.toLowerCase();
    return (
        members.find((member) => member.student_id.toLowerCase() === lower) ?? null
    );
}

function decodeURIComponentSafe(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/**
 * Resolves incoming member/user identifiers to canonical users.id.
 * Uses UserController alias-aware lookup so non-canonical UUID aliases
 * from any client are normalized server-side before group_members writes.
 */
export async function resolveCanonicalUserForMember(
    services: DatabaseServices,
    candidateId: string,
): Promise<{
    canonicalId: string;
    user: UserRow | null;
    resolvedFromAlias: boolean;
}> {
    const normalized = candidateId.trim();

    if (!normalized) {
        return {
            canonicalId: normalized,
            user: null,
            resolvedFromAlias: false,
        };
    }

    const usersController = new UserController(services);

    let user: UserRow | null = null;
    try {
        user = await usersController.getById(normalized as UUID);
    } catch {
        user = null;
    }

    if (!user) {
        return {
            canonicalId: normalized,
            user: null,
            resolvedFromAlias: false,
        };
    }

    const canonicalId = user.id;
    return {
        canonicalId,
        user,
        resolvedFromAlias:
            canonicalId.toLowerCase() !== normalized.toLowerCase(),
    };
}

export async function findGroupMemberByIdentifierWithAliasFallback(
    members: GroupMemberRow[],
    rawIdentifier: string,
    services: DatabaseServices,
): Promise<GroupMemberRow | null> {
    const direct = findGroupMemberByIdentifier(members, rawIdentifier);
    if (direct) return direct;

    const decoded = decodeURIComponentSafe(rawIdentifier).trim();
    const uuid = extractUuidFromText(decoded);
    if (!uuid) return null;

    const resolved = await resolveCanonicalUserForMember(services, uuid);
    if (!resolved.user) return null;

    if (resolved.canonicalId.toLowerCase() === uuid.toLowerCase()) {
        return null;
    }

    return findGroupMemberByIdentifier(members, resolved.canonicalId);
}

/**
 * Runtime-safe user lookup.
 * Prevents response-shaping failures from crashing member create/update/list
 * when a resolver accidentally returns partial services.
 */
async function safeFindUserById(
    services: DatabaseServices,
    userId: string,
): Promise<UserRow | null> {
    const usersService = (services as Partial<DatabaseServices>).users;

    if (!usersService || typeof usersService.findById !== 'function') {
        return null;
    }

    try {
        return await usersService.findById(userId as UUID);
    } catch {
        return null;
    }
}

/**
 * Runtime-safe student profile lookup.
 * Returns null if the service is unavailable or throws.
 */
async function safeFindStudentProfileByUserId(
    services: DatabaseServices,
    userId: string,
): Promise<StudentRow | null> {
    const studentsService = (services as Partial<DatabaseServices>).students;

    if (!studentsService || typeof studentsService.findByUserId !== 'function') {
        return null;
    }

    try {
        return await studentsService.findByUserId(userId as UUID);
    } catch {
        return null;
    }
}

export async function buildGroupMemberResponse(
    member: GroupMemberRow,
    services: DatabaseServices,
): Promise<Record<string, unknown>> {
    const [user, studentProfile] = await Promise.all([
        safeFindUserById(services, member.student_id),
        safeFindStudentProfileByUserId(services, member.student_id),
    ]);

    return {
        id: member.student_id,
        member_id: member.student_id,
        group_id: member.group_id,
        student_id: member.student_id,
        user_id: member.student_id,
        linked_user_id: member.student_id,
        name: user?.name ?? null,
        email: user?.email ?? null,
        status: user?.status ?? null,
        program: studentProfile?.program ?? null,
        section: studentProfile?.section ?? null,
    };
}
