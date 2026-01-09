/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { GroupMembersController } from "@/controllers/group-members.controller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function coerceQuery(searchParams: URLSearchParams) {
    const obj: Record<string, unknown> = {}
    for (const [key, value] of searchParams.entries()) {
        if (value === "true" || value === "false") obj[key] = value === "true"
        else obj[key] = value
    }
    return obj
}

function errorJson(err: any, fallback: string) {
    const status = err?.status ?? err?.statusCode ?? 500
    return NextResponse.json({ error: err?.message ?? fallback }, { status })
}

async function tryCalls(fn: any, calls: Array<() => Promise<any>>) {
    let lastErr: any = null
    for (const c of calls) {
        try {
            return await c()
        } catch (e: any) {
            lastErr = e
        }
    }
    throw lastErr ?? new Error("Request failed")
}

export async function GET(req: NextRequest) {
    try {
        const q = coerceQuery(req.nextUrl.searchParams)
        const groupId = String(q.groupId ?? q.group_id ?? "")
        const count = q.count === true || String(q.mode ?? "") === "count"

        if (!groupId) {
            return NextResponse.json({ error: "groupId (or group_id) is required" }, { status: 400 })
        }

        if (count) {
            const data = await tryCalls(GroupMembersController.count as any, [
                () => (GroupMembersController.count as any)(groupId),
                () => (GroupMembersController.count as any)({ group_id: groupId }),
                () => (GroupMembersController.count as any)({ groupId }),
            ])
            return NextResponse.json(data)
        }

        const data = await tryCalls(GroupMembersController.list as any, [
            () => (GroupMembersController.list as any)(groupId),
            () => (GroupMembersController.list as any)({ group_id: groupId }),
            () => (GroupMembersController.list as any)({ groupId }),
            () => (GroupMembersController.list as any)(q),
        ])
        return NextResponse.json(data)
    } catch (err: any) {
        return errorJson(err, "Failed to list group members")
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null)
        if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

        const data = await (GroupMembersController.add as any)(body)
        return NextResponse.json(data, { status: 201 })
    } catch (err: any) {
        return errorJson(err, "Failed to add group member")
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null)

        // Support either body-driven remove or query-driven remove.
        if (body) {
            const data = await (GroupMembersController.remove as any)(body)
            return NextResponse.json(data ?? { ok: true })
        }

        const q = coerceQuery(req.nextUrl.searchParams)
        const data = await (GroupMembersController.remove as any)(q)
        return NextResponse.json(data ?? { ok: true })
    } catch (err: any) {
        return errorJson(err, "Failed to remove group member")
    }
}
