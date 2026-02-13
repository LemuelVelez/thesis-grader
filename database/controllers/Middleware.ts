/**
 * Auth middleware helpers for Next.js Route Handlers
 * --------------------------------------------------
 * Provides:
 * - token extraction (cookie and optional Bearer token)
 * - session/user resolution
 * - withAuth / withRoles / withSelfOrRoles wrappers
 *
 * Notes:
 * - Uses DatabaseServices contracts from database/services/Services.ts
 * - Uses SHA-256 token hashing compatible with AuthController session storage
 * - Requires Node.js runtime (uses node:crypto)
 */

import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import type { ThesisRole, UserRow, UUID } from '../models/Model';
import type { DatabaseServices } from '../services/Services';

export interface MiddlewareOptions {
    /**
     * Cookie name used for session token.
     * Must match AuthController cookieName.
     * Default: "tg_session"
     */
    cookieName?: string;

    /**
     * Whether to also read Authorization: Bearer <token>.
     * Default: true
     */
    allowBearerToken?: boolean;

    /**
     * If true, users must have status === "active".
     * Default: true
     */
    requireActiveUser?: boolean;

    /**
     * If true, expired sessions are deleted when encountered.
     * Default: true
     */
    revokeExpiredSession?: boolean;
}

export interface AuthContext {
    user: UserRow;
    sessionId: UUID;
    token: string;
    tokenSource: 'cookie' | 'bearer';
}

export type RouteHandler = (req: NextRequest) => Promise<Response> | Response;
export type AuthedRouteHandler = (
    req: NextRequest,
    auth: AuthContext,
) => Promise<Response> | Response;

function isExpired(isoDateTime: string): boolean {
    return new Date(isoDateTime).getTime() <= Date.now();
}

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function json(status: number, payload: Record<string, unknown>): NextResponse {
    return NextResponse.json(payload, { status });
}

function parseBearerToken(req: NextRequest): string | null {
    const header = req.headers.get('authorization');
    if (!header) return null;

    const [scheme, token] = header.split(' ');
    if (!scheme || !token) return null;
    if (scheme.toLowerCase() !== 'bearer') return null;

    const trimmed = token.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export class MiddlewareController {
    private readonly cookieName: string;
    private readonly allowBearerToken: boolean;
    private readonly requireActiveUser: boolean;
    private readonly revokeExpiredSession: boolean;

    constructor(
        private readonly services: DatabaseServices,
        options: MiddlewareOptions = {},
    ) {
        this.cookieName = options.cookieName ?? 'tg_session';
        this.allowBearerToken = options.allowBearerToken ?? true;
        this.requireActiveUser = options.requireActiveUser ?? true;
        this.revokeExpiredSession = options.revokeExpiredSession ?? true;
    }

    /**
     * Resolve authenticated user/session from request token.
     * Returns null when token/session/user is invalid.
     */
    async resolve(req: NextRequest): Promise<AuthContext | null> {
        const fromCookie = req.cookies.get(this.cookieName)?.value ?? null;
        const fromBearer = this.allowBearerToken ? parseBearerToken(req) : null;

        // Prefer cookie token if available.
        const token = fromCookie ?? fromBearer;
        if (!token) return null;

        const tokenSource: 'cookie' | 'bearer' = fromCookie ? 'cookie' : 'bearer';
        const tokenHash = sha256(token);

        const session = await this.services.sessions.findByTokenHash(tokenHash);
        if (!session) return null;

        if (isExpired(session.expires_at)) {
            if (this.revokeExpiredSession) {
                try {
                    await this.services.sessions.delete({ id: session.id });
                } catch {
                    // Keep auth resolution resilient.
                }
            }
            return null;
        }

        const user = await this.services.users.findById(session.user_id);
        if (!user) return null;

        if (this.requireActiveUser && user.status !== 'active') {
            return null;
        }

        return {
            user,
            sessionId: session.id,
            token,
            tokenSource,
        };
    }

    unauthorized(message = 'Unauthorized.'): NextResponse {
        return json(401, { error: message });
    }

    forbidden(message = 'Forbidden.'): NextResponse {
        return json(403, { error: message });
    }

    /**
     * Wrap route handler and require a valid authenticated session.
     */
    withAuth(handler: AuthedRouteHandler): RouteHandler {
        return async (req: NextRequest): Promise<Response> => {
            const auth = await this.resolve(req);
            if (!auth) return this.unauthorized();
            return handler(req, auth);
        };
    }

    /**
     * Wrap route handler and require one of the provided roles.
     */
    withRoles(roles: readonly ThesisRole[], handler: AuthedRouteHandler): RouteHandler {
        return this.withAuth(async (req, auth) => {
            if (!roles.includes(auth.user.role)) {
                return this.forbidden('Insufficient role.');
            }
            return handler(req, auth);
        });
    }

    /**
     * Require auth and allow if current user is the target user
     * OR has one of the privileged roles.
     */
    withSelfOrRoles(
        resolveTargetUserId: (req: NextRequest) => UUID | null,
        roles: readonly ThesisRole[],
        handler: AuthedRouteHandler,
    ): RouteHandler {
        return this.withAuth(async (req, auth) => {
            const targetUserId = resolveTargetUserId(req);

            const isSelf = !!targetUserId && auth.user.id === targetUserId;
            const hasRole = roles.includes(auth.user.role);

            if (!isSelf && !hasRole) {
                return this.forbidden('You are not allowed to access this resource.');
            }

            return handler(req, auth);
        });
    }
}

/**
 * Convenience factory.
 */
export function createMiddlewareController(
    services: DatabaseServices,
    options?: MiddlewareOptions,
): MiddlewareController {
    return new MiddlewareController(services, options);
}
