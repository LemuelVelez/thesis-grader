import type { NextRequest } from 'next/server';
import {
    createAuthRouteHandlers,
    type AuthRouteContext,
} from '../../../../database/routes/Route';
import { resolveDatabaseServices } from '../../../../database/services/resolver';

export const runtime = 'nodejs';

const handlers = createAuthRouteHandlers({
    resolveServices: resolveDatabaseServices,
});

function authCtx(slug: string[]): AuthRouteContext {
    return { params: Promise.resolve({ slug }) };
}

export async function POST(req: NextRequest) {
    return handlers.POST(req, authCtx(['logout']));
}

export async function DELETE(req: NextRequest) {
    return handlers.DELETE(req, authCtx(['logout']));
}

export async function OPTIONS(req: NextRequest) {
    return handlers.OPTIONS(req, authCtx(['logout']));
}
