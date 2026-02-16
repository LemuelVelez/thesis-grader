"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type StatusFilter = "all" | "scheduled" | "ongoing" | "completed" | "cancelled"

type DefenseSchedulesFiltersBarProps = {
    search: string
    onSearchChange: (value: string) => void
    statusFilter: StatusFilter
    onStatusFilterChange: (value: StatusFilter) => void
    statusFilters: readonly StatusFilter[]
    filteredCount: number
    totalCount: number
    loading: boolean
    onRefresh: () => void
    onCreate: () => void
}

function toTitleCase(value: string): string {
    if (!value) return ""
    return value.charAt(0).toUpperCase() + value.slice(1)
}

export function DefenseSchedulesFiltersBar({
    search,
    onSearchChange,
    statusFilter,
    onStatusFilterChange,
    statusFilters,
    filteredCount,
    totalCount,
    loading,
    onRefresh,
    onCreate,
}: DefenseSchedulesFiltersBarProps) {
    return (
        <div className="rounded-lg border bg-card p-4">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <Input
                        placeholder="Search by schedule ID, group, rubric, room, status, creator, or panelist"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full lg:max-w-xl"
                    />

                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={onRefresh} disabled={loading}>
                            Refresh
                        </Button>
                        <Button onClick={onCreate}>Create Schedule</Button>
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Filter by status</p>
                    <div className="flex flex-wrap gap-2">
                        {statusFilters.map((status) => {
                            const active = statusFilter === status
                            return (
                                <Button
                                    key={status}
                                    size="sm"
                                    variant={active ? "default" : "outline"}
                                    onClick={() => onStatusFilterChange(status)}
                                >
                                    {toTitleCase(status)}
                                </Button>
                            )
                        })}
                    </div>
                </div>

                <p className="text-sm text-muted-foreground">
                    Showing <span className="font-semibold text-foreground">{filteredCount}</span> of{" "}
                    <span className="font-semibold text-foreground">{totalCount}</span> schedule(s).
                </p>
            </div>
        </div>
    )
}
