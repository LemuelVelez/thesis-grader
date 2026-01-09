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

async function getAdminActor() {
    // ✅ FIX: cookies() returns Promise in your Next.js version
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return null

    try {
        const actor = await getUserFromSession(token)
        if (!actor) return null
        const role = String((actor as any)?.role ?? "").toLowerCase()
        if (role !== "admin") return null
        return actor
    } catch {
        return null
    }
}

async function loadMergedUserRow(id: string) {
    let userRow: any | null = null
    try {
        const { rows } = await db.query(`select id, name, email, avatar_key from users where id = $1 limit 1`, [id])
        userRow = rows?.[0] ?? null
    } catch {
        userRow = null
    }

    let profileRow: any | null = null
    try {
        const { rows } = await db.query(`select * from profiles where user_id = $1 limit 1`, [id])
        profileRow = rows?.[0] ?? null
    } catch {
        profileRow = null
    }

    if (!profileRow) {
        try {
            const { rows } = await db.query(`select * from user_profiles where user_id = $1 limit 1`, [id])
            profileRow = rows?.[0] ?? null
        } catch {
            profileRow = null
        }
    }

    return { ...(userRow ?? {}), ...(profileRow ?? {}) }
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
    const id = String(ctx?.params?.id ?? "").trim()

    if (!UUID_RE.test(id)) {
        if (wantsJson(req)) return jsonOk(null)
        return svgOk(placeholderSvg("U"))
    }

    const actor = await getAdminActor()
    if (!actor) {
        if (wantsJson(req)) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
        return svgOk(placeholderSvg("U"))
    }

    const merged = await loadMergedUserRow(id)

    const directUrl = pickAvatarUrl(merged)
    if (directUrl) {
        if (wantsJson(req)) return jsonOk(directUrl)
        const res = NextResponse.redirect(directUrl, 302)
        res.headers.set("Cache-Control", "no-store")
        return res
    }

    const key = pickAvatarKey(merged)
    if (key) {
        try {
            const url = await createPresignedGetUrl({ key, expiresInSeconds: 300 })
            if (wantsJson(req)) return jsonOk(url)
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
    if (wantsJson(req)) return jsonOk(null)
    return svgOk(placeholderSvg(initials))
}
