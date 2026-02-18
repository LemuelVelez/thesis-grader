"use client"

import DashboardLayout from "@/components/dashboard-layout"

import { AdminEvaluationsForm } from "@/components/evaluation/admin-evaluations-form"
import { useAdminEvaluationsPage } from "@/components/evaluation/admin-evaluations-hook"
import {
    AdminEvaluationViewDialog,
    AdminEvaluationsError,
    AdminEvaluationsGroupedTable,
    AdminEvaluationsStats,
    AdminEvaluationsToolbar,
} from "@/components/evaluation/admin-evaluations-table"

export default function AdminEvaluationsPage() {
    const ctx = useAdminEvaluationsPage()

    return (
        <DashboardLayout
            title="Evaluations"
            description="Assign panelist and student evaluations in distinct flows, then manage lifecycle and status in one user-friendly workspace."
        >
            <div className="space-y-4">
                <AdminEvaluationsToolbar ctx={ctx} />

                <AdminEvaluationsForm ctx={ctx} />

                <AdminEvaluationsStats ctx={ctx} />

                <AdminEvaluationsError ctx={ctx} />

                <AdminEvaluationsGroupedTable ctx={ctx} />

                <AdminEvaluationViewDialog ctx={ctx} />
            </div>
        </DashboardLayout>
    )
}
