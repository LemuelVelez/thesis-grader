import {
    FRIENDLY_DETAIL_LABELS,
    FRIENDLY_TYPE_COPY,
    type FriendlyNotificationContent,
    type FriendlyNotificationDetail,
    type NotificationAutomationOptions,
    type NotificationRecord,
} from "@/components/notification/types"

export function shortId(value: string, size = 8) {
    if (!value) return ""
    return value.length <= size ? value : value.slice(0, size)
}

export function formatDate(value: string) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
}

export function formatDateCompact(value: string) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    })
}

export function toLabel(value: string) {
    return value
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
}

export function buildScheduleDisplayLabel(
    schedule: NotificationAutomationOptions["context"]["schedules"][number],
) {
    const when = formatDateCompact(schedule.scheduledAt)
    const roomPart = schedule.room ? ` • ${schedule.room}` : ""
    return `${when}${roomPart}`
}

export function buildEvaluationDisplayLabel(
    evaluation: NotificationAutomationOptions["context"]["evaluations"][number],
) {
    const status = toLabel(evaluation.status)
    const evaluator = evaluation.evaluatorName ? ` • ${evaluation.evaluatorName}` : ""
    return `${status}${evaluator}`
}

export function buildGroupDisplayLabel(
    group: NotificationAutomationOptions["context"]["groups"][number],
) {
    const program = group.program ? ` • ${group.program}` : ""
    const term = group.term ? ` • ${group.term}` : ""
    return `${group.label}${program}${term}`
}

export async function readErrorMessage(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { error?: string; message?: string }
        return data.error || data.message || `Request failed (${res.status})`
    } catch {
        return `Request failed (${res.status})`
    }
}

export function boolToSelectValue(value: boolean) {
    return value ? "yes" : "no"
}

export function selectValueToBool(value: string) {
    return value === "yes"
}

export function isPushSupportedInBrowser() {
    if (typeof window === "undefined") return false
    return (
        "Notification" in window &&
        "serviceWorker" in navigator &&
        "PushManager" in window
    )
}

export function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/")

    const rawData = typeof window !== "undefined" ? window.atob(base64) : ""
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; i += 1) {
        outputArray[i] = rawData.charCodeAt(i)
    }

    return outputArray
}

export function pushPermissionLabel(
    permission: NotificationPermission | "unsupported",
): string {
    if (permission === "granted") return "Granted"
    if (permission === "denied") return "Denied"
    if (permission === "default") return "Prompt"
    return "Unsupported"
}

export function truncateMiddle(value: string, head = 30, tail = 18) {
    if (!value) return ""
    if (value.length <= head + tail + 3) return value
    return `${value.slice(0, head)}...${value.slice(-tail)}`
}

function normalizeReadableText(value: string) {
    const cleaned = value
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    if (!cleaned) return ""
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function ensureSentence(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return ""
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function normalizeKeyLookup(value: string) {
    return value.replace(/[\s_-]+/g, "").toLowerCase()
}

function shouldFormatAsDate(key: string, value: string) {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return false

    const lower = key.toLowerCase()
    if (
        lower.includes("date") ||
        lower.includes("time") ||
        lower.includes("schedule") ||
        lower.endsWith("_at") ||
        lower.endsWith("at")
    ) {
        return true
    }

    return /^\d{4}-\d{2}-\d{2}/.test(value)
}

function isLikelyTechnicalKey(key: string) {
    const normalized = normalizeKeyLookup(key)
    return normalized === "id" || normalized.endsWith("id")
}

function formatFriendlyValue(key: string, rawValue: unknown): string | null {
    if (rawValue === null || rawValue === undefined) return null

    if (typeof rawValue === "string") {
        const trimmed = rawValue.trim()
        if (!trimmed) return null

        if (shouldFormatAsDate(key, trimmed)) {
            return formatDateCompact(trimmed)
        }

        return normalizeReadableText(trimmed)
    }

    if (typeof rawValue === "number" || typeof rawValue === "boolean") {
        return String(rawValue)
    }

    if (Array.isArray(rawValue)) {
        const values = rawValue
            .map((item) => formatFriendlyValue(key, item))
            .filter((v): v is string => Boolean(v))
        if (values.length === 0) return null
        return values.join(", ")
    }

    if (typeof rawValue === "object") {
        const entries = Object.entries(rawValue as Record<string, unknown>)
            .map(([k, v]) => {
                if (isLikelyTechnicalKey(k)) return null
                const fv = formatFriendlyValue(k, v)
                if (!fv) return null
                return `${toLabel(k)}: ${fv}`
            })
            .filter((v): v is string => Boolean(v))

        if (entries.length === 0) return null
        return entries.join(" • ")
    }

    return null
}

function buildFriendlyDetails(data: Record<string, unknown>) {
    const details: FriendlyNotificationDetail[] = []

    for (const [key, rawValue] of Object.entries(data ?? {})) {
        if (!key || isLikelyTechnicalKey(key)) continue

        const value = formatFriendlyValue(key, rawValue)
        if (!value) continue

        const lookup = normalizeKeyLookup(key)
        const label = FRIENDLY_DETAIL_LABELS[lookup] ?? toLabel(key)

        details.push({ label, value })
    }

    return details
}

function parseBodyIntoDetails(body: string): FriendlyNotificationDetail[] {
    if (!body) return []

    const segments = body
        .split("•")
        .map((part) => part.trim())
        .filter(Boolean)

    const parsed: FriendlyNotificationDetail[] = []

    for (const segment of segments) {
        const idx = segment.indexOf(":")
        if (idx <= 0) continue

        let rawKey = segment.slice(0, idx).trim()
        const rawValue = segment.slice(idx + 1).trim()
        if (!rawValue) continue

        // Handles first fragment like:
        // "Defense schedule details were updated. Group: Test"
        if (rawKey.includes(".")) {
            const parts = rawKey.split(".")
            rawKey = parts[parts.length - 1]?.trim() || rawKey
        }

        const formatted = formatFriendlyValue(rawKey, rawValue)
        if (!formatted) continue

        const keyLookup = normalizeKeyLookup(rawKey)
        const label = FRIENDLY_DETAIL_LABELS[keyLookup] ?? normalizeReadableText(rawKey)
        parsed.push({ label, value: formatted })
    }

    return parsed
}

function mergeFriendlyDetails(
    primary: FriendlyNotificationDetail[],
    secondary: FriendlyNotificationDetail[],
): FriendlyNotificationDetail[] {
    const seen = new Set(primary.map((d) => normalizeKeyLookup(d.label)))
    const merged = [...primary]

    for (const detail of secondary) {
        const key = normalizeKeyLookup(detail.label)
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(detail)
    }

    return merged
}

function orderFriendlyDetailsForType(
    type: string,
    details: FriendlyNotificationDetail[],
): FriendlyNotificationDetail[] {
    if (type !== "defense_schedule_updated") return details

    const order = [
        "thesisgroup",
        "schedule",
        "room",
        "students",
        "program",
        "term",
        "evaluationstatus",
        "evaluator",
    ]

    const rank = (label: string) => {
        const key = normalizeKeyLookup(label)
        const idx = order.indexOf(key)
        return idx === -1 ? 999 : idx
    }

    return [...details].sort((a, b) => rank(a.label) - rank(b.label))
}

function getDetailValue(
    details: FriendlyNotificationDetail[],
    aliases: string[],
): string | null {
    const normalizedAliases = aliases.map((a) => normalizeKeyLookup(a))
    const found = details.find((d) =>
        normalizedAliases.includes(normalizeKeyLookup(d.label)),
    )
    return found?.value ?? null
}

function buildFormalMessage(
    type: string,
    details: FriendlyNotificationDetail[],
    fallbackSummary: string,
): { subject: string; message: string } {
    if (type === "defense_schedule_updated") {
        const group = getDetailValue(details, ["Thesis group", "Group"])
        const schedule = getDetailValue(details, ["Schedule"])
        const room = getDetailValue(details, ["Room"])
        const students = getDetailValue(details, ["Students", "Student count"])
        const program = getDetailValue(details, ["Program"])
        const term = getDetailValue(details, ["Term"])

        const detailLines = [
            group ? `• Thesis Group: ${group}` : null,
            schedule ? `• Schedule: ${schedule}` : null,
            room ? `• Room: ${room}` : null,
            students ? `• Number of Students: ${students}` : null,
            program ? `• Program: ${program}` : null,
            term ? `• Term: ${term}` : null,
        ].filter((line): line is string => Boolean(line))

        return {
            subject: "Official Notice: Updated Thesis Defense Schedule",
            message: [
                "Dear Student,",
                "",
                "Please be informed that your thesis defense schedule has been updated.",
                "",
                detailLines.length > 0 ? "Updated details:" : "Please check your latest defense schedule in the system.",
                ...(detailLines.length > 0 ? detailLines : []),
                "",
                "Kindly review the updated schedule and prepare accordingly.",
                "If you have questions, please coordinate with your adviser or your department office.",
                "",
                "Thank you.",
                "JRMSU Thesis Management Office",
            ].join("\n"),
        }
    }

    if (type === "evaluation_submitted") {
        return {
            subject: "Official Notice: Evaluation Submitted",
            message: [
                "Dear User,",
                "",
                "This is to inform you that an evaluation has been successfully submitted.",
                "",
                fallbackSummary,
                "",
                "Please log in to the system for the complete details.",
                "",
                "Thank you.",
                "JRMSU Thesis Management Office",
            ].join("\n"),
        }
    }

    if (type === "evaluation_locked") {
        return {
            subject: "Official Notice: Evaluation Finalized",
            message: [
                "Dear User,",
                "",
                "Please be advised that the evaluation has been finalized and is now locked.",
                "",
                "No further edits can be made unless officially reopened by the authorized office.",
                "",
                "Thank you.",
                "JRMSU Thesis Management Office",
            ].join("\n"),
        }
    }

    return {
        subject: "Official System Notice",
        message: [
            "Dear User,",
            "",
            ensureSentence(fallbackSummary),
            "",
            "Please check your dashboard for more details.",
            "",
            "Thank you.",
            "JRMSU Thesis Management Office",
        ].join("\n"),
    }
}

export function toFriendlyNotification(notification: NotificationRecord): FriendlyNotificationContent {
    const fallback = FRIENDLY_TYPE_COPY[notification.type] ?? {
        title: `${toLabel(notification.type)} update`,
        summary: "You have received a new official update.",
    }

    const normalizedTitle = normalizeReadableText(notification.title || "")
    const title =
        normalizedTitle && normalizedTitle.toLowerCase() !== normalizeReadableText(notification.type).toLowerCase()
            ? normalizedTitle
            : fallback.title

    // For known automation types, prefer a clean copy (not raw body with technical fragments).
    const hasKnownCopy = Boolean(FRIENDLY_TYPE_COPY[notification.type])
    const summary = hasKnownCopy
        ? ensureSentence(fallback.summary)
        : ensureSentence(normalizeReadableText(notification.body || "") || fallback.summary)

    const dataDetails = buildFriendlyDetails(notification.data ?? {})
    const bodyDetails = parseBodyIntoDetails(notification.body || "")
    const mergedDetails = mergeFriendlyDetails(dataDetails, bodyDetails)
    const details = orderFriendlyDetailsForType(notification.type, mergedDetails)

    const formal = buildFormalMessage(notification.type, details, summary)

    return {
        title,
        summary,
        details,
        formalSubject: formal.subject,
        formalMessage: formal.message,
    }
}
