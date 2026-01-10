/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    ArrowLeft,
    ChevronDown,
    ClipboardCopy,
    Loader2,
    MinusCircle,
    Plus,
    RefreshCw,
    Save,
    Search,
    Trash2,
    Users,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"
import { useApi } from "@/hooks/use-api"
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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type DefenseSchedule = {
    id: string
    groupId: string
    scheduledAt: string
    room: string | null
    status: string
    createdBy: string | null
    createdAt: string
    updatedAt: string
}

type Panelist = {
    scheduleId: string
    staffId: string
    staffName: string
    staffEmail: string
}

type ScheduleGetOk = { ok: true; schedule: DefenseSchedule }
type ScheduleGetErr = { ok: false; message?: string }
type ScheduleGetResponse = ScheduleGetOk | ScheduleGetErr

type PanelistsGetOk = { ok: true; panelists: Panelist[] }
type PanelistsGetErr = { ok: false; message?: string }
type PanelistsGetResponse = PanelistsGetOk | PanelistsGetErr

type ThesisGroupOption = {
    id: string
    title: string
    program?: string | null
    term?: string | null
}

type ThesisGroupByIdOk = { ok: true; group: any }
type ThesisGroupByIdErr = { ok: false; message?: string }
type ThesisGroupByIdResponse = ThesisGroupByIdOk | ThesisGroupByIdErr

type StaffOption = {
    id: string
    name: string
    email: string
    role?: string | null
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

function datetimeLocalToIso(v: string) {
    const s = String(v ?? "").trim()
    if (!s) return ""
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s
    return d.toISOString()
}

function statusBadge(status: string) {
    const s = String(status || "").toLowerCase()
    if (s === "scheduled") return <Badge>Scheduled</Badge>
    if (s === "completed" || s === "done") return <Badge variant="secondary">Completed</Badge>
    if (s === "cancelled" || s === "canceled") return <Badge variant="destructive">Cancelled</Badge>
    if (s === "ongoing" || s === "in_progress") return <Badge variant="outline">Ongoing</Badge>
    return <Badge variant="outline">{status || "unknown"}</Badge>
}

function normalizeGroup(group: any): ThesisGroupOption | null {
    if (!group) return null
    const id = String(group?.id ?? group?.groupId ?? group?.group_id ?? "").trim()
    if (!id) return null
    const title = String(group?.title ?? group?.name ?? "").trim()
    return {
        id,
        title: title || `Group ${id.slice(0, 8)}…`,
        program: group?.program ?? null,
        term: group?.term ?? null,
    }
}

function normalizeStaff(users: any[]): StaffOption[] {
    const out: StaffOption[] = []
    for (const u of users ?? []) {
        const id = String(u?.id ?? u?.userId ?? u?.staffId ?? "").trim()
        if (!id) continue

        const first = String(u?.firstName ?? u?.firstname ?? "").trim()
        const last = String(u?.lastName ?? u?.lastname ?? "").trim()
        const combinedName = `${first} ${last}`.trim()

        const name =
            String(u?.name ?? u?.fullName ?? u?.displayName ?? "").trim() ||
            combinedName ||
            String(u?.email ?? "").trim() ||
            `User ${id.slice(0, 8)}…`

        const email = String(u?.email ?? u?.userEmail ?? "").trim()
        const role = (u?.role ?? u?.userRole ?? null) as any

        out.push({ id, name, email, role })
    }

    // unique by id
    const map = new Map<string, StaffOption>()
    for (const s of out) map.set(s.id, s)
    return Array.from(map.values())
}

export default function StaffScheduleDetailsPage() {
    const router = useRouter()
    const params = useParams<{ id: string }>()
    const id = String(params?.id ?? "")

    const { user, loading } = useAuth() as any
    const api = useApi({
        onUnauthorized: () => router.replace("/auth/login"),
    })

    const [busy, setBusy] = React.useState(false)
    const [schedule, setSchedule] = React.useState<DefenseSchedule | null>(null)
    const [panelists, setPanelists] = React.useState<Panelist[]>([])
    const [group, setGroup] = React.useState<ThesisGroupOption | null>(null)

    const [tab, setTab] = React.useState("details")

    // edit form
    const [saving, setSaving] = React.useState(false)
    const [scheduledAt, setScheduledAt] = React.useState("")
    const [room, setRoom] = React.useState("")
    const [status, setStatus] = React.useState("scheduled")

    // add panelist dialog (SEARCHABLE STAFF PICKER)
    const [addOpen, setAddOpen] = React.useState(false)
    const [adding, setAdding] = React.useState(false)

    const [staffPickerOpen, setStaffPickerOpen] = React.useState(false)
    const [staffQuery, setStaffQuery] = React.useState("")
    const [staffLoading, setStaffLoading] = React.useState(false)
    const [staffError, setStaffError] = React.useState("")
    const [staffOptions, setStaffOptions] = React.useState<StaffOption[]>([])
    const [selectedStaff, setSelectedStaff] = React.useState<StaffOption | null>(null)

    React.useEffect(() => {
        if (!loading && (!user || user.role !== "staff")) {
            router.replace("/auth/login")
        }
    }, [loading, user, router])

    const fetchThesisGroupById = React.useCallback(
        async (gid: string): Promise<ThesisGroupOption | null> => {
            const params = new URLSearchParams()
            params.set("resource", "groups")
            params.set("id", gid)

            const res = await api.request<ThesisGroupByIdResponse>(`/api/thesis?${params.toString()}`)
            if (!res || (res as any).ok !== true) return null
            const ok = res as ThesisGroupByIdOk
            return normalizeGroup(ok.group)
        },
        [api]
    )

    const fetchPanelists = React.useCallback(async () => {
        const pParams = new URLSearchParams()
        pParams.set("resource", "panelists")
        pParams.set("scheduleId", id)

        const pRes = await api.request<PanelistsGetResponse>(`/api/schedule?${pParams.toString()}`)
        setPanelists(pRes && (pRes as any).ok === true ? (pRes as PanelistsGetOk).panelists : [])
    }, [api, id])

    const load = React.useCallback(async () => {
        if (!id) return
        setBusy(true)
        try {
            const sParams = new URLSearchParams()
            sParams.set("resource", "schedules")
            sParams.set("id", id)

            const sRes = await api.request<ScheduleGetResponse>(`/api/schedule?${sParams.toString()}`)
            if (!sRes || (sRes as any).ok !== true) {
                const msg = (sRes as any)?.message ?? "Failed to load schedule"
                throw new Error(String(msg))
            }

            const s = (sRes as ScheduleGetOk).schedule
            setSchedule(s)

            setScheduledAt(toDatetimeLocalValue(s.scheduledAt))
            setRoom(s.room ?? "")
            setStatus(s.status ?? "scheduled")

            await fetchPanelists()

            const g = await fetchThesisGroupById(s.groupId)
            setGroup(g)
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to load schedule")
            setSchedule(null)
            setPanelists([])
            setGroup(null)
        } finally {
            setBusy(false)
        }
    }, [api, fetchPanelists, fetchThesisGroupById, id])

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

        const scheduledAtIso = datetimeLocalToIso(scheduledAt)
        if (!scheduledAtIso) return toast.error("Invalid scheduled date/time")

        setSaving(true)
        try {
            const q = new URLSearchParams()
            q.set("resource", "schedules")
            q.set("id", id)

            await api.request(`/api/schedule?${q.toString()}`, {
                method: "PATCH",
                body: JSON.stringify({
                    id,
                    scheduledAt: scheduledAtIso,
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
            const q = new URLSearchParams()
            q.set("resource", "schedules")
            q.set("id", id)

            await api.request(`/api/schedule?${q.toString()}`, { method: "DELETE" })
            toast.success("Schedule deleted")
            router.replace("/dashboard/staff/schedules")
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to delete schedule")
        }
    }

    // STAFF SEARCH (tries admin users first, then profiles as fallback)
    const loadStaff = React.useCallback(
        async (query: string) => {
            setStaffLoading(true)
            setStaffError("")
            try {
                const candidates: Array<{ path: string; params: URLSearchParams }> = []

                // 1) likely existing users API
                const p1 = new URLSearchParams()
                p1.set("limit", "50")
                p1.set("offset", "0")
                p1.set("q", query.trim())
                p1.set("role", "staff")
                candidates.push({ path: "/api/admin/users", params: p1 })

                // 2) fallback: profiles route (if your backend exposes users there)
                const p2 = new URLSearchParams()
                p2.set("resource", "users")
                p2.set("limit", "50")
                p2.set("offset", "0")
                p2.set("q", query.trim())
                p2.set("role", "staff")
                candidates.push({ path: "/api/profiles", params: p2 })

                let found: any[] | null = null

                for (const c of candidates) {
                    try {
                        const res = await api.request<any>(`${c.path}?${c.params.toString()}`)

                        // accept a few common shapes
                        const list =
                            (res?.ok === true && (res.users ?? res.items ?? res.data ?? res.profiles ?? res.staff)) ||
                            (Array.isArray(res) ? res : null)

                        if (Array.isArray(list)) {
                            found = list
                            break
                        }
                    } catch {
                        // try next candidate
                    }
                }

                if (!found) {
                    setStaffOptions([])
                    setStaffError("Cannot load staff list (no compatible staff listing API found).")
                    return
                }

                const normalized = normalizeStaff(found)
                    // if role exists, keep staff only
                    .filter((u) => !u.role || String(u.role).toLowerCase() === "staff")

                setStaffOptions(normalized)
            } catch (e: any) {
                setStaffOptions([])
                setStaffError(e?.message ?? "Failed to load staff list.")
            } finally {
                setStaffLoading(false)
            }
        },
        [api]
    )

    React.useEffect(() => {
        if (!addOpen) return
        setSelectedStaff(null)
        setStaffQuery("")
        loadStaff("")
    }, [addOpen, loadStaff])

    React.useEffect(() => {
        if (!addOpen) return
        const t = setTimeout(() => {
            loadStaff(staffQuery)
        }, 350)
        return () => clearTimeout(t)
    }, [addOpen, staffQuery, loadStaff])

    const addPanelist = async () => {
        const staffId = selectedStaff?.id?.trim() ?? ""
        if (!staffId) return toast.error("Please select a staff user")

        setAdding(true)
        try {
            const q = new URLSearchParams()
            q.set("resource", "panelists")

            await api.request(`/api/schedule?${q.toString()}`, {
                method: "POST",
                body: JSON.stringify({
                    scheduleId: id,
                    staffId,
                }),
            })
            toast.success("Panelist added")
            setSelectedStaff(null)
            setStaffQuery("")
            setAddOpen(false)

            await fetchPanelists()
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to add panelist")
        } finally {
            setAdding(false)
        }
    }

    const removePanelist = async (staffIdToRemove: string) => {
        try {
            const q = new URLSearchParams()
            q.set("resource", "panelists")
            q.set("scheduleId", id)
            q.set("staffId", staffIdToRemove)

            await api.request(`/api/schedule?${q.toString()}`, { method: "DELETE" })
            toast.success("Panelist removed")
            await fetchPanelists()
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to remove panelist")
        }
    }

    const groupMeta = React.useMemo(() => {
        if (!group) return ""
        return [group.program?.trim() ? group.program : null, group.term?.trim() ? group.term : null].filter(Boolean).join(" • ")
    }, [group])

    const selectedStaffLabel = React.useMemo(() => {
        if (!selectedStaff) return "Select staff..."
        const meta = [selectedStaff.email?.trim() ? selectedStaff.email : null].filter(Boolean).join(" • ")
        return meta ? `${selectedStaff.name} (${meta})` : selectedStaff.name
    }, [selectedStaff])

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

                            <p className="text-sm text-muted-foreground">Manage schedule information and panelists.</p>
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
                                            <div className="text-xs text-muted-foreground">Group</div>
                                            <div className="mt-1 wrap-break-word text-sm font-medium">
                                                {group?.title?.trim() ? group.title : schedule.groupId}
                                                {groupMeta ? <div className="mt-1 text-xs text-muted-foreground">{groupMeta}</div> : null}
                                            </div>
                                        </div>

                                        <div className="rounded-md border p-3">
                                            <div className="text-xs text-muted-foreground">Scheduled</div>
                                            <div className="mt-1 text-sm font-medium">{formatDateTime(schedule.scheduledAt)}</div>
                                        </div>

                                        <div className="rounded-md border p-3">
                                            <div className="text-xs text-muted-foreground">Room</div>
                                            <div className="mt-1 text-sm font-medium">{schedule.room?.trim() ? schedule.room : "—"}</div>
                                        </div>

                                        <div className="rounded-md border p-3">
                                            <div className="text-xs text-muted-foreground">Updated</div>
                                            <div className="mt-1 text-sm font-medium">{formatDateTime(schedule.updatedAt)}</div>
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
                                                            <DialogDescription>Search and select a staff user.</DialogDescription>
                                                        </DialogHeader>

                                                        <div className="grid gap-2">
                                                            <Label>Staff</Label>

                                                            <Popover open={staffPickerOpen} onOpenChange={setStaffPickerOpen}>
                                                                <PopoverTrigger asChild>
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        role="combobox"
                                                                        className={cn("w-full justify-between", !selectedStaff && "text-muted-foreground")}
                                                                    >
                                                                        <span className="truncate">{selectedStaffLabel}</span>
                                                                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                                                    </Button>
                                                                </PopoverTrigger>

                                                                <PopoverContent className="w-80 p-0 sm:w-96" align="start">
                                                                    <Command>
                                                                        <div className="flex items-center gap-2 border-b px-3 py-2">
                                                                            <Search className="h-4 w-4 text-muted-foreground" />
                                                                            <CommandInput
                                                                                value={staffQuery}
                                                                                onValueChange={setStaffQuery}
                                                                                placeholder="Search name or email..."
                                                                            />
                                                                            <Button
                                                                                type="button"
                                                                                size="icon"
                                                                                variant="ghost"
                                                                                onClick={() => loadStaff(staffQuery)}
                                                                                disabled={staffLoading}
                                                                                title="Refresh staff"
                                                                            >
                                                                                {staffLoading ? (
                                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                                ) : (
                                                                                    <RefreshCw className="h-4 w-4" />
                                                                                )}
                                                                            </Button>
                                                                        </div>

                                                                        <CommandList>
                                                                            <CommandEmpty>
                                                                                {staffLoading ? "Loading staff..." : "No staff found."}
                                                                            </CommandEmpty>

                                                                            <CommandGroup heading="Staff users">
                                                                                {staffOptions.map((s) => (
                                                                                    <CommandItem
                                                                                        key={s.id}
                                                                                        value={`${s.name} ${s.email}`}
                                                                                        onSelect={() => {
                                                                                            setSelectedStaff(s)
                                                                                            setStaffPickerOpen(false)
                                                                                        }}
                                                                                    >
                                                                                        <div className="min-w-0">
                                                                                            <div className="truncate text-sm font-medium">{s.name}</div>
                                                                                            <div className="truncate text-xs text-muted-foreground">
                                                                                                {s.email || s.id}
                                                                                            </div>
                                                                                        </div>
                                                                                    </CommandItem>
                                                                                ))}
                                                                            </CommandGroup>
                                                                        </CommandList>
                                                                    </Command>
                                                                </PopoverContent>
                                                            </Popover>

                                                            <div className="flex items-center justify-between">
                                                                <p className="text-xs text-muted-foreground">Pick a staff user to add as panelist.</p>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-7 px-2"
                                                                    onClick={() => setSelectedStaff(null)}
                                                                    disabled={!selectedStaff}
                                                                >
                                                                    Clear
                                                                </Button>
                                                            </div>

                                                            {staffError ? (
                                                                <Alert variant="destructive">
                                                                    <AlertTitle>Cannot load staff</AlertTitle>
                                                                    <AlertDescription>{staffError}</AlertDescription>
                                                                </Alert>
                                                            ) : null}
                                                        </div>

                                                        <DialogFooter className="gap-2 sm:gap-0">
                                                            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding} className="mx-2">
                                                                Cancel
                                                            </Button>
                                                            <Button onClick={addPanelist} disabled={adding || !selectedStaff}>
                                                                {adding ? (
                                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <Plus className="mr-2 h-4 w-4" />
                                                                )}
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
                                                                        key={p.staffId}
                                                                        className={cn(
                                                                            "flex items-center justify-between gap-3 rounded-md border bg-background p-3",
                                                                            "hover:bg-muted/40"
                                                                        )}
                                                                    >
                                                                        <div className="flex items-center gap-3">
                                                                            <Avatar className="h-9 w-9">
                                                                                <AvatarFallback>
                                                                                    {(p.staffName || "S").slice(0, 1).toUpperCase()}
                                                                                </AvatarFallback>
                                                                            </Avatar>
                                                                            <div className="min-w-0">
                                                                                <div className="truncate text-sm font-medium">{p.staffName}</div>
                                                                                <div className="truncate text-xs text-muted-foreground">{p.staffEmail}</div>
                                                                                <div className="mt-1 flex items-center gap-2">
                                                                                    <Badge variant="outline" className="text-[10px]">
                                                                                        {p.staffId}
                                                                                    </Badge>
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        className="h-7 px-2"
                                                                                        onClick={() => copy(p.staffId)}
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
                                                                                        This will remove{" "}
                                                                                        <span className="font-medium">{p.staffName}</span> from this schedule.
                                                                                    </AlertDialogDescription>
                                                                                </AlertDialogHeader>
                                                                                <AlertDialogFooter>
                                                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                                    <AlertDialogAction onClick={() => removePanelist(p.staffId)}>
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

                                    <Button className="w-full" variant="outline" onClick={() => copy(schedule.groupId)}>
                                        <ClipboardCopy className="mr-2 h-4 w-4" />
                                        Copy group id
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            </TooltipProvider>
        </DashboardLayout>
    )
}
