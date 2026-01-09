/* eslint-disable @typescript-eslint/no-explicit-any */
// app/dashboard/admin/thesis/page.tsx
import DashboardLayout from "@/components/dashboard-layout"
import { requireAdminActor } from "@/lib/admin-auth"
import { getThesisDashboardStats, listThesisGroups, type ThesisGroupRow } from "@/lib/thesis-admin"

import ThesisAdminClient from "./thesis-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SearchParams = Record<string, string | string[] | undefined>

function clampInt(v: unknown, fallback: number, min: number, max: number) {
    const raw = Array.isArray(v) ? v[0] : v
    const n = typeof raw === "string" ? Number(raw) : Number.NaN
    if (!Number.isFinite(n)) return fallback
    const i = Math.trunc(n)
    return Math.min(Math.max(i, min), max)
}

function pickOne(v: string | string[] | undefined) {
    if (Array.isArray(v)) return v[0]
    return v
}

export default async function Page({ searchParams }: { searchParams: SearchParams | Promise<SearchParams> }) {
    const sp = await Promise.resolve(searchParams as any as SearchParams)
    const actor = await requireAdminActor()

    const q = String(pickOne(sp.q) ?? "").trim()
    const page = clampInt(pickOne(sp.page), 1, 1, 999999)
    const limit = clampInt(pickOne(sp.limit), 20, 5, 200)
    const offset = (page - 1) * limit

    const notice = String(pickOne(sp.notice) ?? "").trim()
    const err = String(pickOne(sp.err) ?? "").trim()

    const stats = await getThesisDashboardStats()

    const listRes = await listThesisGroups({ q, limit, offset })
    const total = listRes.total
    const groups = listRes.groups as ThesisGroupRow[]
    const totalPages = Math.max(1, Math.ceil(total / limit))

    return (
        <DashboardLayout title="Thesis Records">
            <ThesisAdminClient
                actor={{ name: actor.name, email: actor.email }}
                q={q}
                page={page}
                limit={limit}
                total={total}
                totalPages={totalPages}
                groups={groups}
                stats={stats}
                notice={notice}
                err={err}
            />
        </DashboardLayout>
    )
}
