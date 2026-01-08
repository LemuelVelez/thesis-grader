import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getUserFromSession, SESSION_COOKIE, type PublicUser } from "@/lib/auth"
import { requireRole } from "@/lib/rbac"

/**
 * For server components / server actions: redirects on failure.
 */
export async function requireAdminActor(): Promise<PublicUser> {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) redirect("/login")

    const actor = await getUserFromSession(token)
    if (!actor) redirect("/login")

    try {
        requireRole(actor, ["admin"])
    } catch {
        redirect("/dashboard")
    }

    return actor
}

/**
 * For API routes: returns JSON-friendly result (no redirects).
 */
export async function requireAdminFromCookies(): Promise<
    | { ok: true; actor: PublicUser }
    | { ok: false; status: number; message: string }
> {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return { ok: false, status: 401, message: "Unauthorized" }

    const actor = await getUserFromSession(token)
    if (!actor) return { ok: false, status: 401, message: "Unauthorized" }

    try {
        requireRole(actor, ["admin"])
    } catch {
        return { ok: false, status: 403, message: "Forbidden" }
    }

    return { ok: true, actor }
}
