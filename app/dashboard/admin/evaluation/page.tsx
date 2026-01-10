/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { ClipboardList, RefreshCw, Lock, Unlock, Search } from "lucide-react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { useAuth } from "@/hooks/use-auth"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

type PanelEvaluation = {
    id: string
    scheduleId: string
    evaluatorId: string
    status: string
    submittedAt: string | null
    lockedAt: string | null
    createdAt: string
}

type EvaluationScore = {
    evaluationId: string
    criterionId: string
    score: number
    comment: string | null
}

type StudentEvaluation = {
    id: string
    scheduleId: string
    studentId: string
    status: "pending" | "submitted" | "locked"
    answers: any
    submittedAt: string | null
    lockedAt: string | null
    createdAt: string
    updatedAt: string
}

type UserPublic = {
    id: string
    name: string
    email: string
    role?: string
}

type DefenseSchedule = {
    id: string
    groupId: string
    scheduledAt: string
    room: string | null
    status: string
    createdBy: string | null
    createdAt: string
    updatedAt: string
}

type ThesisGroup = {
    id: string
    title: string
}

function fmtDate(v: string | null | undefined) {
    if (!v) return "—"
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return v
    return d.toLocaleString()
}

function buildUrl(path: string, params: Record<string, string | undefined | null>) {
    const sp = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
        const val = String(v ?? "").trim()
        if (val) sp.set(k, val)
    })
    const qs = sp.toString()
    return qs ? `${path}?${qs}` : path
}

async function apiGet<T>(path: string, params: Record<string, string | undefined | null>) {
    const url = buildUrl(path, params)
    const res = await fetch(url, { method: "GET" })
    const json = await res.json().catch(() => ({} as any))

    if (!res.ok || !json?.ok) {
        throw new Error(json?.message || "Request failed")
    }
    return json as T
}

async function apiPatch<T>(path: string, params: Record<string, string | undefined | null>, body: any) {
    const url = buildUrl(path, params)
    const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    })
    const json = await res.json().catch(() => ({} as any))
    if (!res.ok || !json?.ok) {
        throw new Error(json?.message || "Request failed")
    }
    return json as T
}

function uniq(ids: Array<string | null | undefined>) {
    return Array.from(new Set(ids.filter(Boolean).map((x) => String(x))))
}

export default function AdminEvaluationPage() {
    const { loading, user } = useAuth()
    const isAdmin = String(user?.role ?? "").toLowerCase() === "admin"

    const [showIds, setShowIds] = React.useState(false)

    const [tab, setTab] = React.useState<"panel" | "student">("panel")

    // Filters (Panel)
    const [panelScheduleId, setPanelScheduleId] = React.useState("")
    const [panelEvaluatorId, setPanelEvaluatorId] = React.useState("")
    const [panelStatus, setPanelStatus] = React.useState("")
    const [panelLoading, setPanelLoading] = React.useState(false)
    const [panelItems, setPanelItems] = React.useState<PanelEvaluation[]>([])
    const [selectedEvaluationId, setSelectedEvaluationId] = React.useState<string | null>(null)
    const [scoresLoading, setScoresLoading] = React.useState(false)
    const [scores, setScores] = React.useState<EvaluationScore[]>([])

    // Filters (Student)
    const [studentScheduleId, setStudentScheduleId] = React.useState("")
    const [studentId, setStudentId] = React.useState("")
    const [studentStatus, setStudentStatus] = React.useState("")
    const [studentLoading, setStudentLoading] = React.useState(false)
    const [studentItems, setStudentItems] = React.useState<StudentEvaluation[]>([])
    const [selectedStudentEvalId, setSelectedStudentEvalId] = React.useState<string | null>(null)

    // ---- Lookup caches (names instead of ids) ----
    const [userMap, setUserMap] = React.useState<Record<string, UserPublic>>({})
    const [scheduleMap, setScheduleMap] = React.useState<Record<string, DefenseSchedule>>({})
    const [groupMap, setGroupMap] = React.useState<Record<string, ThesisGroup>>({})

    const inFlightUsers = React.useRef(new Set<string>())
    const inFlightSchedules = React.useRef(new Set<string>())
    const inFlightGroups = React.useRef(new Set<string>())

    // Options for dropdowns
    const [scheduleOptions, setScheduleOptions] = React.useState<DefenseSchedule[]>([])
    const [staffOptions, setStaffOptions] = React.useState<UserPublic[]>([])
    const [studentOptions, setStudentOptions] = React.useState<UserPublic[]>([])
    const [optionsLoading, setOptionsLoading] = React.useState(false)

    const ensureUsers = React.useCallback(
        async (ids: string[]) => {
            const missing = ids.filter((id) => id && !userMap[id] && !inFlightUsers.current.has(id))
            if (!missing.length) return

            missing.forEach((id) => inFlightUsers.current.add(id))
            try {
                const results = await Promise.all(
                    missing.map(async (id) => {
                        try {
                            const data = await apiGet<{ ok: true; user: UserPublic }>("/api/profiles", {
                                resource: "users",
                                id,
                            })
                            return data.user
                        } catch {
                            return null
                        }
                    })
                )

                setUserMap((prev) => {
                    const next = { ...prev }
                    for (const u of results) {
                        if (u?.id) next[u.id] = u
                    }
                    return next
                })
            } finally {
                missing.forEach((id) => inFlightUsers.current.delete(id))
            }
        },
        [userMap]
    )

    const ensureGroups = React.useCallback(
        async (ids: string[]) => {
            const missing = ids.filter((id) => id && !groupMap[id] && !inFlightGroups.current.has(id))
            if (!missing.length) return

            missing.forEach((id) => inFlightGroups.current.add(id))
            try {
                const results = await Promise.all(
                    missing.map(async (id) => {
                        try {
                            const data = await apiGet<{ ok: true; group: ThesisGroup }>("/api/thesis", {
                                resource: "groups",
                                id,
                            })
                            return data.group
                        } catch {
                            return null
                        }
                    })
                )

                setGroupMap((prev) => {
                    const next = { ...prev }
                    for (const g of results) {
                        if (g?.id) next[g.id] = g
                    }
                    return next
                })
            } finally {
                missing.forEach((id) => inFlightGroups.current.delete(id))
            }
        },
        [groupMap]
    )

    const ensureSchedules = React.useCallback(
        async (ids: string[]) => {
            const missing = ids.filter((id) => id && !scheduleMap[id] && !inFlightSchedules.current.has(id))
            if (!missing.length) return

            missing.forEach((id) => inFlightSchedules.current.add(id))
            try {
                const results = await Promise.all(
                    missing.map(async (id) => {
                        try {
                            const data = await apiGet<{ ok: true; schedule: DefenseSchedule }>("/api/schedule", {
                                resource: "schedules",
                                id,
                            })
                            return data.schedule
                        } catch {
                            return null
                        }
                    })
                )

                const fetched = results.filter(Boolean) as DefenseSchedule[]
                setScheduleMap((prev) => {
                    const next = { ...prev }
                    for (const s of fetched) {
                        if (s?.id) next[s.id] = s
                    }
                    return next
                })

                const groupIds = uniq(fetched.map((s) => s.groupId))
                if (groupIds.length) {
                    await ensureGroups(groupIds)
                }
            } finally {
                missing.forEach((id) => inFlightSchedules.current.delete(id))
            }
        },
        [scheduleMap, ensureGroups]
    )

    const loadOptions = React.useCallback(async () => {
        if (!isAdmin) return
        setOptionsLoading(true)
        try {
            const [sched, staff, students] = await Promise.all([
                apiGet<{ ok: true; schedules: DefenseSchedule[]; total: number }>("/api/schedule", {
                    resource: "schedules",
                    limit: "200",
                    offset: "0",
                }),
                apiGet<{ ok: true; users: UserPublic[]; total: number }>("/api/profiles", {
                    resource: "users",
                    role: "staff",
                    limit: "200",
                    offset: "0",
                }),
                apiGet<{ ok: true; users: UserPublic[]; total: number }>("/api/profiles", {
                    resource: "users",
                    role: "student",
                    limit: "200",
                    offset: "0",
                }),
            ])

            const schedItems = sched.schedules ?? []
            setScheduleOptions(schedItems)

            // Prime scheduleMap + group titles for labels
            setScheduleMap((prev) => {
                const next = { ...prev }
                for (const s of schedItems) next[s.id] = s
                return next
            })
            await ensureGroups(uniq(schedItems.map((x) => x.groupId)))

            const staffItems = (staff.users ?? []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""))
            const studentItems = (students.users ?? []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""))

            setStaffOptions(staffItems)
            setStudentOptions(studentItems)

            // Prime userMap
            setUserMap((prev) => {
                const next = { ...prev }
                for (const u of [...staffItems, ...studentItems]) {
                    if (u?.id) next[u.id] = u
                }
                return next
            })
        } catch (e: any) {
            toast.error("Failed to load dropdown options", { description: e?.message || "Please try again." })
        } finally {
            setOptionsLoading(false)
        }
    }, [isAdmin, ensureGroups])

    const userLabel = React.useCallback(
        (id: string | null | undefined) => {
            const key = String(id ?? "")
            if (!key) return "—"
            const u = userMap[key]
            return u?.name ? u.name : "Unknown user"
        },
        [userMap]
    )

    const userSubLabel = React.useCallback(
        (id: string | null | undefined) => {
            const key = String(id ?? "")
            if (!key) return null
            const u = userMap[key]
            if (!u) return null
            return u.email ? u.email : null
        },
        [userMap]
    )

    const scheduleLabel = React.useCallback(
        (scheduleId: string) => {
            const s = scheduleMap[scheduleId]
            if (!s) return "Unknown schedule"
            const g = groupMap[s.groupId]
            const groupTitle = g?.title ? g.title : "Unknown group"
            const when = s.scheduledAt ? fmtDate(s.scheduledAt) : "—"
            return `${groupTitle} • ${when}`
        },
        [scheduleMap, groupMap]
    )

    const selectedStudentEval = React.useMemo(() => {
        if (!selectedStudentEvalId) return null
        return studentItems.find((x) => x.id === selectedStudentEvalId) ?? null
    }, [selectedStudentEvalId, studentItems])

    const primePanelLookups = React.useCallback(
        async (items: PanelEvaluation[]) => {
            const evaluatorIds = uniq(items.map((x) => x.evaluatorId))
            const scheduleIds = uniq(items.map((x) => x.scheduleId))
            await Promise.all([ensureUsers(evaluatorIds), ensureSchedules(scheduleIds)])
        },
        [ensureUsers, ensureSchedules]
    )

    const primeStudentLookups = React.useCallback(
        async (items: StudentEvaluation[]) => {
            const studentIds = uniq(items.map((x) => x.studentId))
            const scheduleIds = uniq(items.map((x) => x.scheduleId))
            await Promise.all([ensureUsers(studentIds), ensureSchedules(scheduleIds)])
        },
        [ensureUsers, ensureSchedules]
    )

    const loadPanel = React.useCallback(async () => {
        setPanelLoading(true)
        try {
            const data = await apiGet<{ ok: true; evaluations: PanelEvaluation[] }>(
                "/api/evaluation",
                {
                    resource: "evaluations",
                    scheduleId: panelScheduleId || null,
                    evaluatorId: panelEvaluatorId || null,
                    status: panelStatus || null,
                    limit: "50",
                    offset: "0",
                }
            )
            const items = data.evaluations ?? []
            setPanelItems(items)
            await primePanelLookups(items)
        } catch (e: any) {
            toast.error("Failed to load evaluations", { description: e?.message || "Please try again." })
        } finally {
            setPanelLoading(false)
        }
    }, [panelScheduleId, panelEvaluatorId, panelStatus, primePanelLookups])

    const loadScores = React.useCallback(async (evaluationId: string) => {
        setScoresLoading(true)
        try {
            const data = await apiGet<{ ok: true; scores: EvaluationScore[] }>(
                "/api/evaluation",
                { resource: "evaluationScores", evaluationId }
            )
            setScores(data.scores ?? [])
        } catch (e: any) {
            toast.error("Failed to load scores", { description: e?.message || "Please try again." })
        } finally {
            setScoresLoading(false)
        }
    }, [])

    const loadStudent = React.useCallback(async () => {
        setStudentLoading(true)
        try {
            const data = await apiGet<{ ok: true; items: StudentEvaluation[] }>(
                "/api/evaluation",
                {
                    resource: "studentEvaluations",
                    scheduleId: studentScheduleId || null,
                    studentId: studentId || null,
                    status: studentStatus || null,
                    limit: "50",
                    offset: "0",
                }
            )
            const items = data.items ?? []
            setStudentItems(items)
            await primeStudentLookups(items)
        } catch (e: any) {
            toast.error("Failed to load student evaluations", { description: e?.message || "Please try again." })
        } finally {
            setStudentLoading(false)
        }
    }, [studentScheduleId, studentId, studentStatus, primeStudentLookups])

    React.useEffect(() => {
        if (!isAdmin) return
        void loadOptions()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin])

    React.useEffect(() => {
        if (!isAdmin) return
        if (tab === "panel") void loadPanel()
        if (tab === "student") void loadStudent()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, isAdmin])

    const onSelectPanelEval = async (id: string) => {
        setSelectedEvaluationId((prev) => (prev === id ? null : id))
        if (selectedEvaluationId === id) return
        await loadScores(id)
    }

    const patchPanelStatus = async (evaluationId: string, nextStatus: string) => {
        try {
            const now = new Date().toISOString()

            const submittedAt = nextStatus === "submitted" || nextStatus === "locked" ? now : null
            const lockedAt = nextStatus === "locked" ? now : null

            await apiPatch(
                "/api/evaluation",
                { resource: "evaluations", id: evaluationId },
                { id: evaluationId, status: nextStatus, submittedAt, lockedAt }
            )

            toast.success("Evaluation updated")
            await loadPanel()

            if (selectedEvaluationId === evaluationId) {
                await loadScores(evaluationId)
            }
        } catch (e: any) {
            toast.error("Failed to update evaluation", { description: e?.message || "Please try again." })
        }
    }

    const patchStudentStatus = async (id: string, nextStatus: "pending" | "submitted" | "locked") => {
        try {
            const now = new Date().toISOString()

            const submittedAt = nextStatus === "submitted" || nextStatus === "locked" ? now : null
            const lockedAt = nextStatus === "locked" ? now : null

            await apiPatch(
                "/api/evaluation",
                { resource: "studentEvaluations", id },
                { id, status: nextStatus, submittedAt, lockedAt }
            )

            toast.success("Student evaluation updated")
            await loadStudent()
        } catch (e: any) {
            toast.error("Failed to update student evaluation", { description: e?.message || "Please try again." })
        }
    }

    return (
        <DashboardLayout
            title="Evaluations"
            description="View panel evaluations and student evaluations. Filter by schedule/student/evaluator and manage lock state."
            mainClassName="space-y-6"
        >
            {loading ? (
                <div className="space-y-4">
                    <div className="h-8 w-56 rounded-md bg-muted/40" />
                    <div className="h-40 rounded-md bg-muted/30" />
                </div>
            ) : !isAdmin ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ClipboardList className="h-5 w-5" />
                            Evaluations
                            <Badge variant="outline">Admin</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Forbidden. This page is available to Admin only.
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => setShowIds((v) => !v)} disabled={optionsLoading}>
                            {showIds ? "Hide IDs" : "Show IDs"}
                        </Button>
                    </div>

                    <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="panel">Panel Evaluations</TabsTrigger>
                            <TabsTrigger value="student">Student Evaluations</TabsTrigger>
                        </TabsList>

                        {/* ---------------- Panel Evaluations ---------------- */}
                        <TabsContent value="panel" className="mt-6 space-y-4">
                            <Card>
                                <CardHeader className="space-y-2">
                                    <CardTitle className="flex items-center justify-between">
                                        <span className="flex items-center gap-2">
                                            <Search className="h-4 w-4" />
                                            Filters
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={loadPanel}
                                            disabled={panelLoading}
                                            className="gap-2"
                                        >
                                            <RefreshCw className="h-4 w-4" />
                                            Refresh
                                        </Button>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                        <div className="space-y-1">
                                            <div className="text-xs font-medium text-muted-foreground">Schedule</div>
                                            <Select value={panelScheduleId} onValueChange={setPanelScheduleId}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={optionsLoading ? "Loading…" : "All schedules"} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="">All schedules</SelectItem>
                                                    {scheduleOptions.map((s) => (
                                                        <SelectItem key={s.id} value={s.id}>
                                                            {scheduleLabel(s.id)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="text-xs font-medium text-muted-foreground">Evaluator</div>
                                            <Select value={panelEvaluatorId} onValueChange={setPanelEvaluatorId}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={optionsLoading ? "Loading…" : "All evaluators"} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="">All evaluators</SelectItem>
                                                    {staffOptions.map((u) => (
                                                        <SelectItem key={u.id} value={u.id}>
                                                            {u.name}{u.email ? ` (${u.email})` : ""}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="text-xs font-medium text-muted-foreground">Status</div>
                                            <Select value={panelStatus} onValueChange={setPanelStatus}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Any status" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="">Any</SelectItem>
                                                    <SelectItem value="pending">Pending</SelectItem>
                                                    <SelectItem value="submitted">Submitted</SelectItem>
                                                    <SelectItem value="locked">Locked</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="mt-3">
                                        <Button onClick={loadPanel} disabled={panelLoading} className="gap-2">
                                            <Search className="h-4 w-4" />
                                            Apply
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                        <span>Results</span>
                                        <Badge variant="outline">{panelItems.length} items</Badge>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {panelLoading ? (
                                        <div className="text-sm text-muted-foreground">Loading…</div>
                                    ) : panelItems.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">No evaluations found.</div>
                                    ) : (
                                        <div className="space-y-2">
                                            {panelItems.map((e) => {
                                                const isOpen = selectedEvaluationId === e.id
                                                const evalName = userLabel(e.evaluatorId)
                                                const evalEmail = userSubLabel(e.evaluatorId)

                                                return (
                                                    <div key={e.id} className="rounded-md border">
                                                        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                                                            <div className="min-w-0">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <div className="truncate text-sm font-semibold">
                                                                        {scheduleLabel(e.scheduleId)}
                                                                    </div>
                                                                    <Badge variant="secondary">{e.status}</Badge>
                                                                    {e.lockedAt ? <Badge variant="outline">Locked</Badge> : null}
                                                                </div>

                                                                <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                                                                    <div className="truncate">
                                                                        Evaluator: {evalName}{evalEmail ? ` (${evalEmail})` : ""}
                                                                    </div>
                                                                    <div>Submitted: {fmtDate(e.submittedAt)}</div>
                                                                    <div>Locked: {fmtDate(e.lockedAt)}</div>
                                                                    {showIds ? (
                                                                        <div className="truncate">Evaluation ID: {e.id}</div>
                                                                    ) : null}
                                                                </div>
                                                            </div>

                                                            <div className="flex flex-wrap gap-2">
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => void onSelectPanelEval(e.id)}
                                                                >
                                                                    {isOpen ? "Hide details" : "View details"}
                                                                </Button>

                                                                <Button
                                                                    variant="secondary"
                                                                    size="sm"
                                                                    onClick={() => void patchPanelStatus(e.id, "submitted")}
                                                                    disabled={panelLoading}
                                                                >
                                                                    Mark submitted
                                                                </Button>

                                                                {!e.lockedAt ? (
                                                                    <Button
                                                                        size="sm"
                                                                        className="gap-2"
                                                                        onClick={() => void patchPanelStatus(e.id, "locked")}
                                                                        disabled={panelLoading}
                                                                    >
                                                                        <Lock className="h-4 w-4" />
                                                                        Lock
                                                                    </Button>
                                                                ) : (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        className="gap-2"
                                                                        onClick={() => void patchPanelStatus(e.id, "submitted")}
                                                                        disabled={panelLoading}
                                                                    >
                                                                        <Unlock className="h-4 w-4" />
                                                                        Unlock
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {isOpen ? (
                                                            <div className="border-t p-3">
                                                                <div className="mb-2 flex items-center justify-between">
                                                                    <div className="text-sm font-semibold">Scores</div>
                                                                    {scoresLoading ? (
                                                                        <Badge variant="outline">Loading…</Badge>
                                                                    ) : (
                                                                        <Badge variant="outline">{scores.length} rows</Badge>
                                                                    )}
                                                                </div>

                                                                {scoresLoading ? (
                                                                    <div className="text-sm text-muted-foreground">Loading scores…</div>
                                                                ) : scores.length === 0 ? (
                                                                    <div className="text-sm text-muted-foreground">
                                                                        No scores found for this evaluation.
                                                                    </div>
                                                                ) : (
                                                                    <ScrollArea className="h-48 rounded-md border">
                                                                        <div className="space-y-2 p-3">
                                                                            {scores.map((s, idx) => (
                                                                                <div key={`${s.criterionId}-${idx}`} className="rounded-md border p-3">
                                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                                        <div className="text-xs font-medium text-muted-foreground">
                                                                                            Criterion {idx + 1}
                                                                                        </div>
                                                                                        <Badge variant="secondary">Score: {s.score}</Badge>
                                                                                        {showIds ? (
                                                                                            <div className="text-xs text-muted-foreground truncate">
                                                                                                ID: {s.criterionId}
                                                                                            </div>
                                                                                        ) : null}
                                                                                    </div>
                                                                                    {s.comment ? (
                                                                                        <div className="mt-2 text-xs text-muted-foreground">
                                                                                            Comment: {s.comment}
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="mt-2 text-xs text-muted-foreground">No comment.</div>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </ScrollArea>
                                                                )}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* ---------------- Student Evaluations ---------------- */}
                        <TabsContent value="student" className="mt-6 space-y-4">
                            <Card>
                                <CardHeader className="space-y-2">
                                    <CardTitle className="flex items-center justify-between">
                                        <span className="flex items-center gap-2">
                                            <Search className="h-4 w-4" />
                                            Filters
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={loadStudent}
                                            disabled={studentLoading}
                                            className="gap-2"
                                        >
                                            <RefreshCw className="h-4 w-4" />
                                            Refresh
                                        </Button>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                        <div className="space-y-1">
                                            <div className="text-xs font-medium text-muted-foreground">Schedule</div>
                                            <Select value={studentScheduleId} onValueChange={setStudentScheduleId}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={optionsLoading ? "Loading…" : "All schedules"} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="">All schedules</SelectItem>
                                                    {scheduleOptions.map((s) => (
                                                        <SelectItem key={s.id} value={s.id}>
                                                            {scheduleLabel(s.id)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="text-xs font-medium text-muted-foreground">Student</div>
                                            <Select value={studentId} onValueChange={setStudentId}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={optionsLoading ? "Loading…" : "All students"} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="">All students</SelectItem>
                                                    {studentOptions.map((u) => (
                                                        <SelectItem key={u.id} value={u.id}>
                                                            {u.name}{u.email ? ` (${u.email})` : ""}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="text-xs font-medium text-muted-foreground">Status</div>
                                            <Select value={studentStatus} onValueChange={setStudentStatus}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Any status" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="">Any</SelectItem>
                                                    <SelectItem value="pending">Pending</SelectItem>
                                                    <SelectItem value="submitted">Submitted</SelectItem>
                                                    <SelectItem value="locked">Locked</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="mt-3">
                                        <Button onClick={loadStudent} disabled={studentLoading} className="gap-2">
                                            <Search className="h-4 w-4" />
                                            Apply
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                                <Card className="lg:col-span-6">
                                    <CardHeader>
                                        <CardTitle className="flex items-center justify-between">
                                            <span>Results</span>
                                            <Badge variant="outline">{studentItems.length} items</Badge>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                        {studentLoading ? (
                                            <div className="text-sm text-muted-foreground">Loading…</div>
                                        ) : studentItems.length === 0 ? (
                                            <div className="text-sm text-muted-foreground">No student evaluations found.</div>
                                        ) : (
                                            <div className="space-y-2">
                                                {studentItems.map((e) => {
                                                    const active = selectedStudentEvalId === e.id
                                                    const sName = userLabel(e.studentId)
                                                    const sEmail = userSubLabel(e.studentId)

                                                    return (
                                                        <button
                                                            key={e.id}
                                                            type="button"
                                                            onClick={() => setSelectedStudentEvalId(e.id)}
                                                            className={[
                                                                "w-full rounded-md border p-3 text-left transition",
                                                                active ? "bg-muted/40" : "hover:bg-muted/20",
                                                            ].join(" ")}
                                                        >
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <div className="truncate text-sm font-semibold">
                                                                    {sName}{sEmail ? ` (${sEmail})` : ""}
                                                                </div>
                                                                <Badge variant="secondary">{e.status}</Badge>
                                                                {e.lockedAt ? <Badge variant="outline">Locked</Badge> : null}
                                                            </div>
                                                            <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                                                                <div className="truncate">Schedule: {scheduleLabel(e.scheduleId)}</div>
                                                                <div>Submitted: {fmtDate(e.submittedAt)}</div>
                                                                <div>Locked: {fmtDate(e.lockedAt)}</div>
                                                                {showIds ? <div className="truncate">Evaluation ID: {e.id}</div> : null}
                                                            </div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card className="lg:col-span-6">
                                    <CardHeader>
                                        <CardTitle className="flex items-center justify-between">
                                            <span>Details</span>
                                            {selectedStudentEval ? (
                                                <Badge variant="outline">{selectedStudentEval.status}</Badge>
                                            ) : (
                                                <Badge variant="outline">None selected</Badge>
                                            )}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {!selectedStudentEval ? (
                                            <div className="text-sm text-muted-foreground">
                                                Select a student evaluation to view answers and manage status.
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex flex-wrap gap-2">
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => void patchStudentStatus(selectedStudentEval.id, "submitted")}
                                                        disabled={studentLoading}
                                                    >
                                                        Mark submitted
                                                    </Button>

                                                    {!selectedStudentEval.lockedAt ? (
                                                        <Button
                                                            size="sm"
                                                            className="gap-2"
                                                            onClick={() => void patchStudentStatus(selectedStudentEval.id, "locked")}
                                                            disabled={studentLoading}
                                                        >
                                                            <Lock className="h-4 w-4" />
                                                            Lock
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="gap-2"
                                                            onClick={() => void patchStudentStatus(selectedStudentEval.id, "submitted")}
                                                            disabled={studentLoading}
                                                        >
                                                            <Unlock className="h-4 w-4" />
                                                            Unlock
                                                        </Button>
                                                    )}
                                                </div>

                                                <Separator />

                                                <div className="space-y-1 text-xs text-muted-foreground">
                                                    <div>
                                                        <span className="font-medium">Schedule:</span> {scheduleLabel(selectedStudentEval.scheduleId)}
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Student:</span> {userLabel(selectedStudentEval.studentId)}
                                                    </div>
                                                    <div><span className="font-medium">Created:</span> {fmtDate(selectedStudentEval.createdAt)}</div>
                                                    <div><span className="font-medium">Updated:</span> {fmtDate(selectedStudentEval.updatedAt)}</div>
                                                    {showIds ? (
                                                        <>
                                                            <div className="truncate"><span className="font-medium">Eval ID:</span> {selectedStudentEval.id}</div>
                                                            <div className="truncate"><span className="font-medium">Schedule ID:</span> {selectedStudentEval.scheduleId}</div>
                                                            <div className="truncate"><span className="font-medium">Student ID:</span> {selectedStudentEval.studentId}</div>
                                                        </>
                                                    ) : null}
                                                </div>

                                                <Separator />

                                                <div>
                                                    <div className="mb-2 text-sm font-semibold">Answers (JSON)</div>
                                                    <ScrollArea className="h-64 rounded-md border">
                                                        <pre className="p-3 text-xs">
                                                            {JSON.stringify(selectedStudentEval.answers ?? {}, null, 2)}
                                                        </pre>
                                                    </ScrollArea>
                                                </div>
                                            </>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>
                    </Tabs>
                </>
            )}
        </DashboardLayout>
    )
}
