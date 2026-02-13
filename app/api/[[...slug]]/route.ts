import { NextRequest, NextResponse } from 'next/server';
import {
    createApiRouteHandlers,
    type AuthRouteContext,
    type AuthRouteHandler,
} from '../../../database/routes/Route';

export const runtime = 'nodejs';

const handlers = createApiRouteHandlers();

function normalizeSegment(value: string): string {
    return value.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

async function getFirstSegment(ctx: AuthRouteContext): Promise<string | null> {
    const params = await ctx?.params;
    const slug = params?.slug ?? [];

    if (!Array.isArray(slug) || slug.length === 0) return null;

    const first = slug[0];
    if (typeof first !== 'string') return null;

    const normalized = normalizeSegment(first);
    return normalized.length > 0 ? normalized : null;
}

function authNamespaceDisabled(): NextResponse {
    return NextResponse.json(
        {
            error: 'Auth route not found.',
            message: 'Authentication routes are served only from explicit /api/auth/* routes.',
        },
        { status: 404 },
    );
}

async function dispatchNonAuth(
    handler: AuthRouteHandler,
    req: NextRequest,
    ctx: AuthRouteContext,
): Promise<Response> {
    const first = await getFirstSegment(ctx);
    if (first === 'auth') {
        return authNamespaceDisabled();
    }

    return handler(req, ctx);
}

export const GET = (req: NextRequest, ctx: AuthRouteContext) =>
    dispatchNonAuth(handlers.GET, req, ctx);

export const POST = (req: NextRequest, ctx: AuthRouteContext) =>
    dispatchNonAuth(handlers.POST, req, ctx);

export const PUT = (req: NextRequest, ctx: AuthRouteContext) =>
    dispatchNonAuth(handlers.PUT, req, ctx);

export const PATCH = (req: NextRequest, ctx: AuthRouteContext) =>
    dispatchNonAuth(handlers.PATCH, req, ctx);

export const DELETE = (req: NextRequest, ctx: AuthRouteContext) =>
    dispatchNonAuth(handlers.DELETE, req, ctx);

export const OPTIONS = (req: NextRequest, ctx: AuthRouteContext) =>
    dispatchNonAuth(handlers.OPTIONS, req, ctx);
