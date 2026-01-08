import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth"
import { createPresignedPutUrl } from "@/lib/s3"
import { randomToken } from "@/lib/security"
import { requireRole } from "@/lib/rbac"

export const runtime = "nodejs"

function extFromContentType(contentType: string) {
    const ct = contentType.toLowerCase()
    if (ct === "image/png") return ".png"
    if (ct === "image/jpeg") return ".jpg"
    if (ct === "image/webp") return ".webp"
    if (ct === "application/pdf") return ".pdf"
    return ""
}

export async function POST(req: Request) {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return NextResponse.json({ ok: false }, { status: 401 })

    const user = await getUserFromSession(token)
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const kind = String(body.kind ?? "avatar") as "avatar" | "misc"
    const contentType = String(body.contentType ?? "").trim()

    if (!contentType) {
        return NextResponse.json({ ok: false, message: "Missing contentType" }, { status: 400 })
    }

    // Default: avatar uploads (everyone can upload their own avatar)
    if (kind === "avatar") {
        if (!contentType.toLowerCase().startsWith("image/")) {
            return NextResponse.json({ ok: false, message: "Avatar must be an image" }, { status: 400 })
        }

        const ext = extFromContentType(contentType) || ".png"
        const key = `avatars/${user.id}/${Date.now()}-${randomToken(10)}${ext}`

        const url = await createPresignedPutUrl({
            key,
            contentType,
            expiresInSeconds: 60,
        })

        return NextResponse.json({ ok: true, key, url })
    }

    // Misc uploads: staff/admin only (students should not upload thesis files)
    try {
        requireRole(user, ["staff", "admin"])
    } catch {
        return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
    }

    const allowed = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"])
    if (!allowed.has(contentType.toLowerCase())) {
        return NextResponse.json({ ok: false, message: "Unsupported content type" }, { status: 400 })
    }

    const ext = extFromContentType(contentType)
    const key = `uploads/${user.id}/${Date.now()}-${randomToken(10)}${ext}`

    const url = await createPresignedPutUrl({
        key,
        contentType,
        expiresInSeconds: 60,
    })

    return NextResponse.json({ ok: true, key, url })
}
