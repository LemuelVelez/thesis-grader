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

type ThesisRole = "student" | "staff" | "admin" | "panelist"
type UserStatus = "active" | "disabled"
type EvaluationStatus = "pending" | "submitted" | "locked" | (string & {})

type UserRecord = {
    id: string
    name: string
    email: string
    role: ThesisRole
    status: UserStatus
    avatar_key: string | null
    created_at: string | null
    updated_at: string | null
}

type GroupRankingRecord = {
    group_id: string
    group_title: string
    group_percentage: number | `${number}` | null
    submitted_evaluations: number
    latest_defense_at: string | null
    rank: number
}

type EvaluationRecord = {
    id: string
    schedule_id: string
    evaluator_id: string
    status: EvaluationStatus
    submitted_at: string | null
    locked_at: string | null
    created_at: string | null
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

type FetchArrayResult = {
    ok: boolean
    items: unknown[]
    error: string | null
}

const ROLE_FILTERS: Array<"all" | ThesisRole> = ["all", "admin", "staff", "student", "panelist"]
const SUBMISSION_FILTERS: Array<"all" | "1+" | "2+" | "3+"> = ["all", "1+", "2+", "3+"]
const STATUS_FILTERS: StatusFilter[] = ["all", "pending", "submitted", "locked"]

const USERS_ENDPOINT_CANDIDATES = [
    "/api/users?limit=1000&orderBy=name&orderDirection=asc",
    "/api/users?limit=1000",
]

const RANKINGS_ENDPOINT_CANDIDATES = [
    "/api/admin/rankings?limit=200",
    "/api/admin/rankings",
    "/api/rankings?limit=200",
]

const EVALUATIONS_ENDPOINT_CANDIDATES = [
    "/api/evaluations?limit=1000&orderBy=created_at&orderDirection=desc",
    "/api/evaluations?limit=1000",
    "/api/evaluation?limit=1000",
]

const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

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

function toNumber(value: number | `${number}` | null | undefined): number | null {
    if (value === null || value === undefined) return null
    const parsed = typeof value === "number" ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : null
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

function toTitleCase(value: string) {
    if (!value) return value
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDate(value: string | null) {
    if (!value) return "—"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

function formatPercent(value: number | null, fractionDigits = 2) {
    if (value === null) return "N/A"
    return `${value.toFixed(fractionDigits)}%`
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

function parseRole(value: unknown): ThesisRole {
    const role = toStringSafe(value)?.toLowerCase()
    if (role === "admin" || role === "staff" || role === "student" || role === "panelist") {
        return role
    }
    return "student"
}

function parseUserStatus(value: unknown): UserStatus {
    return toStringSafe(value)?.toLowerCase() === "disabled" ? "disabled" : "active"
}

function extractArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload.rankings)) return payload.rankings
    if (Array.isArray(payload.evaluations)) return payload.evaluations
    if (Array.isArray(payload.users)) return payload.users

    if (isRecord(payload.data)) {
        if (Array.isArray(payload.data.items)) return payload.data.items
        if (Array.isArray(payload.data.rankings)) return payload.data.rankings
        if (Array.isArray(payload.data.evaluations)) return payload.data.evaluations
        if (Array.isArray(payload.data.users)) return payload.data.users
    }

    if (isRecord(payload.result)) {
        if (Array.isArray(payload.result.items)) return payload.result.items
        if (Array.isArray(payload.result.rankings)) return payload.result.rankings
        if (Array.isArray(payload.result.evaluations)) return payload.result.evaluations
        if (Array.isArray(payload.result.users)) return payload.result.users
    }

    return []
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

async function fetchFirstSuccessfulArray(endpoints: string[]): Promise<FetchArrayResult> {
    let latestError = "Unable to load data."

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            const payload = (await res.json().catch(() => null)) as unknown

            if (!res.ok) {
                latestError = await readErrorMessage(res, payload)
                continue
            }

            return {
                ok: true,
                items: extractArrayPayload(payload),
                error: null,
            }
        } catch (err) {
            latestError = err instanceof Error ? err.message : "Unable to load data."
        }
    }

    return {
        ok: false,
        items: [],
        error: latestError,
    }
}

function normalizeUser(raw: unknown): UserRecord | null {
    if (!isRecord(raw)) return null
    const source = isRecord(raw.user) ? raw.user : raw

    const id = toStringSafe(source.id ?? raw.id)
    const name = toStringSafe(source.name ?? raw.name)
    const email = toStringSafe(source.email ?? raw.email)

    if (!id || !name || !email) return null

    return {
        id,
        name,
        email,
        role: parseRole(source.role ?? raw.role),
        status: parseUserStatus(source.status ?? raw.status),
        avatar_key: toNullableString(source.avatar_key ?? source.avatarKey ?? raw.avatar_key),
        created_at: toNullableString(source.created_at ?? source.createdAt ?? raw.created_at),
        updated_at: toNullableString(source.updated_at ?? source.updatedAt ?? raw.updated_at),
    }
}

function normalizeRanking(raw: unknown): GroupRankingRecord | null {
    if (!isRecord(raw)) return null
    const source = isRecord(raw.ranking) ? raw.ranking : raw

    const group_id = toStringSafe(source.group_id ?? source.groupId ?? raw.group_id)
    if (!group_id) return null

    const group_title =
        toStringSafe(source.group_title ?? source.groupTitle ?? raw.group_title) ?? "Untitled Group"

    return {
        group_id,
        group_title,
        group_percentage:
            (toNumberSafe(source.group_percentage ?? source.groupPercentage ?? raw.group_percentage) ??
                null) as number | null,
        submitted_evaluations: toIntSafe(
            source.submitted_evaluations ??
            source.submittedEvaluations ??
            raw.submitted_evaluations,
            0,
        ),
        latest_defense_at: toNullableString(
            source.latest_defense_at ?? source.latestDefenseAt ?? raw.latest_defense_at,
        ),
        rank: toIntSafe(source.rank ?? raw.rank, 0),
    }
}

function normalizeEvaluation(raw: unknown): EvaluationRecord | null {
    if (!isRecord(raw)) return null
    const source = isRecord(raw.evaluation) ? raw.evaluation : raw

    const id = toStringSafe(source.id ?? raw.id)
    const schedule_id = toStringSafe(source.schedule_id ?? source.scheduleId ?? raw.schedule_id)
    const evaluator_id = toStringSafe(source.evaluator_id ?? source.evaluatorId ?? raw.evaluator_id)

    if (!id || !schedule_id || !evaluator_id) return null

    const status =
        toStringSafe(source.status ?? raw.status)?.toLowerCase() ??
        "pending"

    return {
        id,
        schedule_id,
        evaluator_id,
        status: status as EvaluationStatus,
        submitted_at: toNullableString(source.submitted_at ?? source.submittedAt ?? raw.submitted_at),
        locked_at: toNullableString(source.locked_at ?? source.lockedAt ?? raw.locked_at),
        created_at: toNullableString(source.created_at ?? source.createdAt ?? raw.created_at),
    }
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

function dataStyle(striped: boolean, align: "left" | "center" = "left"): Record<string, unknown> {
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

function evaluationStatusDataStyle(status: string): Record<string, unknown> {
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

function userStatusDataStyle(status: string): Record<string, unknown> {
    const normalized = status.trim().toLowerCase()
    const palette: Record<string, { bg: string; fg: string }> = {
        active: { bg: "DCFCE7", fg: "166534" },
        disabled: { bg: "FEE2E2", fg: "991B1B" },
    }

    const selected = palette[normalized] ?? { bg: "E5E7EB", fg: "374151" }

    return {
        font: { bold: true, color: { rgb: selected.fg } },
        fill: { patternType: "solid", fgColor: { rgb: selected.bg } },
        border: thinBorder(),
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
    }
}

function createRankingsSheet(items: GroupRankingRecord[]): XLSX.WorkSheet {
    const rows = [
        ["Rank", "Group", "Group ID", "Score", "Submitted Evaluations", "Latest Defense"],
        ...items.map((item) => [
            item.rank > 0 ? item.rank : "—",
            item.group_title,
            item.group_id,
            formatPercent(toNumber(item.group_percentage)),
            item.submitted_evaluations,
            formatDate(item.latest_defense_at),
        ]),
    ]

    const ws = XLSX.utils.aoa_to_sheet(rows)

    ws["!cols"] = [
        { wch: 12 },
        { wch: 42 },
        { wch: 40 },
        { wch: 14 },
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
            const align = c === 0 || c === 3 || c === 4 ? "center" : "left"
            cell.s = dataStyle(striped, align)

            if (c === 0) {
                const rankValue = Number(cell.v)
                if (rankValue === 1) {
                    cell.s = {
                        ...dataStyle(striped, "center"),
                        font: { bold: true, color: { rgb: "854D0E" } },
                        fill: { patternType: "solid", fgColor: { rgb: "FEF9C3" } },
                    }
                } else if (rankValue === 2) {
                    cell.s = {
                        ...dataStyle(striped, "center"),
                        font: { bold: true, color: { rgb: "334155" } },
                        fill: { patternType: "solid", fgColor: { rgb: "E2E8F0" } },
                    }
                } else if (rankValue === 3) {
                    cell.s = {
                        ...dataStyle(striped, "center"),
                        font: { bold: true, color: { rgb: "7C2D12" } },
                        fill: { patternType: "solid", fgColor: { rgb: "FFEDD5" } },
                    }
                }
            }
        }
    }

    return ws
}

function createUsersSheet(items: UserRecord[]): XLSX.WorkSheet {
    const rows = [
        ["No.", "Name", "Email", "Role", "Status", "Created At", "Updated At"],
        ...items.map((item, idx) => [
            idx + 1,
            item.name,
            item.email,
            toTitleCase(item.role),
            toTitleCase(item.status),
            formatDate(item.created_at),
            formatDate(item.updated_at),
        ]),
    ]

    const ws = XLSX.utils.aoa_to_sheet(rows)

    ws["!cols"] = [
        { wch: 8 },
        { wch: 30 },
        { wch: 36 },
        { wch: 14 },
        { wch: 14 },
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
                cell.s = headerStyle("0F766E")
                continue
            }

            const striped = r % 2 === 0

            if (c === 4) {
                cell.s = userStatusDataStyle(String(cell.v ?? ""))
                continue
            }

            const align = c === 0 || c >= 5 ? "center" : "left"
            cell.s = dataStyle(striped, align)
        }
    }

    return ws
}

function createEvaluationsSheet(items: EvaluationRecord[]): XLSX.WorkSheet {
    const rows = [
        ["No.", "Evaluation ID", "Schedule ID", "Evaluator ID", "Status", "Submitted At", "Locked At", "Created At"],
        ...items.map((item, idx) => [
            idx + 1,
            item.id,
            item.schedule_id,
            item.evaluator_id,
            toTitleCase(String(item.status)),
            formatDate(item.submitted_at),
            formatDate(item.locked_at),
            formatDate(item.created_at),
        ]),
    ]

    const ws = XLSX.utils.aoa_to_sheet(rows)

    ws["!cols"] = [
        { wch: 8 },
        { wch: 42 },
        { wch: 40 },
        { wch: 40 },
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

            if (c === 4) {
                cell.s = evaluationStatusDataStyle(String(cell.v ?? ""))
                continue
            }

            const align = c === 0 || c >= 5 ? "center" : "left"
            cell.s = dataStyle(striped, align)
        }
    }

    return ws
}

function createSummarySheet(summaryRows: Array<[string, string | number]>): XLSX.WorkSheet {
    const rows = [["Metric", "Value"], ...summaryRows]
    const ws = XLSX.utils.aoa_to_sheet(rows)

    ws["!cols"] = [{ wch: 36 }, { wch: 36 }]
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
                cell.s = headerStyle("4F46E5")
                continue
            }

            const striped = r % 2 === 0
            const align = c === 1 ? "center" : "left"
            cell.s = dataStyle(striped, align)
        }
    }

    return ws
}

function buildWorkbook(params: {
    rankings: GroupRankingRecord[]
    users: UserRecord[]
    evaluations: EvaluationRecord[]
    summaryRows: Array<[string, string | number]>
}): XLSX.WorkBook {
    const wb = XLSX.utils.book_new()

    const summarySheet = createSummarySheet(params.summaryRows)
    const rankingsSheet = createRankingsSheet(params.rankings)
    const usersSheet = createUsersSheet(params.users)
    const evaluationsSheet = createEvaluationsSheet(params.evaluations)

    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary")
    XLSX.utils.book_append_sheet(wb, rankingsSheet, "Rankings")
    XLSX.utils.book_append_sheet(wb, usersSheet, "Users")
    XLSX.utils.book_append_sheet(wb, evaluationsSheet, "Evaluations")

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

function normalizePreviewFromWorksheet(sheet: XLSX.WorkSheet): {
    headers: string[]
    rows: string[][]
} {
    const matrix = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: "",
    }) as unknown[][]

    return normalizePreviewFromRendererRows(matrix)
}

function looksCollapsedPreview(preview: { headers: string[]; rows: string[][] }): boolean {
    if (preview.headers.length <= 1) return true
    if (preview.rows.length === 0) return false
    return preview.rows.every((row) => row.length <= 1)
}

export default function AdminReportsPage() {
    const [users, setUsers] = React.useState<UserRecord[]>([])
    const [rankings, setRankings] = React.useState<GroupRankingRecord[]>([])
    const [evaluations, setEvaluations] = React.useState<EvaluationRecord[]>([])

    const [loading, setLoading] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)

    const [usersError, setUsersError] = React.useState<string | null>(null)
    const [rankingsError, setRankingsError] = React.useState<string | null>(null)
    const [evaluationsError, setEvaluationsError] = React.useState<string | null>(null)

    const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

    const [rankingSearch, setRankingSearch] = React.useState("")
    const [roleFilter, setRoleFilter] = React.useState<"all" | ThesisRole>("all")
    const [submissionFilter, setSubmissionFilter] = React.useState<"all" | "1+" | "2+" | "3+">("all")
    const [evaluationStatusFilter, setEvaluationStatusFilter] = React.useState<StatusFilter>("all")

    const [previewLoading, setPreviewLoading] = React.useState(false)
    const [downloadLoading, setDownloadLoading] = React.useState(false)
    const [excelPreview, setExcelPreview] = React.useState<ExcelPreview | null>(null)

    const loadReports = React.useCallback(
        async ({ isRefresh = false, silent = false }: { isRefresh?: boolean; silent?: boolean } = {}) => {
            if (isRefresh) {
                setRefreshing(true)
            } else {
                setLoading(true)
            }

            setUsersError(null)
            setRankingsError(null)
            setEvaluationsError(null)

            try {
                const [usersResult, rankingsResult, evaluationsResult] = await Promise.all([
                    fetchFirstSuccessfulArray(USERS_ENDPOINT_CANDIDATES),
                    fetchFirstSuccessfulArray(RANKINGS_ENDPOINT_CANDIDATES),
                    fetchFirstSuccessfulArray(EVALUATIONS_ENDPOINT_CANDIDATES),
                ])

                const nextUsers = usersResult.items
                    .map(normalizeUser)
                    .filter((item): item is UserRecord => item !== null)
                    .sort((a, b) => a.name.localeCompare(b.name))

                const nextRankings = rankingsResult.items
                    .map(normalizeRanking)
                    .filter((item): item is GroupRankingRecord => item !== null)
                    .sort((a, b) => {
                        const ar = a.rank > 0 ? a.rank : Number.MAX_SAFE_INTEGER
                        const br = b.rank > 0 ? b.rank : Number.MAX_SAFE_INTEGER
                        return ar - br
                    })

                const nextEvaluations = evaluationsResult.items
                    .map(normalizeEvaluation)
                    .filter((item): item is EvaluationRecord => item !== null)
                    .sort((a, b) => {
                        const at = a.created_at ? new Date(a.created_at).getTime() : 0
                        const bt = b.created_at ? new Date(b.created_at).getTime() : 0
                        return bt - at
                    })

                setUsers(nextUsers)
                setRankings(nextRankings)
                setEvaluations(nextEvaluations)

                setUsersError(usersResult.ok ? null : `${usersResult.error ?? "Unable to load users."}`)
                setRankingsError(rankingsResult.ok ? null : `${rankingsResult.error ?? "Unable to load rankings."}`)
                setEvaluationsError(
                    evaluationsResult.ok
                        ? null
                        : `${evaluationsResult.error ?? "Unable to load evaluations."}`,
                )

                const successCount = [usersResult.ok, rankingsResult.ok, evaluationsResult.ok].filter(Boolean).length

                if (successCount > 0) {
                    setLastUpdated(new Date().toISOString())
                }

                if (!silent) {
                    if (successCount === 3) {
                        toast.success("Reports refreshed successfully.")
                    } else if (successCount > 0) {
                        toast.warning("Reports refreshed with partial data.")
                    } else {
                        toast.error("Unable to refresh reports.")
                    }
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to load reports."
                setUsers([])
                setRankings([])
                setEvaluations([])
                setUsersError(message)
                setRankingsError(message)
                setEvaluationsError(message)

                if (!silent) {
                    toast.error(message)
                }
            } finally {
                setLoading(false)
                setRefreshing(false)
            }
        },
        [],
    )

    React.useEffect(() => {
        void loadReports({ silent: true })
    }, [loadReports])

    const userCounts = React.useMemo(() => {
        const byRole: Record<ThesisRole, number> = {
            admin: 0,
            staff: 0,
            student: 0,
            panelist: 0,
        }

        let active = 0
        let disabled = 0

        for (const user of users) {
            if (user.status === "active") active += 1
            if (user.status === "disabled") disabled += 1
            byRole[user.role] += 1
        }

        return {
            total: users.length,
            active,
            disabled,
            byRole,
        }
    }, [users])

    const rankingMetrics = React.useMemo(() => {
        const numericPercentages = rankings
            .map((r) => toNumber(r.group_percentage))
            .filter((v): v is number => v !== null)

        const average =
            numericPercentages.length > 0
                ? numericPercentages.reduce((sum, value) => sum + value, 0) / numericPercentages.length
                : null

        const top = rankings.length > 0 ? rankings[0] : null

        return {
            total: rankings.length,
            scored: numericPercentages.length,
            average,
            top,
        }
    }, [rankings])

    const evaluationCounts = React.useMemo(() => {
        const counters = {
            pending: 0,
            submitted: 0,
            locked: 0,
            other: 0,
        }

        for (const item of evaluations) {
            const status = String(item.status ?? "").trim().toLowerCase()
            if (status === "pending") counters.pending += 1
            else if (status === "submitted") counters.submitted += 1
            else if (status === "locked") counters.locked += 1
            else counters.other += 1
        }

        return counters
    }, [evaluations])

    const filteredRankings = React.useMemo(() => {
        const q = rankingSearch.trim().toLowerCase()

        const minSubmissions = (() => {
            if (submissionFilter === "1+") return 1
            if (submissionFilter === "2+") return 2
            if (submissionFilter === "3+") return 3
            return 0
        })()

        return rankings.filter((item) => {
            if (item.submitted_evaluations < minSubmissions) return false

            if (!q) return true
            return (
                item.group_title.toLowerCase().includes(q) ||
                item.group_id.toLowerCase().includes(q) ||
                String(item.rank).includes(q)
            )
        })
    }, [rankings, rankingSearch, submissionFilter])

    const roleRows = React.useMemo(() => {
        return (["admin", "staff", "student", "panelist"] as const).map((role) => {
            const roleUsers = users.filter((u) => u.role === role)
            const active = roleUsers.filter((u) => u.status === "active").length
            const disabled = roleUsers.filter((u) => u.status === "disabled").length

            return {
                role,
                total: roleUsers.length,
                active,
                disabled,
            }
        })
    }, [users])

    const filteredRecentUsers = React.useMemo(() => {
        const scoped = roleFilter === "all" ? users : users.filter((u) => u.role === roleFilter)
        return [...scoped]
            .sort((a, b) => {
                const at = a.updated_at ? new Date(a.updated_at).getTime() : 0
                const bt = b.updated_at ? new Date(b.updated_at).getTime() : 0
                return bt - at
            })
            .slice(0, 10)
    }, [users, roleFilter])

    const filteredRecentEvaluations = React.useMemo(() => {
        const scoped = evaluationStatusFilter === "all"
            ? evaluations
            : evaluations.filter(
                (e) => String(e.status).trim().toLowerCase() === evaluationStatusFilter,
            )

        return [...scoped]
            .sort((a, b) => {
                const at = a.created_at ? new Date(a.created_at).getTime() : 0
                const bt = b.created_at ? new Date(b.created_at).getTime() : 0
                return bt - at
            })
            .slice(0, 10)
    }, [evaluations, evaluationStatusFilter])

    const usersForExport = React.useMemo(() => {
        const scoped = roleFilter === "all" ? users : users.filter((u) => u.role === roleFilter)
        return [...scoped].sort((a, b) => a.name.localeCompare(b.name))
    }, [users, roleFilter])

    const evaluationsForExport = React.useMemo(() => {
        return [...evaluations].sort((a, b) => {
            const at = a.created_at ? new Date(a.created_at).getTime() : 0
            const bt = b.created_at ? new Date(b.created_at).getTime() : 0
            return bt - at
        })
    }, [evaluations])

    const hasExportData = React.useMemo(
        () =>
            filteredRankings.length > 0 ||
            usersForExport.length > 0 ||
            evaluationsForExport.length > 0,
        [filteredRankings.length, usersForExport.length, evaluationsForExport.length],
    )

    const createExportPayload = React.useCallback(() => {
        const nowIso = new Date().toISOString()
        const fileName = `admin-reports-${nowIso.slice(0, 10)}.xlsx`

        const summaryRows: Array<[string, string | number]> = [
            ["Generated At", formatDate(nowIso)],
            ["Users in Export Scope", usersForExport.length],
            ["Rankings in Export Scope", filteredRankings.length],
            ["Evaluations in Export Scope", evaluationsForExport.length],
            ["Evaluation Pending", evaluationCounts.pending],
            ["Evaluation Submitted", evaluationCounts.submitted],
            ["Evaluation Locked", evaluationCounts.locked],
            ["Evaluation Other", evaluationCounts.other],
            ["Average Group Score", formatPercent(rankingMetrics.average)],
        ]

        const workbook = buildWorkbook({
            rankings: filteredRankings,
            users: usersForExport,
            evaluations: evaluationsForExport,
            summaryRows,
        })

        return { fileName, workbook }
    }, [
        usersForExport,
        filteredRankings,
        evaluationsForExport,
        evaluationCounts.pending,
        evaluationCounts.submitted,
        evaluationCounts.locked,
        evaluationCounts.other,
        rankingMetrics.average,
    ])

    const handlePreviewExcel = React.useCallback(async () => {
        if (!hasExportData) {
            toast.info("No report data available to preview.")
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
                    resolve(
                        (resp ?? {}) as {
                            cols?: Array<{ name?: string; key?: string }>
                            rows?: unknown[][]
                        },
                    )
                })
            })

            const rawRows = Array.isArray(parsed.rows) ? parsed.rows : []
            let normalized = normalizePreviewFromRendererRows(rawRows)

            if (looksCollapsedPreview(normalized)) {
                const firstSheetName = workbook.SheetNames[0]
                const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined
                if (firstSheet) {
                    const fallback = normalizePreviewFromWorksheet(firstSheet)
                    if (!looksCollapsedPreview(fallback)) {
                        normalized = fallback
                    }
                }
            }

            setExcelPreview({
                fileName,
                generatedAt: new Date().toISOString(),
                headers: normalized.headers,
                rows: normalized.rows,
            })

            toast.success("Excel preview is ready.")
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to preview Excel export.")
        } finally {
            setPreviewLoading(false)
        }
    }, [createExportPayload, hasExportData])

    const handleDownloadExcel = React.useCallback(async () => {
        if (!hasExportData) {
            toast.info("No report data available to export.")
            return
        }

        setDownloadLoading(true)

        try {
            const { fileName, workbook } = createExportPayload()
            XLSX.writeFile(workbook, fileName)
            toast.success("Excel export downloaded.")
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to download Excel export.")
        } finally {
            setDownloadLoading(false)
        }
    }, [createExportPayload, hasExportData])

    const previewRows = React.useMemo(
        () => (excelPreview ? excelPreview.rows.slice(0, 120) : []),
        [excelPreview],
    )

    return (
        <DashboardLayout title="Reports" description="Consolidated analytics and summary reports.">
            <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <p className="text-sm text-muted-foreground">
                                Last updated:{" "}
                                <span className="font-medium text-foreground">
                                    {lastUpdated ? formatDate(lastUpdated) : "—"}
                                </span>
                            </p>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => void loadReports({ isRefresh: true, silent: false })}
                                    disabled={loading || refreshing}
                                >
                                    {loading || refreshing ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            {loading ? "Loading..." : "Refreshing..."}
                                        </>
                                    ) : (
                                        <>
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                            Refresh
                                        </>
                                    )}
                                </Button>

                                <Button
                                    variant="outline"
                                    onClick={() => void handlePreviewExcel()}
                                    disabled={loading || previewLoading || !hasExportData}
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
                                    disabled={loading || downloadLoading || !hasExportData}
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

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Total Users</p>
                                <p className="mt-1 text-2xl font-semibold">{userCounts.total}</p>
                                <p className="text-xs text-muted-foreground">
                                    Active: {userCounts.active} • Disabled: {userCounts.disabled}
                                </p>
                            </div>

                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Groups Ranked</p>
                                <p className="mt-1 text-2xl font-semibold">{rankingMetrics.total}</p>
                                <p className="text-xs text-muted-foreground">
                                    Avg Score: {formatPercent(rankingMetrics.average)}
                                </p>
                            </div>

                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Evaluations</p>
                                <p className="mt-1 text-2xl font-semibold">{evaluations.length}</p>
                                <p className="text-xs text-muted-foreground">
                                    Pending: {evaluationCounts.pending} • Submitted: {evaluationCounts.submitted}
                                </p>
                            </div>

                            <div className="rounded-md border bg-background p-3">
                                <p className="text-xs text-muted-foreground">Top Group</p>
                                <p className="mt-1 line-clamp-1 text-base font-semibold">
                                    {rankingMetrics.top?.group_title ?? "—"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {rankingMetrics.top
                                        ? `Score: ${formatPercent(toNumber(rankingMetrics.top.group_percentage))}`
                                        : "No ranking data"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {usersError ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                        Users: {usersError}
                    </div>
                ) : null}

                {rankingsError ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                        Rankings: {rankingsError}
                    </div>
                ) : null}

                {evaluationsError ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                        Evaluations: {evaluationsError}
                    </div>
                ) : null}

                <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h2 className="text-base font-semibold">Thesis Group Rankings</h2>
                                <p className="text-sm text-muted-foreground">
                                    Showing {filteredRankings.length} of {rankings.length} ranked group(s)
                                </p>
                            </div>

                            <Input
                                placeholder="Search group title, group ID, or rank"
                                value={rankingSearch}
                                onChange={(e) => setRankingSearch(e.target.value)}
                                className="w-full lg:max-w-sm"
                            />
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Minimum submitted evaluations</p>
                            <div className="flex flex-wrap gap-2">
                                {SUBMISSION_FILTERS.map((filter) => {
                                    const active = submissionFilter === filter
                                    return (
                                        <Button
                                            key={filter}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setSubmissionFilter(filter)}
                                        >
                                            {filter === "all" ? "All" : filter}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="min-w-20">Rank</TableHead>
                                    <TableHead className="min-w-64">Group</TableHead>
                                    <TableHead className="min-w-40">Score</TableHead>
                                    <TableHead className="min-w-40">Submitted</TableHead>
                                    <TableHead className="min-w-56">Latest Defense</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={`ranking-skeleton-${i}`}>
                                            <TableCell colSpan={5}>
                                                <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredRankings.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                                            No ranking records found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredRankings.map((item) => (
                                        <TableRow key={`${item.group_id}-${item.rank}`}>
                                            <TableCell className="font-medium">
                                                {item.rank > 0 ? `#${item.rank}` : "—"}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{item.group_title}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {item.group_id}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{formatPercent(toNumber(item.group_percentage))}</TableCell>
                                            <TableCell>{item.submitted_evaluations}</TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {formatDate(item.latest_defense_at)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-lg border bg-card p-4">
                        <div className="mb-3">
                            <h2 className="text-base font-semibold">User Distribution by Role</h2>
                            <p className="text-sm text-muted-foreground">Role and account status breakdown.</p>
                        </div>

                        <div className="overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Total</TableHead>
                                        <TableHead>Active</TableHead>
                                        <TableHead>Disabled</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {roleRows.map((row) => (
                                        <TableRow key={row.role}>
                                            <TableCell className="font-medium">{toTitleCase(row.role)}</TableCell>
                                            <TableCell>{row.total}</TableCell>
                                            <TableCell>{row.active}</TableCell>
                                            <TableCell>{row.disabled}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="mt-4 space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Recent users filter by role</p>
                            <div className="flex flex-wrap gap-2">
                                {ROLE_FILTERS.map((role) => {
                                    const active = roleFilter === role
                                    return (
                                        <Button
                                            key={role}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setRoleFilter(role)}
                                        >
                                            {toTitleCase(role)}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="mt-4 overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-56">User</TableHead>
                                        <TableHead className="min-w-36">Role</TableHead>
                                        <TableHead className="min-w-32">Status</TableHead>
                                        <TableHead className="min-w-56">Updated</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        Array.from({ length: 4 }).map((_, i) => (
                                            <TableRow key={`users-mini-skeleton-${i}`}>
                                                <TableCell colSpan={4}>
                                                    <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : filteredRecentUsers.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                                                No user records found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredRecentUsers.map((user) => (
                                            <TableRow key={user.id}>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{user.name}</span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {user.email}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{toTitleCase(user.role)}</TableCell>
                                                <TableCell>{toTitleCase(user.status)}</TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {formatDate(user.updated_at)}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    <div className="rounded-lg border bg-card p-4">
                        <div className="mb-3">
                            <h2 className="text-base font-semibold">Recent Evaluations</h2>
                            <p className="text-sm text-muted-foreground">
                                Latest entries with current status snapshots.
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Pending</p>
                                <p className="mt-1 text-xl font-semibold">{evaluationCounts.pending}</p>
                            </div>
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Submitted</p>
                                <p className="mt-1 text-xl font-semibold">{evaluationCounts.submitted}</p>
                            </div>
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Locked</p>
                                <p className="mt-1 text-xl font-semibold">{evaluationCounts.locked}</p>
                            </div>
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Other</p>
                                <p className="mt-1 text-xl font-semibold">{evaluationCounts.other}</p>
                            </div>
                        </div>

                        <div className="mt-4 space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Filter evaluation status</p>
                            <div className="flex flex-wrap gap-2">
                                {STATUS_FILTERS.map((status) => {
                                    const active = evaluationStatusFilter === status
                                    const label = status === "all" ? "All" : toTitleCase(status)
                                    return (
                                        <Button
                                            key={status}
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            onClick={() => setEvaluationStatusFilter(status)}
                                        >
                                            {label}
                                        </Button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="mt-4 overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-44">Evaluation ID</TableHead>
                                        <TableHead className="min-w-32">Status</TableHead>
                                        <TableHead className="min-w-44">Submitted At</TableHead>
                                        <TableHead className="min-w-44">Locked At</TableHead>
                                        <TableHead className="min-w-44">Created At</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        Array.from({ length: 4 }).map((_, i) => (
                                            <TableRow key={`eval-skeleton-${i}`}>
                                                <TableCell colSpan={5}>
                                                    <div className="h-8 w-full animate-pulse rounded-md bg-muted/50" />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : filteredRecentEvaluations.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                                                No evaluations found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredRecentEvaluations.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-medium">{item.id}</TableCell>
                                                <TableCell>
                                                    <span
                                                        className={[
                                                            "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                                                            statusTone(String(item.status)),
                                                        ].join(" ")}
                                                    >
                                                        {toTitleCase(String(item.status))}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {formatDate(item.submitted_at)}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {formatDate(item.locked_at)}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {formatDate(item.created_at)}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
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
                    <DialogContent className="w-full overflow-hidden p-0 sm:max-w-7xl">
                        <div className="flex max-h-screen flex-col">
                            <div className="border-b px-6 py-4">
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                        <FileSpreadsheet className="h-5 w-5" />
                                        Excel Preview
                                    </DialogTitle>
                                    <DialogDescription className="break-all">
                                        Previewing export file{" "}
                                        <span className="font-medium text-foreground">{excelPreview.fileName}</span>{" "}
                                        • Generated {formatDate(excelPreview.generatedAt)}
                                    </DialogDescription>
                                </DialogHeader>
                            </div>

                            <div className="min-h-0 flex-1 px-6 py-4">
                                <div className="h-full w-full overflow-auto rounded-md border">
                                    <div className="min-w-max">
                                        <Table>
                                            <TableHeader className="sticky top-0 z-10 bg-background">
                                                <TableRow>
                                                    {excelPreview.headers.map((header, idx) => (
                                                        <TableHead
                                                            key={`${header}-${idx}`}
                                                            className="align-top whitespace-pre-wrap wrap-break-word"
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
                                                                    className="max-w-xs align-top whitespace-pre-wrap wrap-break-word leading-relaxed"
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
                                    disabled={downloadLoading || !hasExportData}
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
