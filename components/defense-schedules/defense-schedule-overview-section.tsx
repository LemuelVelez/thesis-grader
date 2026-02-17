"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"

type DefenseScheduleStatus =
    | "scheduled"
    | "ongoing"
    | "completed"
    | "cancelled"
    | (string & {})

type DefenseScheduleLike = {
    id: string
    group_id: string
    scheduled_at: string
    room: string | null
    status: DefenseScheduleStatus
    created_at: string
    updated_at: string
}

type DefenseScheduleOverviewSectionProps = {
    schedule: DefenseScheduleLike
    resolvedGroupTitle: string
    resolvedRubricName: string
    resolvedCreatedBy: string
    resolvedCreatedBySubline: string | null
    statusActions: DefenseScheduleStatus[]
    busyStatus: DefenseScheduleStatus | null
    onSetStatus: (nextStatus: DefenseScheduleStatus) => void | Promise<void>
    formatDateTime: (value: string) => string
    toTitleCase: (value: string) => string
    statusBadgeClass: (status: DefenseScheduleStatus) => string
}

export function DefenseScheduleOverviewSection({
    schedule,
    resolvedGroupTitle,
    resolvedRubricName,
    resolvedCreatedBy,
    resolvedCreatedBySubline,
    statusActions,
    busyStatus,
    onSetStatus,
    formatDateTime,
    toTitleCase,
    statusBadgeClass,
}: DefenseScheduleOverviewSectionProps) {
    return (
        <div className="space-y-4">
            <Card className="shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1">
                            <CardDescription>Schedule ID</CardDescription>
                            <CardTitle className="text-base">{schedule.id}</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Updated: {formatDateTime(schedule.updated_at)}
                            </p>
                        </div>

                        <Badge variant="outline" className={statusBadgeClass(schedule.status)}>
                            {toTitleCase(schedule.status)}
                        </Badge>
                    </div>
                </CardHeader>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>Group</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1">
                        <p className="font-medium">{resolvedGroupTitle}</p>
                        {schedule.group_id ? (
                            <p className="text-sm text-muted-foreground">{schedule.group_id}</p>
                        ) : null}
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>Schedule</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1">
                        <p className="font-medium">{formatDateTime(schedule.scheduled_at)}</p>
                        <p className="text-sm text-muted-foreground">Room: {schedule.room || "TBA"}</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>Rubric Template</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="font-medium">{resolvedRubricName}</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>Created By</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1">
                        <p className="font-medium">{resolvedCreatedBy}</p>
                        {resolvedCreatedBySubline ? (
                            <p className="text-sm text-muted-foreground">{resolvedCreatedBySubline}</p>
                        ) : null}
                        <p className="text-sm text-muted-foreground">
                            Created: {formatDateTime(schedule.created_at)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card className="shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Update Status</CardTitle>
                    <CardDescription>Set the current defense progress state.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-2">
                        {statusActions.map((status) => {
                            const active = schedule.status === status
                            const disabled = !!busyStatus

                            return (
                                <Button
                                    key={status}
                                    size="sm"
                                    variant={active ? "default" : "outline"}
                                    disabled={disabled}
                                    onClick={() => void onSetStatus(status)}
                                >
                                    {busyStatus === status ? "Updating..." : toTitleCase(status)}
                                </Button>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
