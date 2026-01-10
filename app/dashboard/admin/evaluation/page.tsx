/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    ArrowLeft,
    Eye,
    Filter,
    Loader2,
    Lock,
    RefreshCw,
    Search,
    ShieldCheck,
    Unlock,
    Plus,
    Trash2,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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

type ApiOk<T> = { ok: true } & T
type ApiErr = { ok: false; error?: string; message?: string }

type StaffOverviewItem = {
    id: string
    status: string
    submittedAt: string | null
    lockedAt: string | null
    createdAt: string

    scheduleId: string
    scheduledAt: string
    room: string | null
    scheduleStatus: string | null

    groupId: string
    groupTitle: string
    program: string | null
    term: string | null

    evaluatorId: string
    evaluatorName: string | null
    evaluatorEmail: string
    evaluatorRole: string
}

type StudentOverviewItem = {
    id: string
    status: "pending" | "submitted" | "locked"
    submittedAt: string | null
    lockedAt: string | null
    createdAt: string
    updatedAt: string

    scheduleId: string
    scheduledAt: string
    room: string | null
    scheduleStatus: string | null

    groupId: string
    groupTitle: string
    program: string | null
    term: string | null

    studentId: string
    studentName: string | null
    studentEmail: string
}

type DbUser = {
    id: string
    name: string | null
    email: string
    role?: string | null
    status?: string | null
}

type DbSchedule = {
    id: string
    groupId: string
    scheduledAt: string
    room: string | null
    status: string
    groupTitle: string | null
    program: string | null
    term: string | null
}

function safeText(v: any, fallback = "") {
    const s = String(v ?? "").trim()
    return s ? s : fallback
}

function titleCaseRole(role?: string | null) {
    const r = safeText(role, "").toLowerCase()
    if (!r) return ""
    return r.charAt(0).toUpperCase() + r.slice(1)
}

function fmtDateTime(d?: string | null) {
    const s = safeText(d, "")
    if (!s) return ""
    const dt = new Date(s)
    if (Number.isNaN(dt.getTime())) return s
    return dt.toLocaleString()
}

function fmtDate(d?: string | null) {
    const s = safeText(d, "")
    if (!s) return ""
    const dt = new Date(s)
    if (Number.isNaN(dt.getTime())) return s
    return dt.toLocaleDateString()
}

function fmtTime(d?: string | null) {
    const s = safeText(d, "")
    if (!s) return ""
    const dt = new Date(s)
    if (Number.isNaN(dt.getTime())) return s
    return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function statusBadge(status?: string | null) {
    const s = safeText(status, "").toLowerCase()
    if (!s) return <Badge variant="secondary">Unknown</Badge>
    if (s === "submitted" || s === "done" || s === "completed") return <Badge>Submitted</Badge>
    if (s === "pending" || s === "draft") return <Badge variant="secondary">Pending</Badge>
    if (s === "locked") return <Badge variant="outline">Locked</Badge>
    if (s === "archived") return <Badge variant="outline">Archived</Badge>
    if (s === "cancelled" || s === "canceled") return <Badge variant="destructive">Cancelled</Badge>
    return <Badge variant="secondary">{status}</Badge>
}

// IMPORTANT: Select.Item cannot use empty string values.
const CLEAR_SELECT_VALUE = "__clear__"

async function apiJson<T>(method: string, url: string, body?: any): Promise<ApiOk<T> | ApiErr> {
    const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await res.json().catch(() => ({}))) as any
    if (!res.ok) return { ok: false, error: data?.error ?? data?.message ?? `HTTP ${res.status}` }
    return data
}

function scheduleLine(groupTitle: string, scheduledAt: string, room?: string | null) {
    const left = safeText(groupTitle, "Schedule")
    const when = scheduledAt ? `${fmtDate(scheduledAt)} ${fmtTime(scheduledAt)}`.trim() : ""
    const r = safeText(room, "")
    const where = r ? `Room ${r}` : ""
    return [left, when, where].filter(Boolean).join(" · ")
}

function personLine(name: string | null, email: string) {
    const n = safeText(name, "")
    const e = safeText(email, "")
    if (n && e) return `${n} (${e})`
    return n || e
}

function normalizeRole(role?: string | null) {
    return safeText(role, "").toLowerCase()
}

function userLabel(u?: DbUser | null) {
    if (!u) return ""
    return personLine(u.name, u.email)
}

export default function AdminEvaluationPage() {
    const router = useRouter()
    const { user, loading: authLoading } = useAuth()

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [activeTab, setActiveTab] = React.useState<"staff" | "students">("staff")

    const [showInternalIds, setShowInternalIds] = React.useState(false)

    // staff evaluation overview
    const [staffItems, setStaffItems] = React.useState<StaffOverviewItem[]>([])
    const [staffQ, setStaffQ] = React.useState("")
    const [staffStatusFilter, setStaffStatusFilter] = React.useState("")
    const [staffScheduleFilter, setStaffScheduleFilter] = React.useState("")
    const [staffEvaluatorFilter, setStaffEvaluatorFilter] = React.useState("")

    // student evaluation overview
    const [studentItems, setStudentItems] = React.useState<StudentOverviewItem[]>([])
    const [studentQ, setStudentQ] = React.useState("")
    const [studentStatusFilter, setStudentStatusFilter] = React.useState("")
    const [studentScheduleFilter, setStudentScheduleFilter] = React.useState("")
    const [studentFilter, setStudentFilter] = React.useState("")

    // inspect student evaluation (answers)
    const [inspectOpen, setInspectOpen] = React.useState(false)
    const [inspectLoading, setInspectLoading] = React.useState(false)
    const [inspectTitle, setInspectTitle] = React.useState("")
    const [inspectMeta, setInspectMeta] = React.useState<Record<string, any> | null>(null)
    const [inspectAnswers, setInspectAnswers] = React.useState<any>(null)

    // Assignments (Admin feature)
    const [assignOpen, setAssignOpen] = React.useState(false)
    const [assignLoading, setAssignLoading] = React.useState(false)
    const [assignTab, setAssignTab] = React.useState<"single" | "panelists">("single")
    const [assignSchedules, setAssignSchedules] = React.useState<DbSchedule[]>([])
    const [assignStaffUsers, setAssignStaffUsers] = React.useState<DbUser[]>([])
    const [assignScheduleId, setAssignScheduleId] = React.useState("")
    const [assignEvaluatorId, setAssignEvaluatorId] = React.useState("")
    const [assignWorking, setAssignWorking] = React.useState(false)

    // confirm dialog
    const [confirmOpen, setConfirmOpen] = React.useState(false)
    const [confirmTitle, setConfirmTitle] = React.useState("")
    const [confirmDesc, setConfirmDesc] = React.useState("")
    const confirmActionRef = React.useRef<null | (() => Promise<void>)>(null)

    function openConfirm(title: string, desc: string, action: () => Promise<void>) {
        confirmActionRef.current = action
        setConfirmTitle(title)
        setConfirmDesc(desc)
        setConfirmOpen(true)
    }

    async function loadOverview() {
        setLoading(true)
        try {
            const [staffRes, studentRes] = await Promise.all([
                apiJson<{ total: number; items: StaffOverviewItem[] }>(
                    "GET",
                    "/api/admin/evaluations?type=staff&limit=500&offset=0"
                ),
                apiJson<{ total: number; items: StudentOverviewItem[] }>(
                    "GET",
                    "/api/admin/evaluations?type=student&limit=500&offset=0"
                ),
            ])

            if (!staffRes.ok) throw new Error(staffRes.error ?? "Failed to load staff evaluations")
            if (!studentRes.ok) throw new Error(studentRes.error ?? "Failed to load student feedback")

            setStaffItems(Array.isArray((staffRes as any).items) ? (staffRes as any).items : [])
            setStudentItems(Array.isArray((studentRes as any).items) ? (studentRes as any).items : [])
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to load evaluation overview")
        } finally {
            setLoading(false)
        }
    }

    async function refreshAll() {
        setRefreshing(true)
        try {
            await loadOverview()
        } finally {
            setRefreshing(false)
        }
    }

    React.useEffect(() => {
        if (authLoading) return
        if (!user) return
        if (String(user.role ?? "").toLowerCase() !== "admin") {
            toast.error("Unauthorized")
            router.push("/dashboard")
            return
        }
        loadOverview()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, user?.id])

    const staffScheduleOptions = React.useMemo(() => {
        const map = new Map<string, { id: string; label: string }>()
        for (const it of staffItems) {
            if (!map.has(it.scheduleId)) {
                map.set(it.scheduleId, {
                    id: it.scheduleId,
                    label: scheduleLine(it.groupTitle, it.scheduledAt, it.room),
                })
            }
        }
        return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
    }, [staffItems])

    const staffEvaluatorOptions = React.useMemo(() => {
        const map = new Map<string, { id: string; label: string }>()
        for (const it of staffItems) {
            if (!map.has(it.evaluatorId)) {
                map.set(it.evaluatorId, {
                    id: it.evaluatorId,
                    label: personLine(it.evaluatorName, it.evaluatorEmail),
                })
            }
        }
        return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
    }, [staffItems])

    const studentScheduleOptions = React.useMemo(() => {
        const map = new Map<string, { id: string; label: string }>()
        for (const it of studentItems) {
            if (!map.has(it.scheduleId)) {
                map.set(it.scheduleId, {
                    id: it.scheduleId,
                    label: scheduleLine(it.groupTitle, it.scheduledAt, it.room),
                })
            }
        }
        return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
    }, [studentItems])

    const studentOptions = React.useMemo(() => {
        const map = new Map<string, { id: string; label: string }>()
        for (const it of studentItems) {
            if (!map.has(it.studentId)) {
                map.set(it.studentId, {
                    id: it.studentId,
                    label: personLine(it.studentName, it.studentEmail),
                })
            }
        }
        return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
    }, [studentItems])

    const staffFiltered = React.useMemo(() => {
        const qq = safeText(staffQ, "").toLowerCase()

        return staffItems.filter((it) => {
            if (staffStatusFilter && safeText(it.status, "").toLowerCase() !== staffStatusFilter.toLowerCase()) return false
            if (staffScheduleFilter && it.scheduleId !== staffScheduleFilter) return false
            if (staffEvaluatorFilter && it.evaluatorId !== staffEvaluatorFilter) return false

            if (!qq) return true

            const parts = [
                scheduleLine(it.groupTitle, it.scheduledAt, it.room),
                safeText(it.program, ""),
                safeText(it.term, ""),
                personLine(it.evaluatorName, it.evaluatorEmail),
                safeText(it.status, ""),
                showInternalIds ? it.id : "",
                showInternalIds ? it.scheduleId : "",
                showInternalIds ? it.evaluatorId : "",
            ]
                .filter(Boolean)
                .join(" · ")
                .toLowerCase()

            return parts.includes(qq)
        })
    }, [staffItems, staffQ, staffStatusFilter, staffScheduleFilter, staffEvaluatorFilter, showInternalIds])

    const studentFiltered = React.useMemo(() => {
        const qq = safeText(studentQ, "").toLowerCase()

        return studentItems.filter((it) => {
            if (studentStatusFilter && safeText(it.status, "").toLowerCase() !== studentStatusFilter.toLowerCase()) return false
            if (studentScheduleFilter && it.scheduleId !== studentScheduleFilter) return false
            if (studentFilter && it.studentId !== studentFilter) return false

            if (!qq) return true

            const parts = [
                scheduleLine(it.groupTitle, it.scheduledAt, it.room),
                safeText(it.program, ""),
                safeText(it.term, ""),
                personLine(it.studentName, it.studentEmail),
                safeText(it.status, ""),
                showInternalIds ? it.id : "",
                showInternalIds ? it.scheduleId : "",
                showInternalIds ? it.studentId : "",
            ]
                .filter(Boolean)
                .join(" · ")
                .toLowerCase()

            return parts.includes(qq)
        })
    }, [studentItems, studentQ, studentStatusFilter, studentScheduleFilter, studentFilter, showInternalIds])

    const staffSummary = React.useMemo(() => {
        const total = staffItems.length
        const pending = staffItems.filter((x) => ["pending", "draft", ""].includes(safeText(x.status, "").toLowerCase())).length
        const submitted = staffItems.filter((x) => ["submitted", "done", "completed"].includes(safeText(x.status, "").toLowerCase())).length
        const locked = staffItems.filter((x) => safeText(x.status, "").toLowerCase() === "locked").length
        return { total, pending, submitted, locked }
    }, [staffItems])

    const studentSummary = React.useMemo(() => {
        const total = studentItems.length
        const pending = studentItems.filter((x) => safeText(x.status, "").toLowerCase() === "pending").length
        const submitted = studentItems.filter((x) => safeText(x.status, "").toLowerCase() === "submitted").length
        const locked = studentItems.filter((x) => safeText(x.status, "").toLowerCase() === "locked").length
        return { total, pending, submitted, locked }
    }, [studentItems])

    async function inspectStudentEvaluation(item: StudentOverviewItem) {
        setInspectOpen(true)
        setInspectLoading(true)
        setInspectAnswers(null)
        setInspectMeta(null)
        setInspectTitle(`Student feedback • ${scheduleLine(item.groupTitle, item.scheduledAt, item.room)}`)

        try {
            const res = await apiJson<{ studentEvaluation: any }>(
                "GET",
                `/api/evaluation?resource=studentEvaluations&id=${encodeURIComponent(item.id)}`
            )
            if (!res.ok) throw new Error(res.error ?? "Failed to load student feedback")

            const se = (res as any).studentEvaluation ?? null
            setInspectMeta(se)
            setInspectAnswers(se?.answers ?? {})
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to load student feedback")
        } finally {
            setInspectLoading(false)
        }
    }

    async function setStaffLock(item: StaffOverviewItem, lock: boolean) {
        const desiredLockedAt = lock ? new Date().toISOString() : null
        const desiredStatus = lock ? "locked" : item.submittedAt ? "submitted" : "pending"

        const res = await apiJson(
            "PATCH",
            `/api/evaluation?resource=evaluations&id=${encodeURIComponent(item.id)}`,
            { status: desiredStatus, lockedAt: desiredLockedAt }
        )
        if (!res.ok) throw new Error(res.error ?? "Failed to update evaluation")
        toast.success(lock ? "Evaluation locked" : "Evaluation unlocked")
        await loadOverview()
    }

    async function setStudentLock(item: StudentOverviewItem, lock: boolean) {
        const desiredLockedAt = lock ? new Date().toISOString() : null
        const desiredStatus = lock ? "locked" : item.submittedAt ? "submitted" : "pending"

        const res = await apiJson(
            "PATCH",
            `/api/evaluation?resource=studentEvaluations&id=${encodeURIComponent(item.id)}`,
            { status: desiredStatus, lockedAt: desiredLockedAt }
        )
        if (!res.ok) throw new Error(res.error ?? "Failed to update student feedback")
        toast.success(lock ? "Student feedback locked" : "Student feedback unlocked")
        await loadOverview()
    }

    // ---------- Admin Assignment feature ----------
    async function openAssignDialog() {
        setAssignOpen(true)
        setAssignLoading(true)
        try {
            const [scRes, usRes] = await Promise.all([
                apiJson<{ schedules: DbSchedule[] }>("GET", "/api/schedule?resource=schedules&limit=200&offset=0"),
                apiJson<{ users: DbUser[] }>("GET", "/api/admin/users?limit=500&offset=0"),
            ])

            if (!scRes.ok) throw new Error(scRes.error ?? "Failed to load schedules")
            if (!usRes.ok) throw new Error(usRes.error ?? "Failed to load users")

            const schedules = Array.isArray((scRes as any).schedules) ? (scRes as any).schedules : []
            const users = Array.isArray((usRes as any).users) ? (usRes as any).users : []

            const staff = users
                .filter((u: { role: string | null | undefined; status: any }) => normalizeRole(u.role) === "staff" && safeText(u.status, "active").toLowerCase() !== "disabled")
                .sort((a: DbUser | null | undefined, b: DbUser | null | undefined) => userLabel(a).localeCompare(userLabel(b)))

            setAssignSchedules(schedules)
            setAssignStaffUsers(staff)

            // preselect something helpful
            setAssignScheduleId("")
            setAssignEvaluatorId("")
            setAssignTab("single")
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to load assignment data")
            setAssignOpen(false)
        } finally {
            setAssignLoading(false)
        }
    }

    const assignScheduleOptions = React.useMemo(() => {
        const list = assignSchedules.slice()
        list.sort((a, b) => {
            const la = scheduleLine(safeText(a.groupTitle, "Schedule"), a.scheduledAt, a.room)
            const lb = scheduleLine(safeText(b.groupTitle, "Schedule"), b.scheduledAt, b.room)
            return la.localeCompare(lb)
        })
        return list
    }, [assignSchedules])

    async function assignSingle() {
        const scheduleId = safeText(assignScheduleId, "")
        const evaluatorId = safeText(assignEvaluatorId, "")
        if (!scheduleId) {
            toast.error("Please select a schedule.")
            return
        }
        if (!evaluatorId) {
            toast.error("Please select a staff evaluator.")
            return
        }

        setAssignWorking(true)
        try {
            const res = await apiJson<{ created: boolean }>("POST", "/api/admin/evaluations/assign", {
                mode: "single",
                scheduleId,
                evaluatorId,
            })
            if (!res.ok) throw new Error(res.error ?? "Failed to assign evaluation")

            toast.success((res as any).created ? "Evaluation assigned" : "Already assigned")
            await loadOverview()
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to assign evaluation")
        } finally {
            setAssignWorking(false)
        }
    }

    async function assignFromPanelists() {
        const scheduleId = safeText(assignScheduleId, "")
        if (!scheduleId) {
            toast.error("Please select a schedule.")
            return
        }

        setAssignWorking(true)
        try {
            const res = await apiJson<{ createdCount: number }>("POST", "/api/admin/evaluations/assign", {
                mode: "panelists",
                scheduleId,
            })
            if (!res.ok) throw new Error(res.error ?? "Failed to assign panelist evaluations")

            toast.success(`Assigned ${Number((res as any).createdCount ?? 0)} evaluation(s) from panelists`)
            await loadOverview()
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to assign panelist evaluations")
        } finally {
            setAssignWorking(false)
        }
    }

    async function unassignEvaluation(item: StaffOverviewItem) {
        const scheduleId = item.scheduleId
        const evaluatorId = item.evaluatorId

        const res = await apiJson<{ removed: boolean }>(
            "DELETE",
            `/api/admin/evaluations/assign?scheduleId=${encodeURIComponent(scheduleId)}&evaluatorId=${encodeURIComponent(
                evaluatorId
            )}`
        )
        if (!res.ok) throw new Error(res.error ?? "Failed to unassign evaluation")

        if ((res as any).removed) toast.success("Evaluation unassigned")
        else toast.error("Cannot unassign (already submitted/locked).")
        await loadOverview()
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="icon" onClick={() => router.push("/dashboard/admin")}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5" />
                                <h1 className="text-xl font-semibold">Evaluation Management</h1>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Admin oversight + assignment for staff evaluations and student feedback.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={refreshAll} disabled={loading || refreshing}>
                            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Refresh
                        </Button>

                        <Button onClick={openAssignDialog} disabled={loading || refreshing}>
                            <Plus className="mr-2 h-4 w-4" />
                            Assign evaluations
                        </Button>

                        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                            <Checkbox
                                id="showInternalIds"
                                checked={showInternalIds}
                                onCheckedChange={(v) => setShowInternalIds(Boolean(v))}
                            />
                            <Label htmlFor="showInternalIds" className="cursor-pointer select-none text-sm">
                                Show internal IDs
                            </Label>
                        </div>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="staff">Staff evaluations</TabsTrigger>
                        <TabsTrigger value="students">Student feedback</TabsTrigger>
                    </TabsList>

                    {/* STAFF EVALUATIONS */}
                    <TabsContent value="staff" className="mt-4">
                        <Card>
                            <CardHeader className="space-y-1">
                                <CardTitle className="flex items-center justify-between gap-2">
                                    <span>Staff evaluation records</span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="secondary">All: {staffSummary.total}</Badge>
                                        <Badge variant="secondary">Pending: {staffSummary.pending}</Badge>
                                        <Badge>Submitted: {staffSummary.submitted}</Badge>
                                        <Badge variant="outline">Locked: {staffSummary.locked}</Badge>
                                    </div>
                                </CardTitle>
                                <CardDescription>
                                    Assign evaluation rows when needed (Admin). Lock/unlock for finalization control.
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground">Search</Label>
                                        <div className="relative">
                                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                value={staffQ}
                                                onChange={(e) => setStaffQ(e.target.value)}
                                                className="pl-8"
                                                placeholder="group, evaluator, email..."
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground">Schedule</Label>
                                        <Select
                                            value={staffScheduleFilter || CLEAR_SELECT_VALUE}
                                            onValueChange={(v) => setStaffScheduleFilter(v === CLEAR_SELECT_VALUE ? "" : v)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="All schedules" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={CLEAR_SELECT_VALUE}>All schedules</SelectItem>
                                                {staffScheduleOptions.map((s) => (
                                                    <SelectItem key={s.id} value={s.id}>
                                                        <span className="truncate">{s.label}</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground">Evaluator</Label>
                                        <Select
                                            value={staffEvaluatorFilter || CLEAR_SELECT_VALUE}
                                            onValueChange={(v) => setStaffEvaluatorFilter(v === CLEAR_SELECT_VALUE ? "" : v)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="All evaluators" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={CLEAR_SELECT_VALUE}>All evaluators</SelectItem>
                                                {staffEvaluatorOptions.map((u) => (
                                                    <SelectItem key={u.id} value={u.id}>
                                                        <span className="truncate">{u.label}</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground">Status</Label>
                                        <Select
                                            value={staffStatusFilter || CLEAR_SELECT_VALUE}
                                            onValueChange={(v) => setStaffStatusFilter(v === CLEAR_SELECT_VALUE ? "" : v)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="All statuses" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={CLEAR_SELECT_VALUE}>All statuses</SelectItem>
                                                <SelectItem value="pending">Pending</SelectItem>
                                                <SelectItem value="submitted">Submitted</SelectItem>
                                                <SelectItem value="locked">Locked</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="flex items-end gap-2 lg:col-span-4">
                                        <Button
                                            variant="outline"
                                            className="w-full"
                                            onClick={() => {
                                                setStaffQ("")
                                                setStaffStatusFilter("")
                                                setStaffScheduleFilter("")
                                                setStaffEvaluatorFilter("")
                                            }}
                                        >
                                            <Filter className="mr-2 h-4 w-4" />
                                            Clear filters
                                        </Button>
                                    </div>
                                </div>

                                <Separator />

                                {loading ? (
                                    <div className="space-y-2">
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                    </div>
                                ) : (
                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-72">Schedule</TableHead>
                                                    <TableHead className="w-72">Evaluator</TableHead>
                                                    <TableHead className="w-40">Status</TableHead>
                                                    <TableHead className="w-56">Submitted</TableHead>
                                                    <TableHead className="w-56">Locked</TableHead>
                                                    <TableHead className="w-72 text-right">Action</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {staffFiltered.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                                                            No records found.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    staffFiltered.map((it) => {
                                                        const s = safeText(it.status, "").toLowerCase()
                                                        const isLocked = s === "locked"
                                                        const isSubmitted = ["submitted", "done", "completed"].includes(s)
                                                        const canUnassign = !isLocked && !isSubmitted && !it.submittedAt && !it.lockedAt

                                                        return (
                                                            <TableRow key={it.id}>
                                                                <TableCell className="align-top">
                                                                    <div className="space-y-1">
                                                                        <div className="font-medium">{safeText(it.groupTitle, "Schedule")}</div>
                                                                        <div className="text-xs text-muted-foreground">
                                                                            {scheduleLine(it.groupTitle, it.scheduledAt, it.room)}
                                                                        </div>
                                                                        {(it.program || it.term) && (
                                                                            <div className="text-xs text-muted-foreground">
                                                                                {[safeText(it.program, ""), safeText(it.term, "")]
                                                                                    .filter(Boolean)
                                                                                    .join(" · ")}
                                                                            </div>
                                                                        )}
                                                                        {showInternalIds && (
                                                                            <div className="mt-1 text-[10px] text-muted-foreground">
                                                                                Eval: {it.id} • Schedule: {it.scheduleId}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </TableCell>

                                                                <TableCell className="align-top">
                                                                    <div className="space-y-1">
                                                                        <div className="font-medium">{personLine(it.evaluatorName, it.evaluatorEmail)}</div>
                                                                        <div className="text-xs text-muted-foreground">{titleCaseRole(it.evaluatorRole) || "—"}</div>
                                                                        {showInternalIds && (
                                                                            <div className="mt-1 text-[10px] text-muted-foreground">User: {it.evaluatorId}</div>
                                                                        )}
                                                                    </div>
                                                                </TableCell>

                                                                <TableCell className="align-top">{statusBadge(it.status)}</TableCell>

                                                                <TableCell className="align-top">
                                                                    <div className="text-sm">{fmtDateTime(it.submittedAt) || "—"}</div>
                                                                </TableCell>

                                                                <TableCell className="align-top">
                                                                    <div className="text-sm">{fmtDateTime(it.lockedAt) || "—"}</div>
                                                                </TableCell>

                                                                <TableCell className="align-top text-right">
                                                                    <div className="flex flex-wrap justify-end gap-2">
                                                                        <Button asChild size="sm" variant="outline">
                                                                            <Link href={`/dashboard/admin/evaluation/${it.id}`}>
                                                                                <Eye className="mr-2 h-4 w-4" />
                                                                                View
                                                                            </Link>
                                                                        </Button>

                                                                        {isLocked ? (
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                onClick={() =>
                                                                                    openConfirm(
                                                                                        "Unlock evaluation?",
                                                                                        "This will remove the lock so it can be edited again.",
                                                                                        async () => setStaffLock(it, false)
                                                                                    )
                                                                                }
                                                                            >
                                                                                <Unlock className="mr-2 h-4 w-4" />
                                                                                Unlock
                                                                            </Button>
                                                                        ) : (
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                onClick={() =>
                                                                                    openConfirm(
                                                                                        "Lock evaluation?",
                                                                                        "This will lock the evaluation to prevent further changes.",
                                                                                        async () => setStaffLock(it, true)
                                                                                    )
                                                                                }
                                                                            >
                                                                                <Lock className="mr-2 h-4 w-4" />
                                                                                Lock
                                                                            </Button>
                                                                        )}

                                                                        <Button
                                                                            size="sm"
                                                                            variant="destructive"
                                                                            disabled={!canUnassign}
                                                                            onClick={() =>
                                                                                openConfirm(
                                                                                    "Unassign evaluation?",
                                                                                    "This removes the evaluation record (only allowed for unsubmitted/unlocked).",
                                                                                    async () => unassignEvaluation(it)
                                                                                )
                                                                            }
                                                                        >
                                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                                            Unassign
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
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* STUDENT FEEDBACK */}
                    <TabsContent value="students" className="mt-4">
                        <Card>
                            <CardHeader className="space-y-1">
                                <CardTitle className="flex items-center justify-between gap-2">
                                    <span>Student feedback records</span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="secondary">All: {studentSummary.total}</Badge>
                                        <Badge variant="secondary">Pending: {studentSummary.pending}</Badge>
                                        <Badge>Submitted: {studentSummary.submitted}</Badge>
                                        <Badge variant="outline">Locked: {studentSummary.locked}</Badge>
                                    </div>
                                </CardTitle>
                                <CardDescription>
                                    Inspect answers and lock/unlock when required. (Answers are loaded only when you open a record.)
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground">Search</Label>
                                        <div className="relative">
                                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                value={studentQ}
                                                onChange={(e) => setStudentQ(e.target.value)}
                                                className="pl-8"
                                                placeholder="group, student, email..."
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground">Schedule</Label>
                                        <Select
                                            value={studentScheduleFilter || CLEAR_SELECT_VALUE}
                                            onValueChange={(v) => setStudentScheduleFilter(v === CLEAR_SELECT_VALUE ? "" : v)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="All schedules" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={CLEAR_SELECT_VALUE}>All schedules</SelectItem>
                                                {studentScheduleOptions.map((s) => (
                                                    <SelectItem key={s.id} value={s.id}>
                                                        <span className="truncate">{s.label}</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground">Student</Label>
                                        <Select
                                            value={studentFilter || CLEAR_SELECT_VALUE}
                                            onValueChange={(v) => setStudentFilter(v === CLEAR_SELECT_VALUE ? "" : v)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="All students" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={CLEAR_SELECT_VALUE}>All students</SelectItem>
                                                {studentOptions.map((u) => (
                                                    <SelectItem key={u.id} value={u.id}>
                                                        <span className="truncate">{u.label}</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground">Status</Label>
                                        <Select
                                            value={studentStatusFilter || CLEAR_SELECT_VALUE}
                                            onValueChange={(v) => setStudentStatusFilter(v === CLEAR_SELECT_VALUE ? "" : v)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="All statuses" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={CLEAR_SELECT_VALUE}>All statuses</SelectItem>
                                                <SelectItem value="pending">Pending</SelectItem>
                                                <SelectItem value="submitted">Submitted</SelectItem>
                                                <SelectItem value="locked">Locked</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="flex items-end gap-2 lg:col-span-4">
                                        <Button
                                            variant="outline"
                                            className="w-full"
                                            onClick={() => {
                                                setStudentQ("")
                                                setStudentStatusFilter("")
                                                setStudentScheduleFilter("")
                                                setStudentFilter("")
                                            }}
                                        >
                                            <Filter className="mr-2 h-4 w-4" />
                                            Clear filters
                                        </Button>
                                    </div>
                                </div>

                                <Separator />

                                {loading ? (
                                    <div className="space-y-2">
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                    </div>
                                ) : (
                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-72">Schedule</TableHead>
                                                    <TableHead className="w-72">Student</TableHead>
                                                    <TableHead className="w-40">Status</TableHead>
                                                    <TableHead className="w-56">Submitted</TableHead>
                                                    <TableHead className="w-56">Locked</TableHead>
                                                    <TableHead className="w-56 text-right">Action</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {studentFiltered.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                                                            No records found.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    studentFiltered.map((it) => {
                                                        const isLocked = safeText(it.status, "").toLowerCase() === "locked"
                                                        return (
                                                            <TableRow key={it.id}>
                                                                <TableCell className="align-top">
                                                                    <div className="space-y-1">
                                                                        <div className="font-medium">{safeText(it.groupTitle, "Schedule")}</div>
                                                                        <div className="text-xs text-muted-foreground">
                                                                            {scheduleLine(it.groupTitle, it.scheduledAt, it.room)}
                                                                        </div>
                                                                        {(it.program || it.term) && (
                                                                            <div className="text-xs text-muted-foreground">
                                                                                {[safeText(it.program, ""), safeText(it.term, "")]
                                                                                    .filter(Boolean)
                                                                                    .join(" · ")}
                                                                            </div>
                                                                        )}
                                                                        {showInternalIds && (
                                                                            <div className="mt-1 text-[10px] text-muted-foreground">
                                                                                Record: {it.id} • Schedule: {it.scheduleId}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </TableCell>

                                                                <TableCell className="align-top">
                                                                    <div className="space-y-1">
                                                                        <div className="font-medium">{personLine(it.studentName, it.studentEmail)}</div>
                                                                        {showInternalIds && (
                                                                            <div className="mt-1 text-[10px] text-muted-foreground">User: {it.studentId}</div>
                                                                        )}
                                                                    </div>
                                                                </TableCell>

                                                                <TableCell className="align-top">{statusBadge(it.status)}</TableCell>

                                                                <TableCell className="align-top">
                                                                    <div className="text-sm">{fmtDateTime(it.submittedAt) || "—"}</div>
                                                                </TableCell>

                                                                <TableCell className="align-top">
                                                                    <div className="text-sm">{fmtDateTime(it.lockedAt) || "—"}</div>
                                                                </TableCell>

                                                                <TableCell className="align-top text-right">
                                                                    <div className="flex flex-wrap justify-end gap-2">
                                                                        <Button size="sm" variant="outline" onClick={() => inspectStudentEvaluation(it)}>
                                                                            <Eye className="mr-2 h-4 w-4" />
                                                                            Inspect
                                                                        </Button>

                                                                        {isLocked ? (
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                onClick={() =>
                                                                                    openConfirm(
                                                                                        "Unlock student feedback?",
                                                                                        "This will remove the lock so it can be edited again.",
                                                                                        async () => setStudentLock(it, false)
                                                                                    )
                                                                                }
                                                                            >
                                                                                <Unlock className="mr-2 h-4 w-4" />
                                                                                Unlock
                                                                            </Button>
                                                                        ) : (
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                onClick={() =>
                                                                                    openConfirm(
                                                                                        "Lock student feedback?",
                                                                                        "This will lock the record to prevent further changes.",
                                                                                        async () => setStudentLock(it, true)
                                                                                    )
                                                                                }
                                                                            >
                                                                                <Lock className="mr-2 h-4 w-4" />
                                                                                Lock
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        )
                                                    })
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {/* Assign Evaluations Dialog */}
                <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                    <DialogContent className="sm:max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Assign evaluations</DialogTitle>
                            <DialogDescription>
                                Create missing staff evaluation records for a schedule. You can assign a single staff evaluator or bulk-assign all panelists.
                            </DialogDescription>
                        </DialogHeader>

                        {assignLoading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-2/3" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Schedule</Label>
                                    <Select
                                        value={assignScheduleId || CLEAR_SELECT_VALUE}
                                        onValueChange={(v) => setAssignScheduleId(v === CLEAR_SELECT_VALUE ? "" : v)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select schedule" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={CLEAR_SELECT_VALUE}>Select schedule</SelectItem>
                                            {assignScheduleOptions.map((sc) => (
                                                <SelectItem key={sc.id} value={sc.id}>
                                                    <span className="truncate">
                                                        {scheduleLine(safeText(sc.groupTitle, "Schedule"), sc.scheduledAt, sc.room)}
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Tabs value={assignTab} onValueChange={(v) => setAssignTab(v as any)}>
                                    <TabsList className="grid w-full grid-cols-2">
                                        <TabsTrigger value="single">Assign one staff</TabsTrigger>
                                        <TabsTrigger value="panelists">Assign all panelists</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="single" className="mt-4 space-y-3">
                                        <div className="space-y-2">
                                            <Label className="text-xs text-muted-foreground">Staff evaluator</Label>
                                            <Select
                                                value={assignEvaluatorId || CLEAR_SELECT_VALUE}
                                                onValueChange={(v) => setAssignEvaluatorId(v === CLEAR_SELECT_VALUE ? "" : v)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select staff" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={CLEAR_SELECT_VALUE}>Select staff</SelectItem>
                                                    {assignStaffUsers.map((u) => (
                                                        <SelectItem key={u.id} value={u.id}>
                                                            <span className="truncate">{userLabel(u)}</span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assignWorking}>
                                                Close
                                            </Button>
                                            <Button onClick={assignSingle} disabled={assignWorking}>
                                                {assignWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                Assign
                                            </Button>
                                        </DialogFooter>
                                    </TabsContent>

                                    <TabsContent value="panelists" className="mt-4 space-y-3">
                                        <div className="rounded-md border p-3 text-sm text-muted-foreground">
                                            This will create missing evaluation rows for all panelists assigned to the selected schedule
                                            (from <span className="font-mono">schedule_panelists</span>).
                                        </div>


                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assignWorking}>
                                                Close
                                            </Button>
                                            <Button onClick={assignFromPanelists} disabled={assignWorking}>
                                                {assignWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                Assign panelists
                                            </Button>
                                        </DialogFooter>
                                    </TabsContent>
                                </Tabs>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                {/* Inspect Student Answers */}
                <Dialog open={inspectOpen} onOpenChange={setInspectOpen}>
                    <DialogContent className="sm:max-w-xl">
                        <DialogHeader>
                            <DialogTitle>{inspectTitle || "Inspect"}</DialogTitle>
                            <DialogDescription>Answers are shown as JSON (as stored).</DialogDescription>
                        </DialogHeader>

                        {inspectLoading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-6 w-full" />
                                <Skeleton className="h-6 w-3/4" />
                                <Skeleton className="h-64 w-full" />
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-md border p-3">
                                        <div className="text-xs text-muted-foreground">Status</div>
                                        <div className="mt-1">{statusBadge(inspectMeta?.status ?? null)}</div>
                                    </div>
                                    <div className="rounded-md border p-3">
                                        <div className="text-xs text-muted-foreground">Updated</div>
                                        <div className="mt-1 text-sm">{fmtDateTime(inspectMeta?.updatedAt ?? null) || "—"}</div>
                                    </div>
                                </div>

                                <div>
                                    <div className="mb-2 text-sm font-semibold">Answers (JSON)</div>
                                    <ScrollArea className="h-64 rounded-md border">
                                        <pre className="p-3 text-xs">{JSON.stringify(inspectAnswers ?? {}, null, 2)}</pre>
                                    </ScrollArea>
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setInspectOpen(false)}>
                                Close
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Confirm dialog */}
                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
                            <AlertDialogDescription>{confirmDesc}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={async () => {
                                    try {
                                        const fn = confirmActionRef.current
                                        confirmActionRef.current = null
                                        if (fn) await fn()
                                    } catch (e: any) {
                                        toast.error(e?.message ?? "Action failed")
                                    }
                                }}
                            >
                                Continue
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </DashboardLayout>
    )
}
