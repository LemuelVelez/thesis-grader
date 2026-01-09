/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { StaffProfilesController } from "@/controllers/staff-profiles.controller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function coerceQuery(searchParams: URLSearchParams) {
    const obj: Record<string, unknown> = {}
    for (const [key, value] of searchParams.entries()) obj[key] = value
    return obj
}

function errorJson(err: any, fallback: string) {
    const status = err?.status ?? err?.statusCode ?? 500
    return NextResponse.json({ error: err?.message ?? fallback }, { status })
}

export async function GET(req: NextRequest) {
    try {
        const q = coerceQuery(req.nextUrl.searchParams)
        const id = q.id ?? q.userId ?? q.user_id ?? q.staffId ?? q.staff_id
        if (!id) {
            return NextResponse.json({ error: "Provide id (or userId/user_id)" }, { status: 400 })
        }

        const fn: any = StaffProfilesController.getProfile
        const data = fn.length >= 1 ? await fn(String(id)) : await fn({ id: String(id) })
        return NextResponse.json(data)
    } catch (err: any) {
        return errorJson(err, "Failed to get staff profile")
    }
}

// Upsert support (POST or PUT)
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null)
        if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

        const data = await (StaffProfilesController.upsertProfile as any)(body)
        return NextResponse.json(data)
    } catch (err: any) {
        return errorJson(err, "Failed to upsert staff profile")
    }
}

export async function PUT(req: NextRequest) {
    return POST(req)
}

export async function DELETE(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null)
        const q = coerceQuery(req.nextUrl.searchParams)
        const id = body?.id ?? body?.userId ?? body?.user_id ?? q.id ?? q.userId ?? q.user_id
        if (!id) {
            return NextResponse.json({ error: "Provide id (or userId/user_id)" }, { status: 400 })
        }

        const data = await (StaffProfilesController.deleteProfile as any)(String(id))
        return NextResponse.json(data ?? { ok: true })
    } catch (err: any) {
        return errorJson(err, "Failed to delete staff profile")
    }
}
