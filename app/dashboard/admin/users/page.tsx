"use client"

import * as React from "react"
import Link from "next/link"

import DashboardLayout from "@/components/dashboard-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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

type ProvisionResponse = {
    item?: UserRecord
    emailSent?: boolean
    error?: string
    message?: string
    emailError?: string
}

const ROLE_FILTERS: Array<"all" | ThesisRole> = [
    "all",
    "admin",
    "staff",
    "student",
    "panelist",
]
const STATUS_FILTERS: Array<"all" | UserStatus> = ["all", "active", "disabled"]

const CREATE_ROLES: ThesisRole[] = ["admin", "staff", "student", "panelist"]
const CREATE_STATUSES: UserStatus[] = ["active", "disabled"]

function toTitleCase(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDate(value: string) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function getInitials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "U"
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
}

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { error?: string; message?: string }
        return data.error || data.message || `Request failed (${res.status})`
    } catch {
        return `Request failed (${res.status})`
    }
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export default function AdminUsersPage() {
    const [users, setUsers] = React.useState<UserRecord[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [roleFilter, setRoleFilter] = React.useState<"all" | ThesisRole>("all")
    const [statusFilter, setStatusFilter] = React.useState<"all" | UserStatus>("all")

    const [busyUserId, setBusyUserId] = React.useState<string | null>(null)

    const [creating, setCreating] = React.useState(false)
    const [createError, setCreateError] = React.useState<string | null>(null)
    const [createSuccess, setCreateSuccess] = React.useState<string | null>(null)

    const [newName, setNewName] = React.useState("")
    const [newEmail, setNewEmail] = React.useState("")
    const [newRole, setNewRole] = React.useState<ThesisRole>("student")
    const [newStatus, setNewStatus] = React.useState<UserStatus>("active")

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

    const resetCreateForm = React.useCallback(() => {
        setNewName("")
        setNewEmail("")
        setNewRole("student")
        setNewStatus("active")
        setCreateError(null)
        setCreateSuccess(null)
    }, [])

    const handleCreateUser = React.useCallback(async () => {
        if (creating) return

        const name = newName.trim()
        const email = newEmail.trim().toLowerCase()

        setCreateError(null)
        setCreateSuccess(null)

        if (!name) {
            setCreateError("Name is required.")
            return
        }

        if (!email) {
            setCreateError("Email is required.")
            return
        }

        if (!isValidEmail(email)) {
            setCreateError("Please provide a valid email address.")
            return
        }

        setCreating(true)

        try {
            const res = await fetch("/api/users/provision", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    email,
                    role: newRole,
                    status: newStatus,
                    sendLoginDetails: true,
                }),
            })

            const data = (await res.json()) as ProvisionResponse

            if (!res.ok || !data.item) {
                throw new Error(data.error || data.message || "Failed to create user.")
            }

            setUsers((prev) => [
                data.item as UserRecord,
                ...prev.filter((u) => u.id !== data.item?.id),
            ])
            setCreateSuccess(
                data.message ||
                "User created successfully. Login details were sent to the user email.",
            )
            setNewName("")
            setNewEmail("")
            setNewRole("student")
            setNewStatus("active")
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : "Failed to create user.")
        } finally {
            setCreating(false)
        }
    }, [creating, newName, newEmail, newRole, newStatus])

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

    const stats = React.useMemo(() => {
        const total = users.length
        const active = users.filter((u) => u.status === "active").length
        const disabled = users.filter((u) => u.status === "disabled").length
        const admins = users.filter((u) => u.role === "admin").length

        return { total, active, disabled, admins }
    }, [users])

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
                    prev.map((item) =>
                        item.id === user.id ? { ...item, status: nextStatus } : item,
                    ),
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
                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>Something went wrong</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Total Users</CardDescription>
                            <CardTitle className="text-2xl">{stats.total}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Active</CardDescription>
                            <CardTitle className="text-2xl">{stats.active}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Disabled</CardDescription>
                            <CardTitle className="text-2xl">{stats.disabled}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Admins</CardDescription>
                            <CardTitle className="text-2xl">{stats.admins}</CardTitle>
                        </CardHeader>
                    </Card>
                </div>

                <Tabs defaultValue="directory" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-2 sm:w-80">
                        <TabsTrigger value="directory">User Directory</TabsTrigger>
                        <TabsTrigger value="create">Create User</TabsTrigger>
                    </TabsList>

                    <TabsContent value="directory" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>User Directory</CardTitle>
                                <CardDescription>
                                    Search, filter, and manage user accounts.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
                                    <Input
                                        placeholder="Search by name, email, or ID"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                    />

                                    <Select
                                        value={roleFilter}
                                        onValueChange={(value) =>
                                            setRoleFilter(value as "all" | ThesisRole)
                                        }
                                    >
                                        <SelectTrigger className="w-full lg:w-44">
                                            <SelectValue placeholder="Filter role" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ROLE_FILTERS.map((role) => (
                                                <SelectItem key={role} value={role}>
                                                    Role: {toTitleCase(role)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <Select
                                        value={statusFilter}
                                        onValueChange={(value) =>
                                            setStatusFilter(value as "all" | UserStatus)
                                        }
                                    >
                                        <SelectTrigger className="w-full lg:w-44">
                                            <SelectValue placeholder="Filter status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {STATUS_FILTERS.map((status) => (
                                                <SelectItem key={status} value={status}>
                                                    Status: {toTitleCase(status)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={() => void loadUsers()}
                                            disabled={loading}
                                        >
                                            {loading ? "Refreshing..." : "Refresh"}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            onClick={() => {
                                                setSearch("")
                                                setRoleFilter("all")
                                                setStatusFilter("all")
                                            }}
                                        >
                                            Clear
                                        </Button>
                                    </div>
                                </div>

                                <Separator />

                                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                    <span>Showing</span>
                                    <Badge variant="secondary">{filteredUsers.length}</Badge>
                                    <span>of</span>
                                    <Badge variant="outline">{users.length}</Badge>
                                    <span>user(s)</span>
                                </div>

                                <div className="overflow-x-auto rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="min-w-56">User</TableHead>
                                                <TableHead className="min-w-56">Email</TableHead>
                                                <TableHead className="min-w-28">Role</TableHead>
                                                <TableHead className="min-w-28">Status</TableHead>
                                                <TableHead className="min-w-40">Updated</TableHead>
                                                <TableHead className="min-w-48 text-right">
                                                    Actions
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>

                                        <TableBody>
                                            {loading ? (
                                                Array.from({ length: 6 }).map((_, i) => (
                                                    <TableRow key={`skeleton-${i}`}>
                                                        <TableCell colSpan={6}>
                                                            <Skeleton className="h-8 w-full" />
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : filteredUsers.length === 0 ? (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={6}
                                                        className="h-24 text-center text-muted-foreground"
                                                    >
                                                        No users found for the current filters.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                filteredUsers.map((user) => {
                                                    const disabling = busyUserId === user.id
                                                    const nextStatus: UserStatus =
                                                        user.status === "active"
                                                            ? "disabled"
                                                            : "active"

                                                    return (
                                                        <TableRow key={user.id}>
                                                            <TableCell>
                                                                <div className="flex items-center gap-3">
                                                                    <Avatar className="h-9 w-9">
                                                                        <AvatarFallback>
                                                                            {getInitials(user.name)}
                                                                        </AvatarFallback>
                                                                    </Avatar>
                                                                    <div className="min-w-0">
                                                                        <p className="truncate font-medium">
                                                                            {user.name}
                                                                        </p>
                                                                        <p className="truncate text-xs text-muted-foreground">
                                                                            {user.id}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </TableCell>

                                                            <TableCell className="align-middle">
                                                                <span className="break-all">
                                                                    {user.email}
                                                                </span>
                                                            </TableCell>

                                                            <TableCell>
                                                                <Badge variant="outline">
                                                                    {toTitleCase(user.role)}
                                                                </Badge>
                                                            </TableCell>

                                                            <TableCell>
                                                                <Badge
                                                                    variant={
                                                                        user.status === "active"
                                                                            ? "default"
                                                                            : "secondary"
                                                                    }
                                                                >
                                                                    {toTitleCase(user.status)}
                                                                </Badge>
                                                            </TableCell>

                                                            <TableCell className="text-muted-foreground">
                                                                {formatDate(user.updated_at)}
                                                            </TableCell>

                                                            <TableCell>
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <Button
                                                                        asChild
                                                                        variant="outline"
                                                                        size="sm"
                                                                    >
                                                                        <Link
                                                                            href={`/dashboard/admin/users/${user.id}`}
                                                                        >
                                                                            View
                                                                        </Link>
                                                                    </Button>

                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() =>
                                                                            void setUserStatus(
                                                                                user,
                                                                                nextStatus,
                                                                            )
                                                                        }
                                                                        disabled={disabling}
                                                                    >
                                                                        {disabling
                                                                            ? "Updating..."
                                                                            : nextStatus ===
                                                                                "disabled"
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
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="create">
                        <Card>
                            <CardHeader>
                                <CardTitle>Create User</CardTitle>
                                <CardDescription>
                                    A temporary password is auto-generated and sent to the user
                                    email after creation.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {createError ? (
                                    <Alert variant="destructive">
                                        <AlertTitle>Unable to create user</AlertTitle>
                                        <AlertDescription>{createError}</AlertDescription>
                                    </Alert>
                                ) : null}

                                {createSuccess ? (
                                    <Alert>
                                        <AlertTitle>User created</AlertTitle>
                                        <AlertDescription>{createSuccess}</AlertDescription>
                                    </Alert>
                                ) : null}

                                <form
                                    className="space-y-4"
                                    onSubmit={(e) => {
                                        e.preventDefault()
                                        void handleCreateUser()
                                    }}
                                >
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="new-user-name">Name</Label>
                                            <Input
                                                id="new-user-name"
                                                value={newName}
                                                onChange={(e) => setNewName(e.target.value)}
                                                placeholder="e.g. Jane Doe"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="new-user-email">Email</Label>
                                            <Input
                                                id="new-user-email"
                                                type="email"
                                                value={newEmail}
                                                onChange={(e) => setNewEmail(e.target.value)}
                                                placeholder="e.g. jane@example.com"
                                                autoComplete="off"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Role</Label>
                                            <Select
                                                value={newRole}
                                                onValueChange={(value) =>
                                                    setNewRole(value as ThesisRole)
                                                }
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select role" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {CREATE_ROLES.map((role) => (
                                                        <SelectItem key={role} value={role}>
                                                            {toTitleCase(role)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Status</Label>
                                            <Select
                                                value={newStatus}
                                                onValueChange={(value) =>
                                                    setNewStatus(value as UserStatus)
                                                }
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {CREATE_STATUSES.map((status) => (
                                                        <SelectItem key={status} value={status}>
                                                            {toTitleCase(status)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button type="submit" disabled={creating}>
                                            {creating
                                                ? "Creating..."
                                                : "Create User & Send Login Details"}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={resetCreateForm}
                                            disabled={creating}
                                        >
                                            Clear
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    )
}
