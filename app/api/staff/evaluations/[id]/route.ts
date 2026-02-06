/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { EvaluationsController } from "@/controllers/evaluations.controller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

function errorJson(err: any, fallback: string) {
    const status = err?.status ?? err?.statusCode ?? 500
    return NextResponse.json({ error: err?.message ?? fallback }, { status })
}

async function callUpdate(fn: any, id: string, body: any) {
    if (typeof fn !== "function") throw new Error("Update handler is not a function")
    if (fn.length >= 2) return await fn(id, body)
    return await fn({ id, ...(body ?? {}) })
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
    try {
        const { id } = await ctx.params
        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

        const data = await (EvaluationsController.getById as any)(id)
        return NextResponse.json(data)
    } catch (err: any) {
        return errorJson(err, "Failed to get evaluation")
    }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
    try {
        const { id } = await ctx.params
        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

        const body = await req.json().catch(() => null)
        if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

        // Intended for status changes (e.g., { status: "..." })
        const data = await callUpdate(EvaluationsController.updateStatus as any, id, body)
        return NextResponse.json(data ?? { ok: true })
    } catch (err: any) {
        return errorJson(err, "Failed to update evaluation")
    }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
    try {
        const { id } = await ctx.params
        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

        const data = await (EvaluationsController.delete as any)(id)
        return NextResponse.json(data ?? { ok: true })
    } catch (err: any) {
        return errorJson(err, "Failed to delete evaluation")
    }
}
