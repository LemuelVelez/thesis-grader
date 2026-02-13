import { NextResponse } from 'next/server';
import { createApiRouteHandlers } from '../../../database/routes/Route';

export const runtime = 'nodejs';

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

const handlers = createApiRouteHandlers({
    /**
     * Important fix:
     * - Do NOT override resolveServices here.
     * - Let createApiRouteHandlers use Route.ts default resolver, which supports
     *   setDatabaseServicesResolver(...) and canonical globals.
     * This avoids false 503 on /api/auth/me when services are registered via module resolver.
     */
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
                        'Database services are not configured. Ensure setDatabaseServicesResolver(...) is called during bootstrap, or expose globalThis.__thesisGraderDbServices / globalThis.__thesisGraderDbServicesResolver.',
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
