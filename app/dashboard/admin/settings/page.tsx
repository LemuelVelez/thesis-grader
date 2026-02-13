/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Camera, Check, Copy, Eye, EyeOff, Info, KeyRound, Loader2, Shield, Trash2, Upload, User2 } from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
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
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type Me = {
    id: string
    name: string
    email: string
    role: string
    avatar_key: string | null
} | null

type SettingsPageConfig = {
    pageTitle: string
    pageDescription: string
    roleBadgeLabel: string
    roleIcon?: React.ReactNode
}

function initials(name: string) {
    const parts = String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
    const a = parts[0]?.[0] ?? "U"
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : ""
    return (a + b).toUpperCase()
}

function passwordScore(pw: string) {
    const s = String(pw || "")
    let score = 0
    if (s.length >= 8) score += 25
    if (s.length >= 12) score += 15
    if (/[a-z]/.test(s)) score += 15
    if (/[A-Z]/.test(s)) score += 15
    if (/\d/.test(s)) score += 15
    if (/[^A-Za-z0-9]/.test(s)) score += 15
    return Math.min(100, score)
}

export function RoleSettingsPage({ config }: { config: SettingsPageConfig }) {
    const router = useRouter()

    // ✅ global auth + avatar state
    const { loading, user, refresh, avatarUrl, refreshAvatarUrl } = useAuth()
    const me = (user as any as Me) ?? null

    // profile
    const [name, setName] = React.useState("")
    const [email, setEmail] = React.useState("")
    const [savingProfile, setSavingProfile] = React.useState(false)

    // password
    const [currentPassword, setCurrentPassword] = React.useState("")
    const [newPassword, setNewPassword] = React.useState("")
    const [confirmPassword, setConfirmPassword] = React.useState("")
    const [savingPassword, setSavingPassword] = React.useState(false)
    const [showCurrentPassword, setShowCurrentPassword] = React.useState(false)
    const [showNewPassword, setShowNewPassword] = React.useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)

    // avatar
    const fileRef = React.useRef<HTMLInputElement | null>(null)
    const [avatarBusy, setAvatarBusy] = React.useState(false)
    const [removeAvatarOpen, setRemoveAvatarOpen] = React.useState(false)

    // “preferences” (local-only UI; does not touch DB)
    const [prefCompact, setPrefCompact] = React.useState(false)
    const [prefTimeFormat, setPrefTimeFormat] = React.useState<"12h" | "24h">("12h")

    // hydrate inputs when user changes
    React.useEffect(() => {
        if (!me) return
        setName(String(me.name ?? ""))
        setEmail(String(me.email ?? ""))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [me?.id])

    async function copyToClipboard(text: string) {
        try {
            await navigator.clipboard.writeText(text)
            toast.success("Copied to clipboard.")
        } catch {
            toast.error("Unable to copy.")
        }
    }

    async function saveProfile(e: React.FormEvent) {
        e.preventDefault()
        if (!me) return
        if (savingProfile) return

        const payload = {
            name: name.trim(),
            email: email.trim(),
        }

        if (!payload.name) {
            toast.error("Name is required.")
            return
        }
        if (!payload.email) {
            toast.error("Email is required.")
            return
        }

        setSavingProfile(true)
        const tId = toast.loading("Saving profile...")
        try {
            const res = await fetch("/api/auth/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const data = (await res.json().catch(() => ({}))) as any

            if (!res.ok || !data?.ok) {
                toast.error(data?.message || "Failed to save profile.", { id: tId })
                return
            }

            toast.success("Profile updated.", { id: tId })

            await refresh()
            await refreshAvatarUrl()
            router.refresh()
        } catch {
            toast.error("Network error while saving profile.", { id: tId })
        } finally {
            setSavingProfile(false)
        }
    }

    async function savePassword(e: React.FormEvent) {
        e.preventDefault()
        if (!me) return
        if (savingPassword) return

        if (!currentPassword) {
            toast.error("Current password is required.")
            return
        }
        if (!newPassword) {
            toast.error("New password is required.")
            return
        }
        if (newPassword !== confirmPassword) {
            toast.error("Passwords do not match.")
            return
        }

        setSavingPassword(true)
        const tId = toast.loading("Updating password...")
        try {
            const res = await fetch("/api/auth/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword }),
            })
            const data = (await res.json().catch(() => ({}))) as any

            if (!res.ok || !data?.ok) {
                toast.error(data?.message || "Failed to update password.", { id: tId })
                return
            }

            toast.success("Password updated.", { id: tId })
            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
            setShowCurrentPassword(false)
            setShowNewPassword(false)
            setShowConfirmPassword(false)
        } catch {
            toast.error("Network error while updating password.", { id: tId })
        } finally {
            setSavingPassword(false)
        }
    }

    async function triggerAvatarPick() {
        if (avatarBusy) return
        fileRef.current?.click()
    }

    async function uploadAvatar(file: File) {
        if (!me) return
        if (avatarBusy) return

        if (!file.type.startsWith("image/")) {
            toast.error("Please select an image file.")
            return
        }

        setAvatarBusy(true)
        const tId = toast.loading("Preparing upload...")
        try {
            // 1) request presigned PUT URL + key
            const pres = await fetch("/api/users/me/avatar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: file.name, contentType: file.type }),
            })
            const presData = (await pres.json().catch(() => ({}))) as any
            if (!pres.ok || !presData?.ok || !presData?.url || !presData?.key) {
                toast.error(presData?.message || "Failed to prepare upload.", { id: tId })
                return
            }

            toast.loading("Uploading image...", { id: tId })

            // 2) PUT to S3
            const put = await fetch(presData.url, {
                method: "PUT",
                headers: { "Content-Type": file.type },
                body: file,
            })
            if (!put.ok) {
                toast.error("Upload failed. Please try again.", { id: tId })
                return
            }

            toast.loading("Saving avatar...", { id: tId })

            // 3) save key
            const patch = await fetch("/api/users/me/avatar", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: presData.key }),
            })
            const patchData = (await patch.json().catch(() => ({}))) as any
            if (!patch.ok || !patchData?.ok) {
                toast.error(patchData?.message || "Failed to save avatar.", { id: tId })
                return
            }

            toast.success("Avatar updated.", { id: tId })

            await refresh()
            await refreshAvatarUrl()
            router.refresh()
        } catch {
            toast.error("Network error while uploading avatar.", { id: tId })
        } finally {
            setAvatarBusy(false)
            if (fileRef.current) fileRef.current.value = ""
        }
    }

    async function removeAvatar() {
        if (!me) return
        if (avatarBusy) return

        setAvatarBusy(true)
        const tId = toast.loading("Removing avatar...")
        try {
            const res = await fetch("/api/users/me/avatar", { method: "DELETE" })
            const data = (await res.json().catch(() => ({}))) as any
            if (!res.ok || !data?.ok) {
                toast.error(data?.message || "Failed to remove avatar.", { id: tId })
                return
            }

            toast.success("Avatar removed.", { id: tId })

            await refresh()
            await refreshAvatarUrl()
            router.refresh()
        } catch {
            toast.error("Network error while removing avatar.", { id: tId })
        } finally {
            setAvatarBusy(false)
            setRemoveAvatarOpen(false)
        }
    }

    async function hardRefreshAll() {
        await refresh()
        await refreshAvatarUrl()
        router.refresh()
    }

    const pwScore = passwordScore(newPassword)

    return (
        <DashboardLayout title={config.pageTitle}>
            <TooltipProvider>
                <div className="space-y-6">
                    {/* Single hidden file input shared by BOTH mobile + desktop */}
                    <Input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) uploadAvatar(f)
                        }}
                    />

                    <div className="space-y-2">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="space-y-1">
                                <h1 className="text-xl font-semibold tracking-tight">{config.pageTitle}</h1>
                                <p className="text-sm text-muted-foreground">{config.pageDescription}</p>
                            </div>

                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="gap-2">
                                    {config.roleIcon ?? <Shield className="h-3.5 w-3.5" />}
                                    {config.roleBadgeLabel}
                                </Badge>
                                {!!me?.role && (
                                    <Badge variant="outline" className="capitalize">
                                        {me.role}
                                    </Badge>
                                )}
                            </div>
                        </div>

                        <Separator />
                    </div>

                    {/* LOADING */}
                    {loading ? (
                        <>
                            {/* ✅ Mobile loading UI */}
                            <div className="space-y-4 md:hidden">
                                <Card>
                                    <CardHeader>
                                        <Skeleton className="h-5 w-32" />
                                        <Skeleton className="h-4 w-52" />
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <Skeleton className="h-16 w-16 rounded-full" />
                                            <div className="flex-1 space-y-2">
                                                <Skeleton className="h-4 w-40" />
                                                <Skeleton className="h-3 w-52" />
                                            </div>
                                        </div>
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <Skeleton className="h-5 w-40" />
                                        <Skeleton className="h-4 w-60" />
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                    </CardContent>
                                </Card>
                            </div>

                            {/* ✅ Desktop loading UI (unchanged layout) */}
                            <div className="hidden md:grid gap-4 md:grid-cols-12">
                                <Card className="md:col-span-4">
                                    <CardHeader>
                                        <Skeleton className="h-5 w-40" />
                                        <Skeleton className="h-4 w-56" />
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                    </CardContent>
                                </Card>

                                <Card className="md:col-span-8">
                                    <CardHeader>
                                        <Skeleton className="h-5 w-44" />
                                        <Skeleton className="h-4 w-72" />
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                    </CardContent>
                                </Card>
                            </div>
                        </>
                    ) : !me ? (
                        <Alert variant="destructive">
                            <AlertTitle>Not signed in</AlertTitle>
                            <AlertDescription>Please log in to manage settings.</AlertDescription>
                        </Alert>
                    ) : (
                        <>
                            {/* ✅ MOBILE UI (no Tabs) */}
                            <div className="space-y-4 md:hidden">
                                {/* Account summary */}
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="flex items-center gap-2">
                                            <User2 className="h-4 w-4" />
                                            Account
                                        </CardTitle>
                                        <CardDescription>Quick identity, avatar, and actions.</CardDescription>
                                    </CardHeader>

                                    <CardContent className="space-y-4">
                                        {/* ✅ Avatar on top (mobile) */}
                                        <div className="flex flex-col items-center text-center gap-2">
                                            <Avatar className="h-20 w-20 overflow-hidden">
                                                <AvatarImage
                                                    src={avatarUrl ?? undefined}
                                                    alt={me.name}
                                                    className="h-full w-full object-cover"
                                                />
                                                <AvatarFallback>{initials(me.name)}</AvatarFallback>
                                            </Avatar>

                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-semibold">{me.name}</div>
                                                <div className="truncate text-xs text-muted-foreground">{me.email}</div>
                                            </div>

                                            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                                                <Badge variant="secondary" className="capitalize">
                                                    {me.role}
                                                </Badge>
                                                <Badge variant="outline">{me.avatar_key ? "Avatar set" : "No avatar"}</Badge>
                                            </div>
                                        </div>

                                        {/* ✅ Buttons vertical (mobile) */}
                                        <div className="flex flex-col gap-2">
                                            <Button
                                                variant="secondary"
                                                onClick={triggerAvatarPick}
                                                disabled={avatarBusy}
                                                className="w-full"
                                            >
                                                {avatarBusy ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Working...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload className="mr-2 h-4 w-4" />
                                                        Upload avatar
                                                    </>
                                                )}
                                            </Button>

                                            <Button
                                                variant="destructive"
                                                onClick={() => setRemoveAvatarOpen(true)}
                                                disabled={avatarBusy || !me.avatar_key}
                                                className="w-full"
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Remove avatar
                                            </Button>

                                            <Button variant="outline" onClick={hardRefreshAll} className="w-full">
                                                Refresh
                                            </Button>
                                        </div>

                                        <div className="rounded-md border p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="text-xs text-muted-foreground">User ID</div>
                                                    <div className="truncate font-mono text-xs">{me.id}</div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => copyToClipboard(me.id)}
                                                    aria-label="Copy user ID"
                                                >
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Profile */}
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle>Profile</CardTitle>
                                        <CardDescription>Update your name and email.</CardDescription>
                                    </CardHeader>

                                    <CardContent className="space-y-4">
                                        <form onSubmit={saveProfile} className="space-y-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="m_name">Name</Label>
                                                <Input
                                                    id="m_name"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    disabled={savingProfile}
                                                    placeholder="Your name"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="m_email">Email</Label>
                                                <Input
                                                    id="m_email"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    disabled={savingProfile}
                                                    placeholder="you@school.edu"
                                                />
                                            </div>

                                            {/* ✅ Buttons vertical (mobile) */}
                                            <div className="flex flex-col gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    disabled={savingProfile}
                                                    onClick={() => {
                                                        setName(me.name)
                                                        setEmail(me.email)
                                                    }}
                                                    className="w-full"
                                                >
                                                    Reset
                                                </Button>

                                                <Button type="submit" disabled={savingProfile} className="w-full">
                                                    {savingProfile ? (
                                                        <>
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            Saving...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Check className="mr-2 h-4 w-4" />
                                                            Save
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </form>

                                        <Accordion type="single" collapsible>
                                            <AccordionItem value="m-help-profile">
                                                <AccordionTrigger>What can I change here?</AccordionTrigger>
                                                <AccordionContent className="text-sm text-muted-foreground">
                                                    You can update your display name and email address. Changes apply immediately to your account.
                                                </AccordionContent>
                                            </AccordionItem>
                                        </Accordion>
                                    </CardContent>
                                </Card>

                                {/* Password */}
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle>Password</CardTitle>
                                        <CardDescription>Update your password securely.</CardDescription>
                                    </CardHeader>

                                    <CardContent className="space-y-4">
                                        <form onSubmit={savePassword} className="space-y-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="m_current_password">Current password</Label>
                                                <div className="relative">
                                                    <Input
                                                        id="m_current_password"
                                                        type={showCurrentPassword ? "text" : "password"}
                                                        value={currentPassword}
                                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                                        disabled={savingPassword}
                                                        autoComplete="current-password"
                                                        placeholder="••••••••"
                                                        className="pr-10"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                                                        onClick={() => setShowCurrentPassword((v) => !v)}
                                                        disabled={savingPassword}
                                                        aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                                                    >
                                                        {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label htmlFor="m_new_password">New password</Label>

                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <Button type="button" variant="ghost" size="sm" className="h-8 gap-2">
                                                                <Info className="h-4 w-4" />
                                                                Tips
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent align="end" className="w-80">
                                                            <div className="space-y-2">
                                                                <div className="text-sm font-semibold">Password tips</div>
                                                                <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                                                                    <li>Use 12+ characters when possible</li>
                                                                    <li>Include upper/lowercase letters</li>
                                                                    <li>Add numbers and symbols</li>
                                                                    <li>Avoid common words or reused passwords</li>
                                                                </ul>
                                                            </div>
                                                        </PopoverContent>
                                                    </Popover>
                                                </div>

                                                <div className="relative">
                                                    <Input
                                                        id="m_new_password"
                                                        type={showNewPassword ? "text" : "password"}
                                                        value={newPassword}
                                                        onChange={(e) => setNewPassword(e.target.value)}
                                                        disabled={savingPassword}
                                                        autoComplete="new-password"
                                                        placeholder="Create a strong password"
                                                        className="pr-10"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                                                        onClick={() => setShowNewPassword((v) => !v)}
                                                        disabled={savingPassword}
                                                        aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                                                    >
                                                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                    </Button>
                                                </div>

                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                        <span>Password strength</span>
                                                        <span>{pwScore}%</span>
                                                    </div>
                                                    <Progress value={pwScore} />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="m_confirm_password">Confirm new password</Label>
                                                <div className="relative">
                                                    <Input
                                                        id="m_confirm_password"
                                                        type={showConfirmPassword ? "text" : "password"}
                                                        value={confirmPassword}
                                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                                        disabled={savingPassword}
                                                        autoComplete="new-password"
                                                        placeholder="Re-type new password"
                                                        className="pr-10"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                                                        onClick={() => setShowConfirmPassword((v) => !v)}
                                                        disabled={savingPassword}
                                                        aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                                                    >
                                                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* ✅ Buttons vertical (mobile) */}
                                            <div className="flex flex-col gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    disabled={savingPassword}
                                                    onClick={() => {
                                                        setCurrentPassword("")
                                                        setNewPassword("")
                                                        setConfirmPassword("")
                                                        setShowCurrentPassword(false)
                                                        setShowNewPassword(false)
                                                        setShowConfirmPassword(false)
                                                    }}
                                                    className="w-full"
                                                >
                                                    Clear
                                                </Button>

                                                <Button type="submit" disabled={savingPassword} className="w-full">
                                                    {savingPassword ? (
                                                        <>
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            Updating...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <KeyRound className="mr-2 h-4 w-4" />
                                                            Update
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </form>

                                        <Accordion type="single" collapsible>
                                            <AccordionItem value="m-help-password">
                                                <AccordionTrigger>Will this log me out?</AccordionTrigger>
                                                <AccordionContent className="text-sm text-muted-foreground">
                                                    Your session typically remains active after changing password unless your backend enforces re-authentication.
                                                </AccordionContent>
                                            </AccordionItem>
                                        </Accordion>
                                    </CardContent>
                                </Card>

                                {/* Preferences */}
                                <Card className="border-dashed">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-sm">Local preferences</CardTitle>
                                        <CardDescription className="text-xs">UI-only toggles for this device.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="space-y-0.5">
                                                <div className="text-sm font-medium">Compact layout</div>
                                                <div className="text-xs text-muted-foreground">Tighter spacing in tables.</div>
                                            </div>
                                            <Switch checked={prefCompact} onCheckedChange={setPrefCompact} />
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-xs text-muted-foreground">Time format</Label>
                                            <Select value={prefTimeFormat} onValueChange={(v) => setPrefTimeFormat(v as any)}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Choose..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="12h">12-hour</SelectItem>
                                                    <SelectItem value="24h">24-hour</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* ✅ DESKTOP UI (unchanged screen/layout) */}
                            <div className="hidden md:grid gap-6 md:grid-cols-12">
                                {/* Left: account summary */}
                                <Card className="md:col-span-4">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <User2 className="h-4 w-4" />
                                            Account
                                        </CardTitle>
                                        <CardDescription>Basic identity and quick actions.</CardDescription>
                                    </CardHeader>

                                    <CardContent className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-12 w-12 overflow-hidden">
                                                <AvatarImage src={avatarUrl ?? undefined} alt={me.name} className="h-full w-full object-cover" />
                                                <AvatarFallback>{initials(me.name)}</AvatarFallback>
                                            </Avatar>

                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-semibold">{me.name}</div>
                                                <div className="truncate text-xs text-muted-foreground">{me.email}</div>
                                            </div>

                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" size="icon" disabled={avatarBusy} aria-label="Avatar actions">
                                                        <Camera className={cn("h-4 w-4", avatarBusy && "opacity-60")} />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>Avatar</DropdownMenuLabel>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={triggerAvatarPick} disabled={avatarBusy}>
                                                        <Upload className="mr-2 h-4 w-4" />
                                                        Upload / Change
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => setRemoveAvatarOpen(true)}
                                                        disabled={avatarBusy || !me.avatar_key}
                                                        className="text-destructive focus:text-destructive"
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Remove
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>

                                        <Separator />

                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-28">Field</TableHead>
                                                    <TableHead>Value</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                <TableRow>
                                                    <TableCell className="text-muted-foreground">User ID</TableCell>
                                                    <TableCell className="flex items-center justify-between gap-2">
                                                        <span className="truncate font-mono text-xs">{me.id}</span>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button variant="ghost" size="icon" onClick={() => copyToClipboard(me.id)}>
                                                                    <Copy className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Copy user ID</TooltipContent>
                                                        </Tooltip>
                                                    </TableCell>
                                                </TableRow>
                                                <TableRow>
                                                    <TableCell className="text-muted-foreground">Role</TableCell>
                                                    <TableCell className="capitalize">{me.role}</TableCell>
                                                </TableRow>
                                                <TableRow>
                                                    <TableCell className="text-muted-foreground">Avatar</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">{me.avatar_key ? "Set" : "Not set"}</TableCell>
                                                </TableRow>
                                            </TableBody>
                                        </Table>

                                        <Separator />

                                        <Card className="border-dashed">
                                            <CardHeader className="pb-3">
                                                <CardTitle className="text-sm">Local preferences</CardTitle>
                                                <CardDescription className="text-xs">These are UI-only toggles for this device.</CardDescription>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="space-y-0.5">
                                                        <div className="text-sm font-medium">Compact layout</div>
                                                        <div className="text-xs text-muted-foreground">Tighter spacing in tables.</div>
                                                    </div>
                                                    <Switch checked={prefCompact} onCheckedChange={setPrefCompact} />
                                                </div>

                                                <div className="space-y-2">
                                                    <Label className="text-xs text-muted-foreground">Time format</Label>
                                                    <Select value={prefTimeFormat} onValueChange={(v) => setPrefTimeFormat(v as any)}>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Choose..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="12h">12-hour</SelectItem>
                                                            <SelectItem value="24h">24-hour</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </CardContent>

                                    <CardFooter className="justify-end">
                                        <Button variant="outline" onClick={hardRefreshAll}>
                                            Refresh
                                        </Button>
                                    </CardFooter>
                                </Card>

                                {/* Right: tabs */}
                                <Card className="md:col-span-8">
                                    <CardHeader>
                                        <CardTitle>Manage</CardTitle>
                                        <CardDescription>Update profile, avatar, and password.</CardDescription>
                                    </CardHeader>

                                    <CardContent className="space-y-4">
                                        <Tabs defaultValue="profile" className="w-full">
                                            <TabsList className="grid w-full grid-cols-3">
                                                <TabsTrigger value="profile">Profile</TabsTrigger>
                                                <TabsTrigger value="avatar">Avatar</TabsTrigger>
                                                <TabsTrigger value="password">Password</TabsTrigger>
                                            </TabsList>

                                            {/* Profile */}
                                            <TabsContent value="profile" className="space-y-4">
                                                <form onSubmit={saveProfile} className="space-y-4">
                                                    <div className="grid gap-4 md:grid-cols-2">
                                                        <div className="space-y-2">
                                                            <Label htmlFor="name">Name</Label>
                                                            <Input
                                                                id="name"
                                                                value={name}
                                                                onChange={(e) => setName(e.target.value)}
                                                                disabled={savingProfile}
                                                                placeholder="Your name"
                                                            />
                                                        </div>

                                                        <div className="space-y-2">
                                                            <Label htmlFor="email">Email</Label>
                                                            <Input
                                                                id="email"
                                                                value={email}
                                                                onChange={(e) => setEmail(e.target.value)}
                                                                disabled={savingProfile}
                                                                placeholder="you@school.edu"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            disabled={savingProfile}
                                                            onClick={() => {
                                                                setName(me.name)
                                                                setEmail(me.email)
                                                            }}
                                                        >
                                                            Reset
                                                        </Button>
                                                        <Button type="submit" disabled={savingProfile}>
                                                            {savingProfile ? (
                                                                <>
                                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                    Saving...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Check className="mr-2 h-4 w-4" />
                                                                    Save changes
                                                                </>
                                                            )}
                                                        </Button>
                                                    </div>
                                                </form>

                                                <Accordion type="single" collapsible>
                                                    <AccordionItem value="help-profile">
                                                        <AccordionTrigger>What can I change here?</AccordionTrigger>
                                                        <AccordionContent className="text-sm text-muted-foreground">
                                                            You can update your display name and email address. Changes apply immediately to your account.
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                </Accordion>
                                            </TabsContent>

                                            {/* Avatar */}
                                            <TabsContent value="avatar" className="space-y-4">
                                                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="h-16 w-16 overflow-hidden">
                                                            <AvatarImage
                                                                src={avatarUrl ?? undefined}
                                                                alt={me.name}
                                                                className="h-full w-full object-cover"
                                                            />
                                                            <AvatarFallback>{initials(me.name)}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="space-y-0.5">
                                                            <div className="text-sm font-semibold">Profile photo</div>
                                                            <div className="text-xs text-muted-foreground">Upload a square image for best results.</div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <Button variant="secondary" onClick={triggerAvatarPick} disabled={avatarBusy}>
                                                            {avatarBusy ? (
                                                                <>
                                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                    Working...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Upload className="mr-2 h-4 w-4" />
                                                                    Upload
                                                                </>
                                                            )}
                                                        </Button>

                                                        <Button
                                                            variant="destructive"
                                                            onClick={() => setRemoveAvatarOpen(true)}
                                                            disabled={avatarBusy || !me.avatar_key}
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Remove
                                                        </Button>
                                                    </div>
                                                </div>

                                                <Alert>
                                                    <AlertTitle className="flex items-center gap-2">
                                                        <Info className="h-4 w-4" />
                                                        Avatar storage
                                                    </AlertTitle>
                                                    <AlertDescription>
                                                        Upload uses a presigned URL, then saves the avatar key to your account.
                                                    </AlertDescription>
                                                </Alert>

                                                <Accordion type="single" collapsible>
                                                    <AccordionItem value="help-avatar">
                                                        <AccordionTrigger>Why do I need to upload first?</AccordionTrigger>
                                                        <AccordionContent className="text-sm text-muted-foreground">
                                                            The app uses a presigned URL for secure direct uploads. After upload, the server stores the image key in your user
                                                            profile.
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                </Accordion>
                                            </TabsContent>

                                            {/* Password */}
                                            <TabsContent value="password" className="space-y-4">
                                                <form onSubmit={savePassword} className="space-y-4">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="current_password">Current password</Label>
                                                        <div className="relative">
                                                            <Input
                                                                id="current_password"
                                                                type={showCurrentPassword ? "text" : "password"}
                                                                value={currentPassword}
                                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                                disabled={savingPassword}
                                                                autoComplete="current-password"
                                                                placeholder="••••••••"
                                                                className="pr-10"
                                                            />
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                                                                onClick={() => setShowCurrentPassword((v) => !v)}
                                                                disabled={savingPassword}
                                                                aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                                                            >
                                                                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <Label htmlFor="new_password">New password</Label>

                                                            <Popover>
                                                                <PopoverTrigger asChild>
                                                                    <Button type="button" variant="ghost" size="sm" className="h-8 gap-2">
                                                                        <Info className="h-4 w-4" />
                                                                        Requirements
                                                                    </Button>
                                                                </PopoverTrigger>
                                                                <PopoverContent align="end" className="w-80">
                                                                    <div className="space-y-2">
                                                                        <div className="text-sm font-semibold">Password tips</div>
                                                                        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                                                                            <li>Use 12+ characters when possible</li>
                                                                            <li>Include upper/lowercase letters</li>
                                                                            <li>Add numbers and symbols</li>
                                                                            <li>Avoid common words or reused passwords</li>
                                                                        </ul>
                                                                    </div>
                                                                </PopoverContent>
                                                            </Popover>
                                                        </div>

                                                        <div className="relative">
                                                            <Input
                                                                id="new_password"
                                                                type={showNewPassword ? "text" : "password"}
                                                                value={newPassword}
                                                                onChange={(e) => setNewPassword(e.target.value)}
                                                                disabled={savingPassword}
                                                                autoComplete="new-password"
                                                                placeholder="Create a strong password"
                                                                className="pr-10"
                                                            />
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                                                                onClick={() => setShowNewPassword((v) => !v)}
                                                                disabled={savingPassword}
                                                                aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                                                            >
                                                                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                            </Button>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                                <span>Password strength</span>
                                                                <span>{pwScore}%</span>
                                                            </div>
                                                            <Progress value={pwScore} />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <Label htmlFor="confirm_password">Confirm new password</Label>
                                                        <div className="relative">
                                                            <Input
                                                                id="confirm_password"
                                                                type={showConfirmPassword ? "text" : "password"}
                                                                value={confirmPassword}
                                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                                disabled={savingPassword}
                                                                autoComplete="new-password"
                                                                placeholder="Re-type new password"
                                                                className="pr-10"
                                                            />
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                                                                onClick={() => setShowConfirmPassword((v) => !v)}
                                                                disabled={savingPassword}
                                                                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                                                            >
                                                                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            disabled={savingPassword}
                                                            onClick={() => {
                                                                setCurrentPassword("")
                                                                setNewPassword("")
                                                                setConfirmPassword("")
                                                                setShowCurrentPassword(false)
                                                                setShowNewPassword(false)
                                                                setShowConfirmPassword(false)
                                                            }}
                                                        >
                                                            Clear
                                                        </Button>

                                                        <Button type="submit" disabled={savingPassword}>
                                                            {savingPassword ? (
                                                                <>
                                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                    Updating...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <KeyRound className="mr-2 h-4 w-4" />
                                                                    Update password
                                                                </>
                                                            )}
                                                        </Button>
                                                    </div>
                                                </form>

                                                <Accordion type="single" collapsible>
                                                    <AccordionItem value="help-password">
                                                        <AccordionTrigger>Will this log me out?</AccordionTrigger>
                                                        <AccordionContent className="text-sm text-muted-foreground">
                                                            Your session typically remains active after changing password unless your backend enforces re-authentication.
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                </Accordion>
                                            </TabsContent>
                                        </Tabs>
                                    </CardContent>
                                </Card>
                            </div>
                        </>
                    )}

                    {/* Remove avatar confirmation */}
                    <AlertDialog open={removeAvatarOpen} onOpenChange={setRemoveAvatarOpen}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Remove avatar?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will remove your current profile photo. You can upload a new one anytime.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={avatarBusy}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    disabled={avatarBusy}
                                    onClick={(e) => {
                                        e.preventDefault()
                                        removeAvatar()
                                    }}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                    {avatarBusy ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Working...
                                        </>
                                    ) : (
                                        <>
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Remove
                                        </>
                                    )}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </TooltipProvider>
        </DashboardLayout>
    )
}

export default function AdminSettingsPage() {
    return (
        <RoleSettingsPage
            config={{
                pageTitle: "Admin Settings",
                pageDescription: "Update your account information, avatar, and password.",
                roleBadgeLabel: "Admin",
                roleIcon: <Shield className="h-3.5 w-3.5" />,
            }}
        />
    )
}
