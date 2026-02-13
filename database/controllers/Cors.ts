/**
 * CORS controller for Next.js Route Handlers
 * ------------------------------------------
 * Provides:
 * - preflight handling
 * - CORS header application for normal responses
 * - wrapper utility (withCors)
 */

import { NextRequest, NextResponse } from 'next/server';

export type CorsOriginMatcher =
    | '*'
    | string
    | string[]
    | RegExp
    | ((origin: string | null, req: NextRequest) => boolean | Promise<boolean>);

export interface CorsOptions {
    /**
     * Allowed origin rule.
     * Default: "*"
     */
    origin?: CorsOriginMatcher;

    /**
     * Allowed HTTP methods for CORS.
     * Default: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"]
     */
    methods?: string[];

    /**
     * Allowed request headers.
     * If omitted, reflects Access-Control-Request-Headers from preflight.
     */
    allowedHeaders?: string[];

    /**
     * Headers exposed to browser clients.
     */
    exposedHeaders?: string[];

    /**
     * Whether credentials are allowed.
     * Default: true
     */
    credentials?: boolean;

    /**
     * Preflight cache max-age in seconds.
     * Default: 600
     */
    maxAge?: number;

    /**
     * Status code for successful preflight.
     * Default: 204
     */
    optionsSuccessStatus?: number;

    /**
     * If request has no Origin header, still apply permissive CORS headers.
     * Default: true
     */
    allowRequestsWithoutOrigin?: boolean;
}

export type CorsRouteHandler = (req: NextRequest) => Promise<Response> | Response;

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

function appendVary(headers: Headers, value: string): void {
    const current = headers.get('Vary');
    if (!current) {
        headers.set('Vary', value);
        return;
    }

    const parts = current
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

    if (!parts.includes(value)) {
        headers.set('Vary', `${current}, ${value}`);
    }
}

export class CorsController {
    private readonly options: Required<
        Pick<
            CorsOptions,
            | 'methods'
            | 'credentials'
            | 'maxAge'
            | 'optionsSuccessStatus'
            | 'allowRequestsWithoutOrigin'
        >
    > &
        Omit<CorsOptions, 'methods' | 'credentials' | 'maxAge' | 'optionsSuccessStatus' | 'allowRequestsWithoutOrigin'>;

    constructor(options: CorsOptions = {}) {
        this.options = {
            origin: options.origin ?? '*',
            methods: options.methods ?? DEFAULT_METHODS,
            allowedHeaders: options.allowedHeaders,
            exposedHeaders: options.exposedHeaders,
            credentials: options.credentials ?? true,
            maxAge: options.maxAge ?? 600,
            optionsSuccessStatus: options.optionsSuccessStatus ?? 204,
            allowRequestsWithoutOrigin: options.allowRequestsWithoutOrigin ?? true,
        };
    }

    private async isOriginAllowed(req: NextRequest, origin: string | null): Promise<boolean> {
        const rule = this.options.origin;

        if (rule === '*') return true;
        if (typeof rule === 'string') return origin === rule;
        if (Array.isArray(rule)) return !!origin && rule.includes(origin);
        if (rule instanceof RegExp) return !!origin && rule.test(origin);
        if (typeof rule === 'function') return !!(await rule(origin, req));

        return false;
    }

    private async resolveAllowOrigin(req: NextRequest): Promise<string | null> {
        const requestOrigin = req.headers.get('origin');

        if (!requestOrigin) {
            if (!this.options.allowRequestsWithoutOrigin) return null;
            return this.options.origin === '*' ? '*' : null;
        }

        const allowed = await this.isOriginAllowed(req, requestOrigin);
        if (!allowed) return null;

        if (this.options.origin === '*') {
            // Credentials + wildcard is invalid; reflect origin instead.
            return this.options.credentials ? requestOrigin : '*';
        }

        // For non-wildcard matchers we reflect the request origin.
        return requestOrigin;
    }

    private getAllowHeaders(req: NextRequest): string {
        if (this.options.allowedHeaders && this.options.allowedHeaders.length > 0) {
            return this.options.allowedHeaders.join(', ');
        }

        const requested = req.headers.get('access-control-request-headers');
        return requested && requested.trim().length > 0
            ? requested
            : 'Content-Type, Authorization';
    }

    private applyHeaders(req: NextRequest, res: Response, allowOrigin: string): Response {
        res.headers.set('Access-Control-Allow-Origin', allowOrigin);
        appendVary(res.headers, 'Origin');

        res.headers.set('Access-Control-Allow-Methods', this.options.methods.join(', '));
        res.headers.set('Access-Control-Allow-Headers', this.getAllowHeaders(req));
        res.headers.set('Access-Control-Max-Age', String(this.options.maxAge));

        if (this.options.credentials) {
            res.headers.set('Access-Control-Allow-Credentials', 'true');
        }

        if (this.options.exposedHeaders && this.options.exposedHeaders.length > 0) {
            res.headers.set(
                'Access-Control-Expose-Headers',
                this.options.exposedHeaders.join(', '),
            );
        }

        appendVary(res.headers, 'Access-Control-Request-Method');
        appendVary(res.headers, 'Access-Control-Request-Headers');

        return res;
    }

    /**
     * Handle OPTIONS preflight request.
     */
    async preflight(req: NextRequest): Promise<NextResponse> {
        const allowOrigin = await this.resolveAllowOrigin(req);
        if (!allowOrigin) {
            return NextResponse.json({ error: 'CORS origin denied.' }, { status: 403 });
        }

        const response = new NextResponse(null, {
            status: this.options.optionsSuccessStatus,
        });

        this.applyHeaders(req, response, allowOrigin);
        return response;
    }

    /**
     * Apply CORS headers to an existing response.
     */
    async apply(req: NextRequest, response: Response): Promise<Response> {
        const allowOrigin = await this.resolveAllowOrigin(req);
        if (!allowOrigin) return response;
        return this.applyHeaders(req, response, allowOrigin);
    }

    /**
     * Wrap route handler with CORS handling.
     */
    withCors(handler: CorsRouteHandler): CorsRouteHandler {
        return async (req: NextRequest): Promise<Response> => {
            if (req.method.toUpperCase() === 'OPTIONS') {
                return this.preflight(req);
            }

            const response = await handler(req);
            return this.apply(req, response);
        };
    }
}

/**
 * Convenience factory.
 */
export function createCorsController(options?: CorsOptions): CorsController {
    return new CorsController(options);
}
