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
    USER_STATUSES,
    type EvaluationInsert,
    type EvaluationPatch,
    type EvaluationRow,
    type EvaluationStatus,
    type NotificationType,
    type ThesisRole,
    type UserRow,
    type UserStatus,
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
    | 'evaluations';

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

    const id = tail[0];
    if (!id) return json404Api();

    if (tail.length === 1) {
        if (method === 'GET') {
            const item = await controller.getById(id);
            if (!item) return json404Entity('Admin');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.update(
                id,
                body as Parameters<AdminController['update']>[1],
            );
            if (!item) return json404Entity('Admin');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete(id);
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

        const item = await controller.setStatus(id, status);
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
    if (!id) return json404Api();

    if (tail.length === 1) {
        if (method === 'GET') {
            const item = await controller.getById(id);
            if (!item) return json404Entity('Student');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.update(
                id,
                body as Parameters<StudentController['update']>[1],
            );
            if (!item) return json404Entity('Student');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete(id);
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

        const item = await controller.setStatus(id, status);
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
    if (!id) return json404Api();

    if (tail.length === 1) {
        if (method === 'GET') {
            const item = await controller.getById(id);
            if (!item) return json404Entity('Staff');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.update(
                id,
                body as Parameters<StaffController['update']>[1],
            );
            if (!item) return json404Entity('Staff');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete(id);
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

        const item = await controller.setStatus(id, status);
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
    if (!id) return json404Api();

    if (tail.length === 1) {
        if (method === 'GET') {
            const item = await controller.getById(id);
            if (!item) return json404Entity('Panelist');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.update(
                id,
                body as Parameters<PanelistController['update']>[1],
            );
            if (!item) return json404Entity('Panelist');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete(id);
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

        const item = await controller.setStatus(id, status);
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
    if (!id) return json404Api();

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

        if (method === 'DELETE') {
            const deleted = await controller.delete(id);
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

        const item = await controller.setStatus(id, status);
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

        const item = await controller.setAvatarKey(id, value);
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
            userIds,
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
                userId,
                omitWhere(query) as Parameters<
                    NotificationController['getAllByUser']
                >[1],
            );
            return json200({ items });
        }

        if (tail.length === 3 && tail[2] === 'unread') {
            if (method !== 'GET') return json405(['GET', 'OPTIONS']);

            const limit = parsePositiveInt(req.nextUrl.searchParams.get('limit')) ?? 50;
            const items = await controller.getUnread(userId, limit);
            return json200({ items });
        }

        if (tail.length === 3 && tail[2] === 'read-all') {
            if (method !== 'PATCH' && method !== 'POST') {
                return json405(['PATCH', 'POST', 'OPTIONS']);
            }

            const body = await readJsonRecord(req);
            const readAt = body ? parseReadAt(body) : undefined;
            const updated = await controller.markAllAsRead(userId, readAt);
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
                userId,
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
            const item = await controller.getById(id);
            if (!item) return json404Entity('Notification');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.update(
                id,
                body as Parameters<NotificationController['update']>[1],
            );
            if (!item) return json404Entity('Notification');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete(id);
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

        const item = await controller.markAsRead(id, readAt);
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

        const items = await controller.listBySchedule(scheduleId);
        return json200({ items });
    }

    // /api/evaluations/evaluator/:evaluatorId
    if (tail.length === 2 && tail[0] === 'evaluator') {
        if (method !== 'GET') return json405(['GET', 'OPTIONS']);

        const evaluatorId = tail[1];
        if (!evaluatorId) return json400('evaluatorId is required.');

        const items = await controller.listByEvaluator(evaluatorId);
        return json200({ items });
    }

    const id = tail[0];
    if (!id) return json404Api();

    if (tail.length === 1) {
        if (method === 'GET') {
            const item = await controller.findById(id);
            if (!item) return json404Entity('Evaluation');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.updateOne({ id }, body as EvaluationPatch);
            if (!item) return json404Entity('Evaluation');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete({ id });
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

        const item = await controller.setStatus(id, status);
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

        const item = await controller.submit(id, submittedAt);
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

        const item = await controller.lock(id, lockedAt);
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
    const root = resolveApiRoot(segments[0]);

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

    const tail = segments.slice(1);

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
