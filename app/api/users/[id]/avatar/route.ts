/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

import { db } from "@/lib/db"
import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth"
import { createPresignedGetUrl } from "@/lib/s3"

export const runtime = "nodejs"

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })

    const actor = await getUserFromSession(token)
    if (!actor) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })

    const role = String((actor as any)?.role ?? "").toLowerCase()
    if (role !== "admin") return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })

    const userId = String(ctx?.params?.id ?? "").trim()
    if (!userId) return NextResponse.json({ ok: false, message: "Missing id" }, { status: 400 })

    const { rows } = await db.query(
        `select avatar_key from users where id = $1 limit 1`,
        [userId]
    )

    if (!rows[0]) return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 })

    const avatar_key = (rows[0]?.avatar_key ?? null) as string | null

    if (!avatar_key) {
        const res = NextResponse.json({ ok: true, avatar_key: null, url: null })
        res.headers.set("Cache-Control", "private, max-age=300")
        return res
    }

    const url = await createPresignedGetUrl({
        key: avatar_key,
        expiresInSeconds: 60 * 10,
    })

    const res = NextResponse.json({
        ok: true,
        avatar_key,
        url,
        expires_in_seconds: 60 * 10,
    })

    res.headers.set("Cache-Control", "private, max-age=300")
    return res
}
