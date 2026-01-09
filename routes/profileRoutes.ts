/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { ProfileController } from "@/controllers/profileController"
import { errorJson, readJson } from "@/lib/http"
import { requireActor, assertRoles, assertSelfOrRoles } from "@/lib/apiAuth"
import { parseQuery, parseBody } from "@/lib/validate"
import { profileContracts } from "@/lib/apiContracts"

export async function GET(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        const base = parseQuery(profileContracts.baseQuerySchema, req.nextUrl.searchParams)

        if (base.resource === "users") {
            assertRoles(actor, ["staff", "admin"])
            const q = parseQuery(profileContracts.usersGetQuerySchema, req.nextUrl.searchParams)

            if (q.id) {
                const user = await ProfileController.getUserById(q.id)
                if (!user) return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 })
                return NextResponse.json({ ok: true, user })
            }

            const out = await ProfileController.listUsers({
                q: q.q,
                role: q.role,
                status: q.status,
                limit: q.limit,
                offset: q.offset,
            })
            return NextResponse.json({ ok: true, ...out })
        }

        if (base.resource === "students") {
            const q = parseQuery(profileContracts.studentProfileGetQuerySchema, req.nextUrl.searchParams)
            assertSelfOrRoles(actor, q.userId, ["staff", "admin"])
            const profile = await ProfileController.getStudentProfile(q.userId)
            return NextResponse.json({ ok: true, profile })
        }

        if (base.resource === "staffProfiles") {
            const q = parseQuery(profileContracts.staffProfileGetQuerySchema, req.nextUrl.searchParams)

            const actorRole = String((actor as any)?.role ?? "").toLowerCase()
            if (actorRole === "student") return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })

            // staff can only read own; admin can read any
            assertSelfOrRoles(actor, q.userId, ["admin"])

            const profile = await ProfileController.getStaffProfile(q.userId)
            return NextResponse.json({ ok: true, profile })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to fetch profile data")
    }
}

export async function POST(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        const base = parseQuery(profileContracts.baseQuerySchema, req.nextUrl.searchParams)
        const raw = await readJson(req)

        if (base.resource === "students") {
            const body = parseBody(profileContracts.upsertStudentProfileBodySchema, raw)
            assertSelfOrRoles(actor, body.userId, ["staff", "admin"])

            const profile = await ProfileController.upsertStudentProfile({
                userId: body.userId,
                program: body.program ?? null,
                section: body.section ?? null,
            })
            return NextResponse.json({ ok: true, profile }, { status: 201 })
        }

        if (base.resource === "staffProfiles") {
            const body = parseBody(profileContracts.upsertStaffProfileBodySchema, raw)
            const actorRole = String((actor as any)?.role ?? "").toLowerCase()

            if (actorRole === "staff") {
                assertSelfOrRoles(actor, body.userId, ["staff"])
            } else {
                assertRoles(actor, ["admin"])
            }

            const profile = await ProfileController.upsertStaffProfile({
                userId: body.userId,
                department: body.department ?? null,
            })
            return NextResponse.json({ ok: true, profile }, { status: 201 })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource (use students or staffProfiles)" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to create profile data")
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        const base = parseQuery(profileContracts.baseQuerySchema, req.nextUrl.searchParams)
        const raw = await readJson(req)

        if (base.resource === "users") {
            assertRoles(actor, ["admin"])

            const body = parseBody(profileContracts.patchUserBodySchema, raw)
            const id = req.nextUrl.searchParams.get("id") ?? body.id
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })

            const user = await ProfileController.updateUser(id, {
                name: body.name,
                email: body.email,
                role: body.role as any,
                status: body.status as any,
                avatarKey: body.avatarKey,
            })
            if (!user) return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 })
            return NextResponse.json({ ok: true, user })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource (PATCH supports users only)" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to update profile data")
    }
}

export async function DELETE(_req: NextRequest) {
    return NextResponse.json({ ok: false, message: "Not implemented" }, { status: 501 })
}
