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

                <SidebarFooter>
                    <NavUser />
                </SidebarFooter>
            </Sidebar>

            <SidebarInset>
                <DashboardHeader title={title} />
                <main className="flex-1 p-4 md:p-6">{children}</main>
            </SidebarInset>
        </SidebarProvider>
    )
}
