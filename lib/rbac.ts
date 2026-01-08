/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Role, PublicUser } from "@/lib/auth"

export function requireRole(user: PublicUser, allowed: Role[]) {
    if (!allowed.includes(user.role)) {
        const err = new Error("Forbidden")
            ; (err as any).status = 403
        throw err
    }
}
