"use client"

import * as React from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import NavUser from "@/components/nav-user"

type DashboardHeaderProps = {
    title?: string
    rightSlot?: React.ReactNode
}

export default function DashboardHeader({ title, rightSlot }: DashboardHeaderProps) {
    return (
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur md:px-4">
            <SidebarTrigger />

            <div className="min-w-0 flex-1">
                {title ? (
                    <h1 className="truncate text-sm font-semibold md:text-base">{title}</h1>
                ) : (
                    <div className="h-5 w-40 rounded-md bg-muted/40" aria-hidden="true" />
                )}
            </div>

            {/* Right side actions + user dropdown */}
            <div className="flex items-center gap-2">
                {rightSlot}
                <NavUser variant="header" />
            </div>
        </header>
    )
}
