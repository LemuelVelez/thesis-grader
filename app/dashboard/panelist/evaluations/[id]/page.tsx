"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

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

type EvaluationScoreItem = {
    id: string | null
    criterion_id: string
    criterion_name: string | null
    score: number | null
    comment: string | null
    subject_type: "group" | "student"
    subject_id: string | null
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

type CriterionOption = {
    id: string
    name: string
    description: string | null
    weight: number
    min_score: number
    max_score: number
    template_id: string | null
}

type RubricTemplateOption = {
    id: string
    name: string
    version: number
    active: boolean
}

type StudentTarget = {
    id: string
    name: string | null
    email: string | null
}

type EvaluationTarget = {
    key: string
    subject_type: "group" | "student"
    subject_id: string
    label: string
    subtitle: string | null
}

type DraftScore = {
    key: string
    server_id: string | null
    subject_type: "group" | "student"
    subject_id: string
    criterion_id: string
    score: number | null
    comment: string
    dirty: boolean
}

type UserProfile = {
    id: string
    name: string | null
}

type TargetSummary = {
    scored: number
    total: number
    totalRaw: number
    maxRaw: number
    totalWeighted: number
    maxWeighted: number
    percent: number
}

const CURRENT_USER_ENDPOINTS = ["/api/users/me", "/api/auth/me", "/api/me"] as const
const USERS_ENDPOINTS = ["/api/users"] as const
const SCHEDULES_ENDPOINTS = ["/api/defense-schedules"] as const
const RUBRIC_TEMPLATES_ENDPOINTS = ["/api/rubric-templates"] as const
const CRITERIA_ENDPOINTS = [
    "/api/rubric-criteria",
    "/api/criteria",
    "/api/rubric-template-criteria",
] as const

const NO_SCORE_SELECT_VALUE = "__none__"

const GROUP_MEMBER_ENDPOINT_BUILDERS = [
    (groupId: string) => `/api/groups/${encodeURIComponent(groupId)}/members`,
    (groupId: string) => `/api/group-members?group_id=${encodeURIComponent(groupId)}`,
    (groupId: string) => `/api/students?group_id=${encodeURIComponent(groupId)}`,
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
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

function compact(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function statusVariant(status: string): "secondary" | "outline" | "default" | "destructive" {
    const normalized = status.toLowerCase()
    if (normalized === "submitted") return "default"
    if (normalized === "locked") return "destructive"
    if (normalized === "pending") return "secondary"
    return "outline"
}

function toLowerKey(value: string): string {
    return value.trim().toLowerCase()
}

function clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0
    if (value < 0) return 0
    if (value > 100) return 100
    return value
}

function makeTargetKey(subjectType: "group" | "student", subjectId: string): string {
    return `${subjectType}:${toLowerKey(subjectId)}`
}

function makeDraftKey(subjectType: "group" | "student", subjectId: string, criterionId: string): string {
    return `${subjectType}:${toLowerKey(subjectId)}:${toLowerKey(criterionId)}`
}

function normalizeSubjectType(value: unknown): "group" | "student" {
    const raw = toStringSafe(value)?.toLowerCase()
    if (raw === "student" || raw === "individual") return "student"
    return "group"
}

function normalizeEvaluation(raw: unknown): EvaluationItem | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    if (!id) return null

    const scheduleId = toStringSafe(raw.schedule_id ?? raw.scheduleId)
    const evaluatorId = toStringSafe(raw.evaluator_id ?? raw.evaluatorId)
    if (!scheduleId || !evaluatorId) return null

    return {
        id,
        schedule_id: scheduleId,
        evaluator_id: evaluatorId,
        status: (toStringSafe(raw.status) ?? "pending") as EvaluationStatus,
        submitted_at: toNullableString(raw.submitted_at ?? raw.submittedAt),
        locked_at: toNullableString(raw.locked_at ?? raw.lockedAt),
        created_at: toNullableString(raw.created_at ?? raw.createdAt),
    }
}

function normalizeScore(raw: unknown): EvaluationScoreItem | null {
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
                : normalizeSubjectType(raw.subject_type ?? raw.subjectType ?? raw.target_type ?? raw.targetType)

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

function normalizeRubricTemplate(raw: unknown): RubricTemplateOption | null {
    if (!isRecord(raw)) return null

    const id = toStringSafe(raw.id)
    const name = toStringSafe(raw.name)
    if (!id || !name) return null

    return {
        id,
        name,
        version: Math.max(1, Math.floor(toNumberOrNull(raw.version) ?? 1)),
        active: Boolean(raw.active),
    }
}

function normalizeStudent(raw: unknown): StudentTarget | null {
    if (!isRecord(raw)) return null

    const base = isRecord(raw.user) ? raw.user : raw

    const id =
        toStringSafe(raw.student_id ?? raw.studentId ?? raw.user_id ?? raw.userId ?? raw.id ?? base.id) ?? null
    if (!id) return null

    const name = toNullableString(base.name ?? raw.name)
    const email = toNullableString(base.email ?? raw.email)

    return {
        id,
        name,
        email,
    }
}

function dedupeStudents(items: StudentTarget[]): StudentTarget[] {
    const byId = new Map<string, StudentTarget>()

    for (const student of items) {
        const key = toLowerKey(student.id)
        const existing = byId.get(key)
        if (!existing) {
            byId.set(key, student)
            continue
        }

        byId.set(key, {
            id: existing.id,
            name: existing.name ?? student.name,
            email: existing.email ?? student.email,
        })
    }

    return Array.from(byId.values()).sort((a, b) => {
        const aName = compact(a.name) ?? compact(a.email) ?? a.id
        const bName = compact(b.name) ?? compact(b.email) ?? b.id
        return aName.localeCompare(bName)
    })
}

function extractItemPayload(payload: unknown): unknown | null {
    if (isRecord(payload) && payload.item !== undefined) return payload.item
    if (isRecord(payload) && payload.data !== undefined) return payload.data
    if (isRecord(payload) && isRecord(payload.result) && payload.result.item !== undefined) {
        return payload.result.item
    }
    return isRecord(payload) ? payload : null
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    const topLevelCandidates = [
        payload.items,
        payload.data,
        payload.rows,
        payload.members,
        payload.students,
        payload.results,
    ]

    for (const candidate of topLevelCandidates) {
        if (Array.isArray(candidate)) return candidate
    }

    if (isRecord(payload.data)) {
        const nested = [payload.data.items, payload.data.rows, payload.data.members, payload.data.students]
        for (const candidate of nested) {
            if (Array.isArray(candidate)) return candidate
        }
    }

    if (isRecord(payload.result)) {
        const nested = [payload.result.items, payload.result.rows, payload.result.members]
        for (const candidate of nested) {
            if (Array.isArray(candidate)) return candidate
        }
    }

    if (isRecord(payload.group)) {
        if (Array.isArray(payload.group.members)) return payload.group.members
        if (Array.isArray(payload.group.students)) return payload.group.students
    }

    return []
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

async function readErrorMessage(res: Response, payload: unknown): Promise<string> {
    if (isRecord(payload)) {
        const error = toStringSafe(payload.error)
        if (error) return error

        const message = toStringSafe(payload.message)
        if (message) return message
    }

    try {
        const text = await res.text()
        if (text.trim().length > 0) return text
    } catch {
        // ignore
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

async function fetchGroupStudents(groupId: string): Promise<StudentTarget[]> {
    if (!groupId) return []

    const endpoints = GROUP_MEMBER_ENDPOINT_BUILDERS.map((build) => build(groupId))

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            const payload = (await res.json().catch(() => null)) as unknown
            if (!res.ok) continue

            const parsed = extractArrayPayload(payload)
                .map(normalizeStudent)
                .filter((item): item is StudentTarget => item !== null)

            const deduped = dedupeStudents(parsed)
            if (deduped.length > 0) return deduped
        } catch {
            // try next endpoint
        }
    }

    return []
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

function buildEvaluationTargets(params: {
    item: EvaluationItem
    schedule: DefenseScheduleOption | null
    students: StudentTarget[]
}): EvaluationTarget[] {
    const { item, schedule, students } = params

    const groupId = compact(schedule?.group_id) ?? item.schedule_id
    const groupLabel = compact(schedule?.group_title) ?? "Thesis Group"
    const groupSubtitleParts = [
        formatDateTime(schedule?.scheduled_at ?? null),
        compact(schedule?.room),
    ].filter((part): part is string => !!part && part !== "—")

    const targets: EvaluationTarget[] = [
        {
            key: makeTargetKey("group", groupId),
            subject_type: "group",
            subject_id: groupId,
            label: groupLabel,
            subtitle: groupSubtitleParts.length > 0 ? groupSubtitleParts.join(" • ") : null,
        },
    ]

    for (const student of students) {
        const label = compact(student.name) ?? compact(student.email) ?? `Student ${student.id}`
        targets.push({
            key: makeTargetKey("student", student.id),
            subject_type: "student",
            subject_id: student.id,
            label,
            subtitle: compact(student.email),
        })
    }

    return targets
}

function buildDraftScoreMap(params: {
    criteria: CriterionOption[]
    targets: EvaluationTarget[]
    serverScores: EvaluationScoreItem[]
    fallbackGroupId: string
}): Record<string, DraftScore> {
    const { criteria, targets, serverScores, fallbackGroupId } = params

    const serverByKey = new Map<string, EvaluationScoreItem>()
    for (const row of serverScores) {
        const subjectType = row.subject_type
        const subjectId =
            subjectType === "group"
                ? row.subject_id ?? fallbackGroupId
                : row.subject_id

        if (!subjectId) continue

        const key = makeDraftKey(subjectType, subjectId, row.criterion_id)
        if (!serverByKey.has(key)) {
            serverByKey.set(key, row)
        }
    }

    const draftMap: Record<string, DraftScore> = {}
    for (const target of targets) {
        for (const criterion of criteria) {
            const key = makeDraftKey(target.subject_type, target.subject_id, criterion.id)
            const existing = serverByKey.get(key)

            draftMap[key] = {
                key,
                server_id: existing?.id ?? null,
                subject_type: target.subject_type,
                subject_id: target.subject_id,
                criterion_id: criterion.id,
                score: existing?.score ?? null,
                comment: existing?.comment ?? "",
                dirty: false,
            }
        }
    }

    return draftMap
}

function buildScoreScale(minScore: number, maxScore: number): number[] {
    const min = Math.floor(minScore)
    const max = Math.floor(maxScore < min ? min : maxScore)

    const choices: number[] = []
    for (let i = min; i <= max; i += 1) {
        choices.push(i)
    }
    return choices
}

export default function PanelistEvaluationDetailsPage() {
    const params = useParams<{ id: string }>()
    const id = typeof params?.id === "string" ? params.id : ""

    const [item, setItem] = React.useState<EvaluationItem | null>(null)
    const [scores, setScores] = React.useState<EvaluationScoreItem[]>([])
    const [schedules, setSchedules] = React.useState<DefenseScheduleOption[]>([])
    const [users, setUsers] = React.useState<UserOption[]>([])
    const [criteria, setCriteria] = React.useState<CriterionOption[]>([])
    const [activeTemplate, setActiveTemplate] = React.useState<RubricTemplateOption | null>(null)
    const [currentUser, setCurrentUser] = React.useState<UserProfile | null>(null)
    const [students, setStudents] = React.useState<StudentTarget[]>([])
    const [targets, setTargets] = React.useState<EvaluationTarget[]>([])
    const [draftScores, setDraftScores] = React.useState<Record<string, DraftScore>>({})

    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [actionLoading, setActionLoading] = React.useState<"submit" | "lock" | null>(null)
    const [savingScores, setSavingScores] = React.useState(false)

    const [selectedTargetKey, setSelectedTargetKey] = React.useState("")
    const [notes, setNotes] = React.useState("")

    const loadDetails = React.useCallback(
        async (options?: { showSuccessToast?: boolean; showErrorToast?: boolean }) => {
            const { showSuccessToast = false, showErrorToast = true } = options ?? {}

            if (!id) return
            setLoading(true)
            setError(null)

            try {
                const [itemRes, scoreRes, me, scheduleRows, userRows, templateRows, fallbackCriteriaRows] = await Promise.all([
                    fetch(`/api/evaluations/${id}`, { cache: "no-store" }),
                    fetch(`/api/evaluation-scores?evaluation_id=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(
                        () => null,
                    ),
                    resolveCurrentUserProfile(),
                    fetchFirstSuccessfulArray(SCHEDULES_ENDPOINTS),
                    fetchFirstSuccessfulArray(USERS_ENDPOINTS),
                    fetchFirstSuccessfulArray(RUBRIC_TEMPLATES_ENDPOINTS),
                    fetchFirstSuccessfulArray(CRITERIA_ENDPOINTS),
                ])

                const itemPayload = (await itemRes.json().catch(() => null)) as unknown
                if (!itemRes.ok) {
                    const msg = await readErrorMessage(itemRes, itemPayload)
                    setError(msg)
                    setItem(null)
                    setScores([])
                    setSchedules([])
                    setUsers([])
                    setCriteria([])
                    setStudents([])
                    setTargets([])
                    setDraftScores({})
                    setCurrentUser(me)
                    setActiveTemplate(null)
                    return
                }

                const parsedItem = normalizeEvaluation(extractItemPayload(itemPayload))
                if (!parsedItem) {
                    const msg = "Evaluation response is invalid."
                    setError(msg)
                    setItem(null)
                    setScores([])
                    setSchedules([])
                    setUsers([])
                    setCriteria([])
                    setStudents([])
                    setTargets([])
                    setDraftScores({})
                    setCurrentUser(me)
                    setActiveTemplate(null)
                    if (showErrorToast) {
                        toast.error("Unable to load evaluation", { description: msg })
                    }
                    return
                }

                const parsedSchedules = scheduleRows
                    .map(normalizeSchedule)
                    .filter((schedule): schedule is DefenseScheduleOption => schedule !== null)

                const parsedUsers = userRows
                    .map(normalizeUser)
                    .filter((user): user is UserOption => user !== null)

                const parsedTemplates = templateRows
                    .map(normalizeRubricTemplate)
                    .filter((tpl): tpl is RubricTemplateOption => tpl !== null)

                const active =
                    parsedTemplates
                        .filter((tpl) => tpl.active)
                        .sort((a, b) => b.version - a.version)[0] ?? null

                let criteriaSourceRows = fallbackCriteriaRows

                if (active) {
                    try {
                        const res = await fetch(`/api/rubric-templates/${encodeURIComponent(active.id)}/criteria`, {
                            cache: "no-store",
                        })

                        const payload = (await res.json().catch(() => null)) as unknown
                        if (res.ok) {
                            const activeCriteriaRows = extractArrayPayload(payload)
                            if (activeCriteriaRows.length > 0) {
                                criteriaSourceRows = activeCriteriaRows
                            }
                        }
                    } catch {
                        // fallback to generic criteria endpoints
                    }
                }

                let parsedCriteria = criteriaSourceRows
                    .map(normalizeCriterion)
                    .filter((criterion): criterion is CriterionOption => criterion !== null)

                if (active && parsedCriteria.some((criterion) => criterion.template_id)) {
                    const filtered = parsedCriteria.filter(
                        (criterion) =>
                            criterion.template_id &&
                            toLowerKey(criterion.template_id) === toLowerKey(active.id),
                    )
                    if (filtered.length > 0) {
                        parsedCriteria = filtered
                    }
                }

                let parsedScores: EvaluationScoreItem[] = []
                if (scoreRes) {
                    const scorePayload = (await scoreRes.json().catch(() => null)) as unknown
                    if (scoreRes.ok) {
                        parsedScores = extractArrayPayload(scorePayload)
                            .map(normalizeScore)
                            .filter((row): row is EvaluationScoreItem => row !== null)
                    }
                }

                const scheduleForItem =
                    parsedSchedules.find((schedule) => toLowerKey(schedule.id) === toLowerKey(parsedItem.schedule_id)) ??
                    null

                const groupId = compact(scheduleForItem?.group_id) ?? parsedItem.schedule_id
                const fetchedStudents = await fetchGroupStudents(groupId)

                const usersById = new Map<string, UserOption>()
                for (const user of parsedUsers) {
                    usersById.set(toLowerKey(user.id), user)
                }

                const studentSeed = [...fetchedStudents]

                for (const scoreRow of parsedScores) {
                    if (scoreRow.subject_type !== "student" || !scoreRow.subject_id) continue

                    const key = toLowerKey(scoreRow.subject_id)
                    const alreadyExists = studentSeed.some((student) => toLowerKey(student.id) === key)
                    if (alreadyExists) continue

                    const matchedUser = usersById.get(key)
                    studentSeed.push({
                        id: scoreRow.subject_id,
                        name: matchedUser?.name ?? null,
                        email: matchedUser?.email ?? null,
                    })
                }

                const parsedStudents = dedupeStudents(studentSeed)

                const criteriaById = new Map<string, CriterionOption>()
                for (const criterion of parsedCriteria) {
                    criteriaById.set(toLowerKey(criterion.id), criterion)
                }

                let additionalCount = 1
                for (const scoreRow of parsedScores) {
                    const criterionKey = toLowerKey(scoreRow.criterion_id)
                    if (criteriaById.has(criterionKey)) continue

                    criteriaById.set(criterionKey, {
                        id: scoreRow.criterion_id,
                        name: compact(scoreRow.criterion_name) ?? `Criterion ${additionalCount}`,
                        description: null,
                        weight: 0,
                        min_score: 0,
                        max_score: 3,
                        template_id: active?.id ?? null,
                    })
                    additionalCount += 1
                }

                const mergedCriteria = Array.from(criteriaById.values())
                const builtTargets = buildEvaluationTargets({
                    item: parsedItem,
                    schedule: scheduleForItem,
                    students: parsedStudents,
                })

                const draftMap = buildDraftScoreMap({
                    criteria: mergedCriteria,
                    targets: builtTargets,
                    serverScores: parsedScores,
                    fallbackGroupId: groupId,
                })

                setItem(parsedItem)
                setScores(parsedScores)
                setSchedules(parsedSchedules)
                setUsers(parsedUsers)
                setCriteria(mergedCriteria)
                setStudents(parsedStudents)
                setTargets(builtTargets)
                setDraftScores(draftMap)
                setCurrentUser(me)
                setActiveTemplate(active)
                setSelectedTargetKey((prev) =>
                    builtTargets.some((target) => target.key === prev)
                        ? prev
                        : builtTargets[0]?.key ?? "",
                )

                if (showSuccessToast) {
                    toast.success("Evaluation details refreshed")
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unable to load evaluation."
                setError(message)
                setItem(null)
                setScores([])
                setSchedules([])
                setUsers([])
                setCriteria([])
                setStudents([])
                setTargets([])
                setDraftScores({})

                if (showErrorToast) {
                    toast.error("Unable to load evaluation", { description: message })
                }
            } finally {
                setLoading(false)
            }
        },
        [id],
    )

    React.useEffect(() => {
        void loadDetails({ showErrorToast: false })
    }, [loadDetails])

    const scheduleById = React.useMemo(() => {
        const map = new Map<string, DefenseScheduleOption>()
        for (const schedule of schedules) {
            map.set(toLowerKey(schedule.id), schedule)
        }
        return map
    }, [schedules])

    const userById = React.useMemo(() => {
        const map = new Map<string, UserOption>()
        for (const user of users) {
            map.set(toLowerKey(user.id), user)
        }
        return map
    }, [users])

    const schedule = React.useMemo(() => {
        if (!item) return null
        return scheduleById.get(toLowerKey(item.schedule_id)) ?? null
    }, [item, scheduleById])

    const evaluator = React.useMemo(() => {
        if (!item) return null
        return userById.get(toLowerKey(item.evaluator_id)) ?? null
    }, [item, userById])

    const scheduleName = React.useMemo(
        () => compact(schedule?.group_title) ?? "Defense Schedule",
        [schedule?.group_title],
    )

    const scheduleMeta = React.useMemo(() => {
        const parts = [
            formatDateTime(schedule?.scheduled_at ?? null),
            compact(schedule?.room),
            compact(schedule?.status) ? toTitleCase(schedule!.status) : null,
        ].filter((part): part is string => !!part && part !== "—")

        return parts.length > 0 ? parts.join(" • ") : "—"
    }, [schedule])

    const evaluatorName = React.useMemo(() => {
        if (!item) return "Assigned Panelist"

        const direct = compact(evaluator?.name) ?? compact(evaluator?.email)
        if (direct) return direct

        const isCurrent = currentUser && toLowerKey(currentUser.id) === toLowerKey(item.evaluator_id)
        if (isCurrent) {
            return compact(currentUser?.name) ?? "Assigned Panelist"
        }

        return "Assigned Panelist"
    }, [currentUser, evaluator?.email, evaluator?.name, item])

    const evaluatorRole = React.useMemo(() => {
        if (!evaluator?.role) return "Panelist"
        return toTitleCase(evaluator.role)
    }, [evaluator?.role])

    const isLocked = (item?.status ?? "").toLowerCase() === "locked"
    const canSubmit = (item?.status ?? "").toLowerCase() === "pending"

    const summaryByTarget = React.useMemo(() => {
        const map = new Map<string, TargetSummary>()

        for (const target of targets) {
            let scored = 0
            const total = criteria.length
            let totalRaw = 0
            let maxRaw = 0
            let totalWeighted = 0
            let maxWeighted = 0

            for (const criterion of criteria) {
                const key = makeDraftKey(target.subject_type, target.subject_id, criterion.id)
                const draft = draftScores[key]

                const criterionMax = Math.max(0, Math.floor(criterion.max_score))
                const criterionWeight = Math.max(0, criterion.weight)

                maxRaw += criterionMax
                maxWeighted += criterionWeight

                if (draft && draft.score !== null) {
                    scored += 1
                    totalRaw += draft.score

                    if (criterionMax > 0 && criterionWeight > 0) {
                        totalWeighted += (draft.score / criterionMax) * criterionWeight
                    }
                }
            }

            const percent =
                maxWeighted > 0
                    ? (totalWeighted / maxWeighted) * 100
                    : total > 0
                        ? (scored / total) * 100
                        : 0

            map.set(target.key, {
                scored,
                total,
                totalRaw,
                maxRaw,
                totalWeighted,
                maxWeighted,
                percent: clampPercent(percent),
            })
        }

        return map
    }, [criteria, draftScores, targets])

    const overallSummary = React.useMemo(() => {
        let scored = 0
        let total = 0
        let totalRaw = 0
        let maxRaw = 0
        let totalWeighted = 0
        let maxWeighted = 0

        for (const target of targets) {
            const summary = summaryByTarget.get(target.key)
            if (!summary) continue

            scored += summary.scored
            total += summary.total
            totalRaw += summary.totalRaw
            maxRaw += summary.maxRaw
            totalWeighted += summary.totalWeighted
            maxWeighted += summary.maxWeighted
        }

        const percent =
            maxWeighted > 0
                ? (totalWeighted / maxWeighted) * 100
                : total > 0
                    ? (scored / total) * 100
                    : 0

        return {
            scored,
            total,
            totalRaw,
            maxRaw,
            totalWeighted,
            maxWeighted,
            percent: clampPercent(percent),
        }
    }, [summaryByTarget, targets])

    const missingCount = React.useMemo(
        () => Math.max(0, overallSummary.total - overallSummary.scored),
        [overallSummary.total, overallSummary.scored],
    )

    const dirtyCount = React.useMemo(
        () => Object.values(draftScores).filter((row) => row.dirty).length,
        [draftScores],
    )

    const selectedTarget = React.useMemo(
        () => targets.find((target) => target.key === selectedTargetKey) ?? targets[0] ?? null,
        [selectedTargetKey, targets],
    )

    const selectedTargetSummary = React.useMemo(() => {
        if (!selectedTarget) return null
        return summaryByTarget.get(selectedTarget.key) ?? null
    }, [selectedTarget, summaryByTarget])

    React.useEffect(() => {
        if (targets.length === 0) {
            if (selectedTargetKey !== "") setSelectedTargetKey("")
            return
        }

        const exists = targets.some((target) => target.key === selectedTargetKey)
        if (!exists) {
            setSelectedTargetKey(targets[0].key)
        }
    }, [selectedTargetKey, targets])

    const updateDraftScore = React.useCallback(
        (target: EvaluationTarget, criterion: CriterionOption, score: number | null) => {
            setDraftScores((prev) => {
                const key = makeDraftKey(target.subject_type, target.subject_id, criterion.id)
                const existing = prev[key]

                const base: DraftScore =
                    existing ?? {
                        key,
                        server_id: null,
                        subject_type: target.subject_type,
                        subject_id: target.subject_id,
                        criterion_id: criterion.id,
                        score: null,
                        comment: "",
                        dirty: false,
                    }

                return {
                    ...prev,
                    [key]: {
                        ...base,
                        score,
                        dirty: true,
                    },
                }
            })
        },
        [],
    )

    const updateDraftComment = React.useCallback(
        (target: EvaluationTarget, criterion: CriterionOption, comment: string) => {
            setDraftScores((prev) => {
                const key = makeDraftKey(target.subject_type, target.subject_id, criterion.id)
                const existing = prev[key]

                const base: DraftScore =
                    existing ?? {
                        key,
                        server_id: null,
                        subject_type: target.subject_type,
                        subject_id: target.subject_id,
                        criterion_id: criterion.id,
                        score: null,
                        comment: "",
                        dirty: false,
                    }

                return {
                    ...prev,
                    [key]: {
                        ...base,
                        comment,
                        dirty: true,
                    },
                }
            })
        },
        [],
    )

    const copyGroupScoresToSelectedStudent = React.useCallback(() => {
        if (!selectedTarget || selectedTarget.subject_type !== "student") return

        const groupTarget = targets.find((target) => target.subject_type === "group")
        if (!groupTarget) {
            toast.error("Group target is unavailable.")
            return
        }

        setDraftScores((prev) => {
            const next = { ...prev }

            for (const criterion of criteria) {
                const groupKey = makeDraftKey(groupTarget.subject_type, groupTarget.subject_id, criterion.id)
                const studentKey = makeDraftKey(selectedTarget.subject_type, selectedTarget.subject_id, criterion.id)

                const groupDraft = prev[groupKey]
                const currentStudent = prev[studentKey]

                const base: DraftScore =
                    currentStudent ?? {
                        key: studentKey,
                        server_id: null,
                        subject_type: selectedTarget.subject_type,
                        subject_id: selectedTarget.subject_id,
                        criterion_id: criterion.id,
                        score: null,
                        comment: "",
                        dirty: false,
                    }

                next[studentKey] = {
                    ...base,
                    score: groupDraft?.score ?? base.score,
                    comment: groupDraft?.comment ?? base.comment,
                    dirty: true,
                }
            }

            return next
        })

        toast.success("Copied group scores and comments to this student.")
    }, [criteria, selectedTarget, targets])

    const clearSelectedTargetScores = React.useCallback(() => {
        if (!selectedTarget) return

        setDraftScores((prev) => {
            const next = { ...prev }

            for (const criterion of criteria) {
                const key = makeDraftKey(selectedTarget.subject_type, selectedTarget.subject_id, criterion.id)
                const existing = prev[key]

                const base: DraftScore =
                    existing ?? {
                        key,
                        server_id: null,
                        subject_type: selectedTarget.subject_type,
                        subject_id: selectedTarget.subject_id,
                        criterion_id: criterion.id,
                        score: null,
                        comment: "",
                        dirty: false,
                    }

                next[key] = {
                    ...base,
                    score: null,
                    comment: "",
                    dirty: true,
                }
            }

            return next
        })

        toast.success(`Cleared draft scores for ${selectedTarget.label}.`)
    }, [criteria, selectedTarget])

    const persistScoreDraft = React.useCallback(
        async (draft: DraftScore): Promise<{ ok: boolean; serverId: string | null; message?: string }> => {
            if (!id) {
                return { ok: false, serverId: draft.server_id, message: "Missing evaluation ID." }
            }

            if (draft.score === null) {
                return { ok: false, serverId: draft.server_id, message: "Score is required." }
            }

            const comment = compact(draft.comment)
            const basePayload: Record<string, unknown> = {
                evaluation_id: id,
                criterion_id: draft.criterion_id,
                score: draft.score,
                comment: comment ?? null,
            }

            const subjectVariants =
                draft.subject_type === "student"
                    ? [
                        { student_id: draft.subject_id },
                        { subject_type: "student", subject_id: draft.subject_id },
                        { target_type: "student", target_id: draft.subject_id },
                    ]
                    : [
                        { group_id: draft.subject_id },
                        { subject_type: "group", subject_id: draft.subject_id },
                        { target_type: "group", target_id: draft.subject_id },
                    ]

            const attempts: Array<{ url: string; method: "PATCH" | "POST"; body: Record<string, unknown> }> = []

            if (draft.server_id) {
                attempts.push({
                    url: `/api/evaluation-scores/${encodeURIComponent(draft.server_id)}`,
                    method: "PATCH",
                    body: {
                        score: draft.score,
                        comment: comment ?? null,
                    },
                })

                attempts.push({
                    url: `/api/evaluation-scores/${encodeURIComponent(draft.server_id)}`,
                    method: "PATCH",
                    body: {
                        ...basePayload,
                        ...subjectVariants[0],
                    },
                })
            }

            for (const variant of subjectVariants) {
                attempts.push({
                    url: "/api/evaluation-scores",
                    method: "POST",
                    body: {
                        ...basePayload,
                        ...variant,
                    },
                })

                attempts.push({
                    url: `/api/evaluations/${encodeURIComponent(id)}/scores`,
                    method: "POST",
                    body: {
                        ...basePayload,
                        ...variant,
                    },
                })

                attempts.push({
                    url: "/api/evaluation-scores",
                    method: "PATCH",
                    body: {
                        ...basePayload,
                        ...variant,
                    },
                })
            }

            let lastError = "Unable to save score."

            for (const attempt of attempts) {
                try {
                    const res = await fetch(attempt.url, {
                        method: attempt.method,
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(attempt.body),
                    })

                    const payload = (await res.json().catch(() => null)) as unknown

                    if (!res.ok) {
                        lastError = await readErrorMessage(res, payload)
                        continue
                    }

                    const parsed = normalizeScore(extractItemPayload(payload))
                    return {
                        ok: true,
                        serverId: parsed?.id ?? draft.server_id ?? null,
                    }
                } catch (err) {
                    lastError = err instanceof Error ? err.message : "Unable to save score."
                }
            }

            return {
                ok: false,
                serverId: draft.server_id,
                message: lastError,
            }
        },
        [id],
    )

    const saveAllScores = React.useCallback(
        async (options?: { silentSuccess?: boolean }) => {
            const { silentSuccess = false } = options ?? {}

            const dirtyRows = Object.values(draftScores).filter((row) => row.dirty)

            if (dirtyRows.length === 0) {
                if (!silentSuccess) {
                    toast("No unsaved score changes.")
                }
                return true
            }

            const missingDirty = dirtyRows.filter((row) => row.score === null)
            if (missingDirty.length > 0) {
                toast.error("Some draft rows are incomplete.", {
                    description: `Please set scores for ${missingDirty.length} edited criterion row(s) before saving.`,
                })
                return false
            }

            setSavingScores(true)

            try {
                const nextDrafts = { ...draftScores }
                let failed = 0
                let firstError: string | null = null

                for (const row of dirtyRows) {
                    const result = await persistScoreDraft(row)
                    if (!result.ok) {
                        failed += 1
                        if (!firstError) {
                            firstError = result.message ?? "Unable to save one of the scores."
                        }
                        continue
                    }

                    nextDrafts[row.key] = {
                        ...row,
                        server_id: result.serverId ?? row.server_id,
                        dirty: false,
                    }
                }

                setDraftScores(nextDrafts)

                if (failed > 0) {
                    toast.error("Some scores were not saved.", {
                        description: firstError ?? `${failed} row(s) failed to save.`,
                    })
                    return false
                }

                if (!silentSuccess) {
                    toast.success(`Saved ${dirtyRows.length} score update${dirtyRows.length === 1 ? "" : "s"}.`)
                }

                return true
            } finally {
                setSavingScores(false)
            }
        },
        [draftScores, persistScoreDraft],
    )

    const patchStatus = React.useCallback(
        async (mode: "submit" | "lock") => {
            if (!id) return

            setActionLoading(mode)
            setError(null)

            try {
                const endpoint = mode === "submit" ? `/api/evaluations/${id}/submit` : `/api/evaluations/${id}/lock`
                const res = await fetch(endpoint, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                })
                const payload = (await res.json().catch(() => null)) as unknown

                if (!res.ok) {
                    const msg = await readErrorMessage(res, payload)
                    setError(msg)
                    toast.error("Unable to update evaluation", { description: msg })
                    return
                }

                toast.success(mode === "submit" ? "Evaluation submitted." : "Evaluation locked.")
                await loadDetails({ showErrorToast: false, showSuccessToast: false })
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unable to update evaluation."
                setError(message)
                toast.error("Unable to update evaluation", { description: message })
            } finally {
                setActionLoading(null)
            }
        },
        [id, loadDetails],
    )

    const handleSubmitEvaluation = React.useCallback(async () => {
        if (!item) return

        if (criteria.length === 0) {
            toast.error("No rubric criteria available.", {
                description: "Unable to submit without active rubric criteria.",
            })
            return
        }

        if (missingCount > 0) {
            toast.error("Incomplete scoring.", {
                description: `Please score the remaining ${missingCount} criterion entry${missingCount === 1 ? "" : "ies"} before submitting.`,
            })
            return
        }

        const saved = await saveAllScores({ silentSuccess: true })
        if (!saved) return

        await patchStatus("submit")
    }, [criteria.length, item, missingCount, patchStatus, saveAllScores])

    const handleLockEvaluation = React.useCallback(async () => {
        if (!item) return

        const saved = await saveAllScores({ silentSuccess: true })
        if (!saved) return

        await patchStatus("lock")
    }, [item, patchStatus, saveAllScores])

    return (
        <DashboardLayout
            title="Evaluation Details"
            description="Evaluate the thesis group and each student using criteria from the active rubric template."
        >
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/dashboard/panelist/evaluations">Back to Evaluations</Link>
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void loadDetails({ showSuccessToast: true })}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                </div>

                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>Action failed</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                {loading ? (
                    <Card>
                        <CardContent className="space-y-3 pt-6">
                            <div className="h-8 animate-pulse rounded-md bg-muted/50" />
                            <div className="h-24 animate-pulse rounded-md bg-muted/50" />
                            <div className="h-32 animate-pulse rounded-md bg-muted/50" />
                        </CardContent>
                    </Card>
                ) : !item ? (
                    <Alert>
                        <AlertTitle>Evaluation not found</AlertTitle>
                        <AlertDescription>We couldn't locate this evaluation record.</AlertDescription>
                    </Alert>
                ) : (
                    <>
                        <Card>
                            <CardHeader>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <CardTitle className="flex flex-wrap items-center gap-2">
                                            <span>{scheduleName}</span>
                                            <Badge variant={statusVariant(item.status)}>
                                                {toTitleCase(item.status)}
                                            </Badge>
                                        </CardTitle>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Score the thesis group first, then evaluate each student individually.
                                        </p>
                                    </div>

                                    {activeTemplate ? (
                                        <Badge variant="outline">
                                            Active Rubric: {activeTemplate.name} • v{activeTemplate.version}
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary">Active rubric template not detected</Badge>
                                    )}
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    <div className="rounded-lg border bg-muted/20 p-3">
                                        <p className="text-xs text-muted-foreground">Schedule</p>
                                        <p className="font-medium">{scheduleName}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">{scheduleMeta}</p>
                                    </div>

                                    <div className="rounded-lg border bg-muted/20 p-3">
                                        <p className="text-xs text-muted-foreground">Evaluator</p>
                                        <p className="font-medium">{evaluatorName}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">{evaluatorRole}</p>
                                    </div>

                                    <div className="rounded-lg border bg-muted/20 p-3">
                                        <p className="text-xs text-muted-foreground">Created</p>
                                        <p className="font-medium">{formatDateTime(item.created_at)}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Submitted: {formatDateTime(item.submitted_at)}
                                        </p>
                                    </div>

                                    <div className="rounded-lg border bg-muted/20 p-3">
                                        <p className="text-xs text-muted-foreground">Evaluation Rows</p>
                                        <p className="font-medium">{scores.length}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Targets: {targets.length} • Students: {students.length}
                                        </p>
                                    </div>
                                </div>

                                <Separator />

                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant={dirtyCount > 0 ? "secondary" : "outline"}>
                                            Unsaved changes: {dirtyCount}
                                        </Badge>
                                        <Badge variant={missingCount === 0 ? "default" : "secondary"}>
                                            Remaining scores: {missingCount}
                                        </Badge>
                                        <Badge variant="outline">
                                            Progress: {overallSummary.scored}/{overallSummary.total}
                                        </Badge>
                                        <Badge variant="outline">
                                            Weighted:{" "}
                                            {overallSummary.maxWeighted > 0
                                                ? `${overallSummary.totalWeighted.toFixed(2)}/${overallSummary.maxWeighted.toFixed(2)}`
                                                : "N/A"}
                                        </Badge>
                                    </div>

                                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                        <div
                                            className="h-full rounded-full bg-primary transition-all"
                                            style={{ width: `${clampPercent(overallSummary.percent)}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        onClick={() => void saveAllScores()}
                                        disabled={savingScores || actionLoading !== null || isLocked || dirtyCount === 0}
                                    >
                                        {savingScores ? "Saving..." : "Save Draft Scores"}
                                    </Button>

                                    <Button
                                        onClick={() => void handleSubmitEvaluation()}
                                        disabled={
                                            actionLoading !== null ||
                                            savingScores ||
                                            !canSubmit ||
                                            isLocked ||
                                            criteria.length === 0 ||
                                            missingCount > 0
                                        }
                                    >
                                        {actionLoading === "submit" ? "Submitting..." : "Submit Evaluation"}
                                    </Button>

                                    <Button
                                        variant="destructive"
                                        onClick={() => void handleLockEvaluation()}
                                        disabled={actionLoading !== null || savingScores || isLocked}
                                    >
                                        {actionLoading === "lock" ? "Locking..." : "Lock Evaluation"}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {criteria.length === 0 ? (
                            <Alert>
                                <AlertTitle>No criteria found</AlertTitle>
                                <AlertDescription>
                                    No active rubric criteria were returned by the API. Please activate a rubric template first.
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Evaluation Targets</CardTitle>
                                        <p className="text-sm text-muted-foreground">
                                            Switch between group and student scoring sheets.
                                        </p>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                        {targets.map((target) => {
                                            const summary = summaryByTarget.get(target.key)
                                            const completed =
                                                !!summary &&
                                                summary.total > 0 &&
                                                summary.scored === summary.total

                                            return (
                                                <Button
                                                    key={target.key}
                                                    variant={selectedTarget?.key === target.key ? "default" : "outline"}
                                                    className="h-auto w-full justify-between gap-3 px-3 py-2"
                                                    onClick={() => setSelectedTargetKey(target.key)}
                                                >
                                                    <div className="min-w-0 text-left">
                                                        <p className="truncate text-sm font-medium">
                                                            {target.subject_type === "group" ? "Group • " : "Student • "}
                                                            {target.label}
                                                        </p>
                                                        {target.subtitle ? (
                                                            <p className="truncate text-xs opacity-90">{target.subtitle}</p>
                                                        ) : null}
                                                    </div>
                                                    <Badge variant={completed ? "default" : "secondary"}>
                                                        {summary?.scored ?? 0}/{summary?.total ?? 0}
                                                    </Badge>
                                                </Button>
                                            )
                                        })}

                                        <Separator className="my-3" />

                                        <div className="space-y-2">
                                            <p className="text-xs font-medium text-muted-foreground">
                                                Local panel notes (not sent to API)
                                            </p>
                                            <Textarea
                                                value={notes}
                                                onChange={(e) => setNotes(e.target.value)}
                                                placeholder="Write quick reminders while scoring."
                                                className="min-h-24"
                                            />
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <CardTitle className="text-base">
                                                    {selectedTarget
                                                        ? `${selectedTarget.subject_type === "group" ? "Group" : "Student"} Scoring`
                                                        : "Scoring"}
                                                </CardTitle>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    {selectedTarget
                                                        ? selectedTarget.label
                                                        : "Select a target to begin scoring."}
                                                </p>
                                            </div>

                                            {selectedTargetSummary ? (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Badge variant="outline">
                                                        Completed {selectedTargetSummary.scored}/{selectedTargetSummary.total}
                                                    </Badge>
                                                    <Badge variant="outline">
                                                        Raw {selectedTargetSummary.totalRaw}/{selectedTargetSummary.maxRaw}
                                                    </Badge>
                                                    <Badge variant="outline">
                                                        Weighted{" "}
                                                        {selectedTargetSummary.maxWeighted > 0
                                                            ? `${selectedTargetSummary.totalWeighted.toFixed(2)}/${selectedTargetSummary.maxWeighted.toFixed(2)}`
                                                            : "N/A"}
                                                    </Badge>
                                                </div>
                                            ) : null}
                                        </div>
                                    </CardHeader>

                                    <CardContent className="space-y-3">
                                        {!selectedTarget ? (
                                            <p className="text-sm text-muted-foreground">
                                                Select a target from the left panel.
                                            </p>
                                        ) : (
                                            <>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {selectedTarget.subject_type === "student" ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => copyGroupScoresToSelectedStudent()}
                                                            disabled={isLocked || savingScores || actionLoading !== null}
                                                        >
                                                            Copy Group Scores
                                                        </Button>
                                                    ) : null}

                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                disabled={isLocked || savingScores || actionLoading !== null}
                                                            >
                                                                Clear This Sheet
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Clear current scoring sheet?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    This will reset all criterion scores and comments for{" "}
                                                                    <span className="font-medium text-foreground">
                                                                        {selectedTarget.label}
                                                                    </span>
                                                                    . You can still edit before saving/submitting.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => clearSelectedTargetScores()}>
                                                                    Clear scores
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>

                                                <Separator />

                                                <div className="space-y-3">
                                                    {criteria.map((criterion, index) => {
                                                        const key = makeDraftKey(
                                                            selectedTarget.subject_type,
                                                            selectedTarget.subject_id,
                                                            criterion.id,
                                                        )

                                                        const draft: DraftScore =
                                                            draftScores[key] ?? {
                                                                key,
                                                                server_id: null,
                                                                subject_type: selectedTarget.subject_type,
                                                                subject_id: selectedTarget.subject_id,
                                                                criterion_id: criterion.id,
                                                                score: null,
                                                                comment: "",
                                                                dirty: false,
                                                            }

                                                        const scoreChoices = buildScoreScale(
                                                            criterion.min_score,
                                                            criterion.max_score,
                                                        )

                                                        const scoreSelectValue =
                                                            draft.score === null
                                                                ? NO_SCORE_SELECT_VALUE
                                                                : String(draft.score)

                                                        return (
                                                            <Card key={key} className="border-muted/70">
                                                                <CardContent className="space-y-3 pt-4">
                                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                                        <div className="min-w-0">
                                                                            <p className="text-xs text-muted-foreground">
                                                                                Criterion {index + 1}
                                                                            </p>
                                                                            <p className="font-medium">{criterion.name}</p>
                                                                            {criterion.description ? (
                                                                                <p className="mt-1 text-xs text-muted-foreground">
                                                                                    {criterion.description}
                                                                                </p>
                                                                            ) : null}
                                                                        </div>

                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                            <Badge variant="outline">
                                                                                Weight: {criterion.weight}%
                                                                            </Badge>
                                                                            <Badge variant="secondary">
                                                                                Range: {criterion.min_score}–{criterion.max_score}
                                                                            </Badge>
                                                                            {draft.dirty ? (
                                                                                <Badge variant="secondary">Unsaved</Badge>
                                                                            ) : null}
                                                                        </div>
                                                                    </div>

                                                                    <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                                                                        <div className="space-y-2">
                                                                            <p className="text-xs font-medium text-muted-foreground">
                                                                                Score
                                                                            </p>
                                                                            <Select
                                                                                value={scoreSelectValue}
                                                                                onValueChange={(value) => {
                                                                                    if (value === NO_SCORE_SELECT_VALUE) {
                                                                                        updateDraftScore(selectedTarget, criterion, null)
                                                                                        return
                                                                                    }

                                                                                    const parsed = Number(value)
                                                                                    updateDraftScore(
                                                                                        selectedTarget,
                                                                                        criterion,
                                                                                        Number.isFinite(parsed) ? parsed : null,
                                                                                    )
                                                                                }}
                                                                                disabled={isLocked || savingScores || actionLoading !== null}
                                                                            >
                                                                                <SelectTrigger>
                                                                                    <SelectValue placeholder="Select score" />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    <SelectItem value={NO_SCORE_SELECT_VALUE}>
                                                                                        Not scored
                                                                                    </SelectItem>
                                                                                    {scoreChoices.map((value) => (
                                                                                        <SelectItem
                                                                                            key={`${criterion.id}-score-${value}`}
                                                                                            value={String(value)}
                                                                                        >
                                                                                            {value}
                                                                                        </SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>

                                                                        <div className="space-y-2">
                                                                            <p className="text-xs font-medium text-muted-foreground">
                                                                                Panelist comment
                                                                            </p>
                                                                            <Textarea
                                                                                value={draft.comment}
                                                                                onChange={(e) =>
                                                                                    updateDraftComment(
                                                                                        selectedTarget,
                                                                                        criterion,
                                                                                        e.target.value,
                                                                                    )
                                                                                }
                                                                                placeholder="Add concise qualitative feedback for this criterion."
                                                                                className="min-h-20"
                                                                                disabled={isLocked || savingScores || actionLoading !== null}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </CardContent>
                                                            </Card>
                                                        )
                                                    })}
                                                </div>
                                            </>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        )}
                    </>
                )}
            </div>
        </DashboardLayout>
    )
}
