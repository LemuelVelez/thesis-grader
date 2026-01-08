/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useEffect, useState } from "react"

type MeResponse =
    | { ok: true; user: { id: string; name: string; email: string; role: string; avatar_key: string | null } }
    | { ok: false }

export function useAuth() {
    const [loading, setLoading] = useState(true)
    const [user, setUser] = useState<MeResponse extends { ok: true } ? any : any>(null)

    useEffect(() => {
        let mounted = true
            ; (async () => {
                try {
                    const res = await fetch("/api/auth/me", { cache: "no-store" })
                    const data = (await res.json()) as MeResponse
                    if (!mounted) return
                    setUser(data.ok ? data.user : null)
                } finally {
                    if (mounted) setLoading(false)
                }
            })()
        return () => {
            mounted = false
        }
    }, [])

    return { loading, user }
}
