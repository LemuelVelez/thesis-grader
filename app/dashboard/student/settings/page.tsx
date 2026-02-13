"use client"

import { GraduationCap } from "lucide-react"
import { RoleSettingsPage } from "@/app/dashboard/admin/settings/page"

export default function StudentSettingsPage() {
    return (
        <RoleSettingsPage
            config={{
                pageTitle: "Student Settings",
                pageDescription: "Update your account information, avatar, and password.",
                roleBadgeLabel: "Student",
                roleIcon: <GraduationCap className="h-3.5 w-3.5" />,
            }}
        />
    )
}
