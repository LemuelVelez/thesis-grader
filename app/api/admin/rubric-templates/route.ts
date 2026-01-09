/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { RubricTemplatesController } from "@/controllers/rubric-templates.controller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function coerceQuery(searchParams: URLSearchParams) {
    const obj: Record<string, unknown> = {}
    for (const [key, value] of searchParams.entries()) {
        if (key === "page" || key === "limit" || key === "offset") {
            const n = Number(value)
            obj[key] = Number.isFinite(n) ? n : value
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
        const query = coerceQuery(req.nextUrl.searchParams)

        // ✅ Support fetching a single template via query param
        const id = (query as any)?.id
        if (id) {
            const data = await (RubricTemplatesController.getById as any)(String(id))
            return NextResponse.json(data)
        }

        const data = await (RubricTemplatesController.list as any)(query)
        return NextResponse.json(data)
    } catch (err: any) {
        return errorJson(err, "Failed to list rubric templates")
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null)
        if (!body) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
        }

        const data = await (RubricTemplatesController.create as any)(body)
        return NextResponse.json(data, { status: 201 })
    } catch (err: any) {
        return errorJson(err, "Failed to create rubric template")
    }
}
