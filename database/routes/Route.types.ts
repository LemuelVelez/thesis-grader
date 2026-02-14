import { NextRequest } from 'next/server';

import type { AuthControllerOptions } from '../controllers/AuthController';
import type { CorsOptions } from '../controllers/Cors';
import type { MiddlewareOptions } from '../controllers/Middleware';
import type { ThesisRole } from '../models/Model';
import type { DatabaseServices } from '../services/Services';

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
    | 'defense-schedules'
    | 'rubric-templates'
    | 'thesis-groups'
    | 'audit-logs';

export type ApiRoot = 'root' | 'auth' | ApiResource;

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
