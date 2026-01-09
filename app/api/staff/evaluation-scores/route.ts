/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { EvaluationScoresController } from "@/controllers/evaluation-scores.controller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function coerceQuery(searchParams: URLSearchParams) {
    const obj: Record<string, unknown> = {}
    for (const [key, value] of searchParams.entries()) {
        if (key === "page" || key === "limit" || key === "offset") {
            const n = Number(value)
            obj[key] = Number.isFinite(n) ? n : value
        } else if (value === "true" || value === "false") {
            obj[key] = value === "true"
        } else {
            obj[key] = value
        }
    }
    return obj
}

function errorJson(err: any, fallback: string) {
    const status = err?.status ?? err?.statusCode ?? 500
    return NextResponse.json({ error: err?.message ?? fallback }, { status })
}

export async function GET(req: NextRequest) {
    try {
        const q = coerceQuery(req.nextUrl.searchParams)
        const evaluationId = q.evaluationId ?? q.evaluation_id
        if (!evaluationId) {
            return NextResponse.json({ error: "evaluationId (or evaluation_id) is required" }, { status: 400 })
        }

        const fn: any = EvaluationScoresController.list
        const data =
            fn.length >= 1 ? await fn(String(evaluationId)) : await fn({ evaluation_id: String(evaluationId) })
        return NextResponse.json(data)
    } catch (err: any) {
        return errorJson(err, "Failed to list evaluation scores")
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null)
        if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

        const data = await (EvaluationScoresController.upsert as any)(body)
        return NextResponse.json(data)
    } catch (err: any) {
        return errorJson(err, "Failed to upsert evaluation score")
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null)
        const q = coerceQuery(req.nextUrl.searchParams)
        const evaluationId = body?.evaluationId ?? body?.evaluation_id ?? q.evaluationId ?? q.evaluation_id
        if (!evaluationId) {
            return NextResponse.json({ error: "evaluationId (or evaluation_id) is required" }, { status: 400 })
        }

        const data = await (EvaluationScoresController.deleteByEvaluation as any)(String(evaluationId))
        return NextResponse.json(data ?? { ok: true })
    } catch (err: any) {
        return errorJson(err, "Failed to delete evaluation scores")
    }
}
