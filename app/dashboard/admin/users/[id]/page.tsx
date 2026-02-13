"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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
    const [saving, setSaving] = React.useState(false)
    const [deleting, setDeleting] = React.useState(false)

    const [error, setError] = React.useState<string | null>(null)
    const [success, setSuccess] = React.useState<string | null>(null)

    const [user, setUser] = React.useState<UserRecord | null>(null)

    const [name, setName] = React.useState("")
    const [email, setEmail] = React.useState("")
    const [role, setRole] = React.useState<ThesisRole>("student")
    const [status, setStatus] = React.useState<UserStatus>("active")

    const [confirmDelete, setConfirmDelete] = React.useState(false)

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

    const handleSaveProfile = React.useCallback(async () => {
        if (!user) return

        setSaving(true)
        setError(null)
        setSuccess(null)

        try {
            const res = await fetch(`/api/users/${user.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    email: email.trim(),
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
            setSaving(false)
        }
    }, [user, name, email, role, hydrateForm])

    const handleSaveStatus = React.useCallback(async () => {
        if (!user) return

        setSaving(true)
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
            setSaving(false)
        }
    }, [user, status, hydrateForm])

    const handleDelete = React.useCallback(async () => {
        if (!user) return

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
    }, [user, router])

    return (
        <DashboardLayout title="User Details" description="View and manage this user account.">
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline">
                        <Link href="/dashboard/admin/users">Back to Users</Link>
                    </Button>
                    <Button variant="outline" onClick={() => void loadUser()} disabled={loading || saving}>
                        Refresh
                    </Button>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                {success ? (
                    <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">
                        {success}
                    </div>
                ) : null}

                {loading ? (
                    <div className="space-y-3">
                        <div className="h-24 animate-pulse rounded-lg border bg-muted/40" />
                        <div className="h-72 animate-pulse rounded-lg border bg-muted/40" />
                    </div>
                ) : !user ? (
                    <div className="rounded-lg border bg-card p-4">
                        <p className="text-sm text-muted-foreground">User not found.</p>
                    </div>
                ) : (
                    <>
                        <section className="rounded-lg border bg-card p-4">
                            <h2 className="text-sm font-semibold">Account Metadata</h2>

                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <div>
                                    <p className="text-xs text-muted-foreground">User ID</p>
                                    <p className="mt-1 break-all text-sm font-medium">{user.id}</p>
                                </div>

                                <div>
                                    <p className="text-xs text-muted-foreground">Avatar Key</p>
                                    <p className="mt-1 break-all text-sm font-medium">
                                        {user.avatar_key ? user.avatar_key : "No avatar key"}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-xs text-muted-foreground">Created At</p>
                                    <p className="mt-1 text-sm font-medium">{formatDate(user.created_at)}</p>
                                </div>

                                <div>
                                    <p className="text-xs text-muted-foreground">Updated At</p>
                                    <p className="mt-1 text-sm font-medium">{formatDate(user.updated_at)}</p>
                                </div>
                            </div>
                        </section>

                        <section className="rounded-lg border bg-card p-4">
                            <h2 className="text-sm font-semibold">Profile</h2>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Email</label>
                                    <Input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        autoComplete="off"
                                    />
                                </div>
                            </div>

                            <div className="mt-4 space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Role</p>
                                <div className="flex flex-wrap gap-2">
                                    {ROLES.map((item) => (
                                        <Button
                                            key={item}
                                            type="button"
                                            variant={role === item ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => setRole(item)}
                                        >
                                            {toTitleCase(item)}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <Button onClick={() => void handleSaveProfile()} disabled={saving || deleting}>
                                    {saving ? "Saving..." : "Save Profile"}
                                </Button>
                            </div>
                        </section>

                        <section className="rounded-lg border bg-card p-4">
                            <h2 className="text-sm font-semibold">Status</h2>

                            <div className="mt-3 flex flex-wrap gap-2">
                                {STATUSES.map((item) => (
                                    <Button
                                        key={item}
                                        type="button"
                                        variant={status === item ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setStatus(item)}
                                    >
                                        {toTitleCase(item)}
                                    </Button>
                                ))}
                            </div>

                            <div className="mt-4">
                                <Button onClick={() => void handleSaveStatus()} disabled={saving || deleting}>
                                    {saving ? "Saving..." : "Save Status"}
                                </Button>
                            </div>
                        </section>

                        <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                            <h2 className="text-sm font-semibold text-destructive">Danger Zone</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Deleting this user permanently removes the account.
                            </p>

                            {!confirmDelete ? (
                                <div className="mt-4">
                                    <Button
                                        variant="outline"
                                        onClick={() => setConfirmDelete(true)}
                                        disabled={saving || deleting}
                                    >
                                        Delete User
                                    </Button>
                                </div>
                            ) : (
                                <div className="mt-4 rounded-md border border-destructive/30 bg-background p-3">
                                    <p className="text-sm">
                                        Confirm delete for <span className="font-semibold">{user.email}</span>?
                                    </p>
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={() => setConfirmDelete(false)}
                                            disabled={deleting}
                                        >
                                            Cancel
                                        </Button>
                                        <Button onClick={() => void handleDelete()} disabled={deleting}>
                                            {deleting ? "Deleting..." : "Yes, Delete User"}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>
        </DashboardLayout>
    )
}
