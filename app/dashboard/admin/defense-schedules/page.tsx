"use client"

import * as React from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { toast } from "sonner"

import { DefenseScheduleDeleteDialog } from "@/components/defense-schedules/defense-schedule-delete-dialog"
import { DefenseScheduleFormDialog } from "@/components/defense-schedules/defense-schedule-form-dialog"
import { DefenseSchedulesFiltersBar } from "@/components/defense-schedules/defense-schedules-filters-bar"
import { DefenseSchedulesTable } from "@/components/defense-schedules/defense-schedules-table"

type DefenseScheduleStatus =
    | "scheduled"
    | "ongoing"
    | "completed"
    | "cancelled"
    | (string & {})

type Meridiem = "AM" | "PM"

type PanelistLite = {
    id: string
    name: string
    email: string | null
}

type DefenseScheduleRecord = {
    id: string
    group_id: string
    group_title: string | null
    scheduled_at: string
    room: string | null
    status: DefenseScheduleStatus
    rubric_template_id: string | null
    rubric_template_name: string | null
    created_by: string | null
    created_by_id: string | null
    created_by_name: string | null
    created_by_email: string | null
    created_at: string
    updated_at: string
    panelists: PanelistLite[]
}

type ApiListPayload = {
    items?: unknown
    item?: unknown
    error?: string
    message?: string
}

type ThesisGroupOption = {
    id: string
    title: string
}

type RubricTemplateOption = {
    id: string
    name: string
}

type UserDirectoryOption = {
    id: string
    name: string
    email: string | null
}

type ScheduleFormValues = {
    group_id: string
    scheduled_date: Date | undefined
    scheduled_hour: string
    scheduled_minute: string
    scheduled_period: Meridiem
    room: string
    status: DefenseScheduleStatus
    rubric_template_id: string
}

type DefenseScheduleMutationPayload = {
    group_id: string
    scheduled_at: string
    room: string | null
    status: DefenseScheduleStatus
    rubric_template_id: string | null
}

const STATUS_FILTERS: Array<"all" | "scheduled" | "ongoing" | "completed" | "cancelled"> = [
    "all",
    "scheduled",
    "ongoing",
    "completed",
    "cancelled",
]

const STATUS_OPTIONS: DefenseScheduleStatus[] = ["scheduled", "ongoing", "completed", "cancelled"]

const LIST_ENDPOINTS = ["/api/admin/defense-schedules", "/api/defense-schedules"] as const
const WRITE_BASE_ENDPOINTS = ["/api/admin/defense-schedules", "/api/defense-schedules"] as const
const GROUP_ENDPOINTS = ["/api/admin/thesis-groups", "/api/thesis-groups"] as const
const USER_ENDPOINTS = ["/api/users", "/api/admin"] as const
const RUBRIC_ENDPOINTS = [
    "/api/admin/rubric-templates?active=true",
    "/api/rubric-templates?active=true",
    "/api/admin/rubric-templates",
    "/api/rubric-templates",
] as const

const RUBRIC_NONE_VALUE = "__none__"

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"))
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"))

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function pickString(source: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = source[key]
        if (typeof value === "string" && value.trim().length > 0) {
            return value
        }
    }
    return null
}

function pickNullableString(source: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = source[key]
        if (typeof value === "string") return value
        if (value === null) return null
    }
    return null
}

function toTitleCase(value: string): string {
    if (!value) return ""
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDateTime(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
}

function formatCalendarDate(value: Date): string {
    return value.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
    })
}

function parseIsoToDateParts(value: string): {
    date: Date | undefined
    hour: string
    minute: string
    period: Meridiem
} {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        return {
            date: undefined,
            hour: "08",
            minute: "00",
            period: "AM",
        }
    }

    const hour24 = date.getHours()
    const period: Meridiem = hour24 >= 12 ? "PM" : "AM"
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12

    return {
        date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        hour: String(hour12).padStart(2, "0"),
        minute: String(date.getMinutes()).padStart(2, "0"),
        period,
    }
}

function buildScheduledAtIso(values: ScheduleFormValues): string | null {
    if (!values.scheduled_date) return null

    const hourNum = Number(values.scheduled_hour)
    const minuteNum = Number(values.scheduled_minute)

    if (!Number.isInteger(hourNum) || hourNum < 1 || hourNum > 12) return null
    if (!Number.isInteger(minuteNum) || minuteNum < 0 || minuteNum > 59) return null

    let hour24 = hourNum % 12
    if (values.scheduled_period === "PM") {
        hour24 += 12
    }

    const localDate = new Date(values.scheduled_date)
    localDate.setHours(hour24, minuteNum, 0, 0)

    if (Number.isNaN(localDate.getTime())) return null
    return localDate.toISOString()
}

function normalizePanelists(raw: unknown): PanelistLite[] {
    if (!Array.isArray(raw)) return []

    const out: PanelistLite[] = []

    for (const item of raw) {
        if (!isRecord(item)) continue

        const id =
            pickString(item, ["id", "staff_id", "staffId", "user_id", "userId"]) ?? ""

        const name =
            pickString(item, ["name", "full_name", "staff_name", "staffName", "email"]) ??
            "Unknown Panelist"

        const email = pickNullableString(item, ["email", "staff_email", "staffEmail"])

        out.push({ id, name, email })
    }

    return out
}

function extractList(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []

    const typed = payload as ApiListPayload

    if (Array.isArray(typed.items)) return typed.items
    if (typed.item !== undefined) return [typed.item]

    return []
}

function normalizeDefenseSchedule(raw: unknown): DefenseScheduleRecord | null {
    if (!isRecord(raw)) return null

    const id = pickString(raw, ["id"])
    if (!id) return null

    const groupObject = isRecord(raw.group) ? raw.group : null
    const rubricObject = isRecord(raw.rubric_template) ? raw.rubric_template : null
    const creatorObject =
        isRecord(raw.created_by_user)
            ? raw.created_by_user
            : isRecord(raw.creator)
                ? raw.creator
                : isRecord(raw.createdByUser)
                    ? raw.createdByUser
                    : null

    const groupId =
        pickString(raw, ["group_id", "groupId"]) ??
        (groupObject ? pickString(groupObject, ["id", "group_id", "groupId"]) : null) ??
        ""

    const groupTitle =
        pickNullableString(raw, ["group_title", "groupTitle"]) ??
        (groupObject ? pickNullableString(groupObject, ["title", "name"]) : null)

    const scheduledAt = pickString(raw, ["scheduled_at", "scheduledAt"])
    if (!scheduledAt) return null

    const status = (pickString(raw, ["status"]) ?? "scheduled") as DefenseScheduleStatus

    const room = pickNullableString(raw, ["room"])

    const rubricTemplateId =
        pickNullableString(raw, ["rubric_template_id", "rubricTemplateId"]) ??
        (rubricObject ? pickNullableString(rubricObject, ["id"]) : null)

    const rubricTemplateName =
        pickNullableString(raw, ["rubric_template_name", "rubricTemplateName"]) ??
        (rubricObject ? pickNullableString(rubricObject, ["name"]) : null)

    const createdById =
        pickNullableString(raw, ["created_by_id", "createdById", "created_by", "createdBy"]) ??
        (creatorObject ? pickNullableString(creatorObject, ["id", "user_id", "userId"]) : null)

    const createdByName =
        pickNullableString(raw, ["created_by_name", "createdByName", "creator_name", "creatorName"]) ??
        (creatorObject
            ? pickNullableString(creatorObject, ["name", "full_name", "display_name", "displayName"])
            : null)

    const createdByEmail =
        pickNullableString(raw, ["created_by_email", "createdByEmail", "creator_email", "creatorEmail"]) ??
        (creatorObject ? pickNullableString(creatorObject, ["email"]) : null)

    const createdByDisplay = createdByName ?? createdByEmail ?? createdById

    const createdAt =
        pickString(raw, ["created_at", "createdAt"]) ??
        new Date().toISOString()

    const updatedAt =
        pickString(raw, ["updated_at", "updatedAt"]) ??
        createdAt

    const primaryPanelists = normalizePanelists(raw.panelists)
    const secondaryPanelists = normalizePanelists(raw.schedule_panelists)
    const panelists = primaryPanelists.length > 0 ? primaryPanelists : secondaryPanelists

    return {
        id,
        group_id: groupId,
        group_title: groupTitle,
        scheduled_at: scheduledAt,
        room,
        status,
        rubric_template_id: rubricTemplateId,
        rubric_template_name: rubricTemplateName,
        created_by: createdByDisplay,
        created_by_id: createdById,
        created_by_name: createdByName,
        created_by_email: createdByEmail,
        created_at: createdAt,
        updated_at: updatedAt,
        panelists,
    }
}

function normalizeGroupOption(raw: unknown): ThesisGroupOption | null {
    if (!isRecord(raw)) return null
    const id = pickString(raw, ["id"])
    if (!id) return null
    const title = pickString(raw, ["title", "name"]) ?? id
    return { id, title }
}

function normalizeRubricOption(raw: unknown): RubricTemplateOption | null {
    if (!isRecord(raw)) return null
    const id = pickString(raw, ["id"])
    if (!id) return null
    const name = pickString(raw, ["name"]) ?? id
    return { id, name }
}

function normalizeUserOption(raw: unknown): UserDirectoryOption | null {
    if (!isRecord(raw)) return null

    const id = pickString(raw, ["id", "user_id", "userId"])
    if (!id) return null

    const name = pickString(raw, ["name", "full_name", "display_name", "displayName", "email"]) ?? id
    const email = pickNullableString(raw, ["email"])

    return {
        id,
        name,
        email,
    }
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
    const seen = new Set<string>()
    const out: T[] = []

    for (const item of items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        out.push(item)
    }

    return out
}

function makeInitialFormValues(): ScheduleFormValues {
    return {
        group_id: "",
        scheduled_date: undefined,
        scheduled_hour: "08",
        scheduled_minute: "00",
        scheduled_period: "AM",
        room: "",
        status: "scheduled",
        rubric_template_id: "",
    }
}

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { error?: string; message?: string }
        return data.error || data.message || `Request failed (${res.status})`
    } catch {
        return `Request failed (${res.status})`
    }
}

function statusBadgeClass(status: DefenseScheduleStatus): string {
    if (status === "completed") {
        return "border-primary/40 bg-primary/10 text-foreground"
    }

    if (status === "ongoing") {
        return "border-chart-2/40 bg-chart-2/10 text-foreground"
    }

    if (status === "cancelled") {
        return "border-destructive/40 bg-destructive/10 text-destructive"
    }

    return "border-muted-foreground/30 bg-muted text-muted-foreground"
}

async function fetchDefenseSchedules(): Promise<DefenseScheduleRecord[]> {
    const errors: string[] = []

    for (const endpoint of LIST_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })

            if (res.ok) {
                const payload = (await res.json()) as unknown
                const normalized = extractList(payload)
                    .map(normalizeDefenseSchedule)
                    .filter((item): item is DefenseScheduleRecord => !!item)

                return normalized
            }

            if (res.status !== 404) {
                errors.push(await readErrorMessage(res))
            }
        } catch (err) {
            errors.push(err instanceof Error ? err.message : "Network error")
        }
    }

    if (errors.length > 0) {
        throw new Error(errors[0] ?? "Failed to fetch defense schedules.")
    }

    return []
}

async function fetchThesisGroups(): Promise<ThesisGroupOption[]> {
    for (const endpoint of GROUP_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            if (!res.ok) {
                if (res.status === 404) continue
                continue
            }

            const payload = (await res.json()) as unknown
            const options = extractList(payload)
                .map(normalizeGroupOption)
                .filter((item): item is ThesisGroupOption => !!item)

            return uniqueById(options)
        } catch {
            // try next endpoint
        }
    }

    return []
}

async function fetchRubricTemplates(): Promise<RubricTemplateOption[]> {
    for (const endpoint of RUBRIC_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            if (!res.ok) {
                if (res.status === 404) continue
                continue
            }

            const payload = (await res.json()) as unknown
            const options = extractList(payload)
                .map(normalizeRubricOption)
                .filter((item): item is RubricTemplateOption => !!item)

            return uniqueById(options)
        } catch {
            // try next endpoint
        }
    }

    return []
}

async function fetchUserDirectory(): Promise<UserDirectoryOption[]> {
    const collected: UserDirectoryOption[] = []

    for (const endpoint of USER_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, { cache: "no-store" })
            if (!res.ok) {
                if (res.status === 404 || res.status === 401 || res.status === 403) continue
                continue
            }

            const payload = (await res.json()) as unknown
            const options = extractList(payload)
                .map(normalizeUserOption)
                .filter((item): item is UserDirectoryOption => !!item)

            collected.push(...options)
        } catch {
            // try next endpoint
        }
    }

    return uniqueById(collected)
}

async function createDefenseSchedule(
    payload: DefenseScheduleMutationPayload,
): Promise<DefenseScheduleRecord | null> {
    const errors: string[] = []

    for (const endpoint of WRITE_BASE_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            if (res.ok) {
                const data = (await res.json()) as unknown
                const single = isRecord(data) && data.item !== undefined ? data.item : data
                return normalizeDefenseSchedule(single)
            }

            if (res.status !== 404) {
                errors.push(await readErrorMessage(res))
            }
        } catch (err) {
            errors.push(err instanceof Error ? err.message : "Network error")
        }
    }

    throw new Error(errors[0] ?? "Failed to create defense schedule.")
}

async function updateDefenseSchedule(
    id: string,
    payload: DefenseScheduleMutationPayload,
): Promise<DefenseScheduleRecord | null> {
    const errors: string[] = []

    for (const base of WRITE_BASE_ENDPOINTS) {
        const endpoint = `${base}/${encodeURIComponent(id)}`

        try {
            const res = await fetch(endpoint, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            if (res.ok) {
                const data = (await res.json()) as unknown
                const single = isRecord(data) && data.item !== undefined ? data.item : data
                return normalizeDefenseSchedule(single)
            }

            if (res.status !== 404) {
                errors.push(await readErrorMessage(res))
            }
        } catch (err) {
            errors.push(err instanceof Error ? err.message : "Network error")
        }
    }

    throw new Error(errors[0] ?? "Failed to update defense schedule.")
}

async function deleteDefenseSchedule(id: string): Promise<void> {
    const errors: string[] = []

    for (const base of WRITE_BASE_ENDPOINTS) {
        const endpoint = `${base}/${encodeURIComponent(id)}`

        try {
            const res = await fetch(endpoint, {
                method: "DELETE",
            })

            if (res.ok) return

            if (res.status !== 404) {
                errors.push(await readErrorMessage(res))
            }
        } catch (err) {
            errors.push(err instanceof Error ? err.message : "Network error")
        }
    }

    throw new Error(errors[0] ?? "Failed to delete defense schedule.")
}

export default function AdminDefenseSchedulesPage() {
    const [schedules, setSchedules] = React.useState<DefenseScheduleRecord[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<(typeof STATUS_FILTERS)[number]>("all")

    const [groups, setGroups] = React.useState<ThesisGroupOption[]>([])
    const [rubrics, setRubrics] = React.useState<RubricTemplateOption[]>([])
    const [users, setUsers] = React.useState<UserDirectoryOption[]>([])
    const [metaLoading, setMetaLoading] = React.useState(true)

    const [dialogOpen, setDialogOpen] = React.useState(false)
    const [dialogMode, setDialogMode] = React.useState<"create" | "edit">("create")
    const [editingId, setEditingId] = React.useState<string | null>(null)
    const [formValues, setFormValues] = React.useState<ScheduleFormValues>(makeInitialFormValues())
    const [submitting, setSubmitting] = React.useState(false)

    const [deleteTarget, setDeleteTarget] = React.useState<DefenseScheduleRecord | null>(null)
    const [deleting, setDeleting] = React.useState(false)

    const groupTitleById = React.useMemo(
        () => new Map(groups.map((group) => [group.id, group.title])),
        [groups],
    )

    const rubricNameById = React.useMemo(
        () => new Map(rubrics.map((rubric) => [rubric.id, rubric.name])),
        [rubrics],
    )

    const userById = React.useMemo(
        () => new Map(users.map((user) => [user.id, user])),
        [users],
    )

    const resolveCreatorLabel = React.useCallback(
        (row: DefenseScheduleRecord): string => {
            if (row.created_by_name) return row.created_by_name
            if (row.created_by_email) return row.created_by_email

            const creatorId = row.created_by_id ?? null
            if (creatorId) {
                const user = userById.get(creatorId)
                if (user?.name) return user.name
                if (user?.email) return user.email
                return creatorId
            }

            if (row.created_by) return row.created_by
            return "System"
        },
        [userById],
    )

    const loadSchedules = React.useCallback(async (): Promise<boolean> => {
        setLoading(true)
        setError(null)

        try {
            const rows = await fetchDefenseSchedules()
            setSchedules(rows)
            return true
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to fetch defense schedules."
            setError(message)
            setSchedules([])
            return false
        } finally {
            setLoading(false)
        }
    }, [])

    const loadReferenceData = React.useCallback(async () => {
        setMetaLoading(true)
        try {
            const [groupRows, rubricRows, userRows] = await Promise.all([
                fetchThesisGroups(),
                fetchRubricTemplates(),
                fetchUserDirectory(),
            ])

            setGroups(groupRows)
            setRubrics(rubricRows)
            setUsers(userRows)
        } catch {
            toast.error("Some reference data could not be loaded.")
        } finally {
            setMetaLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void loadSchedules()
        void loadReferenceData()
    }, [loadSchedules, loadReferenceData])

    const filteredSchedules = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        const base = schedules.filter((row) => {
            if (statusFilter !== "all" && row.status !== statusFilter) return false

            if (!q) return true

            const resolvedGroup =
                (row.group_title ?? groupTitleById.get(row.group_id) ?? "").toLowerCase()

            const resolvedRubric =
                (row.rubric_template_name ??
                    (row.rubric_template_id ? rubricNameById.get(row.rubric_template_id) : "") ??
                    "").toLowerCase()

            const resolvedCreator = resolveCreatorLabel(row).toLowerCase()
            const panelistNames = row.panelists.map((p) => p.name.toLowerCase()).join(" ")

            return (
                row.id.toLowerCase().includes(q) ||
                row.group_id.toLowerCase().includes(q) ||
                resolvedGroup.includes(q) ||
                (row.room ?? "").toLowerCase().includes(q) ||
                row.status.toLowerCase().includes(q) ||
                resolvedRubric.includes(q) ||
                resolvedCreator.includes(q) ||
                panelistNames.includes(q)
            )
        })

        return base.sort((a, b) => {
            const aTime = new Date(a.scheduled_at).getTime()
            const bTime = new Date(b.scheduled_at).getTime()
            return bTime - aTime
        })
    }, [schedules, search, statusFilter, groupTitleById, rubricNameById, resolveCreatorLabel])

    const groupSelectOptions = React.useMemo(() => {
        if (!formValues.group_id) return groups
        if (groups.some((g) => g.id === formValues.group_id)) return groups
        return [{ id: formValues.group_id, title: `Current: ${formValues.group_id}` }, ...groups]
    }, [groups, formValues.group_id])

    const rubricSelectOptions = React.useMemo(() => {
        if (!formValues.rubric_template_id) return rubrics
        if (rubrics.some((r) => r.id === formValues.rubric_template_id)) return rubrics
        return [{ id: formValues.rubric_template_id, name: `Current: ${formValues.rubric_template_id}` }, ...rubrics]
    }, [rubrics, formValues.rubric_template_id])

    const handleRefresh = React.useCallback(async () => {
        const ok = await loadSchedules()
        await loadReferenceData()

        if (ok) {
            toast.success("Defense schedules refreshed.")
        } else {
            toast.error("Could not refresh defense schedules.")
        }
    }, [loadSchedules, loadReferenceData])

    const openCreateDialog = React.useCallback(() => {
        setDialogMode("create")
        setEditingId(null)
        setFormValues(makeInitialFormValues())
        setDialogOpen(true)
    }, [])

    const openEditDialog = React.useCallback((row: DefenseScheduleRecord) => {
        const dateParts = parseIsoToDateParts(row.scheduled_at)

        setDialogMode("edit")
        setEditingId(row.id)
        setFormValues({
            group_id: row.group_id,
            scheduled_date: dateParts.date,
            scheduled_hour: dateParts.hour,
            scheduled_minute: dateParts.minute,
            scheduled_period: dateParts.period,
            room: row.room ?? "",
            status: STATUS_OPTIONS.includes(row.status) ? row.status : "scheduled",
            rubric_template_id: row.rubric_template_id ?? "",
        })
        setDialogOpen(true)
    }, [])

    const closeEditor = React.useCallback(() => {
        if (submitting) return
        setDialogOpen(false)
        setEditingId(null)
        setFormValues(makeInitialFormValues())
    }, [submitting])

    const handleDialogOpenChange = React.useCallback(
        (open: boolean) => {
            if (!open) {
                closeEditor()
                return
            }
            setDialogOpen(true)
        },
        [closeEditor],
    )

    const handleSubmitSchedule = React.useCallback(async () => {
        if (submitting) return

        const groupId = formValues.group_id.trim()
        if (!groupId) {
            toast.error("Please select a thesis group.")
            return
        }

        const scheduledAtIso = buildScheduledAtIso(formValues)
        if (!scheduledAtIso) {
            toast.error("Please select a valid schedule date and time.")
            return
        }

        const payload: DefenseScheduleMutationPayload = {
            group_id: groupId,
            scheduled_at: scheduledAtIso,
            room: formValues.room.trim() || null,
            status: formValues.status,
            rubric_template_id: formValues.rubric_template_id.trim() || null,
        }

        setSubmitting(true)

        try {
            if (dialogMode === "create") {
                const created = await createDefenseSchedule(payload)

                if (created) {
                    setSchedules((prev) => [created, ...prev])
                } else {
                    await loadSchedules()
                }

                toast.success("Defense schedule created successfully.")
            } else {
                if (!editingId) {
                    toast.error("Missing schedule id for update.")
                    return
                }

                const updated = await updateDefenseSchedule(editingId, payload)

                if (updated) {
                    setSchedules((prev) =>
                        prev.map((row) => (row.id === editingId ? updated : row)),
                    )
                } else {
                    await loadSchedules()
                }

                toast.success("Defense schedule updated successfully.")
            }

            closeEditor()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to save defense schedule.")
        } finally {
            setSubmitting(false)
        }
    }, [submitting, formValues, dialogMode, editingId, loadSchedules, closeEditor])

    const handleDeleteSchedule = React.useCallback(async () => {
        if (!deleteTarget || deleting) return

        setDeleting(true)

        try {
            await deleteDefenseSchedule(deleteTarget.id)
            setSchedules((prev) => prev.filter((row) => row.id !== deleteTarget.id))
            toast.success("Defense schedule deleted successfully.")
            setDeleteTarget(null)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to delete defense schedule.")
        } finally {
            setDeleting(false)
        }
    }, [deleteTarget, deleting])

    return (
        <DashboardLayout
            title="Defense Schedules"
            description="Create, edit, and manage all thesis defense schedules."
        >
            <div className="space-y-4">
                <DefenseSchedulesFiltersBar
                    search={search}
                    onSearchChange={setSearch}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    statusFilters={STATUS_FILTERS}
                    filteredCount={filteredSchedules.length}
                    totalCount={schedules.length}
                    loading={loading}
                    onRefresh={() => void handleRefresh()}
                    onCreate={openCreateDialog}
                />

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                <DefenseSchedulesTable
                    loading={loading}
                    rows={filteredSchedules}
                    groupTitleById={groupTitleById}
                    rubricNameById={rubricNameById}
                    formatDateTime={formatDateTime}
                    statusBadgeClass={statusBadgeClass}
                    toTitleCase={toTitleCase}
                    resolveCreatorLabel={resolveCreatorLabel}
                    onEdit={openEditDialog}
                    onDelete={setDeleteTarget}
                />
            </div>

            <DefenseScheduleFormDialog
                open={dialogOpen}
                mode={dialogMode}
                submitting={submitting}
                metaLoading={metaLoading}
                formValues={formValues}
                setFormValues={setFormValues}
                groupSelectOptions={groupSelectOptions}
                rubricSelectOptions={rubricSelectOptions}
                statusOptions={STATUS_OPTIONS}
                hourOptions={HOUR_OPTIONS}
                minuteOptions={MINUTE_OPTIONS}
                rubricNoneValue={RUBRIC_NONE_VALUE}
                formatCalendarDate={formatCalendarDate}
                onOpenChange={handleDialogOpenChange}
                onCancel={closeEditor}
                onSubmit={() => void handleSubmitSchedule()}
            />

            <DefenseScheduleDeleteDialog
                open={!!deleteTarget}
                deleting={deleting}
                scheduleId={deleteTarget?.id ?? ""}
                onOpenChange={(open) => {
                    if (!open && !deleting) {
                        setDeleteTarget(null)
                    }
                }}
                onConfirm={() => void handleDeleteSchedule()}
            />
        </DashboardLayout>
    )
}
