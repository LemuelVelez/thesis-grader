// components/nav-user.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconDotsVertical, IconLogout, IconUserCircle } from "@tabler/icons-react"

import { useAuth } from "@/hooks/use-auth"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"

type NavUserProps = {
    /**
     * Optional override user (if you want to pass user manually).
     * If not provided, this component will use `useAuth()` to get the current user.
     */
    user?: {
        name?: string | null
        email?: string | null
        avatar?: string | null
        avatar_key?: string | null
        role?: string | null
    }
    /**
     * Optional handler if you want the "Log out" item to do something custom.
     * If not provided, NavUser will attempt POST /api/auth/logout and then redirect to "/login".
     */
    onLogout?: () => Promise<void> | void
}

function getInitials(name: string) {
    const n = name.trim()
    if (!n) return "?"
    const parts = n.split(/\s+/).filter(Boolean)
    const first = parts[0]?.[0] ?? ""
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : ""
    const init = (first + last).toUpperCase()
    return init || n.slice(0, 2).toUpperCase()
}

function inferAvatarUrl(u: any): string {
    // Prefer explicit avatar url if provided.
    const direct = String(u?.avatar ?? "").trim()
    if (direct) return direct

    // If avatar_key is already a full URL or a public path, allow it.
    const key = String(u?.avatar_key ?? "").trim()
    if (!key) return ""
    if (/^https?:\/\//i.test(key)) return key
    if (key.startsWith("/")) return key

    // Otherwise we don't know your avatar serving route (S3 signed URL, etc.).
    // Returning empty prevents broken-image icons.
    return ""
}

function roleBasePath(role: string | null | undefined) {
    const r = String(role ?? "").toLowerCase()
    if (r === "student") return "/dashboard/student"
    if (r === "staff") return "/dashboard/staff"
    if (r === "admin") return "/dashboard/admin"
    return "/dashboard"
}

function settingsPathForRole(role: string | null | undefined) {
    return `${roleBasePath(role)}/settings`
}

export function NavUser({ user: userProp, onLogout }: NavUserProps) {
    const router = useRouter()
    const { isMobile } = useSidebar()

    const { loading, user: authUser } = useAuth()
    const u: any = userProp ?? authUser ?? null

    const [open, setOpen] = React.useState(false)

    const name = String(u?.name ?? "Account")
    const email = String(u?.email ?? "")
    const role = String(u?.role ?? "").toLowerCase() || null

    const avatarUrl = React.useMemo(() => inferAvatarUrl(u), [u])
    const initials = React.useMemo(() => getInitials(name), [name])

    const showLoading = !userProp && loading

    const goToAccountSettings = React.useCallback(() => {
        if (showLoading || !u) return
        setOpen(false)
        router.push(settingsPathForRole(role))
    }, [router, role, showLoading, u])

    const handleLogout = React.useCallback(async () => {
        try {
            if (onLogout) {
                await onLogout()
            } else {
                await fetch("/api/auth/logout", { method: "POST" }).catch(() => null)
            }
        } finally {
            setOpen(false)
            router.push("/login")
            router.refresh()
        }
    }, [onLogout, router])

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu open={open} onOpenChange={setOpen}>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton size="lg" isActive={open}>
                            <Avatar className="h-8 w-8 rounded-lg grayscale">
                                <AvatarImage src={avatarUrl || undefined} alt={name} />
                                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                            </Avatar>

                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">{showLoading ? "Loading..." : name}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                    {showLoading ? " " : email || "Signed in"}
                                </span>
                            </div>

                            <IconDotsVertical className="ml-auto size-4" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                        side={isMobile ? "bottom" : "right"}
                        align="end"
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="p-0 font-normal">
                            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                <Avatar className="h-8 w-8 rounded-lg">
                                    <AvatarImage src={avatarUrl || undefined} alt={name} />
                                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                                </Avatar>

                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-medium">{showLoading ? "Loading..." : name}</span>
                                    {email ? (
                                        <span className="truncate text-xs text-muted-foreground">{email}</span>
                                    ) : null}
                                </div>
                            </div>
                        </DropdownMenuLabel>

                        <DropdownMenuSeparator />

                        <DropdownMenuGroup>
                            <DropdownMenuItem
                                disabled={showLoading || !u}
                                onSelect={(e) => {
                                    e.preventDefault()
                                    goToAccountSettings()
                                }}
                            >
                                <IconUserCircle />
                                Account
                            </DropdownMenuItem>
                        </DropdownMenuGroup>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                            disabled={showLoading || !u}
                            onSelect={(e) => {
                                e.preventDefault()
                                if (showLoading || !u) return
                                void handleLogout()
                            }}
                        >
                            <IconLogout />
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}

export default NavUser
