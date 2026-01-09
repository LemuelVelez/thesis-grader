/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { ScheduleController } from "@/controllers/scheduleController"
import { errorJson, readJson } from "@/lib/http"
import { requireActor, assertRoles } from "@/lib/apiAuth"
import { parseQuery, parseBody } from "@/lib/validate"
import { scheduleContracts } from "@/lib/apiContracts"

export async function GET(req: NextRequest) {
    try {
        await requireActor(req)

        const base = parseQuery(scheduleContracts.baseQuerySchema, req.nextUrl.searchParams)

        if (base.resource === "schedules") {
            const q = parseQuery(scheduleContracts.schedulesGetQuerySchema, req.nextUrl.searchParams)

            if (q.id) {
                const schedule = await ScheduleController.getScheduleById(q.id)
                if (!schedule) return NextResponse.json({ ok: false, message: "Schedule not found" }, { status: 404 })
                return NextResponse.json({ ok: true, schedule })
            }

            const out = await ScheduleController.listSchedules({
                q: q.q,
                groupId: q.groupId,
                status: q.status,
                from: q.from,
                to: q.to,
                limit: q.limit,
                offset: q.offset,
            })
            return NextResponse.json({ ok: true, ...out })
        }

        if (base.resource === "panelists") {
            const q = parseQuery(scheduleContracts.panelistsGetQuerySchema, req.nextUrl.searchParams)
            const panelists = await ScheduleController.listPanelists(q.scheduleId)
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

        const base = parseQuery(scheduleContracts.baseQuerySchema, req.nextUrl.searchParams)
        const raw = await readJson(req)

        if (base.resource === "schedules") {
            const body = parseBody(scheduleContracts.createScheduleBodySchema, raw)
            const schedule = await ScheduleController.createSchedule({
                groupId: body.groupId,
                scheduledAt: body.scheduledAt,
                room: body.room ?? null,
                status: body.status ?? "scheduled",
                createdBy: body.createdBy ?? null,
            })
            return NextResponse.json({ ok: true, schedule }, { status: 201 })
        }

        if (base.resource === "panelists") {
            const body = parseBody(scheduleContracts.addPanelistBodySchema, raw)
            const panelist = await ScheduleController.addPanelist(body.scheduleId, body.staffId)
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

        const base = parseQuery(scheduleContracts.baseQuerySchema, req.nextUrl.searchParams)
        const raw = await readJson(req)

        if (base.resource === "schedules") {
            const body = parseBody(scheduleContracts.updateScheduleBodySchema, raw)
            const id = req.nextUrl.searchParams.get("id") ?? body.id
            if (!id) {
                return NextResponse.json({ ok: false, message: "id is required (query param or body)" }, { status: 400 })
            }

            const schedule = await ScheduleController.updateSchedule(id, {
                groupId: body.groupId,
                scheduledAt: body.scheduledAt,
                room: body.room,
                status: body.status,
                createdBy: body.createdBy,
            })
            if (!schedule) return NextResponse.json({ ok: false, message: "Schedule not found" }, { status: 404 })
            return NextResponse.json({ ok: true, schedule })
        }

        if (base.resource === "panelists") {
            const body = parseBody(scheduleContracts.setPanelistsBodySchema, raw)
            const panelists = await ScheduleController.setPanelists(body.scheduleId, body.staffIds)
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

        const base = parseQuery(scheduleContracts.baseQuerySchema, req.nextUrl.searchParams)

        if (base.resource === "schedules") {
            const q = parseQuery(scheduleContracts.deleteScheduleQuerySchema, req.nextUrl.searchParams)
            const deletedId = await ScheduleController.deleteSchedule(q.id)
            if (!deletedId) return NextResponse.json({ ok: false, message: "Schedule not found" }, { status: 404 })
            return NextResponse.json({ ok: true, id: deletedId })
        }

        if (base.resource === "panelists") {
            const q = parseQuery(scheduleContracts.deletePanelistQuerySchema, req.nextUrl.searchParams)
            const deleted = await ScheduleController.removePanelist(q.scheduleId, q.staffId)
            if (!deleted) return NextResponse.json({ ok: false, message: "Panelist not found" }, { status: 404 })
            return NextResponse.json({ ok: true, panelist: deleted })
        }

        return NextResponse.json({ ok: false, message: "Invalid resource" }, { status: 400 })
    } catch (err: any) {
        return errorJson(err, "Failed to delete schedule data")
    }
}
