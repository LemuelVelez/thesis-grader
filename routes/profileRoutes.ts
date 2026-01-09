/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { ProfileController } from "@/controllers/profileController"
import { errorJson, readJson } from "@/lib/http"
import { requireActor, assertRoles, assertSelfOrRoles } from "@/lib/apiAuth"
import { parseQuery, parseBody, zUuid, zLimit, zOffset } from "@/lib/validate"

const ProfileResource = z.enum(["users", "students", "staffProfiles"])

const ProfileBaseQuerySchema = z.object({
    resource: ProfileResource.default("users"),
})

const UsersGetQuerySchema = z.object({
    resource: z.literal("users"),
    id: zUuid.optional(),
    q: z.string().optional().default(""),
    role: z.string().optional(),
    status: z.string().optional(),
    limit: zLimit,
    offset: zOffset,
})

const StudentProfileQuerySchema = z.object({
    resource: z.literal("students"),
    userId: zUuid,
})

const StaffProfileQuerySchema = z.object({
    resource: z.literal("staffProfiles"),
    userId: zUuid,
})

const UpsertStudentProfileBodySchema = z.object({
    userId: zUuid,
    program: z.string().nullable().optional(),
    section: z.string().nullable().optional(),
})

const UpsertStaffProfileBodySchema = z.object({
    userId: zUuid,
    department: z.string().nullable().optional(),
})

const PatchUserBodySchema = z.object({
    id: zUuid.optional(),
    name: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    role: z.enum(["student", "staff", "admin"]).optional(),
    status: z.enum(["active", "disabled"]).optional(),
    avatarKey: z.string().nullable().optional(),
})

export async function GET(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        const base = parseQuery(ProfileBaseQuerySchema, req.nextUrl.searchParams)

        if (base.resource === "users") {
            assertRoles(actor, ["staff", "admin"])
            const q = parseQuery(UsersGetQuerySchema, req.nextUrl.searchParams)

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
            const q = parseQuery(StudentProfileQuerySchema, req.nextUrl.searchParams)
            assertSelfOrRoles(actor, q.userId, ["staff", "admin"])
            const profile = await ProfileController.getStudentProfile(q.userId)
            return NextResponse.json({ ok: true, profile })
        }

        if (base.resource === "staffProfiles") {
            const q = parseQuery(StaffProfileQuerySchema, req.nextUrl.searchParams)

            // only staff/admin can access, student blocked explicitly
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
        const base = parseQuery(ProfileBaseQuerySchema, req.nextUrl.searchParams)
        const raw = await readJson(req)

        if (base.resource === "students") {
            const body = parseBody(UpsertStudentProfileBodySchema, raw)
            assertSelfOrRoles(actor, body.userId, ["staff", "admin"])

            const profile = await ProfileController.upsertStudentProfile({
                userId: body.userId,
                program: body.program ?? null,
                section: body.section ?? null,
            })
            return NextResponse.json({ ok: true, profile }, { status: 201 })
        }

        if (base.resource === "staffProfiles") {
            const body = parseBody(UpsertStaffProfileBodySchema, raw)
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
        const base = parseQuery(ProfileBaseQuerySchema, req.nextUrl.searchParams)
        const raw = await readJson(req)

        if (base.resource === "users") {
            assertRoles(actor, ["admin"])

            const body = parseBody(PatchUserBodySchema, raw)
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
