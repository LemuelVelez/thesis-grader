/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { RubricTemplatesController } from "@/controllers/rubric-templates.controller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = {
    params: Promise<{ id: string }>
}

function errorJson(err: any, fallback: string) {
    const status = err?.status ?? err?.statusCode ?? 500
    return NextResponse.json({ error: err?.message ?? fallback }, { status })
}

function getIdFromPath(req: NextRequest): string {
    const parts = req.nextUrl.pathname.split("/").filter(Boolean)
    const last = parts[parts.length - 1] ?? ""
    return String(last)
}

async function getIdFromCtxOrPath(req: NextRequest, ctx: RouteContext): Promise<string> {
    try {
        const params = await ctx.params
        const fromParams = params?.id
        if (fromParams) return String(fromParams)
    } catch {
        // ignore and fallback to pathname parsing
    }

    return getIdFromPath(req)
}

// ✅ GET /api/admin/rubric-templates/:id
export async function GET(req: NextRequest, ctx: RouteContext) {
    try {
        const id = await getIdFromCtxOrPath(req, ctx)
        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

        const data = await (RubricTemplatesController.getById as any)(id)
        return NextResponse.json(data)
    } catch (err: any) {
        return errorJson(err, "Failed to get rubric template")
    }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
    try {
        const id = await getIdFromCtxOrPath(req, ctx)
        if (!id) {
            return NextResponse.json({ error: "Missing id" }, { status: 400 })
        }

        const body = await req.json().catch(() => null)
        if (!body) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
        }

        const data = await (RubricTemplatesController.update as any)(id, body)
        return NextResponse.json(data)
    } catch (err: any) {
        return errorJson(err, "Failed to update rubric template")
    }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
    try {
        const id = await getIdFromCtxOrPath(req, ctx)
        if (!id) {
            return NextResponse.json({ error: "Missing id" }, { status: 400 })
        }

        const data = await (RubricTemplatesController.delete as any)(id)
        return NextResponse.json(data ?? { ok: true })
    } catch (err: any) {
        return errorJson(err, "Failed to delete rubric template")
    }
}
