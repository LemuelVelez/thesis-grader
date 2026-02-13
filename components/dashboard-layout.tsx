"use client"

import * as React from "react"

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarInset,
    SidebarProvider,
} from "@/components/ui/sidebar"

import DashboardHeader from "@/components/dashboard-header"
import AppSidebarHeader from "@/components/sidebar-header"
import NavMain from "@/components/nav-main"
import NavUser from "@/components/nav-user"
import { cn } from "@/lib/utils"

type DashboardLayoutProps = {
    title?: string
    description?: string
    mainClassName?: string
    children: React.ReactNode
}

export default function DashboardLayout({ title, description, mainClassName, children }: DashboardLayoutProps) {
    return (
        <div className="overflow-hidden">
            <SidebarProvider defaultOpen>
                <Sidebar variant="inset" collapsible="icon">
                    <AppSidebarHeader />

                    <SidebarContent>
                        <NavMain />
                    </SidebarContent>

                    {/* ✅ keep NavUser in the sidebar footer */}
                    <SidebarFooter>
                        <NavUser variant="sidebar" />
                    </SidebarFooter>
                </Sidebar>

                {/* ✅ min-w-0 prevents the content area from forcing horizontal overflow */}
                <SidebarInset className="min-w-0">
                    <DashboardHeader title={title} />

                    {description ? (
                        <div className="p-4 pb-2 md:px-6">
                            <p className="text-sm text-muted-foreground">{description}</p>
                        </div>
                    ) : null}

                    {/* ✅ prevent page-level horizontal scroll; tables should scroll inside their own wrappers */}
                    <main className={cn("flex-1 min-w-0 overflow-x-hidden p-4 m-2 md:p-6", mainClassName)}>
                        {children}
                    </main>
                </SidebarInset>
            </SidebarProvider>
        </div>
    )
}
