import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { resolveDatabaseServices } from '../../../../../database/services/resolver';
import type { DatabaseServices } from '../../../../../database/services/Services';
import type { UserRow } from '../../../../../database/models/Model';
import { createPresignedPutUrl } from '@/lib/s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SESSION_COOKIE_NAME = 'tg_session';

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

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
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

async function resolveAuthedUser(
    req: NextRequest,
    services: DatabaseServices,
): Promise<UserRow | null> {
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

    return user;
}

function sanitizeFilename(filename: string): string {
    const base = filename.split(/[\\/]/).pop() ?? 'avatar';
    return base
        .replace(/[^\w.-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^\.+/, '')
        .slice(0, 120) || 'avatar';
}

function getExtension(filename: string): string {
    const safe = sanitizeFilename(filename);
    const idx = safe.lastIndexOf('.');
    if (idx <= 0) return '';
    const ext = safe.slice(idx).toLowerCase();
    return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
}

function buildAvatarKey(userId: string, filename: string): string {
    const ext = getExtension(filename) || '.jpg';
    const stamp = Date.now();
    const rand = randomBytes(8).toString('hex');
    return `avatars/${userId}/${stamp}-${rand}${ext}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const services = await resolveDatabaseServices();
        const user = await resolveAuthedUser(req, services);

        if (!user) {
            const res = json(401, { error: 'Unauthorized.' });
            clearSessionCookie(res);
            return res;
        }

        const body = await readJsonRecord(req);
        if (!body) return json(400, { error: 'Invalid JSON body.' });

        const filename = trimToString(body.filename) ?? 'avatar.jpg';
        const contentType = trimToString(body.contentType);

        if (!contentType || !contentType.toLowerCase().startsWith('image/')) {
            return json(400, { error: 'contentType must be an image MIME type.' });
        }

        const key = buildAvatarKey(user.id, filename);
        const url = await createPresignedPutUrl({
            key,
            contentType,
            expiresInSeconds: 60,
        });

        return json(200, { key, url });
    } catch (error) {
        return json(500, {
            error: 'Failed to prepare avatar upload.',
            message: error instanceof Error ? error.message : 'Unknown error.',
        });
    }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
    try {
        const services = await resolveDatabaseServices();
        const user = await resolveAuthedUser(req, services);

        if (!user) {
            const res = json(401, { error: 'Unauthorized.' });
            clearSessionCookie(res);
            return res;
        }

        const body = await readJsonRecord(req);
        if (!body) return json(400, { error: 'Invalid JSON body.' });

        const key = trimToString(body.key);
        if (!key) return json(400, { error: 'key is required.' });

        const expectedPrefix = `avatars/${user.id}/`;
        if (!key.startsWith(expectedPrefix)) {
            return json(400, { error: 'Invalid avatar key for current user.' });
        }

        const updated = await services.users.setAvatarKey(user.id, key);
        if (!updated) return json(404, { error: 'User not found.' });

        try {
            await services.audit_logs.create({
                actor_id: user.id,
                action: 'users.me.avatar.update',
                entity: 'users',
                entity_id: user.id,
                details: { avatar_key: key },
            });
        } catch {
            // Do not fail if audit logging fails.
        }

        return json(200, { item: { id: updated.id, avatar_key: updated.avatar_key } });
    } catch (error) {
        return json(500, {
            error: 'Failed to save avatar.',
            message: error instanceof Error ? error.message : 'Unknown error.',
        });
    }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
    try {
        const services = await resolveDatabaseServices();
        const user = await resolveAuthedUser(req, services);

        if (!user) {
            const res = json(401, { error: 'Unauthorized.' });
            clearSessionCookie(res);
            return res;
        }

        const updated = await services.users.setAvatarKey(user.id, null);
        if (!updated) return json(404, { error: 'User not found.' });

        try {
            await services.audit_logs.create({
                actor_id: user.id,
                action: 'users.me.avatar.remove',
                entity: 'users',
                entity_id: user.id,
                details: null,
            });
        } catch {
            // Do not fail if audit logging fails.
        }

        return json(200, { item: { id: updated.id, avatar_key: updated.avatar_key } });
    } catch (error) {
        return json(500, {
            error: 'Failed to remove avatar.',
            message: error instanceof Error ? error.message : 'Unknown error.',
        });
    }
}
