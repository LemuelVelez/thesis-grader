import { NextRequest, NextResponse } from 'next/server';
import {
    createApiRouteHandlers,
    type AuthRouteContext,
} from '../../../database/routes/Route';
import { resolveDatabaseServices } from '../../../database/services/resolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function extractErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message.trim();
    }

    if (error && typeof error === 'object') {
        const maybe = error as Record<string, unknown>;
        const message =
            typeof maybe.message === 'string' ? maybe.message.trim() : '';
        if (message.length > 0) return message;

        const detail =
            typeof maybe.detail === 'string' ? maybe.detail.trim() : '';
        if (detail.length > 0) return detail;
    }

    return 'Unknown error.';
}

function isRoleGuardPanelistError(message: string): boolean {
    const normalized = message.toLowerCase();

    return (
        normalized.includes('must have role panelist') ||
        normalized.includes('must have role "panelist"') ||
        (normalized.includes('must have role') && normalized.includes('panelist'))
    );
}

function isRouteNotFoundError(message: string): boolean {
    const m = (message ?? '').toLowerCase();
    return (
        m.includes('api route not found') ||
        (m.includes('route') && m.includes('not found')) ||
        (m.includes('endpoint') && m.includes('not found'))
    );
}

/**
 * Normalize ctx.params.slug across Next.js variants and edge-cases.
 * This prevents false "API route not found" errors when ctx.params.slug is missing/mis-shaped.
 */
function normalizeAuthRouteContext(req: NextRequest, ctx: AuthRouteContext): AuthRouteContext {
    const rawSlug = (ctx as any)?.params?.slug as unknown;

    const slugFromCtx: string[] | undefined = Array.isArray(rawSlug)
        ? rawSlug.filter((s) => typeof s === 'string' && s.trim().length > 0)
        : typeof rawSlug === 'string' && rawSlug.trim().length > 0
            ? [rawSlug.trim()]
            : undefined;

    if (slugFromCtx && slugFromCtx.length > 0) {
        return {
            ...ctx,
            params: {
                ...(ctx as any).params,
                slug: slugFromCtx,
            },
        } as AuthRouteContext;
    }

    // Fallback: derive slug from pathname (e.g., /api/admin/student-feedback/forms)
    const pathname = req.nextUrl.pathname ?? '';
    const parts = pathname.split('/').filter(Boolean); // ["api", "..."]
    const normalizedParts = parts[0]?.toLowerCase() === 'api' ? parts.slice(1) : parts;

    return {
        ...ctx,
        params: {
            ...(ctx as any).params,
            slug: normalizedParts,
        },
    } as AuthRouteContext;
}

const handlers = createApiRouteHandlers({
    resolveServices: resolveDatabaseServices,
    onError: (error, req) => {
        const message = extractErrorMessage(error);
        const path = req.nextUrl.pathname ?? '';

        // Ensure route-not-found errors return 404 (not 500),
        // so the frontend can handle it cleanly and logs are accurate.
        if (isRouteNotFoundError(message)) {
            return NextResponse.json(
                {
                    error: 'API route not found.',
                    message,
                    path,
                },
                { status: 404 },
            );
        }

        const isEvaluationsEndpoint = /^\/api\/evaluations(?:\/|$)/i.test(path);

        // Prevent raw 500s for role-guard violations in panelist evaluations.
        // Student and panelist evaluations are separate flows.
        if (isEvaluationsEndpoint && isRoleGuardPanelistError(message)) {
            return NextResponse.json(
                {
                    error: 'Invalid evaluator role.',
                    message:
                        'Panelist evaluations only accept users with role "panelist". Student evaluations must be created in the separate student evaluation flow.',
                },
                { status: 400 },
            );
        }

        return NextResponse.json(
            {
                error: 'Internal server error.',
                message,
            },
            { status: 500 },
        );
    },
});

export const GET = (req: NextRequest, ctx: AuthRouteContext) =>
    handlers.GET(req, normalizeAuthRouteContext(req, ctx));

export const POST = (req: NextRequest, ctx: AuthRouteContext) =>
    handlers.POST(req, normalizeAuthRouteContext(req, ctx));

export const PUT = (req: NextRequest, ctx: AuthRouteContext) =>
    handlers.PUT(req, normalizeAuthRouteContext(req, ctx));

export const PATCH = (req: NextRequest, ctx: AuthRouteContext) =>
    handlers.PATCH(req, normalizeAuthRouteContext(req, ctx));

export const DELETE = (req: NextRequest, ctx: AuthRouteContext) =>
    handlers.DELETE(req, normalizeAuthRouteContext(req, ctx));

export const OPTIONS = (req: NextRequest, ctx: AuthRouteContext) =>
    handlers.OPTIONS(req, normalizeAuthRouteContext(req, ctx));
