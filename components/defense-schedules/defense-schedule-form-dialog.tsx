"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"

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

type ThesisGroupOption = {
    id: string
    title: string
}

type RubricTemplateOption = {
    id: string
    name: string
}

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

type DefenseScheduleFormDialogProps = {
    open: boolean
    mode: "create" | "edit"
    submitting: boolean
    metaLoading: boolean
    formValues: ScheduleFormValues
    setFormValues: React.Dispatch<React.SetStateAction<ScheduleFormValues>>
    groupSelectOptions: ThesisGroupOption[]
    rubricSelectOptions: RubricTemplateOption[]
    statusOptions: DefenseScheduleStatus[]
    hourOptions: string[]
    minuteOptions: string[]
    rubricNoneValue: string
    formatCalendarDate: (value: Date) => string
    onOpenChange: (open: boolean) => void
    onCancel: () => void
    onSubmit: () => void
}

function toTitleCase(value: string): string {
    if (!value) return ""
    return value.charAt(0).toUpperCase() + value.slice(1)
}

export function DefenseScheduleFormDialog({
    open,
    mode,
    submitting,
    metaLoading,
    formValues,
    setFormValues,
    groupSelectOptions,
    rubricSelectOptions,
    statusOptions,
    hourOptions,
    minuteOptions,
    rubricNoneValue,
    formatCalendarDate,
    onOpenChange,
    onCancel,
    onSubmit,
}: DefenseScheduleFormDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {mode === "create" ? "Create Defense Schedule" : "Edit Defense Schedule"}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === "create"
                            ? "Set up a defense schedule for a thesis group."
                            : "Update the selected defense schedule details."}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                        <Label htmlFor="group_id">Thesis Group</Label>
                        {groupSelectOptions.length > 0 ? (
                            <Select
                                value={formValues.group_id}
                                onValueChange={(value) =>
                                    setFormValues((prev) => ({ ...prev, group_id: value }))
                                }
                            >
                                <SelectTrigger id="group_id" className="w-full [&>span]:truncate">
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
                                id="group_id"
                                placeholder="Enter thesis group UUID"
                                value={formValues.group_id}
                                onChange={(e) =>
                                    setFormValues((prev) => ({ ...prev, group_id: e.target.value }))
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
                                        !formValues.scheduled_date ? "text-muted-foreground" : "",
                                    ].join(" ")}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {formValues.scheduled_date
                                        ? formatCalendarDate(formValues.scheduled_date)
                                        : "Pick a date"}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={formValues.scheduled_date}
                                    onSelect={(date) =>
                                        setFormValues((prev) => ({
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
                                value={formValues.scheduled_hour}
                                onValueChange={(value) =>
                                    setFormValues((prev) => ({ ...prev, scheduled_hour: value }))
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
                                value={formValues.scheduled_minute}
                                onValueChange={(value) =>
                                    setFormValues((prev) => ({ ...prev, scheduled_minute: value }))
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
                                value={formValues.scheduled_period}
                                onValueChange={(value) =>
                                    setFormValues((prev) => ({
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
                        <Label htmlFor="room">Room</Label>
                        <Input
                            id="room"
                            placeholder="e.g. CCS Faculty Office or AVR 1"
                            value={formValues.room}
                            onChange={(e) =>
                                setFormValues((prev) => ({ ...prev, room: e.target.value }))
                            }
                        />
                    </div>

                    <div className="grid gap-2 md:grid-cols-2 md:gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="status">Status</Label>
                            <Select
                                value={formValues.status}
                                onValueChange={(value) =>
                                    setFormValues((prev) => ({ ...prev, status: value as DefenseScheduleStatus }))
                                }
                            >
                                <SelectTrigger id="status" className="w-full [&>span]:truncate">
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    {statusOptions.map((status) => (
                                        <SelectItem key={status} value={status}>
                                            {toTitleCase(status)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="rubric_template_id">Rubric Template</Label>
                            {rubricSelectOptions.length > 0 ? (
                                <Select
                                    value={formValues.rubric_template_id || rubricNoneValue}
                                    onValueChange={(value) =>
                                        setFormValues((prev) => ({
                                            ...prev,
                                            rubric_template_id: value === rubricNoneValue ? "" : value,
                                        }))
                                    }
                                >
                                    <SelectTrigger id="rubric_template_id" className="w-full [&>span]:truncate">
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
                                    id="rubric_template_id"
                                    placeholder="Optional rubric template UUID"
                                    value={formValues.rubric_template_id}
                                    onChange={(e) =>
                                        setFormValues((prev) => ({
                                            ...prev,
                                            rubric_template_id: e.target.value,
                                        }))
                                    }
                                />
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onCancel} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button onClick={onSubmit} disabled={submitting}>
                        {submitting
                            ? mode === "create"
                                ? "Creating..."
                                : "Saving..."
                            : mode === "create"
                                ? "Create Schedule"
                                : "Save Changes"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
