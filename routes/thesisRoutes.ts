/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { ThesisController } from "@/controllers/thesisController"
import { errorJson, readJson, toNum } from "@/lib/http"
import { requireActor, assertRoles } from "@/lib/apiAuth"

export async function GET(req: NextRequest) {
    try {
        // Any logged-in user can view thesis data (adjust if you want student-only limitations)
        await requireActor(req)

        const sp = req.nextUrl.searchParams
        const resource = sp.get("resource") ?? "groups"

        if (resource === "groups") {
            const id = sp.get("id")
            if (id) {
                const group = await ThesisController.getGroupById(id)
                if (!group) return NextResponse.json({ ok: false, message: "Group not found" }, { status: 404 })
                return NextResponse.json({ ok: true, group })
            }
            const q = sp.get("q") ?? ""
            const limit = toNum(sp.get("limit"), 50)
            const offset = toNum(sp.get("offset"), 0)
            const out = await ThesisController.listGroups({ q, limit, offset })
            return NextResponse.json({ ok: true, ...out })
        }

        if (resource === "members") {
            const groupId = sp.get("groupId")
            if (!groupId) return NextResponse.json({ ok: false, message: "Missing groupId" }, { status: 400 })
            const members = await ThesisController.listMembers(groupId)
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

        const sp = req.nextUrl.searchParams
        const resource = sp.get("resource") ?? "groups"
        const body = await readJson(req)

        if (resource === "groups") {
            const title = String(body?.title ?? "").trim()
            if (!title) return NextResponse.json({ ok: false, message: "title is required" }, { status: 400 })

            const group = await ThesisController.createGroup({
                title,
                adviserId: body?.adviserId ?? null,
                program: body?.program ?? null,
                term: body?.term ?? null,
            })
            return NextResponse.json({ ok: true, group }, { status: 201 })
        }

        if (resource === "members") {
            const groupId = String(body?.groupId ?? "").trim()
            const studentId = String(body?.studentId ?? "").trim()
            if (!groupId || !studentId) {
                return NextResponse.json({ ok: false, message: "groupId and studentId are required" }, { status: 400 })
            }
            const member = await ThesisController.addMember(groupId, studentId)
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

        const sp = req.nextUrl.searchParams
        const resource = sp.get("resource") ?? "groups"
        const body = await readJson(req)

        if (resource === "groups") {
            const id = sp.get("id") ?? String(body?.id ?? "")
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })

            const group = await ThesisController.updateGroup(id, {
                title: body?.title,
                adviserId: body?.adviserId,
                program: body?.program,
                term: body?.term,
            })
            if (!group) return NextResponse.json({ ok: false, message: "Group not found" }, { status: 404 })
            return NextResponse.json({ ok: true, group })
        }

        if (resource === "members") {
            const groupId = String(body?.groupId ?? "").trim()
            const studentIds = Array.isArray(body?.studentIds) ? body.studentIds.map(String) : []
            if (!groupId) return NextResponse.json({ ok: false, message: "groupId is required" }, { status: 400 })

            const members = await ThesisController.setMembers(groupId, studentIds)
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

        const sp = req.nextUrl.searchParams
        const resource = sp.get("resource") ?? "groups"

        if (resource === "groups") {
            const id = sp.get("id")
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })

            const deletedId = await ThesisController.deleteGroup(id)
            if (!deletedId) return NextResponse.json({ ok: false, message: "Group not found" }, { status: 404 })
            return NextResponse.json({ ok: true, id: deletedId })
        }

        if (resource === "members") {
            const groupId = sp.get("groupId")
            const studentId = sp.get("studentId")
            if (!groupId || !studentId) {
                return NextResponse.json({ ok: false, message: "groupId and studentId are required" }, { status: 400 })
            }
            const deleted = await ThesisController.removeMember(groupId, studentId)
            if (!deleted) return NextResponse.json({ ok: false, message: "Member not found" }, { status: 404 })
            return NextResponse.json({ ok: true, member: deleted })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to delete thesis data")
    }
}
