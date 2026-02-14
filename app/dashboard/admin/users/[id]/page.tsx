"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"

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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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

type ResendResponse = {
    message?: string
    error?: string
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

function resolveAvatarObjectUrl(avatarKey: string | null): string | null {
    const value = avatarKey?.trim()
    if (!value) return null
    return /^https?:\/\//i.test(value) ? value : null
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

async function postResendLoginCredentials(userId: string): Promise<string | null> {
    const endpoints = [
        `/api/users/${userId}/resend-login-credentials`,
        `/api/users/${userId}/resend-login-details`,
        `/api/users/${userId}/send-login-details`,
    ]

    for (const endpoint of endpoints) {
        const res = await fetch(endpoint, { method: "POST" })

        if (res.ok) {
            try {
                const data = (await res.json()) as ResendResponse
                return data.message || null
            } catch {
                return null
            }
        }

        if (res.status === 404 || res.status === 405) {
            continue
        }

        throw new Error(await readErrorMessage(res))
    }

    throw new Error(
        "Resend login credentials endpoint is unavailable. Please add an API route for resend login credentials.",
    )
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
    const [resendingCredentials, setResendingCredentials] = React.useState(false)
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
            const message = err instanceof Error ? err.message : "Failed to fetch user."
            setUser(null)
            setError(message)
            toast.error(message)
        } finally {
            setLoading(false)
        }
    }, [userId, hydrateForm])

    React.useEffect(() => {
        void loadUser()
    }, [loadUser])

    const avatarObjectUrl = React.useMemo(
        () => resolveAvatarObjectUrl(user?.avatar_key ?? null),
        [user?.avatar_key],
    )

    const copyAvatarObjectUrl = React.useCallback(async () => {
        if (!avatarObjectUrl) return
        try {
            await navigator.clipboard.writeText(avatarObjectUrl)
            toast.success("Avatar object URL copied.")
        } catch {
            toast.error("Unable to copy avatar object URL.")
        }
    }, [avatarObjectUrl])

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
            const msg = "Name is required."
            setError(msg)
            toast.error(msg)
            return
        }

        if (!cleanedEmail || !isValidEmail(cleanedEmail)) {
            const msg = "Please provide a valid email address."
            setError(msg)
            toast.error(msg)
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
            const successMsg = "User profile updated successfully."
            setSuccess(successMsg)
            toast.success(successMsg)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to update profile."
            setError(message)
            toast.error(message)
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
            const successMsg = "User status updated successfully."
            setSuccess(successMsg)
            toast.success(successMsg)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to update status."
            setError(message)
            toast.error(message)
        } finally {
            setSavingStatus(false)
        }
    }, [user, savingStatus, status, hydrateForm])

    const handleResendLoginCredentials = React.useCallback(async () => {
        if (!user || resendingCredentials) return

        setResendingCredentials(true)
        setError(null)
        setSuccess(null)

        try {
            const serverMessage = await postResendLoginCredentials(user.id)
            const successMsg = serverMessage || `Login credentials were resent to ${user.email}.`
            setSuccess(successMsg)
            toast.success(successMsg)
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to resend login credentials."
            setError(message)
            toast.error(message)
        } finally {
            setResendingCredentials(false)
        }
    }, [user, resendingCredentials])

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

            toast.success("User deleted successfully.")
            router.push("/dashboard/admin/users")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to delete user."
            setError(message)
            toast.error(message)
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
                                disabled={
                                    loading ||
                                    savingProfile ||
                                    savingStatus ||
                                    resendingCredentials ||
                                    deleting
                                }
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
                                        {avatarObjectUrl ? (
                                            <a
                                                href={avatarObjectUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                                aria-label={`Open ${user.name}'s avatar image`}
                                                title="Open avatar image"
                                            >
                                                <Avatar className="h-12 w-12">
                                                    <AvatarImage
                                                        src={avatarObjectUrl}
                                                        alt={`${user.name} avatar`}
                                                        className="h-full w-full object-cover"
                                                    />
                                                    <AvatarFallback>
                                                        {getInitials(user.name)}
                                                    </AvatarFallback>
                                                </Avatar>
                                            </a>
                                        ) : (
                                            <Avatar className="h-12 w-12">
                                                <AvatarFallback>
                                                    {getInitials(user.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                        )}

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
                                        <p className="text-xs text-muted-foreground">
                                            Avatar Object URL
                                        </p>

                                        {avatarObjectUrl ? (
                                            <div className="mt-2 space-y-3">
                                                <Input
                                                    value={avatarObjectUrl}
                                                    readOnly
                                                    aria-label="Avatar object URL"
                                                />
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() =>
                                                            void copyAvatarObjectUrl()
                                                        }
                                                    >
                                                        Copy URL
                                                    </Button>
                                                    <Button asChild size="sm" variant="outline">
                                                        <a
                                                            href={avatarObjectUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            Open Image
                                                        </a>
                                                    </Button>
                                                </div>
                                                <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
                                                    <Avatar className="h-14 w-14">
                                                        <AvatarImage
                                                            src={avatarObjectUrl}
                                                            alt={`${user.name} avatar preview`}
                                                            className="h-full w-full object-cover"
                                                        />
                                                        <AvatarFallback>
                                                            {getInitials(user.name)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <p className="text-xs text-muted-foreground">
                                                        Live preview from saved avatar object URL.
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="mt-1 break-all text-sm font-medium">
                                                {user.avatar_key || "No avatar object URL"}
                                            </p>
                                        )}
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
                                                    resendingCredentials ||
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
                                                    resendingCredentials ||
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
                                                    resendingCredentials ||
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
                                                    resendingCredentials ||
                                                    deleting
                                                }
                                            >
                                                Toggle to{" "}
                                                {status === "active"
                                                    ? "Disabled"
                                                    : "Active"}
                                            </Button>
                                        </div>

                                        <Separator />

                                        <div className="rounded-md border p-4">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <p className="text-sm font-medium">
                                                        Login Credentials
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        Resend login credentials to{" "}
                                                        <span className="font-medium">
                                                            {user.email}
                                                        </span>
                                                        .
                                                    </p>
                                                </div>
                                                <Button
                                                    variant="secondary"
                                                    onClick={() =>
                                                        void handleResendLoginCredentials()
                                                    }
                                                    disabled={
                                                        resendingCredentials ||
                                                        savingProfile ||
                                                        savingStatus ||
                                                        deleting
                                                    }
                                                >
                                                    {resendingCredentials
                                                        ? "Sending..."
                                                        : "Resend Login Credential"}
                                                </Button>
                                            </div>
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
                                                        resendingCredentials ||
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
