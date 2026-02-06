/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { StaffProfilesController } from "@/controllers/staff-profiles.controller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

function errorJson(err: any, fallback: string) {
    const status = err?.status ?? err?.statusCode ?? 500
    return NextResponse.json({ error: err?.message ?? fallback }, { status })
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
    try {
        const { id } = await ctx.params
        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

        const fn: any = StaffProfilesController.getProfile
        const data = fn.length >= 1 ? await fn(id) : await fn({ id })
        return NextResponse.json(data)
    } catch (err: any) {
        return errorJson(err, "Failed to get staff profile")
    }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
    try {
        const { id } = await ctx.params
        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

        const data = await (StaffProfilesController.deleteProfile as any)(id)
        return NextResponse.json(data ?? { ok: true })
    } catch (err: any) {
        return errorJson(err, "Failed to delete staff profile")
    }
}
