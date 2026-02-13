"use client"

import * as React from "react"
import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"

import DashboardLayout from "@/components/dashboard-layout"
import DataTable from "@/components/data-table"
import { Button } from "@/components/ui/button"

type ThesisGroupListItem = {
  id: string
  title: string
  program: string | null
  term: string | null
  adviserId: string | null
  membersCount: number | null
  createdAt: string | null
  updatedAt: string | null
}

const LIST_ENDPOINTS = [
  "/api/thesis-groups",
  "/api/admin/thesis-groups",
  "/api/thesis/groups",
  "/api/admin/thesis/groups",
]

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function unwrapItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload

  const rec = asRecord(payload)
  if (!rec) return []

  const directItems = rec.items
  if (Array.isArray(directItems)) return directItems

  const directData = rec.data
  if (Array.isArray(directData)) return directData

  const directGroups = rec.groups
  if (Array.isArray(directGroups)) return directGroups

  return []
}

function normalizeGroup(raw: unknown): ThesisGroupListItem | null {
  const rec = asRecord(raw)
  if (!rec) return null

  const id = toStringOrNull(rec.id ?? rec.group_id)
  if (!id) return null

  const title = toStringOrNull(rec.title ?? rec.group_title) ?? `Group ${id.slice(0, 8)}`
  const program = toStringOrNull(rec.program)
  const term = toStringOrNull(rec.term)
  const adviserId = toStringOrNull(rec.adviser_id ?? rec.adviserId)

  const membersCount = toNumberOrNull(
    rec.members_count ?? rec.member_count ?? rec.membersCount
  )

  const createdAt = toStringOrNull(rec.created_at ?? rec.createdAt)
  const updatedAt = toStringOrNull(rec.updated_at ?? rec.updatedAt)

  return {
    id,
    title,
    program,
    term,
    adviserId,
    membersCount,
    createdAt,
    updatedAt,
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d)
}

async function fetchFirstAvailableJson(
  endpoints: string[],
  signal: AbortSignal
): Promise<unknown | null> {
  let lastError: Error | null = null

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
        signal,
      })

      if (res.status === 404 || res.status === 405) {
        continue
      }

      if (!res.ok) {
        lastError = new Error(`${endpoint} returned ${res.status}`)
        continue
      }

      return (await res.json()) as unknown
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error
      }
      lastError = error instanceof Error ? error : new Error("Request failed")
    }
  }

  if (lastError) throw lastError
  return null
}

export default function AdminThesisGroupsPage() {
  const [groups, setGroups] = React.useState<ThesisGroupListItem[]>([])
  const [loading, setLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState<number>(0)

  const load = React.useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    setError(null)

    try {
      const payload = await fetchFirstAvailableJson(LIST_ENDPOINTS, signal)
      const normalized = unwrapItems(payload)
        .map(normalizeGroup)
        .filter((item): item is ThesisGroupListItem => item !== null)
        .sort((a, b) => {
          const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
          const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
          return tb - ta
        })

      setGroups(normalized)

      if (!payload) {
        setError(
          "No compatible thesis-group API endpoint found. Wire one of: /api/thesis-groups or /api/admin/thesis-groups."
        )
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return
      setGroups([])
      setError(e instanceof Error ? e.message : "Failed to load thesis groups.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load, refreshKey])

  const columns = React.useMemo<ColumnDef<ThesisGroupListItem>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <Button
            asChild
            variant="ghost"
            className="h-auto justify-start px-0 py-0 text-left font-medium"
          >
            <Link href={`/dashboard/admin/thesis-groups/${row.original.id}`}>
              {row.original.title}
            </Link>
          </Button>
        ),
      },
      {
        accessorKey: "program",
        header: "Program",
        cell: ({ row }) => row.original.program ?? "—",
      },
      {
        accessorKey: "term",
        header: "Term",
        cell: ({ row }) => row.original.term ?? "—",
      },
      {
        accessorKey: "membersCount",
        header: "Members",
        cell: ({ row }) =>
          row.original.membersCount === null ? "—" : String(row.original.membersCount),
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) => formatDateTime(row.original.updatedAt),
      },
      {
        id: "actions",
        header: "Actions",
        enableHiding: false,
        cell: ({ row }) => (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/dashboard/admin/thesis-groups/${row.original.id}`}>Open</Link>
          </Button>
        ),
      },
    ],
    []
  )

  return (
    <DashboardLayout
      title="Thesis Groups"
      description="Manage thesis groups and open each group record."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/admin/thesis">Back to Thesis Records</Link>
          </Button>

          <Button onClick={() => setRefreshKey((v) => v + 1)} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DataTable
          columns={columns}
          data={groups}
          filterColumnId="title"
          filterPlaceholder="Search thesis group title..."
        />
      </div>
    </DashboardLayout>
  )
}
