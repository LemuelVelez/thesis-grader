import * as React from "react"
import { Plus } from "lucide-react"

import {
    ADVISER_NONE_VALUE,
    CREATE_USER_STATUSES,
    SEMESTER_NONE_VALUE,
    SEMESTER_OTHER_VALUE,
    STANDARD_SEMESTERS,
    isDisabledStaff,
    sanitizeSelectValue,
    type StaffUserItem,
    type ThesisGroupFormState,
    type ThesisGroupListItem,
    type UserStatus,
} from "./thesis-group-utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

type FormSetter = React.Dispatch<React.SetStateAction<ThesisGroupFormState>>

type CreateThesisGroupDialogProps = {
    open: boolean
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
    submitting: boolean
    actionError: string | null
    setActionError: React.Dispatch<React.SetStateAction<string | null>>
    createForm: ThesisGroupFormState
    setCreateForm: FormSetter
    createTermPreview: string
    createAdviserSelectValue: string
    staffLoading: boolean
    staffUsers: StaffUserItem[]
    takenAdviserIds: Set<string>
    availableCreateStaff: StaffUserItem[]
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
    openCreateStaffDialog: () => void
    resetCreateForm: () => void
}

export function CreateThesisGroupDialog({
    open,
    setOpen,
    submitting,
    actionError,
    setActionError,
    createForm,
    setCreateForm,
    createTermPreview,
    createAdviserSelectValue,
    staffLoading,
    staffUsers,
    takenAdviserIds,
    availableCreateStaff,
    onSubmit,
    openCreateStaffDialog,
    resetCreateForm,
}: CreateThesisGroupDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!submitting) setOpen(nextOpen)
                if (!nextOpen) {
                    resetCreateForm()
                    setActionError(null)
                }
            }}
        >
            <DialogContent className="sm:max-w-lg max-h-[82vh] p-0">
                <ScrollArea className="max-h-[82vh]">
                    <div className="p-6">
                        <DialogHeader>
                            <DialogTitle>Create Thesis Group</DialogTitle>
                            <DialogDescription>
                                Assign an adviser from Staff users and save thesis details.
                            </DialogDescription>
                        </DialogHeader>

                        <form onSubmit={onSubmit} className="mt-4 space-y-4">
                            {actionError ? (
                                <Alert variant="destructive">
                                    <AlertDescription>{actionError}</AlertDescription>
                                </Alert>
                            ) : null}

                            <div className="space-y-2">
                                <Label htmlFor="create-title">Thesis Title</Label>
                                <Input
                                    id="create-title"
                                    value={createForm.title}
                                    onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
                                    placeholder="Enter thesis title"
                                    autoComplete="off"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="create-program">Program</Label>
                                <Input
                                    id="create-program"
                                    value={createForm.program}
                                    onChange={(event) => setCreateForm((prev) => ({ ...prev, program: event.target.value }))}
                                    placeholder="e.g., BSIT"
                                    autoComplete="off"
                                />
                            </div>

                            <div className="rounded-lg border p-3 space-y-3">
                                <div className="space-y-2">
                                    <Label>Semester</Label>
                                    <Select
                                        value={createForm.semester}
                                        onValueChange={(value) =>
                                            setCreateForm((prev) => ({
                                                ...prev,
                                                semester: value,
                                                customSemester: value === SEMESTER_OTHER_VALUE ? prev.customSemester : "",
                                            }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select semester" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {STANDARD_SEMESTERS.map((semester) => (
                                                <SelectItem key={`create-sem-${semester}`} value={semester}>
                                                    {semester}
                                                </SelectItem>
                                            ))}
                                            <SelectItem value={SEMESTER_OTHER_VALUE}>Others (please specify)</SelectItem>
                                            <SelectItem value={SEMESTER_NONE_VALUE}>No term</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {createForm.semester === SEMESTER_OTHER_VALUE ? (
                                    <div className="space-y-2">
                                        <Label htmlFor="create-custom-semester">Specify Semester</Label>
                                        <Input
                                            id="create-custom-semester"
                                            value={createForm.customSemester}
                                            onChange={(event) =>
                                                setCreateForm((prev) => ({
                                                    ...prev,
                                                    customSemester: event.target.value,
                                                }))
                                            }
                                            placeholder="e.g., Midyear"
                                            autoComplete="off"
                                        />
                                    </div>
                                ) : null}

                                {createForm.semester !== SEMESTER_NONE_VALUE ? (
                                    <div className="space-y-2">
                                        <Label htmlFor="create-school-year-start">School Year (Start)</Label>
                                        <Input
                                            id="create-school-year-start"
                                            value={createForm.schoolYearStart}
                                            onChange={(event) =>
                                                setCreateForm((prev) => ({
                                                    ...prev,
                                                    schoolYearStart: event.target.value,
                                                }))
                                            }
                                            placeholder="e.g., 2026"
                                            inputMode="numeric"
                                            autoComplete="off"
                                        />
                                        <p className="text-xs text-muted-foreground">Example: 2026 will be saved as AY 2026-2027.</p>
                                    </div>
                                ) : null}

                                <div className="text-xs text-muted-foreground">
                                    Preview: <span className="font-medium">{createTermPreview}</span>
                                </div>
                            </div>

                            <div className="rounded-lg border p-3 space-y-3">
                                <div className="space-y-2">
                                    <Label>Adviser (Staff User)</Label>
                                    <Select
                                        value={createAdviserSelectValue}
                                        onValueChange={(value) =>
                                            setCreateForm((prev) => ({
                                                ...prev,
                                                adviserUserId: sanitizeSelectValue(value, ADVISER_NONE_VALUE),
                                            }))
                                        }
                                        disabled={staffLoading}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder={staffLoading ? "Loading staff users..." : "Select adviser"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={ADVISER_NONE_VALUE} disabled>
                                                No staff adviser selected
                                            </SelectItem>

                                            {staffUsers.map((staff) => {
                                                const taken = takenAdviserIds.has(staff.id)
                                                const disabledAccount = isDisabledStaff(staff)
                                                const disabled = taken || disabledAccount
                                                const suffix = taken ? " • Already assigned" : disabledAccount ? " • Disabled" : ""
                                                const label = staff.email
                                                    ? `${staff.name} (${staff.email})${suffix}`
                                                    : `${staff.name}${suffix}`

                                                return (
                                                    <SelectItem key={`create-adviser-${staff.id}`} value={staff.id} disabled={disabled}>
                                                        {label}
                                                    </SelectItem>
                                                )
                                            })}
                                        </SelectContent>
                                    </Select>

                                    {staffLoading ? (
                                        <p className="text-xs text-muted-foreground">Loading staff users…</p>
                                    ) : availableCreateStaff.length > 0 ? (
                                        <p className="text-xs text-muted-foreground">
                                            Select from available Staff users. Assigned/disabled staff are not selectable.
                                        </p>
                                    ) : (
                                        <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                                            <p className="text-xs text-amber-700">
                                                No available staff adviser right now. Create a Staff user to continue.
                                            </p>
                                            <Button type="button" size="sm" variant="secondary" onClick={openCreateStaffDialog}>
                                                <Plus className="mr-2 size-4" />
                                                Create Staff User
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={submitting}>
                                    {submitting ? "Creating..." : "Create Group"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}

type EditThesisGroupDialogProps = {
    open: boolean
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
    submitting: boolean
    actionError: string | null
    setActionError: React.Dispatch<React.SetStateAction<string | null>>
    editForm: ThesisGroupFormState
    setEditForm: FormSetter
    editTermPreview: string
    editAdviserSelectValue: string
    editAdviserRawValue: string | null
    selectedEditAdviserMissing: boolean
    staffLoading: boolean
    staffUsers: StaffUserItem[]
    availableEditStaff: StaffUserItem[]
    takenAdviserIdsForEdit: Set<string>
    editTarget: ThesisGroupListItem | null
    setEditTarget: React.Dispatch<React.SetStateAction<ThesisGroupListItem | null>>
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
    openCreateStaffDialog: () => void
}

export function EditThesisGroupDialog({
    open,
    setOpen,
    submitting,
    actionError,
    setActionError,
    editForm,
    setEditForm,
    editTermPreview,
    editAdviserSelectValue,
    editAdviserRawValue,
    selectedEditAdviserMissing,
    staffLoading,
    staffUsers,
    availableEditStaff,
    takenAdviserIdsForEdit,
    editTarget,
    setEditTarget,
    onSubmit,
    openCreateStaffDialog,
}: EditThesisGroupDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!submitting) setOpen(nextOpen)
                if (!nextOpen) {
                    setEditTarget(null)
                    setActionError(null)
                }
            }}
        >
            <DialogContent className="sm:max-w-lg max-h-[74vh] p-0">
                <ScrollArea className="max-h-[74vh]">
                    <div className="p-6">
                        <DialogHeader>
                            <DialogTitle>Edit Thesis Group</DialogTitle>
                            <DialogDescription>
                                Update thesis details and assign an available staff adviser with conflict protection.
                            </DialogDescription>
                        </DialogHeader>

                        <form onSubmit={onSubmit} className="mt-4 space-y-4">
                            {actionError ? (
                                <Alert variant="destructive">
                                    <AlertDescription>{actionError}</AlertDescription>
                                </Alert>
                            ) : null}

                            <div className="space-y-2">
                                <Label htmlFor="edit-title">Thesis Title</Label>
                                <Input
                                    id="edit-title"
                                    value={editForm.title}
                                    onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                                    placeholder="Enter thesis title"
                                    autoComplete="off"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="edit-program">Program</Label>
                                <Input
                                    id="edit-program"
                                    value={editForm.program}
                                    onChange={(event) => setEditForm((prev) => ({ ...prev, program: event.target.value }))}
                                    placeholder="e.g., BSIT"
                                    autoComplete="off"
                                />
                            </div>

                            <div className="rounded-lg border p-3 space-y-3">
                                <div className="space-y-2">
                                    <Label>Semester</Label>
                                    <Select
                                        value={editForm.semester}
                                        onValueChange={(value) =>
                                            setEditForm((prev) => ({
                                                ...prev,
                                                semester: value,
                                                customSemester: value === SEMESTER_OTHER_VALUE ? prev.customSemester : "",
                                            }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select semester" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {STANDARD_SEMESTERS.map((semester) => (
                                                <SelectItem key={`edit-sem-${semester}`} value={semester}>
                                                    {semester}
                                                </SelectItem>
                                            ))}
                                            <SelectItem value={SEMESTER_OTHER_VALUE}>Others (please specify)</SelectItem>
                                            <SelectItem value={SEMESTER_NONE_VALUE}>No term</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {editForm.semester === SEMESTER_OTHER_VALUE ? (
                                    <div className="space-y-2">
                                        <Label htmlFor="edit-custom-semester">Specify Semester</Label>
                                        <Input
                                            id="edit-custom-semester"
                                            value={editForm.customSemester}
                                            onChange={(event) =>
                                                setEditForm((prev) => ({
                                                    ...prev,
                                                    customSemester: event.target.value,
                                                }))
                                            }
                                            placeholder="e.g., Midyear"
                                            autoComplete="off"
                                        />
                                    </div>
                                ) : null}

                                {editForm.semester !== SEMESTER_NONE_VALUE ? (
                                    <div className="space-y-2">
                                        <Label htmlFor="edit-school-year-start">School Year (Start)</Label>
                                        <Input
                                            id="edit-school-year-start"
                                            value={editForm.schoolYearStart}
                                            onChange={(event) =>
                                                setEditForm((prev) => ({
                                                    ...prev,
                                                    schoolYearStart: event.target.value,
                                                }))
                                            }
                                            placeholder="e.g., 2026"
                                            inputMode="numeric"
                                            autoComplete="off"
                                        />
                                        <p className="text-xs text-muted-foreground">Example: 2026 will be saved as AY 2026-2027.</p>
                                    </div>
                                ) : null}

                                <div className="text-xs text-muted-foreground">
                                    Preview: <span className="font-medium">{editTermPreview}</span>
                                </div>
                            </div>

                            <div className="rounded-lg border p-3 space-y-3">
                                <div className="space-y-2">
                                    <Label>Adviser (Staff User)</Label>
                                    <Select
                                        value={editAdviserSelectValue}
                                        onValueChange={(value) =>
                                            setEditForm((prev) => ({
                                                ...prev,
                                                adviserUserId: sanitizeSelectValue(value, ADVISER_NONE_VALUE),
                                            }))
                                        }
                                        disabled={staffLoading}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder={staffLoading ? "Loading staff users..." : "Select adviser"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={ADVISER_NONE_VALUE} disabled>
                                                No staff adviser selected
                                            </SelectItem>

                                            {selectedEditAdviserMissing && editAdviserRawValue ? (
                                                <SelectItem value={editAdviserRawValue}>
                                                    Current assigned adviser (profile unavailable)
                                                </SelectItem>
                                            ) : null}

                                            {staffUsers.map((staff) => {
                                                const selected = editForm.adviserUserId === staff.id
                                                const takenByOtherGroup = takenAdviserIdsForEdit.has(staff.id)
                                                const disabledAccount = isDisabledStaff(staff)

                                                const disabled = takenByOtherGroup || (disabledAccount && !selected)

                                                const suffix = takenByOtherGroup
                                                    ? " • Already assigned"
                                                    : disabledAccount && !selected
                                                        ? " • Disabled"
                                                        : selected
                                                            ? " • Current"
                                                            : ""

                                                const label = staff.email
                                                    ? `${staff.name} (${staff.email})${suffix}`
                                                    : `${staff.name}${suffix}`

                                                return (
                                                    <SelectItem key={`edit-adviser-${staff.id}`} value={staff.id} disabled={disabled}>
                                                        {label}
                                                    </SelectItem>
                                                )
                                            })}
                                        </SelectContent>
                                    </Select>

                                    {staffLoading ? (
                                        <p className="text-xs text-muted-foreground">Loading staff users…</p>
                                    ) : availableEditStaff.length > 0 ? (
                                        <p className="text-xs text-muted-foreground">
                                            Assigned/disabled staff are disabled unless it is the current adviser.
                                        </p>
                                    ) : (
                                        <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                                            <p className="text-xs text-amber-700">
                                                No alternative available staff adviser. Create a Staff user if you need to reassign.
                                            </p>
                                            <Button type="button" size="sm" variant="secondary" onClick={openCreateStaffDialog}>
                                                <Plus className="mr-2 size-4" />
                                                Create Staff User
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={submitting}>
                                    {submitting ? "Saving..." : "Save Changes"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}

type CreateStaffUserDialogProps = {
    open: boolean
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
    creatingStaffUser: boolean
    createStaffError: string | null
    createStaffName: string
    setCreateStaffName: React.Dispatch<React.SetStateAction<string>>
    createStaffEmail: string
    setCreateStaffEmail: React.Dispatch<React.SetStateAction<string>>
    createStaffStatus: UserStatus
    setCreateStaffStatus: React.Dispatch<React.SetStateAction<UserStatus>>
    onSubmit: () => Promise<void>
    resetCreateStaffForm: () => void
}

export function CreateStaffUserDialog({
    open,
    setOpen,
    creatingStaffUser,
    createStaffError,
    createStaffName,
    setCreateStaffName,
    createStaffEmail,
    setCreateStaffEmail,
    createStaffStatus,
    setCreateStaffStatus,
    onSubmit,
    resetCreateStaffForm,
}: CreateStaffUserDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!creatingStaffUser) setOpen(nextOpen)
                if (!nextOpen) resetCreateStaffForm()
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Create Staff User</DialogTitle>
                    <DialogDescription>
                        A login credential email will be sent automatically after user creation.
                    </DialogDescription>
                </DialogHeader>

                <form
                    className="space-y-4"
                    onSubmit={(event) => {
                        event.preventDefault()
                        void onSubmit()
                    }}
                >
                    {createStaffError ? (
                        <Alert variant="destructive">
                            <AlertDescription>{createStaffError}</AlertDescription>
                        </Alert>
                    ) : null}

                    <div className="space-y-2">
                        <Label htmlFor="create-staff-name">Name</Label>
                        <Input
                            id="create-staff-name"
                            value={createStaffName}
                            onChange={(e) => setCreateStaffName(e.target.value)}
                            placeholder="e.g., Prof. Maria Santos"
                            autoComplete="off"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="create-staff-email">Email</Label>
                        <Input
                            id="create-staff-email"
                            type="email"
                            value={createStaffEmail}
                            onChange={(e) => setCreateStaffEmail(e.target.value)}
                            placeholder="e.g., maria.santos@example.edu"
                            autoComplete="off"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={createStaffStatus} onValueChange={(value) => setCreateStaffStatus(value as UserStatus)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                                {CREATE_USER_STATUSES.map((status) => (
                                    <SelectItem key={`staff-status-${status}`} value={status}>
                                        {status === "active" ? "Active" : "Disabled"}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={creatingStaffUser}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={creatingStaffUser}>
                            {creatingStaffUser ? "Creating..." : "Create Staff User"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

type DeleteThesisGroupDialogProps = {
    open: boolean
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
    submitting: boolean
    actionError: string | null
    setActionError: React.Dispatch<React.SetStateAction<string | null>>
    deleteTarget: ThesisGroupListItem | null
    setDeleteTarget: React.Dispatch<React.SetStateAction<ThesisGroupListItem | null>>
    onConfirm: () => Promise<void>
}

export function DeleteThesisGroupDialog({
    open,
    setOpen,
    submitting,
    actionError,
    setActionError,
    deleteTarget,
    setDeleteTarget,
    onConfirm,
}: DeleteThesisGroupDialogProps) {
    return (
        <AlertDialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!submitting) setOpen(nextOpen)
                if (!nextOpen) {
                    setDeleteTarget(null)
                    setActionError(null)
                }
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete thesis group?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone.{" "}
                        {deleteTarget ? (
                            <>
                                You are deleting <span className="font-medium">{deleteTarget.title}</span>.
                            </>
                        ) : null}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {actionError ? (
                    <Alert variant="destructive">
                        <AlertDescription>{actionError}</AlertDescription>
                    </Alert>
                ) : null}

                <AlertDialogFooter>
                    <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={submitting}
                        onClick={(event) => {
                            event.preventDefault()
                            void onConfirm()
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {submitting ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
