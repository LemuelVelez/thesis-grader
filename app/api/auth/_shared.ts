import { NextRequest, NextResponse } from 'next/server';
import {
    createAuthRouteHandlers,
    type AuthRouteContext,
    type AuthRouteHandler,
} from '../../../database/routes/Route';
import type { DatabaseServices } from '../../../database/services/Services';
import { env } from '@/lib/env';
import { sendPasswordResetEmail } from '@/lib/email';

type DatabaseServicesResolver = () => DatabaseServices | Promise<DatabaseServices>;
type ZeroArgFactory = () => unknown | Promise<unknown>;
type ServiceGetter = (entity: string) => unknown;

type GlobalDatabaseServiceRegistry = typeof globalThis & {
    __thesisGraderDbServices?: DatabaseServices;
    __thesisGraderDbServicesResolver?: DatabaseServicesResolver;

    // Legacy/alternate keys found in older bootstraps
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
    services?: unknown;

    // Optional globally-exposed factories
    createDatabaseServices?: unknown;
    getDatabaseServices?: unknown;
    createDbServices?: unknown;
    getDbServices?: unknown;
    createServices?: unknown;
    getServices?: unknown;
    initDatabaseServices?: unknown;
    makeDatabaseServices?: unknown;

    // Route-level one-time import attempt flag
    __thesisGraderDbImportAttempted?: boolean;
};

function getAppBaseUrl(): string {
    const appUrl =
        env.APP_URL?.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const normalized = appUrl.trim();
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

async function sendPasswordResetEmailSafe(payload: {
    to: string;
    name: string;
    resetUrl: string;
}): Promise<void> {
    try {
        await sendPasswordResetEmail(payload);
    } catch (error) {
        // Do not fail auth routes when email/env is not configured.
        console.error('Password reset email dispatch failed:', error);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === 'function';
}

function hasMethod(target: unknown, methodName: string): boolean {
    return isRecord(target) && typeof target[methodName] === 'function';
}

function getServiceFromCandidate(candidate: Record<string, unknown>, key: string): unknown {
    const direct = candidate[key];
    if (direct !== undefined) return direct;

    const getter = candidate.get;
    if (!isFunction(getter)) return undefined;

    try {
        return (getter as ServiceGetter)(key);
    } catch {
        return undefined;
    }
}

/**
 * Accepts both:
 * 1) full DatabaseServices object
 * 2) "service registry" object exposing transaction + get(entity)
 * and hydrates required auth services.
 */
function normalizeToDatabaseServices(value: unknown): DatabaseServices | null {
    if (!isRecord(value)) return null;
    if (!isFunction(value.transaction)) return null;

    const users = getServiceFromCandidate(value, 'users');
    const sessions = getServiceFromCandidate(value, 'sessions');
    const passwordResets = getServiceFromCandidate(value, 'password_resets');
    const auditLogs = getServiceFromCandidate(value, 'audit_logs');

    const usersOk = hasMethod(users, 'findByEmail') && hasMethod(users, 'findById');
    const sessionsOk = hasMethod(sessions, 'findByTokenHash');
    const passwordResetsOk =
        hasMethod(passwordResets, 'create') &&
        hasMethod(passwordResets, 'findByTokenHash') &&
        hasMethod(passwordResets, 'markUsed');
    const auditLogsOk = hasMethod(auditLogs, 'create');

    if (!usersOk || !sessionsOk || !passwordResetsOk || !auditLogsOk) {
        return null;
    }

    const normalized = {
        ...(value as Partial<DatabaseServices>),
        users: users as DatabaseServices['users'],
        sessions: sessions as DatabaseServices['sessions'],
        password_resets: passwordResets as DatabaseServices['password_resets'],
        audit_logs: auditLogs as DatabaseServices['audit_logs'],
        transaction: value.transaction as DatabaseServices['transaction'],
    } as DatabaseServices;

    if (!isFunction((normalized as unknown as Record<string, unknown>).get)) {
        (normalized as unknown as { get: DatabaseServices['get'] }).get = ((entity: string) =>
            (normalized as unknown as Record<string, unknown>)[entity]) as DatabaseServices['get'];
    }

    return normalized;
}

function cacheResolvedServices(
    g: GlobalDatabaseServiceRegistry,
    services: DatabaseServices,
): DatabaseServices {
    g.__thesisGraderDbServices = services;
    g.__thesisGraderDbServicesResolver = async () => services;
    return services;
}

async function tryResolveFromResolver(candidate: unknown): Promise<DatabaseServices | null> {
    if (!isFunction(candidate)) return null;
    const resolved = await (candidate as () => unknown | Promise<unknown>)();
    return normalizeToDatabaseServices(resolved);
}

async function tryResolveFromFactory(candidate: unknown): Promise<DatabaseServices | null> {
    if (!isFunction(candidate)) return null;

    // Only call zero-arg factories to avoid unsafe invocation.
    const fn = candidate as ZeroArgFactory;
    if (fn.length > 0) return null;

    const resolved = await fn();
    return normalizeToDatabaseServices(resolved);
}

async function tryResolveFromModule(specifier: string): Promise<DatabaseServices | null> {
    try {
        const mod = (await import(specifier)) as Record<string, unknown>;

        // 1) Known object exports
        const objectExportKeys = [
            'default',
            'databaseServices',
            'dbServices',
            'services',
            'database',
            'db',
        ] as const;

        for (const key of objectExportKeys) {
            const value = mod[key];
            const normalized = normalizeToDatabaseServices(value);
            if (normalized) return normalized;
        }

        // 2) Known factory/resolver exports
        const functionExportKeys = [
            'default',
            'getDatabaseServices',
            'createDatabaseServices',
            'getDbServices',
            'createDbServices',
            'getServices',
            'createServices',
            'initDatabaseServices',
            'makeDatabaseServices',
            'buildDatabaseServices',
            'resolveDatabaseServices',
        ] as const;

        for (const key of functionExportKeys) {
            const candidate = mod[key];
            const resolved = await tryResolveFromFactory(candidate);
            if (resolved) return resolved;
        }

        // 3) Last chance: any zero-arg function export that returns services
        for (const candidate of Object.values(mod)) {
            const resolved = await tryResolveFromFactory(candidate);
            if (resolved) return resolved;
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Robust resolver that supports:
 * - canonical globals
 * - legacy globals/factories
 * - one-time dynamic module discovery for common DB bootstrap files
 */
async function resolveDatabaseServices(): Promise<DatabaseServices> {
    const g = globalThis as GlobalDatabaseServiceRegistry;

    // 1) Canonical resolver
    if (typeof g.__thesisGraderDbServicesResolver === 'function') {
        const resolved = await g.__thesisGraderDbServicesResolver();
        const normalized = normalizeToDatabaseServices(resolved);
        if (normalized) return cacheResolvedServices(g, normalized);
    }

    // 2) Canonical singleton
    {
        const normalized = normalizeToDatabaseServices(g.__thesisGraderDbServices);
        if (normalized) return cacheResolvedServices(g, normalized);
    }

    // 3) Legacy resolvers
    const legacyResolvers: unknown[] = [
        g.__databaseServicesResolver,
        g.__dbServicesResolver,
        g.__thesisGraderServicesResolver,
        g.databaseServicesResolver,
        g.dbServicesResolver,
    ];

    for (const candidate of legacyResolvers) {
        const resolved = await tryResolveFromResolver(candidate);
        if (resolved) return cacheResolvedServices(g, resolved);
    }

    // 4) Legacy singletons
    const legacyServices: unknown[] = [
        g.__databaseServices,
        g.__dbServices,
        g.__thesisGraderServices,
        g.databaseServices,
        g.dbServices,
        g.services,
    ];

    for (const candidate of legacyServices) {
        const normalized = normalizeToDatabaseServices(candidate);
        if (normalized) return cacheResolvedServices(g, normalized);
    }

    // 5) Global factories
    const globalFactories: unknown[] = [
        g.createDatabaseServices,
        g.getDatabaseServices,
        g.createDbServices,
        g.getDbServices,
        g.createServices,
        g.getServices,
        g.initDatabaseServices,
        g.makeDatabaseServices,
    ];

    for (const factory of globalFactories) {
        const resolved = await tryResolveFromFactory(factory);
        if (resolved) return cacheResolvedServices(g, resolved);
    }

    // 6) One-time dynamic module discovery
    if (!g.__thesisGraderDbImportAttempted) {
        g.__thesisGraderDbImportAttempted = true;

        const moduleSpecifiers = [
            // relative to app/api/auth/_shared.ts
            '../../../database/services/index',
            '../../../database/services',
            '../../../database/index',
            '../../../database',
            '../../../lib/database',
            '../../../lib/db',
            '../../../server/database',
            '../../../server/db',

            // tsconfig alias-based
            '@/database/services/index',
            '@/database/services',
            '@/database/index',
            '@/database',
            '@/lib/database',
            '@/lib/db',
            '@/server/database',
            '@/server/db',
        ];

        for (const specifier of moduleSpecifiers) {
            const resolved = await tryResolveFromModule(specifier);
            if (resolved) return cacheResolvedServices(g, resolved);
        }
    }

    throw new Error(
        'DatabaseServices resolver is not configured. Register services via setDatabaseServicesResolver(...), expose globalThis.__thesisGraderDbServices, or export a zero-arg database services factory/singleton from a common database module.',
    );
}

const authHandlers = createAuthRouteHandlers({
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
                        'Database services are not configured. Register a DatabaseServices resolver or expose a DatabaseServices singleton globally before calling /api/auth endpoints.',
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

function buildContext(slug?: readonly string[]): AuthRouteContext {
    if (!slug || slug.length === 0) return {};
    return { params: { slug: [...slug] } };
}

async function callAction(
    handler: AuthRouteHandler,
    req: NextRequest,
    slug?: readonly string[],
): Promise<Response> {
    return handler(req, buildContext(slug));
}

export function fixedAuthRoute(slug?: readonly string[]) {
    return {
        GET: (req: NextRequest) => callAction(authHandlers.GET, req, slug),
        POST: (req: NextRequest) => callAction(authHandlers.POST, req, slug),
        PUT: (req: NextRequest) => callAction(authHandlers.PUT, req, slug),
        PATCH: (req: NextRequest) => callAction(authHandlers.PATCH, req, slug),
        DELETE: (req: NextRequest) => callAction(authHandlers.DELETE, req, slug),
        OPTIONS: (req: NextRequest) => callAction(authHandlers.OPTIONS, req, slug),
    };
}
