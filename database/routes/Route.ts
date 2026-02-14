/**
 * Route utilities for Next.js App Router.
 * --------------------------------------
 * Provides:
 * - auth action resolver from [[...slug]]
 * - method/action dispatcher for AuthController
 * - optional API catch-all dispatcher (auth/admin/student/staff/panelist/users/notifications/evaluations)
 * - built-in CORS wrapping via CorsController
 * - pluggable DatabaseServices resolver
 *
 * This file is implementation-agnostic and does not import any concrete DB adapter.
 * Wire a resolver using either:
 *   1) setDatabaseServicesResolver(...)
 *   2) globalThis.__thesisGraderDbServices
 *   3) globalThis.__thesisGraderDbServicesResolver
 */

import { NextRequest, NextResponse } from 'next/server';

import { AdminController } from '../controllers/AdminController';
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
import { PanelistController } from '../controllers/PanelistController';
import { StaffController } from '../controllers/StaffController';
import { StudentController } from '../controllers/StudentController';
import { UserController } from '../controllers/UserController';
import {
    NOTIFICATION_TYPES,
    THESIS_ROLES,
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
    type EvaluationStatus,
    type GroupMemberRow,
    type NotificationType,
    type RubricTemplateInsert,
    type RubricTemplatePatch,
    type RubricTemplateRow,
    type StudentRow,
    type ThesisGroupInsert,
    type ThesisGroupPatch,
    type ThesisGroupRow,
    type ThesisRole,
    type UserRow,
    type UserStatus,
    type UUID,
} from '../models/Model';
import type { DatabaseServices, ListQuery } from '../services/Services';

export type DatabaseServicesResolver =
    | (() => DatabaseServices | Promise<DatabaseServices>)
    | null;

export interface AuthRouteParams {
    slug?: string[];
}

/**
 * Next.js 16 App Router context uses:
 *   { params: Promise<{ ... }> }
 * while older/internal usage may still pass a plain object.
 * Accept both to keep handlers compatible across call sites.
 */
export type AuthRouteParamsLike = AuthRouteParams | Promise<AuthRouteParams>;

export interface AuthRouteContext {
    params?: AuthRouteParamsLike;
}

export type AuthRouteHandler = (
    req: NextRequest,
    ctx: AuthRouteContext,
) => Promise<Response>;

type AuthAction =
    | 'root'
    | 'register'
    | 'login'
    | 'logout'
    | 'me'
    | 'refresh'
    | 'forgot-password'
    | 'reset-password';

type ApiResource =
    | 'admin'
    | 'student'
    | 'staff'
    | 'panelist'
    | 'users'
    | 'notifications'
    | 'evaluations'
    | 'defense-schedules'
    | 'rubric-templates'
    | 'thesis-groups'
    | 'audit-logs';

type ApiRoot = 'root' | 'auth' | ApiResource;

export interface CreateAuthRouteHandlersOptions {
    /**
     * Optional resolver for DB services.
     * If omitted, default resolver uses module/global resolver hooks.
     */
    resolveServices?: DatabaseServicesResolver;

    /**
     * Passed directly to AuthController.
     */
    auth?: AuthControllerOptions;

    /**
     * Passed directly to CorsController.
     */
    cors?: CorsOptions;

    /**
     * Optional centralized error mapping.
     */
    onError?: (
        error: unknown,
        req: NextRequest,
        ctx: AuthRouteContext,
    ) => Promise<Response> | Response;
}

export interface ApiGuardOptions {
    /**
     * When true, all non-auth API routes require a valid authenticated session.
     * Default: false
     */
    requireAuth?: boolean;

    /**
     * Optional role requirements per resource.
     * If set for a resource, user must have one of the roles.
     */
    rolesByResource?: Partial<Record<ApiResource, readonly ThesisRole[]>>;

    /**
     * Passed to MiddlewareController.
     */
    middleware?: MiddlewareOptions;
}

export interface CreateApiRouteHandlersOptions
    extends CreateAuthRouteHandlersOptions {
    /**
     * Optional auth/role guard for non-auth resources.
     */
    guard?: ApiGuardOptions;
}

declare global {
    // eslint-disable-next-line no-var
    var __thesisGraderDbServices: DatabaseServices | undefined;
    // eslint-disable-next-line no-var
    var __thesisGraderDbServicesResolver:
        | (() => DatabaseServices | Promise<DatabaseServices>)
        | undefined;
}

let moduleResolver: DatabaseServicesResolver = null;

/**
 * Set a process-wide resolver for DatabaseServices.
 * Useful in server bootstrap or tests.
 */
export function setDatabaseServicesResolver(
    resolver: () => DatabaseServices | Promise<DatabaseServices>,
): void {
    moduleResolver = resolver;
}

/**
 * Clear process-wide resolver (mainly for tests).
 */
export function clearDatabaseServicesResolver(): void {
    moduleResolver = null;
}

async function defaultResolveDatabaseServices(): Promise<DatabaseServices> {
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

function normalizeSegment(value: string): string {
    return value.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function normalizeSegments(slug?: string[]): string[] {
    return (slug ?? []).map(normalizeSegment).filter(Boolean);
}

async function resolveContextSlug(
    ctx?: AuthRouteContext,
): Promise<string[] | undefined> {
    const params = await ctx?.params;
    return params?.slug;
}

function resolveAuthAction(slug?: string[]): AuthAction | null {
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

function resolveApiRoot(segment: string | undefined): ApiRoot | null {
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

function json405(allow: string[]): NextResponse {
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

function json404Auth(): NextResponse {
    return NextResponse.json({ error: 'Auth route not found.' }, { status: 404 });
}

function json404Api(): NextResponse {
    return NextResponse.json({ error: 'API route not found.' }, { status: 404 });
}

function json404Entity(entity: string): NextResponse {
    return NextResponse.json({ error: `${entity} not found.` }, { status: 404 });
}

function json400(message: string): NextResponse {
    return NextResponse.json({ error: message }, { status: 400 });
}

function json200(payload: Record<string, unknown>): NextResponse {
    return NextResponse.json(payload, { status: 200 });
}

function json201(payload: Record<string, unknown>): NextResponse {
    return NextResponse.json(payload, { status: 201 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function readJsonRecord(
    req: NextRequest,
): Promise<Record<string, unknown> | null> {
    try {
        const body = (await req.json()) as unknown;
        return isRecord(body) ? body : null;
    } catch {
        return null;
    }
}

function parsePositiveInt(raw: string | null): number | undefined {
    if (!raw) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return undefined;
    if (!Number.isInteger(parsed)) return undefined;
    return parsed > 0 ? parsed : undefined;
}

function parseNonNegativeInt(raw: string | null): number | undefined {
    if (!raw) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return undefined;
    if (!Number.isInteger(parsed)) return undefined;
    return parsed >= 0 ? parsed : undefined;
}

function parseBoolean(raw: string | null): boolean | undefined {
    if (raw == null) return undefined;
    const normalized = raw.trim().toLowerCase();

    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;

    return undefined;
}

function isUuidLike(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.trim(),
    );
}

function parseListQuery<Row extends object>(req: NextRequest): ListQuery<Row> {
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

function omitWhere<Row extends object>(
    query: ListQuery<Row>,
): Omit<ListQuery<Row>, 'where'> {
    const { where: _where, ...rest } = query;
    return rest;
}

function toUserStatus(value: unknown): UserStatus | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return (USER_STATUSES as readonly string[]).includes(normalized)
        ? (normalized as UserStatus)
        : null;
}

function toNotificationType(value: unknown): NotificationType | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return (NOTIFICATION_TYPES as readonly string[]).includes(normalized)
        ? (normalized as NotificationType)
        : null;
}

function toEvaluationStatus(value: unknown): EvaluationStatus | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    return normalized as EvaluationStatus;
}

function parseReadAt(body: Record<string, unknown>): string | undefined {
    const readAt = body.readAt;
    if (typeof readAt === 'string' && readAt.trim().length > 0) {
        return readAt.trim();
    }
    return undefined;
}

function parseOptionalIsoDate(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
    }
    return undefined;
}

function toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Safely parses a thesis role from unknown input.
 */
function toThesisRole(value: unknown): ThesisRole | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return (THESIS_ROLES as readonly string[]).includes(normalized)
        ? (normalized as ThesisRole)
        : null;
}

/**
 * Supports both canonical UserRow and user-like wrappers (e.g., StudentAccount)
 * where role may be nested under .user.role.
 */
function extractRoleFromUserLike(value: unknown): ThesisRole | null {
    if (!isRecord(value)) return null;

    const direct = toThesisRole(value.role);
    if (direct) return direct;

    const nested = value.user;
    if (isRecord(nested)) {
        const nestedRole = toThesisRole(nested.role);
        if (nestedRole) return nestedRole;
    }

    return null;
}

/**
 * Supports both canonical UserRow and wrapped account objects where id may be nested.
 */
function extractIdFromUserLike(value: unknown): string | null {
    if (!isRecord(value)) return null;

    const direct = toNonEmptyString(value.id);
    if (direct) return direct;

    const nested = value.user;
    if (isRecord(nested)) {
        return toNonEmptyString(nested.id);
    }

    return null;
}

function parseGroupMemberStudentIdFromBody(
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

function hasExplicitLinkedStudentUserReference(
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

function toErrorMessage(error: unknown): string {
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

function isForeignKeyViolation(error: unknown): boolean {
    const code = toErrorCode(error);
    if (code === '23503') return true;

    const msg = toErrorMessage(error).toLowerCase();
    return msg.includes('foreign key');
}

function isUniqueViolation(error: unknown): boolean {
    const code = toErrorCode(error);
    if (code === '23505') return true;

    const msg = toErrorMessage(error).toLowerCase();
    return msg.includes('duplicate key') || msg.includes('unique constraint');
}

function isThesisGroupMembersSegment(value: string | undefined): boolean {
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
async function resolveCanonicalUserForMember(
    services: DatabaseServices,
    candidateId: string,
): Promise<{
    canonicalId: string;
    user: Record<string, unknown> | null;
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

    let rawUser: unknown = null;
    try {
        rawUser = await usersController.getById(normalized as UUID);
    } catch {
        rawUser = null;
    }

    if (!isRecord(rawUser)) {
        return {
            canonicalId: normalized,
            user: null,
            resolvedFromAlias: false,
        };
    }

    const canonicalId = extractIdFromUserLike(rawUser) ?? normalized;
    return {
        canonicalId,
        user: rawUser,
        resolvedFromAlias:
            canonicalId.toLowerCase() !== normalized.toLowerCase(),
    };
}

async function findGroupMemberByIdentifierWithAliasFallback(
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

async function buildGroupMemberResponse(
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
                const studentUserRole = extractRoleFromUserLike(studentUser);

                // If role is discoverable and not student, fail fast.
                if (studentUser && studentUserRole && studentUserRole !== 'student') {
                    return json400('Resolved user must have role "student".');
                }

                if (requiresLinkedStudentUser && !studentUser) {
                    return json400(
                        'Linked student user was not found. Use a valid student user id or switch to manual entry.',
                    );
                }

                // Pre-check student profile to avoid DB-level FK explosions and opaque 500s.
                const studentProfile = studentUser
                    ? await safeFindStudentProfileByUserId(
                        services,
                        canonicalStudentId,
                    )
                    : null;

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
                const nextStudentUserRole = extractRoleFromUserLike(nextStudentUser);

                // If role is discoverable and not student, fail fast.
                if (nextStudentUser && nextStudentUserRole && nextStudentUserRole !== 'student') {
                    return json400('Resolved user must have role "student".');
                }

                if (requiresLinkedStudentUser && !nextStudentUser) {
                    return json400(
                        'Linked student user was not found. Use a valid student user id or switch to manual entry.',
                    );
                }

                // Pre-check profile before attempting replacement.
                const nextStudentProfile = nextStudentUser
                    ? await safeFindStudentProfileByUserId(
                        services,
                        nextCanonicalStudentId,
                    )
                    : null;

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

/* ===========================
   Remaining file is unchanged
   =========================== */

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

    // Namespaced admin resources
    if (tail[0] === 'defense-schedules' || tail[0] === 'defense-schedule') {
        return dispatchDefenseSchedulesRequest(req, tail.slice(1), services);
    }

    if (tail[0] === 'rubric-templates' || tail[0] === 'rubric-template') {
        return dispatchRubricTemplatesRequest(req, tail.slice(1), services);
    }

    if (tail[0] === 'audit-logs' || tail[0] === 'audit-log') {
        return dispatchAuditLogsRequest(req, tail.slice(1), services);
    }

    if (tail[0] === 'thesis' && tail[1] === 'groups') {
        return dispatchThesisGroupsRequest(req, tail.slice(2), services);
    }

    if (
        tail[0] === 'thesis-groups' ||
        tail[0] === 'thesis-group' ||
        tail[0] === 'groups'
    ) {
        return dispatchThesisGroupsRequest(req, tail.slice(1), services);
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
    resource: ApiResource,
    services: DatabaseServices,
    guard?: ApiGuardOptions,
): Promise<Response | null> {
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

async function dispatchApiRequest(
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

/**
 * Factory for Next.js route handlers under:
 * app/api/auth/[[...slug]]/route.ts
 */
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

    const handle: AuthRouteHandler = async (
        req: NextRequest,
        ctx: AuthRouteContext,
    ): Promise<Response> => {
        try {
            if (req.method.toUpperCase() === 'OPTIONS') {
                return cors.preflight(req);
            }

            const slug = await resolveContextSlug(ctx);
            const action = resolveAuthAction(slug);
            const response = await dispatchAuthRequest(
                req,
                action,
                resolveServices,
                options.auth,
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

/**
 * Factory for Next.js route handlers under:
 * app/api/[[...slug]]/route.ts
 *
 * Supports:
 * - /api
 * - /api/auth/*
 * - /api/admin/*
 * - /api/student/*
 * - /api/staff/*
 * - /api/panelist/*
 * - /api/users/*
 * - /api/notifications/*
 * - /api/evaluations/*
 * - /api/defense-schedules/*
 * - /api/rubric-templates/*
 * - /api/thesis-groups/*
 * - /api/audit-logs/*
 */
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
