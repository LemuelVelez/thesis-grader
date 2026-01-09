/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { UsersController } from "@/controllers/users.controller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function errorJson(err: any, fallback: string) {
    const status = err?.status ?? err?.statusCode ?? 500
    return NextResponse.json({ error: err?.message ?? fallback }, { status })
}

function getAuthUserId(req: NextRequest): string | null {
    // 1) Header-based (recommended for API calls)
    const h1 = req.headers.get("x-user-id")
    if (h1) return String(h1)

    // 2) Cookie-based (if you set it after login)
    const c1 = req.cookies.get("user_id")?.value
    if (c1) return String(c1)

    const c2 = req.cookies.get("uid")?.value
    if (c2) return String(c2)

    return null
}

export async function GET(req: NextRequest) {
    try {
        const userId = getAuthUserId(req)
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const user = await UsersController.findById(userId)
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        return NextResponse.json({ user }, { status: 200 })
    } catch (err: any) {
        return errorJson(err, "Failed to load current user")
    }
}
