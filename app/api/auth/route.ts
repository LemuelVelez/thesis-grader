import type { NextRequest } from 'next/server';
import type { AuthRouteContext } from '../../../database/routes/Route';
import { OPTIONS as API_OPTIONS } from '../[[...slug]]/route';

export const runtime = 'nodejs';

function apiCtx(slug: string[] = []): AuthRouteContext {
    return { params: Promise.resolve({ slug }) };
}

export async function GET() {
    return Response.json({ message: 'Auth route not found.' }, { status: 404 });
}

export async function OPTIONS(req: NextRequest) {
    return API_OPTIONS(req, apiCtx([]));
}
