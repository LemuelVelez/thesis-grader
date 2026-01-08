/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    LayoutDashboard,
    Calendar,
    ClipboardList,
    Users,
    BookOpen,
    FileBarChart2,
    ShieldCheck,
    Settings,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/hooks/use-auth"

export type NavItem = {
    label: string
    href: string
    icon: React.ComponentType<{ className?: string }>
}

export type NavGroup = {
    title: string
    items: NavItem[]
}

function roleBasePath(role: string | null | undefined) {
    const r = String(role ?? "").toLowerCase()
    if (r === "student") return "/dashboard/student"
    if (r === "staff") return "/dashboard/staff"
    if (r === "admin") return "/dashboard/admin"
    return "/dashboard"
}

function normalizePath(p: string) {
    if (!p) return ""
    if (p !== "/" && p.endsWith("/")) return p.slice(0, -1)
    return p
}

function isRoleRootHref(href: string) {
    const h = normalizePath(href)
    return h === "/dashboard" || /^\/dashboard\/(student|staff|admin)$/.test(h)
}

function isActivePath(pathname: string, href: string) {
    const p = normalizePath(pathname)
    const h = normalizePath(href)
    if (!p) return false

    if (p === h) return true

    // Prevent role-root "Dashboard" from being active on nested routes
    if (isRoleRootHref(h)) return false

    return p.startsWith(h + "/")
}

/**
 * Exported menu builder.
 *
 * IMPORTANT CHANGE:
 * - "Overview" and "Dashboard" were duplicates (both represent the role root).
 * - We now keep a single entry: "Dashboard" -> role root.
 */
export function getDashboardNav(role: string | null | undefined): NavGroup[] {
    const base = roleBasePath(role)

    // Single root entry (no duplicate Overview)
    const main: NavItem[] = [
        { label: "Dashboard", href: base, icon: LayoutDashboard },
        { label: "Settings", href: `${base}/settings`, icon: Settings },
    ]

    const r = String(role ?? "").toLowerCase()

    if (r === "student") {
        return [
            {
                title: "Main",
                items: [
                    ...main,
                    { label: "My Schedule", href: `${base}/schedule`, icon: Calendar },
                    { label: "My Evaluation", href: `${base}/evaluation`, icon: ClipboardList },
                ],
            },
        ]
    }

    if (r === "staff") {
        return [
            {
                title: "Main",
                items: [
                    ...main,
                    { label: "Schedules", href: `${base}/schedules`, icon: Calendar },
                    { label: "Evaluations", href: `${base}/evaluations`, icon: ClipboardList },
                    { label: "Thesis Groups", href: `${base}/thesis`, icon: BookOpen },
                ],
            },
        ]
    }

    if (r === "admin") {
        const adminItems: NavItem[] = [
            { label: "Users", href: `${base}/users`, icon: Users },
            { label: "Thesis Records", href: `${base}/thesis`, icon: BookOpen },
            { label: "Reports", href: `${base}/reports`, icon: FileBarChart2 },
            { label: "Audit Logs", href: `${base}/audit`, icon: ShieldCheck },
        ]

        return [
            { title: "Main", items: main },
            { title: "Administration", items: adminItems },
        ]
    }

    // Unknown role fallback (stable UI)
    return [{ title: "Main", items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }] }]
}

export function DashboardNav() {
    const pathname = usePathname()
    const { loading, user } = useAuth()

    const groups = getDashboardNav(user?.role)

    const linkButton = (item: NavItem) => {
        const active = isActivePath(pathname ?? "", item.href)
        const Icon = item.icon

        return React.createElement(
            Button,
            {
                key: item.href,
                asChild: true,
                variant: active ? "secondary" : "ghost",
                className: "w-full justify-start gap-2",
            } as any,
            React.createElement(
                Link,
                { href: item.href },
                React.createElement(Icon, { className: "h-4 w-4" }),
                React.createElement("span", null, item.label)
            )
        )
    }

    if (loading) {
        return React.createElement(
            "nav",
            { className: "w-full space-y-3" },
            React.createElement("div", { className: "h-9 w-full rounded-md bg-muted/40" }),
            React.createElement("div", { className: "h-9 w-full rounded-md bg-muted/40" }),
            React.createElement("div", { className: "h-9 w-full rounded-md bg-muted/40" })
        )
    }

    const children: React.ReactNode[] = []

    groups.forEach((g, idx) => {
        children.push(
            React.createElement(
                "div",
                { key: `title-${g.title}`, className: "px-2 text-xs font-semibold text-muted-foreground" },
                g.title
            )
        )

        children.push(
            React.createElement("div", { key: `items-${g.title}`, className: "space-y-1" }, ...g.items.map(linkButton))
        )

        if (idx < groups.length - 1) {
            children.push(React.createElement(Separator, { key: `sep-${g.title}` }))
        }
    })

    return React.createElement("nav", { className: "w-full space-y-4" }, ...children)
}

export default DashboardNav
