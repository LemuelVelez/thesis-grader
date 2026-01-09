/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { ScheduleController } from "@/controllers/scheduleController"
import { errorJson, readJson, toNum } from "@/lib/http"
import { requireActor, assertRoles } from "@/lib/apiAuth"

export async function GET(req: NextRequest) {
    try {
        // Any logged-in user can view schedules (adjust if needed)
        await requireActor(req)

        const sp = req.nextUrl.searchParams
        const resource = sp.get("resource") ?? "schedules"

        if (resource === "schedules") {
            const id = sp.get("id")
            if (id) {
                const schedule = await ScheduleController.getScheduleById(id)
                if (!schedule) return NextResponse.json({ ok: false, message: "Schedule not found" }, { status: 404 })
                return NextResponse.json({ ok: true, schedule })
            }

            const out = await ScheduleController.listSchedules({
                q: sp.get("q") ?? "",
                groupId: sp.get("groupId") ?? undefined,
                status: sp.get("status") ?? undefined,
                from: sp.get("from") ?? undefined,
                to: sp.get("to") ?? undefined,
                limit: toNum(sp.get("limit"), 50),
                offset: toNum(sp.get("offset"), 0),
            })
            return NextResponse.json({ ok: true, ...out })
        }

        if (resource === "panelists") {
            const scheduleId = sp.get("scheduleId")
            if (!scheduleId) return NextResponse.json({ ok: false, message: "Missing scheduleId" }, { status: 400 })
            const panelists = await ScheduleController.listPanelists(scheduleId)
            return NextResponse.json({ ok: true, panelists })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to fetch schedule data")
    }
}

export async function POST(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        assertRoles(actor, ["staff", "admin"])

        const sp = req.nextUrl.searchParams
        const resource = sp.get("resource") ?? "schedules"
        const body = await readJson(req)

        if (resource === "schedules") {
            const groupId = String(body?.groupId ?? "").trim()
            const scheduledAt = String(body?.scheduledAt ?? "").trim()
            if (!groupId || !scheduledAt) {
                return NextResponse.json({ ok: false, message: "groupId and scheduledAt are required" }, { status: 400 })
            }
            const schedule = await ScheduleController.createSchedule({
                groupId,
                scheduledAt,
                room: body?.room ?? null,
                status: body?.status ?? "scheduled",
                createdBy: body?.createdBy ?? null,
            })
            return NextResponse.json({ ok: true, schedule }, { status: 201 })
        }

        if (resource === "panelists") {
            const scheduleId = String(body?.scheduleId ?? "").trim()
            const staffId = String(body?.staffId ?? "").trim()
            if (!scheduleId || !staffId) {
                return NextResponse.json({ ok: false, message: "scheduleId and staffId are required" }, { status: 400 })
            }
            const panelist = await ScheduleController.addPanelist(scheduleId, staffId)
            return NextResponse.json({ ok: true, panelist }, { status: 201 })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to create schedule data")
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        assertRoles(actor, ["staff", "admin"])

        const sp = req.nextUrl.searchParams
        const resource = sp.get("resource") ?? "schedules"
        const body = await readJson(req)

        if (resource === "schedules") {
            const id = sp.get("id") ?? String(body?.id ?? "")
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })

            const schedule = await ScheduleController.updateSchedule(id, {
                groupId: body?.groupId,
                scheduledAt: body?.scheduledAt,
                room: body?.room,
                status: body?.status,
                createdBy: body?.createdBy,
            })
            if (!schedule) return NextResponse.json({ ok: false, message: "Schedule not found" }, { status: 404 })
            return NextResponse.json({ ok: true, schedule })
        }

        if (resource === "panelists") {
            const scheduleId = String(body?.scheduleId ?? "").trim()
            const staffIds = Array.isArray(body?.staffIds) ? body.staffIds.map(String) : []
            if (!scheduleId) return NextResponse.json({ ok: false, message: "scheduleId is required" }, { status: 400 })
            const panelists = await ScheduleController.setPanelists(scheduleId, staffIds)
            return NextResponse.json({ ok: true, panelists })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to update schedule data")
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        assertRoles(actor, ["staff", "admin"])

        const sp = req.nextUrl.searchParams
        const resource = sp.get("resource") ?? "schedules"

        if (resource === "schedules") {
            const id = sp.get("id")
            if (!id) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 })
            const deletedId = await ScheduleController.deleteSchedule(id)
            if (!deletedId) return NextResponse.json({ ok: false, message: "Schedule not found" }, { status: 404 })
            return NextResponse.json({ ok: true, id: deletedId })
        }

        if (resource === "panelists") {
            const scheduleId = sp.get("scheduleId")
            const staffId = sp.get("staffId")
            if (!scheduleId || !staffId) {
                return NextResponse.json({ ok: false, message: "scheduleId and staffId are required" }, { status: 400 })
            }
            const deleted = await ScheduleController.removePanelist(scheduleId, staffId)
            if (!deleted) return NextResponse.json({ ok: false, message: "Panelist not found" }, { status: 404 })
            return NextResponse.json({ ok: true, panelist: deleted })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to delete schedule data")
    }
}
