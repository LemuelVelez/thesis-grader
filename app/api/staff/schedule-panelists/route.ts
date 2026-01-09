/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { SchedulePanelistsController } from "@/controllers/schedule-panelists.controller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function coerceQuery(searchParams: URLSearchParams) {
    const obj: Record<string, unknown> = {}
    for (const [key, value] of searchParams.entries()) {
        if (value === "true" || value === "false") obj[key] = value === "true"
        else obj[key] = value
    }
    return obj
}

function errorJson(err: any, fallback: string) {
    const status = err?.status ?? err?.statusCode ?? 500
    return NextResponse.json({ error: err?.message ?? fallback }, { status })
}

async function tryCalls(fn: any, calls: Array<() => Promise<any>>) {
    let lastErr: any = null
    for (const c of calls) {
        try {
            return await c()
        } catch (e: any) {
            lastErr = e
        }
    }
    throw lastErr ?? new Error("Request failed")
}

export async function GET(req: NextRequest) {
    try {
        const q = coerceQuery(req.nextUrl.searchParams)
        const scheduleId = String(q.scheduleId ?? q.schedule_id ?? "")
        if (!scheduleId) {
            return NextResponse.json({ error: "scheduleId (or schedule_id) is required" }, { status: 400 })
        }

        const data = await tryCalls(SchedulePanelistsController.list as any, [
            () => (SchedulePanelistsController.list as any)(scheduleId),
            () => (SchedulePanelistsController.list as any)({ schedule_id: scheduleId }),
            () => (SchedulePanelistsController.list as any)({ scheduleId }),
            () => (SchedulePanelistsController.list as any)(q),
        ])
        return NextResponse.json(data)
    } catch (err: any) {
        return errorJson(err, "Failed to list schedule panelists")
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null)
        if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

        const data = await (SchedulePanelistsController.add as any)(body)
        return NextResponse.json(data, { status: 201 })
    } catch (err: any) {
        return errorJson(err, "Failed to add schedule panelist")
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null)
        if (body) {
            const data = await (SchedulePanelistsController.remove as any)(body)
            return NextResponse.json(data ?? { ok: true })
        }

        const q = coerceQuery(req.nextUrl.searchParams)
        const data = await (SchedulePanelistsController.remove as any)(q)
        return NextResponse.json(data ?? { ok: true })
    } catch (err: any) {
        return errorJson(err, "Failed to remove schedule panelist")
    }
}
