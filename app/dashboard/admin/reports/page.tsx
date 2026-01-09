"use client"

import * as React from "react"
import DashboardLayout from "@/components/dashboard-layout"
import ReportsClient from "./reports-client"

export default function Page() {
    return (
        <DashboardLayout title="Reports">
            <ReportsClient />
        </DashboardLayout>
    )
}
