"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent } from "@/components/ui/card"

type MeResponse =
    | {
        ok: true
        user: { id: string; name: string; email: string; role: string; avatar_key: string | null }
    }
    | { ok: false }

type LoginResponse =
    | {
        ok: true
        user: { id: string; name: string; email: string; role: string; avatar_key: string | null }
    }
    | { ok: false; message?: string }

function roleBasePath(role: string) {
    const r = String(role ?? "").toLowerCase()
    if (r === "student") return "/dashboard/student"
    if (r === "staff") return "/dashboard/staff"
    if (r === "admin") return "/dashboard/admin"
    return "/dashboard"
}

export default function LoginPage() {
    const router = useRouter()

    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)

    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const canSubmit = useMemo(() => {
        return email.trim().length > 0 && password.length > 0 && !submitting
    }, [email, password, submitting])

    // If already logged in, redirect to role dashboard.
    useEffect(() => {
        let mounted = true
            ; (async () => {
                try {
                    const res = await fetch("/api/auth/me", { method: "GET", cache: "no-store" })
                    const data = (await res.json()) as MeResponse
                    if (!mounted) return
                    if (data.ok) {
                        toast.info("You are already signed in.")
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

        setError(null)
        setSubmitting(true)

        const tId = toast.loading("Signing in...")

        try {
            // Login on POST /api/auth/me (sets cookie)
            const res = await fetch("/api/auth/me", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            })

            const data = (await res.json()) as LoginResponse

            if (!res.ok || !data.ok) {
                const msg = data && "message" in data && data.message ? data.message : "Login failed"
                setError(msg)
                toast.error(msg, { id: tId })
                return
            }

            toast.success(`Welcome, ${data.user.name}!`, { id: tId })

            router.replace(roleBasePath(data.user.role))
            router.refresh()
        } catch {
            const msg = "Network error. Please try again."
            setError(msg)
            toast.error(msg, { id: tId })
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
                        <div className="text-xs text-muted-foreground">Sign in to continue</div>
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
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="password" className="text-sm font-medium">
                                    Password
                                </label>

                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="••••••••"
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        disabled={submitting}
                                        className="pr-10"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-1 top-1/2 -translate-y-1/2"
                                        onClick={() => setShowPassword((v) => !v)}
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                        disabled={submitting}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>

                            {error ? (
                                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                    {error}
                                </div>
                            ) : null}

                            <Button type="submit" className="w-full" disabled={!canSubmit}>
                                {submitting ? "Signing in..." : "Sign in"}
                            </Button>

                            <div className="flex items-center justify-between text-sm">
                                <Link href="/" className="text-muted-foreground hover:underline">
                                    Back to home
                                </Link>

                                <Link href="/auth/password/forgot" className="text-muted-foreground hover:underline">
                                    Forgot password?
                                </Link>
                            </div>

                            <Separator />

                            <p className="text-xs text-muted-foreground">
                                Students can view schedule & evaluate only. Staff can schedule & score. Admin manages users, rubrics,
                                reports & audit logs.
                            </p>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
