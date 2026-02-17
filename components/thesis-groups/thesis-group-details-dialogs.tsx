"use client"

import * as React from "react"
import { Plus } from "lucide-react"

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
import { Alert, AlertDescription } from "@/components/ui/alert"
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

import {
    type GroupMemberItem,
    type MemberDialogMode,
    type MemberFormState,
    type StudentUserItem,
    type UserStatus,
    STUDENT_NONE_VALUE,
} from "./thesis-group-details-types"
import {
    isMissingStudentProfileMessage,
    sanitizeStudentSelectValue,
    toTitleCase,
} from "./thesis-group-details-helpers"

type MemberDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    mode: MemberDialogMode
    submitting: boolean
    actionError: string | null
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void

    memberForm: MemberFormState
    setMemberForm: React.Dispatch<React.SetStateAction<MemberFormState>>
    normalizedMemberSelectValue: string
    availableStudentsForDialog: StudentUserItem[]
    selectedStudentMissing: boolean
    studentsLoading: boolean
    selectedStudentForMember: StudentUserItem | null
    selectedStudentNeedsProfile: boolean

    onOpenCreateStudentDialog: () => void
    onOpenCreateStudentProfileDialog: (student?: StudentUserItem | null) => void
}

type CreateStudentDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    submitting: boolean
    error: string | null

    name: string
    email: string
    status: UserStatus
    statusOptions: UserStatus[]

    setName: (value: string) => void
    setEmail: (value: string) => void
    setStatus: (value: UserStatus) => void
    onSubmit: () => Promise<void> | void
}

type StudentProfileDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    submitting: boolean
    error: string | null

    target: StudentUserItem | null
    program: string
    section: string
    setProgram: (value: string) => void
    setSection: (value: string) => void
    onSubmit: () => Promise<void> | void
}

type DeleteMemberDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    submitting: boolean
    error: string | null
    target: GroupMemberItem | null
    onConfirm: () => Promise<void> | void
}

type ThesisGroupDetailsDialogsProps = {
    memberDialog: MemberDialogProps
    createStudentDialog: CreateStudentDialogProps
    studentProfileDialog: StudentProfileDialogProps
    deleteMemberDialog: DeleteMemberDialogProps
}

export default function ThesisGroupDetailsDialogs({
    memberDialog,
    createStudentDialog,
    studentProfileDialog,
    deleteMemberDialog,
}: ThesisGroupDetailsDialogsProps) {
    const memberDialogTitle =
        memberDialog.mode === "create" ? "Add Thesis Group Member" : "Edit Thesis Group Member"

    const memberDialogDescription =
        memberDialog.mode === "create"
            ? "Select an existing Student user. If the user has no student profile yet, create it directly from this dialog."
            : "Update member assignment and optional profile details."

    return (
        <>
            <Dialog open={memberDialog.open} onOpenChange={memberDialog.onOpenChange}>
                <DialogContent className="max-h-[82vh] p-0 sm:max-w-xl">
                    <ScrollArea className="max-h-[82vh]">
                        <div className="p-6">
                            <DialogHeader>
                                <DialogTitle>{memberDialogTitle}</DialogTitle>
                                <DialogDescription>{memberDialogDescription}</DialogDescription>
                            </DialogHeader>

                            <form onSubmit={memberDialog.onSubmit} className="mt-4 space-y-4">
                                {memberDialog.actionError ? (
                                    <Alert variant="destructive">
                                        <AlertDescription>
                                            <div className="space-y-3">
                                                <p>{memberDialog.actionError}</p>

                                                {isMissingStudentProfileMessage(memberDialog.actionError) &&
                                                    memberDialog.selectedStudentForMember ? (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() =>
                                                            memberDialog.onOpenCreateStudentProfileDialog(
                                                                memberDialog.selectedStudentForMember
                                                            )
                                                        }
                                                    >
                                                        Create Student Profile
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </AlertDescription>
                                    </Alert>
                                ) : null}

                                {memberDialog.availableStudentsForDialog.length === 0 ? (
                                    <Alert>
                                        <AlertDescription>
                                            <div className="space-y-3">
                                                <p>No available student users right now. Create a Student user first.</p>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={memberDialog.onOpenCreateStudentDialog}
                                                >
                                                    <Plus className="mr-2 size-4" />
                                                    Create Student User
                                                </Button>
                                            </div>
                                        </AlertDescription>
                                    </Alert>
                                ) : null}

                                <div className="space-y-2">
                                    <Label>Student User</Label>
                                    <Select
                                        value={memberDialog.normalizedMemberSelectValue}
                                        onValueChange={(value) =>
                                            memberDialog.setMemberForm((prev) => ({
                                                ...prev,
                                                studentUserId: sanitizeStudentSelectValue(value),
                                            }))
                                        }
                                        disabled={
                                            memberDialog.studentsLoading ||
                                            memberDialog.availableStudentsForDialog.length === 0
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue
                                                placeholder={
                                                    memberDialog.studentsLoading
                                                        ? "Loading student users..."
                                                        : "Select a student user"
                                                }
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={STUDENT_NONE_VALUE} disabled>
                                                No student selected
                                            </SelectItem>

                                            {memberDialog.selectedStudentMissing ? (
                                                <SelectItem value={memberDialog.normalizedMemberSelectValue}>
                                                    Current linked student (profile unavailable)
                                                </SelectItem>
                                            ) : null}

                                            {memberDialog.availableStudentsForDialog.map((student) => {
                                                const label = student.email
                                                    ? `${student.name} (${student.email})`
                                                    : student.name

                                                return (
                                                    <SelectItem
                                                        key={`student-option-${student.id}`}
                                                        value={student.id}
                                                    >
                                                        {label}
                                                    </SelectItem>
                                                )
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {memberDialog.selectedStudentNeedsProfile &&
                                    memberDialog.selectedStudentForMember ? (
                                    <Alert>
                                        <AlertDescription>
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <p>
                                                    Selected student has no profile yet. Create the student profile
                                                    to proceed.
                                                </p>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() =>
                                                        memberDialog.onOpenCreateStudentProfileDialog(
                                                            memberDialog.selectedStudentForMember
                                                        )
                                                    }
                                                >
                                                    Create Student Profile
                                                </Button>
                                            </div>
                                        </AlertDescription>
                                    </Alert>
                                ) : null}

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="member-program">Program (Optional)</Label>
                                        <Input
                                            id="member-program"
                                            value={memberDialog.memberForm.program}
                                            onChange={(event) =>
                                                memberDialog.setMemberForm((prev) => ({
                                                    ...prev,
                                                    program: event.target.value,
                                                }))
                                            }
                                            placeholder="e.g., BSIT"
                                            autoComplete="off"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="member-section">Section (Optional)</Label>
                                        <Input
                                            id="member-section"
                                            value={memberDialog.memberForm.section}
                                            onChange={(event) =>
                                                memberDialog.setMemberForm((prev) => ({
                                                    ...prev,
                                                    section: event.target.value,
                                                }))
                                            }
                                            placeholder="e.g., 4A"
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>

                                <DialogFooter>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => memberDialog.onOpenChange(false)}
                                        disabled={memberDialog.submitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={memberDialog.submitting}>
                                        {memberDialog.submitting
                                            ? memberDialog.mode === "create"
                                                ? "Adding..."
                                                : "Saving..."
                                            : memberDialog.mode === "create"
                                                ? "Add Member"
                                                : "Save Changes"}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            <Dialog open={createStudentDialog.open} onOpenChange={createStudentDialog.onOpenChange}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create Student User</DialogTitle>
                        <DialogDescription>
                            A login credential email will be sent automatically after user creation.
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        className="space-y-4"
                        onSubmit={(event) => {
                            event.preventDefault()
                            void createStudentDialog.onSubmit()
                        }}
                    >
                        {createStudentDialog.error ? (
                            <Alert variant="destructive">
                                <AlertDescription>{createStudentDialog.error}</AlertDescription>
                            </Alert>
                        ) : null}

                        <div className="space-y-2">
                            <Label htmlFor="create-student-name">Name</Label>
                            <Input
                                id="create-student-name"
                                value={createStudentDialog.name}
                                onChange={(event) => createStudentDialog.setName(event.target.value)}
                                placeholder="e.g., Juan Dela Cruz"
                                autoComplete="off"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="create-student-email">Email</Label>
                            <Input
                                id="create-student-email"
                                type="email"
                                value={createStudentDialog.email}
                                onChange={(event) => createStudentDialog.setEmail(event.target.value)}
                                placeholder="e.g., juan.delacruz@example.edu"
                                autoComplete="off"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select
                                value={createStudentDialog.status}
                                onValueChange={(value) =>
                                    createStudentDialog.setStatus(
                                        value === "disabled" ? "disabled" : "active"
                                    )
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    {createStudentDialog.statusOptions.map((status) => (
                                        <SelectItem key={`student-status-${status}`} value={status}>
                                            {toTitleCase(status)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => createStudentDialog.onOpenChange(false)}
                                disabled={createStudentDialog.submitting}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={createStudentDialog.submitting}>
                                {createStudentDialog.submitting ? "Creating..." : "Create Student User"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={studentProfileDialog.open} onOpenChange={studentProfileDialog.onOpenChange}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create Student Profile</DialogTitle>
                        <DialogDescription>
                            This creates the required student profile record so the user can be added as a
                            thesis-group member.
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        className="space-y-4"
                        onSubmit={(event) => {
                            event.preventDefault()
                            void studentProfileDialog.onSubmit()
                        }}
                    >
                        {studentProfileDialog.error ? (
                            <Alert variant="destructive">
                                <AlertDescription>{studentProfileDialog.error}</AlertDescription>
                            </Alert>
                        ) : null}

                        <div className="space-y-2">
                            <Label>Student User</Label>
                            <div className="rounded-md border bg-muted/40 p-3 text-sm">
                                <p className="font-medium">{studentProfileDialog.target?.name ?? "—"}</p>
                                {studentProfileDialog.target?.email ? (
                                    <p className="text-xs text-muted-foreground">
                                        {studentProfileDialog.target.email}
                                    </p>
                                ) : null}
                                {studentProfileDialog.target?.id ? (
                                    <p className="text-xs text-muted-foreground">
                                        User ID: {studentProfileDialog.target.id}
                                    </p>
                                ) : null}
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="create-profile-program">Program</Label>
                                <Input
                                    id="create-profile-program"
                                    value={studentProfileDialog.program}
                                    onChange={(event) => studentProfileDialog.setProgram(event.target.value)}
                                    placeholder="e.g., BSIT"
                                    autoComplete="off"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="create-profile-section">Section</Label>
                                <Input
                                    id="create-profile-section"
                                    value={studentProfileDialog.section}
                                    onChange={(event) => studentProfileDialog.setSection(event.target.value)}
                                    placeholder="e.g., 4A"
                                    autoComplete="off"
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => studentProfileDialog.onOpenChange(false)}
                                disabled={studentProfileDialog.submitting}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={studentProfileDialog.submitting}>
                                {studentProfileDialog.submitting ? "Creating..." : "Create Student Profile"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleteMemberDialog.open} onOpenChange={deleteMemberDialog.onOpenChange}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete thesis group member?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone.{" "}
                            {deleteMemberDialog.target ? (
                                <>
                                    You are deleting{" "}
                                    <span className="font-medium">
                                        {deleteMemberDialog.target.name ??
                                            deleteMemberDialog.target.studentId ??
                                            "this member"}
                                    </span>
                                    .
                                </>
                            ) : null}
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {deleteMemberDialog.error ? (
                        <Alert variant="destructive">
                            <AlertDescription>{deleteMemberDialog.error}</AlertDescription>
                        </Alert>
                    ) : null}

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMemberDialog.submitting}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                event.preventDefault()
                                void deleteMemberDialog.onConfirm()
                            }}
                            disabled={deleteMemberDialog.submitting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteMemberDialog.submitting ? "Deleting..." : "Delete Member"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
