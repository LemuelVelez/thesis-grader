/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { StudentsController } from "@/controllers/students.controller"
import { UsersController } from "@/controllers/users.controller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function errorJson(err: any, fallback: string) {
    const status = err?.status ?? err?.statusCode ?? 500
    return NextResponse.json({ error: err?.message ?? fallback }, { status })
}

function getAuthUserId(req: NextRequest): string | null {
    const h1 = req.headers.get("x-user-id")
    if (h1) return String(h1)

    const c1 = req.cookies.get("user_id")?.value
    if (c1) return String(c1)

    const c2 = req.cookies.get("uid")?.value
    if (c2) return String(c2)

    return null
}

async function requireStudent(userId: string) {
    const user = await UsersController.findById(userId)
    if (!user) {
        const err: any = new Error("User not found")
        err.status = 404
        throw err
    }
    if (user.role !== "student") {
        const err: any = new Error("Forbidden")
        err.status = 403
        throw err
    }
    return user
}

async function safeJson(req: NextRequest) {
    try {
        return await req.json()
    } catch {
        return {}
    }
}

async function tryInvoke<T>(fn: (...args: any[]) => Promise<T>, candidates: any[][]): Promise<T> {
    let lastErr: any
    for (const args of candidates) {
        try {
            return await fn(...args)
        } catch (err: any) {
            lastErr = err
            const status = err?.status ?? err?.statusCode
            if (status) throw err

            const msg = String(err?.message ?? "")
            const typeLike =
                err?.name === "TypeError" ||
                msg.includes("Cannot read") ||
                msg.includes("undefined") ||
                msg.includes("null")

            if (!typeLike) throw err
        }
    }
    throw lastErr
}

export async function GET(req: NextRequest) {
    try {
        const userId = getAuthUserId(req)
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await requireStudent(userId)

        const result = await tryInvoke(StudentsController.getProfile, [
            [userId],
            [{ user_id: userId }],
            [{ userId }],
        ])

        return NextResponse.json({ profile: result }, { status: 200 })
    } catch (err: any) {
        return errorJson(err, "Failed to load student profile")
    }
}

export async function PUT(req: NextRequest) {
    try {
        const userId = getAuthUserId(req)
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await requireStudent(userId)

        const body = await safeJson(req)

        const result = await tryInvoke(StudentsController.upsertProfile, [
            [userId, body],
            [{ user_id: userId, ...body }],
            [body],
        ])

        return NextResponse.json({ profile: result }, { status: 200 })
    } catch (err: any) {
        return errorJson(err, "Failed to save student profile")
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const userId = getAuthUserId(req)
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await requireStudent(userId)

        const result = await tryInvoke(StudentsController.deleteProfile, [
            [userId],
            [{ user_id: userId }],
        ])

        return NextResponse.json({ success: true, result }, { status: 200 })
    } catch (err: any) {
        return errorJson(err, "Failed to delete student profile")
    }
}
