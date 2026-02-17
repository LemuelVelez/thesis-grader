"use client"

import * as React from "react"
import { toast } from "sonner"
import { Download, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react"
import * as XLSX from "xlsx-js-style"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

type EvaluationItem = {
    id: string
    schedule_id: string
    evaluator_id: string
    status: string
    created_at: string | null
    submitted_at: string | null
    locked_at: string | null
}

type RankingItem = {
    rank: number
    group_id: string
    group_title: string
    group_percentage: number | null
    submitted_evaluations: number
    latest_defense_at: string | null
}

type UserMini = {
    id: string
    name: string
}

type DefenseScheduleMini = {
    id: string
    group_id: string | null
    scheduled_at: string | null
    room: string | null
}

type ThesisGroupMini = {
    id: string
    title: string
}

type StatusFilter = "all" | "pending" | "submitted" | "locked"

type ExcelPreview = {
    fileName: string
    generatedAt: string
    headers: string[]
    rows: string[][]
}

type StyledCell = XLSX.CellObject & {
    s?: Record<string, unknown>
}

const STATUS_FILTERS = ["all", "pending", "submitted", "locked"] as const

const EVALUATION_ENDPOINT_CANDIDATES = [
    "/api/evaluations?limit=500&orderBy=created_at&orderDirection=desc",
    "/api/evaluations?limit=500",
    "/api/evaluation?limit=500",
]

const RANKING_ENDPOINT_CANDIDATES = [
    "/api/admin/rankings?limit=20",
    "/api/admin/rankings",
    "/api/rankings?limit=20",
]

const USERS_LIST_ENDPOINT_CANDIDATES = [
    "/api/users?limit=1000&orderBy=name&orderDirection=asc",
    "/api/users?limit=1000",
]

const DEFENSE_SCHEDULES_LIST_ENDPOINT_CANDIDATES = [
    "/api/defense-schedules?limit=1000&orderBy=scheduled_at&orderDirection=desc",
    "/api/defense-schedules?limit=1000",
]

const THESIS_GROUPS_LIST_ENDPOINT_CANDIDATES = [
    "/api/thesis-groups?limit=1000&orderBy=title&orderDirection=asc",
    "/api/thesis-groups?limit=1000",
    "/api/groups?limit=1000",
]

const USER_BY_ID_ENDPOINT_FACTORIES = [(id: string) => `/api/users/${id}`]

const DEFENSE_SCHEDULE_BY_ID_ENDPOINT_FACTORIES = [
    (id: string) => `/api/defense-schedules/${id}`,
]

const THESIS_GROUP_BY_ID_ENDPOINT_FACTORIES = [
    (id: string) => `/api/thesis-groups/${id}`,
    (id: string) => `/api/groups/${id}`,
]

const EXCEL_MIME =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function toStringSafe(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function toNullableString(value: unknown): string | null {
    if (value === null) return null
    return toStringSafe(value)
}

function toNumberSafe(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return null
}

function toIntSafe(value: unknown, fallback = 0): number {
    const n = toNumberSafe(value)
    if (n === null) return fallback
    return Math.trunc(n)
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

function formatPercent(value: number | null): string {
    if (value === null || Number.isNaN(value)) return "—"
    return `${value.toFixed(2)}%`
}

function statusTone(status: string): string {
    const normalized = status.trim().toLowerCase()

    if (normalized === "submitted") {
        return "border-blue-600/40 bg-blue-600/10 text-foreground"
    }

    if (normalized === "locked") {
        return "border-emerald-600/40 bg-emerald-600/10 text-foreground"
    }

    if (normalized === "pending") {
        return "border-amber-600/40 bg-amber-600/10 text-foreground"
    }

    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload.evaluations)) return payload.evaluations
    if (Array.isArray(payload.rankings)) return payload.rankings

    if (isRecord(payload.data)) {
        if (Array.isArray(payload.data.items)) return payload.data.items
        if (Array.isArray(payload.data.evaluations)) return payload.data.evaluations
        if (Array.isArray(payload.data.rankings)) return payload.data.rankings
    }

    if (isRecord(payload.result)) {
        if (Array.isArray(payload.result.items)) return payload.result.items
        if (Array.isArray(payload.result.evaluations)) return payload.result.evaluations
        if (Array.isArray(payload.result.rankings)) return payload.result.rankings
    }

    return []
}

function extractObjectPayload(payload: unknown): Record<string, unknown> | null {
    if (!isRecord(payload)) return null

    if (isRecord(payload.item)) return payload.item
    if (isRecord(payload.data)) return payload.data
    if (isRecord(payload.result)) return payload.result
    if (isRecord(payload.user)) return payload.user
    if (isRecord(payload.group)) return payload.group
    if (isRecord(payload.schedule)) return payload.schedule
    if (isRecord(payload.evaluation)) return payload.evaluation

    return payload
}

function normalizeEvaluation(raw: unknown): EvaluationItem | null {
    if (!isRecord(raw)) return null

    const source = isRecord(raw.evaluation) ? raw.evaluation : raw

    const id = toStringSafe(source.id ?? raw.id)
    const schedule_id = toStringSafe(
        source.schedule_id ?? source.scheduleId ?? raw.schedule_id,
    )
    const evaluator_id = toStringSafe(
        source.evaluator_id ?? source.evaluatorId ?? raw.evaluator_id,
    )

    if (!id || !schedule_id || !evaluator_id) return null

    const status = toStringSafe(source.status ?? raw.status) ?? "pending"

    return {
        id,
        schedule_id,
        evaluator_id,
        status,
        created_at: toNullableString(source.created_at ?? source.createdAt ?? raw.created_at),
        submitted_at: toNullableString(
            source.submitted_at ?? source.submittedAt ?? raw.submitted_at,
        ),
        locked_at: toNullableString(source.locked_at ?? source.lockedAt ?? raw.locked_at),
    }
}

function normalizeRanking(raw: unknown): RankingItem | null {
    if (!isRecord(raw)) return null

    const source = isRecord(raw.ranking) ? raw.ranking : raw

    const group_id = toStringSafe(source.group_id ?? source.groupId ?? raw.group_id)
    if (!group_id) return null

    const rank = toIntSafe(source.rank ?? raw.rank, 0)
    const group_title =
        toStringSafe(source.group_title ?? source.groupTitle ?? raw.group_title) ??
        "Untitled Group"

    return {
        rank,
        group_id,
        group_title,
        group_percentage: toNumberSafe(
            source.group_percentage ?? source.groupPercentage ?? raw.group_percentage,
        ),
        submitted_evaluations: toIntSafe(
            source.submitted_evaluations ??
            source.submittedEvaluations ??
            raw.submitted_evaluations,
            0,
        ),
        latest_defense_at: toNullableString(
            source.latest_defense_at ?? source.latestDefenseAt ?? raw.latest_defense_at,
        ),
    }
}

function normalizeUserMini(raw: unknown): UserMini | null {
    if (!isRecord(raw)) return null
    const source = isRecord(raw.user) ? raw.user : raw

    const id = toStringSafe(source.id ?? raw.id)
    const name = toStringSafe(source.name ?? raw.name)

    if (!id || !name) return null
    return { id, name }
}

function normalizeDefenseScheduleMini(raw: unknown): DefenseScheduleMini | null {
    if (!isRecord(raw)) return null
    const source = isRecord(raw.schedule) ? raw.schedule : raw

    const id = toStringSafe(source.id ?? raw.id)
    if (!id) return null

    return {
        id,
        group_id: toStringSafe(source.group_id ?? source.groupId ?? raw.group_id),
        scheduled_at: toNullableString(source.scheduled_at ?? source.scheduledAt ?? raw.scheduled_at),
        room: toNullableString(source.room ?? raw.room),
    }
}

function normalizeThesisGroupMini(raw: unknown): ThesisGroupMini | null {
    if (!isRecord(raw)) return null
    const source = isRecord(raw.group) ? raw.group : raw

    const id = toStringSafe(source.id ?? raw.id)
    if (!id) return null

    const title =
        toStringSafe(source.title ?? source.group_title ?? source.groupTitle ?? raw.title) ??
        "Untitled Group"

    return { id, title }
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

async function fetchFirstSuccessfulArray(endpoints: string[]): Promise<unknown[]> {
    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            const payload = (await res.json().catch(() => null)) as unknown
            if (!res.ok) continue
            const parsed = extractArrayPayload(payload)
            if (parsed.length > 0) return parsed
        } catch {
            // try next endpoint
        }
    }
    return []
}

async function fetchEntityByIdFromFactories(
    id: string,
    factories: Array<(id: string) => string>,
): Promise<Record<string, unknown> | null> {
    for (const makeUrl of factories) {
        try {
            const res = await fetch(makeUrl(id), { cache: "no-store" })
            const payload = (await res.json().catch(() => null)) as unknown
            if (!res.ok) continue
            const item = extractObjectPayload(payload)
            if (item) return item
        } catch {
            // try next endpoint
        }
    }
    return null
}

function formatScheduleLabel(
    groupTitle: string | null,
    scheduledAt: string | null,
    room: string | null,
): string {
    const chunks: string[] = [groupTitle ?? "Defense Schedule"]

    if (scheduledAt) {
        const when = formatDateTime(scheduledAt)
        if (when !== "—") {
            chunks.push(when)
        }
    }

    if (room) {
        chunks.push(room)
    }

    return chunks.join(" • ")
}

function getEvaluatorDisplayName(
    evaluatorId: string,
    evaluatorNameMap: Record<string, string>,
): string {
    return evaluatorNameMap[evaluatorId] ?? "Unknown Evaluator"
}

function getScheduleDisplayName(
    scheduleId: string,
    scheduleNameMap: Record<string, string>,
): string {
    return scheduleNameMap[scheduleId] ?? "Defense Schedule"
}

function getRankingGroupDisplayName(
    item: RankingItem,
    groupNameMap: Record<string, string>,
): string {
    return groupNameMap[item.group_id] ?? item.group_title ?? "Untitled Group"
}

function thinBorder(color = "D1D5DB") {
    return {
        top: { style: "thin", color: { rgb: color } },
        bottom: { style: "thin", color: { rgb: color } },
        left: { style: "thin", color: { rgb: color } },
        right: { style: "thin", color: { rgb: color } },
    }
}

function headerStyle(fillRgb: string): Record<string, unknown> {
    return {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: fillRgb } },
        border: thinBorder("C7D2FE"),
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
    }
}

function evaluationDataStyle(
    striped: boolean,
    align: "left" | "center" = "left",
): Record<string, unknown> {
    return {
        font: { color: { rgb: "111827" } },
        fill: {
            patternType: "solid",
            fgColor: { rgb: striped ? "F8FAFC" : "FFFFFF" },
        },
        border: thinBorder(),
        alignment: { horizontal: align, vertical: "center", wrapText: true },
    }
}

function statusDataStyle(status: string): Record<string, unknown> {
    const normalized = status.trim().toLowerCase()
    const palette: Record<string, { bg: string; fg: string }> = {
        submitted: { bg: "DBEAFE", fg: "1D4ED8" },
        locked: { bg: "D1FAE5", fg: "047857" },
        pending: { bg: "FEF3C7", fg: "B45309" },
    }

    const selected = palette[normalized] ?? { bg: "E5E7EB", fg: "374151" }

    return {
        font: { bold: true, color: { rgb: selected.fg } },
        fill: { patternType: "solid", fgColor: { rgb: selected.bg } },
        border: thinBorder(),
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
    }
}

function rankingDataStyle(
    striped: boolean,
    align: "left" | "center" = "left",
): Record<string, unknown> {
    return {
        font: { color: { rgb: "111827" } },
        fill: {
            patternType: "solid",
            fgColor: { rgb: striped ? "F8FAFC" : "FFFFFF" },
        },
        border: thinBorder(),
        alignment: { horizontal: align, vertical: "center", wrapText: true },
    }
}

function createEvaluationsSheet(
    items: EvaluationItem[],
    scheduleNameMap: Record<string, string>,
    evaluatorNameMap: Record<string, string>,
): XLSX.WorkSheet {
    const rows = [
        [
            "No.",
            "Schedule",
            "Evaluator",
            "Status",
            "Created At",
            "Submitted At",
            "Locked At",
        ],
        ...items.map((item, idx) => [
            idx + 1,
            getScheduleDisplayName(item.schedule_id, scheduleNameMap),
            getEvaluatorDisplayName(item.evaluator_id, evaluatorNameMap),
            toTitleCase(item.status),
            formatDateTime(item.created_at),
            formatDateTime(item.submitted_at),
            formatDateTime(item.locked_at),
        ]),
    ]

    const ws = XLSX.utils.aoa_to_sheet(rows)

    ws["!cols"] = [
        { wch: 8 },
        { wch: 48 },
        { wch: 30 },
        { wch: 14 },
        { wch: 24 },
        { wch: 24 },
        { wch: 24 },
    ]

    ws["!rows"] = Array.from({ length: rows.length }, (_, idx) => ({
        hpt: idx === 0 ? 24 : 20,
    }))

    const ref = ws["!ref"]
    if (!ref) return ws

    const range = XLSX.utils.decode_range(ref)

    for (let r = range.s.r; r <= range.e.r; r += 1) {
        for (let c = range.s.c; c <= range.e.c; c += 1) {
            const addr = XLSX.utils.encode_cell({ r, c })
            const cell = ws[addr] as StyledCell | undefined
            if (!cell) continue

            if (r === 0) {
                cell.s = headerStyle("2563EB")
                continue
            }

            const striped = r % 2 === 0

            if (c === 3) {
                cell.s = statusDataStyle(String(cell.v ?? ""))
                continue
            }

            const align = c === 0 || c >= 4 ? "center" : "left"
            cell.s = evaluationDataStyle(striped, align)
        }
    }

    return ws
}

function createRankingsSheet(
    items: RankingItem[],
    groupNameMap: Record<string, string>,
): XLSX.WorkSheet {
    const rows = [
        [
            "Rank",
            "Group",
            "Percentage",
            "Submitted Evaluations",
            "Latest Defense",
        ],
        ...items.map((item) => [
            item.rank > 0 ? item.rank : "—",
            getRankingGroupDisplayName(item, groupNameMap),
            formatPercent(item.group_percentage),
            item.submitted_evaluations,
            formatDateTime(item.latest_defense_at),
        ]),
    ]

    const ws = XLSX.utils.aoa_to_sheet(rows)

    ws["!cols"] = [
        { wch: 12 },
        { wch: 50 },
        { wch: 16 },
        { wch: 24 },
        { wch: 24 },
    ]

    ws["!rows"] = Array.from({ length: rows.length }, (_, idx) => ({
        hpt: idx === 0 ? 24 : 20,
    }))

    const ref = ws["!ref"]
    if (!ref) return ws

    const range = XLSX.utils.decode_range(ref)

    for (let r = range.s.r; r <= range.e.r; r += 1) {
        for (let c = range.s.c; c <= range.e.c; c += 1) {
            const addr = XLSX.utils.encode_cell({ r, c })
            const cell = ws[addr] as StyledCell | undefined
            if (!cell) continue

            if (r === 0) {
                cell.s = headerStyle("7C3AED")
                continue
            }

            const striped = r % 2 === 0
            const align = c === 0 || c === 2 || c === 3 ? "center" : "left"
            cell.s = rankingDataStyle(striped, align)

            if (c === 0) {
                const rankValue = Number(cell.v)
                if (rankValue === 1) {
                    cell.s = {
                        ...rankingDataStyle(striped, "center"),
                        font: { bold: true, color: { rgb: "854D0E" } },
                        fill: { patternType: "solid", fgColor: { rgb: "FEF9C3" } },
                    }
                } else if (rankValue === 2) {
                    cell.s = {
                        ...rankingDataStyle(striped, "center"),
                        font: { bold: true, color: { rgb: "334155" } },
                        fill: { patternType: "solid", fgColor: { rgb: "E2E8F0" } },
                    }
                } else if (rankValue === 3) {
                    cell.s = {
                        ...rankingDataStyle(striped, "center"),
                        font: { bold: true, color: { rgb: "7C2D12" } },
                        fill: { patternType: "solid", fgColor: { rgb: "FFEDD5" } },
                    }
                }
            }
        }
    }

    return ws
}

function buildWorkbook(
    evaluations: EvaluationItem[],
    rankings: RankingItem[],
    maps: {
        evaluatorNameMap: Record<string, string>
        scheduleNameMap: Record<string, string>
        groupNameMap: Record<string, string>
    },
): XLSX.WorkBook {
    const wb = XLSX.utils.book_new()
    const evaluationsSheet = createEvaluationsSheet(
        evaluations,
        maps.scheduleNameMap,
        maps.evaluatorNameMap,
    )
    const rankingsSheet = createRankingsSheet(rankings, maps.groupNameMap)

    XLSX.utils.book_append_sheet(wb, evaluationsSheet, "Evaluations")
    XLSX.utils.book_append_sheet(wb, rankingsSheet, "Rankings")

    return wb
}

function previewCellText(value: unknown): string {
    if (value === null || value === undefined) return ""
    if (typeof value === "string") return value
    if (typeof value === "number" || typeof value === "boolean") return String(value)

    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

function isLikelyColumnLettersRow(row: string[]): boolean {
    if (row.length < 2) return false
    return row.every((cell, idx) => cell.trim().toUpperCase() === XLSX.utils.encode_col(idx))
}

function normalizePreviewFromRendererRows(rawRows: unknown[][]): {
    headers: string[]
    rows: string[][]
} {
    const matrix = rawRows
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) => row.map((value) => previewCellText(value)))

    if (matrix.length === 0) {
        return { headers: ["No Columns"], rows: [] }
    }

    let headerIndex = matrix.findIndex((row) =>
        row.some((cell) => cell.trim().length > 0),
    )

    if (headerIndex < 0) {
        return { headers: ["No Columns"], rows: [] }
    }

    if (
        isLikelyColumnLettersRow(matrix[headerIndex]) &&
        matrix[headerIndex + 1] &&
        matrix[headerIndex + 1].some((cell) => cell.trim().length > 0)
    ) {
        headerIndex += 1
    }

    let headers = matrix[headerIndex].map(
        (cell, idx) => cell.trim() || `Column ${idx + 1}`,
    )

    let bodyRows = matrix.slice(headerIndex + 1)

    const widest = Math.max(headers.length, ...bodyRows.map((row) => row.length), 0)

    if (widest > headers.length) {
        headers = [
            ...headers,
            ...Array.from(
                { length: widest - headers.length },
                (_, idx) => `Column ${headers.length + idx + 1}`,
            ),
        ]
    }

    bodyRows = bodyRows.map((row) =>
        Array.from({ length: headers.length }, (_, idx) => row[idx] ?? ""),
    )

    return {
        headers: headers.length > 0 ? headers : ["No Columns"],
        rows: bodyRows,
    }
}

export default function StaffReportsPage() {
    const [evaluations, setEvaluations] = React.useState<EvaluationItem[]>([])
    const [rankings, setRankings] = React.useState<RankingItem[]>([])

    const [evaluatorNameMap, setEvaluatorNameMap] = React.useState<Record<string, string>>({})
    const [scheduleNameMap, setScheduleNameMap] = React.useState<Record<string, string>>({})
    const [groupNameMap, setGroupNameMap] = React.useState<Record<string, string>>({})
    const [resolvingNames, setResolvingNames] = React.useState(false)

    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [rankingError, setRankingError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")

    const [previewLoading, setPreviewLoading] = React.useState(false)
    const [downloadLoading, setDownloadLoading] = React.useState(false)
    const [excelPreview, setExcelPreview] = React.useState<ExcelPreview | null>(null)

    const hydrateDisplayNames = React.useCallback(
        async (evaluationItems: EvaluationItem[], rankingItems: RankingItem[]) => {
            const evaluatorIds = Array.from(
                new Set(evaluationItems.map((item) => item.evaluator_id)),
            )
            const scheduleIds = Array.from(
                new Set(evaluationItems.map((item) => item.schedule_id)),
            )
            const rankingGroupIds = Array.from(
                new Set(rankingItems.map((item) => item.group_id)),
            )

            if (
                evaluatorIds.length === 0 &&
                scheduleIds.length === 0 &&
                rankingGroupIds.length === 0
            ) {
                setEvaluatorNameMap({})
                setScheduleNameMap({})
                setGroupNameMap({})
                return
            }

            setResolvingNames(true)

            try {
                const nextEvaluatorMap: Record<string, string> = {}
                const nextScheduleMap: Record<string, string> = {}
                const nextGroupMap: Record<string, string> = {}

                const evaluatorIdSet = new Set(evaluatorIds)
                const scheduleIdSet = new Set(scheduleIds)

                // 1) Resolve evaluators (users)
                if (evaluatorIds.length > 0) {
                    const users = (await fetchFirstSuccessfulArray(USERS_LIST_ENDPOINT_CANDIDATES))
                        .map(normalizeUserMini)
                        .filter((row): row is UserMini => row !== null)

                    for (const user of users) {
                        if (evaluatorIdSet.has(user.id)) {
                            nextEvaluatorMap[user.id] = user.name
                        }
                    }

                    const missingEvaluatorIds = evaluatorIds.filter(
                        (id) => !nextEvaluatorMap[id],
                    )

                    if (missingEvaluatorIds.length > 0) {
                        await Promise.all(
                            missingEvaluatorIds.map(async (id) => {
                                const entity = await fetchEntityByIdFromFactories(
                                    id,
                                    USER_BY_ID_ENDPOINT_FACTORIES,
                                )
                                if (!entity) return
                                const user = normalizeUserMini(entity)
                                if (user?.name) {
                                    nextEvaluatorMap[id] = user.name
                                }
                            }),
                        )
                    }
                }

                // 2) Resolve schedules
                const scheduleById: Record<string, DefenseScheduleMini> = {}

                if (scheduleIds.length > 0) {
                    const schedules = (await fetchFirstSuccessfulArray(DEFENSE_SCHEDULES_LIST_ENDPOINT_CANDIDATES))
                        .map(normalizeDefenseScheduleMini)
                        .filter((row): row is DefenseScheduleMini => row !== null)

                    for (const schedule of schedules) {
                        if (scheduleIdSet.has(schedule.id)) {
                            scheduleById[schedule.id] = schedule
                        }
                    }

                    const missingScheduleIds = scheduleIds.filter(
                        (id) => !scheduleById[id],
                    )

                    if (missingScheduleIds.length > 0) {
                        await Promise.all(
                            missingScheduleIds.map(async (id) => {
                                const entity = await fetchEntityByIdFromFactories(
                                    id,
                                    DEFENSE_SCHEDULE_BY_ID_ENDPOINT_FACTORIES,
                                )
                                if (!entity) return
                                const schedule = normalizeDefenseScheduleMini(entity)
                                if (schedule) {
                                    scheduleById[id] = schedule
                                }
                            }),
                        )
                    }
                }

                // 3) Resolve group titles from ranking + schedules
                const groupIdSet = new Set<string>(rankingGroupIds)
                for (const schedule of Object.values(scheduleById)) {
                    if (schedule.group_id) {
                        groupIdSet.add(schedule.group_id)
                    }
                }

                const groupIds = Array.from(groupIdSet)

                if (groupIds.length > 0) {
                    const groupIdLookup = new Set(groupIds)

                    const groups = (await fetchFirstSuccessfulArray(THESIS_GROUPS_LIST_ENDPOINT_CANDIDATES))
                        .map(normalizeThesisGroupMini)
                        .filter((row): row is ThesisGroupMini => row !== null)

                    for (const group of groups) {
                        if (groupIdLookup.has(group.id)) {
                            nextGroupMap[group.id] = group.title
                        }
                    }

                    const missingGroupIds = groupIds.filter((id) => !nextGroupMap[id])

                    if (missingGroupIds.length > 0) {
                        await Promise.all(
                            missingGroupIds.map(async (id) => {
                                const entity = await fetchEntityByIdFromFactories(
                                    id,
                                    THESIS_GROUP_BY_ID_ENDPOINT_FACTORIES,
                                )
                                if (!entity) return
                                const group = normalizeThesisGroupMini(entity)
                                if (group?.title) {
                                    nextGroupMap[id] = group.title
                                }
                            }),
                        )
                    }
                }

                // 4) Build schedule labels using resolved group titles
                for (const scheduleId of scheduleIds) {
                    const schedule = scheduleById[scheduleId]
                    if (!schedule) {
                        nextScheduleMap[scheduleId] = "Defense Schedule"
                        continue
                    }

                    const groupTitle = schedule.group_id
                        ? nextGroupMap[schedule.group_id] ?? null
                        : null

                    nextScheduleMap[scheduleId] = formatScheduleLabel(
                        groupTitle,
                        schedule.scheduled_at,
                        schedule.room,
                    )
                }

                setEvaluatorNameMap(nextEvaluatorMap)
                setScheduleNameMap(nextScheduleMap)
                setGroupNameMap(nextGroupMap)
            } finally {
                setResolvingNames(false)
            }
        },
        [],
    )

    const loadReports = React.useCallback(
        async ({ silent = false }: { silent?: boolean } = {}) => {
            setLoading(true)
            setError(null)
            setRankingError(null)

            let evalLoaded = false
            let rankingLoaded = false
            let latestEvalError = "Unable to load evaluation report data."
            let latestRankingError = "Unable to load rankings."

            let loadedEvaluations: EvaluationItem[] = []
            let loadedRankings: RankingItem[] = []

            for (const endpoint of EVALUATION_ENDPOINT_CANDIDATES) {
                try {
                    const res = await fetch(endpoint, { cache: "no-store" })
                    const payload = (await res.json().catch(() => null)) as unknown

                    if (!res.ok) {
                        latestEvalError = await readErrorMessage(res, payload)
                        continue
                    }

                    const parsed = extractArrayPayload(payload)
                        .map(normalizeEvaluation)
                        .filter((item): item is EvaluationItem => item !== null)
                        .sort((a, b) => {
                            const ta = a.created_at ? new Date(a.created_at).getTime() : 0
                            const tb = b.created_at ? new Date(b.created_at).getTime() : 0
                            return tb - ta
                        })

                    loadedEvaluations = parsed
                    setEvaluations(parsed)
                    evalLoaded = true
                    break
                } catch (err) {
                    latestEvalError =
                        err instanceof Error
                            ? err.message
                            : "Unable to load evaluation report data."
                }
            }

            if (!evalLoaded) {
                loadedEvaluations = []
                setEvaluations([])
                setEvaluatorNameMap({})
                setScheduleNameMap({})
                setError(
                    `${latestEvalError} No evaluation endpoint responded successfully.`,
                )
            }

            for (const endpoint of RANKING_ENDPOINT_CANDIDATES) {
                try {
                    const res = await fetch(endpoint, { cache: "no-store" })
                    const payload = (await res.json().catch(() => null)) as unknown

                    if (!res.ok) {
                        latestRankingError = await readErrorMessage(res, payload)
                        continue
                    }

                    const parsed = extractArrayPayload(payload)
                        .map(normalizeRanking)
                        .filter((item): item is RankingItem => item !== null)
                        .sort((a, b) => a.rank - b.rank)

                    loadedRankings = parsed
                    setRankings(parsed)
                    rankingLoaded = true
                    break
                } catch (err) {
                    latestRankingError =
                        err instanceof Error ? err.message : "Unable to load rankings."
                }
            }

            if (!rankingLoaded) {
                loadedRankings = []
                setRankings([])
                setGroupNameMap({})
                setRankingError(
                    `${latestRankingError} Rankings table will remain empty until a rankings endpoint is available.`,
                )
            }

            if (evalLoaded || rankingLoaded) {
                await hydrateDisplayNames(loadedEvaluations, loadedRankings)
            }

            if (!silent) {
                if (evalLoaded && rankingLoaded) {
                    toast.success("Reports refreshed successfully.")
                } else if (evalLoaded || rankingLoaded) {
                    toast.warning("Reports refreshed with partial data.")
                } else {
                    toast.error("Unable to refresh reports.")
                }
            }

            setLoading(false)
        },
        [hydrateDisplayNames],
    )

    React.useEffect(() => {
        void loadReports({ silent: true })
    }, [loadReports])

    const filteredEvaluations = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return evaluations.filter((item) => {
            const status = item.status.toLowerCase()

            if (statusFilter !== "all" && status !== statusFilter) {
                return false
            }

            if (!q) return true

            const evaluatorName = getEvaluatorDisplayName(
                item.evaluator_id,
                evaluatorNameMap,
            ).toLowerCase()

            const scheduleName = getScheduleDisplayName(
                item.schedule_id,
                scheduleNameMap,
            ).toLowerCase()

            return (
                item.id.toLowerCase().includes(q) ||
                scheduleName.includes(q) ||
                evaluatorName.includes(q) ||
                item.status.toLowerCase().includes(q)
            )
        })
    }, [evaluations, evaluatorNameMap, scheduleNameMap, search, statusFilter])

    const totals = React.useMemo(() => {
        let pending = 0
        let submitted = 0
        let locked = 0

        for (const item of evaluations) {
            const s = item.status.toLowerCase()
            if (s === "pending") pending += 1
            else if (s === "submitted") submitted += 1
            else if (s === "locked") locked += 1
        }

        const total = evaluations.length
        const completed = submitted + locked
        const completionRate = total > 0 ? (completed / total) * 100 : 0

        return {
            total,
            pending,
            submitted,
            locked,
            completionRate,
        }
    }, [evaluations])

    const createExportPayload = React.useCallback(() => {
        const fileName = `staff-reports-${new Date().toISOString().slice(0, 10)}.xlsx`
        const workbook = buildWorkbook(filteredEvaluations, rankings, {
            evaluatorNameMap,
            scheduleNameMap,
            groupNameMap,
        })

        return { fileName, workbook }
    }, [filteredEvaluations, rankings, evaluatorNameMap, scheduleNameMap, groupNameMap])

    const handlePreviewExcel = React.useCallback(async () => {
        if (filteredEvaluations.length === 0) {
            toast.info("No evaluation records to preview.")
            return
        }

        setPreviewLoading(true)

        try {
            const { fileName, workbook } = createExportPayload()

            const workbookBytes = XLSX.write(workbook, {
                bookType: "xlsx",
                type: "array",
            })

            const file = new File([workbookBytes], fileName, { type: EXCEL_MIME })

            const excelRendererModule = await import("react-excel-renderer")

            const parsed = await new Promise<{
                cols?: Array<{ name?: string; key?: string }>
                rows?: unknown[][]
            }>((resolve, reject) => {
                excelRendererModule.ExcelRenderer(file, (err, resp) => {
                    if (err) {
                        reject(err)
                        return
                    }
                    resolve((resp ?? {}) as { cols?: Array<{ name?: string; key?: string }>; rows?: unknown[][] })
                })
            })

            const rawRows = Array.isArray(parsed.rows) ? parsed.rows : []
            const normalized = normalizePreviewFromRendererRows(rawRows)

            setExcelPreview({
                fileName,
                generatedAt: new Date().toISOString(),
                headers: normalized.headers,
                rows: normalized.rows,
            })

            toast.success("Excel preview is ready.")
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : "Failed to preview the Excel export.",
            )
        } finally {
            setPreviewLoading(false)
        }
    }, [createExportPayload, filteredEvaluations.length])

    const handleDownloadExcel = React.useCallback(async () => {
        if (filteredEvaluations.length === 0) {
            toast.info("No evaluation records to export.")
            return
        }

        setDownloadLoading(true)

        try {
            const { fileName, workbook } = createExportPayload()
            XLSX.writeFile(workbook, fileName)
            toast.success("Excel export downloaded.")
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : "Failed to download Excel export.",
            )
        } finally {
            setDownloadLoading(false)
        }
    }, [createExportPayload, filteredEvaluations.length])

    const previewRows = React.useMemo(
        () => (excelPreview ? excelPreview.rows.slice(0, 80) : []),
        [excelPreview],
    )

    return (
        <DashboardLayout
            title="Reports"
            description="Track evaluation progress and review ranking snapshots for staff operations."
        >
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <Input
                                placeholder="Search by schedule, evaluator name, status, or evaluation reference"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full md:max-w-xl"
                            />

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => void loadReports({ silent: false })}
                                    disabled={loading}
                                >
                                    <RefreshCw
                                        className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
                                    />
                                    Refresh
                                </Button>

                                <Button
                                    variant="outline"
                                    onClick={() => void handlePreviewExcel()}
                                    disabled={loading || previewLoading || filteredEvaluations.length === 0}
                                >
                                    {previewLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Preparing Preview...
                                        </>
                                    ) : (
                                        <>
                                            <FileSpreadsheet className="mr-2 h-4 w-4" />
                                            Preview Excel
                                        </>
                                    )}
                                </Button>

                                <Button
                                    onClick={() => void handleDownloadExcel()}
                                    disabled={loading || downloadLoading || filteredEvaluations.length === 0}
                                >
                                    {downloadLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Downloading...
                                        </>
                                    ) : (
                                        <>
                                            <Download className="mr-2 h-4 w-4" />
                                            Download Excel
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">
                                Filter by status
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {STATUS_FILTERS.map((status) => {
                                    const active = statusFilter === status
                                    const label = status === "all" ? "All" : toTitleCase(status)

                                    return (
                                        <Button
                                            key={status}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setStatusFilter(status)}
                                        >
                                            {label}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Total</p>
                                <p className="text-lg font-semibold">{totals.total}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Pending</p>
                                <p className="text-lg font-semibold">{totals.pending}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Submitted</p>
                                <p className="text-lg font-semibold">{totals.submitted}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Locked</p>
                                <p className="text-lg font-semibold">{totals.locked}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Completion</p>
                                <p className="text-lg font-semibold">
                                    {totals.completionRate.toFixed(2)}%
                                </p>
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Showing{" "}
                            <span className="font-semibold text-foreground">
                                {filteredEvaluations.length}
                            </span>{" "}
                            of{" "}
                            <span className="font-semibold text-foreground">
                                {evaluations.length}
                            </span>{" "}
                            evaluation record(s).
                        </p>

                        {resolvingNames ? (
                            <p className="text-xs text-muted-foreground">
                                Resolving related names for schedules and evaluators...
                            </p>
                        ) : null}
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                {rankingError ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                        {rankingError}
                    </div>
                ) : null}

                <div className="overflow-x-auto rounded-lg border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-16">#</TableHead>
                                <TableHead className="min-w-72">Schedule</TableHead>
                                <TableHead className="min-w-56">Evaluator</TableHead>
                                <TableHead className="min-w-32">Status</TableHead>
                                <TableHead className="min-w-44">Created</TableHead>
                                <TableHead className="min-w-44">Submitted</TableHead>
                                <TableHead className="min-w-44">Locked</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <TableRow key={`skeleton-${i}`}>
                                        <TableCell colSpan={7}>
                                            <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredEvaluations.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                        No evaluation records found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredEvaluations.map((item, idx) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">{idx + 1}</TableCell>
                                        <TableCell className="max-w-136">
                                            <span className="block truncate">
                                                {getScheduleDisplayName(item.schedule_id, scheduleNameMap)}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {getEvaluatorDisplayName(item.evaluator_id, evaluatorNameMap)}
                                        </TableCell>
                                        <TableCell>
                                            <span
                                                className={[
                                                    "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                    statusTone(item.status),
                                                ].join(" ")}
                                            >
                                                {toTitleCase(item.status)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {formatDateTime(item.created_at)}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {formatDateTime(item.submitted_at)}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {formatDateTime(item.locked_at)}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                <div className="rounded-lg border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-semibold">Ranking Snapshot</h2>
                        <p className="text-xs text-muted-foreground">
                            Top groups based on available ranking endpoint data
                        </p>
                    </div>

                    <div className="overflow-x-auto rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="min-w-24">Rank</TableHead>
                                    <TableHead className="min-w-64">Group</TableHead>
                                    <TableHead className="min-w-40">Percentage</TableHead>
                                    <TableHead className="min-w-48">Submitted Evaluations</TableHead>
                                    <TableHead className="min-w-56">Latest Defense</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={`rank-skeleton-${i}`}>
                                            <TableCell colSpan={5}>
                                                <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : rankings.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                                            No ranking data available.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rankings.map((item) => (
                                        <TableRow key={`${item.group_id}-${item.rank}`}>
                                            <TableCell className="font-medium">
                                                {item.rank > 0 ? item.rank : "—"}
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-medium">
                                                    {getRankingGroupDisplayName(item, groupNameMap)}
                                                </span>
                                            </TableCell>
                                            <TableCell>{formatPercent(item.group_percentage)}</TableCell>
                                            <TableCell>{item.submitted_evaluations}</TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {formatDateTime(item.latest_defense_at)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>

            <Dialog
                open={Boolean(excelPreview)}
                onOpenChange={(open) => {
                    if (!open) setExcelPreview(null)
                }}
            >
                {excelPreview ? (
                    <DialogContent className="w-full max-w-7xl overflow-hidden p-0">
                        <div className="flex max-h-[85vh] flex-col">
                            <div className="border-b px-6 py-4">
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                        <FileSpreadsheet className="h-5 w-5" />
                                        Excel Preview
                                    </DialogTitle>
                                    <DialogDescription className="break-all">
                                        Previewing export file{" "}
                                        <span className="font-medium text-foreground">{excelPreview.fileName}</span>{" "}
                                        • Generated {formatDateTime(excelPreview.generatedAt)}
                                    </DialogDescription>
                                </DialogHeader>
                            </div>

                            <div className="min-h-0 flex-1 px-6 py-4">
                                <div className="h-full rounded-lg border">
                                    <div className="h-full overflow-auto">
                                        <div className="min-w-max">
                                            <Table className="w-full">
                                                <TableHeader className="sticky top-0 z-10 bg-background">
                                                    <TableRow>
                                                        {excelPreview.headers.map((header, idx) => (
                                                            <TableHead
                                                                key={`${header}-${idx}`}
                                                                className="min-w-40 whitespace-nowrap"
                                                            >
                                                                {header || `Column ${idx + 1}`}
                                                            </TableHead>
                                                        ))}
                                                    </TableRow>
                                                </TableHeader>

                                                <TableBody>
                                                    {previewRows.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell
                                                                colSpan={excelPreview.headers.length || 1}
                                                                className="h-20 text-center text-muted-foreground"
                                                            >
                                                                No rows available for preview.
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        previewRows.map((row, rowIndex) => (
                                                            <TableRow key={`preview-row-${rowIndex}`}>
                                                                {row.map((cell, cellIndex) => (
                                                                    <TableCell
                                                                        key={`preview-cell-${rowIndex}-${cellIndex}`}
                                                                        className="max-w-72 truncate align-top"
                                                                        title={cell || "—"}
                                                                    >
                                                                        {cell || "—"}
                                                                    </TableCell>
                                                                ))}
                                                            </TableRow>
                                                        ))
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                </div>

                                {excelPreview.rows.length > previewRows.length ? (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        Showing first {previewRows.length} of {excelPreview.rows.length} row(s).
                                    </p>
                                ) : null}
                            </div>

                            <DialogFooter className="border-t px-6 py-4">
                                <p className="mr-auto text-xs text-muted-foreground">
                                    Total rows in preview: {excelPreview.rows.length}
                                </p>

                                <Button variant="outline" onClick={() => setExcelPreview(null)}>
                                    Close
                                </Button>

                                <Button
                                    onClick={() => void handleDownloadExcel()}
                                    disabled={downloadLoading || filteredEvaluations.length === 0}
                                >
                                    {downloadLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Downloading...
                                        </>
                                    ) : (
                                        <>
                                            <Download className="mr-2 h-4 w-4" />
                                            Download Excel
                                        </>
                                    )}
                                </Button>
                            </DialogFooter>
                        </div>
                    </DialogContent>
                ) : null}
            </Dialog>
        </DashboardLayout>
    )
}
