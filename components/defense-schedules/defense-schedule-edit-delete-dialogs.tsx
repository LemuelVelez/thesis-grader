"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"

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
import { Calendar } from "@/components/ui/calendar"
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
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

type DefenseScheduleStatus =
    | "scheduled"
    | "ongoing"
    | "completed"
    | "cancelled"
    | (string & {})

type Meridiem = "AM" | "PM"

type ScheduleFormValues = {
    group_id: string
    scheduled_date: Date | undefined
    scheduled_hour: string
    scheduled_minute: string
    scheduled_period: Meridiem
    room: string
    status: DefenseScheduleStatus
    rubric_template_id: string
}

type ThesisGroupOption = {
    id: string
    title: string
}

type RubricTemplateOption = {
    id: string
    name: string
}

type DefenseScheduleEditDeleteDialogsProps = {
    editOpen: boolean
    onEditOpenChange: (open: boolean) => void
    editBusy: boolean
    editForm: ScheduleFormValues
    setEditForm: React.Dispatch<React.SetStateAction<ScheduleFormValues>>
    groupSelectOptions: ThesisGroupOption[]
    rubricSelectOptions: RubricTemplateOption[]
    metaLoading: boolean
    statusActions: DefenseScheduleStatus[]
    hourOptions: string[]
    minuteOptions: string[]
    rubricNoneValue: string
    toTitleCase: (value: string) => string
    formatCalendarDate: (value: Date) => string
    onSaveEdit: () => void | Promise<void>

    deleteOpen: boolean
    onDeleteOpenChange: (open: boolean) => void
    deleteBusy: boolean
    onDelete: () => void | Promise<void>
}

export function DefenseScheduleEditDeleteDialogs({
    editOpen,
    onEditOpenChange,
    editBusy,
    editForm,
    setEditForm,
    groupSelectOptions,
    rubricSelectOptions,
    metaLoading,
    statusActions,
    hourOptions,
    minuteOptions,
    rubricNoneValue,
    toTitleCase,
    formatCalendarDate,
    onSaveEdit,
    deleteOpen,
    onDeleteOpenChange,
    deleteBusy,
    onDelete,
}: DefenseScheduleEditDeleteDialogsProps) {
    return (
        <>
            <Dialog open={editOpen} onOpenChange={onEditOpenChange}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Edit Defense Schedule</DialogTitle>
                        <DialogDescription>
                            Update schedule details and save changes.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-2">
                        <div className="grid gap-2">
                            <Label htmlFor="edit_group_id">Thesis Group</Label>
                            {groupSelectOptions.length > 0 ? (
                                <Select
                                    value={editForm.group_id}
                                    onValueChange={(value) =>
                                        setEditForm((prev) => ({ ...prev, group_id: value }))
                                    }
                                >
                                    <SelectTrigger id="edit_group_id" className="w-full [&>span]:truncate">
                                        <SelectValue placeholder={metaLoading ? "Loading groups..." : "Select a group"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {groupSelectOptions.map((group) => (
                                            <SelectItem key={group.id} value={group.id} textValue={group.title}>
                                                <span className="block max-w-130 truncate" title={group.title}>
                                                    {group.title}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    id="edit_group_id"
                                    placeholder="Enter thesis group UUID"
                                    value={editForm.group_id}
                                    onChange={(e) =>
                                        setEditForm((prev) => ({ ...prev, group_id: e.target.value }))
                                    }
                                />
                            )}
                        </div>

                        <div className="grid gap-2">
                            <Label>Schedule Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className={[
                                            "w-full justify-start text-left font-normal",
                                            !editForm.scheduled_date ? "text-muted-foreground" : "",
                                        ].join(" ")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {editForm.scheduled_date
                                            ? formatCalendarDate(editForm.scheduled_date)
                                            : "Pick a date"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={editForm.scheduled_date}
                                        onSelect={(date) =>
                                            setEditForm((prev) => ({
                                                ...prev,
                                                scheduled_date: date ?? undefined,
                                            }))
                                        }
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="grid gap-2">
                            <Label>Schedule Time</Label>
                            <div className="grid grid-cols-3 gap-2">
                                <Select
                                    value={editForm.scheduled_hour}
                                    onValueChange={(value) =>
                                        setEditForm((prev) => ({ ...prev, scheduled_hour: value }))
                                    }
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Hour" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {hourOptions.map((hour) => (
                                            <SelectItem key={hour} value={hour}>
                                                {hour}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={editForm.scheduled_minute}
                                    onValueChange={(value) =>
                                        setEditForm((prev) => ({ ...prev, scheduled_minute: value }))
                                    }
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Minute" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {minuteOptions.map((minute) => (
                                            <SelectItem key={minute} value={minute}>
                                                {minute}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={editForm.scheduled_period}
                                    onValueChange={(value) =>
                                        setEditForm((prev) => ({
                                            ...prev,
                                            scheduled_period: value as Meridiem,
                                        }))
                                    }
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="AM/PM" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="AM">AM</SelectItem>
                                        <SelectItem value="PM">PM</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="edit_room">Room</Label>
                            <Input
                                id="edit_room"
                                placeholder="e.g. CCS Faculty Office or AVR 1"
                                value={editForm.room}
                                onChange={(e) =>
                                    setEditForm((prev) => ({ ...prev, room: e.target.value }))
                                }
                            />
                        </div>

                        <div className="grid gap-2 md:grid-cols-2 md:gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="edit_status">Status</Label>
                                <Select
                                    value={editForm.status}
                                    onValueChange={(value) =>
                                        setEditForm((prev) => ({ ...prev, status: value as DefenseScheduleStatus }))
                                    }
                                >
                                    <SelectTrigger id="edit_status" className="w-full [&>span]:truncate">
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {statusActions.map((status) => (
                                            <SelectItem key={status} value={status}>
                                                {toTitleCase(status)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="edit_rubric_template_id">Rubric Template</Label>
                                {rubricSelectOptions.length > 0 ? (
                                    <Select
                                        value={editForm.rubric_template_id || rubricNoneValue}
                                        onValueChange={(value) =>
                                            setEditForm((prev) => ({
                                                ...prev,
                                                rubric_template_id: value === rubricNoneValue ? "" : value,
                                            }))
                                        }
                                    >
                                        <SelectTrigger id="edit_rubric_template_id" className="w-full [&>span]:truncate">
                                            <SelectValue placeholder={metaLoading ? "Loading rubrics..." : "Select rubric"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={rubricNoneValue}>None</SelectItem>
                                            {rubricSelectOptions.map((rubric) => (
                                                <SelectItem key={rubric.id} value={rubric.id} textValue={rubric.name}>
                                                    <span className="block max-w-50 truncate" title={rubric.name}>
                                                        {rubric.name}
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Input
                                        id="edit_rubric_template_id"
                                        placeholder="Optional rubric template UUID"
                                        value={editForm.rubric_template_id}
                                        onChange={(e) =>
                                            setEditForm((prev) => ({ ...prev, rubric_template_id: e.target.value }))
                                        }
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => onEditOpenChange(false)} disabled={editBusy}>
                            Cancel
                        </Button>
                        <Button onClick={() => void onSaveEdit()} disabled={editBusy}>
                            {editBusy ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleteOpen} onOpenChange={onDeleteOpenChange}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete defense schedule?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone and will permanently remove this schedule.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={deleteBusy}
                            onClick={(e) => {
                                e.preventDefault()
                                void onDelete()
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteBusy ? "Deleting..." : "Delete Schedule"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
