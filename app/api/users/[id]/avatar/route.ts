/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth"
import { createPresignedGetUrl } from "@/lib/s3"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safeInitials(nameOrEmail: string) {
    const s = String(nameOrEmail ?? "").trim()
    if (!s) return "U"
    const parts = s.split(/\s+/).filter(Boolean)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (String(parts[0][0] ?? "") + String(parts[parts.length - 1][0] ?? "")).toUpperCase() || "U"
}

function placeholderSvg(initials: string) {
    const safe = (initials || "U").slice(0, 2).toUpperCase()
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111827"/>
      <stop offset="1" stop-color="#374151"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="64" fill="url(#g)"/>
  <text x="64" y="72" text-anchor="middle"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial"
        font-size="44" fill="#F9FAFB" font-weight="700">${safe}</text>
</svg>`
}

function wantsJson(req: NextRequest) {
    const accept = (req.headers.get("accept") || "").toLowerCase()
    if (accept.includes("application/json")) return true
    const fmt = (req.nextUrl.searchParams.get("format") || "").toLowerCase()
    return fmt === "json"
}

function jsonOk(payload: any, cacheControl = "no-store") {
    return NextResponse.json(payload, { status: 200, headers: { "Cache-Control": cacheControl } })
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

function normalizeS3Key(raw: string): string {
    let v = String(raw ?? "").trim()
    if (!v) return ""

    if (/^s3:\/\//i.test(v)) {
        v = v.replace(/^s3:\/\//i, "")
        const idx = v.indexOf("/")
        if (idx >= 0) v = v.slice(idx + 1)
        return v.replace(/^\/+/, "")
    }

    if (/^https?:\/\//i.test(v)) {
        try {
            const u = new URL(v)
            return (u.pathname || "").replace(/^\/+/, "")
        } catch {
            // fall through
        }
    }

    return v.replace(/^\/+/, "")
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
        if (typeof v === "string" && v.trim()) {
            const norm = normalizeS3Key(v)
            if (norm) return norm
        }
    }
    return null
}

function pickAvatarUrl(row: any): string | null {
    if (!row) return null
    const candidates = [row.avatar_url, row.avatarUrl, row.photo_url, row.photoUrl, row.image_url, row.imageUrl]
    for (const v of candidates) {
        if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) return v.trim()
    }
    return null
}

async function getActor(req: NextRequest) {
    const cookieToken = req.cookies.get(SESSION_COOKIE)?.value
    const authHeader = req.headers.get("authorization") || ""
    const bearerToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : ""
    const token = cookieToken || bearerToken
    if (!token) return null
    try {
        return await getUserFromSession(token)
    } catch {
        return null
    }
}

async function loadMergedUserRow(id: string) {
    let userRow: any | null = null
    try {
        const { rows } = await db.query(`select id, name, email, role, avatar_key from users where id = $1 limit 1`, [id])
        userRow = rows?.[0] ?? null
    } catch {
        userRow = null
    }

    let studentRow: any | null = null
    try {
        const { rows } = await db.query(`select * from students where user_id = $1 limit 1`, [id])
        studentRow = rows?.[0] ?? null
    } catch {
        studentRow = null
    }

    let staffRow: any | null = null
    try {
        const { rows } = await db.query(`select * from staff_profiles where user_id = $1 limit 1`, [id])
        staffRow = rows?.[0] ?? null
    } catch {
        staffRow = null
    }

    return { ...(userRow ?? {}), ...(studentRow ?? {}), ...(staffRow ?? {}) }
}

type Ctx = {
    params: Promise<{ id: string }> | { id: string }
}

export async function GET(req: NextRequest, ctx: Ctx) {
    const params = await Promise.resolve(ctx?.params as any)
    const id = String(params?.id ?? "").trim()

    if (!UUID_RE.test(id)) {
        if (wantsJson(req)) return jsonOk({ ok: true, avatar_key: null, url: null })
        return svgOk(placeholderSvg("U"))
    }

    const actor = await getActor(req)
    if (!actor) {
        if (wantsJson(req)) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
        return svgOk(placeholderSvg("U"))
    }

    // allow admin OR self
    const actorId = String((actor as any)?.id ?? "")
    const role = String((actor as any)?.role ?? "").toLowerCase()
    const canRead = role === "admin" || actorId === id

    if (!canRead) {
        if (wantsJson(req)) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
        return svgOk(placeholderSvg("U"))
    }

    const merged = await loadMergedUserRow(id)
    if (!merged?.id) {
        if (wantsJson(req)) return jsonOk({ ok: true, avatar_key: null, url: null }, "private, max-age=60")
        return svgOk(placeholderSvg("U"))
    }

    const directUrl = pickAvatarUrl(merged)
    if (directUrl) {
        if (wantsJson(req)) return jsonOk({ ok: true, avatar_key: null, url: directUrl }, "no-store")
        const res = NextResponse.redirect(directUrl, 302)
        res.headers.set("Cache-Control", "no-store")
        return res
    }

    const key = pickAvatarKey(merged)
    if (key) {
        try {
            const url = await createPresignedGetUrl({ key, expiresInSeconds: 300 })
            if (wantsJson(req)) return jsonOk({ ok: true, avatar_key: key, url, expires_in_seconds: 300 }, "private, max-age=60")
            const res = NextResponse.redirect(url, 302)
            res.headers.set("Cache-Control", "no-store")
            return res
        } catch {
            // fall through
        }
    }

    const nameOrEmail =
        merged.name ??
        merged.full_name ??
        merged.fullName ??
        merged.display_name ??
        merged.displayName ??
        merged.email ??
        ""

    const initials = safeInitials(String(nameOrEmail))
    if (wantsJson(req)) return jsonOk({ ok: true, avatar_key: null, url: null }, "private, max-age=60")
    return svgOk(placeholderSvg(initials))
}
