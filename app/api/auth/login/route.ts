import type { NextRequest } from 'next/server';
import type { AuthRouteContext } from '../../../../database/routes/Route';
import {
    OPTIONS as API_OPTIONS,
    POST as API_POST,
} from '../../[[...slug]]/route';

export const runtime = 'nodejs';

function apiCtx(slug: string[]): AuthRouteContext {
    return { params: Promise.resolve({ slug }) };
}

export async function POST(req: NextRequest) {
    return API_POST(req, apiCtx(['login']));
}

export async function OPTIONS(req: NextRequest) {
    return API_OPTIONS(req, apiCtx(['login']));
}
