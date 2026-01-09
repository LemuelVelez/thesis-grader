/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { DefenseSchedulesController } from "@/controllers/defense-schedules.controller"

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

async function callList(fn: any, query: any) {
    if (typeof fn !== "function") throw new Error("List handler is not a function")
    if (fn.length === 0) return await fn()
    return await fn(query)
}

export async function GET(req: NextRequest) {
    try {
        const query = coerceQuery(req.nextUrl.searchParams)
        const data = await callList(DefenseSchedulesController.list as any, query)
        return NextResponse.json(data)
    } catch (err: any) {
        return errorJson(err, "Failed to list defense schedules")
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null)
        if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

        const data = await (DefenseSchedulesController.create as any)(body)
        return NextResponse.json(data, { status: 201 })
    } catch (err: any) {
        return errorJson(err, "Failed to create defense schedule")
    }
}
