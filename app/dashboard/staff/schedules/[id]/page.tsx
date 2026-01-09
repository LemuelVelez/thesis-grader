/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    ArrowLeft,
    ClipboardCopy,
    Loader2,
    MinusCircle,
    Plus,
    RefreshCw,
    Save,
    Trash2,
    Users,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type DefenseSchedule = {
    id: string
    group_id: string
    scheduled_at: string
    room: string | null
    status: string
    created_by: string | null
    created_at: string
    updated_at: string
}

type Panelist = {
    schedule_id: string
    staff_id: string
    staff_name: string
    staff_email: string
}

function formatDateTime(v: string) {
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return v
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(d)
}

function toDatetimeLocalValue(v: string) {
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return ""
    const pad = (n: number) => String(n).padStart(2, "0")
    const yyyy = d.getFullYear()
    const mm = pad(d.getMonth() + 1)
    const dd = pad(d.getDate())
    const hh = pad(d.getHours())
    const mi = pad(d.getMinutes())
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

function statusBadge(status: string) {
    const s = String(status || "").toLowerCase()
    if (s === "scheduled") return <Badge>Scheduled</Badge>
    if (s === "completed" || s === "done") return <Badge variant="secondary">Completed</Badge>
    if (s === "cancelled" || s === "canceled") return <Badge variant="destructive">Cancelled</Badge>
    if (s === "ongoing" || s === "in_progress") return <Badge variant="outline">Ongoing</Badge>
    return <Badge variant="outline">{status || "unknown"}</Badge>
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
        },
        cache: "no-store",
    })
    if (!res.ok) {
        const msg = await res.text().catch(() => "")
        throw new Error(msg || `Request failed (${res.status})`)
    }
    return (await res.json()) as T
}

export default function StaffScheduleDetailsPage() {
    const router = useRouter()
    const params = useParams<{ id: string }>()
    const id = String(params?.id ?? "")

    const { user, loading } = useAuth() as any

    const [busy, setBusy] = React.useState(false)
    const [schedule, setSchedule] = React.useState<DefenseSchedule | null>(null)
    const [panelists, setPanelists] = React.useState<Panelist[]>([])

    const [tab, setTab] = React.useState("details")

    // edit form
    const [saving, setSaving] = React.useState(false)
    const [scheduledAt, setScheduledAt] = React.useState("")
    const [room, setRoom] = React.useState("")
    const [status, setStatus] = React.useState("scheduled")

    // add panelist
    const [addOpen, setAddOpen] = React.useState(false)
    const [adding, setAdding] = React.useState(false)
    const [staffId, setStaffId] = React.useState("")

    React.useEffect(() => {
        if (!loading && (!user || user.role !== "staff")) {
            router.replace("/auth/login")
        }
    }, [loading, user, router])

    const load = React.useCallback(async () => {
        if (!id) return
        setBusy(true)
        try {
            const s = await apiJson<DefenseSchedule>(`/api/staff/defense-schedules/${id}`)
            setSchedule(s)

            setScheduledAt(toDatetimeLocalValue(s.scheduled_at))
            setRoom(s.room ?? "")
            setStatus(s.status ?? "scheduled")

            const p = await apiJson<Panelist[]>(`/api/staff/schedule-panelists?scheduleId=${encodeURIComponent(id)}`)
            setPanelists(Array.isArray(p) ? p : [])
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to load schedule")
            setSchedule(null)
            setPanelists([])
        } finally {
            setBusy(false)
        }
    }, [id])

    React.useEffect(() => {
        if (!loading && user?.role === "staff") load()
    }, [load, loading, user])

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text)
            toast.success("Copied")
        } catch {
            toast.error("Copy failed")
        }
    }

    const save = async () => {
        if (!id) return
        if (!scheduledAt.trim()) return toast.error("Scheduled at is required")

        setSaving(true)
        try {
            await apiJson(`/api/staff/defense-schedules/${id}`, {
                method: "PUT",
                body: JSON.stringify({
                    scheduled_at: scheduledAt,
                    room: room.trim() ? room.trim() : null,
                    status,
                }),
            })
            toast.success("Schedule updated")
            await load()
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to update schedule")
        } finally {
            setSaving(false)
        }
    }

    const removeSchedule = async () => {
        if (!id) return
        try {
            await apiJson(`/api/staff/defense-schedules/${id}`, { method: "DELETE" })
            toast.success("Schedule deleted")
            router.replace("/dashboard/staff/schedules")
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to delete schedule")
        }
    }

    const addPanelist = async () => {
        const sid = staffId.trim()
        if (!sid) return toast.error("Staff ID is required")

        setAdding(true)
        try {
            await apiJson(`/api/staff/schedule-panelists`, {
                method: "POST",
                body: JSON.stringify({
                    schedule_id: id,
                    staff_id: sid,
                }),
            })
            toast.success("Panelist added")
            setStaffId("")
            setAddOpen(false)
            const p = await apiJson<Panelist[]>(`/api/staff/schedule-panelists?scheduleId=${encodeURIComponent(id)}`)
            setPanelists(Array.isArray(p) ? p : [])
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to add panelist")
        } finally {
            setAdding(false)
        }
    }

    const removePanelist = async (staff_id: string) => {
        try {
            await apiJson(`/api/staff/schedule-panelists`, {
                method: "DELETE",
                body: JSON.stringify({ schedule_id: id, staff_id }),
            })
            toast.success("Panelist removed")
            const p = await apiJson<Panelist[]>(`/api/staff/schedule-panelists?scheduleId=${encodeURIComponent(id)}`)
            setPanelists(Array.isArray(p) ? p : [])
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to remove panelist")
        }
    }

    return (
        <DashboardLayout>
            <TooltipProvider>
                <div className="space-y-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" asChild>
                                    <Link href="/dashboard/staff/schedules" aria-label="Back">
                                        <ArrowLeft className="h-4 w-4" />
                                    </Link>
                                </Button>
                                <h1 className="text-xl font-semibold tracking-tight">Schedule Details</h1>
                            </div>

                            <p className="text-sm text-muted-foreground">
                                Manage schedule information and panelists.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={load} disabled={busy}>
                                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                Refresh
                            </Button>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" onClick={() => copy(id)}>
                                        <ClipboardCopy className="mr-2 h-4 w-4" />
                                        Copy ID
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copy schedule id</TooltipContent>
                            </Tooltip>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete schedule?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will permanently delete the schedule. This action cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            onClick={removeSchedule}
                                        >
                                            Delete
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>

                    {loading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-24 w-full" />
                            <Skeleton className="h-64 w-full" />
                        </div>
                    ) : !user || user.role !== "staff" ? (
                        <Alert variant="destructive">
                            <AlertTitle>Unauthorized</AlertTitle>
                            <AlertDescription>Please login as staff to access this page.</AlertDescription>
                        </Alert>
                    ) : !schedule ? (
                        <Alert variant="destructive">
                            <AlertTitle>Not found</AlertTitle>
                            <AlertDescription>Schedule not found or you don’t have access.</AlertDescription>
                        </Alert>
                    ) : (
                        <>
                            <div className="grid gap-4 lg:grid-cols-3">
                                <Card className="lg:col-span-2">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="flex items-center justify-between gap-3">
                                            <span className="truncate">Schedule</span>
                                            {statusBadge(schedule.status)}
                                        </CardTitle>
                                        <CardDescription className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                                            <span className="text-muted-foreground">Schedule ID:</span>
                                            <span className="font-medium text-foreground">{schedule.id}</span>
                                        </CardDescription>
                                    </CardHeader>

                                    <CardContent className="space-y-4">
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div className="rounded-md border p-3">
                                                <div className="text-xs text-muted-foreground">Group ID</div>
                                                <div className="mt-1 break-all text-sm font-medium">{schedule.group_id}</div>
                                            </div>

                                            <div className="rounded-md border p-3">
                                                <div className="text-xs text-muted-foreground">Scheduled</div>
                                                <div className="mt-1 text-sm font-medium">{formatDateTime(schedule.scheduled_at)}</div>
                                            </div>

                                            <div className="rounded-md border p-3">
                                                <div className="text-xs text-muted-foreground">Room</div>
                                                <div className="mt-1 text-sm font-medium">{schedule.room?.trim() ? schedule.room : "—"}</div>
                                            </div>

                                            <div className="rounded-md border p-3">
                                                <div className="text-xs text-muted-foreground">Updated</div>
                                                <div className="mt-1 text-sm font-medium">{formatDateTime(schedule.updated_at)}</div>
                                            </div>
                                        </div>

                                        <Separator />

                                        <Tabs value={tab} onValueChange={setTab} className="w-full">
                                            <TabsList className="grid w-full grid-cols-2">
                                                <TabsTrigger value="details">Details</TabsTrigger>
                                                <TabsTrigger value="panelists">Panelists</TabsTrigger>
                                            </TabsList>

                                            <TabsContent value="details" className="mt-4 space-y-4">
                                                <div className="grid gap-4 sm:grid-cols-2">
                                                    <div className="grid gap-2">
                                                        <Label htmlFor="scheduled_at">Scheduled at</Label>
                                                        <Input
                                                            id="scheduled_at"
                                                            type="datetime-local"
                                                            value={scheduledAt}
                                                            onChange={(e) => setScheduledAt(e.target.value)}
                                                        />
                                                    </div>

                                                    <div className="grid gap-2">
                                                        <Label htmlFor="room">Room</Label>
                                                        <Input
                                                            id="room"
                                                            value={room}
                                                            onChange={(e) => setRoom(e.target.value)}
                                                            placeholder="e.g., ICT Lab / Room 203"
                                                        />
                                                    </div>

                                                    <div className="grid gap-2 sm:col-span-2">
                                                        <Label>Status</Label>
                                                        <Select value={status} onValueChange={setStatus}>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select status" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="scheduled">scheduled</SelectItem>
                                                                <SelectItem value="ongoing">ongoing</SelectItem>
                                                                <SelectItem value="completed">completed</SelectItem>
                                                                <SelectItem value="cancelled">cancelled</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-end gap-2">
                                                    <Button variant="outline" onClick={load} disabled={busy || saving}>
                                                        <RefreshCw className="mr-2 h-4 w-4" />
                                                        Reload
                                                    </Button>
                                                    <Button onClick={save} disabled={saving}>
                                                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                                        Save changes
                                                    </Button>
                                                </div>
                                            </TabsContent>

                                            <TabsContent value="panelists" className="mt-4 space-y-4">
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Users className="h-4 w-4 text-muted-foreground" />
                                                        <div className="text-sm text-muted-foreground">
                                                            Panelists: <span className="font-medium text-foreground">{panelists.length}</span>
                                                        </div>
                                                    </div>

                                                    <Dialog open={addOpen} onOpenChange={setAddOpen}>
                                                        <DialogTrigger asChild>
                                                            <Button>
                                                                <Plus className="mr-2 h-4 w-4" />
                                                                Add panelist
                                                            </Button>
                                                        </DialogTrigger>
                                                        <DialogContent className="sm:max-w-md">
                                                            <DialogHeader>
                                                                <DialogTitle>Add panelist</DialogTitle>
                                                                <DialogDescription>
                                                                    Paste the staff user ID (UUID). (You can upgrade this later to a searchable staff picker.)
                                                                </DialogDescription>
                                                            </DialogHeader>

                                                            <div className="grid gap-2">
                                                                <Label htmlFor="staff_id">Staff ID</Label>
                                                                <Input
                                                                    id="staff_id"
                                                                    value={staffId}
                                                                    onChange={(e) => setStaffId(e.target.value)}
                                                                    placeholder="staff UUID"
                                                                />
                                                            </div>

                                                            <DialogFooter className="gap-2 sm:gap-0">
                                                                <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
                                                                    Cancel
                                                                </Button>
                                                                <Button onClick={addPanelist} disabled={adding}>
                                                                    {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                                                    Add
                                                                </Button>
                                                            </DialogFooter>
                                                        </DialogContent>
                                                    </Dialog>
                                                </div>

                                                <Card>
                                                    <CardHeader className="pb-2">
                                                        <CardTitle className="text-base">Panelists list</CardTitle>
                                                        <CardDescription>Remove panelists if needed.</CardDescription>
                                                    </CardHeader>
                                                    <CardContent>
                                                        {panelists.length === 0 ? (
                                                            <div className="py-10 text-center text-sm text-muted-foreground">No panelists assigned.</div>
                                                        ) : (
                                                            <ScrollArea className="h-80 rounded-md border">
                                                                <div className="p-3 space-y-2">
                                                                    {panelists.map((p) => (
                                                                        <div
                                                                            key={p.staff_id}
                                                                            className={cn(
                                                                                "flex items-center justify-between gap-3 rounded-md border bg-background p-3",
                                                                                "hover:bg-muted/40"
                                                                            )}
                                                                        >
                                                                            <div className="flex items-center gap-3">
                                                                                <Avatar className="h-9 w-9">
                                                                                    <AvatarFallback>
                                                                                        {(p.staff_name || "S").slice(0, 1).toUpperCase()}
                                                                                    </AvatarFallback>
                                                                                </Avatar>
                                                                                <div className="min-w-0">
                                                                                    <div className="truncate text-sm font-medium">{p.staff_name}</div>
                                                                                    <div className="truncate text-xs text-muted-foreground">{p.staff_email}</div>
                                                                                    <div className="mt-1 flex items-center gap-2">
                                                                                        <Badge variant="outline" className="text-[10px]">
                                                                                            {p.staff_id}
                                                                                        </Badge>
                                                                                        <Button
                                                                                            variant="ghost"
                                                                                            size="sm"
                                                                                            className="h-7 px-2"
                                                                                            onClick={() => copy(p.staff_id)}
                                                                                        >
                                                                                            <ClipboardCopy className="mr-1 h-3.5 w-3.5" />
                                                                                            Copy
                                                                                        </Button>
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <AlertDialog>
                                                                                <AlertDialogTrigger asChild>
                                                                                    <Button variant="outline" size="sm" className="shrink-0">
                                                                                        <MinusCircle className="mr-2 h-4 w-4" />
                                                                                        Remove
                                                                                    </Button>
                                                                                </AlertDialogTrigger>
                                                                                <AlertDialogContent>
                                                                                    <AlertDialogHeader>
                                                                                        <AlertDialogTitle>Remove panelist?</AlertDialogTitle>
                                                                                        <AlertDialogDescription>
                                                                                            This will remove <span className="font-medium">{p.staff_name}</span> from this schedule.
                                                                                        </AlertDialogDescription>
                                                                                    </AlertDialogHeader>
                                                                                    <AlertDialogFooter>
                                                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                                        <AlertDialogAction onClick={() => removePanelist(p.staff_id)}>
                                                                                            Remove
                                                                                        </AlertDialogAction>
                                                                                    </AlertDialogFooter>
                                                                                </AlertDialogContent>
                                                                            </AlertDialog>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </ScrollArea>
                                                        )}
                                                    </CardContent>
                                                </Card>
                                            </TabsContent>
                                        </Tabs>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-base">Quick actions</CardTitle>
                                        <CardDescription>Common actions for this schedule.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <Button className="w-full" onClick={() => setTab("panelists")}>
                                            <Users className="mr-2 h-4 w-4" />
                                            Manage panelists
                                        </Button>

                                        <Button className="w-full" variant="outline" onClick={() => setTab("details")}>
                                            <Save className="mr-2 h-4 w-4" />
                                            Edit details
                                        </Button>

                                        <Button className="w-full" variant="outline" onClick={() => copy(schedule.group_id)}>
                                            <ClipboardCopy className="mr-2 h-4 w-4" />
                                            Copy group id
                                        </Button>

                                        <Separator />

                                        <Alert>
                                            <AlertTitle>Note</AlertTitle>
                                            <AlertDescription>
                                                This page uses your existing staff APIs:
                                                <span className="block mt-1 text-xs text-muted-foreground">
                                                    /api/staff/defense-schedules/[id] and /api/staff/schedule-panelists
                                                </span>
                                            </AlertDescription>
                                        </Alert>
                                    </CardContent>
                                </Card>
                            </div>
                        </>
                    )}
                </div>
            </TooltipProvider>
        </DashboardLayout>
    )
}
