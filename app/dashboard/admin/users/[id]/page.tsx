"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import DashboardLayout from "@/components/dashboard-layout"
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

type UserResponse = {
    item?: UserRecord
    error?: string
    message?: string
}

const ROLES: ThesisRole[] = ["admin", "staff", "student", "panelist"]
const STATUSES: UserStatus[] = ["active", "disabled"]

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

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { error?: string; message?: string }
        return data.error || data.message || `Request failed (${res.status})`
    } catch {
        return `Request failed (${res.status})`
    }
}

export default function AdminUserDetailsPage() {
    const params = useParams()
    const router = useRouter()

    const rawId = params?.id
    const userId = React.useMemo(() => {
        if (Array.isArray(rawId)) return rawId[0] ?? ""
        return typeof rawId === "string" ? rawId : ""
    }, [rawId])

    const [loading, setLoading] = React.useState(true)
    const [savingProfile, setSavingProfile] = React.useState(false)
    const [savingStatus, setSavingStatus] = React.useState(false)
    const [deleting, setDeleting] = React.useState(false)

    const [error, setError] = React.useState<string | null>(null)
    const [success, setSuccess] = React.useState<string | null>(null)

    const [user, setUser] = React.useState<UserRecord | null>(null)

    const [name, setName] = React.useState("")
    const [email, setEmail] = React.useState("")
    const [role, setRole] = React.useState<ThesisRole>("student")
    const [status, setStatus] = React.useState<UserStatus>("active")

    const hydrateForm = React.useCallback((value: UserRecord) => {
        setName(value.name)
        setEmail(value.email)
        setRole(value.role)
        setStatus(value.status)
    }, [])

    const loadUser = React.useCallback(async () => {
        if (!userId) return

        setLoading(true)
        setError(null)
        setSuccess(null)

        try {
            const res = await fetch(`/api/users/${userId}`, { cache: "no-store" })
            const data = (await res.json()) as UserResponse

            if (!res.ok || !data.item) {
                throw new Error(data.error || data.message || "Failed to fetch user.")
            }

            setUser(data.item)
            hydrateForm(data.item)
        } catch (err) {
            setUser(null)
            setError(err instanceof Error ? err.message : "Failed to fetch user.")
        } finally {
            setLoading(false)
        }
    }, [userId, hydrateForm])

    React.useEffect(() => {
        void loadUser()
    }, [loadUser])

    const profileDirty = React.useMemo(() => {
        if (!user) return false
        return (
            name.trim() !== user.name ||
            email.trim().toLowerCase() !== user.email.toLowerCase() ||
            role !== user.role
        )
    }, [user, name, email, role])

    const statusDirty = React.useMemo(() => {
        if (!user) return false
        return status !== user.status
    }, [user, status])

    const handleSaveProfile = React.useCallback(async () => {
        if (!user || savingProfile) return

        const cleanedName = name.trim()
        const cleanedEmail = email.trim().toLowerCase()

        setError(null)
        setSuccess(null)

        if (!cleanedName) {
            setError("Name is required.")
            return
        }

        if (!cleanedEmail || !isValidEmail(cleanedEmail)) {
            setError("Please provide a valid email address.")
            return
        }

        setSavingProfile(true)

        try {
            const res = await fetch(`/api/users/${user.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: cleanedName,
                    email: cleanedEmail,
                    role,
                }),
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = (await res.json()) as UserResponse
            const updated = data.item
            if (!updated) {
                throw new Error("User updated, but no payload was returned.")
            }

            setUser(updated)
            hydrateForm(updated)
            setSuccess("User profile updated successfully.")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update profile.")
        } finally {
            setSavingProfile(false)
        }
    }, [user, savingProfile, name, email, role, hydrateForm])

    const handleSaveStatus = React.useCallback(async () => {
        if (!user || savingStatus) return

        setSavingStatus(true)
        setError(null)
        setSuccess(null)

        try {
            const res = await fetch(`/api/users/${user.id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            })

            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            const data = (await res.json()) as UserResponse
            const updated = data.item
            if (!updated) {
                throw new Error("Status updated, but no payload was returned.")
            }

            setUser(updated)
            hydrateForm(updated)
            setSuccess("User status updated successfully.")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update status.")
        } finally {
            setSavingStatus(false)
        }
    }, [user, savingStatus, status, hydrateForm])

    const handleDelete = React.useCallback(async () => {
        if (!user || deleting) return

        setDeleting(true)
        setError(null)
        setSuccess(null)

        try {
            const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" })
            if (!res.ok) {
                throw new Error(await readErrorMessage(res))
            }

            router.push("/dashboard/admin/users")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete user.")
            setDeleting(false)
        }
    }, [user, deleting, router])

    return (
        <DashboardLayout title="User Details" description="View and manage this user account.">
            <div className="space-y-4">
                <Card>
                    <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-6">
                        <div className="flex flex-wrap items-center gap-2">
                            <Button asChild variant="outline">
                                <Link href="/dashboard/admin/users">Back to Users</Link>
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => void loadUser()}
                                disabled={loading || savingProfile || savingStatus || deleting}
                            >
                                {loading ? "Refreshing..." : "Refresh"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>Something went wrong</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                {success ? (
                    <Alert>
                        <AlertTitle>Success</AlertTitle>
                        <AlertDescription>{success}</AlertDescription>
                    </Alert>
                ) : null}

                {loading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-28 w-full rounded-lg" />
                        <Skeleton className="h-72 w-full rounded-lg" />
                    </div>
                ) : !user ? (
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">User not found.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle>Account Overview</CardTitle>
                                <CardDescription>
                                    Quick summary and metadata for this user.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-12 w-12">
                                            <AvatarFallback>
                                                {getInitials(user.name)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="text-base font-semibold">{user.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {user.email}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="outline">{toTitleCase(user.role)}</Badge>
                                        <Badge
                                            variant={
                                                user.status === "active"
                                                    ? "default"
                                                    : "secondary"
                                            }
                                        >
                                            {toTitleCase(user.status)}
                                        </Badge>
                                    </div>
                                </div>

                                <Separator />

                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="rounded-md border p-3">
                                        <p className="text-xs text-muted-foreground">User ID</p>
                                        <p className="mt-1 break-all text-sm font-medium">
                                            {user.id}
                                        </p>
                                    </div>

                                    <div className="rounded-md border p-3">
                                        <p className="text-xs text-muted-foreground">Avatar Key</p>
                                        <p className="mt-1 break-all text-sm font-medium">
                                            {user.avatar_key || "No avatar key"}
                                        </p>
                                    </div>

                                    <div className="rounded-md border p-3">
                                        <p className="text-xs text-muted-foreground">Created At</p>
                                        <p className="mt-1 text-sm font-medium">
                                            {formatDate(user.created_at)}
                                        </p>
                                    </div>

                                    <div className="rounded-md border p-3">
                                        <p className="text-xs text-muted-foreground">Updated At</p>
                                        <p className="mt-1 text-sm font-medium">
                                            {formatDate(user.updated_at)}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Tabs defaultValue="profile" className="space-y-4">
                            <TabsList className="grid w-full grid-cols-3 sm:w-96">
                                <TabsTrigger value="profile">Profile</TabsTrigger>
                                <TabsTrigger value="access">Access</TabsTrigger>
                                <TabsTrigger value="danger">Danger Zone</TabsTrigger>
                            </TabsList>

                            <TabsContent value="profile">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Profile</CardTitle>
                                        <CardDescription>
                                            Update identity and role information.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="user-name">Name</Label>
                                                <Input
                                                    id="user-name"
                                                    value={name}
                                                    onChange={(e) =>
                                                        setName(e.target.value)
                                                    }
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="user-email">Email</Label>
                                                <Input
                                                    id="user-email"
                                                    type="email"
                                                    value={email}
                                                    onChange={(e) =>
                                                        setEmail(e.target.value)
                                                    }
                                                    autoComplete="off"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Role</Label>
                                            <Select
                                                value={role}
                                                onValueChange={(value) =>
                                                    setRole(value as ThesisRole)
                                                }
                                            >
                                                <SelectTrigger className="w-full md:w-72">
                                                    <SelectValue placeholder="Select role" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {ROLES.map((item) => (
                                                        <SelectItem
                                                            key={item}
                                                            value={item}
                                                        >
                                                            {toTitleCase(item)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button
                                                onClick={() =>
                                                    void handleSaveProfile()
                                                }
                                                disabled={
                                                    savingProfile ||
                                                    savingStatus ||
                                                    deleting ||
                                                    !profileDirty
                                                }
                                            >
                                                {savingProfile
                                                    ? "Saving..."
                                                    : "Save Profile"}
                                            </Button>

                                            <Button
                                                variant="outline"
                                                onClick={() =>
                                                    user && hydrateForm(user)
                                                }
                                                disabled={
                                                    savingProfile ||
                                                    savingStatus ||
                                                    deleting ||
                                                    !profileDirty
                                                }
                                            >
                                                Reset Changes
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="access">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Access & Status</CardTitle>
                                        <CardDescription>
                                            Control whether this user can access the system.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-2">
                                            <Label>Status</Label>
                                            <Select
                                                value={status}
                                                onValueChange={(value) =>
                                                    setStatus(
                                                        value as UserStatus,
                                                    )
                                                }
                                            >
                                                <SelectTrigger className="w-full md:w-72">
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {STATUSES.map((item) => (
                                                        <SelectItem
                                                            key={item}
                                                            value={item}
                                                        >
                                                            {toTitleCase(item)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button
                                                onClick={() =>
                                                    void handleSaveStatus()
                                                }
                                                disabled={
                                                    savingStatus ||
                                                    savingProfile ||
                                                    deleting ||
                                                    !statusDirty
                                                }
                                            >
                                                {savingStatus
                                                    ? "Saving..."
                                                    : "Save Status"}
                                            </Button>

                                            <Button
                                                variant="outline"
                                                onClick={() =>
                                                    setStatus(
                                                        status === "active"
                                                            ? "disabled"
                                                            : "active",
                                                    )
                                                }
                                                disabled={
                                                    savingStatus ||
                                                    savingProfile ||
                                                    deleting
                                                }
                                            >
                                                Toggle to{" "}
                                                {status === "active"
                                                    ? "Disabled"
                                                    : "Active"}
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="danger">
                                <Card className="border-destructive/40">
                                    <CardHeader>
                                        <CardTitle className="text-destructive">
                                            Danger Zone
                                        </CardTitle>
                                        <CardDescription>
                                            Deleting this user permanently removes the account.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant="destructive"
                                                    disabled={
                                                        savingProfile ||
                                                        savingStatus ||
                                                        deleting
                                                    }
                                                >
                                                    Delete User
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>
                                                        Delete this user?
                                                    </AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This action cannot be
                                                        undone. This will
                                                        permanently delete{" "}
                                                        <span className="font-medium">
                                                            {user.email}
                                                        </span>
                                                        .
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel
                                                        disabled={deleting}
                                                    >
                                                        Cancel
                                                    </AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() =>
                                                            void handleDelete()
                                                        }
                                                        disabled={deleting}
                                                    >
                                                        {deleting
                                                            ? "Deleting..."
                                                            : "Yes, delete user"}
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </>
                )}
            </div>
        </DashboardLayout>
    )
}
