"use client"

import * as React from "react"
import { Loader2, PencilLine, Plus, Trash2, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type PanelistLite = {
    id: string
    name: string
    email: string | null
}

type DefenseSchedulePanelistsSectionProps = {
    panelists: PanelistLite[]
    hasPanelistUsers: boolean
    panelistMutationBusy: boolean
    addPanelistBusy: boolean
    onOpenAddPanelistDialog: () => void
    onOpenCreatePanelistUserDialog: () => void
    onOpenEditPanelistDialog: (panelist: PanelistLite) => void
    onOpenRemovePanelistDialog: (panelist: PanelistLite) => void
}

export function DefenseSchedulePanelistsSection({
    panelists,
    hasPanelistUsers,
    panelistMutationBusy,
    addPanelistBusy,
    onOpenAddPanelistDialog,
    onOpenCreatePanelistUserDialog,
    onOpenEditPanelistDialog,
    onOpenRemovePanelistDialog,
}: DefenseSchedulePanelistsSectionProps) {
    return (
        <Card className="shadow-sm">
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <CardTitle className="text-base">Panelists</CardTitle>
                    <CardDescription>{panelists.length} assigned</CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={panelistMutationBusy}
                        onClick={onOpenAddPanelistDialog}
                    >
                        {addPanelistBusy ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Plus className="mr-2 h-4 w-4" />
                        )}
                        Add Panelist
                    </Button>

                    {!hasPanelistUsers ? (
                        <Button
                            type="button"
                            size="sm"
                            disabled={panelistMutationBusy}
                            onClick={onOpenCreatePanelistUserDialog}
                        >
                            <UserPlus className="mr-2 h-4 w-4" />
                            Create Panelist User
                        </Button>
                    ) : null}
                </div>
            </CardHeader>

            <CardContent className="space-y-3">
                {!hasPanelistUsers ? (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                        No users with the <span className="font-medium">panelist</span> role were found.
                        Click <span className="font-medium">Add Panelist</span> to instantly create and assign one.
                    </div>
                ) : null}

                <div className="overflow-x-auto rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-56">Name</TableHead>
                                <TableHead className="min-w-56">Email</TableHead>
                                <TableHead className="min-w-48">ID</TableHead>
                                <TableHead className="min-w-48 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {panelists.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                                        No panelists assigned.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                panelists.map((panelist) => (
                                    <TableRow key={`${panelist.id}-${panelist.name}`}>
                                        <TableCell className="font-medium">{panelist.name}</TableCell>
                                        <TableCell>{panelist.email || "—"}</TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {panelist.id || "—"}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap items-center justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={panelistMutationBusy || !panelist.id}
                                                    onClick={() => onOpenEditPanelistDialog(panelist)}
                                                >
                                                    <PencilLine className="mr-1.5 h-3.5 w-3.5" />
                                                    Edit
                                                </Button>

                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-destructive hover:text-destructive"
                                                    disabled={panelistMutationBusy || !panelist.id}
                                                    onClick={() => onOpenRemovePanelistDialog(panelist)}
                                                >
                                                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                                    Remove
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}
