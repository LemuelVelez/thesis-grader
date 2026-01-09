/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { ProfileController } from "@/controllers/profileController"

function pgStatus(err: any) {
    if (err?.status) return err.status
    const code = String(err?.code ?? "")
    if (code === "23505") return 409
    if (code === "23503") return 400
    if (code === "23502") return 400
    if (code === "22P02") return 400
    if (code === "P0001") return 400
    return 500
}

function errorJson(err: any, fallback: string) {
    const status = pgStatus(err)
    return NextResponse.json({ ok: false, message: err?.message ?? fallback }, { status })
}

async function readJson(req: NextRequest) {
    try {
        return await req.json()
    } catch {
        return {}
    }
}

function toNum(v: string | null, fallback: number) {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
}

export async function GET(req: NextRequest) {
    try {
        const sp = req.nextUrl.searchParams
        const resource = sp.get("resource") ?? "users"

        if (resource === "users") {
            const id = sp.get("id")
            if (id) {
                const user = await ProfileController.getUserById(id)
                if (!user) return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 })
                return NextResponse.json({ ok: true, user })
            }
            const out = await ProfileController.listUsers({
                q: sp.get("q") ?? "",
                role: sp.get("role") ?? undefined,
                status: sp.get("status") ?? undefined,
                limit: toNum(sp.get("limit"), 50),
                offset: toNum(sp.get("offset"), 0),
            })
            return NextResponse.json({ ok: true, ...out })
        }

        if (resource === "students") {
            const userId = sp.get("userId")
            if (!userId) return NextResponse.json({ ok: false, message: "userId is required" }, { status: 400 })
            const profile = await ProfileController.getStudentProfile(userId)
            return NextResponse.json({ ok: true, profile })
        }

        if (resource === "staffProfiles") {
            const userId = sp.get("userId")
            if (!userId) return NextResponse.json({ ok: false, message: "userId is required" }, { status: 400 })
            const profile = await ProfileController.getStaffProfile(userId)
            return NextResponse.json({ ok: true, profile })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to fetch profile data")
    }
}

export async function POST(req: NextRequest) {
    try {
        const sp = req.nextUrl.searchParams
        const resource = sp.get("resource") ?? "students"
        const body = await readJson(req)

        if (resource === "students") {
            const userId = String(body?.userId ?? "").trim()
            if (!userId) return NextResponse.json({ ok: false, message: "userId is required" }, { status: 400 })
            const profile = await ProfileController.upsertStudentProfile({
                userId,
                program: body?.program ?? null,
                section: body?.section ?? null,
            })
            return NextResponse.json({ ok: true, profile }, { status: 201 })
        }

        if (resource === "staffProfiles") {
            const userId = String(body?.userId ?? "").trim()
            if (!userId) return NextResponse.json({ ok: false, message: "userId is required" }, { status: 400 })
            const profile = await ProfileController.upsertStaffProfile({
                userId,
                department: body?.department ?? null,
            })
            return NextResponse.json({ ok: true, profile }, { status: 201 })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to create profile data")
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const sp = req.nextUrl.searchParams
        const resource = sp.get("resource") ?? "users"
        const body = await readJson(req)

        if (resource === "users") {
            const id = sp.get("id") ?? String(body?.id ?? "")
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })

            const user = await ProfileController.updateUser(id, {
                name: body?.name,
                email: body?.email,
                role: body?.role,
                status: body?.status,
                avatarKey: body?.avatarKey,
            })
            if (!user) return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 })
            return NextResponse.json({ ok: true, user })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to update profile data")
    }
}

export async function DELETE(_req: NextRequest) {
    // Intentionally not implemented for safety (users/profiles deletion can be destructive).
    return NextResponse.json({ ok: false, message: "Not implemented" }, { status: 501 })
}
