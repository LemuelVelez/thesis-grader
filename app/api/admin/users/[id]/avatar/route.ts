/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"

import { db } from "@/lib/db"
import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth"
import { createPresignedGetUrl } from "@/lib/s3"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safeInitials(nameOrEmail: string) {
    const s = (nameOrEmail || "").trim()
    if (!s) return "U"
    const parts = s.split(/\s+/).filter(Boolean)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
}

function placeholderSvg(initials: string) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111827"/>
      <stop offset="1" stop-color="#374151"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="64" fill="url(#g)"/>
  <text x="64" y="72" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial"
        font-size="44" fill="#F9FAFB" font-weight="700">${initials}</text>
</svg>`
}

function pickAvatarKey(row: any): string | null {
    if (!row) return null
    const candidates = [
        row.avatar_key,
        row.avatarKey,
        row.avatar_s3_key,
        row.avatarS3Key,
        row.avatar_object_key,
        row.avatarObjectKey,
        row.avatar_path,
        row.avatarPath,
        row.profile_avatar_key,
        row.profileAvatarKey,
    ]
    for (const v of candidates) {
        if (typeof v === "string" && v.trim()) return v.trim()
    }
    return null
}

function pickAvatarUrl(row: any): string | null {
    if (!row) return null
    const candidates = [row.avatar_url, row.avatarUrl, row.photo_url, row.photoUrl]
    for (const v of candidates) {
        if (typeof v === "string" && /^https?:\/\//i.test(v)) return v
    }
    return null
}

function wantsJson(req: NextRequest) {
    const accept = (req.headers.get("accept") || "").toLowerCase()
    return accept.includes("application/json")
}

function jsonOk(url: string | null) {
    return NextResponse.json(
        { ok: true, url },
        {
            status: 200,
            headers: { "Cache-Control": "no-store" },
        }
    )
}

function svgOk(svg: string) {
    return new NextResponse(svg, {
        status: 200,
        headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
        },
    })
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
    const id = String(ctx?.params?.id ?? "").trim()

    // invalid id -> return placeholder (never 404)
    if (!UUID_RE.test(id)) {
        if (wantsJson(req)) return jsonOk(null)
        return svgOk(placeholderSvg("U"))
    }

    // auth
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) {
        // For JSON callers (our admin UI), return 401 so client can redirect/login.
        if (wantsJson(req)) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
        // For <img> callers, return placeholder to avoid console noise.
        return svgOk(placeholderSvg("U"))
    }

    const actor = await getUserFromSession(token)
    if (!actor) {
        if (wantsJson(req)) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
        return svgOk(placeholderSvg("U"))
    }

    const actorRole = String((actor as any)?.role ?? "").toLowerCase()
    if (actorRole !== "admin") {
        if (wantsJson(req)) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
        return svgOk(placeholderSvg("U"))
    }

    // fetch user and optional profile (so avatars work even if stored outside users table)
    let userRow: any | null = null
    try {
        const { rows } = await db.query(`select * from users where id = $1 limit 1`, [id])
        userRow = rows?.[0] ?? null
    } catch {
        userRow = null
    }

    let profileRow: any | null = null
    if (userRow) {
        try {
            const { rows } = await db.query(`select * from profiles where user_id = $1 limit 1`, [id])
            profileRow = rows?.[0] ?? null
        } catch {
            try {
                const { rows } = await db.query(`select * from user_profiles where user_id = $1 limit 1`, [id])
                profileRow = rows?.[0] ?? null
            } catch {
                profileRow = null
            }
        }
    }

    const merged = { ...(userRow ?? {}), ...(profileRow ?? {}) }

    // If DB stores a direct URL, use it
    const directUrl = pickAvatarUrl(merged)
    if (directUrl) {
        if (wantsJson(req)) return jsonOk(directUrl)
        const res = NextResponse.redirect(directUrl, 302)
        res.headers.set("Cache-Control", "no-store")
        return res
    }

    // If DB stores an S3 key, presign it
    const key = pickAvatarKey(merged)
    if (key) {
        try {
            const url = await createPresignedGetUrl({ key, expiresInSeconds: 300 })
            if (wantsJson(req)) return jsonOk(url)
            const res = NextResponse.redirect(url, 302)
            res.headers.set("Cache-Control", "no-store")
            return res
        } catch {
            // fall through to placeholder
        }
    }

    // Placeholder (NO 404)
    const nameOrEmail =
        merged.name ??
        merged.full_name ??
        merged.fullName ??
        merged.display_name ??
        merged.displayName ??
        merged.email ??
        ""

    const initials = safeInitials(String(nameOrEmail))
    const svg = placeholderSvg(initials)

    if (wantsJson(req)) return jsonOk(null)
    return svgOk(svg)
}
