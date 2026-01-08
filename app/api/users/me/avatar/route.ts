import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { db } from "@/lib/db"
import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth"
import { randomToken } from "@/lib/security"
import { createPresignedGetUrl, createPresignedPutUrl } from "@/lib/s3"

export const runtime = "nodejs"

function extFromContentType(contentType: string) {
    const ct = contentType.toLowerCase()
    if (ct === "image/png") return ".png"
    if (ct === "image/jpeg") return ".jpg"
    if (ct === "image/webp") return ".webp"
    return ""
}

export async function GET() {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return NextResponse.json({ ok: false }, { status: 401 })

    const user = await getUserFromSession(token)
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    if (!user.avatar_key) {
        const res = NextResponse.json({ ok: true, avatar_key: null, url: null })
        // cache this too (private), to avoid repeated calls
        res.headers.set("Cache-Control", "private, max-age=300")
        return res
    }

    // ✅ Signed URL lasts longer (10 minutes)
    const url = await createPresignedGetUrl({
        key: user.avatar_key,
        expiresInSeconds: 60 * 10,
    })

    const res = NextResponse.json({
        ok: true,
        avatar_key: user.avatar_key,
        url,
        // optional info for debugging/UI
        expires_in_seconds: 60 * 10,
    })

    // ✅ Cache the API response for 5 minutes (private per-user)
    res.headers.set("Cache-Control", "private, max-age=300")

    return res
}

export async function POST(req: Request) {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return NextResponse.json({ ok: false }, { status: 401 })

    const user = await getUserFromSession(token)
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const contentType = String(body.contentType ?? "").trim()
    const filename = String(body.filename ?? "avatar").trim()

    if (!contentType || !contentType.toLowerCase().startsWith("image/")) {
        return NextResponse.json({ ok: false, message: "Avatar must be an image" }, { status: 400 })
    }

    const ext = extFromContentType(contentType) || ".png"
    const safeName = filename
        .replace(/[^\w.\-]+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 80)

    const key = `avatars/${user.id}/${Date.now()}-${randomToken(10)}-${safeName}${ext}`

    const url = await createPresignedPutUrl({
        key,
        contentType,
        expiresInSeconds: 60,
    })

    return NextResponse.json({ ok: true, key, url })
}

export async function PATCH(req: Request) {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return NextResponse.json({ ok: false }, { status: 401 })

    const user = await getUserFromSession(token)
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const key = String(body.key ?? "").trim()

    if (!key) {
        return NextResponse.json({ ok: false, message: "Missing key" }, { status: 400 })
    }

    // Basic safety: must be under avatars/userId/
    if (!key.startsWith(`avatars/${user.id}/`)) {
        return NextResponse.json({ ok: false, message: "Invalid avatar key" }, { status: 400 })
    }

    await db.query(`update users set avatar_key = $1, updated_at = now() where id = $2`, [key, user.id])

    return NextResponse.json({ ok: true, avatar_key: key })
}

export async function DELETE() {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return NextResponse.json({ ok: false }, { status: 401 })

    const user = await getUserFromSession(token)
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    await db.query(`update users set avatar_key = null, updated_at = now() where id = $1`, [user.id])

    return NextResponse.json({ ok: true })
}
