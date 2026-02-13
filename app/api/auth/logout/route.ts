import { fixedAuthRoute } from '../_shared';

export const runtime = 'nodejs';

const route = fixedAuthRoute(['logout']);

export const GET = route.GET;
export const POST = route.POST;
export const PUT = route.PUT;
export const PATCH = route.PATCH;
export const DELETE = route.DELETE;
export const OPTIONS = route.OPTIONS;
