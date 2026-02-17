/**
 * Centralized route utilities + API dispatcher.
 * Only role-specific dispatchers are split into:
 * - AdminRoute.ts
 * - StudentRoute.ts
 * - StaffRoute.ts
 * - PanelistRoute.ts
 */

import { NextRequest, NextResponse } from 'next/server';

import type { UpsertStudentProfileInput } from '../controllers/AdminController';
import {
    createAuthController,
    type AuthControllerOptions,
} from '../controllers/AuthController';
import { createCorsController, type CorsOptions } from '../controllers/Cors';
import {
    createMiddlewareController,
    type MiddlewareOptions,
} from '../controllers/Middleware';
import { NotificationController } from '../controllers/NotificationController';
import { UserController } from '../controllers/UserController';
import {
    NOTIFICATION_TYPES,
    STUDENT_EVAL_STATUSES,
    USER_STATUSES,
    type EvaluationInsert,
    type EvaluationPatch,
    type EvaluationRow,
    type EvaluationScoreInsert,
    type EvaluationScorePatch,
    type EvaluationScoreRow,
    type EvaluationStatus,
    type GroupMemberInsert,
    type GroupMemberRow,
    type JsonObject,
    type JsonValue,
    type NotificationType,
    type RubricCriteriaInsert,
    type RubricCriteriaPatch,
    type RubricCriteriaRow,
    type StudentEvalStatus,
    type StudentRow,
    type ThesisRole,
    type UserRow,
    type UserStatus,
    type UUID,
} from '../models/Model';
import type { DatabaseServices, ListQuery } from '../services/Services';

import { dispatchAdminRequest } from './AdminRoute';
import {
    dispatchDefenseSchedulesRequest,
    dispatchSchedulePanelistsRequest,
} from './AdminRouteV2';
import { dispatchThesisGroupsRequest } from './AdminRouteV3';
import {
    dispatchAuditLogsRequest,
    dispatchRubricTemplatesRequest,
} from './AdminRouteV4';
import { dispatchPanelistRequest } from './PanelistRoute';
import { dispatchStaffRequest } from './StaffRoute';
import { dispatchStudentRequest } from './StudentRoute';

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

export type DatabaseServicesResolver =
    | (() => DatabaseServices | Promise<DatabaseServices>)
    | null;

export interface AuthRouteParams {
    slug?: string[];
}

/**
 * Next.js App Router context compatibility:
 * - { params: Promise<{ slug?: string[] }> }
 * - { params: { slug?: string[] } }
 */
export type AuthRouteParamsLike = AuthRouteParams | Promise<AuthRouteParams>;

export interface AuthRouteContext {
    params?: AuthRouteParamsLike;
}

export type AuthRouteHandler = (
    req: NextRequest,
    ctx: AuthRouteContext,
) => Promise<Response>;

export type AuthAction =
    | 'root'
    | 'register'
    | 'login'
    | 'logout'
    | 'me'
    | 'refresh'
    | 'forgot-password'
    | 'reset-password';

export type ApiResource =
    | 'admin'
    | 'student'
    | 'staff'
    | 'panelist'
    | 'users'
    | 'notifications'
    | 'evaluations'
    | 'evaluation-scores'
    | 'student-evaluations'
    | 'defense-schedules'
    | 'rubric-templates'
    | 'rubric-criteria'
    | 'criteria'
    | 'rubric-template-criteria'
    | 'thesis-groups'
    | 'group-members'
    | 'audit-logs';

export type ApiRoot = 'root' | 'auth' | ApiResource;

export interface CreateAuthRouteHandlersOptions {
    resolveServices?: DatabaseServicesResolver;
    auth?: AuthControllerOptions;
    cors?: CorsOptions;
    onError?: (
        error: unknown,
        req: NextRequest,
        ctx: AuthRouteContext,
    ) => Promise<Response> | Response;
}

export interface ApiGuardOptions {
    requireAuth?: boolean;
    rolesByResource?: Partial<Record<ApiResource, readonly ThesisRole[]>>;
    middleware?: MiddlewareOptions;
}

export interface CreateApiRouteHandlersOptions
    extends CreateAuthRouteHandlersOptions {
    guard?: ApiGuardOptions;
}

/* -------------------------------------------------------------------------- */
/*                             Services Resolver                              */
/* -------------------------------------------------------------------------- */

declare global {
    // eslint-disable-next-line no-var
    var __thesisGraderDbServices: DatabaseServices | undefined;
    // eslint-disable-next-line no-var
    var __thesisGraderDbServicesResolver:
        | (() => DatabaseServices | Promise<DatabaseServices>)
        | undefined;
}

let moduleResolver: DatabaseServicesResolver = null;

export function setDatabaseServicesResolver(
    resolver: () => DatabaseServices | Promise<DatabaseServices>,
): void {
    moduleResolver = resolver;
}

export function clearDatabaseServicesResolver(): void {
    moduleResolver = null;
}

export async function defaultResolveDatabaseServices(): Promise<DatabaseServices> {
    if (moduleResolver) {
        return await moduleResolver();
    }

    if (globalThis.__thesisGraderDbServicesResolver) {
        return await globalThis.__thesisGraderDbServicesResolver();
    }

    if (globalThis.__thesisGraderDbServices) {
        return globalThis.__thesisGraderDbServices;
    }

    throw new Error(
        'DatabaseServices resolver is not configured. ' +
        'Call setDatabaseServicesResolver(...) or set globalThis.__thesisGraderDbServices.',
    );
}

/* -------------------------------------------------------------------------- */
/*                               Shared Utilities                             */
/* -------------------------------------------------------------------------- */

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

        case 'evaluation-score':
        case 'evaluation-scores':
            return 'evaluation-scores';

        case 'student-evaluation':
        case 'student-evaluations':
        case 'student-evals':
            return 'student-evaluations';

        case 'defense-schedule':
        case 'defense-schedules':
        case 'defenses':
            return 'defense-schedules';

        case 'rubric-template':
        case 'rubric-templates':
        case 'rubrics':
            return 'rubric-templates';

        case 'rubric-criteria':
        case 'rubric-criterion':
            return 'rubric-criteria';

        case 'criteria':
            return 'criteria';

        case 'rubric-template-criteria':
        case 'rubric-template-criterion':
        case 'template-criteria':
        case 'template-criterion':
            return 'rubric-template-criteria';

        case 'thesis-group':
        case 'thesis-groups':
        case 'group':
        case 'groups':
            return 'thesis-groups';

        case 'group-member':
        case 'group-members':
            return 'group-members';

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

function toJsonValue(value: unknown): JsonValue {
    if (value === null) return null;

    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value.map((item) => toJsonValue(item));
    }

    if (isRecord(value)) {
        const out: JsonObject = {};
        for (const [key, val] of Object.entries(value)) {
            out[key] = toJsonValue(val);
        }
        return out;
    }

    return null;
}

function toJsonObject(value: unknown): JsonObject {
    if (!isRecord(value)) return {};
    const out: JsonObject = {};
    for (const [key, val] of Object.entries(value)) {
        out[key] = toJsonValue(val);
    }
    return out;
}

function parseUuidArray(value: unknown): UUID[] {
    if (!Array.isArray(value)) return [];

    const seen = new Set<string>();
    const out: UUID[] = [];

    for (const item of value) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        if (!isUuidLike(trimmed)) continue;

        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        out.push(trimmed as UUID);
    }

    return out;
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
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return undefined;
    return parsed > 0 ? parsed : undefined;
}

export function parseNonNegativeInt(raw: string | null): number | undefined {
    if (!raw) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return undefined;
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
            // ignore invalid JSON
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

export function toStudentEvalStatus(value: unknown): StudentEvalStatus | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return (STUDENT_EVAL_STATUSES as readonly string[]).includes(normalized)
        ? (normalized as StudentEvalStatus)
        : null;
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

/* -------------------------------------------------------------------------- */
/*                             Core Route Dispatch                            */
/* -------------------------------------------------------------------------- */

async function dispatchAuthRequest(
    req: NextRequest,
    action: AuthAction | null,
    servicesResolver: () => Promise<DatabaseServices>,
    authOptions?: AuthControllerOptions,
): Promise<Response> {
    if (!action) return json404Auth();

    const method = req.method.toUpperCase();

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

    // NEW: /api/users/me and /api/users/me/avatar
    if (tail[0] === 'me') {
        const middleware = createMiddlewareController(services);
        const auth = await middleware.resolve(req);
        if (!auth) return middleware.unauthorized();

        const id = auth.user.id as UUID;

        if (tail.length === 1) {
            if (method === 'GET') {
                const item = await controller.getById(id);
                if (!item) return json404Entity('User');
                return json200({ item });
            }

            if (method === 'PATCH' || method === 'PUT') {
                const body = await readJsonRecord(req);
                if (!body) return json400('Invalid JSON body.');

                const item = await controller.update(
                    id,
                    body as Parameters<UserController['update']>[1],
                );
                if (!item) return json404Entity('User');
                return json200({ item });
            }

            return json405(['GET', 'PATCH', 'PUT', 'OPTIONS']);
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

            const item = await controller.setAvatarKey(id, value);
            if (!item) return json404Entity('User');
            return json200({ item });
        }

        return json404Api();
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
                    autoOptions: 'GET /api/notifications/auto/options?limit=30',
                    autoDispatch: 'POST /api/notifications/auto/send',
                    pushPublicKey: 'GET /api/notifications/push/public-key',
                    pushSubscribe: 'POST /api/notifications/push/subscriptions',
                    pushUnsubscribe: 'DELETE /api/notifications/push/subscriptions',
                    pushSend: 'POST /api/notifications/push/send',
                    getById: 'GET /api/notifications/:id',
                    update: 'PATCH|PUT /api/notifications/:id',
                    remove: 'DELETE /api/notifications/:id',
                    markAsRead: 'PATCH|POST /api/notifications/:id/read',
                    listByUser: 'GET /api/notifications/user/:userId',
                    listUnread: 'GET /api/notifications/user/:userId/unread?limit=50',
                    listByType: 'GET /api/notifications/user/:userId/type/:type',
                    markAllAsRead: 'PATCH|POST /api/notifications/user/:userId/read-all',
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

    if (tail[0] === 'auto') {
        const isOptionsPath = tail.length === 1 || (tail.length === 2 && tail[1] === 'options');
        const isSendPath = tail.length === 1 || (tail.length === 2 && tail[1] === 'send');

        if (isOptionsPath && method === 'GET') {
            const limit = parsePositiveInt(req.nextUrl.searchParams.get('limit')) ?? 30;
            const item = await controller.getAutomationOptions(limit);
            return json200({ item });
        }

        if (isSendPath && method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            try {
                const result = await controller.dispatchAutomaticFromSelection(body);
                return NextResponse.json(result, { status: 201 });
            } catch (error) {
                return json400(toErrorMessage(error));
            }
        }

        if (isOptionsPath || isSendPath) {
            return json405(['GET', 'POST', 'OPTIONS']);
        }

        return json404Api();
    }

    /* ----------------------------- PUSH ENDPOINTS ---------------------------- */

    if (tail[0] === 'push') {
        if (tail.length === 1) {
            if (method !== 'GET') return json405(['GET', 'OPTIONS']);
            return json200({
                service: 'notifications.push',
                routes: {
                    publicKey: 'GET /api/notifications/push/public-key',
                    subscribe: 'POST /api/notifications/push/subscriptions',
                    unsubscribe: 'DELETE /api/notifications/push/subscriptions',
                    send: 'POST /api/notifications/push/send',
                },
            });
        }

        if (tail.length === 2 && tail[1] === 'public-key') {
            if (method !== 'GET') return json405(['GET', 'OPTIONS']);
            const item = await controller.getPushPublicKey();
            return json200({ item });
        }

        if (tail.length === 2 && tail[1] === 'subscriptions') {
            if (method === 'POST') {
                const body = await readJsonRecord(req);
                if (!body) return json400('Invalid JSON body.');

                try {
                    const item = await controller.registerPushSubscription(body);
                    return json201({ item });
                } catch (error) {
                    return json400(toErrorMessage(error));
                }
            }

            if (method === 'DELETE') {
                const body = await readJsonRecord(req);
                if (!body) return json400('Invalid JSON body.');

                try {
                    const result = await controller.unregisterPushSubscription(body);
                    return json200({ deleted: result.deleted });
                } catch (error) {
                    return json400(toErrorMessage(error));
                }
            }

            return json405(['POST', 'DELETE', 'OPTIONS']);
        }

        if (tail.length === 2 && (tail[1] === 'send' || tail[1] === 'dispatch')) {
            if (method !== 'POST') return json405(['POST', 'OPTIONS']);

            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const userIds = parseUuidArray(body.userIds);

            if (userIds.length === 0) {
                return json400('userIds must be a non-empty UUID string array.');
            }

            const payloadNode = isRecord(body.payload) ? body.payload : body;

            const title = toNonEmptyString(payloadNode.title) ?? 'New notification';
            const messageBody =
                toNonEmptyString(payloadNode.body) ?? 'You have a new update.';

            const typeRaw = toNonEmptyString(payloadNode.type);
            const typeParsed = typeRaw ? toNotificationType(typeRaw) : 'general';
            if (typeRaw && !typeParsed) {
                return json400(
                    `Invalid notification type. Allowed: ${NOTIFICATION_TYPES.join(', ')}`,
                );
            }

            const data = toJsonObject(payloadNode.data);

            try {
                const item = await controller.sendPushToUsers(userIds, {
                    type: typeParsed ?? 'general',
                    title,
                    body: messageBody,
                    data,
                });
                return json200({ item });
            } catch (error) {
                return json400(toErrorMessage(error));
            }
        }

        return json404Api();
    }

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
                omitWhere(query) as Parameters<NotificationController['getAllByUser']>[1],
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

/* ---------------------------- Evaluation Scores ---------------------------- */

type EvaluationScoresControllerLike = {
    findMany?: (query: ListQuery<Record<string, unknown>>) => Promise<unknown[]>;
    create?: (input: EvaluationScoreInsert | Record<string, unknown>) => Promise<unknown>;
    updateOne?: (
        where: Record<string, unknown>,
        patch: EvaluationScorePatch | Record<string, unknown>,
    ) => Promise<unknown | null>;
    delete?: (where: Record<string, unknown>) => Promise<number>;
    listByEvaluation?: (evaluationId: UUID) => Promise<unknown[]>;
};

function resolveEvaluationScoresController(
    services: DatabaseServices,
): EvaluationScoresControllerLike | null {
    if ((services as Partial<DatabaseServices>).evaluation_scores) {
        return (services as Partial<DatabaseServices>)
            .evaluation_scores as unknown as EvaluationScoresControllerLike;
    }

    const maybeCamel = (
        services as unknown as {
            evaluationScores?: EvaluationScoresControllerLike;
        }
    ).evaluationScores;
    if (maybeCamel) return maybeCamel;

    try {
        const viaRegistry = services.get('evaluation_scores');
        if (viaRegistry) {
            return viaRegistry as unknown as EvaluationScoresControllerLike;
        }
    } catch {
        // no-op
    }

    return null;
}

function normalizeEvaluationScorePayload(
    body: Record<string, unknown>,
    scopedEvaluationId?: UUID,
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...body };

    const evalCandidates: unknown[] = [
        scopedEvaluationId,
        body.evaluation_id,
        body.evaluationId,
        body.eval_id,
        body.evalId,
    ];

    for (const c of evalCandidates) {
        const parsed = toNonEmptyString(c);
        if (parsed && isUuidLike(parsed)) {
            out.evaluation_id = parsed;
            break;
        }
    }

    const criterionCandidates: unknown[] = [
        body.criterion_id,
        body.criterionId,
        body.criteria_id,
        body.criteriaId,
        body.rubric_criterion_id,
        body.rubricCriterionId,
    ];

    for (const c of criterionCandidates) {
        const parsed = toNonEmptyString(c);
        if (parsed && isUuidLike(parsed)) {
            out.criterion_id = parsed;
            break;
        }
    }

    const scoreRaw = body.score;
    if (typeof scoreRaw === 'string' && scoreRaw.trim().length > 0) {
        const parsed = Number(scoreRaw);
        if (Number.isFinite(parsed)) out.score = parsed;
    } else if (typeof scoreRaw === 'number' && Number.isFinite(scoreRaw)) {
        out.score = scoreRaw;
    }

    const commentRaw = body.comment;
    if (commentRaw === null || typeof commentRaw === 'string') {
        out.comment = commentRaw;
    }

    return out;
}

async function upsertEvaluationScore(
    controller: EvaluationScoresControllerLike,
    payload: Record<string, unknown>,
): Promise<{ item: unknown; created: boolean }> {
    const evaluationId = toNonEmptyString(payload.evaluation_id);
    const criterionId = toNonEmptyString(payload.criterion_id);

    if (!evaluationId || !criterionId) {
        throw new Error('evaluation_id and criterion_id are required.');
    }

    const where = {
        evaluation_id: evaluationId,
        criterion_id: criterionId,
    };

    if (typeof controller.updateOne === 'function') {
        const updated = await controller.updateOne(where, payload);
        if (updated) return { item: updated, created: false };
    }

    if (typeof controller.create === 'function') {
        try {
            const created = await controller.create(payload);
            return { item: created, created: true };
        } catch (error) {
            if (isUniqueViolation(error) && typeof controller.updateOne === 'function') {
                const updated = await controller.updateOne(where, payload);
                if (updated) return { item: updated, created: false };
            }
            throw error;
        }
    }

    throw new Error('Evaluation scores service is unavailable.');
}

async function listEvaluationScores(
    controller: EvaluationScoresControllerLike,
    req: NextRequest,
    scopedEvaluationId?: UUID,
): Promise<unknown[]> {
    const search = req.nextUrl.searchParams;
    const evaluationIdRaw = scopedEvaluationId ?? (search.get('evaluation_id') ?? search.get('evaluationId') ?? undefined);
    const evaluationId = evaluationIdRaw && isUuidLike(evaluationIdRaw) ? (evaluationIdRaw as UUID) : undefined;
    const criterionRaw = toNonEmptyString(search.get('criterion_id') ?? search.get('criterionId'));
    const criterionId = criterionRaw && isUuidLike(criterionRaw) ? criterionRaw : undefined;

    if (evaluationId && typeof controller.listByEvaluation === 'function' && !criterionId) {
        return await controller.listByEvaluation(evaluationId);
    }

    if (typeof controller.findMany !== 'function') {
        throw new Error('Evaluation scores list endpoint is unavailable.');
    }

    const query = parseListQuery<Record<string, unknown>>(req);
    const where = (isRecord(query.where) ? { ...query.where } : {}) as Record<string, unknown>;

    if (evaluationId) where.evaluation_id = evaluationId;
    if (criterionId) where.criterion_id = criterionId;

    const merged: ListQuery<Record<string, unknown>> = {
        ...query,
        where,
    };

    return await controller.findMany(merged);
}

async function dispatchEvaluationScoresRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
    scopedEvaluationId?: UUID,
): Promise<Response> {
    const controller = resolveEvaluationScoresController(services);
    if (!controller) return json404Api();

    const method = req.method.toUpperCase();

    if (tail.length === 0) {
        if (method === 'GET') {
            const items = await listEvaluationScores(controller, req, scopedEvaluationId);
            return json200({ items });
        }

        if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const scoresNode = body.scores;
            if (Array.isArray(scoresNode)) {
                const items: unknown[] = [];
                const errors: Array<{ index: number; message: string }> = [];

                for (let i = 0; i < scoresNode.length; i += 1) {
                    const node = scoresNode[i];
                    if (!isRecord(node)) {
                        errors.push({ index: i, message: 'Invalid score payload object.' });
                        continue;
                    }

                    try {
                        const payload = normalizeEvaluationScorePayload(node, scopedEvaluationId);
                        const evaluationId = toNonEmptyString(payload.evaluation_id);
                        const criterionId = toNonEmptyString(payload.criterion_id);
                        const score = payload.score;

                        if (!evaluationId || !criterionId) {
                            errors.push({
                                index: i,
                                message: 'evaluation_id and criterion_id are required.',
                            });
                            continue;
                        }

                        if (typeof score !== 'number' || !Number.isFinite(score)) {
                            errors.push({ index: i, message: 'score must be a finite number.' });
                            continue;
                        }

                        const saved = await upsertEvaluationScore(controller, payload);
                        items.push(saved.item);
                    } catch (error) {
                        errors.push({ index: i, message: toErrorMessage(error) });
                    }
                }

                return NextResponse.json(
                    {
                        items,
                        saved: items.length,
                        failed: errors.length,
                        errors,
                    },
                    { status: errors.length > 0 ? 207 : 200 },
                );
            }

            const payload = normalizeEvaluationScorePayload(body, scopedEvaluationId);
            const evaluationId = toNonEmptyString(payload.evaluation_id);
            const criterionId = toNonEmptyString(payload.criterion_id);
            const score = payload.score;

            if (!evaluationId || !criterionId) {
                return json400('evaluation_id and criterion_id are required.');
            }
            if (typeof score !== 'number' || !Number.isFinite(score)) {
                return json400('score must be a finite number.');
            }

            try {
                const result = await upsertEvaluationScore(controller, payload);
                return result.created ? json201({ item: result.item }) : json200({ item: result.item });
            } catch (error) {
                return json400(toErrorMessage(error));
            }
        }

        if (method === 'DELETE') {
            if (typeof controller.delete !== 'function') return json404Api();

            const search = req.nextUrl.searchParams;
            const evaluationId = toNonEmptyString(
                scopedEvaluationId ?? search.get('evaluation_id') ?? search.get('evaluationId'),
            );
            const criterionId = toNonEmptyString(
                search.get('criterion_id') ?? search.get('criterionId'),
            );

            if (!evaluationId || !criterionId) {
                return json400('evaluation_id and criterion_id are required for delete.');
            }

            const deleted = await controller.delete({
                evaluation_id: evaluationId,
                criterion_id: criterionId,
            });
            return json200({ deleted });
        }

        return json405(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
    }

    // /api/evaluation-scores/:criterionId (with scoped evaluation id)
    if (tail.length === 1 && scopedEvaluationId) {
        const criterionId = tail[0];
        if (!criterionId || !isUuidLike(criterionId)) return json404Api();

        if (method === 'GET') {
            if (typeof controller.findMany !== 'function') return json404Api();

            const items = await controller.findMany({
                where: {
                    evaluation_id: scopedEvaluationId,
                    criterion_id: criterionId as UUID,
                },
                limit: 1,
            } as ListQuery<Record<string, unknown>>);

            const item = items[0] ?? null;
            if (!item) return json404Entity('Evaluation score');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT' || method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const payload = normalizeEvaluationScorePayload(
                { ...body, criterion_id: criterionId },
                scopedEvaluationId,
            );

            const score = payload.score;
            if (typeof score !== 'number' || !Number.isFinite(score)) {
                return json400('score must be a finite number.');
            }

            try {
                const result = await upsertEvaluationScore(controller, payload);
                return result.created ? json201({ item: result.item }) : json200({ item: result.item });
            } catch (error) {
                return json400(toErrorMessage(error));
            }
        }

        if (method === 'DELETE') {
            if (typeof controller.delete !== 'function') return json404Api();

            const deleted = await controller.delete({
                evaluation_id: scopedEvaluationId,
                criterion_id: criterionId as UUID,
            });
            return json200({ deleted });
        }

        return json405(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
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

    if (tail.length === 2 && tail[0] === 'schedule') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        const scheduleId = tail[1];
        if (!scheduleId) return json400('scheduleId is required.');

        const items = await controller.listBySchedule(scheduleId as UUID);
        return json200({ items });
    }

    if (tail.length === 2 && tail[0] === 'evaluator') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        const evaluatorId = tail[1];
        if (!evaluatorId) return json400('evaluatorId is required.');

        const items = await controller.listByEvaluator(evaluatorId as UUID);
        return json200({ items });
    }

    const id = tail[0];
    if (!id) return json404Api();

    // NEW: /api/evaluations/:id/scores and /api/evaluations/:id/scores/:criterionId
    if (tail.length >= 2 && tail[1] === 'scores') {
        if (!isUuidLike(id)) return json404Api();
        return dispatchEvaluationScoresRequest(req, tail.slice(2), services, id as UUID);
    }

    if (tail.length === 1) {
        if (method === 'GET') {
            const item = await controller.findById(id as UUID);
            if (!item) return json404Entity('Evaluation');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.updateOne(
                { id: id as UUID },
                body as EvaluationPatch,
            );
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

/* ------------------------------- Group Members ---------------------------- */

type GroupMembersControllerLike = {
    findMany?: (query: ListQuery<Record<string, unknown>>) => Promise<unknown[]>;
    create?: (input: GroupMemberInsert | Record<string, unknown>) => Promise<unknown>;
    delete?: (where: Record<string, unknown>) => Promise<number>;
    listByGroup?: (groupId: UUID) => Promise<GroupMemberRow[]>;
};

function resolveGroupMembersController(
    services: DatabaseServices,
): GroupMembersControllerLike | null {
    if ((services as Partial<DatabaseServices>).group_members) {
        return (services as Partial<DatabaseServices>)
            .group_members as unknown as GroupMembersControllerLike;
    }

    const maybeCamel = (
        services as unknown as {
            groupMembers?: GroupMembersControllerLike;
        }
    ).groupMembers;
    if (maybeCamel) return maybeCamel;

    try {
        const viaRegistry = services.get('group_members');
        if (viaRegistry) {
            return viaRegistry as unknown as GroupMembersControllerLike;
        }
    } catch {
        // no-op
    }

    return null;
}

function parseGroupIdFromBody(body: Record<string, unknown>): string | null {
    const candidates: unknown[] = [
        body.group_id,
        body.groupId,
        body.thesis_group_id,
        body.thesisGroupId,
    ];

    for (const c of candidates) {
        const parsed = toNonEmptyString(c);
        if (parsed) return parsed;
    }

    return null;
}

async function dispatchGroupMembersRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = resolveGroupMembersController(services);
    if (!controller) return json404Api();

    const method = req.method.toUpperCase();

    if (tail.length === 0) {
        if (method === 'GET') {
            const search = req.nextUrl.searchParams;
            const groupIdRaw = toNonEmptyString(search.get('group_id') ?? search.get('groupId'));

            let members: unknown[] = [];

            if (groupIdRaw && !isUuidLike(groupIdRaw)) {
                return json400('group_id must be a valid UUID.');
            }

            if (groupIdRaw && typeof controller.listByGroup === 'function') {
                members = await controller.listByGroup(groupIdRaw as UUID);
            } else if (typeof controller.findMany === 'function') {
                const query = parseListQuery<Record<string, unknown>>(req);
                const where = (isRecord(query.where) ? { ...query.where } : {}) as Record<string, unknown>;
                if (groupIdRaw) where.group_id = groupIdRaw;

                members = await controller.findMany({
                    ...query,
                    where,
                });
            } else {
                return json404Api();
            }

            const items = await Promise.all(
                members.map(async (item) => {
                    if (
                        isRecord(item) &&
                        typeof item.group_id === 'string' &&
                        typeof item.student_id === 'string'
                    ) {
                        return await buildGroupMemberResponse(item as GroupMemberRow, services);
                    }
                    return item;
                }),
            );

            return json200({ items });
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const groupId = parseGroupIdFromBody(body);
            const studentId = parseGroupMemberStudentIdFromBody(body);

            if (!groupId || !isUuidLike(groupId)) {
                return json400('group_id is required and must be a valid UUID.');
            }

            if (!studentId || !isUuidLike(studentId)) {
                return json400('student_id is required and must be a valid UUID.');
            }

            if (typeof controller.create !== 'function') return json404Api();

            const item = await controller.create({
                group_id: groupId,
                student_id: studentId,
            });

            return json201({ item });
        }

        if (method === 'DELETE') {
            if (typeof controller.delete !== 'function') return json404Api();

            const search = req.nextUrl.searchParams;
            const groupId = toNonEmptyString(search.get('group_id') ?? search.get('groupId'));
            const studentId = toNonEmptyString(search.get('student_id') ?? search.get('studentId'));

            if (!groupId || !isUuidLike(groupId)) {
                return json400('group_id is required and must be a valid UUID.');
            }

            if (!studentId || !isUuidLike(studentId)) {
                return json400('student_id is required and must be a valid UUID.');
            }

            const deleted = await controller.delete({
                group_id: groupId,
                student_id: studentId,
            });

            return json200({ deleted });
        }

        return json405(['GET', 'POST', 'DELETE', 'OPTIONS']);
    }

    return json404Api();
}

/* ----------------------------- Rubric Criteria ---------------------------- */

type RubricCriteriaControllerLike = {
    findMany?: (query: ListQuery<Record<string, unknown>>) => Promise<unknown[]>;
    create?: (input: RubricCriteriaInsert | Record<string, unknown>) => Promise<unknown>;
    findById?: (id: UUID) => Promise<unknown | null>;
    updateOne?: (
        where: Record<string, unknown>,
        patch: RubricCriteriaPatch | Record<string, unknown>,
    ) => Promise<unknown | null>;
    delete?: (where: Record<string, unknown>) => Promise<number>;
    listByTemplate?: (templateId: UUID) => Promise<unknown[]>;
};

function resolveRubricCriteriaController(
    services: DatabaseServices,
): RubricCriteriaControllerLike | null {
    if ((services as Partial<DatabaseServices>).rubric_criteria) {
        return (services as Partial<DatabaseServices>)
            .rubric_criteria as unknown as RubricCriteriaControllerLike;
    }

    const maybeCamel = (
        services as unknown as {
            rubricCriteria?: RubricCriteriaControllerLike;
        }
    ).rubricCriteria;
    if (maybeCamel) return maybeCamel;

    try {
        const viaRegistry = services.get('rubric_criteria');
        if (viaRegistry) {
            return viaRegistry as unknown as RubricCriteriaControllerLike;
        }
    } catch {
        // no-op
    }

    return null;
}

function normalizeRubricCriteriaPayload(
    body: Record<string, unknown>,
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...body };

    const templateIdCandidates: unknown[] = [
        body.template_id,
        body.templateId,
        body.rubric_template_id,
        body.rubricTemplateId,
    ];

    for (const c of templateIdCandidates) {
        const parsed = toNonEmptyString(c);
        if (parsed && isUuidLike(parsed)) {
            out.template_id = parsed;
            break;
        }
    }

    if (typeof body.criterion === 'string') {
        out.criterion = body.criterion.trim();
    }

    if (typeof body.description === 'string') {
        out.description = body.description.trim();
    } else if (body.description === null) {
        out.description = null;
    }

    if (typeof body.weight === 'string') {
        const num = Number(body.weight);
        if (Number.isFinite(num)) out.weight = num;
    } else if (typeof body.weight === 'number' && Number.isFinite(body.weight)) {
        out.weight = body.weight;
    }

    if (typeof body.min_score === 'string') {
        const num = Number(body.min_score);
        if (Number.isFinite(num)) out.min_score = num;
    } else if (typeof body.min_score === 'number' && Number.isFinite(body.min_score)) {
        out.min_score = body.min_score;
    }

    if (typeof body.max_score === 'string') {
        const num = Number(body.max_score);
        if (Number.isFinite(num)) out.max_score = num;
    } else if (typeof body.max_score === 'number' && Number.isFinite(body.max_score)) {
        out.max_score = body.max_score;
    }

    return out;
}

async function dispatchRubricCriteriaAliasesRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = resolveRubricCriteriaController(services);
    if (!controller) return json404Api();

    const method = req.method.toUpperCase();

    if (tail.length === 0) {
        if (method === 'GET') {
            const search = req.nextUrl.searchParams;
            const templateIdRaw = toNonEmptyString(
                search.get('template_id') ?? search.get('templateId') ?? search.get('rubric_template_id'),
            );

            if (templateIdRaw && !isUuidLike(templateIdRaw)) {
                return json400('template_id must be a valid UUID.');
            }

            if (templateIdRaw && typeof controller.listByTemplate === 'function') {
                const items = await controller.listByTemplate(templateIdRaw as UUID);
                return json200({ items });
            }

            if (typeof controller.findMany !== 'function') return json404Api();

            const query = parseListQuery<RubricCriteriaRow>(req) as ListQuery<Record<string, unknown>>;
            const where = (isRecord(query.where) ? { ...query.where } : {}) as Record<string, unknown>;

            if (templateIdRaw) where.template_id = templateIdRaw;

            const items = await controller.findMany({
                ...query,
                where,
            });

            return json200({ items });
        }

        if (method === 'POST') {
            if (typeof controller.create !== 'function') return json404Api();

            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const payload = normalizeRubricCriteriaPayload(body);
            const templateId = toNonEmptyString(payload.template_id);
            const criterion = toNonEmptyString(payload.criterion);

            if (!templateId || !isUuidLike(templateId)) {
                return json400('template_id is required and must be a valid UUID.');
            }

            if (!criterion) {
                return json400('criterion is required.');
            }

            const item = await controller.create(payload);
            return json201({ item });
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    const id = tail[0];
    if (!id || !isUuidLike(id)) return json404Api();

    if (tail.length === 1) {
        if (method === 'GET') {
            if (typeof controller.findById === 'function') {
                const item = await controller.findById(id as UUID);
                if (!item) return json404Entity('Rubric criterion');
                return json200({ item });
            }

            if (typeof controller.findMany !== 'function') return json404Api();

            const items = await controller.findMany({
                where: { id: id as UUID },
                limit: 1,
            } as ListQuery<Record<string, unknown>>);

            const item = items[0] ?? null;
            if (!item) return json404Entity('Rubric criterion');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            if (typeof controller.updateOne !== 'function') return json404Api();

            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const payload = normalizeRubricCriteriaPayload(body);
            const item = await controller.updateOne({ id: id as UUID }, payload);
            if (!item) return json404Entity('Rubric criterion');
            return json200({ item });
        }

        if (method === 'DELETE') {
            if (typeof controller.delete !== 'function') return json404Api();

            const deleted = await controller.delete({ id: id as UUID });
            if (deleted === 0) return json404Entity('Rubric criterion');
            return json200({ deleted });
        }

        return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
    }

    return json404Api();
}

/* ------------------------ Student Evaluations Routes ----------------------- */
/* Student evaluations are intentionally separate from panelist evaluations.   */

type StudentEvaluationsControllerLike = {
    findMany?: (query: ListQuery<Record<string, unknown>>) => Promise<unknown[]>;
    create?: (input: Record<string, unknown>) => Promise<unknown>;
    findById?: (id: UUID) => Promise<unknown | null>;
    updateOne?: (
        where: { id: UUID },
        patch: Record<string, unknown>,
    ) => Promise<unknown | null>;
    delete?: (where: { id: UUID }) => Promise<number>;
    setStatus?: (
        id: UUID,
        status: StudentEvalStatus | string,
    ) => Promise<unknown | null>;
    submit?: (id: UUID, submittedAt?: string) => Promise<unknown | null>;
    lock?: (id: UUID, lockedAt?: string) => Promise<unknown | null>;
    listBySchedule?: (scheduleId: UUID) => Promise<unknown[]>;
    listByStudent?: (studentId: UUID) => Promise<unknown[]>;
    listByEvaluator?: (evaluatorId: UUID) => Promise<unknown[]>;
};

function resolveStudentEvaluationsController(
    services: DatabaseServices,
): StudentEvaluationsControllerLike | null {
    // Primary: canonical snake_case service key in DatabaseServices.
    if (services.student_evaluations) {
        return services.student_evaluations as unknown as StudentEvaluationsControllerLike;
    }

    // Backward-compat: older runtime may expose camelCase.
    const maybeCamel = (
        services as unknown as { studentEvaluations?: StudentEvaluationsControllerLike }
    ).studentEvaluations;
    if (maybeCamel) return maybeCamel;

    // Last fallback via registry getter.
    try {
        const viaRegistry = services.get('student_evaluations');
        if (viaRegistry) {
            return viaRegistry as unknown as StudentEvaluationsControllerLike;
        }
    } catch {
        // no-op
    }

    return null;
}

function normalizeStudentEvaluationPayload(
    body: Record<string, unknown>,
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...body };

    // Student-evaluation payload should resolve student_id only.
    const studentIdCandidates: unknown[] = [
        body.student_id,
        body.studentId,
        body.user_id,
        body.userId,
    ];

    for (const candidate of studentIdCandidates) {
        const parsed = toNonEmptyString(candidate);
        if (parsed) {
            out.student_id = parsed;
            break;
        }
    }

    if (!hasOwn(out, 'status')) {
        out.status = 'pending';
    }

    // Hard-strip panelist-like aliases from this flow.
    delete out.evaluator_id;
    delete out.evaluatorId;

    return out;
}

async function dispatchStudentEvaluationsRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = resolveStudentEvaluationsController(services);

    if (!controller) {
        return NextResponse.json(
            {
                error: 'Student evaluation endpoint is unavailable.',
                message:
                    'Student evaluation service is not configured. Student and panelist evaluation flows remain separate.',
            },
            { status: 404 },
        );
    }

    const method = req.method.toUpperCase();

    if (tail.length === 0) {
        if (method === 'GET') {
            if (typeof controller.findMany !== 'function') return json404Api();
            const query = parseListQuery<Record<string, unknown>>(req);
            const items = await controller.findMany(query);
            return json200({ items });
        }

        if (method === 'POST') {
            if (typeof controller.create !== 'function') return json404Api();

            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const payload = normalizeStudentEvaluationPayload(body);
            const item = await controller.create(payload);
            return json201({ item });
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    if (tail.length === 2 && tail[0] === 'schedule') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);
        if (typeof controller.listBySchedule !== 'function') return json404Api();

        const scheduleId = tail[1];
        if (!scheduleId) return json400('scheduleId is required.');

        const items = await controller.listBySchedule(scheduleId as UUID);
        return json200({ items });
    }

    if (
        tail.length === 2 &&
        (tail[0] === 'student' || tail[0] === 'evaluator')
    ) {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        const studentId = tail[1];
        if (!studentId) return json400('studentId is required.');

        const listByStudent = controller.listByStudent ?? controller.listByEvaluator;
        if (typeof listByStudent !== 'function') return json404Api();

        const items = await listByStudent(studentId as UUID);
        return json200({ items });
    }

    const id = tail[0];
    if (!id || !isUuidLike(id)) return json404Api();

    if (tail.length === 1) {
        if (method === 'GET') {
            if (typeof controller.findById !== 'function') return json404Api();
            const item = await controller.findById(id as UUID);
            if (!item) return json404Entity('Student evaluation');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            if (typeof controller.updateOne !== 'function') return json404Api();

            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const payload = normalizeStudentEvaluationPayload(body);
            const item = await controller.updateOne({ id: id as UUID }, payload);
            if (!item) return json404Entity('Student evaluation');
            return json200({ item });
        }

        if (method === 'DELETE') {
            if (typeof controller.delete !== 'function') return json404Api();
            const deleted = await controller.delete({ id: id as UUID });
            if (deleted === 0) return json404Entity('Student evaluation');
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

        const status = toStudentEvalStatus(body.status);
        if (!status) {
            return json400(
                `Invalid student evaluation status. Allowed: ${STUDENT_EVAL_STATUSES.join(', ')}`,
            );
        }

        let item: unknown | null = null;

        if (typeof controller.setStatus === 'function') {
            item = await controller.setStatus(id as UUID, status);
        } else if (typeof controller.updateOne === 'function') {
            item = await controller.updateOne(
                { id: id as UUID },
                { status },
            );
        }

        if (!item) return json404Entity('Student evaluation');
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

        let item: unknown | null = null;

        if (typeof controller.submit === 'function') {
            item = await controller.submit(id as UUID, submittedAt);
        } else if (typeof controller.updateOne === 'function') {
            item = await controller.updateOne(
                { id: id as UUID },
                {
                    status: 'submitted',
                    submitted_at: submittedAt ?? new Date().toISOString(),
                },
            );
        }

        if (!item) return json404Entity('Student evaluation');
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

        let item: unknown | null = null;

        if (typeof controller.lock === 'function') {
            item = await controller.lock(id as UUID, lockedAt);
        } else if (typeof controller.updateOne === 'function') {
            item = await controller.updateOne(
                { id: id as UUID },
                {
                    status: 'locked',
                    locked_at: lockedAt ?? new Date().toISOString(),
                },
            );
        }

        if (!item) return json404Entity('Student evaluation');
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

    const isThesisGroupsAlias =
        segments[0] === 'thesis' && segments[1] === 'groups';

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
                panelistEvaluations: '/api/panelist/evaluations/*',
                panelistStudentEvaluations: '/api/panelist/student-evaluations/*',
                users: '/api/users/*',
                usersMe: '/api/users/me',
                notifications: '/api/notifications/*',
                evaluations: '/api/evaluations/*',
                evaluationScores: '/api/evaluation-scores/*',
                studentEvaluations: '/api/student-evaluations/*',
                adminStudentEvaluations: '/api/admin/student-evaluations/*',
                studentScopedEvaluations: '/api/student/evaluations/*',
                defenseSchedules: '/api/defense-schedules/*',
                defenseSchedulePanelists: '/api/defense-schedule-panelists/*',
                rubricTemplates: '/api/rubric-templates/*',
                rubricCriteria: '/api/rubric-criteria/*',
                criteriaAlias: '/api/criteria/*',
                rubricTemplateCriteria: '/api/rubric-template-criteria/*',
                thesisGroups: '/api/thesis-groups/*',
                thesisLegacyGroups: '/api/thesis/groups/*',
                groupsAlias: '/api/groups/*',
                groupMembers: '/api/group-members/*',
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

    const isAdminStudentEvaluationsAlias =
        root === 'admin' &&
        (
            tail[0] === 'student-evaluations' ||
            tail[0] === 'student-evaluation' ||
            (
                tail[0] === 'student' &&
                (
                    tail[1] === 'evaluations' ||
                    tail[1] === 'student-evaluations' ||
                    tail[1] === 'student-evaluation'
                )
            )
        );

    const isStudentScopedEvaluationsAlias =
        root === 'student' &&
        (
            tail[0] === 'evaluations' ||
            tail[0] === 'student-evaluations' ||
            tail[0] === 'student-evaluation'
        );

    // explicit panelist aliases so /api/panelist/evaluations does not 404
    const isPanelistEvaluationsAlias =
        root === 'panelist' &&
        (
            tail[0] === 'evaluations' ||
            tail[0] === 'evaluation'
        );

    // keep student-eval flow explicitly separate even under /panelist/* aliases
    const isPanelistStudentEvaluationsAlias =
        root === 'panelist' &&
        (
            tail[0] === 'student-evaluations' ||
            tail[0] === 'student-evaluation'
        );

    if (
        root === 'student-evaluations' ||
        isAdminStudentEvaluationsAlias ||
        isStudentScopedEvaluationsAlias ||
        isPanelistStudentEvaluationsAlias
    ) {
        let studentEvalTail = tail;

        if (root === 'admin') {
            if (
                tail[0] === 'student' &&
                (
                    tail[1] === 'evaluations' ||
                    tail[1] === 'student-evaluations' ||
                    tail[1] === 'student-evaluation'
                )
            ) {
                studentEvalTail = tail.slice(2);
            } else {
                studentEvalTail = tail.slice(1);
            }
        } else if (root === 'student' || root === 'panelist') {
            studentEvalTail = tail.slice(1);
        }

        return dispatchStudentEvaluationsRequest(req, studentEvalTail, services);
    }

    // map /api/panelist/evaluations/* to panelist-evaluation service flow
    if (isPanelistEvaluationsAlias) {
        const panelistEvalTail = tail.slice(1);
        return dispatchEvaluationsRequest(req, panelistEvalTail, services);
    }

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

        case 'evaluation-scores':
            return dispatchEvaluationScoresRequest(req, tail, services);

        case 'defense-schedules':
            return dispatchDefenseSchedulesRequest(req, tail, services);

        case 'rubric-templates':
            return dispatchRubricTemplatesRequest(req, tail, services);

        case 'rubric-criteria':
        case 'criteria':
        case 'rubric-template-criteria':
            return dispatchRubricCriteriaAliasesRequest(req, tail, services);

        case 'thesis-groups':
            return dispatchThesisGroupsRequest(req, tail, services, {
                autoCreateMissingStudentProfile: true,
            });

        case 'group-members':
            return dispatchGroupMembersRequest(req, tail, services);

        case 'audit-logs':
            return dispatchAuditLogsRequest(req, tail, services);

        default:
            return json404Api();
    }
}

/* -------------------------------------------------------------------------- */
/*                        Next.js Route Handlers Factory                      */
/* -------------------------------------------------------------------------- */

export function createAuthRouteHandlers(
    options: CreateAuthRouteHandlersOptions = {},
): Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS', AuthRouteHandler> {
    const cors = createCorsController(options.cors);

    const resolveServices = async (): Promise<DatabaseServices> => {
        if (options.resolveServices) {
            return await options.resolveServices();
        }
        return defaultResolveDatabaseServices();
    };

    const authApiOptions: CreateApiRouteHandlersOptions = {
        resolveServices: options.resolveServices,
        auth: options.auth,
        cors: options.cors,
        onError: options.onError,
    };

    const toAuthApiContext = async (ctx: AuthRouteContext): Promise<AuthRouteContext> => {
        const slug = await resolveContextSlug(ctx);
        return {
            params: Promise.resolve({
                slug: ['auth', ...(slug ?? [])],
            }),
        };
    };

    const handle: AuthRouteHandler = async (
        req: NextRequest,
        ctx: AuthRouteContext,
    ): Promise<Response> => {
        try {
            if (req.method.toUpperCase() === 'OPTIONS') {
                return cors.preflight(req);
            }

            const authCtx = await toAuthApiContext(ctx);
            const response = await dispatchApiRequest(
                req,
                authCtx,
                resolveServices,
                authApiOptions,
            );

            return cors.apply(req, response);
        } catch (error) {
            if (options.onError) {
                const mapped = await options.onError(error, req, ctx);
                return cors.apply(req, mapped);
            }

            return cors.apply(
                req,
                NextResponse.json(
                    {
                        error: 'Internal server error.',
                        message:
                            error instanceof Error ? error.message : 'Unknown error.',
                    },
                    { status: 500 },
                ),
            );
        }
    };

    return {
        GET: handle,
        POST: handle,
        PUT: handle,
        PATCH: handle,
        DELETE: handle,
        OPTIONS: handle,
    };
}

export function createApiRouteHandlers(
    options: CreateApiRouteHandlersOptions = {},
): Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS', AuthRouteHandler> {
    const cors = createCorsController(options.cors);

    const resolveServices = async (): Promise<DatabaseServices> => {
        if (options.resolveServices) {
            return await options.resolveServices();
        }
        return defaultResolveDatabaseServices();
    };

    const handle: AuthRouteHandler = async (
        req: NextRequest,
        ctx: AuthRouteContext,
    ): Promise<Response> => {
        try {
            if (req.method.toUpperCase() === 'OPTIONS') {
                return cors.preflight(req);
            }

            const response = await dispatchApiRequest(req, ctx, resolveServices, options);
            return cors.apply(req, response);
        } catch (error) {
            if (options.onError) {
                const mapped = await options.onError(error, req, ctx);
                return cors.apply(req, mapped);
            }

            return cors.apply(
                req,
                NextResponse.json(
                    {
                        error: 'Internal server error.',
                        message:
                            error instanceof Error ? error.message : 'Unknown error.',
                    },
                    { status: 500 },
                ),
            );
        }
    };

    return {
        GET: handle,
        POST: handle,
        PUT: handle,
        PATCH: handle,
        DELETE: handle,
        OPTIONS: handle,
    };
}
