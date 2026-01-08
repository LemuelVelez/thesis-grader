"use client"

import Link from "next/link"

import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
    useSidebar,
} from "@/components/ui/sidebar"
import { Settings } from "lucide-react"

function roleBasePath(role: string | null | undefined) {
    const r = String(role ?? "").toLowerCase()
    if (r === "student") return "/dashboard/student"
    if (r === "staff") return "/dashboard/staff"
    if (r === "admin") return "/dashboard/admin"
    return "/dashboard"
}

function initials(name?: string | null) {
    const s = String(name ?? "").trim()
    if (!s) return "U"
    const parts = s.split(/\s+/).slice(0, 2)
    return parts.map((p) => p[0]?.toUpperCase()).join("") || "U"
}

export default function NavUser() {
    const { user, loading } = useAuth()
    const { state } = useSidebar()
    const collapsed = state === "collapsed"

    const base = roleBasePath(user?.role)
    const settingsHref = `${base}/settings`

    if (loading) {
        return (
            <div className="p-2">
                <div className="h-10 w-full rounded-md bg-muted/40" />
            </div>
        )
    }

    return (
        <div className="w-full">
            <SidebarSeparator />

            <div className="flex items-center gap-2 px-2 py-2">
                <div
                    className={cn(
                        "flex size-9 items-center justify-center rounded-md bg-muted text-xs font-semibold",
                        "text-foreground"
                    )}
                    aria-hidden="true"
                >
                    {initials(user?.name)}
                </div>

                {!collapsed && (
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{user?.name ?? "User"}</div>
                        <div className="truncate text-xs text-muted-foreground">{user?.email ?? ""}</div>
                    </div>
                )}
            </div>

            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Settings">
                        <Link href={settingsHref}>
                            <Settings className="size-4" />
                            <span>Settings</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </div>
    )
}
