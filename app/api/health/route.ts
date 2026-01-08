import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const runtime = "nodejs"

export async function GET() {
    const { rows } = await db.query("select now() as now")
    return NextResponse.json({ ok: true, now: rows[0].now })
}
