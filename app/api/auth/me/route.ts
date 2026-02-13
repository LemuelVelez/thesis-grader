import { NextRequest } from 'next/server';
import { createAuthRouteHandlers } from '../../../../database/routes/Route';

export const runtime = 'nodejs';

const handlers = createAuthRouteHandlers();

function authCtx(slug: string[]) {
    return { params: Promise.resolve({ slug }) };
}

export async function GET(req: NextRequest) {
    return handlers.GET(req, authCtx(['me']));
}

export async function OPTIONS(req: NextRequest) {
    return handlers.OPTIONS(req, authCtx(['me']));
}
