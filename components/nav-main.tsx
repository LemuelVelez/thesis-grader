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

function isActivePath(pathname: string, href: string) {
    if (!pathname) return false
    if (pathname === href) return true
    return pathname.startsWith(href + "/")
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
