/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, ChevronsUpDown, Save, Trash2, UserPlus } from "lucide-react"

import { cn } from "@/lib/utils"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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

type UserPick = { id: string; name: string; email: string; role: "student" | "staff" | "admin"; status?: "active" | "disabled" }

type MemberRow = {
    id: string
    name: string
    email: string
    program: string | null
    section: string | null
    status: "active" | "disabled"
}

async function searchUsers(params: { q: string; role?: string; status?: string; limit?: number }) {
    const sp = new URLSearchParams()
    sp.set("resource", "users")
    sp.set("q", params.q ?? "")
    sp.set("limit", String(params.limit ?? 10))
    sp.set("offset", "0")
    if (params.role) sp.set("role", params.role)
    if (params.status) sp.set("status", params.status)

    const res = await fetch(`/api/profiles?${sp.toString()}`, { method: "GET" })
    const data = (await res.json().catch(() => ({}))) as any
    if (!res.ok || !data?.ok) throw new Error(data?.message || "Failed to load users")
    return (data.users ?? []) as UserPick[]
}

function UserPicker(props: {
    placeholder: string
    value: UserPick | null
    onChange: (u: UserPick | null) => void
    search: (q: string) => Promise<UserPick[]>
    disabled?: boolean
    clearLabel?: string
}) {
    const [open, setOpen] = React.useState(false)
    const [q, setQ] = React.useState("")
    const [items, setItems] = React.useState<UserPick[]>([])
    const [loading, setLoading] = React.useState(false)

    React.useEffect(() => {
        let alive = true
        const t = setTimeout(async () => {
            setLoading(true)
            try {
                const out = await props.search(q)
                if (alive) setItems(out)
            } catch {
                if (alive) setItems([])
            } finally {
                if (alive) setLoading(false)
            }
        }, 250)
        return () => {
            alive = false
            clearTimeout(t)
        }
    }, [q, props])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between" disabled={props.disabled}>
                    {props.value ? (
                        <span className="line-clamp-1">
                            {props.value.name} <span className="text-muted-foreground">({props.value.email})</span>
                        </span>
                    ) : (
                        <span className="text-muted-foreground">{props.placeholder}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>

            <PopoverContent className="w-full p-0" align="start">
                <Command>
                    <CommandInput value={q} onValueChange={setQ} placeholder="Search by name or email…" />
                    <CommandList>
                        <CommandEmpty>{loading ? "Searching…" : "No matches found."}</CommandEmpty>

                        <CommandGroup heading="Results">
                            {items.map((u) => {
                                const selected = props.value?.id === u.id
                                const value = `${u.id} ${u.name} ${u.email}`
                                return (
                                    <CommandItem
                                        key={u.id}
                                        value={value}
                                        onSelect={() => {
                                            props.onChange(u)
                                            setOpen(false)
                                        }}
                                    >
                                        <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                                        <div className="min-w-0">
                                            <div className="line-clamp-1">{u.name}</div>
                                            <div className="line-clamp-1 text-xs text-muted-foreground">{u.email}</div>
                                        </div>
                                        <Badge variant="outline" className="ml-auto">
                                            {u.role}
                                        </Badge>
                                    </CommandItem>
                                )
                            })}
                        </CommandGroup>

                        <Separator />

                        <CommandGroup heading="Options">
                            <CommandItem
                                value="clear"
                                onSelect={() => {
                                    props.onChange(null)
                                    setOpen(false)
                                }}
                            >
                                {props.clearLabel ?? "Clear selection"}
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}

export default function ThesisGroupAdminEditor(props: {
    group: {
        id: string
        title: string
        program: string | null
        term: string | null
        adviserId: string | null
        adviserName: string | null
        adviserEmail: string | null
    }
    members: MemberRow[]
}) {
    const router = useRouter()

    const [busy, setBusy] = React.useState(false)

    // group fields
    const [title, setTitle] = React.useState(props.group.title ?? "")
    const [program, setProgram] = React.useState(props.group.program ?? "")
    const [term, setTerm] = React.useState(props.group.term ?? "")
    const [adviser, setAdviser] = React.useState<UserPick | null>(
        props.group.adviserId
            ? {
                id: props.group.adviserId,
                name: props.group.adviserName ?? "Selected adviser",
                email: props.group.adviserEmail ?? "",
                role: "staff",
            }
            : null
    )

    // members local state (so UI updates immediately)
    const [members, setMembers] = React.useState<MemberRow[]>(props.members ?? [])

    // add member picker
    const [studentPick, setStudentPick] = React.useState<UserPick | null>(null)

    // remove confirm
    const [removeOpen, setRemoveOpen] = React.useState(false)
    const [removeTarget, setRemoveTarget] = React.useState<MemberRow | null>(null)

    async function saveGroup() {
        if (busy) return

        const payload: Record<string, any> = {}
        const nextTitle = title.trim()
        const nextProgram = program.trim() || null
        const nextTerm = term.trim() || null
        const nextAdviserId = adviser?.id ?? null

        // send patch only if changed
        if (nextTitle !== (props.group.title ?? "")) payload.title = nextTitle
        if (nextProgram !== (props.group.program ?? null)) payload.program = nextProgram
        if (nextTerm !== (props.group.term ?? null)) payload.term = nextTerm
        if (nextAdviserId !== (props.group.adviserId ?? null)) payload.adviserId = nextAdviserId

        if (!nextTitle) {
            toast.error("Title is required.")
            return
        }

        if (Object.keys(payload).length === 0) {
            toast.message("No changes to save.")
            return
        }

        setBusy(true)
        const tId = toast.loading("Saving changes...")
        try {
            const res = await fetch(`/api/thesis?resource=groups&id=${encodeURIComponent(props.group.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const data = (await res.json().catch(() => ({}))) as any
            if (!res.ok || !data?.ok) {
                toast.error(data?.message || "Failed to update group.", { id: tId })
                return
            }
            toast.success("Group updated.", { id: tId })
            router.refresh()
        } catch {
            toast.error("Network error while saving.", { id: tId })
        } finally {
            setBusy(false)
        }
    }

    async function addMember() {
        if (busy) return
        if (!studentPick) {
            toast.error("Select a student to add.")
            return
        }

        setBusy(true)
        const tId = toast.loading("Adding member...")
        try {
            const res = await fetch("/api/thesis?resource=members", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId: props.group.id, studentId: studentPick.id }),
            })
            const data = (await res.json().catch(() => ({}))) as any
            if (!res.ok || !data?.ok) {
                toast.error(data?.message || "Failed to add member.", { id: tId })
                return
            }

            toast.success("Member added.", { id: tId })
            setStudentPick(null)
            router.refresh()
        } catch {
            toast.error("Network error while adding member.", { id: tId })
        } finally {
            setBusy(false)
        }
    }

    function requestRemove(m: MemberRow) {
        if (busy) return
        setRemoveTarget(m)
        setRemoveOpen(true)
    }

    async function confirmRemove() {
        if (!removeTarget) return
        setRemoveOpen(false)

        setBusy(true)
        const tId = toast.loading("Removing member...")
        try {
            const url = `/api/thesis?resource=members&groupId=${encodeURIComponent(props.group.id)}&studentId=${encodeURIComponent(removeTarget.id)}`
            const res = await fetch(url, { method: "DELETE" })
            const data = (await res.json().catch(() => ({}))) as any
            if (!res.ok || !data?.ok) {
                toast.error(data?.message || "Failed to remove member.", { id: tId })
                return
            }

            toast.success("Member removed.", { id: tId })
            setMembers((prev) => prev.filter((x) => x.id !== removeTarget.id))
            setRemoveTarget(null)
            router.refresh()
        } catch {
            toast.error("Network error while removing member.", { id: tId })
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-6">
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
                            This will remove <span className="font-medium">{removeTarget?.name ?? "this student"}</span> from the group.
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
                            {busy ? "Working..." : "Remove"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Card>
                <CardHeader>
                    <CardTitle>Edit group</CardTitle>
                    <CardDescription>Admin can update thesis record fields. This does not affect scheduling/scoring rules.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-12">
                    <div className="space-y-2 md:col-span-5">
                        <Label htmlFor="title">Title</Label>
                        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
                    </div>

                    <div className="space-y-2 md:col-span-3">
                        <Label htmlFor="program">Program</Label>
                        <Input id="program" value={program} onChange={(e) => setProgram(e.target.value)} disabled={busy} />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="term">Term</Label>
                        <Input id="term" value={term} onChange={(e) => setTerm(e.target.value)} disabled={busy} />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <Label>Adviser</Label>
                        <UserPicker
                            placeholder="Select staff/admin…"
                            value={adviser}
                            onChange={setAdviser}
                            disabled={busy}
                            clearLabel="Clear adviser (unassigned)"
                            search={async (q) => {
                                const staff = await searchUsers({ q, role: "staff", status: "active", limit: 10 })
                                const admins = await searchUsers({ q, role: "admin", status: "active", limit: 10 })
                                const merged = [...staff, ...admins]
                                return Array.from(new Map(merged.map((u) => [u.id, u])).values())
                            }}
                        />
                    </div>

                    <div className="md:col-span-12">
                        <Separator className="my-1" />
                        <div className="flex items-center justify-end">
                            <Button type="button" onClick={saveGroup} disabled={busy}>
                                <Save className="mr-2 h-4 w-4" />
                                {busy ? "Saving..." : "Save changes"}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Members</CardTitle>
                    <CardDescription>Admin can add/remove students assigned to this thesis group.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-12">
                        <div className="space-y-2 md:col-span-9">
                            <Label>Add student</Label>
                            <UserPicker
                                placeholder="Search student…"
                                value={studentPick}
                                onChange={setStudentPick}
                                disabled={busy}
                                clearLabel="Clear selection"
                                search={async (q) => await searchUsers({ q, role: "student", status: "active", limit: 10 })}
                            />
                        </div>
                        <div className="flex items-end md:col-span-3">
                            <Button type="button" className="w-full" onClick={addMember} disabled={busy || !studentPick}>
                                <UserPlus className="mr-2 h-4 w-4" />
                                Add member
                            </Button>
                        </div>
                    </div>

                    <Separator />

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Student</TableHead>
                                <TableHead className="hidden md:table-cell">Program</TableHead>
                                <TableHead className="hidden md:table-cell">Section</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
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
                                                <div className="pt-1">
                                                    <Badge variant={m.status === "active" ? "secondary" : "outline"}>{m.status}</Badge>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">{m.program ?? "—"}</TableCell>
                                        <TableCell className="hidden md:table-cell">{m.section ?? "—"}</TableCell>
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
                                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                                        No members assigned to this group.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
