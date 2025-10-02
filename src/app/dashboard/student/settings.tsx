import * as React from "react"
import { Link } from "react-router-dom"
import { AppSidebar } from "@/components/student-sidebar"
import { SiteHeader } from "@/components/site-header"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import {
    IconBell,
    IconDownload,
    IconKey,
    IconLock,
    IconMail,
    IconShieldCheckered,
    IconUserCircle,
    IconTrash,
} from "@tabler/icons-react"

export default function StudentSettings() {
    // Profile
    const [firstName, setFirstName] = React.useState("Juan")
    const [lastName, setLastName] = React.useState("Dela Cruz")
    const [studentId] = React.useState("TC-25-A-00001")
    const [program, setProgram] = React.useState("BS Computer Science")
    const [email] = React.useState("juan.delacruz@jrmsu.edu.ph")
    const [phone, setPhone] = React.useState("")

    // Security
    const [pwdCurrent, setPwdCurrent] = React.useState("")
    const [pwdNew, setPwdNew] = React.useState("")
    const [pwdConfirm, setPwdConfirm] = React.useState("")
    const [showPwd, setShowPwd] = React.useState(false)

    // Notifications
    const [notifEmail, setNotifEmail] = React.useState(true)
    const [notifSMS, setNotifSMS] = React.useState(false)
    const [notifPush, setNotifPush] = React.useState(true)
    const [notifFreq, setNotifFreq] = React.useState("realtime")

    // Privacy / Consent
    const [shareWithAdviser, setShareWithAdviser] = React.useState(true)
    const [shareWithPanel, setShareWithPanel] = React.useState(true)
    const [listOnSchedule, setListOnSchedule] = React.useState(true)

    const [banner, setBanner] = React.useState<{ kind: "none" | "ok" | "err"; text?: string }>({ kind: "none" })

    function saveProfile() {
        setBanner({ kind: "ok", text: "Profile saved. Changes will reflect in your next session." })
    }

    function saveNotifications() {
        setBanner({ kind: "ok", text: "Notification preferences updated." })
    }

    function savePrivacy() {
        setBanner({ kind: "ok", text: "Privacy and consent settings saved." })
    }

    function changePassword() {
        if (!pwdCurrent || !pwdNew || !pwdConfirm) {
            setBanner({ kind: "err", text: "Please fill out all password fields." })
            return
        }
        if (pwdNew !== pwdConfirm) {
            setBanner({ kind: "err", text: "New password and confirmation do not match." })
            return
        }
        setBanner({ kind: "ok", text: "Password updated successfully." })
        setPwdCurrent("")
        setPwdNew("")
        setPwdConfirm("")
    }

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="flex min-h-dvh flex-col">
                <SiteHeader />
                <main className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
                    {/* Page header */}
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                        <div>
                            <h1 className="text-xl font-semibold leading-tight sm:text-2xl">Profile &amp; Settings</h1>
                            <p className="text-muted-foreground text-sm">
                                Manage your account information, security, notifications, and privacy.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button asChild variant="outline" className="cursor-pointer">
                                <Link to="/dashboard/student">Back to Dashboard</Link>
                            </Button>
                        </div>
                    </div>

                    {banner.kind !== "none" && (
                        <div
                            className={`flex items-start gap-2 rounded-md border p-3 text-sm ${banner.kind === "ok" ? "border-green-600/30 bg-green-600/10" : "border-red-600/30 bg-red-600/10"
                                }`}
                        >
                            {banner.kind === "ok" ? <IconShieldCheckered className="mt-0.5 size-4" /> : <IconLock className="mt-0.5 size-4" />}
                            <span>{banner.text}</span>
                        </div>
                    )}

                    {/* PROFILE */}
                    <Card className="@container">
                        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <CardTitle className="text-base sm:text-lg">Profile</CardTitle>
                                <CardDescription>These details are visible to your adviser and panel during reviews.</CardDescription>
                            </div>
                            <Badge variant="secondary">Student</Badge>
                        </CardHeader>
                        <Separator />
                        <CardContent className="pt-4">
                            <div className="flex flex-col gap-6 sm:flex-row">
                                <div className="flex items-center gap-4">
                                    <Avatar className="size-16">
                                        <AvatarImage src="/avatars/shadcn.jpg" alt="Student avatar" />
                                        <AvatarFallback>JD</AvatarFallback>
                                    </Avatar>
                                    <div className="flex gap-2">
                                        <Button variant="outline" className="cursor-pointer">Change</Button>
                                        <Button variant="ghost" className="cursor-pointer">Remove</Button>
                                    </div>
                                </div>

                                <div className="grid flex-1 gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="firstName">First name</Label>
                                        <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="lastName">Last name</Label>
                                        <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="studentId">Student ID</Label>
                                        <Input id="studentId" value={studentId} readOnly />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="program">Program</Label>
                                        <Select value={program} onValueChange={setProgram}>
                                            <SelectTrigger id="program" className="cursor-pointer">
                                                <SelectValue placeholder="Select program" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="BS Computer Science">BS Computer Science</SelectItem>
                                                <SelectItem value="BS Information Technology">BS Information Technology</SelectItem>
                                                <SelectItem value="BS Information Systems">BS Information Systems</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email</Label>
                                        <div className="relative">
                                            <Input id="email" value={email} readOnly className="pr-8" />
                                            <IconMail className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Phone</Label>
                                        <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+63 9XX XXX XXXX" />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end">
                            <Button onClick={saveProfile} className="cursor-pointer">
                                <IconUserCircle className="mr-2 size-4" />
                                Save Profile
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* SECURITY */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base sm:text-lg">Account Security</CardTitle>
                            <CardDescription>Update your password regularly to keep your account secure.</CardDescription>
                        </CardHeader>
                        <Separator />
                        <CardContent className="pt-4 grid gap-4 sm:grid-cols-3">
                            <div className="space-y-2">
                                <Label htmlFor="currentPwd">Current password</Label>
                                <Input
                                    id="currentPwd"
                                    type={showPwd ? "text" : "password"}
                                    value={pwdCurrent}
                                    onChange={(e) => setPwdCurrent(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="newPwd">New password</Label>
                                <Input
                                    id="newPwd"
                                    type={showPwd ? "text" : "password"}
                                    value={pwdNew}
                                    onChange={(e) => setPwdNew(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirmPwd">Confirm new password</Label>
                                <Input
                                    id="confirmPwd"
                                    type={showPwd ? "text" : "password"}
                                    value={pwdConfirm}
                                    onChange={(e) => setPwdConfirm(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2 sm:col-span-3">
                                <Switch id="showPwd" checked={showPwd} onCheckedChange={setShowPwd} />
                                <Label htmlFor="showPwd">Show passwords</Label>
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end">
                            <Button onClick={changePassword} className="cursor-pointer">
                                <IconKey className="mr-2 size-4" />
                                Update Password
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* NOTIFICATIONS */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base sm:text-lg">Notifications</CardTitle>
                            <CardDescription>Choose how you want to receive updates (submission status, schedules, results).</CardDescription>
                        </CardHeader>
                        <Separator />
                        <CardContent className="pt-4 grid gap-4 sm:grid-cols-2">
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div className="flex items-center gap-2">
                                    <IconBell className="size-4" />
                                    <span>Email notifications</span>
                                </div>
                                <Switch checked={notifEmail} onCheckedChange={setNotifEmail} />
                            </div>
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div className="flex items-center gap-2">
                                    <IconBell className="size-4" />
                                    <span>SMS notifications</span>
                                </div>
                                <Switch checked={notifSMS} onCheckedChange={setNotifSMS} />
                            </div>
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div className="flex items-center gap-2">
                                    <IconBell className="size-4" />
                                    <span>Push notifications</span>
                                </div>
                                <Switch checked={notifPush} onCheckedChange={setNotifPush} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="freq">Delivery frequency</Label>
                                <Select value={notifFreq} onValueChange={setNotifFreq}>
                                    <SelectTrigger id="freq" className="cursor-pointer">
                                        <SelectValue placeholder="Select frequency" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="realtime">Real-time</SelectItem>
                                        <SelectItem value="hourly">Hourly digest</SelectItem>
                                        <SelectItem value="daily">Daily summary</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end">
                            <Button onClick={saveNotifications} className="cursor-pointer">
                                <IconBell className="mr-2 size-4" />
                                Save Preferences
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* PRIVACY & CONSENT */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base sm:text-lg">Privacy &amp; Consent</CardTitle>
                            <CardDescription>
                                Control what information is shared with your adviser/panel and what appears on public schedules.
                            </CardDescription>
                        </CardHeader>
                        <Separator />
                        <CardContent className="pt-4 grid gap-4">
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                    <div className="font-medium">Share manuscript metadata with adviser</div>
                                    <div className="text-xs text-muted-foreground">
                                        Title, keywords, and revision status for guidance.
                                    </div>
                                </div>
                                <Switch checked={shareWithAdviser} onCheckedChange={setShareWithAdviser} />
                            </div>
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                    <div className="font-medium">Share with panel members</div>
                                    <div className="text-xs text-muted-foreground">Enable preread access to expedite reviews.</div>
                                </div>
                                <Switch checked={shareWithPanel} onCheckedChange={setShareWithPanel} />
                            </div>
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                    <div className="font-medium">Show my name on schedule board</div>
                                    <div className="text-xs text-muted-foreground">Only date/time/room if disabled.</div>
                                </div>
                                <Switch checked={listOnSchedule} onCheckedChange={setListOnSchedule} />
                            </div>
                        </CardContent>
                        <CardFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex gap-2">
                                <Button variant="outline" className="cursor-pointer">
                                    <IconDownload className="mr-2 size-4" />
                                    Download My Data (JSON)
                                </Button>
                                <Button variant="destructive" className="cursor-pointer">
                                    <IconTrash className="mr-2 size-4" />
                                    Request Account Deletion
                                </Button>
                            </div>
                            <Button onClick={savePrivacy} className="cursor-pointer">
                                <IconShieldCheckered className="mr-2 size-4" />
                                Save Privacy Settings
                            </Button>
                        </CardFooter>
                    </Card>
                </main>
            </SidebarInset>
        </SidebarProvider>
    )
}
