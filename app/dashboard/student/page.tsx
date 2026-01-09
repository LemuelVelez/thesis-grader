/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { GraduationCap, LogOut } from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

function roleBasePath(role: string) {
    const r = String(role ?? "").toLowerCase()
    if (r === "student") return "/dashboard/student"
    if (r === "staff") return "/dashboard/staff"
    if (r === "admin") return "/dashboard/admin"
    return "/dashboard"
}

async function fallbackLogoutRequest() {
    // Try common logout endpoints (adjust later if your project uses a specific one)
    const attempts: Array<{ url: string; method: "POST" | "GET" }> = [
        { url: "/api/auth/logout", method: "POST" },
        { url: "/api/logout", method: "POST" },
        { url: "/api/auth/signout", method: "POST" },
        { url: "/api/auth/logout", method: "GET" },
        { url: "/api/logout", method: "GET" },
    ]

    let lastStatus = 0

    for (const a of attempts) {
        try {
            const res = await fetch(a.url, { method: a.method, cache: "no-store" })
            lastStatus = res.status
            if (res.ok) return
            // if it's a "not found" / "method not allowed", continue trying
            if (res.status === 404 || res.status === 405) continue
        } catch {
            // ignore and keep trying next endpoint
        }
    }

    throw new Error(
        lastStatus
            ? `Logout endpoint failed (last status: ${lastStatus}).`
            : "Logout endpoint not found. Update the logout URL in student page."
    )
}

export default function StudentDashboardPage() {
    const router = useRouter()

    // useAuth may or may not expose logout(), so we access it safely
    const auth = useAuth() as any
    const loading = Boolean(auth?.loading)
    const user = auth?.user
    const logoutFn = auth?.logout

    const isStudent = String(user?.role ?? "").toLowerCase() === "student"
    const [busy, setBusy] = React.useState(false)

    async function onLogout() {
        if (busy) return
        setBusy(true)
        const tId = toast.loading("Signing out...")

        try {
            if (typeof logoutFn === "function") {
                await logoutFn()
            } else {
                await fallbackLogoutRequest()
            }

            toast.success("Signed out.", { id: tId })

            // redirect to your sign-in page (change if needed)
            router.push("/sign-in")
            router.refresh()
        } catch (e: any) {
            const msg = String(e?.message ?? "Failed to sign out.")
            toast.error(msg, { id: tId })
        } finally {
            setBusy(false)
        }
    }

    if (loading) {
        return (
            <DashboardLayout title="Student Dashboard">
                <div className="space-y-4">
                    <Skeleton className="h-10 w-64" />
                    <Skeleton className="h-32 w-full" />
                </div>
            </DashboardLayout>
        )
    }

    if (!user) {
        return (
            <DashboardLayout title="Student Dashboard">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Not signed in</CardTitle>
                        <CardDescription>Please sign in to continue.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-2">
                        <Button asChild>
                            <Link href="/sign-in">Go to Sign in</Link>
                        </Button>
                    </CardContent>
                </Card>
            </DashboardLayout>
        )
    }

    if (!isStudent) {
        const dest = roleBasePath(user.role)
        return (
            <DashboardLayout title="Student Dashboard">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Wrong dashboard</CardTitle>
                        <CardDescription>
                            Your account role is <span className="font-medium">{String(user.role ?? "unknown")}</span>. Use your
                            correct dashboard.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-2">
                        <Button asChild variant="secondary">
                            <Link href={dest}>Go to {dest}</Link>
                        </Button>
                    </CardContent>
                </Card>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout title="Student Dashboard">
            <div className="space-y-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <GraduationCap className="h-4 w-4" />
                            <h1 className="text-xl font-semibold tracking-tight">Student</h1>
                            <Badge variant="secondary">Dashboard</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Minimal page for now — you can add cards, links, and features later.
                        </p>
                    </div>

                    <Button onClick={onLogout} disabled={busy}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Logout
                    </Button>
                </div>

                <Separator />

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Welcome, {user?.name ?? "Student"}</CardTitle>
                        <CardDescription>
                            This is a simple placeholder UI. Edit this page to add your student features (thesis status, schedules,
                            submissions, etc.).
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        <div className="space-y-2">
                            <div>
                                <span className="text-foreground font-medium">Email:</span> {user?.email ?? "—"}
                            </div>
                            <div>
                                <span className="text-foreground font-medium">Role:</span> {String(user?.role ?? "student")}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
