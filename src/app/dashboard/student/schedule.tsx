// src/app/dashboard/student/schedule.tsx
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
    IconCalendarEvent,
    IconClock,
    IconMapPin,
    IconCheck,
    IconAlertCircle,
} from "@tabler/icons-react"

type Slot = {
    id: string
    date: string // ISO date string (YYYY-MM-DD)
    time: string // "HH:MM"
    location: string
    capacity: number
    seatsLeft: number
}

type Booking = {
    id: string
    slotId: string
    title: string
    status: "Pending" | "Confirmed" | "Completed" | "Cancelled"
}

// Helper: convert "HH:MM" (24h) -> "h:MM AM/PM"
function to12h(time24: string) {
    const [hStr, mStr] = time24.split(":")
    let h = parseInt(hStr, 10)
    const suffix = h >= 12 ? "PM" : "AM"
    h = h % 12
    if (h === 0) h = 12
    return `${h}:${mStr} ${suffix}`
}

const seededSlots: Slot[] = [
    { id: "oct-10-1", date: "2025-10-10", time: "09:00", location: "Room 301 (IT Bldg.)", capacity: 5, seatsLeft: 3 },
    { id: "oct-10-2", date: "2025-10-10", time: "13:00", location: "Room 301 (IT Bldg.)", capacity: 5, seatsLeft: 2 },
    { id: "oct-16-1", date: "2025-10-16", time: "10:00", location: "Dean’s Office", capacity: 4, seatsLeft: 1 },
    { id: "oct-21-1", date: "2025-10-21", time: "15:00", location: "Room 205 (Main)", capacity: 6, seatsLeft: 5 },
    { id: "nov-05-1", date: "2025-11-05", time: "09:30", location: "Room 205 (Main)", capacity: 6, seatsLeft: 6 },
]

export default function StudentSchedule() {
    const [q, setQ] = React.useState("")
    const [date, setDate] = React.useState<string>("2025-10-10")
    const [slotId, setSlotId] = React.useState<string>("")
    const [note, setNote] = React.useState<string>("")
    const [banner, setBanner] = React.useState<{ kind: "success" | "warn" | "none"; text?: string }>({ kind: "none" })

    const [bookings, setBookings] = React.useState<Booking[]>([
        {
            id: "b-1",
            slotId: "oct-10-2",
            title: "Initial Proposal Defense",
            status: "Pending",
        },
    ])

    const myNextBooking = React.useMemo(() => {
        const upcoming = bookings
            .map((b) => ({ b, slot: seededSlots.find((s) => s.id === b.slotId)! }))
            .filter(({ slot }) => !!slot)
            .sort((a, b) => a.slot.date.localeCompare(b.slot.date) || a.slot.time.localeCompare(b.slot.time))[0]
        return upcoming
    }, [bookings])

    const visibleSlots = React.useMemo(() => {
        return seededSlots
            .filter((s) => (!date || s.date === date))
            .filter((s) => {
                const hay = `${s.location} ${s.time} ${to12h(s.time)}`.toLowerCase()
                return !q || hay.includes(q.toLowerCase())
            })
    }, [q, date])

    function handleBook() {
        if (!slotId) {
            setBanner({ kind: "warn", text: "Please select an available slot before booking." })
            return
        }
        const slot = seededSlots.find((s) => s.id === slotId)
        if (!slot) return
        if (slot.seatsLeft < 1) {
            setBanner({ kind: "warn", text: "Selected slot is full. Please choose another." })
            return
        }
        const newBooking: Booking = {
            id: `b-${Math.random().toString(36).slice(2, 8)}`,
            slotId,
            title: note?.trim() ? note.trim() : "Thesis Defense",
            status: "Pending",
        }
        setBookings((prev) => [newBooking, ...prev])
        setBanner({ kind: "success", text: "Slot booked! Await confirmation from the coordinator." })
        setNote("")
        setSlotId("")
    }

    function statusBadge(status: Booking["status"]) {
        const map: Record<Booking["status"], React.ReactNode> = {
            Pending: <Badge variant="secondary">Pending</Badge>,
            Confirmed: <Badge variant="outline">Confirmed</Badge>,
            Completed: <Badge>Completed</Badge>,
            Cancelled: <Badge variant="destructive">Cancelled</Badge>,
        }
        return map[status]
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
                            <h1 className="text-xl font-semibold leading-tight sm:text-2xl">Schedule</h1>
                            <p className="text-muted-foreground text-sm">
                                View available defense slots, book a schedule, and track confirmations.
                            </p>
                        </div>
                        {/* Buttons: vertical on mobile, horizontal on sm+ */}
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                            <Button asChild variant="outline" className="w-full cursor-pointer sm:w-auto">
                                <Link to="/dashboard/student">Back to Dashboard</Link>
                            </Button>
                        </div>
                    </div>

                    {/* Summary (already vertical on mobile) */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Card>
                            <CardHeader className="flex flex-row items-start justify-between space-y-0">
                                <div className="flex items-center gap-2">
                                    <div className="rounded-lg border bg-muted/40 p-2">
                                        <IconCalendarEvent className="size-5" />
                                    </div>
                                    <CardTitle className="text-sm font-medium">Next Milestone</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {myNextBooking ? (
                                    <>
                                        <div className="text-2xl font-bold">
                                            {new Date(myNextBooking.slot.date).toLocaleDateString()} @ {to12h(myNextBooking.slot.time)}
                                        </div>
                                        <p className="text-muted-foreground mt-1 text-xs">
                                            {myNextBooking.b.title} — {myNextBooking.slot.location}
                                        </p>
                                    </>
                                ) : (
                                    <div className="text-muted-foreground text-sm">No upcoming bookings.</div>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-start justify-between space-y-0">
                                <div className="flex items-center gap-2">
                                    <div className="rounded-lg border bg-muted/40 p-2">
                                        <IconCheck className="size-5" />
                                    </div>
                                    <CardTitle className="text-sm font-medium">Booking Status</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {bookings.filter((b) => b.status === "Pending").length} pending
                                </div>
                                <p className="text-muted-foreground mt-1 text-xs">Coordinator confirmation required.</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Book a slot */}
                    <Card>
                        {/* Header: stack search below title on mobile */}
                        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <CardTitle className="text-base sm:text-lg">Book a Defense Slot</CardTitle>
                                <CardDescription>Select a date and time, then submit your booking request.</CardDescription>
                            </div>
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                                <div className="flex w-full items-center gap-2 sm:w-auto">
                                    <Label htmlFor="search" className="sr-only">Search</Label>
                                    <Input
                                        id="search"
                                        placeholder="Search by room or time…"
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        className="w-full sm:w-56"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <Separator />
                        <CardContent className="space-y-4 pt-4">
                            {banner.kind !== "none" && (
                                <div
                                    className={`flex items-start gap-2 rounded-md border p-3 text-sm ${banner.kind === "success"
                                        ? "border-green-600/30 bg-green-600/10"
                                        : "border-amber-600/30 bg-amber-600/10"
                                        }`}
                                >
                                    {banner.kind === "success" ? (
                                        <IconCheck className="mt-0.5 size-4" />
                                    ) : (
                                        <IconAlertCircle className="mt-0.5 size-4" />
                                    )}
                                    <span>{banner.text}</span>
                                </div>
                            )}

                            {/* Inputs grid: single column on mobile, 3 cols on sm+ */}
                            <div className="grid gap-4 sm:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="date">Date</Label>
                                    <Select value={date} onValueChange={setDate}>
                                        <SelectTrigger id="date" className="cursor-pointer w-full">
                                            <SelectValue placeholder="Select date" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {[...new Set(seededSlots.map((s) => s.date))].map((d) => (
                                                <SelectItem key={d} value={d}>
                                                    {new Date(d).toLocaleDateString()}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="slot">Time Slot</Label>
                                    <Select value={slotId} onValueChange={setSlotId}>
                                        <SelectTrigger id="slot" className="cursor-pointer w-full">
                                            <SelectValue placeholder="Select time slot" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {visibleSlots.map((s) => (
                                                <SelectItem key={s.id} value={s.id} disabled={s.seatsLeft < 1}>
                                                    {to12h(s.time)} — {s.location} ({s.seatsLeft}/{s.capacity})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="note">Purpose/Note (optional)</Label>
                                    <Input
                                        id="note"
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        placeholder="e.g., Final Defense"
                                        className="w-full"
                                    />
                                </div>
                            </div>

                            {/* Primary action: full width on mobile */}
                            <div className="flex w-full flex-col sm:w-auto sm:flex-row sm:justify-end">
                                <Button onClick={handleBook} className="w-full cursor-pointer sm:w-auto">
                                    <IconClock className="mr-2 size-4" />
                                    Book Slot
                                </Button>
                            </div>

                            {/* Bookings table: enable horizontal scroll on small screens */}
                            <div className="overflow-x-auto rounded-lg border">
                                <Table>
                                    <TableHeader className="bg-muted">
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Time</TableHead>
                                            <TableHead className="min-w-32">Location</TableHead>
                                            <TableHead>Title</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {bookings.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                                                    You have no bookings yet.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            bookings.map((b) => {
                                                const s = seededSlots.find((x) => x.id === b.slotId)
                                                if (!s) return null
                                                return (
                                                    <TableRow key={b.id}>
                                                        <TableCell>{new Date(s.date).toLocaleDateString()}</TableCell>
                                                        <TableCell className="whitespace-nowrap">{to12h(s.time)}</TableCell>
                                                        <TableCell className="flex items-center gap-2 whitespace-nowrap">
                                                            <IconMapPin className="size-4" />
                                                            {s.location}
                                                        </TableCell>
                                                        <TableCell>{b.title}</TableCell>
                                                        <TableCell className="whitespace-nowrap">{statusBadge(b.status)}</TableCell>
                                                    </TableRow>
                                                )
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </main>
            </SidebarInset>
        </SidebarProvider>
    )
}
