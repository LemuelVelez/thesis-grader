import { NextRequest } from 'next/server';
import {
    createApiRouteHandlers,
    type AuthRouteContext,
} from '../../../database/routes/Route';
import { resolveDatabaseServices } from '../../../database/services/resolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const handlers = createApiRouteHandlers({
    resolveServices: resolveDatabaseServices,
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
