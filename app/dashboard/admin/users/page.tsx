/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { toast } from "sonner"
import {
    ArrowUpDown,
    Eye,
    EyeOff,
    KeyRound,
    Plus,
    RefreshCw,
    Trash2,
    UserCheck,
    UserX,
    X,
} from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import DashboardLayout from "@/components/dashboard-layout"
import DataTable from "@/components/data-table"
import { useAuth } from "@/hooks/use-auth"

import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogCancel,
    AlertDialogAction,
} from "@/components/ui/alert-dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

type UserRow = {
    id: string
    name: string
    email: string
    role: "student" | "staff" | "admin"
    status: "active" | "disabled"
    avatar_key: string | null
    created_at: string
    updated_at: string
}

type ListUsersResponse =
    | { ok: true; total: number; users: UserRow[] }
    | { ok: false; message?: string }

type CreateUserResponse =
    | { ok: true; user: UserRow; generatedPassword: string | null }
    | { ok: false; message?: string }

type UpdateUserResponse =
    | { ok: true; user: UserRow }
    | { ok: false; message?: string }

function roleBasePath(role: string) {
    const r = String(role ?? "").toLowerCase()
    if (r === "student") return "/dashboard/student"
    if (r === "staff") return "/dashboard/staff"
    if (r === "admin") return "/dashboard/admin"
    return "/dashboard"
}

async function patchUserSilent(
    userId: string,
    patch: Partial<{ name: string; role: UserRow["role"]; status: UserRow["status"]; password: string }>
) {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
    })
    const data = (await res.json().catch(() => ({}))) as UpdateUserResponse
    if (!res.ok || !data.ok) {
        const msg = (data as any)?.message || "Update failed."
        return { ok: false as const, message: msg }
    }
    return { ok: true as const, user: data.user }
}

async function deleteUserSilent(userId: string) {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({} as any))
    if (!res.ok || !data.ok) {
        const msg = data?.message || "Delete failed."
        return { ok: false as const, message: msg }
    }
    return { ok: true as const }
}

export default function AdminUsersPage() {
    const { loading, user } = useAuth()

    const [q, setQ] = React.useState("")
    const [rows, setRows] = React.useState<UserRow[]>([])
    const [total, setTotal] = React.useState(0)
    const [busy, setBusy] = React.useState(false)

    // DataTable selection -> for bulk actions
    const [selected, setSelected] = React.useState<UserRow[]>([])
    const [selectionReset, setSelectionReset] = React.useState(0)

    // Create dialog
    const [createOpen, setCreateOpen] = React.useState(false)
    const [cName, setCName] = React.useState("")
    const [cEmail, setCEmail] = React.useState("")
    const [cRole, setCRole] = React.useState<UserRow["role"]>("student")
    const [cPassword, setCPassword] = React.useState("")
    const [cShowPassword, setCShowPassword] = React.useState(false)

    // Single reset dialog
    const [resetOpen, setResetOpen] = React.useState(false)
    const [resetUser, setResetUser] = React.useState<UserRow | null>(null)
    const [rPassword, setRPassword] = React.useState("")
    const [rShowPassword, setRShowPassword] = React.useState(false)

    // Single delete confirm dialog (AlertDialog)
    const [deleteOpen, setDeleteOpen] = React.useState(false)
    const [deleteUserRow, setDeleteUserRow] = React.useState<UserRow | null>(null)

    // Bulk reset dialog
    const [bulkResetOpen, setBulkResetOpen] = React.useState(false)
    const [bulkPassword, setBulkPassword] = React.useState("")
    const [bulkShowPassword, setBulkShowPassword] = React.useState(false)

    // Bulk delete confirm dialog (AlertDialog)
    const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false)

    const isAdmin = String(user?.role ?? "").toLowerCase() === "admin"

    const clearSelection = React.useCallback(() => {
        setSelected([])
        setSelectionReset((k) => k + 1)
    }, [])

    const fetchUsers = React.useCallback(async () => {
        setBusy(true)
        try {
            const params = new URLSearchParams()
            if (q.trim()) params.set("q", q.trim())
            params.set("limit", "200")
            params.set("offset", "0")

            const res = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" })
            const data = (await res.json()) as ListUsersResponse

            if (!res.ok || !data.ok) {
                const msg = (data as any)?.message || "Failed to load users."
                toast.error(msg)
                setRows([])
                setTotal(0)
                return
            }

            setRows(data.users)
            setTotal(data.total)
        } catch {
            toast.error("Network error while loading users.")
        } finally {
            setBusy(false)
        }
    }, [q])

    React.useEffect(() => {
        if (loading) return
        if (!user) return
        if (!isAdmin) {
            toast.error("Forbidden: Admins only.")
            window.location.href = roleBasePath(user.role)
            return
        }
        fetchUsers()
    }, [loading, user, isAdmin, fetchUsers])

    const updateUser = React.useCallback(
        async (
            userId: string,
            patch: Partial<{ name: string; role: UserRow["role"]; status: UserRow["status"]; password: string }>
        ) => {
            const tId = toast.loading("Saving...")
            try {
                const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(patch),
                })

                const data = (await res.json()) as UpdateUserResponse

                if (!res.ok || !data.ok) {
                    const msg = (data as any)?.message || "Update failed."
                    toast.error(msg, { id: tId })
                    return false
                }

                toast.success("Saved.", { id: tId })
                setRows((prev) => prev.map((r) => (r.id === userId ? data.user : r)))
                return true
            } catch {
                toast.error("Network error while saving.", { id: tId })
                return false
            }
        },
        []
    )

    const doDeleteUser = React.useCallback(async (userId: string) => {
        const tId = toast.loading("Deleting user...")
        try {
            const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" })
            const data = (await res.json().catch(() => ({}))) as any

            if (!res.ok || !data.ok) {
                const msg = data?.message || "Failed to delete user."
                toast.error(msg, { id: tId })
                return
            }

            toast.success("User deleted.", { id: tId })
            setRows((prev) => prev.filter((r) => r.id !== userId))
            setTotal((t) => Math.max(0, t - 1))
        } catch {
            toast.error("Network error while deleting user.", { id: tId })
        }
    }, [])

    // -------- BULK ACTIONS --------
    const bulkUpdateStatus = React.useCallback(
        async (status: UserRow["status"]) => {
            if (!selected.length) return

            const tId = toast.loading(`Updating ${selected.length} user(s)...`)
            setBusy(true)

            try {
                const results = await Promise.allSettled(selected.map((u) => patchUserSilent(u.id, { status })))

                const okUsers: UserRow[] = []
                const failures: string[] = []

                for (const r of results) {
                    if (r.status === "fulfilled" && r.value.ok) okUsers.push(r.value.user)
                    else {
                        const msg = r.status === "fulfilled" ? r.value.message : "Update failed."
                        failures.push(msg)
                    }
                }

                toast.success(`Updated: ${okUsers.length}/${selected.length}`, { id: tId })

                if (failures.length) {
                    toast.error(`Some updates failed (${failures.length}).`)
                }

                await fetchUsers()
                clearSelection()
            } catch {
                toast.error("Network error during bulk update.", { id: tId })
            } finally {
                setBusy(false)
            }
        },
        [selected, fetchUsers, clearSelection]
    )

    const bulkResetPassword = React.useCallback(
        async (password: string) => {
            if (!selected.length) return
            if (password.trim().length < 8) {
                toast.error("Password too short (min 8 characters).")
                return
            }

            const tId = toast.loading(`Resetting passwords for ${selected.length} user(s)...`)
            setBusy(true)

            try {
                const results = await Promise.allSettled(selected.map((u) => patchUserSilent(u.id, { password: password.trim() })))

                const okCount = results.filter((r) => r.status === "fulfilled" && r.value.ok).length
                const failCount = selected.length - okCount

                toast.success(`Passwords reset: ${okCount}/${selected.length}`, { id: tId })
                if (failCount) toast.error(`Some resets failed (${failCount}).`)

                setBulkResetOpen(false)
                setBulkPassword("")
                setBulkShowPassword(false)

                await fetchUsers()
                clearSelection()
            } catch {
                toast.error("Network error during bulk password reset.", { id: tId })
            } finally {
                setBusy(false)
            }
        },
        [selected, fetchUsers, clearSelection]
    )

    const bulkDelete = React.useCallback(async () => {
        if (!selected.length) return

        const tId = toast.loading(`Deleting ${selected.length} user(s)...`)
        setBusy(true)

        try {
            const results = await Promise.allSettled(selected.map((u) => deleteUserSilent(u.id)))
            const okCount = results.filter((r) => r.status === "fulfilled" && r.value.ok).length
            const failCount = selected.length - okCount

            toast.success(`Deleted: ${okCount}/${selected.length}`, { id: tId })
            if (failCount) toast.error(`Some deletions failed (${failCount}).`)

            setBulkDeleteOpen(false)
            await fetchUsers()
            clearSelection()
        } catch {
            toast.error("Network error during bulk delete.", { id: tId })
        } finally {
            setBusy(false)
        }
    }, [selected, fetchUsers, clearSelection])

    // -------- COLUMNS --------
    const columns = React.useMemo<ColumnDef<UserRow>[]>(() => {
        return [
            {
                id: "select",
                header: ({ table }) => (
                    <Checkbox
                        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
                        onCheckedChange={(value: any) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                    />
                ),
                cell: ({ row }) => (
                    <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value: any) => row.toggleSelected(!!value)}
                        aria-label="Select row"
                    />
                ),
                enableSorting: false,
                enableHiding: false,
            },
            {
                accessorKey: "name",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        className="-ml-3 h-8"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Name <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                ),
                cell: ({ row }) => <div className="font-medium">{row.getValue("name") as string}</div>,
            },
            {
                accessorKey: "email",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        className="-ml-3 h-8"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Email <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                ),
                cell: ({ row }) => <div className="text-muted-foreground">{row.getValue("email") as string}</div>,
            },
            {
                accessorKey: "role",
                header: "Role",
                cell: ({ row }) => {
                    const u = row.original
                    return (
                        <Select
                            value={u.role}
                            onValueChange={(v) => updateUser(u.id, { role: v as UserRow["role"] })}
                            disabled={busy}
                        >
                            <SelectTrigger className="h-9 w-full">
                                <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="student">student</SelectItem>
                                <SelectItem value="staff">staff</SelectItem>
                                <SelectItem value="admin">admin</SelectItem>
                            </SelectContent>
                        </Select>
                    )
                },
            },
            {
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => {
                    const u = row.original
                    const active = u.status === "active"
                    return (
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={active ? "default" : "secondary"} className="capitalize">
                                {u.status}
                            </Badge>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => updateUser(u.id, { status: active ? "disabled" : "active" })}
                            >
                                {active ? "Disable" : "Enable"}
                            </Button>
                        </div>
                    )
                },
            },
            {
                id: "actions",
                header: "Actions",
                enableHiding: false,
                cell: ({ row }) => {
                    const u = row.original
                    return (
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                    setResetUser(u)
                                    setRPassword("")
                                    setRShowPassword(false)
                                    setResetOpen(true)
                                }}
                            >
                                <KeyRound className="mr-2 h-4 w-4" />
                                Reset password
                            </Button>

                            <Button
                                variant="destructive"
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                    setDeleteUserRow(u)
                                    setDeleteOpen(true)
                                }}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </Button>
                        </div>
                    )
                },
            },
        ]
    }, [updateUser, busy])

    async function onCreateUser(e: React.FormEvent) {
        e.preventDefault()
        if (!cName.trim() || !cEmail.trim()) return

        const tId = toast.loading("Creating user...")
        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: cName.trim(),
                    email: cEmail.trim(),
                    role: cRole,
                    password: cPassword.trim() || undefined,
                }),
            })

            const data = (await res.json()) as CreateUserResponse

            if (!res.ok || !data.ok) {
                const msg = (data as any)?.message || "Failed to create user."
                toast.error(msg, { id: tId })
                return
            }

            toast.success("User created.", { id: tId })

            if (data.generatedPassword) {
                toast.message("Temporary password generated", {
                    description: `Copy this password now: ${data.generatedPassword}`,
                })
            }

            setCreateOpen(false)
            setCName("")
            setCEmail("")
            setCRole("student")
            setCPassword("")
            setCShowPassword(false)

            await fetchUsers()
            clearSelection()
        } catch {
            toast.error("Network error while creating user.", { id: tId })
        }
    }

    if (loading) {
        return (
            <DashboardLayout title="Users">
                <div className="space-y-3">
                    <Skeleton className="h-10 w-72" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </DashboardLayout>
        )
    }

    if (!user) {
        return (
            <DashboardLayout title="Users">
                <Card>
                    <CardContent className="p-6">
                        <div className="text-sm text-muted-foreground">Please sign in.</div>
                    </CardContent>
                </Card>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout title="Manage Users">
            <div className="space-y-4">
                <Card>
                    <CardHeader className="pb-0">
                        <CardTitle>Users</CardTitle>
                        <CardDescription>
                            Create users, change roles/status, reset passwords, and delete users. Total: {total}
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="p-4 md:p-6 pt-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <div className="flex items-center gap-2">
                                    <Input
                                        placeholder="Search name/email (server)..."
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        className="w-full sm:w-64"
                                    />
                                    <Button variant="outline" onClick={fetchUsers} disabled={busy}>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Refresh
                                    </Button>
                                </div>

                                <Button onClick={() => setCreateOpen(true)} disabled={busy}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create user
                                </Button>
                            </div>
                        </div>

                        {/* Bulk actions bar */}
                        <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="text-sm text-muted-foreground">
                                Selected: <span className="font-medium text-foreground">{selected.length}</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!selected.length || busy}
                                    onClick={() => bulkUpdateStatus("active")}
                                >
                                    <UserCheck className="mr-2 h-4 w-4" />
                                    Enable selected
                                </Button>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!selected.length || busy}
                                    onClick={() => bulkUpdateStatus("disabled")}
                                >
                                    <UserX className="mr-2 h-4 w-4" />
                                    Disable selected
                                </Button>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!selected.length || busy}
                                    onClick={() => setBulkResetOpen(true)}
                                >
                                    <KeyRound className="mr-2 h-4 w-4" />
                                    Reset passwords
                                </Button>

                                <Button
                                    variant="destructive"
                                    size="sm"
                                    disabled={!selected.length || busy}
                                    onClick={() => setBulkDeleteOpen(true)}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete selected
                                </Button>

                                <Button variant="ghost" size="sm" disabled={!selected.length || busy} onClick={clearSelection}>
                                    <X className="mr-2 h-4 w-4" />
                                    Clear selection
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <DataTable<UserRow, unknown>
                    columns={columns}
                    data={rows}
                    filterColumnId="email"
                    filterPlaceholder="Filter email (client)..."
                    onSelectionChange={(sel) => setSelected(sel)}
                    selectionResetKey={selectionReset}
                />

                {/* Create User Dialog */}
                <Dialog
                    open={createOpen}
                    onOpenChange={(open) => {
                        setCreateOpen(open)
                        if (!open) {
                            setCName("")
                            setCEmail("")
                            setCRole("student")
                            setCPassword("")
                            setCShowPassword(false)
                        }
                    }}
                >
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create user</DialogTitle>
                            <DialogDescription>
                                Create a new account. If you leave password blank, a temporary password will be generated.
                            </DialogDescription>
                        </DialogHeader>

                        <form onSubmit={onCreateUser} className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="create-name">Name</Label>
                                <Input
                                    id="create-name"
                                    value={cName}
                                    onChange={(e) => setCName(e.target.value)}
                                    placeholder="Full name"
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="create-email">Email</Label>
                                <Input
                                    id="create-email"
                                    value={cEmail}
                                    onChange={(e) => setCEmail(e.target.value)}
                                    placeholder="user@domain.com"
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label>Role</Label>
                                <Select value={cRole} onValueChange={(v) => setCRole(v as UserRow["role"])}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="student">student</SelectItem>
                                        <SelectItem value="staff">staff</SelectItem>
                                        <SelectItem value="admin">admin</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="create-password">Password (optional)</Label>
                                <div className="relative">
                                    <Input
                                        id="create-password"
                                        value={cPassword}
                                        onChange={(e) => setCPassword(e.target.value)}
                                        placeholder="Leave blank to auto-generate"
                                        type={cShowPassword ? "text" : "password"}
                                        className="pr-10"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-1 top-1/2 -translate-y-1/2"
                                        onClick={() => setCShowPassword((v) => !v)}
                                        aria-label={cShowPassword ? "Hide password" : "Show password"}
                                    >
                                        {cShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <div className="text-xs text-muted-foreground">Minimum 8 characters if provided.</div>
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={busy}>
                                    Create
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* Single Reset Password Dialog */}
                <Dialog
                    open={resetOpen}
                    onOpenChange={(open) => {
                        setResetOpen(open)
                        if (!open) {
                            setResetUser(null)
                            setRPassword("")
                            setRShowPassword(false)
                        }
                    }}
                >
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Reset password</DialogTitle>
                            <DialogDescription>
                                {resetUser ? (
                                    <>
                                        Set a new password for <span className="font-medium">{resetUser.email}</span>. Sessions will be
                                        revoked.
                                    </>
                                ) : (
                                    "Set a new password. Sessions will be revoked."
                                )}
                            </DialogDescription>
                        </DialogHeader>

                        <form
                            onSubmit={async (e) => {
                                e.preventDefault()
                                if (!resetUser) return
                                if (rPassword.trim().length < 8) {
                                    toast.error("Password too short (min 8 characters).")
                                    return
                                }
                                const ok = await updateUser(resetUser.id, { password: rPassword.trim() })
                                if (ok) setResetOpen(false)
                            }}
                            className="grid gap-4"
                        >
                            <div className="grid gap-2">
                                <Label htmlFor="reset-password">New password</Label>
                                <div className="relative">
                                    <Input
                                        id="reset-password"
                                        value={rPassword}
                                        onChange={(e) => setRPassword(e.target.value)}
                                        type={rShowPassword ? "text" : "password"}
                                        placeholder="New password"
                                        className="pr-10"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-1 top-1/2 -translate-y-1/2"
                                        onClick={() => setRShowPassword((v) => !v)}
                                        aria-label={rShowPassword ? "Hide password" : "Show password"}
                                    >
                                        {rShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <div className="text-xs text-muted-foreground">Minimum 8 characters.</div>
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setResetOpen(false)} disabled={busy}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={busy}>
                                    Reset
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* Single Delete Confirm (AlertDialog) */}
                <AlertDialog
                    open={deleteOpen}
                    onOpenChange={(open) => {
                        setDeleteOpen(open)
                        if (!open) setDeleteUserRow(null)
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete user</AlertDialogTitle>
                            <AlertDialogDescription>
                                {deleteUserRow ? (
                                    <>
                                        This will permanently delete <span className="font-medium">{deleteUserRow.email}</span>. This action
                                        cannot be undone.
                                    </>
                                ) : (
                                    "This action cannot be undone."
                                )}
                            </AlertDialogDescription>
                        </AlertDialogHeader>

                        <AlertDialogFooter>
                            <AlertDialogCancel asChild>
                                <Button type="button" variant="outline" disabled={busy}>
                                    Cancel
                                </Button>
                            </AlertDialogCancel>

                            <AlertDialogAction asChild>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    disabled={busy}
                                    onClick={async () => {
                                        if (!deleteUserRow) return
                                        setDeleteOpen(false)
                                        await doDeleteUser(deleteUserRow.id)
                                    }}
                                    className="text-white"
                                >
                                    Delete
                                </Button>
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Bulk Reset Password Dialog */}
                <Dialog
                    open={bulkResetOpen}
                    onOpenChange={(open) => {
                        setBulkResetOpen(open)
                        if (!open) {
                            setBulkPassword("")
                            setBulkShowPassword(false)
                        }
                    }}
                >
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Reset passwords (bulk)</DialogTitle>
                            <DialogDescription>
                                This sets the <span className="font-medium">same password</span> for{" "}
                                <span className="font-medium">{selected.length}</span> selected user(s) and revokes their sessions.
                            </DialogDescription>
                        </DialogHeader>

                        <form
                            onSubmit={async (e) => {
                                e.preventDefault()
                                await bulkResetPassword(bulkPassword)
                            }}
                            className="grid gap-4"
                        >
                            <div className="grid gap-2">
                                <Label htmlFor="bulk-password">New password</Label>
                                <div className="relative">
                                    <Input
                                        id="bulk-password"
                                        value={bulkPassword}
                                        onChange={(e) => setBulkPassword(e.target.value)}
                                        type={bulkShowPassword ? "text" : "password"}
                                        placeholder="New password (min 8 characters)"
                                        className="pr-10"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-1 top-1/2 -translate-y-1/2"
                                        onClick={() => setBulkShowPassword((v) => !v)}
                                        aria-label={bulkShowPassword ? "Hide password" : "Show password"}
                                    >
                                        {bulkShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <div className="text-xs text-muted-foreground">Minimum 8 characters.</div>
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setBulkResetOpen(false)} disabled={busy}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={!selected.length || busy}>
                                    Reset {selected.length ? `(${selected.length})` : ""}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* Bulk Delete Confirm (AlertDialog) */}
                <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete selected users</AlertDialogTitle>
                            <AlertDialogDescription>
                                You are about to permanently delete <span className="font-medium">{selected.length}</span> user(s). This
                                cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>

                        <AlertDialogFooter>
                            <AlertDialogCancel asChild>
                                <Button type="button" variant="outline" disabled={busy}>
                                    Cancel
                                </Button>
                            </AlertDialogCancel>

                            <AlertDialogAction asChild>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={bulkDelete}
                                    disabled={!selected.length || busy}
                                >
                                    Delete {selected.length ? `(${selected.length})` : ""}
                                </Button>
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </DashboardLayout>
    )
}
