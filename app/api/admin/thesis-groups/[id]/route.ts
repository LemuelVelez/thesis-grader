/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"

import { env } from "@/lib/env"
import { requireAdminFromCookies } from "@/lib/admin-auth"
import { deleteThesisGroup } from "@/lib/thesis-admin"

export const runtime = "nodejs"

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
    try {
        if (!env.DATABASE_URL) {
            return NextResponse.json({ ok: false, message: "Database is not configured (DATABASE_URL missing)." }, { status: 500 })
        }

        const auth = await requireAdminFromCookies()
        if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status })

        const id = String(ctx.params?.id ?? "").trim()
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
