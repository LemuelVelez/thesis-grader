"use client"

import * as React from "react"
import { toast } from "sonner"
import { Download, FileSpreadsheet, RefreshCw, X } from "lucide-react"
import * as XLSX from "xlsx-js-style"

import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
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

function createEvaluationsSheet(items: EvaluationItem[]): XLSX.WorkSheet {
    const rows = [
        [
            "Evaluation ID",
            "Schedule ID",
            "Evaluator ID",
            "Status",
            "Created At",
            "Submitted At",
            "Locked At",
        ],
        ...items.map((item) => [
            item.id,
            item.schedule_id,
            item.evaluator_id,
            toTitleCase(item.status),
            formatDateTime(item.created_at),
            formatDateTime(item.submitted_at),
            formatDateTime(item.locked_at),
        ]),
    ]

    const ws = XLSX.utils.aoa_to_sheet(rows)

    ws["!cols"] = [
        { wch: 28 },
        { wch: 24 },
        { wch: 24 },
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

            const align = c >= 4 ? "center" : "left"
            cell.s = evaluationDataStyle(striped, align)
        }
    }

    return ws
}

function createRankingsSheet(items: RankingItem[]): XLSX.WorkSheet {
    const rows = [
        [
            "Rank",
            "Group ID",
            "Group Title",
            "Percentage",
            "Submitted Evaluations",
            "Latest Defense",
        ],
        ...items.map((item) => [
            item.rank > 0 ? item.rank : "—",
            item.group_id,
            item.group_title,
            formatPercent(item.group_percentage),
            item.submitted_evaluations,
            formatDateTime(item.latest_defense_at),
        ]),
    ]

    const ws = XLSX.utils.aoa_to_sheet(rows)

    ws["!cols"] = [
        { wch: 12 },
        { wch: 22 },
        { wch: 38 },
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
            const align = c === 0 || c === 3 || c === 4 ? "center" : "left"
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
): XLSX.WorkBook {
    const wb = XLSX.utils.book_new()
    const evaluationsSheet = createEvaluationsSheet(evaluations)
    const rankingsSheet = createRankingsSheet(rankings)

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

export default function StaffReportsPage() {
    const [evaluations, setEvaluations] = React.useState<EvaluationItem[]>([])
    const [rankings, setRankings] = React.useState<RankingItem[]>([])

    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [rankingError, setRankingError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")

    const [previewLoading, setPreviewLoading] = React.useState(false)
    const [downloadLoading, setDownloadLoading] = React.useState(false)
    const [excelPreview, setExcelPreview] = React.useState<ExcelPreview | null>(null)

    const loadReports = React.useCallback(
        async ({ silent = false }: { silent?: boolean } = {}) => {
            setLoading(true)
            setError(null)
            setRankingError(null)

            let evalLoaded = false
            let rankingLoaded = false
            let latestEvalError = "Unable to load evaluation report data."
            let latestRankingError = "Unable to load rankings."

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
                setEvaluations([])
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

                    setRankings(parsed)
                    rankingLoaded = true
                    break
                } catch (err) {
                    latestRankingError =
                        err instanceof Error ? err.message : "Unable to load rankings."
                }
            }

            if (!rankingLoaded) {
                setRankings([])
                setRankingError(
                    `${latestRankingError} Rankings table will remain empty until a rankings endpoint is available.`,
                )
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
        [],
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

            return (
                item.id.toLowerCase().includes(q) ||
                item.schedule_id.toLowerCase().includes(q) ||
                item.evaluator_id.toLowerCase().includes(q) ||
                item.status.toLowerCase().includes(q)
            )
        })
    }, [evaluations, search, statusFilter])

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
        const workbook = buildWorkbook(filteredEvaluations, rankings)

        return { fileName, workbook }
    }, [filteredEvaluations, rankings])

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

            const rawCols = Array.isArray(parsed.cols) ? parsed.cols : []
            const rawRows = Array.isArray(parsed.rows) ? parsed.rows : []

            let headers = rawCols
                .map((col) => toStringSafe(col.name ?? col.key))
                .filter((value): value is string => Boolean(value))

            let bodyRows = rawRows
                .filter((row): row is unknown[] => Array.isArray(row))
                .map((row) => row.map((value) => previewCellText(value)))

            if (headers.length === 0 && bodyRows.length > 0) {
                headers = bodyRows[0].map(
                    (cell, idx) => cell || `Column ${idx + 1}`,
                )
                bodyRows = bodyRows.slice(1)
            }

            const widest = Math.max(
                headers.length,
                ...bodyRows.map((row) => row.length),
                0,
            )

            if (widest > headers.length) {
                headers = [
                    ...headers,
                    ...Array.from(
                        { length: widest - headers.length },
                        (_, idx) => `Column ${headers.length + idx + 1}`,
                    ),
                ]
            }

            const paddedRows = bodyRows.map((row) =>
                Array.from({ length: headers.length }, (_, idx) => row[idx] ?? ""),
            )

            setExcelPreview({
                fileName,
                generatedAt: new Date().toISOString(),
                headers: headers.length > 0 ? headers : ["No Columns"],
                rows: paddedRows,
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
        () => (excelPreview ? excelPreview.rows.slice(0, 40) : []),
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
                                placeholder="Search by evaluation ID, schedule ID, evaluator ID, or status"
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
                                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                                    {previewLoading ? "Preparing Preview..." : "Preview Excel"}
                                </Button>

                                <Button
                                    onClick={() => void handleDownloadExcel()}
                                    disabled={loading || downloadLoading || filteredEvaluations.length === 0}
                                >
                                    <Download className="mr-2 h-4 w-4" />
                                    {downloadLoading ? "Downloading..." : "Download Excel"}
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

                {excelPreview ? (
                    <div className="rounded-lg border bg-card p-4">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h2 className="text-sm font-semibold">Excel Preview</h2>
                                <p className="text-xs text-muted-foreground">
                                    Previewing the exported workbook first sheet ({excelPreview.fileName}) •
                                    Generated {formatDateTime(excelPreview.generatedAt)}
                                </p>
                            </div>

                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setExcelPreview(null)}
                            >
                                <X className="mr-2 h-4 w-4" />
                                Close Preview
                            </Button>
                        </div>

                        <div className="overflow-x-auto rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {excelPreview.headers.map((header, idx) => (
                                            <TableHead
                                                key={`${header}-${idx}`}
                                                className="min-w-40"
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
                                                    <TableCell key={`preview-cell-${rowIndex}-${cellIndex}`}>
                                                        {cell || "—"}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {excelPreview.rows.length > previewRows.length ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                                Showing first {previewRows.length} of {excelPreview.rows.length} row(s).
                            </p>
                        ) : null}
                    </div>
                ) : null}

                <div className="overflow-x-auto rounded-lg border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-52">Evaluation ID</TableHead>
                                <TableHead className="min-w-48">Schedule ID</TableHead>
                                <TableHead className="min-w-48">Evaluator ID</TableHead>
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
                                filteredEvaluations.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">{item.id}</TableCell>
                                        <TableCell>{item.schedule_id}</TableCell>
                                        <TableCell>{item.evaluator_id}</TableCell>
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
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-medium">{item.group_title}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        ID: {item.group_id}
                                                    </span>
                                                </div>
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
        </DashboardLayout>
    )
}
