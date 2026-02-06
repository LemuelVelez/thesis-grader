/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { StudentEvaluationsController } from "@/controllers/student-evaluations.controller"
import { UsersController } from "@/controllers/users.controller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

type RouteContext = {
    params: Promise<RouteParams>
}

function errorJson(err: any, fallback: string) {
    const status = err?.status ?? err?.statusCode ?? 500
    return NextResponse.json({ error: err?.message ?? fallback }, { status })
}

async function getIdFromCtxOrPath(req: NextRequest, ctx: RouteContext): Promise<string> {
    try {
        const params = await ctx.params
        const fromParams = params?.id
        if (fromParams) return String(fromParams)
    } catch {
        // fallback to path parsing below
    }

    const parts = req.nextUrl.pathname.split("/").filter(Boolean)
    const last = parts[parts.length - 1]
    return String(last ?? "")
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

async function requireUser(userId: string) {
    const user = await UsersController.findById(userId)
    if (!user) {
        const err: any = new Error("User not found")
        err.status = 404
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

export async function GET(req: NextRequest, ctx: RouteContext) {
    try {
        const userId = getAuthUserId(req)
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await requireUser(userId)

        const id = await getIdFromCtxOrPath(req, ctx)
        if (!id.trim()) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

        const result = await tryInvoke(StudentEvaluationsController.get, [
            [id],
            [{ id }],
            [{ evaluation_id: id }],
            [{ id, user_id: userId }],
        ])

        return NextResponse.json({ evaluation: result }, { status: 200 })
    } catch (err: any) {
        return errorJson(err, "Failed to load evaluation")
    }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
    try {
        const userId = getAuthUserId(req)
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await requireUser(userId)

        const id = await getIdFromCtxOrPath(req, ctx)
        if (!id.trim()) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

        const body = await safeJson(req)
        const payload = { ...body, id }

        const result = await tryInvoke(StudentEvaluationsController.upsert, [
            [userId, payload],
            [{ user_id: userId, ...payload }],
            [payload],
        ])

        return NextResponse.json({ evaluation: result }, { status: 200 })
    } catch (err: any) {
        return errorJson(err, "Failed to save evaluation")
    }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
    try {
        const userId = getAuthUserId(req)
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const user = await requireUser(userId)

        const id = await getIdFromCtxOrPath(req, ctx)
        if (!id.trim()) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

        const body = await safeJson(req)
        const action = (req.nextUrl.searchParams.get("action") ?? body?.action ?? "").toString()

        if (action === "submit") {
            if (user.role !== "student") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

            const result = await tryInvoke(StudentEvaluationsController.submit, [
                [id],
                [{ id }],
                [{ evaluation_id: id }],
                [{ id, user_id: userId }],
            ])

            return NextResponse.json({ success: true, result }, { status: 200 })
        }

        if (action === "lock") {
            if (user.role === "student") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

            const result = await tryInvoke(StudentEvaluationsController.lock, [
                [id],
                [{ id }],
                [{ evaluation_id: id }],
                [{ id, user_id: userId }],
            ])

            return NextResponse.json({ success: true, result }, { status: 200 })
        }

        return NextResponse.json(
            { error: "Invalid action. Use ?action=submit or ?action=lock (or JSON body { action })" },
            { status: 400 }
        )
    } catch (err: any) {
        return errorJson(err, "Failed to perform evaluation action")
    }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
    try {
        const userId = getAuthUserId(req)
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await requireUser(userId)

        const id = await getIdFromCtxOrPath(req, ctx)
        if (!id.trim()) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

        const result = await tryInvoke(StudentEvaluationsController.delete, [
            [id],
            [{ id }],
            [{ evaluation_id: id }],
            [{ id, user_id: userId }],
        ])

        return NextResponse.json({ success: true, result }, { status: 200 })
    } catch (err: any) {
        return errorJson(err, "Failed to delete evaluation")
    }
}
