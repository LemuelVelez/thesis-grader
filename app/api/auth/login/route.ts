import { NextRequest } from 'next/server';
import { createAuthRouteHandlers } from '../../../../database/routes/Route';

export const runtime = 'nodejs';

const handlers = createAuthRouteHandlers();

function authCtx(slug: string[]) {
    return { params: Promise.resolve({ slug }) };
}

export async function POST(req: NextRequest) {
    return handlers.POST(req, authCtx(['login']));
}

export async function OPTIONS(req: NextRequest) {
    return handlers.OPTIONS(req, authCtx(['login']));
}
