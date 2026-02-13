"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { getDashboardNav, type NavGroup, type NavItem } from "@/components/dashboard-nav"
import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
} from "@/components/ui/sidebar"
import { useAuth } from "@/hooks/use-auth"

function normalizePath(p: string) {
    if (!p) return ""
    if (p !== "/" && p.endsWith("/")) return p.slice(0, -1)
    return p
}

function isRoleRootHref(href: string) {
    // Overview links are role roots like /dashboard/admin (and optionally /dashboard)
    const h = normalizePath(href)
    return h === "/dashboard" || /^\/dashboard\/(student|staff|admin|panelist)$/.test(h)
}

function isActivePath(pathname: string, href: string) {
    const p = normalizePath(pathname)
    const h = normalizePath(href)
    if (!p || !h) return false

    if (p === h) return true

    // Prevent "Overview" (role root) from being active on nested routes
    if (isRoleRootHref(h)) return false

    // All other items treat nested routes as active
    return p.startsWith(h + "/")
}

export default function NavMain() {
    const pathname = usePathname() ?? ""
    const { loading, user } = useAuth()

    const groups: NavGroup[] = React.useMemo(() => getDashboardNav(user?.role), [user?.role])

    if (loading) {
        return (
            <div className="px-2 py-2">
                <div className="h-8 w-full rounded-md bg-muted/40" />
                <div className="mt-2 h-8 w-full rounded-md bg-muted/40" />
                <div className="mt-2 h-8 w-full rounded-md bg-muted/40" />
            </div>
        )
    }

    return (
        <div className="pb-2">
            {groups.map((g, idx) => (
                <React.Fragment key={g.title}>
                    <SidebarGroup>
                        <SidebarGroupLabel>{g.title}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {g.items.map((item: NavItem) => {
                                    const Icon = item.icon
                                    const active = isActivePath(pathname, item.href)

                                    return (
                                        <SidebarMenuItem key={item.href}>
                                            <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                                                <Link href={item.href}>
                                                    <Icon className="size-4" />
                                                    <span>{item.label}</span>
                                                </Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    )
                                })}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>

                    {idx < groups.length - 1 ? <SidebarSeparator /> : null}
                </React.Fragment>
            ))}
        </div>
    )
}
