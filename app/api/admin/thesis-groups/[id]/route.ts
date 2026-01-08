/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"

import { env } from "@/lib/env"
import { requireAdminFromCookies } from "@/lib/admin-auth"
import { deleteThesisGroup } from "@/lib/thesis-admin"

export const runtime = "nodejs"

type Params = { id: string }

async function readParams(ctx: { params: Params | Promise<Params> }) {
    return await Promise.resolve(ctx.params as any)
}

export async function DELETE(_req: Request, ctx: { params: Params | Promise<Params> }) {
    try {
        if (!env.DATABASE_URL) {
            return NextResponse.json(
                { ok: false, message: "Database is not configured (DATABASE_URL missing)." },
                { status: 500 }
            )
        }

        const auth = await requireAdminFromCookies()
        if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status })

        const p = await readParams(ctx)
        const id = String(p?.id ?? "").trim()
        if (!id) return NextResponse.json({ ok: false, message: "Missing group id." }, { status: 400 })

        const res = await deleteThesisGroup(id, auth.actor)

        if (!res.ok) {
            const status = res.message === "Thesis group not found." ? 404 : 400
            return NextResponse.json({ ok: false, message: res.message }, { status })
        }

        return NextResponse.json({ ok: true })
    } catch (err: any) {
        console.error("DELETE /api/admin/thesis-groups/[id] failed:", err)
        return NextResponse.json({ ok: false, message: "Internal Server Error" }, { status: 500 })
    }
}
