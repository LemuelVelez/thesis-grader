/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    BookOpen,
    ClipboardCopy,
    Command as CommandIcon,
    Loader2,
    RefreshCw,
    Search,
    Users,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// shadcn command (import as module so we can safely use optional exports if your local file differs)
import * as Cmd from "@/components/ui/command"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
const CommandShortcut =
    (Cmd as any).CommandShortcut ??
    function FallbackShortcut(props: { children: React.ReactNode }) {
        return <span className="ml-auto text-xs text-muted-foreground">{props.children}</span>
    }

type GroupRow = {
    id: string
    title: string
    program: string | null
    term: string | null
    created_at?: string | null
    updated_at?: string | null
    adviser_name?: string | null
    adviser_email?: string | null
    members_count?: number | null
    next_defense_at?: string | null
}

type ListOk = { ok: true; total: number; groups: any[] }
type ListErr = { ok: false; message?: string }
type ListResponse = ListOk | ListErr

function isUuid(v: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

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

function normalizeGroups(raw: any[]): GroupRow[] {
    const out: GroupRow[] = []
    for (const g of raw ?? []) {
        const id = String(g?.id ?? g?.group_id ?? g?.groupId ?? "").trim()
        const title = String(g?.title ?? g?.group_title ?? g?.name ?? "").trim()
        if (!id) continue
        out.push({
            id,
            title: title || `Group ${id.slice(0, 8)}…`,
            program: g?.program ?? null,
            term: g?.term ?? null,
            created_at: g?.created_at ?? null,
            updated_at: g?.updated_at ?? null,
            adviser_name: g?.adviser_name ?? g?.adviserName ?? null,
            adviser_email: g?.adviser_email ?? g?.adviserEmail ?? null,
            members_count: typeof g?.members_count === "number" ? g.members_count : (g?.members_count ?? null),
            next_defense_at: g?.next_defense_at ?? g?.nextDefenseAt ?? null,
        })
    }
    return out
}

export default function StaffThesisGroupsPage() {
    const router = useRouter()
    const { user, loading } = useAuth() as any

    const [busy, setBusy] = React.useState(false)
    const [err, setErr] = React.useState<string>("")

    const [q, setQ] = React.useState("")
    const [limit, setLimit] = React.useState(20)
    const [page, setPage] = React.useState(0)

    const [total, setTotal] = React.useState(0)
    const [groups, setGroups] = React.useState<GroupRow[]>([])

    // Command palette (Ctrl/Cmd+K)
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

    const fetchGroups = React.useCallback(async () => {
        setBusy(true)
        setErr("")
        try {
            const params = new URLSearchParams()
            params.set("q", q.trim())
            params.set("limit", String(limit))
            params.set("offset", String(page * limit))

            const res = await apiJson<ListResponse>(`/api/staff/thesis-groups?${params.toString()}`)
            if (!res || (res as any).ok !== true) {
                throw new Error((res as any)?.message ?? "Failed to load thesis groups")
            }

            const ok = res as ListOk
            setTotal(ok.total ?? 0)
            setGroups(normalizeGroups(ok.groups ?? []))
        } catch (e: any) {
            setTotal(0)
            setGroups([])
            const msg = e?.message ?? "Failed to load thesis groups"
            setErr(msg)
            toast.error(msg)
        } finally {
            setBusy(false)
        }
    }, [q, limit, page])

    React.useEffect(() => {
        if (!loading && user?.role === "staff") fetchGroups()
    }, [fetchGroups, loading, user])

    // debounce typing
    React.useEffect(() => {
        if (loading || user?.role !== "staff") return
        const t = setTimeout(() => {
            setPage(0)
            fetchGroups()
        }, 350)
        return () => clearTimeout(t)

    }, [q])

    const canPrev = page > 0
    const canNext = (page + 1) * limit < total

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text)
            toast.success("Copied")
        } catch {
            toast.error("Copy failed")
        }
    }

    const openGroup = (id: string) => {
        if (!id) return
        router.push(`/dashboard/staff/thesis-groups/${id}`)
    }

    const stats = React.useMemo(() => {
        const byProgram = groups.reduce<Record<string, number>>((acc, g) => {
            const k = String(g.program ?? "—").trim() || "—"
            acc[k] = (acc[k] ?? 0) + 1
            return acc
        }, {})
        const topProgram = Object.entries(byProgram).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"
        return {
            shown: groups.length,
            topProgram,
        }
    }, [groups])

    return (
        <DashboardLayout>
            <TooltipProvider>
                <div className="space-y-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <BookOpen className="h-5 w-5 text-muted-foreground" />
                                <h1 className="text-xl font-semibold tracking-tight">Thesis Groups</h1>
                                <Badge variant="secondary" className="ml-1">
                                    staff
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Search thesis groups and open a group to view members and defense schedules.
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Tip: Press <span className="font-mono">Ctrl</span> + <span className="font-mono">K</span> to open the command palette.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" onClick={fetchGroups} disabled={busy}>
                                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                        Refresh
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Reload from /api/staff/thesis-groups</TooltipContent>
                            </Tooltip>

                            <Button variant="secondary" onClick={() => setCmdOpen(true)}>
                                <CommandIcon className="mr-2 h-4 w-4" />
                                Command
                            </Button>

                            <Button asChild>
                                <Link href="/dashboard/staff/schedules">Schedules</Link>
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
                            <AlertDescription>Please login as staff to access thesis groups.</AlertDescription>
                        </Alert>
                    ) : (
                        <>
                            {err ? (
                                <Alert variant="destructive">
                                    <AlertTitle>Cannot load groups</AlertTitle>
                                    <AlertDescription>{err}</AlertDescription>
                                </Alert>
                            ) : null}

                            <div className="grid gap-4 md:grid-cols-3">
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardDescription>Showing</CardDescription>
                                        <CardTitle className="text-2xl">{stats.shown}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="text-xs text-muted-foreground">
                                        Groups on this page (out of <span className="font-medium text-foreground">{total}</span>)
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardDescription>Top program (page)</CardDescription>
                                        <CardTitle className="text-2xl">{stats.topProgram}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="text-xs text-muted-foreground">
                                        Based on visible results
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardDescription>Quick search</CardDescription>
                                        <CardTitle className="text-base">Type to filter</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                        <div className="relative">
                                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                value={q}
                                                onChange={(e) => setQ(e.target.value)}
                                                placeholder="Search title / program / term / adviser..."
                                                className="pl-9"
                                            />
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            This also drives the Command results.
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Inline Command list (uses shadcn Command components) */}
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Command list</CardTitle>
                                    <CardDescription>Search and open a thesis group.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Command className="rounded-lg border">
                                        <CommandInput
                                            value={q}
                                            onValueChange={(v: string) => setQ(v)}
                                            placeholder="Search thesis groups..."
                                        />
                                        <CommandList>
                                            <CommandEmpty>{busy ? "Loading..." : "No groups found."}</CommandEmpty>

                                            <CommandGroup heading="Actions">
                                                <CommandItem
                                                    onSelect={() => fetchGroups()}
                                                    className="cursor-pointer"
                                                >
                                                    <RefreshCw className="mr-2 h-4 w-4" />
                                                    Refresh list
                                                    <CommandShortcut>↵</CommandShortcut>
                                                </CommandItem>

                                                <CommandItem
                                                    onSelect={() => router.push("/dashboard/staff/schedules")}
                                                    className="cursor-pointer"
                                                >
                                                    <Users className="mr-2 h-4 w-4" />
                                                    Go to schedules
                                                    <CommandShortcut>→</CommandShortcut>
                                                </CommandItem>
                                            </CommandGroup>

                                            <CommandSeparator />

                                            <CommandGroup heading={`Groups (${groups.length})`}>
                                                {groups.map((g) => {
                                                    const meta = [g.program?.trim() ? g.program : null, g.term?.trim() ? g.term : null]
                                                        .filter(Boolean)
                                                        .join(" • ")
                                                    return (
                                                        <CommandItem
                                                            key={g.id}
                                                            value={`${g.title} ${g.program ?? ""} ${g.term ?? ""} ${g.adviser_name ?? ""}`}
                                                            onSelect={() => openGroup(g.id)}
                                                            className="cursor-pointer"
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="truncate text-sm font-medium">
                                                                    {g.title}
                                                                </div>
                                                                <div className="truncate text-xs text-muted-foreground">
                                                                    {meta || g.id}
                                                                </div>
                                                            </div>
                                                            <CommandShortcut>Open</CommandShortcut>
                                                        </CommandItem>
                                                    )
                                                })}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </CardContent>
                            </Card>

                            {/* Table */}
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle>Groups</CardTitle>
                                    <CardDescription>
                                        Total: <span className="font-medium text-foreground">{total}</span>
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Title</TableHead>
                                                    <TableHead className="hidden md:table-cell">Program</TableHead>
                                                    <TableHead className="hidden md:table-cell">Term</TableHead>
                                                    <TableHead className="hidden lg:table-cell">Adviser</TableHead>
                                                    <TableHead className="hidden lg:table-cell">Next defense</TableHead>
                                                    <TableHead className="w-28 text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {busy && groups.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={6}>
                                                            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                                Loading groups...
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ) : groups.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                                                            No thesis groups found.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    groups.map((g) => (
                                                        <TableRow key={g.id}>
                                                            <TableCell className="font-medium">
                                                                <div className="space-y-1">
                                                                    <div className="line-clamp-1">{g.title}</div>
                                                                    <div className="text-xs text-muted-foreground font-mono">
                                                                        {isUuid(g.id) ? g.id : `id: ${g.id}`}
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="hidden md:table-cell">
                                                                {g.program ? <Badge variant="secondary">{g.program}</Badge> : "—"}
                                                            </TableCell>
                                                            <TableCell className="hidden md:table-cell">{g.term ?? "—"}</TableCell>
                                                            <TableCell className="hidden lg:table-cell">
                                                                {g.adviser_name ? (
                                                                    <div className="space-y-0.5">
                                                                        <div className="line-clamp-1">{g.adviser_name}</div>
                                                                        <div className="text-xs text-muted-foreground">{g.adviser_email ?? ""}</div>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-muted-foreground">Unassigned</span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="hidden lg:table-cell">
                                                                {formatDateTime(g.next_defense_at ?? null)}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <Button variant="secondary" size="sm" onClick={() => openGroup(g.id)}>
                                                                        Open
                                                                    </Button>
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => copy(g.id)}
                                                                        title="Copy group id"
                                                                    >
                                                                        <ClipboardCopy className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>

                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="text-sm text-muted-foreground">
                                            Page <span className="font-medium text-foreground">{page + 1}</span>
                                            <span className="mx-2">•</span>
                                            Showing <span className="font-medium text-foreground">{groups.length}</span> of{" "}
                                            <span className="font-medium text-foreground">{total}</span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                onClick={() => setPage((p) => Math.max(0, p - 1))}
                                                disabled={!canPrev || busy}
                                            >
                                                Prev
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => setPage((p) => p + 1)}
                                                disabled={!canNext || busy}
                                            >
                                                Next
                                            </Button>

                                            <Select
                                                value={String(limit)}
                                                onValueChange={(v) => {
                                                    const n = Number(v)
                                                    setLimit(Number.isFinite(n) ? n : 20)
                                                    setPage(0)
                                                }}
                                            >
                                                <SelectTrigger className="w-28">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="10">10 / page</SelectItem>
                                                    <SelectItem value="20">20 / page</SelectItem>
                                                    <SelectItem value="50">50 / page</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Command Palette Dialog */}
                            <Dialog open={cmdOpen} onOpenChange={setCmdOpen}>
                                <DialogContent className="p-0 sm:max-w-170">
                                    <DialogHeader className="px-4 pt-4">
                                        <DialogTitle className="text-sm font-medium">Command</DialogTitle>
                                    </DialogHeader>

                                    <Command className="rounded-none border-0">
                                        <CommandInput
                                            value={q}
                                            onValueChange={(v: string) => setQ(v)}
                                            placeholder="Type a command or search groups..."
                                        />
                                        <CommandList>
                                            <CommandEmpty>{busy ? "Loading..." : "No results found."}</CommandEmpty>

                                            <CommandGroup heading="Actions">
                                                <CommandItem
                                                    onSelect={() => {
                                                        setCmdOpen(false)
                                                        fetchGroups()
                                                    }}
                                                    className="cursor-pointer"
                                                >
                                                    <RefreshCw className="mr-2 h-4 w-4" />
                                                    Refresh list
                                                </CommandItem>

                                                <CommandItem
                                                    onSelect={() => {
                                                        setCmdOpen(false)
                                                        router.push("/dashboard/staff/schedules")
                                                    }}
                                                    className="cursor-pointer"
                                                >
                                                    <Users className="mr-2 h-4 w-4" />
                                                    Go to schedules
                                                </CommandItem>
                                            </CommandGroup>

                                            <CommandSeparator />

                                            <CommandGroup heading="Groups">
                                                {groups.slice(0, 12).map((g) => (
                                                    <CommandItem
                                                        key={g.id}
                                                        value={`${g.title} ${g.program ?? ""} ${g.term ?? ""}`}
                                                        onSelect={() => {
                                                            setCmdOpen(false)
                                                            openGroup(g.id)
                                                        }}
                                                        className="cursor-pointer"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="truncate text-sm font-medium">{g.title}</div>
                                                            <div className="truncate text-xs text-muted-foreground">
                                                                {[g.program, g.term].filter(Boolean).join(" • ") || g.id}
                                                            </div>
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </DialogContent>
                            </Dialog>
                        </>
                    )}
                </div>
            </TooltipProvider>
        </DashboardLayout>
    )
}
