import {
    studentProfileEndpoints,
    studentProfileFallbackEndpoints,
    type FetchResult,
} from "./thesis-group-details-types"
import {
    extractErrorMessage,
    extractRoleLowerFromPayload,
    toNullableTrimmed,
} from "./thesis-group-details-helpers"

export function parseResponseBodySafe(res: Response): Promise<unknown | null> {
    return res.text().then((text) => {
        if (!text) return null
        try {
            return JSON.parse(text) as unknown
        } catch {
            return { message: text }
        }
    })
}

export async function fetchFirstAvailableJson(
    endpoints: readonly string[],
    signal: AbortSignal
): Promise<unknown | null> {
    let lastError: Error | null = null

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, {
                method: "GET",
                credentials: "include",
                cache: "no-store",
                headers: {
                    Accept: "application/json",
                },
                signal,
            })

            if (res.status === 404 || res.status === 405) {
                continue
            }

            const payload = await parseResponseBodySafe(res)

            if (!res.ok) {
                const message = extractErrorMessage(
                    payload,
                    `${endpoint} returned ${res.status}`,
                    res.status
                )
                lastError = new Error(message)
                continue
            }

            return payload
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw error
            }
            lastError = error instanceof Error ? error : new Error("Request failed")
        }
    }

    if (lastError) throw lastError
    return null
}

export async function fetchAllSuccessfulJson(
    endpoints: readonly string[],
    signal: AbortSignal
): Promise<FetchResult[]> {
    const results: FetchResult[] = []
    let lastError: Error | null = null

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, {
                method: "GET",
                credentials: "include",
                cache: "no-store",
                headers: {
                    Accept: "application/json",
                },
                signal,
            })

            if (res.status === 404 || res.status === 405) continue

            const payload = await parseResponseBodySafe(res)

            if (!res.ok) {
                lastError = new Error(
                    extractErrorMessage(payload, `${endpoint} returned ${res.status}`, res.status)
                )
                continue
            }

            results.push({
                endpoint,
                payload,
                status: res.status,
            })
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") throw error
            lastError = error instanceof Error ? error : new Error("Request failed")
        }
    }

    if (results.length === 0 && lastError) throw lastError
    return results
}

/**
 * IMPORTANT for UX:
 * - We only fallback on route-shape incompatibility (404/405).
 * - For validation/auth/server errors on a compatible route, stop immediately
 *   so we don't spam multiple POST/PATCH/DELETE attempts.
 */
export async function requestFirstAvailable(
    endpoints: readonly string[],
    init: RequestInit
): Promise<FetchResult> {
    let lastError: Error | null = null

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, {
                ...init,
                credentials: "include",
                cache: "no-store",
                headers: {
                    Accept: "application/json",
                    ...(init.headers ?? {}),
                },
            })

            if (res.status === 404 || res.status === 405) continue

            const payload = await parseResponseBodySafe(res)

            if (!res.ok) {
                throw new Error(
                    extractErrorMessage(payload, `${endpoint} returned ${res.status}`, res.status)
                )
            }

            return {
                endpoint,
                payload,
                status: res.status,
            }
        } catch (error) {
            lastError = error instanceof Error ? error : new Error("Request failed")
            break
        }
    }

    if (lastError) throw lastError
    throw new Error("No compatible thesis group member endpoint found for this action.")
}

export async function upsertStudentProfile(
    userId: string,
    input: { program: string; section: string }
): Promise<FetchResult> {
    const payload = {
        program: toNullableTrimmed(input.program),
        section: toNullableTrimmed(input.section),
    }

    const createEndpoints = studentProfileEndpoints(userId)
    const fallbackEndpoints = studentProfileFallbackEndpoints(userId)

    try {
        return await requestFirstAvailable(createEndpoints, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        })
    } catch (firstError) {
        const message = firstError instanceof Error ? firstError.message.toLowerCase() : ""
        const mayNeedPatch =
            message.includes("already exists") ||
            message.includes("duplicate") ||
            message.includes("unique") ||
            message.includes("method not allowed")

        if (mayNeedPatch) {
            try {
                return await requestFirstAvailable(createEndpoints, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                })
            } catch {
                // continue to fallback strategy
            }
        }
    }

    return await requestFirstAvailable(fallbackEndpoints, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    })
}

/**
 * Defensive guard:
 * - Ensure selected user has role "student" before member save.
 */
export async function ensureUserRoleIsStudent(candidateUserId: string): Promise<{
    existed: boolean
    updated: boolean
    roleBefore: string | null
}> {
    const normalizedId = candidateUserId.trim()
    if (!normalizedId) {
        return { existed: false, updated: false, roleBefore: null }
    }

    const endpoint = `/api/users/${encodeURIComponent(normalizedId)}`
    const getRes = await fetch(endpoint, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
    })

    const getPayload = await parseResponseBodySafe(getRes)

    if (getRes.status === 404) {
        return { existed: false, updated: false, roleBefore: null }
    }

    if (!getRes.ok) {
        throw new Error(extractErrorMessage(getPayload, "Unable to verify student role.", getRes.status))
    }

    const roleBefore = extractRoleLowerFromPayload(getPayload)

    if (roleBefore === "student") {
        return { existed: true, updated: false, roleBefore }
    }

    const patchRes = await fetch(endpoint, {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "student" }),
    })

    const patchPayload = await parseResponseBodySafe(patchRes)

    if (!patchRes.ok) {
        throw new Error(
            extractErrorMessage(
                patchPayload,
                'Failed to automatically set role to "student" before member save.',
                patchRes.status
            )
        )
    }

    return { existed: true, updated: true, roleBefore }
}
