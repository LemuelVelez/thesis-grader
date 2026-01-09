 
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    ArrowLeft,
    CalendarDays,
    ClipboardCopy,
    Command as CommandIcon,
    Loader2,
    RefreshCw,
    Users,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// shadcn command (safe import)
import * as Cmd from "@/components/ui/command"

const Command = Cmd.Command
const CommandInput = Cmd.CommandInput
const CommandList = Cmd.CommandList
const CommandEmpty = Cmd.CommandEmpty
const CommandGroup = Cmd.CommandGroup
const CommandItem = Cmd.CommandItem
const CommandSeparator =
    (Cmd as any).CommandSeparator ??
    function FallbackSeparator() {
        return <div className="mx-2 my-2 h-px bg-border" />
    }

type Group = {
    id: string
    title: string
    program: string | null
    term: string | null
    created_at: string
    updated_at: string
    adviser_id: string | null
    adviser_name: string | null
    adviser_email: string | null
}

type Member = {
    id: string
    name: string
    email: string
    program: string | null
    section: string | null
    status: "active" | "disabled"
}

type Schedule = {
    id: string
    scheduled_at: string
    room: string | null
    status: string
    panelists_count: number
}

type DetailsOk = { ok: true; group: Group; members: Member[]; schedules: Schedule[] }
type DetailsErr = { ok: false; message?: string }
type DetailsResponse = DetailsOk | DetailsErr

function formatDateTime(iso: string | null | undefined) {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d)
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
        },
        cache: "no-store",
    })

    const text = await res.text().catch(() => "")
    const asJson = (() => {
        try {
            return text ? JSON.parse(text) : null
        } catch {
            return null
        }
    })()

    if (!res.ok) {
        const msg = (asJson && (asJson.message || asJson.error)) || text || `Request failed (${res.status})`
        throw new Error(String(msg))
    }

    return (asJson ?? ({} as any)) as T
}

export default function StaffThesisGroupDetailsPage() {
    const router = useRouter()
    const params = useParams<{ id: string }>()
    const id = String(params?.id ?? "").trim()

    const { user, loading } = useAuth() as any

    const [busy, setBusy] = React.useState(false)
    const [tab, setTab] = React.useState("overview")

    const [group, setGroup] = React.useState<Group | null>(null)
    const [members, setMembers] = React.useState<Member[]>([])
    const [schedules, setSchedules] = React.useState<Schedule[]>([])

    // search inside group
    const [memberQuery, setMemberQuery] = React.useState("")
    const [scheduleQuery, setScheduleQuery] = React.useState("")

    // command palette dialog
    const [cmdOpen, setCmdOpen] = React.useState(false)

    React.useEffect(() => {
        if (!loading && (!user || user.role !== "staff")) {
            router.replace("/auth/login")
        }
    }, [loading, user, router])

    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const isK = e.key.toLowerCase() === "k"
            if ((e.ctrlKey || e.metaKey) && isK) {
                e.preventDefault()
                setCmdOpen(true)
            }
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [])

    const load = React.useCallback(async () => {
        if (!id) return
        setBusy(true)
        try {
            const res = await apiJson<DetailsResponse>(`/api/staff/thesis-groups/${encodeURIComponent(id)}`)
            if (!res || (res as any).ok !== true) {
                throw new Error((res as any)?.message ?? "Failed to load thesis group")
            }
            const ok = res as DetailsOk
            setGroup(ok.group)
            setMembers(Array.isArray(ok.members) ? ok.members : [])
            setSchedules(Array.isArray(ok.schedules) ? ok.schedules : [])
        } catch (e: any) {
            setGroup(null)
            setMembers([])
            setSchedules([])
            toast.error(e?.message ?? "Failed to load thesis group")
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

    const filteredMembers = React.useMemo(() => {
        const q = memberQuery.trim().toLowerCase()
        if (!q) return members
        return members.filter((m) => {
            const hay = `${m.name} ${m.email} ${m.program ?? ""} ${m.section ?? ""} ${m.status}`.toLowerCase()
            return hay.includes(q)
        })
    }, [members, memberQuery])

    const filteredSchedules = React.useMemo(() => {
        const q = scheduleQuery.trim().toLowerCase()
        if (!q) return schedules
        return schedules.filter((s) => {
            const hay = `${s.status} ${s.room ?? ""} ${s.scheduled_at} ${s.id}`.toLowerCase()
            return hay.includes(q)
        })
    }, [schedules, scheduleQuery])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <Button asChild variant="ghost" size="icon">
                                <Link href="/dashboard/staff/thesis-groups" aria-label="Back">
                                    <ArrowLeft className="h-4 w-4" />
                                </Link>
                            </Button>

                            <h1 className="text-xl font-semibold tracking-tight">Thesis Group</h1>
                            {group?.program ? <Badge variant="secondary">{group.program}</Badge> : null}
                            {group?.term ? <Badge variant="outline">{group.term}</Badge> : null}
                        </div>

                        <p className="text-sm text-muted-foreground">
                            View members and defense schedules for this group. Press <span className="font-mono">Ctrl</span> +{" "}
                            <span className="font-mono">K</span> for commands.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={load} disabled={busy}>
                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Refresh
                        </Button>

                        <Button variant="secondary" onClick={() => setCmdOpen(true)}>
                            <CommandIcon className="mr-2 h-4 w-4" />
                            Command
                        </Button>

                        <Button variant="outline" onClick={() => copy(id)}>
                            <ClipboardCopy className="mr-2 h-4 w-4" />
                            Copy ID
                        </Button>
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
                ) : !group ? (
                    <Alert variant="destructive">
                        <AlertTitle>Not found</AlertTitle>
                        <AlertDescription>Group not found or you don’t have access.</AlertDescription>
                    </Alert>
                ) : (
                    <>
                        <div className="grid gap-4 lg:grid-cols-3">
                            <Card className="lg:col-span-2">
                                <CardHeader className="pb-2">
                                    <CardTitle className="truncate">{group.title}</CardTitle>
                                    <CardDescription className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                                        <span className="text-muted-foreground">Group ID:</span>
                                        <span className="font-mono text-xs">{group.id}</span>
                                    </CardDescription>
                                </CardHeader>

                                <CardContent className="space-y-4">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-md border p-3">
                                            <div className="text-xs text-muted-foreground">Adviser</div>
                                            <div className="mt-1">
                                                {group.adviser_name ? (
                                                    <div className="space-y-0.5">
                                                        <div className="text-sm font-medium">{group.adviser_name}</div>
                                                        <div className="text-xs text-muted-foreground">{group.adviser_email ?? ""}</div>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-muted-foreground">Unassigned</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="rounded-md border p-3">
                                            <div className="text-xs text-muted-foreground">Updated</div>
                                            <div className="mt-1 text-sm font-medium">{formatDateTime(group.updated_at)}</div>
                                        </div>

                                        <div className="rounded-md border p-3">
                                            <div className="text-xs text-muted-foreground">Members</div>
                                            <div className="mt-1 text-sm font-medium">{members.length}</div>
                                        </div>

                                        <div className="rounded-md border p-3">
                                            <div className="text-xs text-muted-foreground">Schedules</div>
                                            <div className="mt-1 text-sm font-medium">{schedules.length}</div>
                                        </div>
                                    </div>

                                    <Separator />

                                    <Tabs value={tab} onValueChange={setTab} className="w-full">
                                        <TabsList className="grid w-full grid-cols-3">
                                            <TabsTrigger value="overview">Overview</TabsTrigger>
                                            <TabsTrigger value="members">Members</TabsTrigger>
                                            <TabsTrigger value="schedules">Schedules</TabsTrigger>
                                        </TabsList>

                                        <TabsContent value="overview" className="mt-4 space-y-3">
                                            <Alert>
                                                <AlertTitle>Source</AlertTitle>
                                                <AlertDescription>
                                                    Loaded from <span className="font-mono">/api/staff/thesis-groups/{group.id}</span>
                                                </AlertDescription>
                                            </Alert>
                                        </TabsContent>

                                        <TabsContent value="members" className="mt-4 space-y-4">
                                            {/* Members Command search */}
                                            <Command className="rounded-lg border">
                                                <CommandInput
                                                    value={memberQuery}
                                                    onValueChange={(v: string) => setMemberQuery(v)}
                                                    placeholder="Search members by name/email/program/section..."
                                                />
                                                <CommandList>
                                                    <CommandEmpty>No members found.</CommandEmpty>

                                                    <CommandGroup heading={`Members (${filteredMembers.length})`}>
                                                        {filteredMembers.slice(0, 12).map((m) => (
                                                            <CommandItem
                                                                key={m.id}
                                                                value={`${m.name} ${m.email} ${m.program ?? ""} ${m.section ?? ""}`}
                                                                onSelect={() => copy(m.email)}
                                                                className="cursor-pointer"
                                                            >
                                                                <div className="min-w-0">
                                                                    <div className="truncate text-sm font-medium">{m.name}</div>
                                                                    <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                                                                </div>
                                                                <Badge
                                                                    variant={m.status === "active" ? "secondary" : "outline"}
                                                                    className="ml-auto"
                                                                >
                                                                    {m.status}
                                                                </Badge>
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>

                                                    <CommandSeparator />

                                                    <CommandGroup heading="Actions">
                                                        <CommandItem onSelect={() => setMemberQuery("")} className="cursor-pointer">
                                                            Clear member search
                                                        </CommandItem>
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>

                                            <div className="rounded-md border">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Student</TableHead>
                                                            <TableHead className="hidden md:table-cell">Program</TableHead>
                                                            <TableHead className="hidden md:table-cell">Section</TableHead>
                                                            <TableHead className="text-right">Status</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {filteredMembers.length ? (
                                                            filteredMembers.map((m) => (
                                                                <TableRow key={m.id}>
                                                                    <TableCell>
                                                                        <div className="space-y-0.5">
                                                                            <div className="text-sm font-medium">{m.name}</div>
                                                                            <div className="text-xs text-muted-foreground">{m.email}</div>
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="hidden md:table-cell">{m.program ?? "—"}</TableCell>
                                                                    <TableCell className="hidden md:table-cell">{m.section ?? "—"}</TableCell>
                                                                    <TableCell className="text-right">
                                                                        <Badge variant={m.status === "active" ? "secondary" : "outline"}>
                                                                            {m.status}
                                                                        </Badge>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))
                                                        ) : (
                                                            <TableRow>
                                                                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                                                                    No members to display.
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="schedules" className="mt-4 space-y-4">
                                            {/* Schedules Command search */}
                                            <Command className="rounded-lg border">
                                                <CommandInput
                                                    value={scheduleQuery}
                                                    onValueChange={(v: string) => setScheduleQuery(v)}
                                                    placeholder="Search schedules by status/room/date..."
                                                />
                                                <CommandList>
                                                    <CommandEmpty>No schedules found.</CommandEmpty>

                                                    <CommandGroup heading={`Schedules (${filteredSchedules.length})`}>
                                                        {filteredSchedules.slice(0, 12).map((s) => (
                                                            <CommandItem
                                                                key={s.id}
                                                                value={`${s.status} ${s.room ?? ""} ${s.scheduled_at}`}
                                                                onSelect={() => copy(s.id)}
                                                                className="cursor-pointer"
                                                            >
                                                                <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                                                                <div className="min-w-0">
                                                                    <div className="truncate text-sm font-medium">{formatDateTime(s.scheduled_at)}</div>
                                                                    <div className="truncate text-xs text-muted-foreground">
                                                                        {s.room?.trim() ? s.room : "—"} • {s.status}
                                                                    </div>
                                                                </div>
                                                                <Badge variant="secondary" className="ml-auto">
                                                                    {s.panelists_count}
                                                                </Badge>
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>

                                                    <CommandSeparator />

                                                    <CommandGroup heading="Actions">
                                                        <CommandItem onSelect={() => setScheduleQuery("")} className="cursor-pointer">
                                                            Clear schedule search
                                                        </CommandItem>
                                                        <CommandItem
                                                            onSelect={() => router.push("/dashboard/staff/schedules")}
                                                            className="cursor-pointer"
                                                        >
                                                            Go to schedules module
                                                        </CommandItem>
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>

                                            <div className="rounded-md border">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Date</TableHead>
                                                            <TableHead>Room</TableHead>
                                                            <TableHead>Status</TableHead>
                                                            <TableHead className="text-right">Panelists</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {filteredSchedules.length ? (
                                                            filteredSchedules.map((s) => (
                                                                <TableRow key={s.id}>
                                                                    <TableCell>
                                                                        <div className="space-y-0.5">
                                                                            <div className="text-sm font-medium">{formatDateTime(s.scheduled_at)}</div>
                                                                            <div className="text-xs text-muted-foreground font-mono">{s.id}</div>
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell>{s.room ?? "—"}</TableCell>
                                                                    <TableCell>
                                                                        <Badge variant="outline">{s.status}</Badge>
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        <Badge variant="secondary">{s.panelists_count}</Badge>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))
                                                        ) : (
                                                            <TableRow>
                                                                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                                                                    No schedules to display.
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </TabsContent>
                                    </Tabs>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Quick actions</CardTitle>
                                    <CardDescription>Common actions for this group.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <Button className="w-full" variant="secondary" onClick={() => setTab("members")}>
                                        <Users className="mr-2 h-4 w-4" />
                                        View members
                                    </Button>
                                    <Button className="w-full" variant="outline" onClick={() => setTab("schedules")}>
                                        <CalendarDays className="mr-2 h-4 w-4" />
                                        View schedules
                                    </Button>
                                    <Button className="w-full" variant="outline" onClick={() => copy(group.id)}>
                                        <ClipboardCopy className="mr-2 h-4 w-4" />
                                        Copy group id
                                    </Button>

                                    <Separator />

                                    <Alert>
                                        <AlertTitle>Tip</AlertTitle>
                                        <AlertDescription>
                                            Press <span className="font-mono">Ctrl</span>+<span className="font-mono">K</span> for command actions.
                                        </AlertDescription>
                                    </Alert>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Command Palette */}
                        <Dialog open={cmdOpen} onOpenChange={setCmdOpen}>
                            <DialogContent className="p-0 sm:max-w-170">
                                <DialogHeader className="px-4 pt-4">
                                    <DialogTitle className="text-sm font-medium">Command</DialogTitle>
                                </DialogHeader>

                                <Command className="rounded-none border-0">
                                    <CommandInput placeholder="Type a command..." />
                                    <CommandList>
                                        <CommandEmpty>No results found.</CommandEmpty>

                                        <CommandGroup heading="Actions">
                                            <CommandItem
                                                onSelect={() => {
                                                    setCmdOpen(false)
                                                    load()
                                                }}
                                                className="cursor-pointer"
                                            >
                                                <RefreshCw className="mr-2 h-4 w-4" />
                                                Refresh group
                                            </CommandItem>
                                            <CommandItem
                                                onSelect={() => {
                                                    setCmdOpen(false)
                                                    copy(group.id)
                                                }}
                                                className="cursor-pointer"
                                            >
                                                <ClipboardCopy className="mr-2 h-4 w-4" />
                                                Copy group ID
                                            </CommandItem>
                                            <CommandItem
                                                onSelect={() => {
                                                    setCmdOpen(false)
                                                    router.push("/dashboard/staff/schedules")
                                                }}
                                                className="cursor-pointer"
                                            >
                                                <CalendarDays className="mr-2 h-4 w-4" />
                                                Open schedules module
                                            </CommandItem>
                                        </CommandGroup>

                                        <CommandSeparator />

                                        <CommandGroup heading="Navigate">
                                            <CommandItem
                                                onSelect={() => {
                                                    setCmdOpen(false)
                                                    router.push("/dashboard/staff/thesis-groups")
                                                }}
                                                className="cursor-pointer"
                                            >
                                                <ArrowLeft className="mr-2 h-4 w-4" />
                                                Back to thesis groups
                                            </CommandItem>
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </DialogContent>
                        </Dialog>
                    </>
                )}
            </div>
        </DashboardLayout>
    )
}
