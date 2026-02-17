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

const handlers = createApiRouteHandlers({
    resolveServices: resolveDatabaseServices,
    onError: (error, req) => {
        const message = extractErrorMessage(error);
        const isEvaluationsEndpoint = /^\/api\/evaluations(?:\/|$)/i.test(
            req.nextUrl.pathname,
        );

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
    handlers.GET(req, ctx);

export const POST = (req: NextRequest, ctx: AuthRouteContext) =>
    handlers.POST(req, ctx);

export const PUT = (req: NextRequest, ctx: AuthRouteContext) =>
    handlers.PUT(req, ctx);

export const PATCH = (req: NextRequest, ctx: AuthRouteContext) =>
    handlers.PATCH(req, ctx);

export const DELETE = (req: NextRequest, ctx: AuthRouteContext) =>
    handlers.DELETE(req, ctx);

export const OPTIONS = (req: NextRequest, ctx: AuthRouteContext) =>
    handlers.OPTIONS(req, ctx);
