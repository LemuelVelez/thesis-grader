"use client"

import { Briefcase } from "lucide-react"
import { RoleSettingsPage } from "@/app/dashboard/admin/settings/page"

export default function StaffSettingsPage() {
    return (
        <RoleSettingsPage
            config={{
                pageTitle: "Staff Settings",
                pageDescription: "Update your account information, avatar, and password.",
                roleBadgeLabel: "Staff",
                roleIcon: <Briefcase className="h-3.5 w-3.5" />,
            }}
        />
    )
}
