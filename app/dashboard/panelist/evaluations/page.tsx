"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type EvaluationStatus = "pending" | "submitted" | "locked" | (string & {})

type EvaluationItem = {
    id: string
    schedule_id: string
    evaluator_id: string
    status: EvaluationStatus
    submitted_at: string | null
    locked_at: string | null
    created_at: string | null
}

type DefenseScheduleOption = {
    id: string
    group_id: string
    group_title: string | null
    scheduled_at: string | null
    room: string | null
    status: string
}

type UserOption = {
    id: string
    name: string | null
    email: string | null
    role: string
}

type UserProfile = {
    id: string
    name: string | null
}

type CriterionOption = {
    id: string
    name: string
    description: string | null
    weight: number
    min_score: number
    max_score: number
    template_id: string | null
}

type EvaluationScorePreviewRow = {
    id: string | null
    criterion_id: string
    criterion_name: string | null
    score: number | null
    comment: string | null
    subject_type: "group" | "student"
    subject_id: string | null
    created_at: string | null
    updated_at: string | null
}

type DisplayScorePreviewRow = EvaluationScorePreviewRow & {
    criterionLabel: string
    targetLabel: string
}

type ScoreTargetSummary = {
    key: string
    label: string
    subject_type: "group" | "student"
    scored: number
    total: number
    average: number
    withComments: number
}

type DisplayEvaluationItem = EvaluationItem & {
    evaluationName: string
    scheduleName: string
    scheduleMeta: string
    evaluatorName: string
    evaluatorRole: string | null
}

const STATUS_FILTERS = ["all", "pending", "submitted", "locked"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const EVALUATIONS_ENDPOINT = "/api/panelist/evaluations"
const CURRENT_USER_ENDPOINTS = ["/api/users/me", "/api/auth/me", "/api/me"] as const
const USERS_ENDPOINTS = ["/api/users"] as const
const SCHEDULES_ENDPOINTS = ["/api/defense-schedules"] as const
const CRITERIA_ENDPOINTS = [
    "/api/rubric-criteria",
    "/api/criteria",
    "/api/rubric-template-criteria",
] as const

const PANELIST_SCORE_ENDPOINT_BUILDERS = [
    (evaluationId: string) => `/api/panelist/evaluations/${encodeURIComponent(evaluationId)}/scores`,
    (evaluationId: string) => `/api/panelist/${encodeURIComponent(evaluationId)}/scores`,
] as const

const EVALUATION_SCORES_ENDPOINT = "/api/evaluation-scores"

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function isMissingOrUnsupported(status: number): boolean {
    return status === 404 || status === 405
}

function toStringSafe(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function toNullableString(value: unknown): string | null {
    if (value === null || value === undefined) return null
    return toStringSafe(value)
}

function toNumberOrNull(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}

function toTitleCase(value: string): string {
    if (!value) return value
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDateTime(value: string | null): string {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function toEpoch(value: string | null): number {
    if (!value) return 0
    const d = new Date(value)
    const ms = d.getTime()
    return Number.isNaN(ms) ? 0 : ms
}

function compact(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function toLowerKey(value: string): string {
    return value.trim().toLowerCase()
}

function statusVariant(status: string): "secondary" | "outline" | "default" | "destructive" {
    const normalized = status.toLowerCase()
    if (normalized === "submitted") return "default"
    if (normalized === "locked") return "destructive"
    if (normalized === "pending") return "secondary"
    return "outline"
}

function normalizeEvaluation(raw: unknown): EvaluationItem | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    if (!id) return null

    const scheduleId = toStringSafe(raw.schedule_id ?? raw.scheduleId)
    const evaluatorId = toStringSafe(raw.evaluator_id ?? raw.evaluatorId)
    if (!scheduleId || !evaluatorId) return null

    const status = (toStringSafe(raw.status) ?? "pending") as EvaluationStatus

    return {
        id,
        schedule_id: scheduleId,
        evaluator_id: evaluatorId,
        status,
        submitted_at: toNullableString(raw.submitted_at ?? raw.submittedAt),
        locked_at: toNullableString(raw.locked_at ?? raw.lockedAt),
        created_at: toNullableString(raw.created_at ?? raw.createdAt),
    }
}

function normalizeSchedule(raw: unknown): DefenseScheduleOption | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    const groupId = toStringSafe(raw.group_id ?? raw.groupId)
    if (!id || !groupId) return null

    return {
        id,
        group_id: groupId,
        group_title:
            toNullableString(raw.group_title ?? raw.groupTitle) ??
            toNullableString(raw.title ?? raw.group_name ?? raw.groupName),
        scheduled_at: toNullableString(raw.scheduled_at ?? raw.scheduledAt),
        room: toNullableString(raw.room),
        status: toStringSafe(raw.status) ?? "scheduled",
    }
}

function normalizeUser(raw: unknown): UserOption | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    if (!id) return null

    return {
        id,
        name: toNullableString(raw.name),
        email: toNullableString(raw.email),
        role: toStringSafe(raw.role) ?? "panelist",
    }
}

function normalizeCriterion(raw: unknown): CriterionOption | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    if (!id) return null

    const name =
        toStringSafe(
            raw.criterion ??
            raw.name ??
            raw.title ??
            raw.criterion_name ??
            raw.criterionName,
        ) ?? null

    if (!name) return null

    const weight = toNumberOrNull(raw.weight) ?? 0
    const minScoreRaw = toNumberOrNull(raw.min_score ?? raw.minScore) ?? 0
    const maxScoreRaw = toNumberOrNull(raw.max_score ?? raw.maxScore) ?? 3

    const minScore = Math.floor(minScoreRaw)
    const maxScore = Math.floor(maxScoreRaw < minScore ? minScore : maxScoreRaw)

    return {
        id,
        name,
        description: toNullableString(raw.description),
        weight,
        min_score: minScore,
        max_score: maxScore,
        template_id: toNullableString(raw.template_id ?? raw.templateId),
    }
}

function normalizeSubjectType(value: unknown): "group" | "student" {
    const raw = toStringSafe(value)?.toLowerCase()
    if (raw === "student" || raw === "individual") return "student"
    return "group"
}

function normalizeScorePreviewRow(raw: unknown): EvaluationScorePreviewRow | null {
    if (!isRecord(raw)) return null

    const criterionId = toStringSafe(raw.criterion_id ?? raw.criterionId)
    if (!criterionId) return null

    const criterionName =
        toNullableString(raw.criterion_name ?? raw.criterionName) ??
        toNullableString(raw.criterion ?? raw.name ?? raw.title)

    const derivedSubjectType =
        raw.student_id !== undefined && raw.student_id !== null
            ? "student"
            : raw.group_id !== undefined && raw.group_id !== null
                ? "group"
                : normalizeSubjectType(
                    raw.subject_type ??
                    raw.subjectType ??
                    raw.target_type ??
                    raw.targetType,
                )

    const subjectId =
        toNullableString(
            raw.subject_id ??
            raw.subjectId ??
            raw.target_id ??
            raw.targetId ??
            raw.student_id ??
            raw.studentId ??
            raw.group_id ??
            raw.groupId,
        ) ?? null

    return {
        id: toStringSafe(raw.id),
        criterion_id: criterionId,
        criterion_name: criterionName,
        score: toNumberOrNull(raw.score),
        comment: toNullableString(raw.comment),
        subject_type: derivedSubjectType,
        subject_id: subjectId,
        created_at: toNullableString(raw.created_at ?? raw.createdAt),
        updated_at: toNullableString(raw.updated_at ?? raw.updatedAt),
    }
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data

    if (isRecord(payload.data) && Array.isArray(payload.data.items)) {
        return payload.data.items
    }

    if (isRecord(payload.result) && Array.isArray(payload.result.items)) {
        return payload.result.items
    }

    return []
}

function extractItemPayload(payload: unknown): unknown | null {
    if (isRecord(payload) && payload.item !== undefined) return payload.item
    if (isRecord(payload) && payload.data !== undefined) return payload.data
    if (isRecord(payload) && isRecord(payload.result) && payload.result.item !== undefined) {
        return payload.result.item
    }
    return isRecord(payload) ? payload : null
}

function extractObjectPayload(payload: unknown): Record<string, unknown> | null {
    if (!isRecord(payload)) return null

    if (isRecord(payload.user)) return payload.user
    if (isRecord(payload.item)) return payload.item

    if (isRecord(payload.data)) {
        if (isRecord(payload.data.user)) return payload.data.user
        return payload.data
    }

    return payload
}

function isStatusFilter(value: string): value is StatusFilter {
    return (STATUS_FILTERS as readonly string[]).includes(value)
}

async function readErrorMessage(res: Response, payload: unknown): Promise<string> {
    if (isRecord(payload)) {
        const error = toStringSafe(payload.error)
        if (error) return error

        const message = toStringSafe(payload.message)
        if (message) return message
    }

    return `Request failed (${res.status})`
}

async function fetchFirstSuccessfulObject(endpointList: readonly string[]): Promise<Record<string, unknown> | null> {
    for (const endpoint of endpointList) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            const payload = (await res.json().catch(() => null)) as unknown
            if (!res.ok) continue

            const extracted = extractObjectPayload(payload)
            if (extracted) return extracted
        } catch {
            // try next endpoint
        }
    }

    return null
}

async function fetchFirstSuccessfulArray(endpointList: readonly string[]): Promise<unknown[]> {
    for (const endpoint of endpointList) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            const payload = (await res.json().catch(() => null)) as unknown
            if (!res.ok) continue

            return extractArrayPayload(payload)
        } catch {
            // try next endpoint
        }
    }

    return []
}

async function fetchPanelistScoresForEvaluation(evaluationId: string): Promise<EvaluationScorePreviewRow[]> {
    if (!evaluationId) return []

    const endpoints = PANELIST_SCORE_ENDPOINT_BUILDERS.map((build) => build(evaluationId))

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            const payload = (await res.json().catch(() => null)) as unknown

            if (!res.ok) {
                if (isMissingOrUnsupported(res.status)) continue
                continue
            }

            return extractArrayPayload(payload)
                .map(normalizeScorePreviewRow)
                .filter((row): row is EvaluationScorePreviewRow => row !== null)
        } catch {
            // try next endpoint
        }
    }

    // generic fallback
    try {
        const query = new URLSearchParams({
            evaluation_id: evaluationId,
            limit: "5000",
        })

        const res = await fetch(`${EVALUATION_SCORES_ENDPOINT}?${query.toString()}`, {
            cache: "no-store",
        })
        const payload = (await res.json().catch(() => null)) as unknown
        if (!res.ok) return []

        return extractArrayPayload(payload)
            .map(normalizeScorePreviewRow)
            .filter((row): row is EvaluationScorePreviewRow => row !== null)
    } catch {
        return []
    }
}

async function resolveCurrentUserProfile(): Promise<UserProfile | null> {
    const source = await fetchFirstSuccessfulObject(CURRENT_USER_ENDPOINTS)
    if (!source) return null

    const id = toStringSafe(source.id ?? source.user_id ?? source.userId)
    if (!id) return null

    return {
        id,
        name: toNullableString(source.name),
    }
}

export default function PanelistEvaluationsPage() {
    const [items, setItems] = React.useState<EvaluationItem[]>([])
    const [schedules, setSchedules] = React.useState<DefenseScheduleOption[]>([])
    const [users, setUsers] = React.useState<UserOption[]>([])
    const [criteria, setCriteria] = React.useState<CriterionOption[]>([])
    const [currentUser, setCurrentUser] = React.useState<UserProfile | null>(null)

    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")

    // Score preview states
    const [previewOpenId, setPreviewOpenId] = React.useState<string | null>(null)
    const [previewRows, setPreviewRows] = React.useState<EvaluationScorePreviewRow[]>([])
    const [previewLoading, setPreviewLoading] = React.useState(false)
    const [previewError, setPreviewError] = React.useState<string | null>(null)
    const previewCacheRef = React.useRef<Record<string, EvaluationScorePreviewRow[]>>({})

    const loadEvaluations = React.useCallback(
        async (options?: { showSuccessToast?: boolean; showErrorToast?: boolean }) => {
            const { showSuccessToast = false, showErrorToast = true } = options ?? {}

            setLoading(true)
            setError(null)

            try {
                const me = await resolveCurrentUserProfile()
                setCurrentUser(me)

                const evalRes = await fetch(EVALUATIONS_ENDPOINT, { cache: "no-store" })
                const evalPayload = (await evalRes.json().catch(() => null)) as unknown

                if (!evalRes.ok) {
                    throw new Error(await readErrorMessage(evalRes, evalPayload))
                }

                let parsedItems = extractArrayPayload(evalPayload)
                    .map(normalizeEvaluation)
                    .filter((item): item is EvaluationItem => item !== null)

                // Extra client-side guard: if we can resolve current user, only keep assigned records.
                if (me?.id) {
                    const meId = me.id.toLowerCase()
                    parsedItems = parsedItems.filter(
                        (item) => item.evaluator_id.toLowerCase() === meId,
                    )
                }

                const [scheduleRows, userRows, criterionRows] = await Promise.all([
                    fetchFirstSuccessfulArray(SCHEDULES_ENDPOINTS),
                    fetchFirstSuccessfulArray(USERS_ENDPOINTS),
                    fetchFirstSuccessfulArray(CRITERIA_ENDPOINTS),
                ])

                setItems(parsedItems)
                setSchedules(
                    scheduleRows
                        .map(normalizeSchedule)
                        .filter((item): item is DefenseScheduleOption => item !== null),
                )
                setUsers(
                    userRows.map(normalizeUser).filter((item): item is UserOption => item !== null),
                )
                setCriteria(
                    criterionRows
                        .map(normalizeCriterion)
                        .filter((item): item is CriterionOption => item !== null),
                )

                // Invalidate preview cache after list refresh to avoid stale score previews.
                previewCacheRef.current = {}

                if (showSuccessToast) {
                    toast.success("Evaluations refreshed")
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unable to load evaluations."
                setError(message)

                if (showErrorToast) {
                    toast.error("Unable to load evaluations", { description: message })
                }
            } finally {
                setLoading(false)
            }
        },
        [],
    )

    const loadScorePreview = React.useCallback(
        async (
            evaluationId: string,
            options?: { force?: boolean; showSuccessToast?: boolean; showErrorToast?: boolean },
        ) => {
            const { force = false, showSuccessToast = false, showErrorToast = true } = options ?? {}
            if (!evaluationId) return

            const cacheKey = evaluationId.toLowerCase()

            if (!force && previewCacheRef.current[cacheKey]) {
                setPreviewRows(previewCacheRef.current[cacheKey])
                setPreviewError(null)
                setPreviewLoading(false)
                return
            }

            setPreviewLoading(true)
            setPreviewError(null)

            try {
                const rows = await fetchPanelistScoresForEvaluation(evaluationId)
                previewCacheRef.current[cacheKey] = rows
                setPreviewRows(rows)

                if (showSuccessToast) {
                    toast.success("Score preview refreshed")
                }
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Unable to load score preview."
                setPreviewRows([])
                setPreviewError(message)

                if (showErrorToast) {
                    toast.error("Unable to load score preview", { description: message })
                }
            } finally {
                setPreviewLoading(false)
            }
        },
        [],
    )

    React.useEffect(() => {
        void loadEvaluations({ showErrorToast: false })
    }, [loadEvaluations])

    const scheduleById = React.useMemo(() => {
        const map = new Map<string, DefenseScheduleOption>()
        for (const item of schedules) {
            map.set(item.id.toLowerCase(), item)
        }
        return map
    }, [schedules])

    const userById = React.useMemo(() => {
        const map = new Map<string, UserOption>()
        for (const item of users) {
            map.set(item.id.toLowerCase(), item)
        }
        return map
    }, [users])

    const criterionById = React.useMemo(() => {
        const map = new Map<string, CriterionOption>()
        for (const item of criteria) {
            map.set(toLowerKey(item.id), item)
        }
        return map
    }, [criteria])

    const scopedItems = React.useMemo(() => {
        if (!currentUser?.id) return items
        const meId = currentUser.id.toLowerCase()
        return items.filter((item) => item.evaluator_id.toLowerCase() === meId)
    }, [currentUser?.id, items])

    const displayItems = React.useMemo<DisplayEvaluationItem[]>(() => {
        return scopedItems.map((item) => {
            const schedule = scheduleById.get(item.schedule_id.toLowerCase()) ?? null
            const evaluator = userById.get(item.evaluator_id.toLowerCase()) ?? null

            const scheduleName = compact(schedule?.group_title) ?? "Defense Schedule"

            const scheduleDate = formatDateTime(schedule?.scheduled_at ?? null)
            const scheduleRoom = compact(schedule?.room)
            const scheduleStatus = schedule?.status ? toTitleCase(schedule.status) : null

            const scheduleMetaParts = [scheduleDate, scheduleRoom, scheduleStatus].filter(
                (part): part is string => !!part,
            )
            const scheduleMeta = scheduleMetaParts.length > 0 ? scheduleMetaParts.join(" • ") : "—"

            const currentUserName =
                currentUser && currentUser.id.toLowerCase() === item.evaluator_id.toLowerCase()
                    ? compact(currentUser.name)
                    : null

            const evaluatorName =
                compact(evaluator?.name) ??
                compact(evaluator?.email) ??
                currentUserName ??
                "Assigned Panelist"

            return {
                ...item,
                evaluationName: `Evaluation for ${scheduleName}`,
                scheduleName,
                scheduleMeta,
                evaluatorName,
                evaluatorRole: evaluator ? toTitleCase(evaluator.role) : null,
            }
        })
    }, [currentUser, scheduleById, scopedItems, userById])

    const filteredItems = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return [...displayItems]
            .filter((item) => {
                if (statusFilter !== "all" && item.status.toLowerCase() !== statusFilter) {
                    return false
                }

                if (!q) return true

                return (
                    item.evaluationName.toLowerCase().includes(q) ||
                    item.scheduleName.toLowerCase().includes(q) ||
                    item.evaluatorName.toLowerCase().includes(q) ||
                    item.scheduleMeta.toLowerCase().includes(q) ||
                    item.status.toLowerCase().includes(q)
                )
            })
            .sort((a, b) => toEpoch(b.created_at) - toEpoch(a.created_at))
    }, [displayItems, search, statusFilter])

    const totals = React.useMemo(() => {
        let pending = 0
        let submitted = 0
        let locked = 0

        for (const item of scopedItems) {
            const s = item.status.toLowerCase()
            if (s === "pending") pending += 1
            else if (s === "submitted") submitted += 1
            else if (s === "locked") locked += 1
        }

        return {
            all: scopedItems.length,
            pending,
            submitted,
            locked,
        }
    }, [scopedItems])

    const previewItem = React.useMemo(() => {
        if (!previewOpenId) return null
        return displayItems.find((item) => item.id === previewOpenId) ?? null
    }, [displayItems, previewOpenId])

    const previewSchedule = React.useMemo(() => {
        if (!previewItem) return null
        return scheduleById.get(toLowerKey(previewItem.schedule_id)) ?? null
    }, [previewItem, scheduleById])

    const previewScheduleLabel = React.useMemo(
        () => compact(previewSchedule?.group_title) ?? previewItem?.scheduleName ?? "Defense Schedule",
        [previewItem?.scheduleName, previewSchedule?.group_title],
    )

    const previewScheduleMeta = React.useMemo(() => {
        if (!previewSchedule) return previewItem?.scheduleMeta ?? "—"

        const scheduleStatus = compact(previewSchedule.status)
        const parts = [
            formatDateTime(previewSchedule.scheduled_at),
            compact(previewSchedule.room),
            scheduleStatus ? toTitleCase(scheduleStatus) : null,
        ].filter((part): part is string => !!part && part !== "—")

        if (parts.length > 0) return parts.join(" • ")
        return previewItem?.scheduleMeta ?? "—"
    }, [previewItem?.scheduleMeta, previewSchedule])

    const previewDisplayRows = React.useMemo<DisplayScorePreviewRow[]>(() => {
        if (!previewItem) return []

        const canonicalGroupId = compact(previewSchedule?.group_id)
        const groupLabel = compact(previewSchedule?.group_title) ?? "Thesis Group"

        return [...previewRows]
            .map((row) => {
                const criterion =
                    criterionById.get(toLowerKey(row.criterion_id)) ?? null

                const criterionLabel =
                    compact(row.criterion_name) ??
                    compact(criterion?.name) ??
                    `Criterion ${row.criterion_id}`

                let targetLabel = "Unknown target"

                if (row.subject_type === "group") {
                    const subjectId = compact(row.subject_id)
                    const scheduleId = previewItem.schedule_id
                    const isCanonicalGroup =
                        !!subjectId &&
                        (
                            (!!canonicalGroupId &&
                                toLowerKey(subjectId) === toLowerKey(canonicalGroupId)) ||
                            toLowerKey(subjectId) === toLowerKey(scheduleId)
                        )

                    targetLabel = isCanonicalGroup
                        ? `Group • ${groupLabel}`
                        : `Group • ${subjectId ?? "Unknown"}`
                } else {
                    const subjectId = compact(row.subject_id)
                    const subjectUser = subjectId ? userById.get(toLowerKey(subjectId)) : null
                    const studentLabel =
                        compact(subjectUser?.name) ??
                        compact(subjectUser?.email) ??
                        (subjectId ? `ID ${subjectId}` : "Unknown")

                    targetLabel = `Student • ${studentLabel}`
                }

                return {
                    ...row,
                    criterionLabel,
                    targetLabel,
                }
            })
            .sort((a, b) => {
                const aType = a.subject_type === "group" ? 0 : 1
                const bType = b.subject_type === "group" ? 0 : 1
                if (aType !== bType) return aType - bType

                const byTarget = a.targetLabel.localeCompare(b.targetLabel)
                if (byTarget !== 0) return byTarget

                return a.criterionLabel.localeCompare(b.criterionLabel)
            })
    }, [criterionById, previewItem, previewRows, previewSchedule?.group_id, previewSchedule?.group_title, userById])

    const previewTargetSummaries = React.useMemo<ScoreTargetSummary[]>(() => {
        const map = new Map<string, { label: string; subject_type: "group" | "student"; scored: number; total: number; sum: number; withComments: number }>()

        for (const row of previewDisplayRows) {
            const key = `${row.subject_type}:${toLowerKey(row.subject_id ?? "unknown")}`
            const existing = map.get(key) ?? {
                label: row.targetLabel,
                subject_type: row.subject_type,
                scored: 0,
                total: 0,
                sum: 0,
                withComments: 0,
            }

            existing.total += 1

            if (row.score !== null) {
                existing.scored += 1
                existing.sum += row.score
            }

            if (compact(row.comment)) {
                existing.withComments += 1
            }

            map.set(key, existing)
        }

        return Array.from(map.entries())
            .map(([key, value]) => ({
                key,
                label: value.label,
                subject_type: value.subject_type,
                scored: value.scored,
                total: value.total,
                average: value.scored > 0 ? value.sum / value.scored : 0,
                withComments: value.withComments,
            }))
            .sort((a, b) => {
                const aType = a.subject_type === "group" ? 0 : 1
                const bType = b.subject_type === "group" ? 0 : 1
                if (aType !== bType) return aType - bType
                return a.label.localeCompare(b.label)
            })
    }, [previewDisplayRows])

    const previewStats = React.useMemo(() => {
        const totalRows = previewDisplayRows.length
        let scoredRows = 0
        let withComments = 0
        let scoreSum = 0

        for (const row of previewDisplayRows) {
            if (row.score !== null) {
                scoredRows += 1
                scoreSum += row.score
            }
            if (compact(row.comment)) {
                withComments += 1
            }
        }

        const averageScore = scoredRows > 0 ? scoreSum / scoredRows : 0
        const missingRows = Math.max(0, totalRows - scoredRows)

        return {
            totalRows,
            scoredRows,
            missingRows,
            withComments,
            averageScore,
            completionPercent: totalRows > 0 ? (scoredRows / totalRows) * 100 : 0,
        }
    }, [previewDisplayRows])

    const toggleScorePreview = React.useCallback(
        (evaluationId: string) => {
            if (previewOpenId === evaluationId) {
                setPreviewOpenId(null)
                setPreviewRows([])
                setPreviewError(null)
                setPreviewLoading(false)
                return
            }

            setPreviewOpenId(evaluationId)
            setPreviewRows([])
            setPreviewError(null)
            void loadScorePreview(evaluationId, { showErrorToast: true })
        },
        [loadScorePreview, previewOpenId],
    )

    const refreshOpenedPreview = React.useCallback(() => {
        if (!previewOpenId) return
        void loadScorePreview(previewOpenId, {
            force: true,
            showSuccessToast: true,
            showErrorToast: true,
        })
    }, [loadScorePreview, previewOpenId])

    return (
        <DashboardLayout
            title="Evaluations"
            description="View assigned evaluations, open detailed scoring, and preview saved scores instantly."
        >
            <div className="space-y-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Filter & Search</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {currentUser ? (
                            <Alert>
                                <AlertTitle>
                                    Signed in as {compact(currentUser.name) ?? "Panelist"}
                                </AlertTitle>
                                <AlertDescription>
                                    This page only shows evaluations assigned to your account.
                                </AlertDescription>
                            </Alert>
                        ) : null}

                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by schedule, evaluator name, or status"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />
                            <Button
                                variant="outline"
                                onClick={() => void loadEvaluations({ showSuccessToast: true })}
                                disabled={loading}
                            >
                                Refresh
                            </Button>
                        </div>

                        <Tabs
                            value={statusFilter}
                            onValueChange={(value) =>
                                setStatusFilter(isStatusFilter(value) ? value : "all")
                            }
                            className="w-full"
                        >
                            <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-4">
                                {STATUS_FILTERS.map((status) => (
                                    <TabsTrigger key={status} value={status}>
                                        {status === "all" ? "All" : toTitleCase(status)}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <Card>
                                <CardContent className="pt-4">
                                    <p className="text-xs text-muted-foreground">All</p>
                                    <p className="text-xl font-semibold">{totals.all}</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4">
                                    <p className="text-xs text-muted-foreground">Pending</p>
                                    <p className="text-xl font-semibold">{totals.pending}</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4">
                                    <p className="text-xs text-muted-foreground">Submitted</p>
                                    <p className="text-xl font-semibold">{totals.submitted}</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4">
                                    <p className="text-xs text-muted-foreground">Locked</p>
                                    <p className="text-xl font-semibold">{totals.locked}</p>
                                </CardContent>
                            </Card>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Showing{" "}
                            <span className="font-semibold text-foreground">{filteredItems.length}</span>{" "}
                            of <span className="font-semibold text-foreground">{totals.all}</span>{" "}
                            evaluation(s).
                        </p>
                    </CardContent>
                </Card>

                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>Unable to load evaluations</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                <Card className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-56">Evaluation</TableHead>
                                <TableHead className="min-w-72">Schedule</TableHead>
                                <TableHead className="min-w-56">Assigned Evaluator</TableHead>
                                <TableHead className="min-w-32">Status</TableHead>
                                <TableHead className="min-w-52">Submitted</TableHead>
                                <TableHead className="min-w-52">Locked</TableHead>
                                <TableHead className="min-w-44 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <TableRow key={`skeleton-${i}`}>
                                        <TableCell colSpan={7}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredItems.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                        No evaluations found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredItems.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">
                                            <div className="space-y-0.5">
                                                <p>{item.evaluationName}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {item.created_at
                                                        ? `Created ${formatDateTime(item.created_at)}`
                                                        : "Created date unavailable"}
                                                </p>
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            <div className="space-y-0.5">
                                                <p className="font-medium">{item.scheduleName}</p>
                                                <p className="text-xs text-muted-foreground">{item.scheduleMeta}</p>
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            <div className="space-y-0.5">
                                                <p className="font-medium">{item.evaluatorName}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {item.evaluatorRole ?? "Panelist"}
                                                </p>
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            <Badge variant={statusVariant(item.status)}>
                                                {toTitleCase(item.status)}
                                            </Badge>
                                        </TableCell>

                                        <TableCell className="text-muted-foreground">
                                            {formatDateTime(item.submitted_at)}
                                        </TableCell>

                                        <TableCell className="text-muted-foreground">
                                            {formatDateTime(item.locked_at)}
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant={previewOpenId === item.id ? "default" : "secondary"}
                                                    size="sm"
                                                    onClick={() => toggleScorePreview(item.id)}
                                                >
                                                    {previewOpenId === item.id ? "Hide Preview" : "Preview Scores"}
                                                </Button>

                                                <Button asChild variant="outline" size="sm">
                                                    <Link href={`/dashboard/panelist/evaluations/${item.id}`}>
                                                        Open
                                                    </Link>
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </Card>

                {previewOpenId ? (
                    <Card>
                        <CardHeader>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <CardTitle className="text-base">Score Preview</CardTitle>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {previewScheduleLabel}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{previewScheduleMeta}</p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    {previewItem ? (
                                        <Badge variant={statusVariant(previewItem.status)}>
                                            {toTitleCase(previewItem.status)}
                                        </Badge>
                                    ) : null}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={refreshOpenedPreview}
                                        disabled={previewLoading}
                                    >
                                        {previewLoading ? "Refreshing..." : "Refresh Preview"}
                                    </Button>
                                    {previewItem ? (
                                        <Button asChild variant="outline" size="sm">
                                            <Link href={`/dashboard/panelist/evaluations/${previewItem.id}`}>
                                                Open Full Evaluation
                                            </Link>
                                        </Button>
                                    ) : null}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setPreviewOpenId(null)
                                            setPreviewRows([])
                                            setPreviewError(null)
                                            setPreviewLoading(false)
                                        }}
                                    >
                                        Close
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            {previewError ? (
                                <Alert variant="destructive">
                                    <AlertTitle>Unable to load score preview</AlertTitle>
                                    <AlertDescription>{previewError}</AlertDescription>
                                </Alert>
                            ) : null}

                            {previewLoading ? (
                                <div className="space-y-2">
                                    <div className="h-8 animate-pulse rounded-md bg-muted/50" />
                                    <div className="h-8 animate-pulse rounded-md bg-muted/50" />
                                    <div className="h-28 animate-pulse rounded-md bg-muted/50" />
                                </div>
                            ) : previewDisplayRows.length === 0 ? (
                                <Alert>
                                    <AlertTitle>No saved scores yet</AlertTitle>
                                    <AlertDescription>
                                        This evaluation currently has no persisted score rows. Open the evaluation to
                                        begin scoring and save draft scores.
                                    </AlertDescription>
                                </Alert>
                            ) : (
                                <>
                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                                        <Card>
                                            <CardContent className="pt-4">
                                                <p className="text-xs text-muted-foreground">Total Rows</p>
                                                <p className="text-xl font-semibold">{previewStats.totalRows}</p>
                                            </CardContent>
                                        </Card>

                                        <Card>
                                            <CardContent className="pt-4">
                                                <p className="text-xs text-muted-foreground">Scored</p>
                                                <p className="text-xl font-semibold">{previewStats.scoredRows}</p>
                                            </CardContent>
                                        </Card>

                                        <Card>
                                            <CardContent className="pt-4">
                                                <p className="text-xs text-muted-foreground">Missing</p>
                                                <p className="text-xl font-semibold">{previewStats.missingRows}</p>
                                            </CardContent>
                                        </Card>

                                        <Card>
                                            <CardContent className="pt-4">
                                                <p className="text-xs text-muted-foreground">Average Score</p>
                                                <p className="text-xl font-semibold">
                                                    {previewStats.scoredRows > 0
                                                        ? previewStats.averageScore.toFixed(2)
                                                        : "—"}
                                                </p>
                                            </CardContent>
                                        </Card>

                                        <Card>
                                            <CardContent className="pt-4">
                                                <p className="text-xs text-muted-foreground">With Comments</p>
                                                <p className="text-xl font-semibold">{previewStats.withComments}</p>
                                            </CardContent>
                                        </Card>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span>Completion</span>
                                            <span>
                                                {previewStats.scoredRows}/{previewStats.totalRows} (
                                                {previewStats.completionPercent.toFixed(0)}%)
                                            </span>
                                        </div>
                                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full rounded-full bg-primary transition-all"
                                                style={{ width: `${Math.max(0, Math.min(100, previewStats.completionPercent))}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                        {previewTargetSummaries.map((summary) => (
                                            <Card key={summary.key}>
                                                <CardContent className="space-y-2 pt-4">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className="text-sm font-medium">{summary.label}</p>
                                                        <Badge variant={summary.scored === summary.total ? "default" : "secondary"}>
                                                            {summary.scored}/{summary.total}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                        <span>
                                                            Avg: {summary.scored > 0 ? summary.average.toFixed(2) : "—"}
                                                        </span>
                                                        <span>•</span>
                                                        <span>Comments: {summary.withComments}</span>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>

                                    <Card className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="min-w-64">Target</TableHead>
                                                    <TableHead className="min-w-56">Criterion</TableHead>
                                                    <TableHead className="min-w-28">Score</TableHead>
                                                    <TableHead className="min-w-72">Comment</TableHead>
                                                    <TableHead className="min-w-40">Updated</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {previewDisplayRows.map((row, index) => (
                                                    <TableRow key={`${row.id ?? "row"}-${index}`}>
                                                        <TableCell className="font-medium">
                                                            {row.targetLabel}
                                                        </TableCell>
                                                        <TableCell>{row.criterionLabel}</TableCell>
                                                        <TableCell>
                                                            {row.score === null ? (
                                                                <Badge variant="secondary">Not scored</Badge>
                                                            ) : (
                                                                <Badge variant="outline">{row.score}</Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground">
                                                            {compact(row.comment) ?? "—"}
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground">
                                                            {formatDateTime(row.updated_at ?? row.created_at)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </Card>
                                </>
                            )}
                        </CardContent>
                    </Card>
                ) : null}
            </div>
        </DashboardLayout>
    )
}
