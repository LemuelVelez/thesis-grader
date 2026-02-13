"use client"

import { Scale } from "lucide-react"
import { RoleSettingsPage } from "@/app/dashboard/admin/settings/page"

export default function PanelistSettingsPage() {
    return (
        <RoleSettingsPage
            config={{
                pageTitle: "Panelist Settings",
                pageDescription: "Update your account information, avatar, and password.",
                roleBadgeLabel: "Panelist",
                roleIcon: <Scale className="h-3.5 w-3.5" />,
            }}
        />
    )
}
