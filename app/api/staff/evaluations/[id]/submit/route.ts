/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { EvaluationsController } from "@/controllers/evaluations.controller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: { id: string } }

function errorJson(err: any, fallback: string) {
    const status = err?.status ?? err?.statusCode ?? 500
    return NextResponse.json({ error: err?.message ?? fallback }, { status })
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
    try {
        const id = ctx.params.id
        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

        // markEvaluationSubmitted typically takes evaluation id (or args containing it)
        const fn: any = EvaluationsController.markSubmitted
        const data = fn.length >= 1 ? await fn(id) : await fn({ id })
        return NextResponse.json(data ?? { ok: true })
    } catch (err: any) {
        return errorJson(err, "Failed to submit evaluation")
    }
}
