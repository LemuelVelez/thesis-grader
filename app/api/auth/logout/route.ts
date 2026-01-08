import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { deleteSessionByRawToken, SESSION_COOKIE } from "@/lib/auth"

export const runtime = "nodejs"

export async function POST() {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value ?? ""

    // Best-effort: delete the session row tied to this cookie token
    if (token) {
        await deleteSessionByRawToken(token).catch(() => null)
    }

    // Clear cookie on client
    const res = NextResponse.json({ ok: true })
    res.cookies.delete(SESSION_COOKIE)

    return res
}
