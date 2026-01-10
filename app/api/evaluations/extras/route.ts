/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { requireActor } from "@/lib/apiAuth"
import { errorJson, readJson } from "@/lib/http"

function actorRoleOf(actor: any) {
    return String(actor?.role ?? "").toLowerCase()
}
function actorIdOf(actor: any) {
    return String(actor?.id ?? "")
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function assertEvaluationAccess(actor: any, evaluationId: string) {
    const role = actorRoleOf(actor)
    const actorId = actorIdOf(actor)

    if (role !== "staff" && role !== "admin") {
        return { forbidden: true as const }
    }

    const { rows: evRows } = await db.query(
        `
        select id, evaluator_id as "evaluatorId"
        from evaluations
        where id = $1
        limit 1
        `,
        [evaluationId]
    )

    const ev = evRows?.[0]
    if (!ev) return { notFound: true as const }

    if (role === "staff" && String(ev.evaluatorId) !== actorId) {
        return { forbidden: true as const }
    }

    return { ok: true as const }
}

export async function GET(req: NextRequest) {
    try {
        const actor = await requireActor(req)

        const evaluationId = String(req.nextUrl.searchParams.get("evaluationId") ?? "").trim()
        if (!evaluationId) {
            return NextResponse.json({ ok: false, message: "evaluationId is required" }, { status: 400 })
        }

        const access = await assertEvaluationAccess(actor, evaluationId)
        if ((access as any).notFound) return NextResponse.json({ ok: false, message: "Evaluation not found" }, { status: 404 })
        if ((access as any).forbidden) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })

        const { rows } = await db.query(
            `
            select data
            from evaluation_extras
            where evaluation_id = $1
            limit 1
            `,
            [evaluationId]
        )

        const extras = (rows?.[0]?.data ?? {}) as any
        return NextResponse.json({ ok: true, extras })
    } catch (err: any) {
        return errorJson(err, "Failed to fetch evaluation extras")
    }
}

export async function POST(req: NextRequest) {
    try {
        const actor = await requireActor(req)
        const role = actorRoleOf(actor)

        if (role !== "staff" && role !== "admin") {
            return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })
        }

        const body = await readJson(req)
        const evaluationId = String(body?.evaluationId ?? "").trim()
        const extrasRaw = body?.extras

        if (!evaluationId) {
            return NextResponse.json({ ok: false, message: "evaluationId is required" }, { status: 400 })
        }

        const access = await assertEvaluationAccess(actor, evaluationId)
        if ((access as any).notFound) return NextResponse.json({ ok: false, message: "Evaluation not found" }, { status: 404 })
        if ((access as any).forbidden) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 })

        // ensure JSON object (never store null/array as top-level)
        const extras =
            extrasRaw && typeof extrasRaw === "object" && !Array.isArray(extrasRaw) ? extrasRaw : {}

        const { rows } = await db.query(
            `
            insert into evaluation_extras (evaluation_id, data)
            values ($1, $2::jsonb)
            on conflict (evaluation_id)
            do update set data = excluded.data
            returning data
            `,
            [evaluationId, JSON.stringify(extras)]
        )

        return NextResponse.json({ ok: true, extras: (rows?.[0]?.data ?? extras) as any }, { status: 200 })
    } catch (err: any) {
        return errorJson(err, "Failed to save evaluation extras")
    }
}
