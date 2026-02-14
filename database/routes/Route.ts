/**
 * Route utilities for Next.js App Router.
 * --------------------------------------
 * Split into focused modules:
 * - Route.types.ts
 * - Route.resolver.ts
 * - Route.utils.ts
 * - Route.dispatch.ts
 */

import { NextRequest, NextResponse } from 'next/server';

import { createCorsController } from '../controllers/Cors';
import type { DatabaseServices } from '../services/Services';

import { dispatchApiRequest, dispatchAuthRequest } from './Route.dispatch';
import { defaultResolveDatabaseServices } from './Route.resolver';
import type {
    AuthRouteContext,
    AuthRouteHandler,
    CreateApiRouteHandlersOptions,
    CreateAuthRouteHandlersOptions,
} from './Route.types';
import { resolveAuthAction, resolveContextSlug } from './Route.utils';

export type {
    ApiGuardOptions,
    ApiResource,
    ApiRoot,
    AuthAction,
    AuthRouteContext,
    AuthRouteHandler,
    AuthRouteParams,
    AuthRouteParamsLike,
    CreateApiRouteHandlersOptions,
    CreateAuthRouteHandlersOptions,
    DatabaseServicesResolver,
} from './Route.types';

export {
    clearDatabaseServicesResolver,
    setDatabaseServicesResolver,
} from './Route.resolver';

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
