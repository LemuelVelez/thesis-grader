/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Search, UserPlus, Trash2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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

export type MemberRow = {
    id: string
    name: string
    email: string
    program: string | null
    section: string | null
    status: "active" | "disabled"
}

type StudentSearchRow = {
    id: string
    name: string
    email: string
    role?: string
    status: "active" | "disabled"
}

export default function GroupClient(props: {
    groupId: string
    initialMembers: MemberRow[]
}) {
    const router = useRouter()

    const [busy, setBusy] = React.useState(false)

    // members state (kept in sync with router.refresh)
    const [members, setMembers] = React.useState<MemberRow[]>(props.initialMembers)

    const membersSig = React.useMemo(() => {
        // stable signature for sync when server data refreshes
        const ids = props.initialMembers.map((m) => m.id).sort()
        return ids.join("|")
    }, [props.initialMembers])

    React.useEffect(() => {
        setMembers(props.initialMembers)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [membersSig, props.groupId])

    const memberIds = React.useMemo(() => new Set(members.map((m) => m.id)), [members])

    // student search
    const [studentQ, setStudentQ] = React.useState("")
    const [searching, setSearching] = React.useState(false)
    const [results, setResults] = React.useState<StudentSearchRow[]>([])
    const [searchError, setSearchError] = React.useState("")

    React.useEffect(() => {
        const q = studentQ.trim()
        setSearchError("")

        if (!q) {
            setResults([])
            return
        }

        const controller = new AbortController()
        const t = window.setTimeout(async () => {
            setSearching(true)
            try {
                // Uses existing profiles route: list users
                const url =
                    `/api/profiles?resource=users` +
                    `&q=${encodeURIComponent(q)}` +
                    `&role=student` +
                    `&status=active` +
                    `&limit=20&offset=0`

                const res = await fetch(url, { signal: controller.signal })
                const data = (await res.json().catch(() => ({}))) as any

                if (!res.ok || !data?.ok) {
                    setResults([])
                    setSearchError(data?.message || "Failed to search students.")
                    return
                }

                const users = (data?.users ?? []) as StudentSearchRow[]

                // ✅ IMPORTANT: exclude already-added members immediately
                const filtered = users
                    .filter((u) => String(u?.role ?? "").toLowerCase() === "student" || u.role == null)
                    .filter((u) => !memberIds.has(u.id))

                setResults(filtered)
            } catch (e: any) {
                if (e?.name === "AbortError") return
                setResults([])
                setSearchError("Network error while searching.")
            } finally {
                setSearching(false)
            }
        }, 250)

        return () => {
            window.clearTimeout(t)
            controller.abort()
        }
    }, [studentQ, memberIds])

    async function addMember(u: StudentSearchRow) {
        if (busy) return
        if (memberIds.has(u.id)) {
            toast.message("Student is already a member.")
            return
        }

        setBusy(true)
        const tId = toast.loading("Adding member...")
        try {
            const res = await fetch("/api/thesis?resource=members", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId: props.groupId, studentId: u.id }),
            })
            const data = (await res.json().catch(() => ({}))) as any

            if (!res.ok || !data?.ok) {
                toast.error(data?.message || "Failed to add member.", { id: tId })
                return
            }

            toast.success("Member added.", { id: tId })

            // optimistic update (so it disappears from search immediately)
            setMembers((prev) => [
                ...prev,
                {
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    program: null,
                    section: null,
                    status: u.status ?? "active",
                },
            ])

            // ✅ remove from current results immediately
            setResults((prev) => prev.filter((x) => x.id !== u.id))

            // keep query if you want to keep searching; but clear results if query was exact
            // setStudentQ("")
            router.refresh()
        } catch {
            toast.error("Network error while adding member.", { id: tId })
        } finally {
            setBusy(false)
        }
    }

    // remove confirmation
    const [removeOpen, setRemoveOpen] = React.useState(false)
    const [removeTarget, setRemoveTarget] = React.useState<MemberRow | null>(null)

    function requestRemove(m: MemberRow) {
        if (busy) return
        setRemoveTarget(m)
        setRemoveOpen(true)
    }

    async function confirmRemove() {
        const target = removeTarget
        if (!target) return

        setBusy(true)
        const tId = toast.loading("Removing member...")
        try {
            const url =
                `/api/thesis?resource=members` +
                `&groupId=${encodeURIComponent(props.groupId)}` +
                `&studentId=${encodeURIComponent(target.id)}`
            const res = await fetch(url, { method: "DELETE" })
            const data = (await res.json().catch(() => ({}))) as any

            if (!res.ok || !data?.ok) {
                toast.error(data?.message || "Failed to remove member.", { id: tId })
                return
            }

            toast.success("Member removed.", { id: tId })
            setMembers((prev) => prev.filter((x) => x.id !== target.id))
            setRemoveOpen(false)
            setRemoveTarget(null)

            router.refresh()
        } catch {
            toast.error("Network error while removing member.", { id: tId })
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-4">
            <AlertDialog
                open={removeOpen}
                onOpenChange={(open) => {
                    if (busy) return
                    setRemoveOpen(open)
                    if (!open) setRemoveTarget(null)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove member?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove{" "}
                            <span className="font-medium">{removeTarget?.name ?? "this student"}</span> from the group.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy} className="cursor-pointer">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy || !removeTarget}
                            onClick={(e) => {
                                e.preventDefault()
                                confirmRemove()
                            }}
                            className="bg-destructive cursor-pointer text-white hover:bg-destructive/90"
                        >
                            {busy ? "Removing..." : "Remove"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle>Members</CardTitle>
                    <CardDescription>Add/remove students assigned to this group.</CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">members: {members.length}</Badge>
                        <Badge variant="outline">Admin action</Badge>
                    </div>

                    <Separator />

                    <div className="grid gap-3 md:grid-cols-12">
                        <div className="space-y-2 md:col-span-6">
                            <Label htmlFor="student_search">Search student</Label>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="student_search"
                                    value={studentQ}
                                    onChange={(e) => setStudentQ(e.target.value)}
                                    placeholder="Search by name or email…"
                                    className="pl-8"
                                    disabled={busy}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Added students are automatically hidden from search results.
                            </p>
                        </div>

                        <div className="md:col-span-6">
                            {searchError ? (
                                <Alert variant="destructive">
                                    <AlertTitle>Search failed</AlertTitle>
                                    <AlertDescription>{searchError}</AlertDescription>
                                </Alert>
                            ) : null}

                            {studentQ.trim() && !searching ? (
                                <div className="text-xs text-muted-foreground">
                                    {results.length ? (
                                        <>
                                            Showing <span className="font-medium text-foreground">{results.length}</span> result(s)
                                        </>
                                    ) : (
                                        <>No available students found.</>
                                    )}
                                </div>
                            ) : null}

                            {searching ? (
                                <div className="text-xs text-muted-foreground">Searching…</div>
                            ) : null}
                        </div>
                    </div>

                    {results.length ? (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Student</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {results.map((u) => (
                                        <TableRow key={u.id}>
                                            <TableCell>
                                                <div className="space-y-0.5">
                                                    <div className="text-sm font-medium">{u.name}</div>
                                                    <div className="text-xs text-muted-foreground">{u.email}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    disabled={busy}
                                                    onClick={() => addMember(u)}
                                                >
                                                    <UserPlus className="mr-2 h-4 w-4" />
                                                    Add
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : null}

                    <Separator />

                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead className="hidden md:table-cell">Program</TableHead>
                                    <TableHead className="hidden md:table-cell">Section</TableHead>
                                    <TableHead className="text-right">Status</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {members.length ? (
                                    members.map((m) => (
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
                                                <Badge variant={m.status === "active" ? "secondary" : "outline"}>{m.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="sm"
                                                    disabled={busy}
                                                    onClick={() => requestRemove(m)}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Remove
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                                            No members assigned to this group.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
