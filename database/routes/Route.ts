/**
 * Route utilities for Next.js App Router (Auth-focused).
 * ------------------------------------------------------
 * Provides:
 * - catch-all auth action resolver from [[...slug]]
 * - method/action dispatcher for AuthController
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

import {
    createAuthController,
    type AuthControllerOptions,
} from '../controllers/AuthController';
import { createCorsController, type CorsOptions } from '../controllers/Cors';
import type { DatabaseServices } from '../services/Services';

export type DatabaseServicesResolver =
    | (() => DatabaseServices | Promise<DatabaseServices>)
    | null;

export interface AuthRouteContext {
    params?: {
        slug?: string[];
    };
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

function json404(): NextResponse {
    return NextResponse.json({ error: 'Auth route not found.' }, { status: 404 });
}

function json200(payload: Record<string, unknown>): NextResponse {
    return NextResponse.json(payload, { status: 200 });
}

async function dispatchAuthRequest(
    req: NextRequest,
    action: AuthAction | null,
    servicesResolver: () => Promise<DatabaseServices>,
    authOptions?: AuthControllerOptions,
): Promise<Response> {
    if (!action) return json404();

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
            return json404();
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

            const action = resolveAuthAction(ctx?.params?.slug);
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
