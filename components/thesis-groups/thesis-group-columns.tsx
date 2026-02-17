import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal } from "lucide-react"

import { formatDateTime, type StaffUserItem, type ThesisGroupListItem } from "./thesis-group-utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type CreateThesisGroupColumnsArgs = {
    membersCountSyncing: boolean
    staffById: Map<string, StaffUserItem>
    onEditDialog: (item: ThesisGroupListItem) => void
    onDeleteDialog: (item: ThesisGroupListItem) => void
}

export function createThesisGroupColumns({
    membersCountSyncing,
    staffById,
    onEditDialog,
    onDeleteDialog,
}: CreateThesisGroupColumnsArgs): ColumnDef<ThesisGroupListItem>[] {
    return [
        {
            accessorKey: "title",
            header: "Thesis Title",
            cell: ({ row }) => (
                <Button asChild variant="ghost" className="h-auto justify-start px-0 py-0 text-left font-medium">
                    <Link href={`/dashboard/admin/thesis-groups/${row.original.id}`}>{row.original.title}</Link>
                </Button>
            ),
        },
        {
            accessorKey: "program",
            header: "Program",
            cell: ({ row }) => row.original.program ?? "—",
        },
        {
            id: "adviser",
            header: "Adviser",
            cell: ({ row }) => {
                const adviserId = row.original.adviserId

                if (!adviserId && row.original.manualAdviserInfo) {
                    return (
                        <div className="leading-tight">
                            <Badge variant="outline" className="mb-1">
                                Legacy Manual Adviser
                            </Badge>
                            <div className="text-sm">{row.original.manualAdviserInfo}</div>
                        </div>
                    )
                }

                if (!adviserId) return "—"

                const staff = staffById.get(adviserId)
                if (!staff) {
                    return (
                        <div className="space-y-1">
                            <Badge variant="outline">Assigned staff user</Badge>
                            {row.original.manualAdviserInfo ? (
                                <div className="text-xs text-muted-foreground">{row.original.manualAdviserInfo}</div>
                            ) : null}
                        </div>
                    )
                }

                return (
                    <div className="leading-tight">
                        <div>{staff.name}</div>
                        {staff.email ? <div className="text-xs text-muted-foreground">{staff.email}</div> : null}
                    </div>
                )
            },
        },
        {
            accessorKey: "term",
            header: "Term",
            cell: ({ row }) => (row.original.term ? <Badge variant="secondary">{row.original.term}</Badge> : "—"),
        },
        {
            accessorKey: "membersCount",
            header: "Members",
            cell: ({ row }) => {
                if (row.original.membersCount === null) {
                    return membersCountSyncing ? (
                        <Badge variant="outline" className="font-normal">
                            Syncing…
                        </Badge>
                    ) : (
                        "—"
                    )
                }
                return String(row.original.membersCount)
            },
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
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Open actions">
                            <MoreHorizontal className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem asChild>
                            <Link href={`/dashboard/admin/thesis-groups/${row.original.id}`}>Open</Link>
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => onEditDialog(row.original)}>Edit</DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onDeleteDialog(row.original)}
                        >
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ]
}
