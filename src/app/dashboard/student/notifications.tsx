/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react"
import { Link } from "react-router-dom"
import { AppSidebar } from "@/components/student-sidebar"
import { SiteHeader } from "@/components/site-header"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import {
    IconAlertCircle,
    IconBell,
    IconCheck,
    IconClock,
    IconFileDescription,
    IconMailShare,
} from "@tabler/icons-react"

type NotifType = "system" | "submission" | "schedule" | "results"

type Notif = {
    id: string
    type: NotifType
    title: string
    body: string
    createdAt: string // ISO
    read: boolean
    link?: string
}

const SEEDED: Notif[] = [
    {
        id: "n7",
        type: "results",
        title: "Results Released: Thesis Defense",
        body: "Your official grade and rubric breakdown are now available.",
        createdAt: "2025-10-02T18:46:00+08:00",
        read: false,
        link: "/dashboard/student/results",
    },
    {
        id: "n6",
        type: "system",
        title: "Privacy Policy Update",
        body: "We’ve clarified data retention for panel annotations.",
        createdAt: "2025-10-02T09:20:00+08:00",
        read: true,
    },
    {
        id: "n5",
        type: "submission",
        title: "Submission Received: Chapter 3 - Methodology",
        body: "We’ve queued your file for adviser review.",
        createdAt: "2025-10-01T16:10:00+08:00",
        read: true,
    },
    {
        id: "n4",
        type: "schedule",
        title: "Schedule Confirmed",
        body: "Your defense slot was confirmed for Oct 10, 1:00 PM at Room 301 (IT Bldg.).",
        createdAt: "2025-09-28T14:00:00+08:00",
        read: true,
    },
    {
        id: "n3",
        type: "submission",
        title: "Revisions Requested: Chapter 2",
        body: "Panel asks to tighten related works and reframe the gap statement.",
        createdAt: "2025-09-26T10:22:00+08:00",
        read: false,
    },
    {
        id: "n2",
        type: "schedule",
        title: "Reminder: Defense Tomorrow",
        body: "Arrive 15 minutes early. Bring 3 printed copies for panel annotations.",
        createdAt: "2025-09-25T16:30:00+08:00",
        read: true,
    },
    {
        id: "n1",
        type: "system",
        title: "Welcome to ThesisGrader",
        body: "Tip: Use ‘Submissions’ to manage your chapters and annexes.",
        createdAt: "2025-09-20T08:00:00+08:00",
        read: true,
    },
]

export default function StudentNotifications() {
    const [query, setQuery] = React.useState("")
    const [status, setStatus] = React.useState<"all" | "unread">("all")
    const [kind, setKind] = React.useState<"all" | NotifType>("all")
    const [items, setItems] = React.useState<Notif[]>(SEEDED)

    const filtered = items
        .filter((n) => (status === "unread" ? !n.read : true))
        .filter((n) => (kind === "all" ? true : n.type === kind))
        .filter((n) => {
            const hay = `${n.title} ${n.body}`.toLowerCase()
            return !query || hay.includes(query.toLowerCase())
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    function markAllRead() {
        setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    }

    function clearRead() {
        setItems((prev) => prev.filter((n) => !n.read))
    }

    function toggleRead(id: string) {
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n)))
    }

    function iconForType(t: NotifType) {
        switch (t) {
            case "system":
                return <IconMailShare className="size-4" />
            case "submission":
                return <IconFileDescription className="size-4" />
            case "schedule":
                return <IconClock className="size-4" />
            case "results":
                return <IconBell className="size-4" />
        }
    }

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="flex min-h-dvh flex-col">
                <SiteHeader />
                <main className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
                    {/* Page header */}
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                        <div>
                            <h1 className="text-xl font-semibold leading-tight sm:text-2xl">Notifications</h1>
                            <p className="text-muted-foreground text-sm">
                                Submission updates, schedule changes, and result releases.
                            </p>
                        </div>
                        {/* Buttons: vertical on mobile, horizontal on sm+ */}
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                            <Button asChild variant="outline" className="w-full cursor-pointer sm:w-auto">
                                <Link to="/dashboard/student">Back to Dashboard</Link>
                            </Button>
                            <Button asChild variant="outline" className="w-full cursor-pointer sm:w-auto">
                                <Link to="/dashboard/student/settings">Preferences</Link>
                            </Button>
                        </div>
                    </div>

                    {/* Controls */}
                    <Card>
                        {/* Stack controls on mobile, horizontal on sm+ */}
                        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <CardTitle className="text-base sm:text-lg">Inbox</CardTitle>
                                <CardDescription>Filter by status or type, or search by keyword.</CardDescription>
                            </div>
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                                {/* Status */}
                                <div className="flex w-full items-center gap-2 sm:w-auto">
                                    <Label htmlFor="status" className="sr-only">
                                        Status
                                    </Label>
                                    <Select value={status} onValueChange={(v) => setStatus(v as "all" | "unread")}>
                                        <SelectTrigger id="status" className="w-full cursor-pointer sm:w-36">
                                            <SelectValue placeholder="All" />
                                        </SelectTrigger>
                                        <SelectContent align="end">
                                            <SelectItem value="all">All</SelectItem>
                                            <SelectItem value="unread">Unread</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Type */}
                                <div className="flex w-full items-center gap-2 sm:w-auto">
                                    <Label htmlFor="type" className="sr-only">
                                        Type
                                    </Label>
                                    <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                                        <SelectTrigger id="type" className="w-full cursor-pointer sm:w-44">
                                            <SelectValue placeholder="All types" />
                                        </SelectTrigger>
                                        <SelectContent align="end">
                                            <SelectItem value="all">All types</SelectItem>
                                            <SelectItem value="submission">Submission</SelectItem>
                                            <SelectItem value="schedule">Schedule</SelectItem>
                                            <SelectItem value="results">Results</SelectItem>
                                            <SelectItem value="system">System</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Search */}
                                <div className="flex w-full items-center gap-2 sm:w-auto">
                                    <Label htmlFor="q" className="sr-only">
                                        Search
                                    </Label>
                                    <Input
                                        id="q"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Search notifications…"
                                        className="w-full sm:w-64"
                                    />
                                </div>

                                {/* Bulk actions: stack on mobile */}
                                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                                    <Button onClick={markAllRead} variant="outline" className="w-full cursor-pointer sm:w-auto">
                                        <IconCheck className="mr-2 size-4" />
                                        Mark all read
                                    </Button>
                                    <Button onClick={clearRead} variant="destructive" className="w-full cursor-pointer sm:w-auto">
                                        <IconAlertCircle className="mr-2 size-4" />
                                        Clear read
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <Separator />
                        <CardContent className="pt-4">
                            {/* Table: horizontal scroll on small screens */}
                            <div className="overflow-x-auto rounded-lg border">
                                <Table>
                                    <TableHeader className="bg-muted">
                                        <TableRow>
                                            <TableHead className="w-16">Type</TableHead>
                                            <TableHead>Title</TableHead>
                                            <TableHead>Message</TableHead>
                                            <TableHead className="whitespace-nowrap">Date</TableHead>
                                            <TableHead className="text-right">Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filtered.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                                                    No notifications match your filters.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filtered.map((n) => (
                                                <TableRow key={n.id} className="align-top">
                                                    <TableCell className="pt-4">{iconForType(n.type)}</TableCell>
                                                    <TableCell className="pt-4">
                                                        {n.link ? (
                                                            <Link to={n.link} className="underline underline-offset-2">
                                                                {n.title}
                                                            </Link>
                                                        ) : (
                                                            n.title
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="pt-4 text-muted-foreground">{n.body}</TableCell>
                                                    <TableCell className="whitespace-nowrap pt-4">
                                                        {new Date(n.createdAt).toLocaleString()}
                                                    </TableCell>
                                                    <TableCell className="pt-3 text-right">
                                                        {/* Row actions: vertical on mobile, horizontal on sm+ */}
                                                        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:justify-end">
                                                            {n.read ? (
                                                                <Badge variant="secondary" className="justify-center">Read</Badge>
                                                            ) : (
                                                                <Badge className="justify-center">Unread</Badge>
                                                            )}
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="w-full cursor-pointer sm:w-auto"
                                                                onClick={() => toggleRead(n.id)}
                                                            >
                                                                {n.read ? "Mark unread" : "Mark read"}
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

                    <div className="flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground">
                        <IconClock className="mt-0.5 size-4" />
                        <span>
                            Tip: You can change delivery channels (email/SMS/push) in{" "}
                            <Link to="/dashboard/student/settings" className="underline underline-offset-2">
                                Settings → Notifications
                            </Link>
                            .
                        </span>
                    </div>
                </main>
            </SidebarInset>
        </SidebarProvider>
    )
}
