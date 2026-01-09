/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { ThesisController } from "@/controllers/thesisController"
import { errorJson, readJson } from "@/lib/http"
import { requireActor, assertRoles } from "@/lib/apiAuth"
import {
    parseQuery,
    parseBody,
    zUuid,
    zLimit,
    zOffset,
    zNonEmptyString,
} from "@/lib/validate"

const ThesisResource = z.enum(["groups", "members"])

const ThesisBaseQuerySchema = z.object({
    resource: ThesisResource.default("groups"),
})

const ThesisGroupsGetQuerySchema = z.object({
    resource: z.literal("groups"),
    id: zUuid.optional(),
    q: z.string().optional().default(""),
    limit: zLimit,
    offset: zOffset,
})

const ThesisMembersGetQuerySchema = z.object({
    resource: z.literal("members"),
    groupId: zUuid,
})

const ThesisCreateGroupBodySchema = z.object({
    title: zNonEmptyString("title"),
    adviserId: zUuid.nullable().optional(),
    program: z.string().nullable().optional(),
    term: z.string().nullable().optional(),
})

const ThesisAddMemberBodySchema = z.object({
    groupId: zUuid,
    studentId: zUuid,
})

const ThesisUpdateGroupBodySchema = z.object({
    id: zUuid.optional(),
    title: z.string().trim().min(1).optional(),
    adviserId: zUuid.nullable().optional(),
    program: z.string().nullable().optional(),
    term: z.string().nullable().optional(),
})

const ThesisSetMembersBodySchema = z.object({
    groupId: zUuid,
    studentIds: z.array(zUuid).default([]),
})

const ThesisDeleteGroupQuerySchema = z.object({
    resource: z.literal("groups").default("groups"),
    id: zUuid,
})

const ThesisDeleteMemberQuerySchema = z.object({
    resource: z.literal("members"),
    groupId: zUuid,
    studentId: zUuid,
})

export async function GET(req: NextRequest) {
    try {
        await requireActor(req)

        const base = parseQuery(ThesisBaseQuerySchema, req.nextUrl.searchParams)

        if (base.resource === "groups") {
            const q = parseQuery(ThesisGroupsGetQuerySchema, req.nextUrl.searchParams)

            if (q.id) {
                const group = await ThesisController.getGroupById(q.id)
                if (!group) return NextResponse.json({ ok: false, message: "Group not found" }, { status: 404 })
                return NextResponse.json({ ok: true, group })
            }

            const out = await ThesisController.listGroups({ q: q.q, limit: q.limit, offset: q.offset })
            return NextResponse.json({ ok: true, ...out })
        }

        if (base.resource === "members") {
            const q = parseQuery(ThesisMembersGetQuerySchema, req.nextUrl.searchParams)
            const members = await ThesisController.listMembers(q.groupId)
            return NextResponse.json({ ok: true, members })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to fetch thesis data")
    }
}

export async function POST(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        assertRoles(actor, ["staff", "admin"])

        const base = parseQuery(ThesisBaseQuerySchema, req.nextUrl.searchParams)
        const raw = await readJson(req)

        if (base.resource === "groups") {
            const body = parseBody(ThesisCreateGroupBodySchema, raw)
            const group = await ThesisController.createGroup({
                title: body.title,
                adviserId: body.adviserId ?? null,
                program: body.program ?? null,
                term: body.term ?? null,
            })
            return NextResponse.json({ ok: true, group }, { status: 201 })
        }

        if (base.resource === "members") {
            const body = parseBody(ThesisAddMemberBodySchema, raw)
            const member = await ThesisController.addMember(body.groupId, body.studentId)
            return NextResponse.json({ ok: true, member }, { status: 201 })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to create thesis data")
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        assertRoles(actor, ["staff", "admin"])

        const base = parseQuery(ThesisBaseQuerySchema, req.nextUrl.searchParams)
        const raw = await readJson(req)

        if (base.resource === "groups") {
            const body = parseBody(ThesisUpdateGroupBodySchema, raw)
            const id = req.nextUrl.searchParams.get("id") ?? body.id
            if (!id) {
                return NextResponse.json(
                    { ok: false, message: "id is required (query param or body)" },
                    { status: 400 }
                )
            }

            const group = await ThesisController.updateGroup(id, {
                title: body.title,
                adviserId: body.adviserId,
                program: body.program,
                term: body.term,
            })
            if (!group) return NextResponse.json({ ok: false, message: "Group not found" }, { status: 404 })
            return NextResponse.json({ ok: true, group })
        }

        if (base.resource === "members") {
            const body = parseBody(ThesisSetMembersBodySchema, raw)
            const members = await ThesisController.setMembers(body.groupId, body.studentIds)
            return NextResponse.json({ ok: true, members })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to update thesis data")
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        assertRoles(actor, ["staff", "admin"])

        const base = parseQuery(ThesisBaseQuerySchema, req.nextUrl.searchParams)

        if (base.resource === "groups") {
            const q = parseQuery(ThesisDeleteGroupQuerySchema, req.nextUrl.searchParams)
            const deletedId = await ThesisController.deleteGroup(q.id)
            if (!deletedId) return NextResponse.json({ ok: false, message: "Group not found" }, { status: 404 })
            return NextResponse.json({ ok: true, id: deletedId })
        }

        if (base.resource === "members") {
            const q = parseQuery(ThesisDeleteMemberQuerySchema, req.nextUrl.searchParams)
            const deleted = await ThesisController.removeMember(q.groupId, q.studentId)
            if (!deleted) return NextResponse.json({ ok: false, message: "Member not found" }, { status: 404 })
            return NextResponse.json({ ok: true, member: deleted })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to delete thesis data")
    }
}
