/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { RubricCriteriaController } from "@/controllers/rubric-criteria.controller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ✅ Match Next.js route handler context typing for dynamic segments
type RouteContext = {
    params: Promise<{ id: string }>
}

function errorJson(err: any, fallback: string) {
    const status = err?.status ?? err?.statusCode ?? 500
    return NextResponse.json({ error: err?.message ?? fallback }, { status })
}

async function getIdFromCtxOrPath(req: NextRequest, ctx: RouteContext): Promise<string> {
    const { id } = await ctx.params
    if (id) return String(id)

    // Fallback (defensive)
    const parts = req.nextUrl.pathname.split("/").filter(Boolean)
    const last = parts[parts.length - 1] ?? ""
    return String(last)
}

// ✅ GET /api/admin/rubric-criteria/:id
export async function GET(req: NextRequest, ctx: RouteContext) {
    try {
        const id = await getIdFromCtxOrPath(req, ctx)
        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

        const data = await (RubricCriteriaController.getById as any)(id)
        return NextResponse.json(data)
    } catch (err: any) {
        return errorJson(err, "Failed to get rubric criterion")
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

        const data = await (RubricCriteriaController.update as any)(id, body)
        return NextResponse.json(data)
    } catch (err: any) {
        return errorJson(err, "Failed to update rubric criterion")
    }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
    try {
        const id = await getIdFromCtxOrPath(req, ctx)
        if (!id) {
            return NextResponse.json({ error: "Missing id" }, { status: 400 })
        }

        const data = await (RubricCriteriaController.delete as any)(id)
        return NextResponse.json(data ?? { ok: true })
    } catch (err: any) {
        return errorJson(err, "Failed to delete rubric criterion")
    }
}
