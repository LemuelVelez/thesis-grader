import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import type { UserRow } from '../../../../database/models/Model';
import type { DatabaseServices } from '../../../../database/services/Services';
import { resolveDatabaseServices } from '../../../../database/services/resolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SESSION_COOKIE_NAME = 'tg_session';

type PublicUser = Omit<UserRow, 'password_hash'>;

function json(status: number, payload: Record<string, unknown>): NextResponse {
    const hasOk = Object.prototype.hasOwnProperty.call(payload, 'ok');
    return NextResponse.json(
        hasOk ? payload : { ok: status >= 200 && status < 300, ...payload },
        { status },
    );
}

function clearSessionCookie(response: NextResponse): void {
    response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: '',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires: new Date(0),
    });
}

function trimToString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    return v.length > 0 ? v : null;
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function sessionTokenFromRequest(req: NextRequest): string | null {
    const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value?.trim();
    if (cookieToken) return cookieToken;

    const authorization = req.headers.get('authorization');
    if (authorization) {
        const match = authorization.match(/^Bearer\s+(.+)$/i);
        const bearer = match?.[1]?.trim();
        if (bearer) return bearer;
    }

    const headerToken = req.headers.get('x-session-token')?.trim();
    if (headerToken) return headerToken;

    return null;
}

function toPublicUser(user: UserRow): PublicUser {
    const { password_hash: _passwordHash, ...publicUser } = user;
    return publicUser;
}

function isExpired(isoDateTime: string): boolean {
    return new Date(isoDateTime).getTime() <= Date.now();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function readJsonRecord(
    req: NextRequest,
): Promise<Record<string, unknown> | null> {
    try {
        const body = (await req.json()) as unknown;
        return isRecord(body) ? body : null;
    } catch {
        return null;
    }
}

async function resolveAuthedSession(
    req: NextRequest,
    services: DatabaseServices,
): Promise<{ user: UserRow; sessionId: string } | null> {
    const token = sessionTokenFromRequest(req);
    if (!token) return null;

    const tokenHash = sha256(token);
    const session = await services.sessions.findByTokenHash(tokenHash);
    if (!session) return null;

    if (isExpired(session.expires_at)) {
        await services.sessions.delete({ id: session.id });
        return null;
    }

    const user = await services.users.findById(session.user_id);
    if (!user || user.status !== 'active') {
        return null;
    }

    return { user, sessionId: session.id };
}

function scryptHash(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 64).toString('hex');
    return `scrypt$${salt}$${derived}`;
}

function scryptVerify(password: string, storedHash: string): boolean {
    if (!storedHash.startsWith('scrypt$')) return false;

    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;

    const salt = parts[1];
    const expectedHex = parts[2];

    try {
        const actual = scryptSync(password, salt, 64);
        const expected = Buffer.from(expectedHex, 'hex');

        if (actual.length !== expected.length) return false;
        return timingSafeEqual(actual, expected);
    } catch {
        return false;
    }
}

async function hashPassword(password: string): Promise<string> {
    try {
        const bcrypt = await import('bcryptjs');
        if (typeof bcrypt.hash === 'function') {
            return await bcrypt.hash(password, 12);
        }
    } catch {
        // ignore and fallback
    }

    return scryptHash(password);
}

async function verifyPassword(password: string, storedHash: unknown): Promise<boolean> {
    if (typeof storedHash !== 'string' || storedHash.length === 0) return false;

    if (
        storedHash.startsWith('$2a$') ||
        storedHash.startsWith('$2b$') ||
        storedHash.startsWith('$2y$')
    ) {
        try {
            const bcrypt = await import('bcryptjs');
            if (typeof bcrypt.compare === 'function') {
                return await bcrypt.compare(password, storedHash);
            }
            return false;
        } catch {
            return false;
        }
    }

    return scryptVerify(password, storedHash);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    try {
        const services = await resolveDatabaseServices();
        const auth = await resolveAuthedSession(req, services);

        if (!auth) {
            const res = json(401, { error: 'Unauthorized.' });
            clearSessionCookie(res);
            return res;
        }

        return json(200, { user: toPublicUser(auth.user) });
    } catch (error) {
        return json(500, {
            error: 'Failed to load profile.',
            message: error instanceof Error ? error.message : 'Unknown error.',
        });
    }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
    try {
        const services = await resolveDatabaseServices();
        const auth = await resolveAuthedSession(req, services);

        if (!auth) {
            const res = json(401, { error: 'Unauthorized.' });
            clearSessionCookie(res);
            return res;
        }

        const body = await readJsonRecord(req);
        if (!body) return json(400, { error: 'Invalid JSON body.' });

        const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
        const hasEmail = Object.prototype.hasOwnProperty.call(body, 'email');
        const hasCurrentPassword = Object.prototype.hasOwnProperty.call(body, 'currentPassword');
        const hasNewPassword = Object.prototype.hasOwnProperty.call(body, 'newPassword');

        if (!hasName && !hasEmail && !hasCurrentPassword && !hasNewPassword) {
            return json(400, {
                error: 'Nothing to update. Provide name/email and/or currentPassword/newPassword.',
            });
        }

        let nextName = auth.user.name;
        let nextEmail = auth.user.email;
        let nextPasswordHash: string | null = null;

        if (hasName) {
            const name = trimToString(body.name);
            if (!name) return json(400, { error: 'Name is required.' });
            if (name.length < 2 || name.length > 120) {
                return json(400, { error: 'Name must be between 2 and 120 characters.' });
            }
            nextName = name;
        }

        if (hasEmail) {
            const rawEmail = trimToString(body.email);
            if (!rawEmail) return json(400, { error: 'Email is required.' });

            const email = normalizeEmail(rawEmail);
            if (!isValidEmail(email)) {
                return json(400, { error: 'Email format is invalid.' });
            }
            nextEmail = email;
        }

        if (hasCurrentPassword || hasNewPassword) {
            const currentPassword = trimToString(body.currentPassword);
            const newPassword = trimToString(body.newPassword);

            if (!currentPassword) {
                return json(400, { error: 'Current password is required.' });
            }
            if (!newPassword) {
                return json(400, { error: 'New password is required.' });
            }
            if (newPassword.length < 8 || newPassword.length > 128) {
                return json(400, {
                    error: 'New password must be between 8 and 128 characters.',
                });
            }

            const isCurrentValid = await verifyPassword(
                currentPassword,
                auth.user.password_hash,
            );
            if (!isCurrentValid) {
                return json(400, { error: 'Current password is incorrect.' });
            }

            nextPasswordHash = await hashPassword(newPassword);
        }

        if (nextEmail !== auth.user.email) {
            const existing = await services.users.findByEmail(nextEmail);
            if (existing && existing.id !== auth.user.id) {
                return json(409, { error: 'Email is already in use.' });
            }
        }

        const patch: Record<string, unknown> = {};
        if (nextName !== auth.user.name) patch.name = nextName;
        if (nextEmail !== auth.user.email) patch.email = nextEmail;
        if (nextPasswordHash) patch.password_hash = nextPasswordHash;

        if (Object.keys(patch).length === 0) {
            return json(200, {
                message: 'No changes detected.',
                user: toPublicUser(auth.user),
            });
        }

        patch.updated_at = new Date().toISOString();

        const updated = await services.users.updateOne(
            { id: auth.user.id },
            patch as Parameters<DatabaseServices['users']['updateOne']>[1],
        );

        if (!updated) return json(404, { error: 'User not found.' });

        try {
            await services.audit_logs.create({
                actor_id: auth.user.id,
                action: 'auth.me.update',
                entity: 'users',
                entity_id: auth.user.id,
                details: {
                    profile_changed:
                        (nextName !== auth.user.name) || (nextEmail !== auth.user.email),
                    password_changed: Boolean(nextPasswordHash),
                },
            });
        } catch {
            // Do not fail the request if audit logging fails.
        }

        return json(200, {
            message: nextPasswordHash
                ? 'Profile and password updated.'
                : 'Profile updated.',
            user: toPublicUser(updated),
        });
    } catch (error) {
        return json(500, {
            error: 'Failed to update profile.',
            message: error instanceof Error ? error.message : 'Unknown error.',
        });
    }
}
