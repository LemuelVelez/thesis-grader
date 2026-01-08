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

type DashboardLayoutProps = {
    title?: string
    children: React.ReactNode
}

export default function DashboardLayout({ title, children }: DashboardLayoutProps) {
    return (
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

                {/* ✅ prevent page-level horizontal scroll; tables should scroll inside their own wrappers */}
                <main className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-6">
                    {children}
                </main>
            </SidebarInset>
        </SidebarProvider>
    )
}
