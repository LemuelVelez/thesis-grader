/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server"
import { getUserFromSession, SESSION_COOKIE, type PublicUser } from "@/lib/auth"

export type Role = "student" | "staff" | "admin"

export async function getActor(req: NextRequest): Promise<PublicUser | null> {
    const token = req.cookies.get(SESSION_COOKIE)?.value
    if (!token) return null

    const actor = await getUserFromSession(token)
    return actor ?? null
}

export async function requireActor(req: NextRequest): Promise<PublicUser> {
    const actor = await getActor(req)
    if (!actor) {
        throw Object.assign(new Error("Unauthorized"), { status: 401 })
    }
    return actor
}

export function assertRoles(actor: PublicUser, roles: Role[]) {
    const role = String((actor as any)?.role ?? "").toLowerCase()
    if (!roles.includes(role as Role)) {
        throw Object.assign(new Error("Forbidden"), { status: 403 })
    }
}

export function assertSelfOrRoles(actor: PublicUser, userId: string, roles: Role[]) {
    const actorId = String((actor as any)?.id ?? "")
    if (actorId && actorId === userId) return
    assertRoles(actor, roles)
}
