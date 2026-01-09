/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { EvaluationScoresController } from "@/controllers/evaluation-scores.controller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function errorJson(err: any, fallback: string) {
    const status = err?.status ?? err?.statusCode ?? 500
    return NextResponse.json({ error: err?.message ?? fallback }, { status })
}

export async function PUT(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null)
        if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

        const data = await (EvaluationScoresController.bulkUpsert as any)(body)
        return NextResponse.json(data)
    } catch (err: any) {
        return errorJson(err, "Failed to bulk upsert evaluation scores")
    }
}
