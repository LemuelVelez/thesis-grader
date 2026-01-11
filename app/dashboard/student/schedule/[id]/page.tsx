/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, ClipboardCopy, Loader2, RefreshCw, Users } from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"
import { useApi } from "@/hooks/use-api"
import { cn } from "@/lib/utils"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
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

    // optional enrichment
    groupTitle?: string | null
    group_title?: string | null
    program?: string | null
    term?: string | null
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

function statusBadge(status: string) {
    const s = String(status || "").toLowerCase()
    if (s === "scheduled") return <Badge>Scheduled</Badge>
    if (s === "completed" || s === "done") return <Badge variant="secondary">Completed</Badge>
    if (s === "cancelled" || s === "canceled") return <Badge variant="destructive">Cancelled</Badge>
    if (s === "ongoing" || s === "in_progress") return <Badge variant="outline">Ongoing</Badge>
    return <Badge variant="outline">{status || "unknown"}</Badge>
}

function statusHelp(status: string) {
    const s = String(status || "").toLowerCase()
    if (s.includes("scheduled")) return "Your defense is scheduled. Check date/time/room and panelists."
    if (s.includes("done") || s.includes("complete")) return "Defense completed. This is a record of the final schedule."
    if (s.includes("cancel")) return "Defense was cancelled or moved. Wait for an updated schedule."
    if (s.includes("resched")) return "Defense is being rescheduled. Watch for the new schedule."
    if (s.includes("ongoing") || s.includes("in_progress")) return "Defense is currently ongoing."
    return "Schedule status provided by the system."
}

function safeInitials(nameOrEmail: string) {
    const s = String(nameOrEmail || "").trim()
    if (!s) return "U"
    const parts = s.split(/\s+/).filter(Boolean)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase()
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

function avatarSrc(userId: string) {
    const id = String(userId ?? "").trim()
    if (!id) return ""
    return `/api/users/${encodeURIComponent(id)}/avatar`
}

export default function StudentScheduleDetailsPage() {
    const router = useRouter()
    const params = useParams<{ id: string }>()
    const id = String((params as any)?.id ?? "")

    const { user, loading } = useAuth() as any
    const api = useApi({
        onUnauthorized: () => router.replace("/auth/login"),
    })

    const [busy, setBusy] = React.useState(false)
    const [schedule, setSchedule] = React.useState<DefenseSchedule | null>(null)
    const [panelists, setPanelists] = React.useState<Panelist[]>([])
    const [group, setGroup] = React.useState<ThesisGroupOption | null>(null)

    const [tab, setTab] = React.useState("details")

    React.useEffect(() => {
        if (!loading && (!user || String(user.role ?? "").toLowerCase() !== "student")) {
            router.replace("/auth/login")
        }
    }, [loading, user, router])

    const fetchThesisGroupById = React.useCallback(
        async (gid: string): Promise<ThesisGroupOption | null> => {
            const params2 = new URLSearchParams()
            params2.set("resource", "groups")
            params2.set("id", gid)

            try {
                const res = await api.request<ThesisGroupByIdResponse>(`/api/thesis?${params2.toString()}`)
                if (!res || (res as any).ok !== true) return null
                const ok = res as ThesisGroupByIdOk
                return normalizeGroup(ok.group)
            } catch {
                return null
            }
        },
        [api]
    )

    const fetchPanelists = React.useCallback(async () => {
        const pParams = new URLSearchParams()
        pParams.set("resource", "panelists")
        pParams.set("scheduleId", id)

        try {
            const pRes = await api.request<PanelistsGetResponse>(`/api/schedule?${pParams.toString()}`)
            setPanelists(pRes && (pRes as any).ok === true ? (pRes as PanelistsGetOk).panelists : [])
        } catch {
            setPanelists([])
        }
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

            await fetchPanelists()

            // enrich with group info (best-effort)
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
        if (!loading && user?.role === "student") load()
    }, [load, loading, user])

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text)
            toast.success("Copied")
        } catch {
            toast.error("Copy failed")
        }
    }

    const groupMeta = React.useMemo(() => {
        if (!schedule) return ""
        const program = (schedule.program ?? group?.program ?? null)?.toString().trim() ? (schedule.program ?? group?.program) : null
        const term = (schedule.term ?? group?.term ?? null)?.toString().trim() ? (schedule.term ?? group?.term) : null
        return [program, term].filter(Boolean).join(" • ")
    }, [schedule, group])

    const groupTitle = React.useMemo(() => {
        if (!schedule) return ""
        const t = (schedule.groupTitle ?? schedule.group_title ?? "").trim()
        if (t) return t
        if (group?.title?.trim()) return group.title
        return schedule.groupId
    }, [schedule, group])

    return (
        <DashboardLayout>
            <TooltipProvider>
                <div className="space-y-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" asChild>
                                    <Link href="/dashboard/student/schedule" aria-label="Back">
                                        <ArrowLeft className="h-4 w-4" />
                                    </Link>
                                </Button>
                                <h1 className="text-xl font-semibold tracking-tight">Schedule Details</h1>
                            </div>

                            <p className="text-sm text-muted-foreground">
                                Read-only schedule details (date/time/room/status) and panelists.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={load} disabled={busy}>
                                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                Refresh
                            </Button>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" onClick={() => copy(id)} disabled={!id}>
                                        <ClipboardCopy className="mr-2 h-4 w-4" />
                                        Copy ID
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copy schedule id</TooltipContent>
                            </Tooltip>

                            <Button variant="secondary" asChild>
                                <Link href="/dashboard/student/evaluation">My Evaluation</Link>
                            </Button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-24 w-full" />
                            <Skeleton className="h-64 w-full" />
                        </div>
                    ) : !user || String(user.role ?? "").toLowerCase() !== "student" ? (
                        <Alert variant="destructive">
                            <AlertTitle>Unauthorized</AlertTitle>
                            <AlertDescription>Please login as student to access this page.</AlertDescription>
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
                                            <div className="text-xs text-muted-foreground">Thesis / Group</div>
                                            <div className="mt-1 wrap-break-word text-sm font-medium">
                                                {groupTitle}
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

                                    <Alert className="border-muted">
                                        <AlertTitle>Status note</AlertTitle>
                                        <AlertDescription>{statusHelp(schedule.status)}</AlertDescription>
                                    </Alert>

                                    <Separator />

                                    <Tabs value={tab} onValueChange={setTab} className="w-full">
                                        <TabsList className="grid w-full grid-cols-2">
                                            <TabsTrigger value="details">Details</TabsTrigger>
                                            <TabsTrigger value="panelists">Panelists</TabsTrigger>
                                        </TabsList>

                                        <TabsContent value="details" className="mt-4 space-y-4">
                                            <div className="rounded-md border p-3 space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-xs text-muted-foreground">Group ID</div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2"
                                                        onClick={() => copy(schedule.groupId)}
                                                    >
                                                        <ClipboardCopy className="mr-2 h-3.5 w-3.5" />
                                                        Copy
                                                    </Button>
                                                </div>
                                                <div className="text-sm font-medium break-all">{schedule.groupId}</div>
                                            </div>

                                            <div className="rounded-md border p-3 space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-xs text-muted-foreground">Schedule ID</div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2"
                                                        onClick={() => copy(schedule.id)}
                                                    >
                                                        <ClipboardCopy className="mr-2 h-3.5 w-3.5" />
                                                        Copy
                                                    </Button>
                                                </div>
                                                <div className="text-sm font-medium break-all">{schedule.id}</div>
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

                                                <Button variant="outline" onClick={fetchPanelists} disabled={busy}>
                                                    <RefreshCw className="mr-2 h-4 w-4" />
                                                    Reload panelists
                                                </Button>
                                            </div>

                                            {panelists.length === 0 ? (
                                                <Alert>
                                                    <AlertTitle>No panelists assigned</AlertTitle>
                                                    <AlertDescription>
                                                        Panelists may not be assigned yet. Check again later.
                                                    </AlertDescription>
                                                </Alert>
                                            ) : (
                                                <ScrollArea className="h-80 rounded-md border">
                                                    <div className="p-3 space-y-2">
                                                        {panelists.map((p) => (
                                                            <div
                                                                key={`${p.scheduleId}-${p.staffId}`}
                                                                className={cn(
                                                                    "flex items-center justify-between gap-3 rounded-md border bg-background p-3",
                                                                    "hover:bg-muted/40"
                                                                )}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <Avatar className="h-9 w-9">
                                                                        <AvatarImage
                                                                            src={avatarSrc(p.staffId)}
                                                                            alt={p.staffName || p.staffEmail}
                                                                        />
                                                                        <AvatarFallback>
                                                                            {safeInitials(p.staffName || p.staffEmail)}
                                                                        </AvatarFallback>
                                                                    </Avatar>

                                                                    <div className="min-w-0">
                                                                        <div className="truncate text-sm font-medium">{p.staffName}</div>
                                                                        <div className="truncate text-xs text-muted-foreground">{p.staffEmail}</div>
                                                                    </div>
                                                                </div>

                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="shrink-0"
                                                                    onClick={() => copy(p.staffEmail || p.staffId)}
                                                                >
                                                                    <ClipboardCopy className="mr-2 h-4 w-4" />
                                                                    Copy
                                                                </Button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            )}
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
                                    <Button className="w-full" variant="outline" onClick={() => setTab("panelists")}>
                                        <Users className="mr-2 h-4 w-4" />
                                        View panelists
                                    </Button>

                                    <Button className="w-full" variant="outline" onClick={() => copy(schedule.groupId)}>
                                        <ClipboardCopy className="mr-2 h-4 w-4" />
                                        Copy group id
                                    </Button>

                                    <Button className="w-full" variant="outline" onClick={() => copy(schedule.id)}>
                                        <ClipboardCopy className="mr-2 h-4 w-4" />
                                        Copy schedule id
                                    </Button>

                                    <Button className="w-full" asChild>
                                        <Link href="/dashboard/student/evaluation">Open my evaluation</Link>
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
