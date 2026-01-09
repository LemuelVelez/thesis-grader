/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Download, FileDown, Loader2, RefreshCw, Search } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/hooks/use-auth"
import { useApi } from "@/hooks/useApi"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type DbThesisGroup = {
    id: string
    title: string
    adviserId: string | null
    program: string | null
    term: string | null
    createdAt: string
    updatedAt: string
}

type DbDefenseSchedule = {
    id: string
    groupId: string
    scheduledAt: string
    room: string | null
    status: string
    createdBy: string | null
    createdAt: string
    updatedAt: string
}

type DbSchedulePanelist = {
    scheduleId: string
    staffId: string
}

type DbUserPublic = {
    id: string
    name: string
    email: string
    role: "student" | "staff" | "admin"
    status: "active" | "disabled"
    avatarKey: string | null
    createdAt: string
    updatedAt: string
}

type DbEvaluation = {
    id: string
    scheduleId: string
    evaluatorId: string
    status: string
    submittedAt: string | null
    lockedAt: string | null
    createdAt: string
}

type DbEvaluationScore = {
    evaluationId: string
    criterionId: string
    score: number
    comment: string | null
}

type DbRubricTemplate = {
    id: string
    name: string
    version: number
    active: boolean
    description: string | null
    createdAt: string
    updatedAt: string
}

type DbRubricCriterion = {
    id: string
    templateId: string
    criterion: string
    description: string | null
    weight: string // stored as text in your model
    minScore: number
    maxScore: number
    createdAt: string
}

type EvalRow = {
    groupId: string
    groupTitle: string
    program: string
    term: string
    scheduleId: string
    scheduledAt: string
    room: string
    scheduleStatus: string
    panelistNames: string
    evaluationId: string
    evaluatorId: string
    evaluatorName: string
    evaluatorRole: string
    evaluationStatus: string
    scoreCount: number
    rawAvg: number | null
    weightedAvg: number | null
}

function fmtDT(iso: string | null | undefined) {
    if (!iso) return ""
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(d)
}

function toLower(x: unknown) {
    return String(x ?? "").toLowerCase()
}

function safeNum(x: unknown, fallback = 0) {
    const n = Number(x)
    return Number.isFinite(n) ? n : fallback
}

function csvEscape(v: unknown) {
    const s = String(v ?? "")
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
        return `"${s.replaceAll('"', '""')}"`
    }
    return s
}

function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}

async function fetchOkJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { credentials: "include" })
    let data: any = null
    try {
        data = await res.json()
    } catch {
        // ignore
    }

    if (!res.ok) {
        const msg = data?.message || `Request failed (${res.status})`
        throw Object.assign(new Error(msg), { status: res.status })
    }

    if (data && data.ok === false) {
        throw Object.assign(new Error(data?.message || "Request failed"), { status: res.status })
    }

    return data as T
}

function MetricCard(props: { title: string; value: string; hint?: string }) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardDescription>{props.title}</CardDescription>
                <CardTitle className="text-2xl">{props.value}</CardTitle>
            </CardHeader>
            {props.hint ? (
                <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">{props.hint}</p>
                </CardContent>
            ) : null}
        </Card>
    )
}

export default function ReportsClient() {
    const router = useRouter()
    const { user, loading: authLoading } = useAuth()
    const { toastApiError } = useApi()

    const [loading, setLoading] = React.useState(false)

    const [groups, setGroups] = React.useState<DbThesisGroup[]>([])
    const [schedules, setSchedules] = React.useState<DbDefenseSchedule[]>([])
    const [panelistsBySchedule, setPanelistsBySchedule] = React.useState<Record<string, DbSchedulePanelist[]>>({})
    const [users, setUsers] = React.useState<DbUserPublic[]>([])
    const [evaluations, setEvaluations] = React.useState<DbEvaluation[]>([])
    const [scoresByEvaluation, setScoresByEvaluation] = React.useState<Record<string, DbEvaluationScore[]>>({})
    const [templates, setTemplates] = React.useState<DbRubricTemplate[]>([])
    const [criteriaById, setCriteriaById] = React.useState<
        Record<string, { id: string; templateId: string; weight: number; label: string }>
    >({})

    // Filters
    const [q, setQ] = React.useState("")
    const [program, setProgram] = React.useState<string>("all")
    const [term, setTerm] = React.useState<string>("all")
    const [fromDate, setFromDate] = React.useState<string>("")
    const [toDate, setToDate] = React.useState<string>("")
    const [templateId, setTemplateId] = React.useState<string>("all")

    const userById = React.useMemo(() => {
        const m: Record<string, DbUserPublic> = {}
        for (const u of users) m[u.id] = u
        return m
    }, [users])

    const groupById = React.useMemo(() => {
        const m: Record<string, DbThesisGroup> = {}
        for (const g of groups) m[g.id] = g
        return m
    }, [groups])

    const scheduleById = React.useMemo(() => {
        const m: Record<string, DbDefenseSchedule> = {}
        for (const s of schedules) m[s.id] = s
        return m
    }, [schedules])

    const programs = React.useMemo(() => {
        const set = new Set<string>()
        for (const g of groups) {
            const p = String(g.program ?? "").trim()
            if (p) set.add(p)
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b))
    }, [groups])

    const terms = React.useMemo(() => {
        const set = new Set<string>()
        for (const g of groups) {
            const t = String(g.term ?? "").trim()
            if (t) set.add(t)
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b))
    }, [groups])

    const activeTemplateId = React.useMemo(() => {
        if (templateId !== "all") return templateId
        const active = templates.find((t) => t.active)
        return active?.id ?? "all"
    }, [templateId, templates])

    const loadAll = React.useCallback(async () => {
        setLoading(true)
        try {
            // Basic lists
            const [gRes, sRes, uRes, eRes, tRes] = await Promise.all([
                fetchOkJson<{ ok: true; total: number; groups: DbThesisGroup[] }>(
                    `/api/thesis?resource=groups&q=&limit=200&offset=0`
                ),
                fetchOkJson<{ ok: true; total: number; schedules: DbDefenseSchedule[] }>(
                    `/api/schedule?resource=schedules&q=&limit=200&offset=0`
                ),
                fetchOkJson<{ ok: true; total: number; users: DbUserPublic[] }>(
                    `/api/profiles?resource=users&q=&limit=200&offset=0`
                ),
                fetchOkJson<{ ok: true; evaluations: DbEvaluation[] }>(
                    `/api/evaluation?resource=evaluations&limit=200&offset=0`
                ),
                fetchOkJson<{ ok: true; total: number; templates: DbRubricTemplate[] }>(
                    `/api/evaluation?resource=rubricTemplates&q=&limit=200&offset=0`
                ),
            ])

            setGroups(gRes.groups ?? [])
            setSchedules(sRes.schedules ?? [])
            setUsers(uRes.users ?? [])
            setEvaluations(eRes.evaluations ?? [])
            setTemplates(tRes.templates ?? [])

            // Panelists per schedule
            const scheduleIds = (sRes.schedules ?? []).map((x) => x.id)
            const panelPairs = await Promise.allSettled(
                scheduleIds.map(async (sid) => {
                    const r = await fetchOkJson<{ ok: true; panelists: DbSchedulePanelist[] }>(
                        `/api/schedule?resource=panelists&scheduleId=${encodeURIComponent(sid)}`
                    )
                    return [sid, r.panelists ?? []] as const
                })
            )
            const panels: Record<string, DbSchedulePanelist[]> = {}
            for (const p of panelPairs) {
                if (p.status === "fulfilled") {
                    const [sid, arr] = p.value
                    panels[sid] = arr
                }
            }
            setPanelistsBySchedule(panels)

            // Scores per evaluation
            const evalIds = (eRes.evaluations ?? []).map((x) => x.id)
            const scorePairs = await Promise.allSettled(
                evalIds.map(async (eid) => {
                    const r = await fetchOkJson<{ ok: true; scores: DbEvaluationScore[] }>(
                        `/api/evaluation?resource=evaluationScores&evaluationId=${encodeURIComponent(eid)}`
                    )
                    return [eid, r.scores ?? []] as const
                })
            )
            const scoresMap: Record<string, DbEvaluationScore[]> = {}
            for (const sp of scorePairs) {
                if (sp.status === "fulfilled") {
                    const [eid, arr] = sp.value
                    scoresMap[eid] = arr
                }
            }
            setScoresByEvaluation(scoresMap)

            // Criteria (fetch for all templates so we can map criterionId -> weight)
            const templateIds = (tRes.templates ?? []).map((x) => x.id)
            const critPairs = await Promise.allSettled(
                templateIds.map(async (tid) => {
                    const r = await fetchOkJson<{ ok: true; criteria: DbRubricCriterion[] }>(
                        `/api/evaluation?resource=rubricCriteria&templateId=${encodeURIComponent(tid)}`
                    )
                    return [tid, r.criteria ?? []] as const
                })
            )

            const critById: Record<string, { id: string; templateId: string; weight: number; label: string }> = {}
            for (const cp of critPairs) {
                if (cp.status !== "fulfilled") continue
                const [tid, items] = cp.value
                for (const c of items) {
                    critById[c.id] = {
                        id: c.id,
                        templateId: tid,
                        weight: safeNum(c.weight, 1),
                        label: c.criterion,
                    }
                }
            }
            setCriteriaById(critById)
        } catch (err: any) {
            toastApiError(err, { title: "Failed to load reports" })
        } finally {
            setLoading(false)
        }
    }, [toastApiError])

    React.useEffect(() => {
        if (authLoading) return
        const role = toLower((user as any)?.role)
        if (!user) {
            router.push("/login")
            return
        }
        if (role !== "admin") {
            toast.error("Forbidden", { description: "Admin access only." })
            router.push("/dashboard")
            return
        }

        void loadAll()
    }, [authLoading, loadAll, router, user])

    const evalRows = React.useMemo((): EvalRow[] => {
        const textQ = toLower(q).trim()

        const fromT = fromDate ? new Date(fromDate).getTime() : null
        const toT = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null

        const rows: EvalRow[] = []

        for (const e of evaluations) {
            const s = scheduleById[e.scheduleId]
            if (!s) continue

            const g = groupById[s.groupId]
            if (!g) continue

            const p = String(g.program ?? "").trim() || "—"
            const t = String(g.term ?? "").trim() || "—"

            if (program !== "all" && p !== program) continue
            if (term !== "all" && t !== term) continue

            const schedTime = new Date(s.scheduledAt).getTime()
            if (fromT !== null && schedTime < fromT) continue
            if (toT !== null && schedTime > toT) continue

            const evaluator = userById[e.evaluatorId]
            const evaluatorName = evaluator?.name ?? "Unknown"
            const evaluatorRole = evaluator?.role ?? "unknown"

            const panel = panelistsBySchedule[s.id] ?? []
            const panelNames = panel
                .map((x) => userById[x.staffId]?.name)
                .filter(Boolean)
                .join(", ")

            const scores = scoresByEvaluation[e.id] ?? []
            const rawAvg =
                scores.length > 0
                    ? scores.reduce((sum, x) => sum + safeNum(x.score, 0), 0) / scores.length
                    : null

            // Weighted average:
            // - If a template is selected, only include criteria from that template.
            // - If not selected, use whatever criterion weights exist.
            let wSum = 0
            let wDen = 0
            if (scores.length) {
                for (const sc of scores) {
                    const c = criteriaById[sc.criterionId]
                    if (!c) continue
                    if (activeTemplateId !== "all" && c.templateId !== activeTemplateId) continue
                    const w = safeNum(c.weight, 1)
                    wSum += safeNum(sc.score, 0) * w
                    wDen += w
                }
            }
            const weightedAvg = wDen > 0 ? wSum / wDen : null

            const room = String(s.room ?? "").trim() || "—"
            const groupTitle = String(g.title ?? "").trim() || "Untitled"

            const haystack = toLower(
                [
                    groupTitle,
                    p,
                    t,
                    room,
                    s.status,
                    evaluatorName,
                    evaluatorRole,
                    panelNames,
                    e.status,
                ].join(" ")
            )
            if (textQ && !haystack.includes(textQ)) continue

            rows.push({
                groupId: g.id,
                groupTitle,
                program: p,
                term: t,
                scheduleId: s.id,
                scheduledAt: s.scheduledAt,
                room,
                scheduleStatus: s.status,
                panelistNames: panelNames || "—",
                evaluationId: e.id,
                evaluatorId: e.evaluatorId,
                evaluatorName,
                evaluatorRole,
                evaluationStatus: e.status,
                scoreCount: scores.length,
                rawAvg: rawAvg !== null ? Number(rawAvg.toFixed(2)) : null,
                weightedAvg: weightedAvg !== null ? Number(weightedAvg.toFixed(2)) : null,
            })
        }

        rows.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
        return rows
    }, [
        activeTemplateId,
        criteriaById,
        evaluations,
        fromDate,
        groupById,
        panelistsBySchedule,
        program,
        q,
        scheduleById,
        scoresByEvaluation,
        term,
        toDate,
        userById,
    ])

    const overview = React.useMemo(() => {
        const totalGroups = groups.length
        const totalSchedules = schedules.length
        const totalEvaluations = evaluations.length

        const finalized = evaluations.filter((e) => toLower(e.status) === "finalized" || toLower(e.status) === "locked").length
        const submitted = evaluations.filter((e) => toLower(e.status) === "submitted").length
        const pending = evaluations.filter((e) => toLower(e.status) === "pending").length

        const scored = evalRows.filter((r) => r.weightedAvg !== null || r.rawAvg !== null)
        const avgWeighted =
            scored.length > 0
                ? scored.reduce((sum, r) => sum + (r.weightedAvg ?? r.rawAvg ?? 0), 0) / scored.length
                : null

        return {
            totalGroups,
            totalSchedules,
            totalEvaluations,
            finalized,
            submitted,
            pending,
            avgWeighted: avgWeighted !== null ? Number(avgWeighted.toFixed(2)) : null,
        }
    }, [evalRows, evaluations, groups.length, schedules.length])

    const byProgram = React.useMemo(() => {
        const map = new Map<string, { program: string; term: string; evalCount: number; avg: number | null }>()
        const bucket: Record<string, { sum: number; n: number; evalCount: number; program: string; term: string }> = {}

        for (const r of evalRows) {
            const key = `${r.program}|||${r.term}`
            if (!bucket[key]) bucket[key] = { sum: 0, n: 0, evalCount: 0, program: r.program, term: r.term }
            bucket[key].evalCount += 1
            const v = r.weightedAvg ?? r.rawAvg
            if (v !== null) {
                bucket[key].sum += v
                bucket[key].n += 1
            }
        }

        for (const key of Object.keys(bucket)) {
            const b = bucket[key]
            map.set(key, {
                program: b.program,
                term: b.term,
                evalCount: b.evalCount,
                avg: b.n > 0 ? Number((b.sum / b.n).toFixed(2)) : null,
            })
        }

        return Array.from(map.values()).sort((a, b) => {
            const p = a.program.localeCompare(b.program)
            if (p !== 0) return p
            return a.term.localeCompare(b.term)
        })
    }, [evalRows])

    const byPanelist = React.useMemo(() => {
        const bucket: Record<string, { evaluatorId: string; name: string; role: string; evalCount: number; sum: number; n: number }> = {}

        for (const r of evalRows) {
            const id = r.evaluatorId
            if (!bucket[id]) {
                bucket[id] = {
                    evaluatorId: id,
                    name: r.evaluatorName,
                    role: r.evaluatorRole,
                    evalCount: 0,
                    sum: 0,
                    n: 0,
                }
            }
            bucket[id].evalCount += 1
            const v = r.weightedAvg ?? r.rawAvg
            if (v !== null) {
                bucket[id].sum += v
                bucket[id].n += 1
            }
        }

        const arr = Object.values(bucket).map((b) => ({
            ...b,
            avg: b.n > 0 ? Number((b.sum / b.n).toFixed(2)) : null,
        }))

        arr.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
        return arr
    }, [evalRows])

    const exportEvalRowsCsv = React.useCallback(() => {
        const header = [
            "Program",
            "Term",
            "Group Title",
            "Schedule Date",
            "Room",
            "Schedule Status",
            "Panelists",
            "Evaluator",
            "Evaluator Role",
            "Evaluation Status",
            "Score Count",
            "Raw Avg",
            "Weighted Avg",
        ]

        const lines = [header.join(",")]

        for (const r of evalRows) {
            lines.push(
                [
                    csvEscape(r.program),
                    csvEscape(r.term),
                    csvEscape(r.groupTitle),
                    csvEscape(fmtDT(r.scheduledAt)),
                    csvEscape(r.room),
                    csvEscape(r.scheduleStatus),
                    csvEscape(r.panelistNames),
                    csvEscape(r.evaluatorName),
                    csvEscape(r.evaluatorRole),
                    csvEscape(r.evaluationStatus),
                    csvEscape(r.scoreCount),
                    csvEscape(r.rawAvg ?? ""),
                    csvEscape(r.weightedAvg ?? ""),
                ].join(",")
            )
        }

        downloadTextFile(`thesisgrader-reports-evaluations.csv`, lines.join("\n"), "text/csv;charset=utf-8")
        toast.success("Export ready", { description: "Downloaded CSV for evaluation rows." })
    }, [evalRows])

    const exportProgramSummaryCsv = React.useCallback(() => {
        const header = ["Program", "Term", "Evaluation Count", "Average Score"]
        const lines = [header.join(",")]

        for (const r of byProgram) {
            lines.push([csvEscape(r.program), csvEscape(r.term), csvEscape(r.evalCount), csvEscape(r.avg ?? "")].join(","))
        }

        downloadTextFile(`thesisgrader-reports-program-summary.csv`, lines.join("\n"), "text/csv;charset=utf-8")
        toast.success("Export ready", { description: "Downloaded CSV for program summary." })
    }, [byProgram])

    const exportPanelistSummaryCsv = React.useCallback(() => {
        const header = ["Evaluator", "Role", "Evaluation Count", "Average Score"]
        const lines = [header.join(",")]

        for (const r of byPanelist) {
            lines.push([csvEscape(r.name), csvEscape(r.role), csvEscape(r.evalCount), csvEscape(r.avg ?? "")].join(","))
        }

        downloadTextFile(`thesisgrader-reports-panelist-summary.csv`, lines.join("\n"), "text/csv;charset=utf-8")
        toast.success("Export ready", { description: "Downloaded CSV for panelist summary." })
    }, [byPanelist])

    if (authLoading) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking session…
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-xl font-semibold">Reports</h1>
                    <p className="text-sm text-muted-foreground">
                        Filter and export summaries by program, semester/term, and evaluator.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        onClick={() => void loadAll()}
                        disabled={loading}
                        className="gap-2"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Refresh
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button className="gap-2" disabled={loading}>
                                <FileDown className="h-4 w-4" />
                                Export
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={exportEvalRowsCsv} className="gap-2">
                                <Download className="h-4 w-4" />
                                Evaluation rows (CSV)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={exportProgramSummaryCsv} className="gap-2">
                                <Download className="h-4 w-4" />
                                Program summary (CSV)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={exportPanelistSummaryCsv} className="gap-2">
                                <Download className="h-4 w-4" />
                                Panelist summary (CSV)
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
                <MetricCard title="Groups" value={String(overview.totalGroups)} />
                <MetricCard title="Schedules" value={String(overview.totalSchedules)} />
                <MetricCard title="Evaluations" value={String(overview.totalEvaluations)} />
                <MetricCard
                    title="Average Score"
                    value={overview.avgWeighted === null ? "—" : String(overview.avgWeighted)}
                    hint={activeTemplateId === "all" ? "Uses any known criterion weights" : "Filtered to selected template"}
                />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Filters</CardTitle>
                    <CardDescription>
                        Search across group, evaluator, room, program, term, and statuses.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-4">
                        <div className="space-y-2">
                            <Label htmlFor="q">Search</Label>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="q"
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Group title, panelist, evaluator…"
                                    className="pl-9"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Program</Label>
                            <Select value={program} onValueChange={setProgram}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All programs" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All</SelectItem>
                                    {programs.map((p) => (
                                        <SelectItem key={p} value={p}>
                                            {p}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Term</Label>
                            <Select value={term} onValueChange={setTerm}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All terms" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All</SelectItem>
                                    {terms.map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {t}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Rubric Template</Label>
                            <Select value={templateId} onValueChange={setTemplateId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All templates" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All (auto)</SelectItem>
                                    {templates.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name} v{t.version}{t.active ? " (active)" : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Separator />

                    <div className="grid gap-3 md:grid-cols-4">
                        <div className="space-y-2">
                            <Label htmlFor="from">From</Label>
                            <Input id="from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="to">To</Label>
                            <Input id="to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                        </div>

                        <div className="flex items-end gap-2 md:col-span-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setQ("")
                                    setProgram("all")
                                    setTerm("all")
                                    setFromDate("")
                                    setToDate("")
                                    setTemplateId("all")
                                }}
                                disabled={loading}
                            >
                                Clear
                            </Button>
                            <div className="text-sm text-muted-foreground">
                                Showing <span className="font-medium text-foreground">{evalRows.length}</span> row(s)
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="evaluations" className="space-y-3">
                <TabsList>
                    <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
                    <TabsTrigger value="programs">By Program</TabsTrigger>
                    <TabsTrigger value="panelists">By Panelist</TabsTrigger>
                </TabsList>

                <TabsContent value="evaluations" className="space-y-3">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Evaluation rows</CardTitle>
                            <CardDescription>
                                One row per evaluation (schedule + evaluator). Scores are computed from stored criterion scores.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading…
                                </div>
                            ) : evalRows.length === 0 ? (
                                <div className="text-sm text-muted-foreground">No matching rows.</div>
                            ) : (
                                <div className="overflow-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Group</TableHead>
                                                <TableHead>Program</TableHead>
                                                <TableHead>Term</TableHead>
                                                <TableHead>Schedule</TableHead>
                                                <TableHead>Room</TableHead>
                                                <TableHead>Panelists</TableHead>
                                                <TableHead>Evaluator</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Score</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {evalRows.map((r) => {
                                                const score = r.weightedAvg ?? r.rawAvg
                                                const status = toLower(r.evaluationStatus)
                                                const badgeVariant =
                                                    status === "finalized" || status === "locked"
                                                        ? "default"
                                                        : status === "submitted"
                                                            ? "secondary"
                                                            : "outline"

                                                return (
                                                    <TableRow key={r.evaluationId}>
                                                        <TableCell className="min-w-56">
                                                            <div className="font-medium">{r.groupTitle}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {fmtDT(r.scheduledAt)}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="min-w-32">{r.program}</TableCell>
                                                        <TableCell className="min-w-28">{r.term}</TableCell>
                                                        <TableCell className="min-w-40">
                                                            <div className="text-sm">{r.scheduleStatus}</div>
                                                        </TableCell>
                                                        <TableCell className="min-w-24">{r.room}</TableCell>
                                                        <TableCell className="min-w-64">
                                                            <span className="text-sm">{r.panelistNames}</span>
                                                        </TableCell>
                                                        <TableCell className="min-w-48">
                                                            <div className="text-sm">{r.evaluatorName}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {r.evaluatorRole}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="min-w-28">
                                                            <Badge variant={badgeVariant as any}>{r.evaluationStatus}</Badge>
                                                        </TableCell>
                                                        <TableCell className="min-w-20 text-right">
                                                            {score === null ? (
                                                                <span className="text-muted-foreground">—</span>
                                                            ) : (
                                                                <span className="font-medium">{score}</span>
                                                            )}
                                                            <div className="text-xs text-muted-foreground">
                                                                {r.scoreCount} item(s)
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="programs" className="space-y-3">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Program summary</CardTitle>
                            <CardDescription>Aggregated average score per program and term.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {byProgram.length === 0 ? (
                                <div className="text-sm text-muted-foreground">No data.</div>
                            ) : (
                                <div className="overflow-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Program</TableHead>
                                                <TableHead>Term</TableHead>
                                                <TableHead className="text-right">Evaluations</TableHead>
                                                <TableHead className="text-right">Average</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {byProgram.map((r) => (
                                                <TableRow key={`${r.program}|||${r.term}`}>
                                                    <TableCell className="min-w-40 font-medium">{r.program}</TableCell>
                                                    <TableCell className="min-w-36">{r.term}</TableCell>
                                                    <TableCell className="min-w-28 text-right">{r.evalCount}</TableCell>
                                                    <TableCell className="min-w-24 text-right">
                                                        {r.avg === null ? <span className="text-muted-foreground">—</span> : r.avg}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="panelists" className="space-y-3">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Panelist (evaluator) summary</CardTitle>
                            <CardDescription>Aggregated average per evaluator based on their evaluations.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {byPanelist.length === 0 ? (
                                <div className="text-sm text-muted-foreground">No data.</div>
                            ) : (
                                <div className="overflow-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Evaluator</TableHead>
                                                <TableHead>Role</TableHead>
                                                <TableHead className="text-right">Evaluations</TableHead>
                                                <TableHead className="text-right">Average</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {byPanelist.map((r) => (
                                                <TableRow key={r.evaluatorId}>
                                                    <TableCell className="min-w-56 font-medium">{r.name}</TableCell>
                                                    <TableCell className="min-w-24">
                                                        <Badge variant={r.role === "staff" ? "secondary" : "outline"}>
                                                            {r.role}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="min-w-28 text-right">{r.evalCount}</TableCell>
                                                    <TableCell className="min-w-24 text-right">
                                                        {r.avg === null ? <span className="text-muted-foreground">—</span> : r.avg}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
