/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { ThesisController } from "@/controllers/thesisController"
import { errorJson, readJson } from "@/lib/http"
import { requireActor, assertRoles } from "@/lib/apiAuth"
import { parseQuery, parseBody } from "@/lib/validate"
import { thesisContracts } from "@/lib/apiContracts"

export async function GET(req: NextRequest) {
    try {
        await requireActor(req)

        const base = parseQuery(thesisContracts.baseQuerySchema, req.nextUrl.searchParams)

        if (base.resource === "groups") {
            const q = parseQuery(thesisContracts.groupsGetQuerySchema, req.nextUrl.searchParams)

            if (q.id) {
                const group = await ThesisController.getGroupById(q.id)
                if (!group) return NextResponse.json({ ok: false, message: "Group not found" }, { status: 404 })
                return NextResponse.json({ ok: true, group })
            }

            const out = await ThesisController.listGroups({ q: q.q, limit: q.limit, offset: q.offset })
            return NextResponse.json({ ok: true, ...out })
        }

        if (base.resource === "members") {
            const q = parseQuery(thesisContracts.membersGetQuerySchema, req.nextUrl.searchParams)
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

        const base = parseQuery(thesisContracts.baseQuerySchema, req.nextUrl.searchParams)
        const raw = await readJson(req)

        if (base.resource === "groups") {
            const body = parseBody(thesisContracts.createGroupBodySchema, raw)
            const group = await ThesisController.createGroup({
                title: body.title,
                adviserId: body.adviserId ?? null,
                program: body.program ?? null,
                term: body.term ?? null,
            })
            return NextResponse.json({ ok: true, group }, { status: 201 })
        }

        if (base.resource === "members") {
            const body = parseBody(thesisContracts.addMemberBodySchema, raw)
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

        const base = parseQuery(thesisContracts.baseQuerySchema, req.nextUrl.searchParams)
        const raw = await readJson(req)

        if (base.resource === "groups") {
            const body = parseBody(thesisContracts.updateGroupBodySchema, raw)
            const id = req.nextUrl.searchParams.get("id") ?? body.id
            if (!id) {
                return NextResponse.json({ ok: false, message: "id is required (query param or body)" }, { status: 400 })
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
            const body = parseBody(thesisContracts.setMembersBodySchema, raw)
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

        const base = parseQuery(thesisContracts.baseQuerySchema, req.nextUrl.searchParams)

        if (base.resource === "groups") {
            const q = parseQuery(thesisContracts.deleteGroupQuerySchema, req.nextUrl.searchParams)
            const deletedId = await ThesisController.deleteGroup(q.id)
            if (!deletedId) return NextResponse.json({ ok: false, message: "Group not found" }, { status: 404 })
            return NextResponse.json({ ok: true, id: deletedId })
        }

        if (base.resource === "members") {
            const q = parseQuery(thesisContracts.deleteMemberQuerySchema, req.nextUrl.searchParams)
            const deleted = await ThesisController.removeMember(q.groupId, q.studentId)
            if (!deleted) return NextResponse.json({ ok: false, message: "Member not found" }, { status: 404 })
            return NextResponse.json({ ok: true, member: deleted })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to delete thesis data")
    }
}
