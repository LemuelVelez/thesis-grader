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
    UserPlus,
    UserMinus,
    Users,
    Cpu,
} from "lucide-react"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

    // provided by adminEvaluationsRoutes
    studentCount?: number
    panelistCount?: number
}

type StudentOverviewItem = {
    id: string
    status: "pending" | "submitted" | "locked" | string
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

    // provided by adminEvaluationsRoutes
    studentCount?: number
    panelistCount?: number
}

type StaffUserOption = { id: string; name: string | null; email: string; role?: string | null; status?: string | null }

type AdminScheduleItem = {
    id: string
    scheduledAt: string
    room: string | null
    status: string | null
    groupId: string
    groupTitle: string
    program: string | null
    term: string | null
    studentCount?: number
    panelistCount?: number
    evaluationCount?: number
}

type Person = { id: string; name: string | null; email: string }

type AdminEvalDetail = {
    evaluation: {
        id: string
        status: string
        submittedAt: string | null
        lockedAt: string | null
        createdAt: string | null
    }
    schedule: {
        id: string
        scheduledAt: string
        room: string | null
        status: string | null
    }
    group: {
        id: string
        title: string
        program: string | null
        term: string | null
        adviser: Person | null
        students: Person[]
    }
    evaluator: Person
    panelists: Person[]
    rubric: {
        id: string
        name: string
        version: number
        active: boolean
        description: string | null
        createdAt: string
        updatedAt: string
    } | null
    criteria: Array<{
        criterionId: string
        criterion: string
        description: string | null
        weight: string
        minScore: number
        maxScore: number
        score: number | null
        comment: string | null
    }>
}

type EvalScoreSummary = {
    rows: number
    scoredCount: number
    weightedAverage: number
}

function safeText(v: any, fallback = "") {
    const s = String(v ?? "").trim()
    return s ? s : fallback
}

function toNumber(v: any, fallback = 0) {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
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
    if (s === "pending" || s === "draft" || s === "") return <Badge variant="secondary">Pending</Badge>
    if (s === "locked") return <Badge variant="outline">Locked</Badge>
    if (s === "archived") return <Badge variant="outline">Archived</Badge>
    if (s === "cancelled" || s === "canceled") return <Badge variant="destructive">Cancelled</Badge>
    return <Badge variant="secondary">{safeText(status, "Unknown")}</Badge>
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
    return n || e || "—"
}

function personLabel(p: Person | null | undefined) {
    if (!p) return "—"
    const n = safeText(p.name, "")
    const e = safeText(p.email, "")
    if (n && e) return `${n} (${e})`
    return n || e || "—"
}

function normalizeList(payload: any): any[] {
    const raw = payload
    const arr =
        raw?.items ??
        raw?.schedules ??
        raw?.users ??
        raw?.data ??
        raw?.rows ??
        raw?.result ??
        (Array.isArray(raw) ? raw : null)
    return Array.isArray(arr) ? arr : []
}

function computeSummary(criteria: Array<{ weight: string; score: number | null }>): EvalScoreSummary {
    const rows = Array.isArray(criteria) ? criteria.length : 0
    let scoredCount = 0
    let totalWeight = 0
    let weightedSum = 0

    for (const r of criteria ?? []) {
        const w = toNumber(r?.weight, 1)
        const sc = typeof r?.score === "number" ? r.score : toNumber(r?.score, NaN)
        if (Number.isFinite(sc)) {
            scoredCount += 1
            totalWeight += w
            weightedSum += sc * w
        }
    }

    const avg = totalWeight > 0 ? weightedSum / totalWeight : 0
    return { rows, scoredCount, weightedAverage: avg }
}

export default function AdminEvaluationPage() {
    const router = useRouter()
    const { user, loading: authLoading } = useAuth()

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [activeTab, setActiveTab] = React.useState<"staff" | "students">("staff")

    // schedules (IMPORTANT: schedules exist even if evaluations don't)
    const [scheduleItems, setScheduleItems] = React.useState<AdminScheduleItem[]>([])

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

    // NEW: inspect staff evaluation (scores + group members + system/extras)
    const [staffInspectOpen, setStaffInspectOpen] = React.useState(false)
    const [staffInspectLoading, setStaffInspectLoading] = React.useState(false)
    const [staffInspectTitle, setStaffInspectTitle] = React.useState("")
    const [staffInspectItem, setStaffInspectItem] = React.useState<StaffOverviewItem | null>(null)
    const [staffInspectTab, setStaffInspectTab] = React.useState<"scores" | "members" | "system">("scores")
    const [staffInspectDetail, setStaffInspectDetail] = React.useState<AdminEvalDetail | null>(null)
    const [staffInspectMembers, setStaffInspectMembers] = React.useState<Person[]>([])
    const [staffInspectExtras, setStaffInspectExtras] = React.useState<any>(null)

    const staffInspectSummary = React.useMemo(() => {
        return computeSummary((staffInspectDetail?.criteria ?? []) as any)
    }, [staffInspectDetail?.criteria])

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

    // ASSIGN dialog
    const [assignOpen, setAssignOpen] = React.useState(false)
    const [assignMode, setAssignMode] = React.useState<"panelists" | "single">("panelists")
    const [assignScheduleId, setAssignScheduleId] = React.useState("")
    const [assignStaffId, setAssignStaffId] = React.useState("")
    const [assignWorking, setAssignWorking] = React.useState(false)

    const [staffUsersLoading, setStaffUsersLoading] = React.useState(false)
    const [staffUsers, setStaffUsers] = React.useState<StaffUserOption[]>([])

    function openAssignDialog(mode: "panelists" | "single", scheduleId?: string) {
        setAssignMode(mode)
        setAssignScheduleId(safeText(scheduleId, ""))
        setAssignStaffId("")
        setAssignOpen(true)
    }

    async function loadStaffUsers() {
        setStaffUsersLoading(true)
        try {
            const res = await apiJson<any>("GET", "/api/admin/users?limit=500&offset=0")
            if (!res.ok) throw new Error(res.error ?? "Failed to load staff users")

            const rows = normalizeList(res)
            const filtered = rows
                .map((u: any) => ({
                    id: safeText(u?.id, ""),
                    name: u?.name ?? null,
                    email: safeText(u?.email, ""),
                    role: u?.role ?? null,
                    status: u?.status ?? null,
                }))
                .filter((u: StaffUserOption) => safeText(u.role, "").toLowerCase() === "staff")

            setStaffUsers(filtered)
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to load staff users")
        } finally {
            setStaffUsersLoading(false)
        }
    }

    async function loadOverview() {
        setLoading(true)
        try {
            const [staffRes, studentRes, schedRes] = await Promise.all([
                apiJson<{ total: number; items: StaffOverviewItem[] }>("GET", "/api/admin/evaluations?type=staff&limit=500&offset=0"),
                apiJson<{ total: number; items: StudentOverviewItem[] }>("GET", "/api/admin/evaluations?type=student&limit=500&offset=0"),
                // IMPORTANT FIX: load schedules directly (so schedule dropdown works even if no evaluations exist yet)
                apiJson<{ total: number; items: AdminScheduleItem[] }>("GET", "/api/admin/schedules?limit=500&offset=0"),
            ])

            if (!staffRes.ok) throw new Error(staffRes.error ?? "Failed to load staff evaluations")
            if (!studentRes.ok) throw new Error(studentRes.error ?? "Failed to load student feedback")
            if (!schedRes.ok) throw new Error(schedRes.error ?? "Failed to load schedules")

            setStaffItems(Array.isArray((staffRes as any).items) ? (staffRes as any).items : [])
            setStudentItems(Array.isArray((studentRes as any).items) ? (studentRes as any).items : [])
            setScheduleItems(Array.isArray((schedRes as any).items) ? (schedRes as any).items : [])
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

    // load staff users when opening assign dialog in single mode
    React.useEffect(() => {
        if (!assignOpen) return
        if (assignMode !== "single") return
        if (staffUsers.length > 0) return
        loadStaffUsers()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assignOpen, assignMode])

    const scheduleOptions = React.useMemo(() => {
        const map = new Map<string, { id: string; label: string }>()
        for (const s of scheduleItems) {
            const sid = safeText(s.id, "")
            if (!sid) continue
            if (!map.has(sid)) {
                map.set(sid, {
                    id: sid,
                    label: scheduleLine(safeText(s.groupTitle, "Schedule"), safeText(s.scheduledAt, ""), s.room ?? null),
                })
            }
        }
        return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
    }, [scheduleItems])

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
            ]
                .filter(Boolean)
                .join(" · ")
                .toLowerCase()

            return parts.includes(qq)
        })
    }, [staffItems, staffQ, staffStatusFilter, staffScheduleFilter, staffEvaluatorFilter])

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
            ]
                .filter(Boolean)
                .join(" · ")
                .toLowerCase()

            return parts.includes(qq)
        })
    }, [studentItems, studentQ, studentStatusFilter, studentScheduleFilter, studentFilter])

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

    // NEW: staff inspect (scores + members + system/extras)
    async function inspectStaffEvaluation(item: StaffOverviewItem) {
        setStaffInspectOpen(true)
        setStaffInspectLoading(true)
        setStaffInspectItem(item)
        setStaffInspectTab("scores")
        setStaffInspectDetail(null)
        setStaffInspectMembers([])
        setStaffInspectExtras(null)

        setStaffInspectTitle(`Staff evaluation • ${scheduleLine(item.groupTitle, item.scheduledAt, item.room)}`)

        const detailUrl = `/api/admin/evaluations/detail?id=${encodeURIComponent(item.id)}`
        const membersUrl = `/api/evaluations/members?evaluationId=${encodeURIComponent(item.id)}`
        const extrasUrl = `/api/evaluations/extras?evaluationId=${encodeURIComponent(item.id)}`

        try {
            const [d, m, x] = await Promise.allSettled([
                apiJson<{ detail: AdminEvalDetail }>("GET", detailUrl),
                apiJson<{ members: Person[] }>("GET", membersUrl),
                apiJson<{ extras: any }>("GET", extrasUrl),
            ])

            const errs: string[] = []

            if (d.status === "fulfilled" && d.value.ok) {
                const detail = (d.value as any).detail ?? null
                setStaffInspectDetail(detail)
            } else {
                errs.push(
                    d.status === "fulfilled"
                        ? safeText((d.value as any)?.error ?? (d.value as any)?.message, "Failed to load scores")
                        : safeText(d.reason?.message, "Failed to load scores")
                )
            }

            if (m.status === "fulfilled" && m.value.ok) {
                setStaffInspectMembers(Array.isArray((m.value as any).members) ? (m.value as any).members : [])
            } else {
                errs.push(
                    m.status === "fulfilled"
                        ? safeText((m.value as any)?.error ?? (m.value as any)?.message, "Failed to load group members")
                        : safeText(m.reason?.message, "Failed to load group members")
                )
            }

            if (x.status === "fulfilled" && x.value.ok) {
                setStaffInspectExtras((x.value as any).extras ?? null)
            } else {
                // extras is optional; don’t block, but notify once
                errs.push(
                    x.status === "fulfilled"
                        ? safeText((x.value as any)?.error ?? (x.value as any)?.message, "Failed to load system data")
                        : safeText(x.reason?.message, "Failed to load system data")
                )
            }

            if (errs.length) {
                // show only one toast to avoid spam
                toast.error(errs[0])
            }
        } finally {
            setStaffInspectLoading(false)
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

    async function assignPanelists(scheduleId: string) {
        const res = await apiJson("POST", "/api/admin/evaluations/assign", { mode: "panelists", scheduleId })
        if (!res.ok) throw new Error(res.error ?? "Failed to assign panelists")
        toast.success(`Assigned panelists. Created: ${(res as any).createdCount ?? 0}`)
        await loadOverview()
    }

    async function assignSingle(scheduleId: string, evaluatorId: string) {
        const res = await apiJson("POST", "/api/admin/evaluations/assign", { mode: "single", scheduleId, evaluatorId })
        if (!res.ok) throw new Error(res.error ?? "Failed to assign evaluator")

        const created = Boolean((res as any).created)
        toast.success(created ? "Evaluator assigned" : "Already assigned")
        await loadOverview()
    }

    async function unassignSingle(scheduleId: string, evaluatorId: string) {
        const res = await apiJson(
            "DELETE",
            `/api/admin/evaluations/assign?scheduleId=${encodeURIComponent(scheduleId)}&evaluatorId=${encodeURIComponent(evaluatorId)}`
        )
        if (!res.ok) throw new Error(res.error ?? "Failed to unassign evaluator")
        toast.success((res as any).removed ? "Unassigned" : "Not removed (already submitted/locked)")
        await loadOverview()
    }

    const selectedScheduleForActions = activeTab === "staff" ? staffScheduleFilter : studentScheduleFilter

    // staff inspect footer helpers (stable + safe)
    const staffInspectFooterStatus = safeText(staffInspectDetail?.evaluation?.status ?? staffInspectItem?.status ?? "", "").toLowerCase()
    const staffInspectFooterIsLocked = staffInspectFooterStatus === "locked"

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
                                Admin oversight: assign evaluators, view scores (including group members + system data), and lock/unlock submissions.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={refreshAll} disabled={loading || refreshing}>
                            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Refresh
                        </Button>

                        <Button
                            variant="outline"
                            onClick={() => openAssignDialog("panelists", selectedScheduleForActions || "")}
                            disabled={loading || refreshing}
                        >
                            <UserPlus className="mr-2 h-4 w-4" />
                            Assign evaluation
                        </Button>
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
                                    Admins can inspect any record to view rubric scores, group members, and system/extras (read-only), and can lock/unlock if needed.
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
                                                {scheduleOptions.map((s) => (
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

                                    <div className="flex flex-col gap-2 lg:col-span-4 lg:flex-row">
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

                                        <Button
                                            className="w-full"
                                            variant="outline"
                                            disabled={!staffScheduleFilter}
                                            onClick={() => {
                                                if (!staffScheduleFilter) return
                                                router.push(`/dashboard/admin/evaluation/${staffScheduleFilter}`)
                                            }}
                                        >
                                            <Eye className="mr-2 h-4 w-4" />
                                            View schedule detail
                                        </Button>

                                        <Button
                                            className="w-full"
                                            variant="outline"
                                            disabled={!staffScheduleFilter}
                                            onClick={() =>
                                                openConfirm(
                                                    "Assign panelists for this schedule?",
                                                    "This will create missing evaluation records for all panelists assigned to the selected schedule.",
                                                    async () => assignPanelists(staffScheduleFilter)
                                                )
                                            }
                                        >
                                            <UserPlus className="mr-2 h-4 w-4" />
                                            Assign panelists (selected schedule)
                                        </Button>

                                        <Button className="w-full" variant="outline" onClick={() => openAssignDialog("single", staffScheduleFilter || "")}>
                                            <UserPlus className="mr-2 h-4 w-4" />
                                            Assign single evaluator
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
                                                    <TableHead className="w-80 text-right">Action</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {staffFiltered.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                                                            No records found.
                                                            <div className="mt-2 text-xs text-muted-foreground">
                                                                If schedules exist but no records show, use{" "}
                                                                <span className="font-medium">Assign panelists</span> to create evaluation rows.
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    staffFiltered.map((it) => {
                                                        const s = safeText(it.status, "").toLowerCase()
                                                        const isLocked = s === "locked"
                                                        const canUnassign =
                                                            !it.submittedAt && !it.lockedAt && ["pending", "draft", ""].includes(s)

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
                                                                                {[safeText(it.program, ""), safeText(it.term, "")].filter(Boolean).join(" · ")}
                                                                            </div>
                                                                        )}
                                                                        <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
                                                                            <span>Students: {Number.isFinite(Number(it.studentCount)) ? it.studentCount : "—"}</span>
                                                                            <span>Panelists: {Number.isFinite(Number(it.panelistCount)) ? it.panelistCount : "—"}</span>
                                                                        </div>
                                                                    </div>
                                                                </TableCell>

                                                                <TableCell className="align-top">
                                                                    <div className="space-y-1">
                                                                        <div className="font-medium">{personLine(it.evaluatorName, it.evaluatorEmail)}</div>
                                                                        <div className="text-xs text-muted-foreground">
                                                                            {safeText(it.evaluatorRole, "").toLowerCase()
                                                                                ? safeText(it.evaluatorRole, "").charAt(0).toUpperCase() +
                                                                                safeText(it.evaluatorRole, "").slice(1).toLowerCase()
                                                                                : "—"}
                                                                        </div>
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
                                                                        <Button size="sm" variant="outline" onClick={() => inspectStaffEvaluation(it)}>
                                                                            <Eye className="mr-2 h-4 w-4" />
                                                                            Inspect (scores)
                                                                        </Button>

                                                                        <Button asChild size="sm" variant="outline">
                                                                            <Link href={`/dashboard/admin/evaluation/${it.id}`}>Open detail</Link>
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

                                                                        {canUnassign ? (
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                onClick={() =>
                                                                                    openConfirm(
                                                                                        "Unassign evaluator?",
                                                                                        "This removes the evaluation assignment (only allowed if not submitted/locked).",
                                                                                        async () => unassignSingle(it.scheduleId, it.evaluatorId)
                                                                                    )
                                                                                }
                                                                            >
                                                                                <UserMinus className="mr-2 h-4 w-4" />
                                                                                Unassign
                                                                            </Button>
                                                                        ) : null}
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
                                                {scheduleOptions.map((s) => (
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

                                    <div className="flex flex-col gap-2 lg:col-span-4 lg:flex-row">
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

                                        <Button
                                            className="w-full"
                                            variant="outline"
                                            disabled={!studentScheduleFilter}
                                            onClick={() => {
                                                if (!studentScheduleFilter) return
                                                router.push(`/dashboard/admin/evaluation/${studentScheduleFilter}`)
                                            }}
                                        >
                                            <Eye className="mr-2 h-4 w-4" />
                                            View schedule detail
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
                                                                                {[safeText(it.program, ""), safeText(it.term, "")].filter(Boolean).join(" · ")}
                                                                            </div>
                                                                        )}
                                                                        <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
                                                                            <span>Students: {Number.isFinite(Number(it.studentCount)) ? it.studentCount : "—"}</span>
                                                                            <span>Panelists: {Number.isFinite(Number(it.panelistCount)) ? it.panelistCount : "—"}</span>
                                                                        </div>
                                                                    </div>
                                                                </TableCell>

                                                                <TableCell className="align-top">
                                                                    <div className="space-y-1">
                                                                        <div className="font-medium">{personLine(it.studentName, it.studentEmail)}</div>
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

                {/* Assign dialog */}
                <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Assign evaluation</DialogTitle>
                            <DialogDescription>Create evaluation assignment(s) for a defense schedule.</DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Mode</Label>
                                <Select value={assignMode} onValueChange={(v) => setAssignMode(v as any)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="panelists">Assign all panelists (recommended)</SelectItem>
                                        <SelectItem value="single">Assign a single evaluator</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Schedule</Label>
                                <Select value={assignScheduleId || CLEAR_SELECT_VALUE} onValueChange={(v) => setAssignScheduleId(v === CLEAR_SELECT_VALUE ? "" : v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select schedule" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={CLEAR_SELECT_VALUE}>Select schedule</SelectItem>
                                        {scheduleOptions.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>
                                                <span className="truncate">{s.label}</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {assignMode === "single" ? (
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Evaluator (staff)</Label>
                                    <Select value={assignStaffId || CLEAR_SELECT_VALUE} onValueChange={(v) => setAssignStaffId(v === CLEAR_SELECT_VALUE ? "" : v)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={staffUsersLoading ? "Loading staff..." : "Select staff evaluator"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={CLEAR_SELECT_VALUE}>Select staff evaluator</SelectItem>
                                            {staffUsers.map((u) => (
                                                <SelectItem key={u.id} value={u.id}>
                                                    <span className="truncate">{personLine(u.name, u.email)}</span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ) : (
                                <div className="rounded-md border p-3 text-sm text-muted-foreground">
                                    This will create missing evaluation records for all panelists in{" "}
                                    <span className="font-medium">schedule_panelists</span> for the selected schedule.
                                </div>
                            )}
                        </div>

                        <DialogFooter className="mt-4">
                            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assignWorking}>
                                Cancel
                            </Button>
                            <Button
                                onClick={async () => {
                                    try {
                                        if (!assignScheduleId) {
                                            toast.error("Please select a schedule")
                                            return
                                        }
                                        if (assignMode === "single" && !assignStaffId) {
                                            toast.error("Please select an evaluator")
                                            return
                                        }

                                        setAssignWorking(true)

                                        if (assignMode === "panelists") {
                                            await assignPanelists(assignScheduleId)
                                        } else {
                                            await assignSingle(assignScheduleId, assignStaffId)
                                        }

                                        setAssignOpen(false)
                                    } catch (e: any) {
                                        toast.error(e?.message ?? "Assign failed")
                                    } finally {
                                        setAssignWorking(false)
                                    }
                                }}
                                disabled={assignWorking}
                            >
                                {assignWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                                Assign
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* NEW: Inspect Staff Evaluation (Scores + Members + System) */}
                <Dialog open={staffInspectOpen} onOpenChange={setStaffInspectOpen}>
                    {/* ✅ FIX: bound dialog height + make body scrollable */}
                    <DialogContent className="sm:max-w-3xl max-h-[90svh] overflow-hidden flex flex-col min-h-0">
                        <DialogHeader className="shrink-0">
                            <DialogTitle>{staffInspectTitle || "Inspect staff evaluation"}</DialogTitle>
                            <DialogDescription>
                                View rubric scores, group members, and system/extras (read-only). Use “Open detail” for the full page.
                            </DialogDescription>
                        </DialogHeader>

                        <ScrollArea className="flex-1 min-h-0">
                            <div className="space-y-4 pr-4">
                                {staffInspectLoading ? (
                                    <div className="space-y-2">
                                        <Skeleton className="h-6 w-full" />
                                        <Skeleton className="h-20 w-full" />
                                        <Skeleton className="h-64 w-full" />
                                    </div>
                                ) : !staffInspectItem ? (
                                    <div className="rounded-md border p-6 text-sm text-muted-foreground">No record selected.</div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                            <div className="rounded-md border p-3">
                                                <div className="text-xs text-muted-foreground">Status</div>
                                                <div className="mt-1">{statusBadge(staffInspectDetail?.evaluation?.status ?? staffInspectItem.status)}</div>
                                                <div className="mt-2 text-xs text-muted-foreground">Submitted</div>
                                                <div className="mt-1 text-sm">
                                                    {fmtDateTime(staffInspectDetail?.evaluation?.submittedAt ?? staffInspectItem.submittedAt) || "—"}
                                                </div>
                                                <div className="mt-2 text-xs text-muted-foreground">Locked</div>
                                                <div className="mt-1 text-sm">
                                                    {fmtDateTime(staffInspectDetail?.evaluation?.lockedAt ?? staffInspectItem.lockedAt) || "—"}
                                                </div>
                                            </div>

                                            <div className="rounded-md border p-3">
                                                <div className="text-xs text-muted-foreground">Score summary</div>
                                                <div className="mt-1 text-sm">
                                                    Rows: {staffInspectSummary.rows} · Scored: {staffInspectSummary.scoredCount}
                                                </div>
                                                <div className="mt-2 text-xs text-muted-foreground">Weighted average</div>
                                                <div className="mt-1 text-xl font-semibold">
                                                    {staffInspectSummary.scoredCount > 0 ? staffInspectSummary.weightedAverage.toFixed(2) : "—"}
                                                </div>
                                                <div className="mt-2 text-xs text-muted-foreground">Evaluator</div>
                                                <div className="mt-1 text-sm">{personLine(staffInspectItem.evaluatorName, staffInspectItem.evaluatorEmail)}</div>
                                            </div>

                                            <div className="rounded-md border p-3">
                                                <div className="text-xs text-muted-foreground">Group</div>
                                                <div className="mt-1 font-medium">{safeText(staffInspectItem.groupTitle, "—")}</div>
                                                <div className="mt-1 text-sm text-muted-foreground">
                                                    {fmtDate(staffInspectItem.scheduledAt)} {fmtTime(staffInspectItem.scheduledAt)}
                                                    {staffInspectItem.room ? <> · Room {staffInspectItem.room}</> : null}
                                                </div>
                                                <div className="mt-2 text-xs text-muted-foreground">Counts</div>
                                                <div className="mt-1 text-sm">
                                                    Students:{" "}
                                                    {staffInspectMembers.length ||
                                                        (Number.isFinite(Number(staffInspectItem.studentCount)) ? staffInspectItem.studentCount : "—")}{" "}
                                                    · Panelists:{" "}
                                                    {Number.isFinite(Number(staffInspectItem.panelistCount)) ? staffInspectItem.panelistCount : "—"}
                                                </div>
                                            </div>
                                        </div>

                                        <Tabs value={staffInspectTab} onValueChange={(v) => setStaffInspectTab(v as any)}>
                                            <TabsList className="grid w-full grid-cols-3">
                                                <TabsTrigger value="scores" className="gap-2">
                                                    <Eye className="h-4 w-4" />
                                                    Scores
                                                </TabsTrigger>
                                                <TabsTrigger value="members" className="gap-2">
                                                    <Users className="h-4 w-4" />
                                                    Group members
                                                </TabsTrigger>
                                                <TabsTrigger value="system" className="gap-2">
                                                    <Cpu className="h-4 w-4" />
                                                    System
                                                </TabsTrigger>
                                            </TabsList>

                                            <TabsContent value="scores" className="mt-3 space-y-3">
                                                {!staffInspectDetail ? (
                                                    <div className="rounded-md border p-6 text-sm text-muted-foreground">Scores were not loaded for this record.</div>
                                                ) : Array.isArray(staffInspectDetail.criteria) && staffInspectDetail.criteria.length > 0 ? (
                                                    <div className="rounded-md border overflow-x-auto">
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow>
                                                                    <TableHead className="w-80">Criterion</TableHead>
                                                                    <TableHead className="w-24">Weight</TableHead>
                                                                    <TableHead className="w-28">Min–Max</TableHead>
                                                                    <TableHead className="w-24">Score</TableHead>
                                                                    <TableHead>Comment</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {staffInspectDetail.criteria.map((r) => {
                                                                    const w = toNumber(r.weight, 1)
                                                                    const sc = typeof r.score === "number" ? r.score : null
                                                                    return (
                                                                        <TableRow key={r.criterionId}>
                                                                            <TableCell className="align-top">
                                                                                <div className="space-y-1">
                                                                                    <div className="font-medium">{safeText(r.criterion, "—")}</div>
                                                                                    {r.description ? (
                                                                                        <div className="text-xs text-muted-foreground">{safeText(r.description, "")}</div>
                                                                                    ) : null}
                                                                                </div>
                                                                            </TableCell>
                                                                            <TableCell className="align-top">{Number.isFinite(w) ? w : "—"}</TableCell>
                                                                            <TableCell className="align-top">
                                                                                {toNumber(r.minScore, 0)}–{toNumber(r.maxScore, 0)}
                                                                            </TableCell>
                                                                            <TableCell className="align-top">{sc ?? "—"}</TableCell>
                                                                            <TableCell className="align-top">
                                                                                <div className="whitespace-pre-wrap text-sm">{safeText(r.comment, "—")}</div>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    )
                                                                })}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                ) : (
                                                    <div className="rounded-md border p-6 text-sm text-muted-foreground">No rubric criteria returned for this evaluation.</div>
                                                )}
                                            </TabsContent>

                                            <TabsContent value="members" className="mt-3 space-y-3">
                                                <div className="rounded-md border p-3">
                                                    <div className="text-sm font-semibold">Group members ({staffInspectMembers.length})</div>
                                                    <Separator className="my-2" />
                                                    {staffInspectMembers.length ? (
                                                        <ScrollArea className="h-48 sm:h-56">
                                                            <div className="space-y-2 pr-3">
                                                                {staffInspectMembers.map((m) => (
                                                                    <div key={m.id} className="text-sm">
                                                                        {personLabel(m)}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </ScrollArea>
                                                    ) : (
                                                        <div className="text-sm text-muted-foreground">No members returned.</div>
                                                    )}
                                                </div>
                                            </TabsContent>

                                            <TabsContent value="system" className="mt-3 space-y-3">
                                                <div className="rounded-md border p-3">
                                                    <div className="text-sm font-semibold">System / Extras</div>
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        This is whatever your app stored in <span className="font-medium">evaluation_extras.data</span>.
                                                    </div>
                                                    <Separator className="my-2" />
                                                    {staffInspectExtras ? (
                                                        <ScrollArea className="h-48 sm:h-56 rounded-md border">
                                                            <pre className="p-3 text-xs">{JSON.stringify(staffInspectExtras, null, 2)}</pre>
                                                        </ScrollArea>
                                                    ) : (
                                                        <div className="text-sm text-muted-foreground">No system data found for this evaluation.</div>
                                                    )}
                                                </div>
                                            </TabsContent>
                                        </Tabs>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>

                        <DialogFooter className="shrink-0">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    if (!staffInspectItem) return
                                    const isLocked = staffInspectFooterIsLocked
                                    openConfirm(
                                        isLocked ? "Unlock evaluation?" : "Lock evaluation?",
                                        isLocked ? "This will remove the lock so it can be edited again." : "This will lock the evaluation to prevent further changes.",
                                        async () => setStaffLock(staffInspectItem, !isLocked)
                                    )
                                }}
                                disabled={!staffInspectItem}
                            >
                                {staffInspectFooterIsLocked ? (
                                    <>
                                        <Unlock className="mr-2 h-4 w-4" />
                                        Unlock
                                    </>
                                ) : (
                                    <>
                                        <Lock className="mr-2 h-4 w-4" />
                                        Lock
                                    </>
                                )}
                            </Button>

                            <Button asChild variant="outline" disabled={!staffInspectItem}>
                                <Link href={staffInspectItem ? `/dashboard/admin/evaluation/${staffInspectItem.id}` : "/dashboard/admin/evaluation"}>
                                    Open detail
                                </Link>
                            </Button>

                            <Button onClick={() => setStaffInspectOpen(false)}>Close</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Inspect Student Answers */}
                <Dialog open={inspectOpen} onOpenChange={setInspectOpen}>
                    <DialogContent className="sm:max-w-xl">
                        <DialogHeader>
                            <DialogTitle>{inspectTitle || "Inspect"}</DialogTitle>
                            <DialogDescription>Answers are shown as stored.</DialogDescription>
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
                                    <div className="mb-2 text-sm font-semibold">Answers</div>
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
