/**
 * AuthController for Next.js (App Router / Route Handlers)
 * --------------------------------------------------------
 * Handles:
 * - register
 * - login
 * - logout
 * - me
 * - refresh (rotate session)
 * - forgotPassword
 * - resetPassword
 *
 * Notes:
 * - Uses `DatabaseServices` contracts from database/services/Services.ts
 * - Stores session token hash in DB and token value in httpOnly cookie
 * - Requires Node.js runtime (uses node:crypto)
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import {
    THESIS_ROLES,
    type JsonValue,
    type ThesisRole,
    type UserRow,
    type UUID,
} from '../models/Model';
import type { DatabaseServices } from '../services/Services';

export type PublicUser = Omit<UserRow, 'password_hash'>;

interface RegisterBody {
    name?: unknown;
    email?: unknown;
    password?: unknown;
    role?: unknown;
}

interface LoginBody {
    email?: unknown;
    password?: unknown;
}

interface ForgotPasswordBody {
    email?: unknown;
}

interface ResetPasswordBody {
    token?: unknown;
    newPassword?: unknown;
}

export interface PasswordResetNotificationPayload {
    email: string;
    token: string;
    expiresAt: string;
    user: PublicUser;
}

export interface AuthControllerOptions {
    /**
     * Cookie name used for session token.
     * Default: "tg_session"
     */
    cookieName?: string;

    /**
     * Session TTL in hours.
     * Default: 24 * 7 (7 days)
     */
    sessionTtlHours?: number;

    /**
     * Password reset token TTL in minutes.
     * Default: 30
     */
    resetTokenTtlMinutes?: number;

    /**
     * Use secure cookies (https only).
     * Default: process.env.NODE_ENV === "production"
     */
    secureCookies?: boolean;

    /**
     * Cookie domain/path/sameSite settings.
     */
    cookieDomain?: string;
    cookiePath?: string;
    sameSite?: 'lax' | 'strict' | 'none';

    /**
     * Optional callback to send reset token via email/SMS/etc.
     * If omitted, token is generated and stored but not dispatched.
     */
    onPasswordResetRequested?: (
        payload: PasswordResetNotificationPayload,
    ) => Promise<void> | void;
}

/* -------------------------------------------------------------------------- */
/*                                  UTILITIES                                 */
/* -------------------------------------------------------------------------- */

function nowIso(): string {
    return new Date().toISOString();
}

function futureIsoFromHours(hours: number): string {
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function futureIsoFromMinutes(minutes: number): string {
    return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function isExpired(isoDateTime: string): boolean {
    return new Date(isoDateTime).getTime() <= Date.now();
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
    // Practical email validation (not RFC-perfect, but robust enough for API-level checks).
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidRole(role: string): role is ThesisRole {
    return (THESIS_ROLES as readonly string[]).includes(role);
}

function toPublicUser(user: UserRow): PublicUser {
    const { password_hash: _passwordHash, ...publicUser } = user;
    return publicUser;
}

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function generateToken(bytes = 32): string {
    return randomBytes(bytes).toString('hex'); // 64-char hex when bytes=32
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
    // Prefer bcryptjs if present (compat), fallback to scrypt without extra dependency.
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

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
    // Support bcrypt-like hashes if project already uses bcrypt/bcryptjs.
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

    // Support internal scrypt format.
    return scryptVerify(password, storedHash);
}

/* -------------------------------------------------------------------------- */
/*                               AUTH CONTROLLER                              */
/* -------------------------------------------------------------------------- */

export class AuthController {
    private readonly cookieName: string;
    private readonly sessionTtlHours: number;
    private readonly resetTokenTtlMinutes: number;
    private readonly secureCookies: boolean;
    private readonly cookieDomain?: string;
    private readonly cookiePath: string;
    private readonly sameSite: 'lax' | 'strict' | 'none';
    private readonly onPasswordResetRequested?: (
        payload: PasswordResetNotificationPayload,
    ) => Promise<void> | void;

    constructor(
        private readonly services: DatabaseServices,
        options: AuthControllerOptions = {},
    ) {
        this.cookieName = options.cookieName ?? 'tg_session';
        this.sessionTtlHours = options.sessionTtlHours ?? 24 * 7;
        this.resetTokenTtlMinutes = options.resetTokenTtlMinutes ?? 30;
        this.secureCookies =
            options.secureCookies ?? process.env.NODE_ENV === 'production';
        this.cookieDomain = options.cookieDomain;
        this.cookiePath = options.cookiePath ?? '/';
        this.sameSite = options.sameSite ?? 'lax';
        this.onPasswordResetRequested = options.onPasswordResetRequested;
    }

    /* -------------------------------- register ------------------------------- */

    async register(req: NextRequest): Promise<NextResponse> {
        const body = await this.readJsonBody<RegisterBody>(req);
        if (!body) return this.json(400, { error: 'Invalid JSON body.' });

        const name = trimToString(body.name);
        const emailRaw = trimToString(body.email);
        const password = trimToString(body.password);
        const roleRaw = trimToString(body.role);

        if (!name) return this.json(400, { error: 'Name is required.' });
        if (!emailRaw) return this.json(400, { error: 'Email is required.' });
        if (!password) return this.json(400, { error: 'Password is required.' });

        if (name.length < 2 || name.length > 120) {
            return this.json(400, { error: 'Name must be between 2 and 120 characters.' });
        }

        const email = normalizeEmail(emailRaw);
        if (!isValidEmail(email)) {
            return this.json(400, { error: 'Email format is invalid.' });
        }

        if (password.length < 8 || password.length > 128) {
            return this.json(400, {
                error: 'Password must be between 8 and 128 characters.',
            });
        }

        const role: ThesisRole = roleRaw
            ? (isValidRole(roleRaw) ? roleRaw : (null as unknown as ThesisRole))
            : 'student';

        if (!role) {
            return this.json(400, {
                error: `Invalid role. Allowed: ${THESIS_ROLES.join(', ')}`,
            });
        }

        try {
            const passwordHash = await hashPassword(password);

            const result = await this.services.transaction(async (tx) => {
                const existing = await tx.users.findByEmail(email);
                if (existing) {
                    throw new Error('EMAIL_ALREADY_EXISTS');
                }

                const user = await tx.users.create({
                    name,
                    email,
                    role,
                    status: 'active',
                    password_hash: passwordHash,
                });

                const createdSession = await this.createSession(tx, user.id);

                await this.writeAudit(
                    tx,
                    'auth.register',
                    user.id,
                    'users',
                    user.id,
                    { role } as JsonValue,
                );

                return { user, ...createdSession };
            });

            const response = this.json(201, {
                message: 'Registration successful.',
                user: toPublicUser(result.user),
            });

            this.setSessionCookie(response, result.token, result.expiresAt);
            return response;
        } catch (error) {
            const message = error instanceof Error ? error.message : '';
            if (message === 'EMAIL_ALREADY_EXISTS' || /duplicate|unique/i.test(message)) {
                return this.json(409, { error: 'Email is already registered.' });
            }

            return this.json(500, { error: 'Failed to register user.' });
        }
    }

    /* ---------------------------------- login -------------------------------- */

    async login(req: NextRequest): Promise<NextResponse> {
        const body = await this.readJsonBody<LoginBody>(req);
        if (!body) return this.json(400, { error: 'Invalid JSON body.' });

        const emailRaw = trimToString(body.email);
        const password = trimToString(body.password);

        if (!emailRaw || !password) {
            return this.json(400, { error: 'Email and password are required.' });
        }

        const email = normalizeEmail(emailRaw);

        try {
            const user = await this.services.users.findByEmail(email);

            if (!user || user.status !== 'active') {
                return this.json(401, { error: 'Invalid email or password.' });
            }

            const valid = await verifyPassword(password, user.password_hash);
            if (!valid) {
                return this.json(401, { error: 'Invalid email or password.' });
            }

            const session = await this.createSession(this.services, user.id);

            await this.writeAudit(
                this.services,
                'auth.login',
                user.id,
                'sessions',
                null,
                null,
            );

            const response = this.json(200, {
                message: 'Login successful.',
                user: toPublicUser(user),
            });

            this.setSessionCookie(response, session.token, session.expiresAt);
            return response;
        } catch {
            return this.json(500, { error: 'Failed to login.' });
        }
    }

    /* ---------------------------------- logout ------------------------------- */

    async logout(req: NextRequest): Promise<NextResponse> {
        const token = this.sessionTokenFromRequest(req);

        try {
            if (token) {
                const tokenHash = sha256(token);
                const session = await this.services.sessions.findByTokenHash(tokenHash);

                await this.services.sessions.delete({ token_hash: tokenHash });

                if (session) {
                    await this.writeAudit(
                        this.services,
                        'auth.logout',
                        session.user_id,
                        'sessions',
                        session.id,
                        null,
                    );
                }
            }
        } catch {
            // Keep logout idempotent; proceed to clear cookie anyway.
        }

        const response = this.json(200, { message: 'Logged out.' });
        this.clearSessionCookie(response);
        return response;
    }

    /* ------------------------------------ me --------------------------------- */

    async me(req: NextRequest): Promise<NextResponse> {
        const auth = await this.resolveSession(req);

        if (!auth) {
            const response = this.json(401, { error: 'Unauthorized.' });
            this.clearSessionCookie(response);
            return response;
        }

        return this.json(200, { user: toPublicUser(auth.user) });
    }

    /* --------------------------------- refresh ------------------------------- */

    async refresh(req: NextRequest): Promise<NextResponse> {
        const auth = await this.resolveSession(req);

        if (!auth) {
            const response = this.json(401, { error: 'Unauthorized.' });
            this.clearSessionCookie(response);
            return response;
        }

        try {
            const rotated = await this.services.transaction(async (tx) => {
                await tx.sessions.delete({ id: auth.sessionId });
                const next = await this.createSession(tx, auth.user.id);

                await this.writeAudit(
                    tx,
                    'auth.refresh',
                    auth.user.id,
                    'sessions',
                    null,
                    null,
                );

                return next;
            });

            const response = this.json(200, {
                message: 'Session refreshed.',
                user: toPublicUser(auth.user),
            });
            this.setSessionCookie(response, rotated.token, rotated.expiresAt);
            return response;
        } catch {
            return this.json(500, { error: 'Failed to refresh session.' });
        }
    }

    /* ---------------------------- forgot / reset password ---------------------------- */

    async forgotPassword(req: NextRequest): Promise<NextResponse> {
        const body = await this.readJsonBody<ForgotPasswordBody>(req);
        if (!body) return this.json(400, { error: 'Invalid JSON body.' });

        const emailRaw = trimToString(body.email);
        if (!emailRaw) return this.json(400, { error: 'Email is required.' });

        const email = normalizeEmail(emailRaw);
        if (!isValidEmail(email)) {
            return this.json(400, { error: 'Email format is invalid.' });
        }

        // Generic response to avoid user enumeration
        const genericResponse = this.json(200, {
            message:
                'If the account exists, password reset instructions have been sent.',
        });

        try {
            const user = await this.services.users.findByEmail(email);

            if (!user || user.status !== 'active') {
                return genericResponse;
            }

            const token = generateToken(32);
            const tokenHash = sha256(token);
            const expiresAt = futureIsoFromMinutes(this.resetTokenTtlMinutes);

            await this.services.password_resets.create({
                user_id: user.id,
                token_hash: tokenHash,
                expires_at: expiresAt,
            });

            await this.writeAudit(
                this.services,
                'auth.password_reset_requested',
                user.id,
                'password_resets',
                null,
                { expires_at: expiresAt } as JsonValue,
            );

            if (this.onPasswordResetRequested) {
                await this.onPasswordResetRequested({
                    email: user.email,
                    token,
                    expiresAt,
                    user: toPublicUser(user),
                });
            }

            return genericResponse;
        } catch {
            return genericResponse;
        }
    }

    async resetPassword(req: NextRequest): Promise<NextResponse> {
        const body = await this.readJsonBody<ResetPasswordBody>(req);
        if (!body) return this.json(400, { error: 'Invalid JSON body.' });

        const token = trimToString(body.token);
        const newPassword = trimToString(body.newPassword);

        if (!token || !newPassword) {
            return this.json(400, {
                error: 'Token and newPassword are required.',
            });
        }

        if (newPassword.length < 8 || newPassword.length > 128) {
            return this.json(400, {
                error: 'newPassword must be between 8 and 128 characters.',
            });
        }

        try {
            const tokenHash = sha256(token);
            const resetRow = await this.services.password_resets.findByTokenHash(tokenHash);

            if (!resetRow || resetRow.used_at || isExpired(resetRow.expires_at)) {
                return this.json(400, { error: 'Reset token is invalid or expired.' });
            }

            const passwordHash = await hashPassword(newPassword);

            const result = await this.services.transaction(async (tx) => {
                const updatedUser = await tx.users.updateOne(
                    { id: resetRow.user_id },
                    {
                        password_hash: passwordHash,
                        updated_at: nowIso(),
                    },
                );

                if (!updatedUser) {
                    throw new Error('USER_NOT_FOUND');
                }

                await tx.password_resets.markUsed(resetRow.id, nowIso());
                await tx.sessions.revokeByUser(updatedUser.id);

                const newSession = await this.createSession(tx, updatedUser.id);

                await this.writeAudit(
                    tx,
                    'auth.password_reset',
                    updatedUser.id,
                    'users',
                    updatedUser.id,
                    null,
                );

                return { updatedUser, ...newSession };
            });

            const response = this.json(200, {
                message: 'Password reset successful.',
                user: toPublicUser(result.updatedUser),
            });

            this.setSessionCookie(response, result.token, result.expiresAt);
            return response;
        } catch (error) {
            const message = error instanceof Error ? error.message : '';

            if (message === 'USER_NOT_FOUND') {
                return this.json(404, { error: 'User not found.' });
            }

            return this.json(500, { error: 'Failed to reset password.' });
        }
    }

    /* ---------------------------------------------------------------------- */
    /*                                 HELPERS                                */
    /* ---------------------------------------------------------------------- */

    private async readJsonBody<T>(req: NextRequest): Promise<T | null> {
        try {
            return (await req.json()) as T;
        } catch {
            return null;
        }
    }

    private json(status: number, payload: Record<string, unknown>): NextResponse {
        return NextResponse.json(payload, { status });
    }

    private setSessionCookie(
        response: NextResponse,
        token: string,
        expiresAt: string,
    ): void {
        response.cookies.set({
            name: this.cookieName,
            value: token,
            httpOnly: true,
            secure: this.secureCookies,
            sameSite: this.sameSite,
            path: this.cookiePath,
            domain: this.cookieDomain,
            expires: new Date(expiresAt),
        });
    }

    private clearSessionCookie(response: NextResponse): void {
        response.cookies.set({
            name: this.cookieName,
            value: '',
            httpOnly: true,
            secure: this.secureCookies,
            sameSite: this.sameSite,
            path: this.cookiePath,
            domain: this.cookieDomain,
            expires: new Date(0),
        });
    }

    private sessionTokenFromRequest(req: NextRequest): string | null {
        return req.cookies.get(this.cookieName)?.value ?? null;
    }

    private async createSession(
        services: DatabaseServices,
        userId: UUID,
    ): Promise<{ token: string; expiresAt: string; sessionId: UUID }> {
        const token = generateToken(32);
        const tokenHash = sha256(token);
        const expiresAt = futureIsoFromHours(this.sessionTtlHours);

        const session = await services.sessions.create({
            user_id: userId,
            token_hash: tokenHash,
            expires_at: expiresAt,
        });

        return { token, expiresAt, sessionId: session.id };
    }

    private async resolveSession(
        req: NextRequest,
    ): Promise<{ user: UserRow; sessionId: UUID } | null> {
        const token = this.sessionTokenFromRequest(req);
        if (!token) return null;

        const tokenHash = sha256(token);
        const session = await this.services.sessions.findByTokenHash(tokenHash);
        if (!session) return null;

        if (isExpired(session.expires_at)) {
            await this.services.sessions.delete({ id: session.id });
            return null;
        }

        const user = await this.services.users.findById(session.user_id);
        if (!user || user.status !== 'active') {
            return null;
        }

        return { user, sessionId: session.id };
    }

    private async writeAudit(
        services: DatabaseServices,
        action: string,
        actorId: UUID | null,
        entity: string,
        entityId: UUID | null,
        details: JsonValue | null,
    ): Promise<void> {
        try {
            await services.audit_logs.create({
                actor_id: actorId,
                action,
                entity,
                entity_id: entityId,
                details,
            });
        } catch {
            // Audit logging failures should not break auth flows.
        }
    }
}

/**
 * Convenience factory
 */
export function createAuthController(
    services: DatabaseServices,
    options?: AuthControllerOptions,
): AuthController {
    return new AuthController(services, options);
}
