/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { createApiClient, ApiError, type ApiClientConfig } from "@/lib/apiClient"

type ToastApiErrorOptions = {
    title?: string
    defaultMessage?: string
    /**
     * Show validation issues (zod / issues array) in the toast description.
     */
    showIssues?: boolean
    /**
     * Automatically redirect to /login on 401.
     */
    redirectToLoginOn401?: boolean
    /**
     * Limit number of issues shown in toast.
     */
    maxIssues?: number
}

type RunOptions<T> = {
    /**
     * Toast success message after resolving.
     * If you pass a function, it receives the resolved value.
     */
    success?: string | ((data: T) => string)
    /**
     * Override error toast title/message.
     */
    error?: ToastApiErrorOptions
    /**
     * If true, do not show success toast.
     */
    silentSuccess?: boolean
    /**
     * If true, do not show error toast (still returns null on error).
     */
    silentError?: boolean
}

function formatIssues(
    issues: Array<{ path?: string; message?: string;[k: string]: unknown }>,
    maxIssues: number
) {
    const sliced = issues.slice(0, Math.max(1, maxIssues))
    const lines = sliced.map((i) => {
        const p = String(i?.path ?? "").trim()
        const m = String(i?.message ?? "").trim()
        if (p && m) return `• ${p}: ${m}`
        if (m) return `• ${m}`
        return `• Validation issue`
    })

    const remaining = issues.length - sliced.length
    if (remaining > 0) lines.push(`• +${remaining} more`)

    return lines.join("\n")
}

export function useApi(config?: Pick<ApiClientConfig, "baseUrl" | "defaultHeaders">) {
    const router = useRouter()

    const api = React.useMemo(() => {
        return createApiClient({
            baseUrl: config?.baseUrl ?? "",
            defaultHeaders: config?.defaultHeaders ?? {},
        })
    }, [config?.baseUrl, config?.defaultHeaders])

    const toastApiError = React.useCallback(
        (err: unknown, opts?: ToastApiErrorOptions) => {
            const options: Required<ToastApiErrorOptions> = {
                title: opts?.title ?? "Something went wrong",
                defaultMessage: opts?.defaultMessage ?? "Please try again.",
                showIssues: opts?.showIssues ?? true,
                redirectToLoginOn401: opts?.redirectToLoginOn401 ?? true,
                maxIssues: opts?.maxIssues ?? 3,
            }

            // Our typed API error
            if (err instanceof ApiError) {
                const status = err.status

                if (status === 401) {
                    toast.error("Session expired", { description: err.message || "Please log in again." })
                    if (options.redirectToLoginOn401) router.push("/login")
                    return
                }

                if (status === 403) {
                    toast.error("Forbidden", { description: err.message || "You don't have permission to do this." })
                    return
                }

                if (status === 404) {
                    toast.error("Not found", { description: err.message || "The requested item doesn't exist." })
                    return
                }

                if (status === 409) {
                    toast.error("Conflict", { description: err.message || "This record already exists." })
                    return
                }

                if (options.showIssues && err.issues?.length) {
                    toast.error(err.message || options.title, {
                        description: formatIssues(err.issues as any[], options.maxIssues),
                    })
                    return
                }

                toast.error(err.message || options.title, { description: options.defaultMessage })
                return
            }

            // Generic error shapes
            const maybeMsg =
                (err as any)?.message && typeof (err as any).message === "string" ? (err as any).message : null

            toast.error(options.title, { description: maybeMsg ?? options.defaultMessage })
        },
        [router]
    )

    const run = React.useCallback(
        async <T,>(promise: Promise<T>, opts?: RunOptions<T>): Promise<T | null> => {
            try {
                const data = await promise
                if (!opts?.silentSuccess && opts?.success) {
                    const msg = typeof opts.success === "function" ? opts.success(data) : opts.success
                    if (msg) toast.success(msg)
                }
                return data
            } catch (err: any) {
                if (!opts?.silentError) toastApiError(err, opts?.error)
                return null
            }
        },
        [toastApiError]
    )

    return {
        api,
        toastApiError,
        run,
    }
}
