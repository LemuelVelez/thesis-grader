import { NextResponse } from 'next/server';
import { createApiRouteHandlers } from '../../../database/routes/Route';
import type { DatabaseServices } from '../../../database/services/Services';

export const runtime = 'nodejs';

type DatabaseServicesResolver = () => DatabaseServices | Promise<DatabaseServices>;

type GlobalDatabaseServiceRegistry = typeof globalThis & {
    __thesisGraderDbServices?: DatabaseServices;
    __thesisGraderDbServicesResolver?: DatabaseServicesResolver;

    // Legacy / alternate global keys (for backward compatibility)
    __databaseServices?: unknown;
    __databaseServicesResolver?: unknown;
    __dbServices?: unknown;
    __dbServicesResolver?: unknown;
    __thesisGraderServices?: unknown;
    __thesisGraderServicesResolver?: unknown;
    databaseServices?: unknown;
    databaseServicesResolver?: unknown;
    dbServices?: unknown;
    dbServicesResolver?: unknown;

    // Optional globally-exposed factories
    createDatabaseServices?: unknown;
    getDatabaseServices?: unknown;
    createDbServices?: unknown;
    getDbServices?: unknown;
};

function getAppBaseUrl(): string {
    const appUrl =
        process.env.APP_URL?.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        (process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'http://localhost:3000');

    const normalized = appUrl.trim();
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

async function sendPasswordResetEmailSafe(payload: {
    to: string;
    name: string;
    resetUrl: string;
}): Promise<void> {
    try {
        const emailModule = await import('@/lib/email');
        if (typeof emailModule.sendPasswordResetEmail === 'function') {
            await emailModule.sendPasswordResetEmail(payload);
        }
    } catch (error) {
        // Do not fail auth routes when email/env is not configured.
        console.error('Password reset email dispatch failed:', error);
    }
}

function isDatabaseServices(value: unknown): value is DatabaseServices {
    if (!value || typeof value !== 'object') return false;

    const maybe = value as Partial<DatabaseServices>;
    const users = maybe.users as { findByEmail?: unknown } | undefined;
    const sessions = maybe.sessions as { findByTokenHash?: unknown } | undefined;

    return (
        typeof maybe.transaction === 'function' &&
        !!users &&
        typeof users.findByEmail === 'function' &&
        !!sessions &&
        typeof sessions.findByTokenHash === 'function'
    );
}

async function tryResolveFromResolver(
    resolver: unknown,
): Promise<DatabaseServices | null> {
    if (typeof resolver !== 'function') return null;

    const resolved = await (resolver as () => unknown | Promise<unknown>)();
    return isDatabaseServices(resolved) ? resolved : null;
}

async function tryResolveFromFactory(factory: unknown): Promise<DatabaseServices | null> {
    if (typeof factory !== 'function') return null;

    const resolved = await (factory as () => unknown | Promise<unknown>)();
    return isDatabaseServices(resolved) ? resolved : null;
}

/**
 * Resolves DatabaseServices with support for legacy global keys.
 * This fixes 503 "DatabaseServices resolver is not configured" in setups
 * where services were registered under older names.
 */
async function resolveDatabaseServices(): Promise<DatabaseServices> {
    const g = globalThis as GlobalDatabaseServiceRegistry;

    // 1) Canonical resolver
    if (typeof g.__thesisGraderDbServicesResolver === 'function') {
        const resolved = await g.__thesisGraderDbServicesResolver();
        if (isDatabaseServices(resolved)) return resolved;
    }

    // 2) Canonical singleton
    if (isDatabaseServices(g.__thesisGraderDbServices)) {
        return g.__thesisGraderDbServices;
    }

    // 3) Legacy resolvers (bridge to canonical)
    const legacyResolvers: unknown[] = [
        g.__databaseServicesResolver,
        g.__dbServicesResolver,
        g.__thesisGraderServicesResolver,
        g.databaseServicesResolver,
        g.dbServicesResolver,
    ];

    for (const candidate of legacyResolvers) {
        const resolved = await tryResolveFromResolver(candidate);
        if (resolved) {
            g.__thesisGraderDbServices = resolved;
            g.__thesisGraderDbServicesResolver = async () => resolved;
            return resolved;
        }
    }

    // 4) Legacy singletons (bridge to canonical)
    const legacyServices: unknown[] = [
        g.__databaseServices,
        g.__dbServices,
        g.__thesisGraderServices,
        g.databaseServices,
        g.dbServices,
    ];

    for (const candidate of legacyServices) {
        if (isDatabaseServices(candidate)) {
            g.__thesisGraderDbServices = candidate;
            g.__thesisGraderDbServicesResolver = async () => candidate;
            return candidate;
        }
    }

    // 5) Optional global factories (bridge to canonical)
    const factoryCandidates: unknown[] = [
        g.createDatabaseServices,
        g.getDatabaseServices,
        g.createDbServices,
        g.getDbServices,
    ];

    for (const factory of factoryCandidates) {
        const resolved = await tryResolveFromFactory(factory);
        if (resolved) {
            g.__thesisGraderDbServices = resolved;
            g.__thesisGraderDbServicesResolver = async () => resolved;
            return resolved;
        }
    }

    throw new Error(
        'DatabaseServices resolver is not configured. Call setDatabaseServicesResolver(...) or set globalThis.__thesisGraderDbServices.',
    );
}

const handlers = createApiRouteHandlers({
    resolveServices: resolveDatabaseServices,
    auth: {
        onPasswordResetRequested: async ({ email, token, user }) => {
            const resetUrl = `${getAppBaseUrl()}/auth/password/reset?token=${encodeURIComponent(token)}`;
            await sendPasswordResetEmailSafe({
                to: email,
                name: user.name,
                resetUrl,
            });
        },
    },
    onError: async (error) => {
        const message = error instanceof Error ? error.message : 'Unknown error.';

        if (/DatabaseServices resolver is not configured/i.test(message)) {
            return NextResponse.json(
                {
                    error: 'Service unavailable.',
                    message:
                        'Database services are not configured. Register a DatabaseServices resolver or expose a DatabaseServices singleton globally before calling /api endpoints.',
                },
                { status: 503 },
            );
        }

        // Common database/network outage patterns -> 503
        if (
            /(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|connection timed out|could not connect|timeout expired|database is unavailable|the database system is starting up|terminating connection)/i.test(
                message,
            )
        ) {
            return NextResponse.json(
                {
                    error: 'Service unavailable.',
                    message:
                        'Database connection is unavailable. Check DATABASE_URL, database host/port reachability, and DB container/server health.',
                },
                { status: 503 },
            );
        }

        return NextResponse.json(
            {
                error: 'Internal server error.',
                message,
            },
            { status: 500 },
        );
    },
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
export const OPTIONS = handlers.OPTIONS;
