import { createAuthRouteHandlers } from '../../../../database/routes/Route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseCsv(value?: string): string[] {
    if (!value) return [];
    return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
}

function parseNumber(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined): boolean | undefined {
    if (!value) return undefined;
    const v = value.trim().toLowerCase();

    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off'].includes(v)) return false;

    return undefined;
}

function parseSameSite(
    value: string | undefined,
): 'lax' | 'strict' | 'none' | undefined {
    if (!value) return undefined;
    const v = value.trim().toLowerCase();
    if (v === 'lax' || v === 'strict' || v === 'none') return v;
    return undefined;
}

function parseCorsOrigin(
    raw: string | undefined,
): '*' | string | string[] {
    if (!raw || raw.trim() === '' || raw.trim() === '*') {
        return '*';
    }

    const list = parseCsv(raw);
    if (list.length === 0) return '*';
    if (list.length === 1) return list[0];
    return list;
}

const handlers = createAuthRouteHandlers({
    /**
     * IMPORTANT:
     * Database services must be provided by either:
     * - setDatabaseServicesResolver(...) in server bootstrap
     * - globalThis.__thesisGraderDbServices
     * - globalThis.__thesisGraderDbServicesResolver
     */
    auth: {
        cookieName: process.env.AUTH_COOKIE_NAME ?? 'tg_session',
        sessionTtlHours: parseNumber(
            process.env.AUTH_SESSION_TTL_HOURS,
            24 * 7,
        ),
        resetTokenTtlMinutes: parseNumber(
            process.env.AUTH_RESET_TOKEN_TTL_MINUTES,
            30,
        ),
        secureCookies:
            parseBoolean(process.env.AUTH_COOKIE_SECURE) ??
            process.env.NODE_ENV === 'production',
        cookieDomain: process.env.AUTH_COOKIE_DOMAIN || undefined,
        cookiePath: process.env.AUTH_COOKIE_PATH || '/',
        sameSite: parseSameSite(process.env.AUTH_COOKIE_SAME_SITE) ?? 'lax',
    },
    cors: {
        origin: parseCorsOrigin(
            process.env.AUTH_CORS_ORIGIN ?? process.env.CORS_ORIGIN,
        ),
        credentials: true,
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['Set-Cookie'],
        maxAge: parseNumber(process.env.AUTH_CORS_MAX_AGE, 600),
    },
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
export const OPTIONS = handlers.OPTIONS;
