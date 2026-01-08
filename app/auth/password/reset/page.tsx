/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent } from "@/components/ui/card"

type ResetResponse = { ok: true } | { ok: false; message?: string }

export default function ResetPasswordPage() {
    const router = useRouter()
    const params = useSearchParams()

    const token = String(params.get("token") ?? "").trim()

    const [password, setPassword] = useState("")
    const [confirm, setConfirm] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const passwordTooShort = password.length > 0 && password.length < 8
    const passwordsMismatch = confirm.length > 0 && password !== confirm

    const canSubmit = useMemo(() => {
        return !!token && password.length >= 8 && password === confirm && !submitting
    }, [token, password, confirm, submitting])

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!canSubmit) return

        setSubmitting(true)
        const tId = toast.loading("Updating password...")

        try {
            const res = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password }),
            })

            const data = (await res.json().catch(() => ({}))) as ResetResponse

            if (!res.ok || !data || (data as any).ok === false) {
                const msg = (data as any)?.message ?? "Unable to reset password."
                toast.error(msg, { id: tId })
                return
            }

            toast.success("Password updated. Please sign in.", { id: tId })
            router.replace("/auth/login")
            router.refresh()
        } catch {
            toast.error("Network error. Please try again.", { id: tId })
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="min-h-svh w-full">
            <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-10 sm:px-6">
                <div className="mb-6 flex items-center justify-center gap-3">
                    <Image src="/logo.svg" alt="THESISGRADER logo" width={44} height={44} priority />
                    <div className="leading-tight">
                        <div className="text-lg font-semibold tracking-tight">THESISGRADER</div>
                        <div className="text-xs text-muted-foreground">Create a new password</div>
                    </div>
                </div>

                <Card>
                    <CardContent className="p-6">
                        {!token ? (
                            <div className="space-y-4">
                                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                    Missing reset token. Please request a new reset link.
                                </div>

                                <Button asChild className="w-full">
                                    <Link href="/auth/password/forgot">Request reset link</Link>
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
                            </div>
                        ) : (
                            <form onSubmit={onSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <label htmlFor="password" className="text-sm font-medium">
                                        New password
                                    </label>

                                    <div className="relative">
                                        <Input
                                            id="password"
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Minimum 8 characters"
                                            autoComplete="new-password"
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

                                    {passwordTooShort ? (
                                        <p className="text-xs text-destructive">Password must be at least 8 characters.</p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">Use at least 8 characters.</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="confirm" className="text-sm font-medium">
                                        Confirm password
                                    </label>

                                    <div className="relative">
                                        <Input
                                            id="confirm"
                                            type={showConfirm ? "text" : "password"}
                                            placeholder="Re-enter password"
                                            autoComplete="new-password"
                                            value={confirm}
                                            onChange={(e) => setConfirm(e.target.value)}
                                            disabled={submitting}
                                            className="pr-10"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="absolute right-1 top-1/2 -translate-y-1/2"
                                            onClick={() => setShowConfirm((v) => !v)}
                                            aria-label={showConfirm ? "Hide password" : "Show password"}
                                            disabled={submitting}
                                        >
                                            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </Button>
                                    </div>

                                    {passwordsMismatch ? (
                                        <p className="text-xs text-destructive">Passwords do not match.</p>
                                    ) : null}
                                </div>

                                <Button type="submit" className="w-full" disabled={!canSubmit}>
                                    {submitting ? "Saving..." : "Reset password"}
                                </Button>

                                <Separator />

                                <div className="flex items-center justify-between text-sm">
                                    <Link href="/auth/login" className="text-muted-foreground hover:underline">
                                        Back to login
                                    </Link>
                                    <Link href="/auth/password/forgot" className="text-muted-foreground hover:underline">
                                        Request new link
                                    </Link>
                                </div>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
