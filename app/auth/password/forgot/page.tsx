/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent } from "@/components/ui/card"

type AuthUser = {
    id: string
    name: string
    email: string
    role: string
    avatar_key: string | null
}

type MeResponse = { user: AuthUser } | { error?: string }
type ForgotResponse = { message?: string } | { error?: string }

function roleBasePath(role: string | null | undefined) {
    const r = String(role ?? "").toLowerCase()
    if (r === "student") return "/dashboard/student"
    if (r === "staff") return "/dashboard/staff"
    if (r === "admin") return "/dashboard/admin"
    if (r === "panelist") return "/dashboard/panelist"
    return "/dashboard"
}

export default function ForgotPasswordPage() {
    const router = useRouter()
    const [email, setEmail] = useState("")
    const [submitting, setSubmitting] = useState(false)

    const canSubmit = useMemo(() => email.trim().length > 0 && !submitting, [email, submitting])

    // Already authenticated users should not stay on auth utility pages.
    useEffect(() => {
        let mounted = true

            ; (async () => {
                try {
                    const res = await fetch("/api/auth/me", { method: "GET", cache: "no-store" })
                    const data = (await res.json().catch(() => ({}))) as MeResponse
                    if (!mounted) return

                    if (res.ok && "user" in data && data.user) {
                        router.replace(roleBasePath(data.user.role))
                    }
                } catch {
                    // ignore
                }
            })()

        return () => {
            mounted = false
        }
    }, [router])

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!canSubmit) return

        setSubmitting(true)
        const tId = toast.loading("Sending reset link...")

        try {
            const res = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            })

            const data = (await res.json().catch(() => ({}))) as ForgotResponse

            if (!res.ok || (typeof data === "object" && data && "error" in data && data.error)) {
                const msg = (data as any)?.error ?? (data as any)?.message ?? "Unable to send reset link."
                toast.error(msg, { id: tId })
                return
            }

            toast.success((data as any)?.message ?? "If your email exists, a reset link will be sent.", { id: tId })
            setEmail("")
        } catch {
            toast.error("Network error. Please try again.", { id: tId })
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="min-h-svh w-full">
            <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-10 sm:px-6">
                <Link
                    href="/"
                    aria-label="Go to home"
                    className="mb-6 flex items-center justify-center gap-3 rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                    <Image src="/logo.svg" alt="THESISGRADER logo" width={44} height={44} priority />
                    <div className="leading-tight">
                        <div className="text-lg font-semibold tracking-tight">THESISGRADER</div>
                        <div className="text-xs text-muted-foreground">Reset your password</div>
                    </div>
                </Link>

                <Card>
                    <CardContent className="p-6">
                        <form onSubmit={onSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="email" className="text-sm font-medium">
                                    Email
                                </label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="you@example.com"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={submitting}
                                />
                                <p className="text-xs text-muted-foreground">
                                    We’ll email a reset link if an account exists for this email.
                                </p>
                            </div>

                            <Button type="submit" className="w-full" disabled={!canSubmit}>
                                {submitting ? "Sending..." : "Send reset link"}
                            </Button>

                            <Separator />

                            <div className="flex items-center justify-between text-sm">
                                <Link href="/auth/login" className="text-muted-foreground hover:underline">
                                    Back to login
                                </Link>
                                <Link href="/" className="text-muted-foreground hover:underline">
                                    Home
                                </Link>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
