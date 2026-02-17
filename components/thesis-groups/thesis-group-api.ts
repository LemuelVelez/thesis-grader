import {
    LIST_ENDPOINTS,
    buildCompatibilityPayloadVariants,
    buildGroupMembersEndpointCandidates,
    extractErrorMessage,
    extractMembersCountFromPayload,
    parseResponseBodySafe,
    shouldAttemptPayloadFallback,
    type FetchResult,
    type MutationWithFallbackResult,
} from "./thesis-group-utils"

export async function fetchMembersCountForGroup(
    groupId: string,
    preferredBaseEndpoint: string | null,
    signal: AbortSignal
): Promise<number | null> {
    const endpoints = buildGroupMembersEndpointCandidates(groupId, preferredBaseEndpoint)

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, {
                method: "GET",
                credentials: "include",
                cache: "no-store",
                headers: { Accept: "application/json" },
                signal,
            })

            if (res.status === 404 || res.status === 405) continue

            const payload = await parseResponseBodySafe(res)
            if (!res.ok) continue

            const count = extractMembersCountFromPayload(payload)
            if (count !== null) return count
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") throw error
        }
    }

    return null
}

export async function fetchFirstAvailableJson(
    endpoints: readonly string[],
    signal: AbortSignal
): Promise<FetchResult | null> {
    let lastError: Error | null = null

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, {
                method: "GET",
                credentials: "include",
                cache: "no-store",
                headers: { Accept: "application/json" },
                signal,
            })

            if (res.status === 404 || res.status === 405) {
                continue
            }

            const payload = await parseResponseBodySafe(res)

            if (!res.ok) {
                const message = extractErrorMessage(payload, `${endpoint} returned ${res.status}`)
                lastError = new Error(message)
                continue
            }

            return {
                endpoint,
                payload,
                status: res.status,
            }
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
                headers: { Accept: "application/json" },
                signal,
            })

            if (res.status === 404 || res.status === 405) continue

            const payload = await parseResponseBodySafe(res)

            if (!res.ok) {
                lastError = new Error(extractErrorMessage(payload, `${endpoint} returned ${res.status}`))
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
 *   so we don't spam multiple POST/PATCH attempts.
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
                throw new Error(extractErrorMessage(payload, `${endpoint} returned ${res.status}`))
            }

            return { endpoint, payload, status: res.status }
        } catch (error) {
            lastError = error instanceof Error ? error : new Error("Request failed")
            break
        }
    }

    if (lastError) throw lastError
    throw new Error("No compatible thesis-group API endpoint found for this action.")
}

export async function requestFirstAvailableWithPayloadFallback(
    endpoints: readonly string[],
    method: "POST" | "PATCH" | "PUT",
    payload: Record<string, unknown>
): Promise<MutationWithFallbackResult> {
    const variants = buildCompatibilityPayloadVariants(payload)
    let lastError: Error | null = null

    for (let index = 0; index < variants.length; index += 1) {
        const candidate = variants[index] ?? {}
        try {
            const result = await requestFirstAvailable(endpoints, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(candidate),
            })

            return {
                result,
                payloadUsed: candidate,
                usedFallback: index > 0,
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error("Request failed")
            lastError = err

            const hasAnotherVariant = index < variants.length - 1
            if (!hasAnotherVariant) break

            if (!shouldAttemptPayloadFallback(err.message)) break
        }
    }

    if (lastError) throw lastError
    throw new Error("Failed to submit thesis group request.")
}
