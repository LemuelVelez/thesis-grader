import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { resolveDatabaseServices } from '../../../../../database/services/resolver';
import type { DatabaseServices } from '../../../../../database/services/Services';
import type { UserPatch, UserRow } from '../../../../../database/models/Model';
import {
    buildS3ObjectUrl,
    createPresignedGetUrl,
    createPresignedPutUrl,
} from '@/lib/s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SESSION_COOKIE_NAME = 'tg_session';

function json(status: number, payload: Record<string, unknown>): NextResponse {
    const hasOk = Object.prototype.hasOwnProperty.call(payload, 'ok');
    return NextResponse.json(
        hasOk ? payload : { ok: status >= 200 && status < 300, ...payload },
        {
            status,
            headers: {
                'Cache-Control': 'no-store',
            },
        },
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

function firstNonEmptyString(values: unknown[]): string | null {
    for (const value of values) {
        const s = trimToString(value);
        if (s) return s;
    }
    return null;
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
    return (
        base
            .replace(/[^\w.-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^\.+/, '')
            .slice(0, 120) || 'avatar'
    );
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

function isHttpUrl(value: string): boolean {
    try {
        const u = new URL(value);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function normalizeKey(value: string): string {
    return value.trim().replace(/^\/+/, '');
}

/**
 * Accepts either:
 * - raw key: avatars/<userId>/...
 * - full URL: https://bucket.s3.region.amazonaws.com/avatars/<userId>/...
 * Returns extracted key if possible.
 */
function extractAvatarKey(input: string): string | null {
    const raw = trimToString(input);
    if (!raw) return null;

    if (!isHttpUrl(raw)) {
        const key = normalizeKey(raw);
        return key.length > 0 ? key : null;
    }

    try {
        const u = new URL(raw);
        const pathname = u.pathname.replace(/^\/+/, '');
        if (!pathname) return null;

        try {
            const decoded = decodeURIComponent(pathname);
            return decoded.length > 0 ? decoded : null;
        } catch {
            return pathname;
        }
    } catch {
        return null;
    }
}

function isOwnAvatarKey(key: string, userId: string): boolean {
    return key.startsWith(`avatars/${userId}/`);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    try {
        const services = await resolveDatabaseServices();
        const user = await resolveAuthedUser(req, services);

        if (!user) {
            const res = json(401, { error: 'Unauthorized.' });
            clearSessionCookie(res);
            return res;
        }

        const storedAvatar = trimToString(
            (user as unknown as { avatar_key?: unknown }).avatar_key ?? null,
        );

        if (!storedAvatar) {
            return json(200, {
                item: {
                    id: user.id,
                    avatar_key: null,
                    avatar_url: null,
                    avatar_object_url: null,
                    url: null,
                },
            });
        }

        const storedIsUrl = isHttpUrl(storedAvatar);
        const extractedKey = extractAvatarKey(storedAvatar);

        if (extractedKey && !isOwnAvatarKey(extractedKey, user.id)) {
            // Safety: never expose another user's avatar path.
            return json(200, {
                item: {
                    id: user.id,
                    avatar_key: null,
                    avatar_url: null,
                    avatar_object_url: null,
                    url: null,
                },
            });
        }

        let resolvedAvatarUrl: string;

        if (storedIsUrl) {
            // New format: DB already stores full object URL
            resolvedAvatarUrl = storedAvatar;
        } else if (extractedKey) {
            // Legacy format: DB stores key. Build object URL for best UX.
            resolvedAvatarUrl = buildS3ObjectUrl(extractedKey);

            // Best-effort migration: convert stored key -> object URL
            try {
                const patchPayload: UserPatch = { avatar_key: resolvedAvatarUrl };
                await services.users.updateOne({ id: user.id }, patchPayload);
            } catch {
                // Do not fail GET if migration update fails.
            }
        } else {
            // Fallback for unexpected legacy data
            resolvedAvatarUrl = await createPresignedGetUrl({
                key: storedAvatar,
                expiresInSeconds: 3600,
                responseContentDisposition: 'inline',
            });
        }

        // Keep compatibility fields for existing frontend parsers.
        return json(200, {
            item: {
                id: user.id,
                avatar_key: extractedKey ?? storedAvatar,
                avatar_url: resolvedAvatarUrl,
                avatar_object_url: resolvedAvatarUrl,
                url: resolvedAvatarUrl,
            },
        });
    } catch (error) {
        return json(500, {
            error: 'Failed to load avatar.',
            message: error instanceof Error ? error.message : 'Unknown error.',
        });
    }
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
        const uploadUrl = await createPresignedPutUrl({
            key,
            contentType,
            expiresInSeconds: 60,
        });
        const objectUrl = buildS3ObjectUrl(key);

        // Backward-compatible response:
        // - url: upload URL (legacy clients)
        // - uploadUrl: explicit upload URL
        // - objectUrl: URL that should be saved in DB
        return json(200, { key, url: uploadUrl, uploadUrl, objectUrl });
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

        // Accept either key or URL payloads for compatibility.
        const rawKeyOrUrl = firstNonEmptyString([
            body.key,
            body.objectUrl,
            body.object_url,
            body.avatarUrl,
            body.avatar_url,
            body.url,
        ]);

        if (!rawKeyOrUrl) {
            return json(400, {
                error: 'Provide key or object URL (objectUrl/url/avatar_url).',
            });
        }

        const key = extractAvatarKey(rawKeyOrUrl);
        if (!key) return json(400, { error: 'Invalid avatar key/object URL.' });

        if (!isOwnAvatarKey(key, user.id)) {
            return json(400, { error: 'Invalid avatar key for current user.' });
        }

        const objectUrl = buildS3ObjectUrl(key);

        // ✅ Save OBJECT URL in DB (per requirement), not raw key.
        const patchPayload: UserPatch = {
            avatar_key: objectUrl,
        };

        const updated = await services.users.updateOne({ id: user.id }, patchPayload);
        if (!updated) return json(404, { error: 'User not found.' });

        try {
            await services.audit_logs.create({
                actor_id: user.id,
                action: 'users.me.avatar.update',
                entity: 'users',
                entity_id: user.id,
                details: { avatar_key: key, avatar_object_url: objectUrl },
            });
        } catch {
            // Do not fail if audit logging fails.
        }

        return json(200, {
            item: {
                id: updated.id,
                avatar_key: key,
                avatar_url: objectUrl,
                avatar_object_url: objectUrl,
                url: objectUrl,
            },
        });
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

        // ✅ Clear ONLY avatar_key column
        const patchPayload: UserPatch = {
            avatar_key: null,
        };

        const updated = await services.users.updateOne({ id: user.id }, patchPayload);
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

        return json(200, {
            item: {
                id: updated.id,
                avatar_key: null,
                avatar_url: null,
                avatar_object_url: null,
                url: null,
            },
        });
    } catch (error) {
        return json(500, {
            error: 'Failed to remove avatar.',
            message: error instanceof Error ? error.message : 'Unknown error.',
        });
    }
}
