import { createApiRouteHandlers } from '../../../database/routes/Route';

export const runtime = 'nodejs';

const handlers = createApiRouteHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
export const OPTIONS = handlers.OPTIONS;
