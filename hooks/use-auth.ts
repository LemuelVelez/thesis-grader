"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type AuthUser = {
    id: string
    name: string
    email: string
    role: string
    avatar_key: string | null
}

type MeResponse =
    | { ok: true; user: AuthUser }
    | { ok: false; error?: string; message?: string }
    | { user: AuthUser }

type AvatarResponse =
    | { ok: true; avatar_key: string | null; url: string | null; expires_in_seconds?: number }
    | { ok: false; message?: string }

type AvatarCache = {
    avatar_key: string
    url: string
    expiresAt: number // epoch ms
}

function avatarStorageKey(userId: string) {
    return `tg_avatar_url:${userId}`
}

function readAvatarCache(userId: string): AvatarCache | null {
    try {
        const raw = localStorage.getItem(avatarStorageKey(userId))
        if (!raw) return null
        const parsed = JSON.parse(raw) as AvatarCache
        if (!parsed?.avatar_key || !parsed?.url || !parsed?.expiresAt) return null
        return parsed
    } catch {
        return null
    }
}

function writeAvatarCache(userId: string, cache: AvatarCache) {
    try {
        localStorage.setItem(avatarStorageKey(userId), JSON.stringify(cache))
    } catch {
        // ignore
    }
}

function clearAvatarCache(userId: string) {
    try {
        localStorage.removeItem(avatarStorageKey(userId))
    } catch {
        // ignore
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function isAuthUser(value: unknown): value is AuthUser {
    if (!isObject(value)) return false
    return (
        typeof value.id === "string" &&
        typeof value.name === "string" &&
        typeof value.email === "string" &&
        typeof value.role === "string" &&
        (typeof value.avatar_key === "string" || value.avatar_key === null)
    )
}

function resolveUserFromMePayload(payload: unknown, responseOk: boolean): AuthUser | null {
    if (!isObject(payload)) return null

    // Preferred API shape: { ok: true, user: {...} }
    if (typeof payload.ok === "boolean") {
        if (!payload.ok) return null
        const user = payload.user
        return isAuthUser(user) ? user : null
    }

    // Backward-compatible API shape: { user: {...} } with 2xx response
    if (responseOk && isAuthUser(payload.user)) {
        return payload.user
    }

    return null
}

export function useAuth() {
    const [loading, setLoading] = useState(true)
    const [user, setUser] = useState<AuthUser | null>(null)

    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
    const [avatarExpiresAt, setAvatarExpiresAt] = useState<number | null>(null)

    const avatarTimerRef = useRef<number | null>(null)

    const clearAvatarTimer = useCallback(() => {
        if (avatarTimerRef.current) {
            window.clearTimeout(avatarTimerRef.current)
            avatarTimerRef.current = null
        }
    }, [])

    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/auth/me", {
                method: "GET",
                cache: "no-store",
                credentials: "include",
                headers: {
                    accept: "application/json",
                },
            })

            const data = (await res.json().catch(() => null)) as MeResponse | null
            const resolved = resolveUserFromMePayload(data, res.ok)
            setUser(resolved)
        } catch {
            setUser(null)
        }
    }, [])

    const refreshAvatarUrl = useCallback(async () => {
        const userId = user?.id
        if (!userId) {
            setAvatarUrl(null)
            setAvatarExpiresAt(null)
            return
        }

        try {
            const res = await fetch("/api/users/me/avatar", {
                method: "GET",
                cache: "no-store",
                credentials: "include",
                headers: {
                    accept: "application/json",
                },
            })

            const data = (await res.json().catch(() => ({}))) as AvatarResponse

            if (!res.ok || !data?.ok) {
                setAvatarUrl(null)
                setAvatarExpiresAt(null)
                return
            }

            const url = data.url ?? null
            const key = data.avatar_key ?? null

            if (!key || !url) {
                setAvatarUrl(null)
                setAvatarExpiresAt(null)
                clearAvatarCache(userId)
                clearAvatarTimer()
                return
            }

            const expiresInSec = Number(data.expires_in_seconds ?? 0)
            const exp = expiresInSec > 0 ? Date.now() + expiresInSec * 1000 : null

            setAvatarUrl(url)
            setAvatarExpiresAt(exp)

            if (exp) {
                writeAvatarCache(userId, { avatar_key: key, url, expiresAt: exp })
            }
        } catch {
            setAvatarUrl(null)
            setAvatarExpiresAt(null)
        }
    }, [user?.id, clearAvatarTimer])

    // initial load
    useEffect(() => {
        let mounted = true
            ; (async () => {
                try {
                    if (!mounted) return
                    await refresh()
                } finally {
                    if (mounted) setLoading(false)
                }
            })()
        return () => {
            mounted = false
        }
    }, [refresh])

    // schedule avatar refresh ~30s before expiry
    useEffect(() => {
        const userId = user?.id
        if (!userId || !avatarExpiresAt) return

        clearAvatarTimer()

        const now = Date.now()
        const refreshInMs = avatarExpiresAt - now - 30_000

        if (refreshInMs <= 0) {
            refreshAvatarUrl()
            return
        }

        avatarTimerRef.current = window.setTimeout(() => {
            refreshAvatarUrl()
        }, refreshInMs)

        return () => clearAvatarTimer()
    }, [avatarExpiresAt, user?.id, refreshAvatarUrl, clearAvatarTimer])

    // when user changes, hydrate avatar from localStorage or fetch
    useEffect(() => {
        clearAvatarTimer()

        const userId = user?.id
        if (!userId) {
            setAvatarUrl(null)
            setAvatarExpiresAt(null)
            return
        }

        if (!user.avatar_key) {
            setAvatarUrl(null)
            setAvatarExpiresAt(null)
            clearAvatarCache(userId)
            return
        }

        const cached = readAvatarCache(userId)
        const now = Date.now()

        if (cached && cached.avatar_key === user.avatar_key && cached.expiresAt > now) {
            setAvatarUrl(cached.url)
            setAvatarExpiresAt(cached.expiresAt)

            if (cached.expiresAt - now < 30_000) refreshAvatarUrl()
            return
        }

        refreshAvatarUrl()
    }, [user?.id, user?.avatar_key, refreshAvatarUrl, clearAvatarTimer])

    // cleanup
    useEffect(() => {
        return () => clearAvatarTimer()
    }, [clearAvatarTimer])

    return {
        loading,
        // ✅ alias so older pages using `isLoading` won't crash TS
        isLoading: loading,

        user,
        refresh,

        avatarUrl,
        avatarExpiresAt,
        refreshAvatarUrl,
    }
}
