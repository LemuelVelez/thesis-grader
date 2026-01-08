/* eslint-disable @typescript-eslint/no-explicit-any */
import DashboardLayout from "@/components/dashboard-layout"
import { requireAdminActor } from "@/lib/admin-auth"
import { getReportsSummary, resolveDateRange } from "@/lib/reports-admin"

import ReportsClient from "./reports-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SearchParams = Record<string, string | string[] | undefined>

function pickOne(v: string | string[] | undefined) {
    if (Array.isArray(v)) return v[0]
    return v
}

export default async function Page({
    searchParams,
}: {
    searchParams: SearchParams | Promise<SearchParams>
}) {
    const sp = await Promise.resolve(searchParams as any as SearchParams)
    await requireAdminActor()

    const from = String(pickOne(sp.from) ?? "").trim()
    const to = String(pickOne(sp.to) ?? "").trim()
    const daysRaw = String(pickOne(sp.days) ?? "").trim()
    const days = Number.isFinite(Number(daysRaw)) ? Math.max(1, Math.min(365, Math.trunc(Number(daysRaw)))) : 30

    const range = resolveDateRange({ from: from || undefined, to: to || undefined, days })
    const summary = await getReportsSummary(range)

    return (
        <DashboardLayout title="Reports">
            <ReportsClient initialSummary={summary} />
        </DashboardLayout>
    )
}
