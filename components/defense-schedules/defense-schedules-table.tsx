"use client"

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type DefenseScheduleStatus =
    | "scheduled"
    | "ongoing"
    | "completed"
    | "cancelled"
    | (string & {})

type PanelistLite = {
    id: string
    name: string
    email: string | null
}

type DefenseScheduleRecord = {
    id: string
    group_id: string
    group_title: string | null
    scheduled_at: string
    room: string | null
    status: DefenseScheduleStatus
    rubric_template_id: string | null
    rubric_template_name: string | null
    created_by: string | null
    created_by_id: string | null
    created_by_name: string | null
    created_by_email: string | null
    created_at: string
    updated_at: string
    panelists: PanelistLite[]
}

type DefenseSchedulesTableProps = {
    loading: boolean
    rows: DefenseScheduleRecord[]
    groupTitleById: Map<string, string>
    rubricNameById: Map<string, string>
    formatDateTime: (value: string) => string
    statusBadgeClass: (status: DefenseScheduleStatus) => string
    toTitleCase: (value: string) => string
    resolveCreatorLabel: (row: DefenseScheduleRecord) => string
    onEdit: (row: DefenseScheduleRecord) => void
    onDelete: (row: DefenseScheduleRecord) => void
}

export function DefenseSchedulesTable({
    loading,
    rows,
    groupTitleById,
    rubricNameById,
    formatDateTime,
    statusBadgeClass,
    toTitleCase,
    resolveCreatorLabel,
    onEdit,
    onDelete,
}: DefenseSchedulesTableProps) {
    return (
        <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="min-w-48">Schedule ID</TableHead>
                        <TableHead className="min-w-56">Group</TableHead>
                        <TableHead className="min-w-44">Date &amp; Time</TableHead>
                        <TableHead className="min-w-28">Room</TableHead>
                        <TableHead className="min-w-28">Status</TableHead>
                        <TableHead className="min-w-40">Updated</TableHead>
                        <TableHead className="min-w-44 text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>

                <TableBody>
                    {loading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                            <TableRow key={`skeleton-${i}`}>
                                <TableCell colSpan={7}>
                                    <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                </TableCell>
                            </TableRow>
                        ))
                    ) : rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                No defense schedules found.
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((row) => {
                            const resolvedGroupTitle =
                                row.group_title ||
                                groupTitleById.get(row.group_id) ||
                                row.group_id ||
                                "Unassigned Group"

                            const resolvedRubricName =
                                row.rubric_template_name ||
                                (row.rubric_template_id
                                    ? rubricNameById.get(row.rubric_template_id) ?? null
                                    : null)

                            const resolvedCreator = resolveCreatorLabel(row)

                            return (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{row.id}</span>
                                            {resolvedRubricName ? (
                                                <span className="text-xs text-muted-foreground">
                                                    Rubric: {resolvedRubricName}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">
                                                    Rubric: Not set
                                                </span>
                                            )}
                                            <span className="text-xs text-muted-foreground">
                                                Created by: {resolvedCreator}
                                            </span>
                                        </div>
                                    </TableCell>

                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{resolvedGroupTitle}</span>
                                            {row.group_id ? (
                                                <span className="text-xs text-muted-foreground">
                                                    {row.group_id}
                                                </span>
                                            ) : null}
                                        </div>
                                    </TableCell>

                                    <TableCell>{formatDateTime(row.scheduled_at)}</TableCell>

                                    <TableCell>{row.room || "TBA"}</TableCell>

                                    <TableCell>
                                        <Badge variant="outline" className={statusBadgeClass(row.status)}>
                                            {toTitleCase(row.status)}
                                        </Badge>
                                    </TableCell>

                                    <TableCell className="text-muted-foreground">
                                        {formatDateTime(row.updated_at)}
                                    </TableCell>

                                    <TableCell>
                                        <div className="flex items-center justify-end gap-2">
                                            <Button asChild variant="outline" size="sm">
                                                <Link href={`/dashboard/admin/defense-schedules/${row.id}`}>
                                                    View
                                                </Link>
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => onEdit(row)}>
                                                Edit
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => onDelete(row)}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
