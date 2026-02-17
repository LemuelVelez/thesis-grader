"use client"

import * as React from "react"
import { Loader2, UserPlus } from "lucide-react"

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

type UserStatus = "active" | "disabled" | (string & {})
type AssignMode = "assign" | "directory"

type PanelistLite = {
    id: string
    name: string
    email: string | null
}

type UserDirectoryOption = {
    id: string
    name: string
    email: string | null
}

type DefenseSchedulePanelistDialogsProps = {
    scheduleExists: boolean

    addPanelistOpen: boolean
    onAddPanelistOpenChange: (open: boolean) => void
    addPanelistBusy: boolean
    addPanelistUserId: string
    setAddPanelistUserId: React.Dispatch<React.SetStateAction<string>>
    unassignedPanelistOptions: UserDirectoryOption[]
    onAddPanelist: () => void | Promise<void>

    editPanelistOpen: boolean
    onEditPanelistOpenChange: (open: boolean) => void
    editPanelistBusy: boolean
    editingPanelist: PanelistLite | null
    editPanelistUserId: string
    setEditPanelistUserId: React.Dispatch<React.SetStateAction<string>>
    editPanelistOptions: UserDirectoryOption[]
    onUpdatePanelist: () => void | Promise<void>

    createPanelistUserOpen: boolean
    onCreatePanelistUserOpenChange: (open: boolean) => void
    createPanelistBusy: boolean
    createPanelistName: string
    setCreatePanelistName: React.Dispatch<React.SetStateAction<string>>
    createPanelistEmail: string
    setCreatePanelistEmail: React.Dispatch<React.SetStateAction<string>>
    createPanelistStatus: UserStatus
    setCreatePanelistStatus: React.Dispatch<React.SetStateAction<UserStatus>>
    createPanelistAssignMode: AssignMode
    setCreatePanelistAssignMode: React.Dispatch<React.SetStateAction<AssignMode>>
    createPanelistForceAssign: boolean
    createPanelistStatuses: UserStatus[]
    toTitleCase: (value: string) => string
    onCreatePanelistUser: () => void | Promise<void>

    removePanelistOpen: boolean
    onRemovePanelistOpenChange: (open: boolean) => void
    removePanelistBusy: boolean
    removingPanelist: PanelistLite | null
    onRemovePanelist: () => void | Promise<void>

    onOpenCreatePanelistUserDialog: (mode?: AssignMode, options?: { forceAssign?: boolean }) => void
}

export function DefenseSchedulePanelistDialogs({
    scheduleExists,
    addPanelistOpen,
    onAddPanelistOpenChange,
    addPanelistBusy,
    addPanelistUserId,
    setAddPanelistUserId,
    unassignedPanelistOptions,
    onAddPanelist,
    editPanelistOpen,
    onEditPanelistOpenChange,
    editPanelistBusy,
    editingPanelist,
    editPanelistUserId,
    setEditPanelistUserId,
    editPanelistOptions,
    onUpdatePanelist,
    createPanelistUserOpen,
    onCreatePanelistUserOpenChange,
    createPanelistBusy,
    createPanelistName,
    setCreatePanelistName,
    createPanelistEmail,
    setCreatePanelistEmail,
    createPanelistStatus,
    setCreatePanelistStatus,
    createPanelistAssignMode,
    setCreatePanelistAssignMode,
    createPanelistForceAssign,
    createPanelistStatuses,
    toTitleCase,
    onCreatePanelistUser,
    removePanelistOpen,
    onRemovePanelistOpenChange,
    removePanelistBusy,
    removingPanelist,
    onRemovePanelist,
    onOpenCreatePanelistUserDialog,
}: DefenseSchedulePanelistDialogsProps) {
    return (
        <>
            <Dialog open={addPanelistOpen} onOpenChange={onAddPanelistOpenChange}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Add Panelist</DialogTitle>
                        <DialogDescription>
                            Assign a panelist user to this defense schedule.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-3 py-2">
                        {unassignedPanelistOptions.length > 0 ? (
                            <div className="grid gap-2">
                                <Label htmlFor="add-panelist-user">Panelist User</Label>
                                <Select
                                    value={addPanelistUserId}
                                    onValueChange={setAddPanelistUserId}
                                >
                                    <SelectTrigger id="add-panelist-user" className="w-full [&>span]:truncate">
                                        <SelectValue placeholder="Select panelist user" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {unassignedPanelistOptions.map((user) => (
                                            <SelectItem
                                                key={user.id}
                                                value={user.id}
                                                textValue={`${user.name} ${user.email ?? ""}`}
                                            >
                                                <div className="flex flex-col">
                                                    <span className="truncate">{user.name}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {user.email || user.id}
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                                <p>No available panelist user can be assigned right now.</p>
                                <Button
                                    type="button"
                                    className="mt-3"
                                    variant="secondary"
                                    onClick={() => {
                                        onAddPanelistOpenChange(false)
                                        onOpenCreatePanelistUserDialog("assign", { forceAssign: true })
                                    }}
                                >
                                    <UserPlus className="mr-2 h-4 w-4" />
                                    Create & Assign Panelist User
                                </Button>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => onAddPanelistOpenChange(false)}
                            disabled={addPanelistBusy}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void onAddPanelist()}
                            disabled={addPanelistBusy || unassignedPanelistOptions.length === 0}
                        >
                            {addPanelistBusy ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Adding...
                                </>
                            ) : (
                                "Add Panelist"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={editPanelistOpen} onOpenChange={onEditPanelistOpenChange}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Edit Panelist Assignment</DialogTitle>
                        <DialogDescription>
                            Replace the currently assigned panelist for this slot.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-3 py-2">
                        <div className="rounded-md border bg-muted/30 p-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                Current Panelist
                            </p>
                            <p className="mt-1 font-medium">{editingPanelist?.name || "—"}</p>
                            <p className="text-sm text-muted-foreground">
                                {editingPanelist?.email || editingPanelist?.id || "—"}
                            </p>
                        </div>

                        {editPanelistOptions.length > 0 ? (
                            <div className="grid gap-2">
                                <Label htmlFor="replace-panelist-user">Replace With</Label>
                                <Select
                                    value={editPanelistUserId}
                                    onValueChange={setEditPanelistUserId}
                                >
                                    <SelectTrigger id="replace-panelist-user" className="w-full [&>span]:truncate">
                                        <SelectValue placeholder="Select replacement panelist" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {editPanelistOptions.map((user) => (
                                            <SelectItem
                                                key={user.id}
                                                value={user.id}
                                                textValue={`${user.name} ${user.email ?? ""}`}
                                            >
                                                <div className="flex flex-col">
                                                    <span className="truncate">{user.name}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {user.email || user.id}
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                                <p>No panelist users are available.</p>
                                <Button
                                    type="button"
                                    className="mt-3"
                                    variant="secondary"
                                    onClick={() => {
                                        onEditPanelistOpenChange(false)
                                        onOpenCreatePanelistUserDialog("assign", { forceAssign: true })
                                    }}
                                >
                                    <UserPlus className="mr-2 h-4 w-4" />
                                    Create Panelist User
                                </Button>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => onEditPanelistOpenChange(false)}
                            disabled={editPanelistBusy}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void onUpdatePanelist()}
                            disabled={
                                editPanelistBusy ||
                                !editingPanelist ||
                                !editPanelistUserId ||
                                editPanelistUserId === editingPanelist.id
                            }
                        >
                            {editPanelistBusy ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Updating...
                                </>
                            ) : (
                                "Save Assignment"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={createPanelistUserOpen} onOpenChange={onCreatePanelistUserOpenChange}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Create Panelist User</DialogTitle>
                        <DialogDescription>
                            Create a new user with the panelist role and optionally assign to this schedule.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-2">
                        <div className="grid gap-2">
                            <Label htmlFor="create-panelist-name">Name</Label>
                            <Input
                                id="create-panelist-name"
                                placeholder="e.g. Prof. Jane Doe"
                                value={createPanelistName}
                                onChange={(e) => setCreatePanelistName(e.target.value)}
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="create-panelist-email">Email</Label>
                            <Input
                                id="create-panelist-email"
                                type="email"
                                placeholder="e.g. jane.panelist@example.com"
                                value={createPanelistEmail}
                                onChange={(e) => setCreatePanelistEmail(e.target.value)}
                                autoComplete="off"
                            />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                                <Label>Status</Label>
                                <Select
                                    value={String(createPanelistStatus)}
                                    onValueChange={(value) => setCreatePanelistStatus(value as UserStatus)}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {createPanelistStatuses.map((status) => (
                                            <SelectItem key={status} value={status}>
                                                {toTitleCase(status)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {scheduleExists && !createPanelistForceAssign ? (
                                <div className="grid gap-2">
                                    <Label>After Create</Label>
                                    <Select
                                        value={createPanelistAssignMode}
                                        onValueChange={(value) =>
                                            setCreatePanelistAssignMode(
                                                value === "directory" ? "directory" : "assign",
                                            )
                                        }
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select action" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="assign">Create and assign now</SelectItem>
                                            <SelectItem value="directory">Create only</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            ) : null}
                        </div>

                        {scheduleExists && createPanelistForceAssign ? (
                            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                                This user will be created and automatically assigned to the current defense schedule.
                            </div>
                        ) : null}

                        <p className="text-xs text-muted-foreground">
                            The new account role will be set to{" "}
                            <span className="font-medium">Panelist</span>. Login details will be sent to the email.
                        </p>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => onCreatePanelistUserOpenChange(false)}
                            disabled={createPanelistBusy}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void onCreatePanelistUser()}
                            disabled={createPanelistBusy}
                        >
                            {createPanelistBusy ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating...
                                </>
                            ) : createPanelistForceAssign ? (
                                "Create & Add Panelist"
                            ) : (
                                "Create Panelist User"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={removePanelistOpen} onOpenChange={onRemovePanelistOpenChange}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove panelist from this schedule?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {removingPanelist
                                ? `This will remove ${removingPanelist.name} from the panel list of this defense schedule.`
                                : "This will remove the selected panelist from this schedule."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={removePanelistBusy}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={removePanelistBusy}
                            onClick={(e) => {
                                e.preventDefault()
                                void onRemovePanelist()
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {removePanelistBusy ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Removing...
                                </>
                            ) : (
                                "Remove Panelist"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
