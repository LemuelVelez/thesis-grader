import type { Role, PublicUser } from "./auth"

type HttpError = Error & { status: number }

export function requireRole(user: PublicUser, allowed: Role[]) {
    if (!allowed.includes(user.role)) {
        const err = new Error("Forbidden") as HttpError
        err.status = 403
        throw err
    }
}
