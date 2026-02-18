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
 * This route ONLY rewrites the slug for:
 *   /api/student-evaluations/*
 *
 * so it is handled by the STUDENT route dispatcher which supports:
 * - /schema
 * - /form/schema
 * - /active-form
 * - /my
 * - /me
 *
 * IMPORTANT:
 * Do NOT rewrite other routes (e.g. /api/admin/*), otherwise they will 404.
 */
function buildAuthRouteContextFromRequest(req: NextRequest): AuthRouteContext {
    const pathname = req.nextUrl.pathname ?? '';
    const parts = pathname.split('/').filter(Boolean); // ["api", ...]
    const apiIndex = parts.findIndex((p) => p.toLowerCase() === 'api');
    const baseIndex = parts.findIndex((p) => p.toLowerCase() === 'student-evaluations');

    const tail =
        baseIndex >= 0
            ? parts.slice(baseIndex + 1)
            : apiIndex >= 0
                ? parts.slice(apiIndex + 1)
                : parts;

    // Only force root = "student" for /api/student-evaluations/*
    const slug = baseIndex >= 0 ? ['student', ...tail] : tail;

    return {
        params: { slug },
    } as unknown as AuthRouteContext;
}

const handlers = createApiRouteHandlers({
    resolveServices: resolveDatabaseServices,
    onError: (error: unknown, req: NextRequest) => {
        const message = extractErrorMessage(error);
        const path = req.nextUrl.pathname ?? '';

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

export const GET = (req: NextRequest, _ctx: AuthRouteContext) =>
    handlers.GET(req, buildAuthRouteContextFromRequest(req));

export const POST = (req: NextRequest, _ctx: AuthRouteContext) =>
    handlers.POST(req, buildAuthRouteContextFromRequest(req));

export const PUT = (req: NextRequest, _ctx: AuthRouteContext) =>
    handlers.PUT(req, buildAuthRouteContextFromRequest(req));

export const PATCH = (req: NextRequest, _ctx: AuthRouteContext) =>
    handlers.PATCH(req, buildAuthRouteContextFromRequest(req));

export const DELETE = (req: NextRequest, _ctx: AuthRouteContext) =>
    handlers.DELETE(req, buildAuthRouteContextFromRequest(req));

export const OPTIONS = (req: NextRequest, _ctx: AuthRouteContext) =>
    handlers.OPTIONS(req, buildAuthRouteContextFromRequest(req));
