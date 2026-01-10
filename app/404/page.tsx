"use client"

import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/use-auth"

function roleBasePath(role: string | null | undefined) {
    const r = String(role ?? "").toLowerCase()
    if (r === "student") return "/dashboard/student"
    if (r === "staff") return "/dashboard/staff"
    if (r === "admin") return "/dashboard/admin"
    return "/dashboard"
}

export default function NotFoundPage() {
    const { user } = useAuth()

    const actionHref = user ? roleBasePath(user.role) : "/login"
    const actionLabel = user ? "Go to dashboard" : "Sign in"

    return (
        <div className="min-h-dvh bg-background text-foreground">
            <main className="relative flex min-h-dvh items-center justify-center overflow-x-hidden px-6 py-10">
                {/* subtle background decoration */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 -z-10 mask-[radial-gradient(60%_40%_at_50%_0%,black,transparent)]"
                >
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-size-[48px_48px] opacity-40" />
                    <div className="absolute -top-40 left-1/2 h-105 w-180 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
                </div>

                <Card className="w-full max-w-lg">
                    <CardHeader className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Badge variant="secondary" className="rounded-full">
                                404
                            </Badge>
                            <div className="relative h-26 w-40 overflow-hidden rounded-md border bg-card">
                                <Image
                                    src="/logo.png"
                                    alt="THESISGRADER"
                                    fill
                                    className="object-cover"
                                    priority
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <CardTitle className="text-2xl">Page not found</CardTitle>
                            <CardDescription>
                                The page you’re looking for doesn’t exist or may have been moved.
                            </CardDescription>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                        <div className="rounded-lg border bg-muted/30 p-3">
                            Tip: Check the URL for typos, or go back to the homepage.
                        </div>
                    </CardContent>

                    <CardFooter className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                        <Button asChild variant="outline" className="w-full sm:w-auto">
                            <Link href="/">Go to homepage</Link>
                        </Button>

                        <Button asChild className="w-full sm:w-auto">
                            <Link href={actionHref}>{actionLabel}</Link>
                        </Button>
                    </CardFooter>
                </Card>
            </main>
        </div>
    )
}
