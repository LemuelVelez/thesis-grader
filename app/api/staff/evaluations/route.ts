/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { EvaluationsController } from "@/controllers/evaluations.controller"

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

        const id = q.id ?? q.evaluationId
        const assignmentId = q.assignmentId ?? q.assignment_id
        const scheduleId = q.scheduleId ?? q.schedule_id

        if (id) {
            const data = await (EvaluationsController.getById as any)(String(id))
            return NextResponse.json(data)
        }

        if (assignmentId) {
            const data = await (EvaluationsController.getByAssignment as any)(String(assignmentId))
            return NextResponse.json(data)
        }

        if (scheduleId) {
            // listEvaluationsBySchedule often expects scheduleId
            const fn: any = EvaluationsController.listBySchedule
            const data =
                fn.length >= 1 ? await fn(String(scheduleId)) : await fn({ schedule_id: String(scheduleId) })
            return NextResponse.json(data)
        }

        return NextResponse.json(
            { error: "Provide one of: id, assignmentId, scheduleId" },
            { status: 400 }
        )
    } catch (err: any) {
        return errorJson(err, "Failed to get evaluations")
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null)
        if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

        const data = await (EvaluationsController.create as any)(body)
        return NextResponse.json(data, { status: 201 })
    } catch (err: any) {
        return errorJson(err, "Failed to create evaluation")
    }
}
