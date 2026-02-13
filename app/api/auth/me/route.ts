import type { NextRequest } from 'next/server';
import type { AuthRouteContext } from '../../../../database/routes/Route';
import {
    GET as API_GET,
    OPTIONS as API_OPTIONS,
} from '../../[[...slug]]/route';

export const runtime = 'nodejs';

function apiCtx(slug: string[]): AuthRouteContext {
    return { params: Promise.resolve({ slug }) };
}

export async function GET(req: NextRequest) {
    return API_GET(req, apiCtx(['me']));
}

export async function OPTIONS(req: NextRequest) {
    return API_OPTIONS(req, apiCtx(['me']));
}
