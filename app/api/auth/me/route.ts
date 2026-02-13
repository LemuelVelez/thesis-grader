import { NextRequest } from 'next/server';
import { createAuthRouteHandlers } from '../../../../database/routes/Route';

export const runtime = 'nodejs';

const handlers = createAuthRouteHandlers();

function authCtx(slug: string[]) {
    // Use plain object params for compatibility with handlers that expect
    // context.params.slug directly (non-Promise style).
    return { params: { slug } };
}

export async function GET(req: NextRequest) {
    return handlers.GET(req, authCtx(['me']) as any);
}

export async function OPTIONS(req: NextRequest) {
    return handlers.OPTIONS(req, authCtx(['me']) as any);
}
