"use client"

import * as React from "react"
import Link from "next/link"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type ThesisRole = "student" | "staff" | "admin" | "panelist"
type UserStatus = "active" | "disabled"

type UserRecord = {
    id: string
    name: string
    email: string
    role: ThesisRole
    status: UserStatus
    avatar_key: string | null
    created_at: string
    updated_at: string
}

type UsersResponse = {
    items?: UserRecord[]
    error?: string
    message?: string
}

const ROLE_FILTERS: Array<"all" | ThesisRole> = ["all", "admin", "staff", "student", "panelist"]
const STATUS_FILTERS: Array<"all" | UserStatus> = ["all", "active", "disabled"]

function toTitleCase(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDate(value: string) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { error?: string; message?: string }
        return data.error || data.message || `Request failed (${res.status})`
    } catch {
        return `Request failed (${res.status})`
    }
}

export default function AdminUsersPage() {
    const [users, setUsers] = React.useState<UserRecord[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [roleFilter, setRoleFilter] = React.useState<"all" | ThesisRole>("all")
    const [statusFilter, setStatusFilter] = React.useState<"all" | UserStatus>("all")

    const [busyUserId, setBusyUserId] = React.useState<string | null>(null)

    const loadUsers = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch("/api/users", { cache: "no-store" })
            const data = (await res.json()) as UsersResponse

            if (!res.ok) {
                throw new Error(data.error || data.message || "Failed to fetch users.")
            }

            const safeItems = Array.isArray(data.items) ? data.items : []
            setUsers(safeItems)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch users.")
            setUsers([])
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void loadUsers()
    }, [loadUsers])

    const filteredUsers = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return users.filter((u) => {
            if (roleFilter !== "all" && u.role !== roleFilter) return false
            if (statusFilter !== "all" && u.status !== statusFilter) return false

            if (!q) return true
            return (
                u.name.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                u.id.toLowerCase().includes(q)
            )
        })
    }, [users, search, roleFilter, statusFilter])

    const setUserStatus = React.useCallback(
        async (user: UserRecord, nextStatus: UserStatus) => {
            if (busyUserId) return
            setBusyUserId(user.id)

            try {
                const res = await fetch(`/api/users/${user.id}/status`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: nextStatus }),
                })

                if (!res.ok) {
                    throw new Error(await readErrorMessage(res))
                }

                setUsers((prev) =>
                    prev.map((item) => (item.id === user.id ? { ...item, status: nextStatus } : item)),
                )
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to update user status.")
            } finally {
                setBusyUserId(null)
            }
        },
        [busyUserId],
    )

    return (
        <DashboardLayout title="Users" description="Manage all user accounts across roles.">
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by name, email, or ID"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />

                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={() => void loadUsers()} disabled={loading}>
                                    Refresh
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by role</p>
                            <div className="flex flex-wrap gap-2">
                                {ROLE_FILTERS.map((role) => {
                                    const active = roleFilter === role
                                    return (
                                        <Button
                                            key={role}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setRoleFilter(role)}
                                        >
                                            {toTitleCase(role)}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter by status</p>
                            <div className="flex flex-wrap gap-2">
                                {STATUS_FILTERS.map((status) => {
                                    const active = statusFilter === status
                                    return (
                                        <Button
                                            key={status}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setStatusFilter(status)}
                                        >
                                            {toTitleCase(status)}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Showing <span className="font-semibold text-foreground">{filteredUsers.length}</span>{" "}
                            of <span className="font-semibold text-foreground">{users.length}</span> user(s).
                        </p>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                <div className="overflow-x-auto rounded-lg border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-56">User</TableHead>
                                <TableHead className="min-w-56">Email</TableHead>
                                <TableHead className="min-w-28">Role</TableHead>
                                <TableHead className="min-w-28">Status</TableHead>
                                <TableHead className="min-w-40">Updated</TableHead>
                                <TableHead className="min-w-48 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <TableRow key={`skeleton-${i}`}>
                                        <TableCell colSpan={6}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredUsers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                        No users found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredUsers.map((user) => {
                                    const disabling = busyUserId === user.id
                                    const nextStatus: UserStatus = user.status === "active" ? "disabled" : "active"

                                    return (
                                        <TableRow key={user.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{user.name}</span>
                                                    <span className="text-xs text-muted-foreground">{user.id}</span>
                                                </div>
                                            </TableCell>

                                            <TableCell>{user.email}</TableCell>

                                            <TableCell>
                                                <span className="inline-flex rounded-md border px-2 py-1 text-xs font-medium">
                                                    {toTitleCase(user.role)}
                                                </span>
                                            </TableCell>

                                            <TableCell>
                                                <span
                                                    className={[
                                                        "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                        user.status === "active"
                                                            ? "border-primary/40 bg-primary/10 text-foreground"
                                                            : "border-muted-foreground/30 bg-muted text-muted-foreground",
                                                    ].join(" ")}
                                                >
                                                    {toTitleCase(user.status)}
                                                </span>
                                            </TableCell>

                                            <TableCell className="text-muted-foreground">
                                                {formatDate(user.updated_at)}
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button asChild variant="outline" size="sm">
                                                        <Link href={`/dashboard/admin/users/${user.id}`}>View</Link>
                                                    </Button>

                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => void setUserStatus(user, nextStatus)}
                                                        disabled={disabling}
                                                    >
                                                        {disabling
                                                            ? "Updating..."
                                                            : nextStatus === "disabled"
                                                                ? "Disable"
                                                                : "Activate"}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </DashboardLayout>
    )
}
