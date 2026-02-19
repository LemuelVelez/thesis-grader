"use client"

import * as React from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { toast } from "sonner"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription as AlertDialogDesc,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle as AlertDialogTitleUI,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
    Check,
    ClipboardList,
    Eye,
    Loader2,
    RefreshCcw,
    Settings2,
    Trash2,
    Users,
    GraduationCap,
    CalendarClock,
    DoorOpen,
    LayoutGrid,
} from "lucide-react"

type UUID = string

type LooseString<T extends string> = T | (string & {})

type DefenseScheduleStatus = LooseString<"scheduled" | "ongoing" | "completed" | "cancelled">
type StudentEvalStatus = "pending" | "submitted" | "locked"
type EvaluationStatus = LooseString<"pending" | "submitted" | "locked">

type EvaluationTargetType = "group" | "student"

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | { [k: string]: JsonValue } | JsonValue[]
type JsonObject = Record<string, JsonValue>

type AdminDefenseScheduleView = {
    id: UUID
    group_id: UUID
    group_title: string | null
    scheduled_at: string
    room: string | null
    status: DefenseScheduleStatus
    rubric_template_id: UUID | null
    rubric_template_name: string | null
    student_feedback_form_id: UUID | null
}

type StudentFeedbackStatusCounts = {
    total: number
    pending: number
    submitted: number
    locked: number
}

type AdminStudentFeedbackRow = {
    id: UUID
    student_evaluation_id: UUID
    schedule_id: UUID
    student_id: UUID
    student_name: string | null
    student_email: string | null
    status: StudentEvalStatus
    submitted_at: string | null
    locked_at: string | null
    form_id: UUID | null
    form_title: string | null
    form_version: number | null
    answers: JsonObject

    total_score?: number | `${number}` | null
    max_score?: number | `${number}` | null
    percentage?: number | `${number}` | null
    breakdown?: JsonObject | null
    computed_at?: string | null
    score_ready?: boolean
}

type PanelistScorePreviewItem = {
    id: UUID
    evaluation_id: UUID
    evaluator_id: UUID

    target_type: EvaluationTargetType
    target_id: UUID
    target_name: string | null

    criterion_id: UUID
    criterion: string | null
    criterion_description: string | null

    weight: number | `${number}` | null
    min_score: number | null
    max_score: number | null

    score: number
    comment: string | null
}

type PanelistTargetSummary = {
    target_type: EvaluationTargetType
    target_id: UUID
    target_name: string | null
    criteria_scored: number
    weighted_score: number
    weighted_max: number
    percentage: number
}

type PanelistEvaluationPreview = {
    evaluation: {
        id: UUID
        schedule_id: UUID
        evaluator_id: UUID
        status: EvaluationStatus
        submitted_at: string | null
        locked_at: string | null
        created_at: string
        evaluator_name: string | null
        evaluator_email: string | null
    }
    overall:
    | {
        evaluation_id: UUID
        schedule_id: UUID
        group_id: UUID
        evaluator_id: UUID
        status: EvaluationStatus
        criteria_count: number
        criteria_scored: number
        overall_percentage: number | `${number}`
        weighted_score: number | `${number}`
        weighted_max: number | `${number}`
        submitted_at: string | null
        locked_at: string | null
        created_at: string
    }
    | null
    targets: PanelistTargetSummary[]
    scores: PanelistScorePreviewItem[]
}

type AdminEvaluationPreview = {
    schedule: AdminDefenseScheduleView & {
        created_by_name?: string | null
        created_by_email?: string | null
    }
    student: {
        items: AdminStudentFeedbackRow[]
        count: number
        includeAnswers: boolean
        statusCounts: StudentFeedbackStatusCounts
    }
    panelist: {
        items: PanelistEvaluationPreview[]
        count: number
        includeScores: boolean
        includeComments: boolean
    }
}

type StudentFeedbackFormQuestion = {
    id: string
    label?: string
    type?: string
    required?: boolean
    min?: number
    max?: number
    step?: number
    weight?: number
    options?: Array<{ value: string; label?: string } | string>
}

type StudentFeedbackFormSection = {
    id: string
    title?: string
    description?: string
    questions?: StudentFeedbackFormQuestion[]
}

type StudentFeedbackFormSchema = JsonObject & {
    key?: string
    version?: number
    title?: string
    description?: string
    sections?: StudentFeedbackFormSection[]
}

type PickUser = {
    id: UUID
    name: string
    email?: string | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v)
}

function asArray<T = unknown>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : []
}

function toStr(v: unknown): string {
    return typeof v === "string" ? v : ""
}

function safeName(name: string | null | undefined, fallback: string) {
    const t = (name ?? "").trim()
    return t.length > 0 ? t : fallback
}

function shortId(id: string, keep = 6) {
    const t = (id ?? "").trim()
    if (t.length <= keep * 2 + 3) return t
    return `${t.slice(0, keep)}…${t.slice(-keep)}`
}

function toNumber(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string") {
        const t = v.trim()
        if (!t) return null
        const n = Number(t)
        return Number.isFinite(n) ? n : null
    }
    return null
}

function fmtDateTime(iso: string) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    })
}

function statusBadgeVariant(s: string): "secondary" | "default" | "destructive" | "outline" {
    const v = (s ?? "").toLowerCase()
    if (v === "locked") return "default"
    if (v === "submitted") return "secondary"
    if (v === "cancelled") return "destructive"
    if (v === "completed") return "default"
    if (v === "ongoing") return "secondary"
    return "outline"
}

async function readApiError(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as any
        const msg = typeof data?.message === "string" ? data.message : ""
        const err = typeof data?.error === "string" ? data.error : ""
        const code = typeof data?.code === "string" ? ` (${data.code})` : ""
        const merged = [err, msg].filter(Boolean).join(" — ")
        return merged ? `${merged}${code}` : `Request failed (${res.status})`
    } catch {
        const txt = await res.text().catch(() => "")
        return txt?.trim() ? txt.trim() : `Request failed (${res.status})`
    }
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
        },
    })
    if (!res.ok) {
        throw new Error(await readApiError(res))
    }
    return (await res.json()) as T
}

/**
 * Try a list of endpoints (same-shaped data) and return the first success.
 * Useful when route variants exist (common in evolving admin APIs).
 */
async function apiJsonFirst<T>(urls: string[], init?: RequestInit): Promise<T> {
    let lastErr: unknown = null
    for (const u of urls) {
        try {
            return await apiJson<T>(u, init)
        } catch (e) {
            lastErr = e
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error("All endpoints failed.")
}

function renderJsonValue(value: JsonValue): React.ReactNode {
    if (value === null) return <span className="text-muted-foreground">—</span>

    if (typeof value === "string") {
        const t = value.trim()
        return t ? <span className="whitespace-pre-wrap wrap-break-word">{t}</span> : <span className="text-muted-foreground">—</span>
    }

    if (typeof value === "number") return <span>{Number.isFinite(value) ? value : "—"}</span>
    if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>

    if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-muted-foreground">—</span>
        return (
            <div className="flex flex-col gap-1">
                {value.map((v, idx) => (
                    <Badge
                        key={idx}
                        variant="secondary"
                        className="w-fit max-w-full font-normal whitespace-normal wrap-break-word"
                    >
                        {typeof v === "string" ? v : JSON.stringify(v)}
                    </Badge>
                ))}
            </div>
        )
    }

    return (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap wrap-break-word rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(value, null, 2)}
        </pre>
    )
}

function flattenQuestions(schema: StudentFeedbackFormSchema): StudentFeedbackFormQuestion[] {
    const sections = asArray<StudentFeedbackFormSection>((schema as any)?.sections)
    const out: StudentFeedbackFormQuestion[] = []
    for (const s of sections) {
        const qs = asArray<StudentFeedbackFormQuestion>((s as any)?.questions)
        for (const q of qs) {
            if (!q || typeof q !== "object") continue
            const id = typeof q.id === "string" ? q.id.trim() : ""
            if (!id) continue
            out.push(q)
        }
    }
    return out
}

function buildQuestionLabelMap(schema: StudentFeedbackFormSchema): Map<string, { label: string; section?: string }> {
    const map = new Map<string, { label: string; section?: string }>()
    const sections = asArray<StudentFeedbackFormSection>((schema as any)?.sections)
    for (const s of sections) {
        const sectionTitle = typeof s.title === "string" ? s.title : undefined
        const qs = asArray<StudentFeedbackFormQuestion>((s as any)?.questions)
        for (const q of qs) {
            const id = typeof q.id === "string" ? q.id.trim() : ""
            if (!id) continue
            const label = safeName(q.label ?? null, id)
            map.set(id, { label, section: sectionTitle })
        }
    }
    return map
}

function computePercent(n: unknown): number | null {
    const v = toNumber(n)
    if (v === null) return null
    const p = Math.max(0, Math.min(100, v))
    return Number.isFinite(p) ? p : null
}

function compactCounts(c: StudentFeedbackStatusCounts) {
    return `${c.submitted} submitted • ${c.locked} locked • ${c.pending} pending`
}

function MultiSelectUsers(props: {
    label: string
    placeholder: string
    items: PickUser[]
    selectedIds: UUID[]
    onChange: (ids: UUID[]) => void
    disabled?: boolean
    className?: string
}) {
    const { label, placeholder, items, selectedIds, onChange, disabled, className } = props
    const [open, setOpen] = React.useState(false)

    const selected = React.useMemo(() => {
        const set = new Set(selectedIds)
        return items.filter((u) => set.has(u.id))
    }, [items, selectedIds])

    const toggle = (id: UUID) => {
        const set = new Set(selectedIds)
        if (set.has(id)) set.delete(id)
        else set.add(id)
        onChange(Array.from(set))
    }

    const clear = () => onChange([])

    return (
        <div className={cn("space-y-2", className)}>
            <Label className="text-sm">{label}</Label>

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-between"
                        disabled={disabled}
                    >
                        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-auto">
                            {selected.length === 0 ? (
                                <span className="truncate text-muted-foreground">{placeholder}</span>
                            ) : (
                                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-auto">
                                    <div className="flex flex-wrap gap-1">
                                        {selected.slice(0, 2).map((u) => (
                                            <Badge key={u.id} variant="secondary" className="font-normal">
                                                {u.name}
                                            </Badge>
                                        ))}
                                        {selected.length > 2 ? (
                                            <Badge variant="outline" className="font-normal">
                                                +{selected.length - 2} more
                                            </Badge>
                                        ) : null}
                                    </div>
                                </div>
                            )}
                        </div>
                        <Settings2 className="h-4 w-4 shrink-0 opacity-70" />
                    </Button>
                </PopoverTrigger>

                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                        <CommandInput placeholder="Search by name…" />
                        <CommandList>
                            <CommandEmpty>No results.</CommandEmpty>
                            <CommandGroup>
                                {items.map((u) => {
                                    const checked = selectedIds.includes(u.id)
                                    return (
                                        <CommandItem
                                            key={u.id}
                                            value={`${u.name} ${u.email ?? ""} ${u.id}`}
                                            onSelect={() => toggle(u.id)}
                                            className="flex items-center gap-2"
                                        >
                                            <span
                                                className={cn(
                                                    "flex h-4 w-4 items-center justify-center rounded-sm border",
                                                    checked ? "bg-primary text-primary-foreground" : "bg-background"
                                                )}
                                            >
                                                {checked ? <Check className="h-3 w-3" /> : null}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm">{u.name}</div>
                                                {u.email ? (
                                                    <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                                                ) : (
                                                    <div className="truncate text-xs text-muted-foreground">{shortId(u.id)}</div>
                                                )}
                                            </div>
                                        </CommandItem>
                                    )
                                })}
                            </CommandGroup>
                        </CommandList>

                        <div className="flex items-center justify-between gap-2 border-t p-2">
                            <div className="text-xs text-muted-foreground">
                                {selectedIds.length} selected
                            </div>
                            <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={selectedIds.length === 0}>
                                Clear
                            </Button>
                        </div>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    )
}

function StatPill(props: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
            <div className="text-muted-foreground">{props.icon}</div>
            <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{props.label}</div>
                <div className="truncate text-sm font-medium">{props.value}</div>
            </div>
        </div>
    )
}

function EmptyState(props: { title: string; description?: string; action?: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-muted/20 p-8 text-center">
            <div className="text-base font-semibold">{props.title}</div>
            {props.description ? <div className="mt-1 max-w-lg text-sm text-muted-foreground">{props.description}</div> : null}
            {props.action ? <div className="mt-4">{props.action}</div> : null}
        </div>
    )
}

export default function AdminEvaluationsPage() {
    const [loading, setLoading] = React.useState(true)
    const [refreshKey, setRefreshKey] = React.useState(0)

    const [schedules, setSchedules] = React.useState<AdminDefenseScheduleView[]>([])
    const [query, setQuery] = React.useState("")

    // Controlled accordion (so we only mount schedules for opened groups)
    const [openGroupIds, setOpenGroupIds] = React.useState<string[]>([])

    // Lazy caches
    const [previewByScheduleId, setPreviewByScheduleId] = React.useState<Map<UUID, AdminEvaluationPreview>>(new Map())
    const [loadingPreviewIds, setLoadingPreviewIds] = React.useState<Set<UUID>>(new Set())

    const [panelistsByScheduleId, setPanelistsByScheduleId] = React.useState<Map<UUID, PickUser[]>>(new Map())
    const [studentsByGroupId, setStudentsByGroupId] = React.useState<Map<UUID, PickUser[]>>(new Map())

    // Preview options
    const [includeStudentAnswers, setIncludeStudentAnswers] = React.useState(true)
    const [includePanelistScores, setIncludePanelistScores] = React.useState(true)
    const [includePanelistComments, setIncludePanelistComments] = React.useState(true)

    const loadSchedules = React.useCallback(async () => {
        setLoading(true)
        const tId = toast.loading("Loading defense schedules…")
        try {
            // Try multiple route variants (common across versions)
            const data = await apiJsonFirst<any>(
                [
                    "/api/admin/defense-schedules?limit=500&orderBy=scheduled_at&orderDirection=desc&detailed=true",
                    "/api/admin/defense-schedules?limit=500&orderBy=scheduled_at&orderDirection=desc",
                    "/api/admin/defense-schedule?limit=500&orderBy=scheduled_at&orderDirection=desc",
                ],
                { method: "GET" }
            )

            const items = asArray<any>(data?.items ?? data?.rows ?? data?.data ?? [])
            const normalized: AdminDefenseScheduleView[] = items
                .map((r) => ({
                    id: toStr(r?.id) as UUID,
                    group_id: toStr(r?.group_id) as UUID,
                    group_title: typeof r?.group_title === "string" ? r.group_title : null,
                    scheduled_at: toStr(r?.scheduled_at),
                    room: typeof r?.room === "string" ? r.room : null,
                    status: (toStr(r?.status) || "scheduled") as DefenseScheduleStatus,
                    rubric_template_id: (typeof r?.rubric_template_id === "string" ? r.rubric_template_id : null) as UUID | null,
                    rubric_template_name: typeof r?.rubric_template_name === "string" ? r.rubric_template_name : null,
                    student_feedback_form_id: (typeof r?.student_feedback_form_id === "string" ? r.student_feedback_form_id : null) as UUID | null,
                }))
                .filter((r) => !!r.id && !!r.group_id && !!r.scheduled_at)

            setSchedules(normalized)
            toast.success(`Loaded ${normalized.length} schedule(s).`, { id: tId })
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to load schedules.", { id: tId })
            setSchedules([])
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void loadSchedules()
    }, [loadSchedules, refreshKey])

    const grouped = React.useMemo(() => {
        const q = query.trim().toLowerCase()
        const filtered = q
            ? schedules.filter((s) => {
                const g = (s.group_title ?? "").toLowerCase()
                const r = (s.room ?? "").toLowerCase()
                const rt = (s.rubric_template_name ?? "").toLowerCase()
                const st = (s.status ?? "").toLowerCase()
                return g.includes(q) || r.includes(q) || rt.includes(q) || st.includes(q) || s.id.toLowerCase().includes(q)
            })
            : schedules

        const map = new Map<string, { group_id: UUID; group_title: string; schedules: AdminDefenseScheduleView[] }>()
        for (const s of filtered) {
            const key = s.group_id
            const title = safeName(s.group_title, `Group ${shortId(s.group_id)}`)
            const existing = map.get(key)
            if (!existing) map.set(key, { group_id: s.group_id, group_title: title, schedules: [s] })
            else existing.schedules.push(s)
        }

        // sort schedules within each group by scheduled_at desc
        const groups = Array.from(map.values()).map((g) => ({
            ...g,
            schedules: [...g.schedules].sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()),
        }))

        // sort groups by name
        groups.sort((a, b) => a.group_title.toLowerCase().localeCompare(b.group_title.toLowerCase()))
        return groups
    }, [schedules, query])

    const ensureSchedulePreview = React.useCallback(
        async (scheduleId: UUID) => {
            if (previewByScheduleId.has(scheduleId)) return

            setLoadingPreviewIds((prev) => new Set(prev).add(scheduleId))
            try {
                const data = await apiJsonFirst<any>(
                    [
                        `/api/admin/evaluation-previews/schedule/${scheduleId}?includeStudentAnswers=${includeStudentAnswers}&includePanelistScores=${includePanelistScores}&includePanelistComments=${includePanelistComments}`,
                        `/api/admin/evaluation-previews/${scheduleId}?includeStudentAnswers=${includeStudentAnswers}&includePanelistScores=${includePanelistScores}&includePanelistComments=${includePanelistComments}`,
                    ],
                    { method: "GET" }
                )
                const preview = (data?.preview ?? data?.item ?? data) as AdminEvaluationPreview
                if (!preview?.schedule?.id) throw new Error("Preview payload is missing schedule data.")
                setPreviewByScheduleId((prev) => {
                    const next = new Map(prev)
                    next.set(scheduleId, preview)
                    return next
                })
            } finally {
                setLoadingPreviewIds((prev) => {
                    const next = new Set(prev)
                    next.delete(scheduleId)
                    return next
                })
            }
        },
        [previewByScheduleId, includeStudentAnswers, includePanelistScores, includePanelistComments]
    )

    const refreshSchedulePreview = React.useCallback(
        async (scheduleId: UUID) => {
            const tId = toast.loading("Refreshing preview…")
            try {
                const data = await apiJsonFirst<any>(
                    [
                        `/api/admin/evaluation-previews/schedule/${scheduleId}?includeStudentAnswers=${includeStudentAnswers}&includePanelistScores=${includePanelistScores}&includePanelistComments=${includePanelistComments}`,
                        `/api/admin/evaluation-previews/${scheduleId}?includeStudentAnswers=${includeStudentAnswers}&includePanelistScores=${includePanelistScores}&includePanelistComments=${includePanelistComments}`,
                    ],
                    { method: "GET" }
                )
                const preview = (data?.preview ?? data?.item ?? data) as AdminEvaluationPreview
                if (!preview?.schedule?.id) throw new Error("Preview payload is missing schedule data.")
                setPreviewByScheduleId((prev) => {
                    const next = new Map(prev)
                    next.set(scheduleId, preview)
                    return next
                })
                toast.success("Preview updated.", { id: tId })
            } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed to refresh preview.", { id: tId })
            }
        },
        [includeStudentAnswers, includePanelistScores, includePanelistComments]
    )

    const ensureSchedulePanelists = React.useCallback(
        async (scheduleId: UUID) => {
            if (panelistsByScheduleId.has(scheduleId)) return

            try {
                const data = await apiJsonFirst<any>(
                    [
                        `/api/admin/schedule-panelists/schedule/${scheduleId}`,
                        `/api/admin/defense-schedule-panelists/schedule/${scheduleId}`,
                        `/api/admin/schedule-panelists/${scheduleId}`,
                        `/api/admin/defense-schedules/${scheduleId}/panelists`,
                    ],
                    { method: "GET" }
                )

                const items = asArray<any>(data?.items ?? data?.panelists ?? data?.rows ?? [])
                const normalized: PickUser[] = items
                    .map((r) => {
                        const id = (toStr(r?.staff_id ?? r?.user_id ?? r?.id) as UUID) || ""
                        const name = safeName(
                            (r?.staff_name as string | null | undefined) ?? (r?.name as string | null | undefined),
                            id ? `Panelist ${shortId(id)}` : "Unknown"
                        )
                        const email = (typeof r?.staff_email === "string" ? r.staff_email : typeof r?.email === "string" ? r.email : null) as
                            | string
                            | null
                        return { id, name, email }
                    })
                    .filter((u) => !!u.id)

                setPanelistsByScheduleId((prev) => {
                    const next = new Map(prev)
                    next.set(scheduleId, normalized)
                    return next
                })
            } catch {
                // Best-effort: leave empty; UI will still allow preview and student assignment.
                setPanelistsByScheduleId((prev) => {
                    const next = new Map(prev)
                    next.set(scheduleId, [])
                    return next
                })
            }
        },
        [panelistsByScheduleId]
    )

    const ensureGroupStudents = React.useCallback(
        async (groupId: UUID) => {
            if (studentsByGroupId.has(groupId)) return

            try {
                const data = await apiJsonFirst<any>(
                    [
                        `/api/admin/thesis-groups/${groupId}`,
                        `/api/admin/thesis-group/${groupId}`,
                        `/api/admin/groups/${groupId}`,
                        `/api/admin/thesis-groups/${groupId}/members`,
                        `/api/admin/groups/${groupId}/members`,
                    ],
                    { method: "GET" }
                )

                // Accept a lot of shapes:
                // - { members: [...] }
                // - { items: [...] }
                // - { item: { members: [...] } }
                const members = asArray<any>(
                    (data?.members ??
                        data?.items ??
                        data?.rows ??
                        data?.item?.members ??
                        data?.item?.items ??
                        data?.group?.members) ?? []
                )

                const normalized: PickUser[] = members
                    .map((r) => {
                        const id = (toStr(r?.student_id ?? r?.user_id ?? r?.id) as UUID) || ""
                        const name = safeName(
                            (r?.student_name as string | null | undefined) ?? (r?.name as string | null | undefined),
                            id ? `Student ${shortId(id)}` : "Unknown"
                        )
                        const email = (typeof r?.student_email === "string" ? r.student_email : typeof r?.email === "string" ? r.email : null) as
                            | string
                            | null
                        return { id, name, email }
                    })
                    .filter((u) => !!u.id)

                setStudentsByGroupId((prev) => {
                    const next = new Map(prev)
                    next.set(groupId, normalized)
                    return next
                })
            } catch {
                setStudentsByGroupId((prev) => {
                    const next = new Map(prev)
                    next.set(groupId, [])
                    return next
                })
            }
        },
        [studentsByGroupId]
    )

    const PageToolbar = (
        <Card>
            <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Evaluations
                </CardTitle>
                <CardDescription>
                    Assign <span className="font-medium">panelist rubric evaluations</span> and{" "}
                    <span className="font-medium">student feedback forms</span> per defense schedule. Preview questions, answers,
                    and scores—grouped by thesis group.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-12">
                    <div className="lg:col-span-7">
                        <div className="space-y-2">
                            <Label className="text-sm">Search</Label>
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search group, rubric, room, status…"
                            />
                        </div>
                    </div>

                    <div className="lg:col-span-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setRefreshKey((k) => k + 1)}
                                className="w-full sm:w-auto"
                            >
                                <RefreshCcw className="mr-2 h-4 w-4" />
                                Refresh
                            </Button>

                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button type="button" variant="secondary" className="w-full sm:w-auto">
                                        <Settings2 className="mr-2 h-4 w-4" />
                                        Preview Options
                                    </Button>
                                </DialogTrigger>

                                {/* Dialog height requirement: h-[85svh] + scroll */}
                                <DialogContent className="max-w-2xl h-[85svh] overflow-auto p-0">
                                    <div className="flex h-full flex-col">
                                        <DialogHeader className="px-6 pt-6">
                                            <DialogTitle>Preview Options</DialogTitle>
                                            <DialogDescription>
                                                Control what the preview loads. Turning off heavy data can make previews faster.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="flex-1 overflow-auto px-6 pb-6">
                                            <ScrollArea className="h-full pr-4">
                                                <div className="grid gap-4">
                                                    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium">Include student answers</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                Shows question-by-question answers in preview.
                                                            </div>
                                                        </div>
                                                        <Switch checked={includeStudentAnswers} onCheckedChange={setIncludeStudentAnswers} />
                                                    </div>

                                                    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium">Include panelist scores</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                Loads rubric scores per criterion.
                                                            </div>
                                                        </div>
                                                        <Switch checked={includePanelistScores} onCheckedChange={setIncludePanelistScores} />
                                                    </div>

                                                    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium">Include panelist comments</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                Loads per-criterion comments (if saved).
                                                            </div>
                                                        </div>
                                                        <Switch checked={includePanelistComments} onCheckedChange={setIncludePanelistComments} />
                                                    </div>

                                                    <div className="text-xs text-muted-foreground">
                                                        Tip: After changing options, refresh a schedule preview to re-fetch with the new settings.
                                                    </div>
                                                </div>
                                            </ScrollArea>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </div>

                <Separator />

                <div className="grid gap-3 md:grid-cols-3">
                    <StatPill icon={<LayoutGrid className="h-4 w-4" />} label="Thesis groups" value={grouped.length} />
                    <StatPill icon={<CalendarClock className="h-4 w-4" />} label="Defense schedules" value={schedules.length} />
                    <StatPill icon={<Eye className="h-4 w-4" />} label="Previews cached" value={previewByScheduleId.size} />
                </div>
            </CardContent>
        </Card>
    )

    return (
        <DashboardLayout
            title="Evaluations"
            description="Assign evaluations and preview questions, answers, and scores by thesis group."
            mainClassName="space-y-6"
        >
            {PageToolbar}

            {loading ? (
                <div className="grid gap-4">
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                </div>
            ) : grouped.length === 0 ? (
                <EmptyState
                    title="No thesis groups found"
                    description="No defense schedules match your current filters. Try clearing the search, or refresh."
                    action={
                        <Button variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            Refresh
                        </Button>
                    }
                />
            ) : (
                <Accordion
                    type="multiple"
                    className="w-full space-y-3"
                    value={openGroupIds}
                    onValueChange={(v) => setOpenGroupIds(v)}
                >
                    {grouped.map((g) => {
                        const isOpen = openGroupIds.includes(g.group_id)
                        return (
                            <AccordionItem key={g.group_id} value={g.group_id} className="rounded-xl border bg-background px-2">
                                <AccordionTrigger
                                    className="px-4"
                                    onClick={() => {
                                        // Prime students list (best effort)
                                        void ensureGroupStudents(g.group_id)
                                    }}
                                >
                                    <div className="flex w-full items-center justify-between gap-3 pr-3">
                                        <div className="min-w-0">
                                            <div className="truncate text-left text-sm font-semibold">{g.group_title}</div>
                                            <div className="truncate text-left text-xs text-muted-foreground">
                                                {g.schedules.length} schedule(s)
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="font-normal">
                                                {g.schedules.length} schedules
                                            </Badge>
                                        </div>
                                    </div>
                                </AccordionTrigger>

                                <AccordionContent className="px-4 pb-4">
                                    {isOpen ? (
                                        <div className="grid gap-3">
                                            {g.schedules.map((s) => (
                                                <ScheduleCard
                                                    key={s.id}
                                                    schedule={s}
                                                    preview={previewByScheduleId.get(s.id) ?? null}
                                                    previewLoading={loadingPreviewIds.has(s.id)}
                                                    onEnsurePreview={() => void ensureSchedulePreview(s.id)}
                                                    onRefreshPreview={() => void refreshSchedulePreview(s.id)}
                                                    onEnsurePanelists={() => void ensureSchedulePanelists(s.id)}
                                                    onEnsureStudents={() => void ensureGroupStudents(s.group_id)}
                                                    getPanelists={() => panelistsByScheduleId.get(s.id) ?? []}
                                                    getStudents={() => studentsByGroupId.get(s.group_id) ?? []}
                                                    onPreviewCached={(p) => {
                                                        setPreviewByScheduleId((prev) => {
                                                            const next = new Map(prev)
                                                            next.set(s.id, p)
                                                            return next
                                                        })
                                                    }}
                                                    previewOptions={{
                                                        includeStudentAnswers,
                                                        includePanelistScores,
                                                        includePanelistComments,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    ) : null}
                                </AccordionContent>
                            </AccordionItem>
                        )
                    })}
                </Accordion>
            )}
        </DashboardLayout>
    )
}

function ScheduleCard(props: {
    schedule: AdminDefenseScheduleView
    preview: AdminEvaluationPreview | null
    previewLoading: boolean

    onEnsurePreview: () => void
    onRefreshPreview: () => void
    onEnsurePanelists: () => void
    onEnsureStudents: () => void

    getPanelists: () => PickUser[]
    getStudents: () => PickUser[]

    onPreviewCached: (p: AdminEvaluationPreview) => void
    previewOptions: { includeStudentAnswers: boolean; includePanelistScores: boolean; includePanelistComments: boolean }
}) {
    const { schedule, preview, previewLoading } = props

    const studentCounts = preview?.student?.statusCounts ?? null
    const panelistCount = preview?.panelist?.count ?? null

    const title = safeName(schedule.group_title, `Group ${shortId(schedule.group_id)}`)
    const rubricName = schedule.rubric_template_name ? schedule.rubric_template_name : "Active rubric (schedule)"

    const studentSubmittedPct = studentCounts && studentCounts.total > 0 ? (studentCounts.submitted / studentCounts.total) * 100 : 0
    const studentLockedPct = studentCounts && studentCounts.total > 0 ? (studentCounts.locked / studentCounts.total) * 100 : 0

    // Auto-load preview (and best-effort related lists) when the card becomes visible
    const cardRef = React.useRef<HTMLDivElement | null>(null)
    const autoLoadedRef = React.useRef(false)

    React.useEffect(() => {
        if (preview || previewLoading) return
        if (autoLoadedRef.current) return

        const trigger = () => {
            if (autoLoadedRef.current) return
            autoLoadedRef.current = true
            props.onEnsurePreview()
            props.onEnsurePanelists()
            props.onEnsureStudents()
        }

        // Fallback (older browsers)
        if (typeof window === "undefined" || !(window as any).IntersectionObserver) {
            trigger()
            return
        }

        const el = cardRef.current
        if (!el) return

        const obs = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        trigger()
                        obs.disconnect()
                        break
                    }
                }
            },
            { root: null, rootMargin: "240px 0px", threshold: 0.01 }
        )

        obs.observe(el)
        return () => obs.disconnect()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preview, previewLoading, schedule.id])

    return (
        <div ref={cardRef}>
            <Card className="overflow-auto">
                <CardHeader className="space-y-2">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 space-y-1">
                            <CardTitle className="truncate text-base">{title}</CardTitle>
                            <CardDescription className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1">
                                    <CalendarClock className="h-4 w-4" />
                                    {fmtDateTime(schedule.scheduled_at)}
                                </span>
                                {schedule.room ? (
                                    <span className="inline-flex items-center gap-1">
                                        <DoorOpen className="h-4 w-4" />
                                        {schedule.room}
                                    </span>
                                ) : null}
                            </CardDescription>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={statusBadgeVariant(schedule.status)} className="capitalize">
                                {String(schedule.status ?? "scheduled")}
                            </Badge>
                            <Badge variant="secondary" className="font-normal">
                                {rubricName}
                            </Badge>
                        </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                        <StatPill
                            icon={<Users className="h-4 w-4" />}
                            label="Panelist evaluations"
                            value={panelistCount !== null ? panelistCount : <span className="text-muted-foreground">—</span>}
                        />
                        <StatPill
                            icon={<GraduationCap className="h-4 w-4" />}
                            label="Student feedback"
                            value={
                                studentCounts ? (
                                    <span className="truncate">{studentCounts.total} total</span>
                                ) : (
                                    <span className="text-muted-foreground">—</span>
                                )
                            }
                        />
                        <StatPill
                            icon={<Eye className="h-4 w-4" />}
                            label="Preview"
                            value={
                                preview ? (
                                    <span className="text-sm font-medium">Cached</span>
                                ) : previewLoading ? (
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading…
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground">Preparing…</span>
                                )
                            }
                        />
                    </div>

                    {studentCounts ? (
                        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-medium">Student submission progress</div>
                                <div className="text-xs text-muted-foreground">{compactCounts(studentCounts)}</div>
                            </div>
                            <div className="space-y-2">
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>Submitted</span>
                                        <span>{Math.round(studentSubmittedPct)}%</span>
                                    </div>
                                    <Progress value={studentSubmittedPct} />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>Locked</span>
                                        <span>{Math.round(studentLockedPct)}%</span>
                                    </div>
                                    <Progress value={studentLockedPct} />
                                </div>
                            </div>
                        </div>
                    ) : null}
                </CardHeader>

                <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    {/* IDs are hidden behind tooltip */}
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-fit px-2 text-xs text-muted-foreground"
                                >
                                    View IDs
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                                <div className="space-y-1 text-xs">
                                    <div>
                                        <span className="font-medium">Schedule ID:</span> {schedule.id}
                                    </div>
                                    <div>
                                        <span className="font-medium">Group ID:</span> {schedule.group_id}
                                    </div>
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                        <PreviewDialog
                            schedule={schedule}
                            preview={preview}
                            previewLoading={previewLoading}
                            onOpen={() => {
                                props.onEnsurePreview()
                            }}
                            onRefresh={() => props.onRefreshPreview()}
                        />

                        <AssignSheet
                            schedule={schedule}
                            getPreview={() => preview}
                            ensurePreview={props.onEnsurePreview}
                            ensurePanelists={props.onEnsurePanelists}
                            ensureStudents={props.onEnsureStudents}
                            getPanelists={props.getPanelists}
                            getStudents={props.getStudents}
                            onPreviewUpdated={props.onPreviewCached}
                            previewOptions={props.previewOptions}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function PreviewDialog(props: {
    schedule: AdminDefenseScheduleView
    preview: AdminEvaluationPreview | null
    previewLoading: boolean
    onOpen: () => void
    onRefresh: () => void
}) {
    const { schedule, preview, previewLoading } = props
    const [open, setOpen] = React.useState(false)

    const [schemaByFormId, setSchemaByFormId] = React.useState<Map<string, StudentFeedbackFormSchema>>(new Map())
    const [loadingSchemas, setLoadingSchemas] = React.useState(false)

    // Prevent maximum update depth:
    // - keep a ref to the latest map so we can compute "missing formIds" without depending on state in the callback
    const schemaByFormIdRef = React.useRef<Map<string, StudentFeedbackFormSchema>>(new Map())
    React.useEffect(() => {
        schemaByFormIdRef.current = schemaByFormId
    }, [schemaByFormId])

    const loadingSchemasRef = React.useRef(false)
    React.useEffect(() => {
        loadingSchemasRef.current = loadingSchemas
    }, [loadingSchemas])

    const loadSchemasForPreview = React.useCallback(async () => {
        if (!preview?.student?.items?.length) return
        if (loadingSchemasRef.current) return

        const formIds = Array.from(
            new Set(
                preview.student.items
                    .map((r) => (typeof r.form_id === "string" ? r.form_id : null))
                    .filter(Boolean) as string[]
            )
        )
        if (formIds.length === 0) return

        const missing = formIds.filter((formId) => !schemaByFormIdRef.current.has(formId))
        if (missing.length === 0) return

        setLoadingSchemas(true)
        try {
            const fetched = new Map<string, StudentFeedbackFormSchema>()

            for (const formId of missing) {
                try {
                    const data = await apiJsonFirst<any>(
                        [
                            `/api/admin/student-feedback/forms/${formId}`,
                            `/api/admin/student_feedback/forms/${formId}`,
                        ],
                        { method: "GET" }
                    )
                    const schema = (data?.item?.schema ?? data?.item ?? data?.schema ?? {}) as StudentFeedbackFormSchema
                    fetched.set(formId, schema)
                } catch {
                    // fallback to active schema
                    try {
                        const data = await apiJsonFirst<any>(
                            ["/api/admin/student-feedback/schema", "/api/admin/student_feedback/schema"],
                            { method: "GET" }
                        )
                        const schema = (data?.item ?? data?.schema ?? {}) as StudentFeedbackFormSchema
                        fetched.set(formId, schema)
                    } catch {
                        // ignore
                    }
                }
            }

            if (fetched.size > 0) {
                setSchemaByFormId((prev) => {
                    let changed = false
                    const next = new Map(prev)
                    for (const [k, v] of fetched.entries()) {
                        if (!next.has(k)) {
                            next.set(k, v)
                            changed = true
                        }
                    }
                    return changed ? next : prev
                })
            }
        } finally {
            setLoadingSchemas(false)
        }
    }, [preview])

    React.useEffect(() => {
        if (!open) return
        props.onOpen()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    React.useEffect(() => {
        if (!open) return
        void loadSchemasForPreview()
    }, [open, loadSchemasForPreview])

    const title = safeName(schedule.group_title, `Group ${shortId(schedule.group_id)}`)

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    disabled={previewLoading}
                >
                    {previewLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                    Preview
                </Button>
            </DialogTrigger>

            {/* Dialog height requirement: h-[85svh] + scroll */}
            <DialogContent className="max-w-5xl h-[85svh] overflow-auto p-0">
                <div className="flex h-full flex-col">
                    <DialogHeader className="px-6 pt-6">
                        <DialogTitle className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="truncate">{title}</div>
                                <div className="mt-1 text-sm font-normal text-muted-foreground">
                                    {fmtDateTime(schedule.scheduled_at)}
                                    {schedule.room ? ` • ${schedule.room}` : ""} •{" "}
                                    <span className="capitalize">{String(schedule.status)}</span>
                                </div>
                            </div>
                            <Button type="button" variant="outline" onClick={props.onRefresh}>
                                <RefreshCcw className="mr-2 h-4 w-4" />
                                Refresh
                            </Button>
                        </DialogTitle>
                        <DialogDescription>
                            Panelists use the <span className="font-medium">active rubric template</span> pinned on the schedule.
                            Students answer the <span className="font-medium">feedback form</span> (pinned per schedule when
                            assigned).
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-auto px-6 pb-6">
                        <ScrollArea className="h-full pr-4">
                            {!preview ? (
                                <div className="space-y-3">
                                    <div className="rounded-xl border p-4">
                                        <div className="flex items-center gap-2">
                                            {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                                            <div className="text-sm font-medium">{previewLoading ? "Loading preview…" : "Preparing preview…"}</div>
                                        </div>
                                        <div className="mt-1 text-sm text-muted-foreground">
                                            This loads automatically. If it doesn’t appear, use <span className="font-medium">Refresh</span>.
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <Tabs defaultValue="summary" className="w-full">
                                    <TabsList className="w-full justify-start">
                                        <TabsTrigger value="summary">Summary</TabsTrigger>
                                        <TabsTrigger value="panelist">
                                            Panelists{" "}
                                            <Badge variant="secondary" className="ml-2">
                                                {preview.panelist.count}
                                            </Badge>
                                        </TabsTrigger>
                                        <TabsTrigger value="student">
                                            Students{" "}
                                            <Badge variant="secondary" className="ml-2">
                                                {preview.student.count}
                                            </Badge>
                                        </TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="summary" className="space-y-4">
                                        <div className="grid gap-3 md:grid-cols-3">
                                            <StatPill icon={<Users className="h-4 w-4" />} label="Panelist evaluations" value={preview.panelist.count} />
                                            <StatPill
                                                icon={<GraduationCap className="h-4 w-4" />}
                                                label="Student feedback"
                                                value={preview.student.count}
                                            />
                                            <StatPill
                                                icon={<ClipboardList className="h-4 w-4" />}
                                                label="Rubric template"
                                                value={safeName(preview.schedule.rubric_template_name, "—")}
                                            />
                                        </div>

                                        <div className="rounded-xl border p-4">
                                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                <div className="text-sm font-medium">Student Status</div>
                                                <div className="text-xs text-muted-foreground">{compactCounts(preview.student.statusCounts)}</div>
                                            </div>
                                            <div className="mt-3 grid gap-3 md:grid-cols-3">
                                                <div className="rounded-lg border bg-muted/20 p-3">
                                                    <div className="text-xs text-muted-foreground">Pending</div>
                                                    <div className="text-lg font-semibold">{preview.student.statusCounts.pending}</div>
                                                </div>
                                                <div className="rounded-lg border bg-muted/20 p-3">
                                                    <div className="text-xs text-muted-foreground">Submitted</div>
                                                    <div className="text-lg font-semibold">{preview.student.statusCounts.submitted}</div>
                                                </div>
                                                <div className="rounded-lg border bg-muted/20 p-3">
                                                    <div className="text-xs text-muted-foreground">Locked</div>
                                                    <div className="text-lg font-semibold">{preview.student.statusCounts.locked}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="panelist" className="space-y-4">
                                        {preview.panelist.count === 0 ? (
                                            <EmptyState
                                                title="No panelist evaluations assigned yet"
                                                description="Assign evaluations to panelists (all or specific) to start collecting rubric scores."
                                            />
                                        ) : (
                                            <div className="space-y-3">
                                                {preview.panelist.items.map((p) => {
                                                    const name = safeName(p.evaluation.evaluator_name, `Panelist ${shortId(p.evaluation.evaluator_id)}`)
                                                    const pct = computePercent(p.overall?.overall_percentage)
                                                    const status = String(p.evaluation.status ?? "pending")
                                                    return (
                                                        <Card key={p.evaluation.id} className="overflow-auto">
                                                            <CardHeader className="space-y-2">
                                                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                                                    <div className="min-w-0">
                                                                        <div className="truncate text-sm font-semibold">{name}</div>
                                                                        <div className="truncate text-xs text-muted-foreground">{p.evaluation.evaluator_email ?? ""}</div>
                                                                    </div>
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <Badge variant={statusBadgeVariant(status)} className="capitalize">
                                                                            {status}
                                                                        </Badge>
                                                                        {pct !== null ? (
                                                                            <Badge variant="secondary" className="font-normal">
                                                                                {pct.toFixed(1)}%
                                                                            </Badge>
                                                                        ) : (
                                                                            <Badge variant="outline" className="font-normal">
                                                                                —
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {pct !== null ? (
                                                                    <div className="space-y-1">
                                                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                                            <span>Overall score</span>
                                                                            <span>{pct.toFixed(1)}%</span>
                                                                        </div>
                                                                        <Progress value={pct} />
                                                                    </div>
                                                                ) : null}
                                                            </CardHeader>

                                                            <CardContent className="space-y-3">
                                                                <div className="rounded-lg border bg-muted/20 p-3">
                                                                    <div className="text-xs font-medium text-muted-foreground">Target summaries</div>
                                                                    <div className="mt-2 space-y-2">
                                                                        {p.targets.length === 0 ? (
                                                                            <div className="text-sm text-muted-foreground">No scores yet.</div>
                                                                        ) : (
                                                                            p.targets.map((t) => (
                                                                                <div
                                                                                    key={`${t.target_type}:${t.target_id}`}
                                                                                    className="flex items-center justify-between gap-3 rounded-md border bg-background p-3"
                                                                                >
                                                                                    <div className="min-w-0">
                                                                                        <div className="text-sm font-medium whitespace-normal wrap-break-word leading-snug">
                                                                                            {t.target_type === "group" ? "Group" : "Student"}:{" "}
                                                                                            {safeName(t.target_name, shortId(t.target_id))}
                                                                                        </div>
                                                                                        <div className="text-xs text-muted-foreground">
                                                                                            {t.criteria_scored} criterion/criteria scored
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="text-right">
                                                                                        <div className="text-sm font-semibold">{t.percentage.toFixed(1)}%</div>
                                                                                        <div className="text-xs text-muted-foreground">
                                                                                            {t.weighted_score.toFixed(2)} / {t.weighted_max.toFixed(2)}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {p.scores.length > 0 ? (
                                                                    <Accordion type="single" collapsible className="w-full">
                                                                        <AccordionItem value="scores" className="rounded-lg border px-2">
                                                                            <AccordionTrigger className="px-3">
                                                                                Detailed rubric scores ({p.scores.length})
                                                                            </AccordionTrigger>
                                                                            <AccordionContent className="px-3 pb-3">
                                                                                <ScoreDetails scores={p.scores} />
                                                                            </AccordionContent>
                                                                        </AccordionItem>
                                                                    </Accordion>
                                                                ) : (
                                                                    <div className="text-sm text-muted-foreground">No detailed scores loaded.</div>
                                                                )}
                                                            </CardContent>
                                                        </Card>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </TabsContent>

                                    <TabsContent value="student" className="space-y-4">
                                        {preview.student.count === 0 ? (
                                            <EmptyState
                                                title="No student feedback assigned yet"
                                                description="Assign student feedback forms (all or specific) to start collecting student responses."
                                            />
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                    <div className="text-sm text-muted-foreground">
                                                        Showing {preview.student.count} student evaluation(s)
                                                        {loadingSchemas ? (
                                                            <span className="ml-2 inline-flex items-center gap-2">
                                                                <Loader2 className="h-3 w-3 animate-spin" /> loading form…
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    <Badge variant="outline" className="font-normal">
                                                        Answers: {preview.student.includeAnswers ? "included" : "hidden"}
                                                    </Badge>
                                                </div>

                                                <div className="grid gap-3">
                                                    {preview.student.items.map((r) => {
                                                        const studentName = safeName(r.student_name, `Student ${shortId(r.student_id)}`)
                                                        const pct = computePercent(r.percentage)
                                                        const formId = typeof r.form_id === "string" ? r.form_id : null
                                                        const schema = formId ? schemaByFormId.get(formId) ?? null : null
                                                        const labelMap = schema ? buildQuestionLabelMap(schema) : null

                                                        return (
                                                            <Card key={r.student_evaluation_id} className="overflow-auto">
                                                                <CardHeader className="space-y-2">
                                                                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                                                        <div className="min-w-0">
                                                                            <div className="truncate text-sm font-semibold">{studentName}</div>
                                                                            <div className="truncate text-xs text-muted-foreground">{r.student_email ?? ""}</div>
                                                                        </div>
                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                            <Badge variant={statusBadgeVariant(r.status)} className="capitalize">
                                                                                {r.status}
                                                                            </Badge>
                                                                            {pct !== null ? (
                                                                                <Badge variant="secondary" className="font-normal">
                                                                                    {pct.toFixed(1)}%
                                                                                </Badge>
                                                                            ) : (
                                                                                <Badge variant="outline" className="font-normal">
                                                                                    —
                                                                                </Badge>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                                        <span>
                                                                            Form:{" "}
                                                                            <span className="font-medium text-foreground">
                                                                                {safeName(r.form_title, "Pinned form")}
                                                                            </span>
                                                                            {typeof r.form_version === "number" ? ` (v${r.form_version})` : ""}
                                                                        </span>
                                                                        {r.submitted_at ? <span>• Submitted: {fmtDateTime(r.submitted_at)}</span> : null}
                                                                        {r.locked_at ? <span>• Locked: {fmtDateTime(r.locked_at)}</span> : null}
                                                                    </div>

                                                                    {pct !== null ? (
                                                                        <div className="space-y-1">
                                                                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                                                <span>Score</span>
                                                                                <span>{pct.toFixed(1)}%</span>
                                                                            </div>
                                                                            <Progress value={pct} />
                                                                        </div>
                                                                    ) : null}
                                                                </CardHeader>

                                                                <CardContent className="space-y-3">
                                                                    {preview.student.includeAnswers ? (
                                                                        <Accordion type="single" collapsible className="w-full">
                                                                            <AccordionItem value="answers" className="rounded-lg border px-2">
                                                                                <AccordionTrigger className="px-3">Answers</AccordionTrigger>
                                                                                <AccordionContent className="px-3 pb-3">
                                                                                    <AnswerList answers={r.answers} labelMap={labelMap} />
                                                                                </AccordionContent>
                                                                            </AccordionItem>
                                                                        </Accordion>
                                                                    ) : (
                                                                        <div className="text-sm text-muted-foreground">Answers are hidden by preview options.</div>
                                                                    )}
                                                                </CardContent>
                                                            </Card>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </TabsContent>
                                </Tabs>
                            )}
                        </ScrollArea>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

function ScoreDetails(props: { scores: PanelistScorePreviewItem[] }) {
    const grouped = React.useMemo(() => {
        const map = new Map<string, { targetLabel: string; items: PanelistScorePreviewItem[] }>()
        for (const s of props.scores) {
            const key = `${s.target_type}:${s.target_id}`
            const targetLabel = `${s.target_type === "group" ? "Group" : "Student"}: ${safeName(s.target_name, shortId(s.target_id))}`
            const ex = map.get(key)
            if (!ex) map.set(key, { targetLabel, items: [s] })
            else ex.items.push(s)
        }
        // stable ordering: group first, then by name
        return Array.from(map.values()).sort((a, b) => a.targetLabel.toLowerCase().localeCompare(b.targetLabel.toLowerCase()))
    }, [props.scores])

    return (
        <div className="space-y-3">
            {grouped.map((g) => (
                <div key={g.targetLabel} className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-sm font-semibold whitespace-normal wrap-break-word">{g.targetLabel}</div>
                    <div className="mt-2 rounded-md border bg-background">
                        <div className="grid grid-cols-12 gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                            <div className="col-span-6">Criterion</div>
                            <div className="col-span-2 text-right">Score</div>
                            <div className="col-span-2 text-right">Max</div>
                            <div className="col-span-2 text-right">Weight</div>
                        </div>

                        <div className="max-h-80 overflow-auto">
                            {g.items.map((s) => (
                                <div key={s.id} className="grid grid-cols-12 gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                                    <div className="col-span-6 min-w-0 space-y-1">
                                        <div className="font-medium whitespace-normal wrap-break-word leading-snug">
                                            {safeName(s.criterion, `Criterion ${shortId(s.criterion_id)}`)}
                                        </div>
                                        {s.criterion_description ? (
                                            <div className="text-xs text-muted-foreground whitespace-pre-wrap wrap-break-word">
                                                {s.criterion_description}
                                            </div>
                                        ) : null}
                                        {s.comment ? (
                                            <div className="rounded-md border bg-muted/20 p-2 text-xs max-h-40 overflow-auto whitespace-pre-wrap wrap-break-word">
                                                <span className="font-medium">Comment:</span> {s.comment}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="col-span-2 text-right font-semibold">{s.score}</div>
                                    <div className="col-span-2 text-right text-muted-foreground">{s.max_score ?? "—"}</div>
                                    <div className="col-span-2 text-right text-muted-foreground">{toNumber(s.weight) ?? "—"}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

function AnswerList(props: { answers: JsonObject; labelMap: Map<string, { label: string; section?: string }> | null }) {
    const entries = React.useMemo(() => {
        const keys = Object.keys(props.answers ?? {})
        keys.sort((a, b) => a.localeCompare(b))
        return keys.map((k) => [k, (props.answers as any)[k] as JsonValue] as const)
    }, [props.answers])

    if (entries.length === 0) {
        return <div className="text-sm text-muted-foreground">No answers yet.</div>
    }

    return (
        <div className="space-y-3">
            {entries.map(([key, value]) => {
                const meta = props.labelMap?.get(key) ?? null
                const label = meta?.label ?? key
                const section = meta?.section

                return (
                    <div key={key} className="rounded-lg border bg-background p-3">
                        {/* Vertical header to avoid truncation/overflow */}
                        <div className="space-y-2">
                            <div className="space-y-1">
                                <div className="text-sm font-semibold leading-snug whitespace-normal wrap-break-word">
                                    {label}
                                </div>
                                {section ? (
                                    <div className="text-xs text-muted-foreground leading-snug whitespace-normal wrap-break-word">
                                        {section}
                                    </div>
                                ) : null}
                            </div>

                            {/* Key shown but scrollable if long */}
                            <div className="max-w-full overflow-auto">
                                <Badge variant="outline" className="font-normal whitespace-nowrap">
                                    {key}
                                </Badge>
                            </div>
                        </div>

                        {/* Answer always fully accessible (scrolls if very long) */}
                        <div className="mt-3 max-h-96 overflow-auto rounded-md border bg-muted/20 p-3 text-sm">
                            {renderJsonValue(value)}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function AssignSheet(props: {
    schedule: AdminDefenseScheduleView
    getPreview: () => AdminEvaluationPreview | null
    ensurePreview: () => void
    ensurePanelists: () => void
    ensureStudents: () => void
    getPanelists: () => PickUser[]
    getStudents: () => PickUser[]
    onPreviewUpdated: (p: AdminEvaluationPreview) => void
    previewOptions: { includeStudentAnswers: boolean; includePanelistScores: boolean; includePanelistComments: boolean }
}) {
    const { schedule } = props

    const [open, setOpen] = React.useState(false)

    // Panelist assignment inputs
    const [assignAllPanelists, setAssignAllPanelists] = React.useState(true)
    const [selectedPanelistIds, setSelectedPanelistIds] = React.useState<UUID[]>([])

    // Student assignment inputs
    const [assignAllStudents, setAssignAllStudents] = React.useState(true)
    const [selectedStudentIds, setSelectedStudentIds] = React.useState<UUID[]>([])
    const [overwritePending, setOverwritePending] = React.useState(false)
    const [forceActiveForm, setForceActiveForm] = React.useState(false)

    const [busy, setBusy] = React.useState(false)

    const preview = props.getPreview()
    const panelistAssigned = preview?.panelist?.items ?? []
    const studentAssigned = preview?.student?.items ?? []

    const panelists = props.getPanelists()
    const students = props.getStudents()

    React.useEffect(() => {
        if (!open) return
        props.ensurePreview()
        props.ensurePanelists()
        props.ensureStudents()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const { includeStudentAnswers, includePanelistScores, includePanelistComments } = props.previewOptions
    const reloadPreview = React.useCallback(async () => {
        const scheduleId = schedule.id
        const data = await apiJsonFirst<any>(
            [
                `/api/admin/evaluation-previews/schedule/${scheduleId}?includeStudentAnswers=${includeStudentAnswers}&includePanelistScores=${includePanelistScores}&includePanelistComments=${includePanelistComments}`,
                `/api/admin/evaluation-previews/${scheduleId}?includeStudentAnswers=${includeStudentAnswers}&includePanelistScores=${includePanelistScores}&includePanelistComments=${includePanelistComments}`,
            ],
            { method: "GET" }
        )
        const p = (data?.preview ?? data?.item ?? data) as AdminEvaluationPreview
        props.onPreviewUpdated(p)
    }, [schedule.id, includeStudentAnswers, includePanelistScores, includePanelistComments, props])

    const assignPanelists = async () => {
        setBusy(true)
        const tId = toast.loading("Assigning panelist evaluations…")
        try {
            const targetIds = assignAllPanelists ? panelists.map((p) => p.id) : selectedPanelistIds
            if (targetIds.length === 0) {
                toast.error("Select at least one panelist.", { id: tId })
                setBusy(false)
                return
            }

            // Best-effort: create/upsert one-by-one for compatibility
            const results = await Promise.allSettled(
                targetIds.map((evaluatorId) =>
                    apiJson<any>("/api/evaluations", {
                        method: "POST",
                        body: JSON.stringify({
                            schedule_id: schedule.id,
                            evaluator_id: evaluatorId,
                        }),
                    })
                )
            )

            const ok = results.filter((r) => r.status === "fulfilled").length
            const fail = results.length - ok

            await reloadPreview()

            if (fail === 0) toast.success(`Assigned ${ok} panelist evaluation(s).`, { id: tId })
            else toast.success(`Assigned ${ok} panelist evaluation(s) • ${fail} failed (possibly already assigned).`, { id: tId })
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to assign panelist evaluations.", { id: tId })
        } finally {
            setBusy(false)
        }
    }

    const deletePanelistEvaluation = async (evaluationId: UUID) => {
        setBusy(true)
        const tId = toast.loading("Removing evaluation…")
        try {
            await apiJson<any>(`/api/evaluations/${evaluationId}`, { method: "DELETE" })
            await reloadPreview()
            toast.success("Evaluation removed.", { id: tId })
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to remove evaluation.", { id: tId })
        } finally {
            setBusy(false)
        }
    }

    const assignStudents = async () => {
        setBusy(true)
        const tId = toast.loading("Assigning student feedback…")
        try {
            const targetIds = assignAllStudents ? [] : selectedStudentIds
            if (!assignAllStudents && targetIds.length === 0) {
                toast.error("Select at least one student.", { id: tId })
                setBusy(false)
                return
            }

            // Get seedAnswersTemplate (best UX: consistent seeded payload)
            let seedAnswersTemplate: JsonObject | null = null
            try {
                const schemaData = await apiJsonFirst<any>(
                    ["/api/admin/student-feedback/schema", "/api/admin/student_feedback/schema"],
                    { method: "GET" }
                )
                seedAnswersTemplate = (schemaData?.seedAnswersTemplate ?? null) as JsonObject | null
            } catch {
                seedAnswersTemplate = null
            }

            await apiJson<any>(`/api/admin/student-feedback/schedule/${schedule.id}/assign`, {
                method: "POST",
                body: JSON.stringify({
                    studentIds: targetIds.length > 0 ? targetIds : undefined,
                    overwritePending,
                    useActiveForm: true,
                    forceActiveForm,
                    ...(seedAnswersTemplate ? { seedAnswers: seedAnswersTemplate } : {}),
                }),
            })

            await reloadPreview()
            toast.success("Student feedback assigned.", { id: tId })
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to assign student feedback.", { id: tId })
        } finally {
            setBusy(false)
        }
    }

    const groupTitle = safeName(schedule.group_title, `Group ${shortId(schedule.group_id)}`)

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button type="button" className="w-full sm:w-auto">
                    <Users className="mr-2 h-4 w-4" />
                    Assign
                </Button>
            </SheetTrigger>

            <SheetContent className="w-full sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle className="truncate">Assign Evaluations</SheetTitle>

                    {/* SheetDescription renders a <p>, so avoid <div> inside it to prevent hydration errors */}
                    <SheetDescription className="flex flex-col gap-1">
                        <span className="truncate">
                            <span className="font-medium text-foreground">{groupTitle}</span>
                        </span>
                        <span className="text-xs">
                            {fmtDateTime(schedule.scheduled_at)}
                            {schedule.room ? ` • ${schedule.room}` : ""} •{" "}
                            <span className="capitalize">{String(schedule.status)}</span>
                        </span>
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-5 space-y-4">
                    <Tabs defaultValue="panelist" className="w-full">
                        <TabsList className="w-full">
                            <TabsTrigger value="panelist" className="flex-1">
                                Panelists
                            </TabsTrigger>
                            <TabsTrigger value="student" className="flex-1">
                                Students
                            </TabsTrigger>
                        </TabsList>

                        {/* PANELISTS */}
                        <TabsContent value="panelist" className="space-y-4">
                            <Card>
                                <CardHeader className="space-y-1">
                                    <CardTitle className="text-sm">Assign panelist evaluations</CardTitle>
                                    <CardDescription>
                                        Panelists evaluate the <span className="font-medium">group</span> and{" "}
                                        <span className="font-medium">students</span> using the active rubric template.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="rounded-lg border p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium">Assignment mode</div>
                                                <div className="text-xs text-muted-foreground">
                                                    Choose all schedule panelists or specific panelists.
                                                </div>
                                            </div>
                                            <Switch checked={assignAllPanelists} onCheckedChange={setAssignAllPanelists} />
                                        </div>

                                        <div className="mt-2 text-xs text-muted-foreground">
                                            {assignAllPanelists ? "Assign to all panelists on this schedule." : "Assign to selected panelists only."}
                                        </div>

                                        {!assignAllPanelists ? (
                                            <div className="mt-3">
                                                <MultiSelectUsers
                                                    label="Select panelists"
                                                    placeholder="Choose panelists…"
                                                    items={panelists}
                                                    selectedIds={selectedPanelistIds}
                                                    onChange={setSelectedPanelistIds}
                                                    disabled={busy}
                                                />
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                        <Button type="button" onClick={assignPanelists} disabled={busy}>
                                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                                            Assign panelists
                                        </Button>
                                    </div>

                                    <Separator />

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="text-sm font-medium">Assigned panelist evaluations</div>
                                            <Badge variant="outline" className="font-normal">
                                                {panelistAssigned.length}
                                            </Badge>
                                        </div>

                                        {panelistAssigned.length === 0 ? (
                                            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                                                No panelist evaluations assigned yet.
                                            </div>
                                        ) : (
                                            <ScrollArea className="h-72 rounded-lg border">
                                                <div className="space-y-2 p-2">
                                                    {panelistAssigned.map((p) => {
                                                        const name = safeName(p.evaluation.evaluator_name, `Panelist ${shortId(p.evaluation.evaluator_id)}`)
                                                        const status = String(p.evaluation.status ?? "pending")
                                                        const pct = computePercent(p.overall?.overall_percentage)
                                                        return (
                                                            <div
                                                                key={p.evaluation.id}
                                                                className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3"
                                                            >
                                                                <div className="min-w-0">
                                                                    <div className="truncate text-sm font-semibold">{name}</div>
                                                                    <div className="truncate text-xs text-muted-foreground">
                                                                        {p.evaluation.evaluator_email ?? shortId(p.evaluation.evaluator_id)}
                                                                    </div>
                                                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                                                        <Badge variant={statusBadgeVariant(status)} className="capitalize">
                                                                            {status}
                                                                        </Badge>
                                                                        {pct !== null ? (
                                                                            <Badge variant="secondary" className="font-normal">
                                                                                {pct.toFixed(1)}%
                                                                            </Badge>
                                                                        ) : (
                                                                            <Badge variant="outline" className="font-normal">
                                                                                —
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button type="button" variant="outline" size="sm" disabled={busy}>
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitleUI>Remove this evaluation assignment?</AlertDialogTitleUI>
                                                                            <AlertDialogDesc>
                                                                                This will delete the panelist evaluation assignment. Scores already entered may also be removed depending on your backend rules.
                                                                            </AlertDialogDesc>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                            <AlertDialogAction
                                                                                onClick={() => void deletePanelistEvaluation(p.evaluation.id)}
                                                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                            >
                                                                                Remove
                                                                            </AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </ScrollArea>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* STUDENTS */}
                        <TabsContent value="student" className="space-y-4">
                            <Card>
                                <CardHeader className="space-y-1">
                                    <CardTitle className="text-sm">Assign student feedback</CardTitle>
                                    <CardDescription>
                                        Students answer the pinned feedback form and may produce a computed score summary (based on form weights).
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-3 rounded-lg border p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium">Assignment mode</div>
                                                <div className="text-xs text-muted-foreground">
                                                    Assign to all students in the thesis group or choose specific students.
                                                </div>
                                            </div>
                                            <Switch checked={assignAllStudents} onCheckedChange={setAssignAllStudents} />
                                        </div>

                                        {!assignAllStudents ? (
                                            <MultiSelectUsers
                                                label="Select students"
                                                placeholder="Choose students…"
                                                items={students}
                                                selectedIds={selectedStudentIds}
                                                onChange={setSelectedStudentIds}
                                                disabled={busy}
                                            />
                                        ) : (
                                            <div className="text-xs text-muted-foreground">
                                                Assigning to <span className="font-medium text-foreground">all group students</span> (based on group membership).
                                            </div>
                                        )}

                                        <Separator />

                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium">Overwrite pending evaluations</div>
                                                <div className="text-xs text-muted-foreground">
                                                    If enabled, existing <span className="font-medium">pending</span> evaluations will be reset (fresh seed answers).
                                                </div>
                                            </div>
                                            <Switch checked={overwritePending} onCheckedChange={setOverwritePending} />
                                        </div>

                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium">Force active form</div>
                                                <div className="text-xs text-muted-foreground">
                                                    If the schedule already has submitted/locked evaluations, forcing may fail (data consistency).
                                                </div>
                                            </div>
                                            <Switch checked={forceActiveForm} onCheckedChange={setForceActiveForm} />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                        <Button type="button" onClick={assignStudents} disabled={busy}>
                                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GraduationCap className="mr-2 h-4 w-4" />}
                                            Assign students
                                        </Button>
                                    </div>

                                    <Separator />

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="text-sm font-medium">Assigned student feedback</div>
                                            <Badge variant="outline" className="font-normal">
                                                {studentAssigned.length}
                                            </Badge>
                                        </div>

                                        {studentAssigned.length === 0 ? (
                                            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                                                No student feedback assigned yet.
                                            </div>
                                        ) : (
                                            <ScrollArea className="h-72 rounded-lg border">
                                                <div className="space-y-2 p-2">
                                                    {studentAssigned.map((s) => {
                                                        const name = safeName(s.student_name, `Student ${shortId(s.student_id)}`)
                                                        const pct = computePercent(s.percentage)
                                                        return (
                                                            <div key={s.student_evaluation_id} className="rounded-lg border bg-background p-3">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div className="min-w-0">
                                                                        <div className="truncate text-sm font-semibold">{name}</div>
                                                                        <div className="truncate text-xs text-muted-foreground">
                                                                            {s.student_email ?? shortId(s.student_id)}
                                                                        </div>
                                                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                                                            <Badge variant={statusBadgeVariant(s.status)} className="capitalize">
                                                                                {s.status}
                                                                            </Badge>
                                                                            {pct !== null ? (
                                                                                <Badge variant="secondary" className="font-normal">
                                                                                    {pct.toFixed(1)}%
                                                                                </Badge>
                                                                            ) : (
                                                                                <Badge variant="outline" className="font-normal">
                                                                                    —
                                                                                </Badge>
                                                                            )}
                                                                            <Badge variant="outline" className="font-normal">
                                                                                {safeName(s.form_title, "Pinned form")}
                                                                                {typeof s.form_version === "number" ? ` v${s.form_version}` : ""}
                                                                            </Badge>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </ScrollArea>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>

                    <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                        <div className="font-medium text-foreground">Notes</div>
                        <ul className="mt-2 list-disc space-y-1 pl-4">
                            <li>
                                <span className="font-medium">Panelist evaluations</span> are created via <code>/api/evaluations</code> and are separate from student evaluations.
                            </li>
                            <li>
                                <span className="font-medium">Student feedback</span> is assigned via{" "}
                                <code>/api/admin/student-feedback/schedule/:scheduleId/assign</code>.
                            </li>
                        </ul>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
