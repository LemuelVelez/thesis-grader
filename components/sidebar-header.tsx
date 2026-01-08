"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"

import { cn } from "@/lib/utils"
import { SidebarHeader as UISidebarHeader, useSidebar } from "@/components/ui/sidebar"

export default function AppSidebarHeader() {
    const { state } = useSidebar()
    const collapsed = state === "collapsed"

    return (
        <UISidebarHeader className="gap-0">
            <Link
                href="/"
                className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    "transition-colors"
                )}
            >
                <div className="relative h-8 w-10 overflow-hidden rounded-md bg-muted">
                    <Image
                        src="/logo.svg"
                        alt="THESISGRADER"
                        fill
                        className="object-contain"
                        priority
                    />
                </div>

                {!collapsed && (
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold leading-tight">THESISGRADER</div>
                        <div className="truncate text-[11px] text-sidebar-foreground/70 leading-tight">
                            Dashboard
                        </div>
                    </div>
                )}
            </Link>
        </UISidebarHeader>
    )
}
