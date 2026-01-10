"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"
import NavUser from "@/components/nav-user"

type DashboardHeaderProps = {
    title?: string
    rightSlot?: React.ReactNode
}

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function humanize(segment: string) {
    return String(segment || "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim()
}

function resolveDashboardTitle(pathname: string | null | undefined) {
    const p = (pathname ?? "").replace(/\/+$/, "")
    if (!p || p === "/") return "Dashboard"

    // ✅ Force tuple typing (prevents string[][] inference)
    const ROUTE_TITLES = [
        // Admin
        ["/dashboard/admin/schedules", "Schedules"],
        ["/dashboard/admin/evaluation", "Evaluations"],
        ["/dashboard/admin/reports", "Reports"],
        ["/dashboard/admin/users", "Users"],
        ["/dashboard/admin/thesis", "Thesis Records"],
        ["/dashboard/admin/rubrics", "Rubrics"],
        ["/dashboard/admin/audit", "Audit Logs"],
        ["/dashboard/admin/settings", "Settings"],
        ["/dashboard/admin", "Dashboard"],

        // Staff
        ["/dashboard/staff/schedules", "Schedules"],
        ["/dashboard/staff/evaluations", "Evaluations"],
        ["/dashboard/staff/rubrics", "Rubrics"],
        ["/dashboard/staff/settings", "Settings"],
        ["/dashboard/staff", "Dashboard"],

        // Student
        ["/dashboard/student/schedule", "My Schedule"],
        ["/dashboard/student/evaluation", "My Evaluation"],
        ["/dashboard/student/settings", "Settings"],
        ["/dashboard/student", "Dashboard"],

        // Generic fallback roots
        ["/dashboard", "Dashboard"],
    ] as const satisfies ReadonlyArray<readonly [string, string]>

    // sort by prefix length desc for longest-prefix match
    const sorted = [...ROUTE_TITLES].sort((a, b) => b[0].length - a[0].length)

    for (const [prefix, label] of sorted) {
        if (p === prefix || p.startsWith(prefix + "/")) {
            const isNested = p !== prefix && p.startsWith(prefix + "/")
            if (!isNested) return label

            const parts = p.split("/").filter(Boolean)
            const last = parts[parts.length - 1] ?? ""
            const looksLikeId = UUID_RE.test(last) || /^\d+$/.test(last)

            if (looksLikeId) {
                if (prefix.endsWith("/evaluation")) return "Evaluation Details"
                if (prefix.endsWith("/evaluations")) return "Evaluation Details"
                if (prefix.endsWith("/schedules")) return "Schedule Details"
                if (prefix.endsWith("/rubrics")) return "Rubric Details"
                if (prefix.endsWith("/thesis")) return "Thesis Record Details"
                return `${label} Details`
            }

            return label
        }
    }

    // Final fallback: last segment (or previous if last is an ID)
    const parts = p.split("/").filter(Boolean)
    if (parts.length === 0) return "Dashboard"

    const last = parts[parts.length - 1] ?? ""
    const prev = parts[parts.length - 2] ?? ""

    const looksLikeId = UUID_RE.test(last) || /^\d+$/.test(last)
    if (looksLikeId) {
        const base = prev || "Details"
        if (base === "evaluation" || base === "evaluations") return "Evaluation Details"
        if (base === "schedule" || base === "schedules") return "Schedule Details"
        return `${humanize(base)} Details`
    }

    return humanize(last)
}

export default function DashboardHeader({ title, rightSlot }: DashboardHeaderProps) {
    const pathname = usePathname()

    const derivedTitle = React.useMemo(() => resolveDashboardTitle(pathname), [pathname])

    const effectiveTitle = React.useMemo(() => {
        const t = (title ?? "").trim()
        return t ? t : derivedTitle
    }, [title, derivedTitle])

    return (
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur md:px-4">
            <SidebarTrigger />

            <div className="min-w-0 flex-1">
                {effectiveTitle ? (
                    <h1 className="truncate text-sm font-semibold md:text-base">{effectiveTitle}</h1>
                ) : (
                    <div className="h-5 w-40 rounded-md bg-muted/40" aria-hidden="true" />
                )}
            </div>

            <div className="flex items-center gap-2">
                {rightSlot}
                <NavUser variant="header" />
            </div>
        </header>
    )
}
