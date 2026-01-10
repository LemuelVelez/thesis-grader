/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { requireActor } from "@/lib/apiAuth"
import { errorJson } from "@/lib/http"

function actorRoleOf(actor: any) {
    return String(actor?.role ?? "").toLowerCase()
}
function actorIdOf(actor: any) {
    return String(actor?.id ?? "")
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        const role = actorRoleOf(actor)
        const actorId = actorIdOf(actor)

        if (role !== "staff" && role !== "admin") {
            return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
        }

        const evaluationId = String(req.nextUrl.searchParams.get("evaluationId") ?? "").trim()
        if (!evaluationId) {
            return NextResponse.json({ ok: false, message: "evaluationId is required" }, { status: 400 })
        }

        // verify evaluation exists + RBAC (staff only their own)
        const { rows: evRows } = await db.query(
            `
            select id, evaluator_id as "evaluatorId", schedule_id as "scheduleId"
            from evaluations
            where id = $1
            limit 1
            `,
            [evaluationId]
        )

        const ev = evRows?.[0]
        if (!ev) return NextResponse.json({ ok: false, message: "Evaluation not found" }, { status: 404 })

        if (role === "staff" && String(ev.evaluatorId) !== actorId) {
            return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
        }

        const { rows } = await db.query(
            `
            select
              u.id,
              u.name,
              u.email
            from evaluations e
            join defense_schedules ds on ds.id = e.schedule_id
            join group_members gm on gm.group_id = ds.group_id
            join users u on u.id = gm.student_id
            where e.id = $1
            order by u.name asc
            `,
            [evaluationId]
        )

        return NextResponse.json({ ok: true, members: rows ?? [] })
    } catch (err: any) {
        return errorJson(err, "Failed to fetch evaluation members")
    }
}
