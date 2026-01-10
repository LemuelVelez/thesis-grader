/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"

type UseApiOptions = {
    onUnauthorized?: () => void
}

type RequestInitWithBody = RequestInit & {
    body?: any
}

function isJsonResponse(res: Response) {
    const ct = res.headers.get("content-type") || ""
    return ct.includes("application/json")
}

export function useApi(options: UseApiOptions = {}) {
    const onUnauthorizedRef = React.useRef(options.onUnauthorized)
    React.useEffect(() => {
        onUnauthorizedRef.current = options.onUnauthorized
    }, [options.onUnauthorized])

    const request = React.useCallback(async <T = any>(input: string, init: RequestInitWithBody = {}) => {
        const headers = new Headers(init.headers || {})
        headers.set("Accept", "application/json")

        let body = init.body
        if (body && typeof body === "object" && !(body instanceof FormData)) {
            headers.set("Content-Type", "application/json")
            body = JSON.stringify(body)
        } else if (typeof body === "string") {
            headers.set("Content-Type", "application/json")
        }

        const res = await fetch(input, {
            ...init,
            body,
            headers,
            credentials: "include",
            cache: "no-store",
        })

        // Parse payload safely
        let payload: any = null
        try {
            payload = isJsonResponse(res) ? await res.json() : await res.text()
        } catch {
            payload = null
        }

        if (res.status === 401) {
            onUnauthorizedRef.current?.()
            const msg = (payload && payload.message) || "Unauthorized"
            throw new Error(msg)
        }

        if (res.status === 403) {
            const msg = (payload && payload.message) || "Forbidden"
            throw new Error(msg)
        }

        if (!res.ok) {
            const msg =
                (payload && payload.message) ||
                (typeof payload === "string" && payload.trim()) ||
                `Request failed (${res.status})`
            throw new Error(msg)
        }

        return payload as T
    }, [])

    // ✅ return stable object identity
    return React.useMemo(() => ({ request }), [request])
}
