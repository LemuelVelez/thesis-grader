/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

export function pgStatus(err: any) {
    if (err?.status) return err.status

    const code = String(err?.code ?? "")
    if (code === "23505") return 409 // unique_violation
    if (code === "23503") return 400 // foreign_key_violation
    if (code === "23502") return 400 // not_null_violation
    if (code === "22P02") return 400 // invalid_text_representation (uuid, etc.)
    if (code === "P0001") return 400 // raise exception in plpgsql

    return 500
}

export function errorJson(err: any, fallback: string) {
    // Zod validation errors
    if (err instanceof ZodError) {
        return NextResponse.json(
            {
                ok: false,
                message: "Validation failed",
                issues: err.issues.map((i) => ({
                    path: i.path.join("."),
                    message: i.message,
                })),
            },
            { status: 400 }
        )
    }

    // Custom errors that carry issues
    if (Array.isArray(err?.issues)) {
        return NextResponse.json(
            {
                ok: false,
                message: err?.message ?? "Validation failed",
                issues: err.issues,
            },
            { status: err?.status ?? 400 }
        )
    }

    const status = pgStatus(err)
    const message = err?.message ?? fallback
    const code = err?.code ? String(err.code) : undefined

    return NextResponse.json({ ok: false, message, ...(code ? { code } : {}) }, { status })
}

export async function readJson(req: NextRequest) {
    try {
        return await req.json()
    } catch {
        return {}
    }
}

export function toNum(v: string | null, fallback: number) {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
}

export function coerceQuery(searchParams: URLSearchParams) {
    const obj: Record<string, unknown> = {}
    for (const [key, value] of searchParams.entries()) {
        if (key === "page" || key === "limit" || key === "offset") {
            const n = Number(value)
            obj[key] = Number.isFinite(n) ? n : value
        } else if (value === "true" || value === "false") {
            obj[key] = value === "true"
        } else {
            obj[key] = value
        }
    }
    return obj
}
