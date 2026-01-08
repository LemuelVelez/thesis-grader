/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconDotsVertical, IconLogout, IconUserCircle } from "@tabler/icons-react"

import { useAuth } from "@/hooks/use-auth"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { toast } from "sonner"

type NavUserProps = {
    user?: {
        name?: string | null
        email?: string | null
        avatar?: string | null
        avatar_key?: string | null
        role?: string | null
    }
    onLogout?: () => Promise<void> | void

    /** ✅ NEW: render style */
    variant?: "sidebar" | "header"
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
    const direct = String(u?.avatar ?? "").trim()
    if (direct) return direct

    const key = String(u?.avatar_key ?? "").trim()
    if (!key) return ""
    if (/^https?:\/\//i.test(key)) return key
    if (key.startsWith("/")) return key

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

export function NavUser({ user: userProp, onLogout, variant = "sidebar" }: NavUserProps) {
    const router = useRouter()
    const { isMobile } = useSidebar()

    const { loading, user: authUser } = useAuth()
    const u: any = userProp ?? authUser ?? null

    const [menuOpen, setMenuOpen] = React.useState(false)
    const [logoutOpen, setLogoutOpen] = React.useState(false)
    const [loggingOut, setLoggingOut] = React.useState(false)

    const name = String(u?.name ?? "Account")
    const email = String(u?.email ?? "")
    const role = String(u?.role ?? "").toLowerCase() || null

    const avatarUrl = React.useMemo(() => inferAvatarUrl(u), [u])
    const initials = React.useMemo(() => getInitials(name), [name])

    const showLoading = !userProp && loading

    const goToAccountSettings = React.useCallback(() => {
        if (showLoading || !u) return
        setMenuOpen(false)
        router.push(settingsPathForRole(role))
    }, [router, role, showLoading, u])

    const doLogout = React.useCallback(async () => {
        if (loggingOut) return

        setLoggingOut(true)
        const toastId = toast.loading("Logging out...")

        try {
            if (onLogout) {
                await onLogout()
            }

            const res = await fetch("/api/auth/logout", { method: "POST" })
            if (!res.ok) {
                let msg = "Failed to log out."
                try {
                    const data = await res.json()
                    if (data?.message) msg = String(data.message)
                } catch {
                    // ignore
                }
                throw new Error(msg)
            }

            toast.success("Logged out.", { id: toastId })

            setLogoutOpen(false)
            setMenuOpen(false)

            router.push("/login")
            router.refresh()
        } catch (e: any) {
            toast.error(String(e?.message ?? "Failed to log out."), { id: toastId })
        } finally {
            setLoggingOut(false)
        }
    }, [loggingOut, onLogout, router])

    const dropdownContent = (
        <DropdownMenuContent
            className="min-w-56 max-w-[calc(100vw-1rem)] rounded-lg"
            side={variant === "header" ? "bottom" : isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={8}
        >
            <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-2 py-2 text-left text-sm min-w-0">
                    <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarImage src={avatarUrl || undefined} alt={name} />
                        <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                    </Avatar>

                    <div className="grid flex-1 min-w-0 text-left text-sm leading-tight">
                        <span className="truncate font-medium">{showLoading ? "Loading..." : name}</span>
                        {email ? <span className="truncate text-xs text-muted-foreground">{email}</span> : null}
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
                    setMenuOpen(false)
                    setLogoutOpen(true)
                }}
            >
                <IconLogout />
                Log out
            </DropdownMenuItem>
        </DropdownMenuContent>
    )

    return (
        <>
            {variant === "header" ? (
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full"
                            aria-label="User menu"
                        >
                            <Avatar className="h-8 w-8 rounded-full">
                                <AvatarImage src={avatarUrl || undefined} alt={name} />
                                <AvatarFallback>{initials}</AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    {dropdownContent}
                </DropdownMenu>
            ) : (
                <SidebarMenu>
                    <SidebarMenuItem>
                        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                            <DropdownMenuTrigger asChild>
                                <SidebarMenuButton size="lg" isActive={menuOpen}>
                                    <Avatar className="h-8 w-8 rounded-lg grayscale">
                                        <AvatarImage src={avatarUrl || undefined} alt={name} />
                                        <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                                    </Avatar>

                                    <div className="grid flex-1 min-w-0 text-left text-sm leading-tight">
                                        <span className="truncate font-medium">{showLoading ? "Loading..." : name}</span>
                                        <span className="truncate text-xs text-muted-foreground">
                                            {showLoading ? " " : email || "Signed in"}
                                        </span>
                                    </div>

                                    <IconDotsVertical className="ml-auto size-4" />
                                </SidebarMenuButton>
                            </DropdownMenuTrigger>

                            {/* original sidebar dropdown behavior */}
                            <DropdownMenuContent
                                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                                side={isMobile ? "bottom" : "right"}
                                align="end"
                                sideOffset={4}
                            >
                                {/* reuse same content, but match sidebar width behavior */}
                                <DropdownMenuLabel className="p-0 font-normal">
                                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm min-w-0">
                                        <Avatar className="h-8 w-8 rounded-lg">
                                            <AvatarImage src={avatarUrl || undefined} alt={name} />
                                            <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                                        </Avatar>

                                        <div className="grid flex-1 min-w-0 text-left text-sm leading-tight">
                                            <span className="truncate font-medium">{showLoading ? "Loading..." : name}</span>
                                            {email ? <span className="truncate text-xs text-muted-foreground">{email}</span> : null}
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
                                        setMenuOpen(false)
                                        setLogoutOpen(true)
                                    }}
                                >
                                    <IconLogout />
                                    Log out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SidebarMenuItem>
                </SidebarMenu>
            )}

            <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Log out?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will end your current session and return you to the login page.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={loggingOut}>Cancel</AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <Button
                                variant="destructive"
                                onClick={(e) => {
                                    e.preventDefault()
                                    void doLogout()
                                }}
                                disabled={loggingOut}
                                className="text-white"
                            >
                                {loggingOut ? "Logging out..." : "Log out"}
                            </Button>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

export default NavUser
