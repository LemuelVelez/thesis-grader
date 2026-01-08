"use client"

import * as React from "react"
import { IconDotsVertical, IconLogout, IconUserCircle } from "@tabler/icons-react"

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
    user?: {
        name?: string | null
        email?: string | null
        avatar?: string | null
    }
    /**
     * Optional handler if you want the "Log out" item to actually do something.
     * If not provided, the menu item will be disabled.
     */
    onLogout?: () => void
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

export function NavUser({ user, onLogout }: NavUserProps) {
    const { isMobile } = useSidebar()

    const name = String(user?.name ?? "Account")
    const email = String(user?.email ?? "")
    const avatar = user?.avatar ?? ""

    const initials = React.useMemo(() => getInitials(name), [name])

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            <Avatar className="h-8 w-8 rounded-lg grayscale">
                                <AvatarImage src={avatar || undefined} alt={name} />
                                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                            </Avatar>

                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">{name}</span>
                                {email ? (
                                    <span className="truncate text-xs text-muted-foreground">{email}</span>
                                ) : (
                                    <span className="truncate text-xs text-muted-foreground">Signed in</span>
                                )}
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
                                    <AvatarImage src={avatar || undefined} alt={name} />
                                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                                </Avatar>

                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-medium">{name}</span>
                                    {email ? (
                                        <span className="truncate text-xs text-muted-foreground">{email}</span>
                                    ) : null}
                                </div>
                            </div>
                        </DropdownMenuLabel>

                        <DropdownMenuSeparator />

                        <DropdownMenuGroup>
                            <DropdownMenuItem disabled>
                                <IconUserCircle />
                                Account
                            </DropdownMenuItem>
                        </DropdownMenuGroup>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                            disabled={!onLogout}
                            onSelect={(e) => {
                                if (!onLogout) return
                                e.preventDefault()
                                onLogout()
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

/**
 * Fixes: `import NavUser from "@/components/nav-user"` in dashboard-layout.tsx
 * while still keeping the named export available.
 */
export default NavUser
