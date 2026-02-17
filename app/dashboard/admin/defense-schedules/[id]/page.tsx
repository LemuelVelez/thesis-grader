"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import DashboardLayout from "@/components/dashboard-layout"
import { DefenseScheduleEditDeleteDialogs } from "@/components/defense-schedules/defense-schedule-edit-delete-dialogs"
import { DefenseScheduleOverviewSection } from "@/components/defense-schedules/defense-schedule-overview-section"
import { DefenseSchedulePanelistDialogs } from "@/components/defense-schedules/defense-schedule-panelist-dialogs"
import { DefenseSchedulePanelistsSection } from "@/components/defense-schedules/defense-schedule-panelists-section"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

type DefenseScheduleStatus =
    | "scheduled"
    | "ongoing"
    | "completed"
    | "cancelled"
    | (string & {})

type Meridiem = "AM" | "PM"

type UserStatus = "active" | "disabled" | (string & {})

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

type ApiPayload = {
    item?: unknown
    items?: unknown
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
    role: string | null
    status: string | null
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

type MutationAttempt = {
    endpoint: string
    method: "POST" | "PATCH" | "PUT" | "DELETE"
    body?: Record<string, unknown>
}

type ProvisionUserPayload = {
    name: string
    email: string
    status: UserStatus
}

type ProvisionUserResponse = {
    item?: unknown
    error?: string
    message?: string
    emailError?: string
}

type ProvisionUserResult = {
    user: UserDirectoryOption
    message: string | null
    emailError: string | null
}

const READ_ENDPOINTS = ["/api/admin/defense-schedules", "/api/defense-schedules"] as const
const WRITE_BASE_ENDPOINTS = ["/api/admin/defense-schedules", "/api/defense-schedules"] as const
const STATUS_ACTIONS: DefenseScheduleStatus[] = ["scheduled", "ongoing", "completed", "cancelled"]

const GROUP_ENDPOINTS = ["/api/admin/thesis-groups", "/api/thesis-groups"] as const
const USER_ENDPOINTS = ["/api/users", "/api/admin"] as const
const RUBRIC_ENDPOINTS = [
    "/api/admin/rubric-templates?active=true",
    "/api/rubric-templates?active=true",
    "/api/admin/rubric-templates",
    "/api/rubric-templates",
] as const

const RUBRIC_NONE_VALUE = "__none__"
const PANELIST_ROLE = "panelist"
const CREATE_PANELIST_STATUSES: UserStatus[] = ["active", "disabled"]

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

function pickRoleValue(source: Record<string, unknown>): string | null {
    const direct = pickNullableString(source, ["role", "user_role", "userRole"])
    if (typeof direct === "string" && direct.trim()) return direct.trim().toLowerCase()

    const roles = source.roles
    if (Array.isArray(roles)) {
        for (const roleItem of roles) {
            if (typeof roleItem === "string" && roleItem.trim()) {
                return roleItem.trim().toLowerCase()
            }

            if (isRecord(roleItem)) {
                const nested = pickString(roleItem, ["name", "role"])
                if (nested) return nested.toLowerCase()
            }
        }
    }

    return null
}

function normalizeUserStatusValue(value: string | null): string | null {
    if (!value) return null
    return value.trim().toLowerCase() || null
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

function toTitleCase(value: string): string {
    if (!value) return ""
    return value.charAt(0).toUpperCase() + value.slice(1)
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

function extractSingle(payload: unknown): unknown {
    if (!isRecord(payload)) return payload

    const typed = payload as ApiPayload

    if (typed.item !== undefined) return typed.item
    if (Array.isArray(typed.items) && typed.items.length > 0) return typed.items[0]

    return payload
}

function extractList(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload
    if (!isRecord(payload)) return []
    if (Array.isArray(payload.items)) return payload.items
    if (payload.item !== undefined) return [payload.item]
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
    const role = pickRoleValue(raw)
    const status = normalizeUserStatusValue(
        pickNullableString(raw, ["status", "user_status", "userStatus"]),
    )

    return { id, name, email, role, status }
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

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function executeMutationAttempts(
    attempts: MutationAttempt[],
    fallbackErrorMessage: string,
): Promise<void> {
    const errors: string[] = []

    for (const attempt of attempts) {
        try {
            const res = await fetch(attempt.endpoint, {
                method: attempt.method,
                headers: attempt.body ? { "Content-Type": "application/json" } : undefined,
                body: attempt.body ? JSON.stringify(attempt.body) : undefined,
            })

            if (res.ok) return

            if (res.status === 404 || res.status === 405) {
                continue
            }

            errors.push(await readErrorMessage(res))
        } catch (err) {
            errors.push(err instanceof Error ? err.message : "Network error")
        }
    }

    throw new Error(errors[0] ?? fallbackErrorMessage)
}

async function addPanelistToDefenseSchedule(scheduleId: string, panelistUserId: string): Promise<void> {
    const sid = encodeURIComponent(scheduleId)

    const attempts: MutationAttempt[] = [
        { endpoint: `/api/admin/defense-schedules/${sid}/panelists`, method: "POST", body: { user_id: panelistUserId } },
        { endpoint: `/api/defense-schedules/${sid}/panelists`, method: "POST", body: { user_id: panelistUserId } },
        { endpoint: `/api/admin/defense-schedules/${sid}/panelists`, method: "POST", body: { panelist_id: panelistUserId } },
        { endpoint: `/api/defense-schedules/${sid}/panelists`, method: "POST", body: { panelist_id: panelistUserId } },
        { endpoint: `/api/admin/defense-schedules/${sid}/panelists`, method: "POST", body: { staff_id: panelistUserId } },
        { endpoint: `/api/defense-schedules/${sid}/panelists`, method: "POST", body: { staff_id: panelistUserId } },

        { endpoint: `/api/admin/defense-schedules/${sid}/schedule-panelists`, method: "POST", body: { user_id: panelistUserId } },
        { endpoint: `/api/defense-schedules/${sid}/schedule-panelists`, method: "POST", body: { user_id: panelistUserId } },

        {
            endpoint: "/api/admin/defense-schedule-panelists",
            method: "POST",
            body: { defense_schedule_id: scheduleId, user_id: panelistUserId },
        },
        {
            endpoint: "/api/defense-schedule-panelists",
            method: "POST",
            body: { defense_schedule_id: scheduleId, user_id: panelistUserId },
        },
        {
            endpoint: "/api/admin/defense-schedule-panelists",
            method: "POST",
            body: { schedule_id: scheduleId, panelist_id: panelistUserId },
        },
        {
            endpoint: "/api/defense-schedule-panelists",
            method: "POST",
            body: { schedule_id: scheduleId, panelist_id: panelistUserId },
        },
    ]

    await executeMutationAttempts(
        attempts,
        "Failed to add panelist. Please verify panelist endpoints for defense schedules.",
    )
}

async function removePanelistFromDefenseSchedule(scheduleId: string, panelistUserId: string): Promise<void> {
    const sid = encodeURIComponent(scheduleId)
    const pid = encodeURIComponent(panelistUserId)

    const attempts: MutationAttempt[] = [
        { endpoint: `/api/admin/defense-schedules/${sid}/panelists/${pid}`, method: "DELETE" },
        { endpoint: `/api/defense-schedules/${sid}/panelists/${pid}`, method: "DELETE" },
        { endpoint: `/api/admin/defense-schedules/${sid}/schedule-panelists/${pid}`, method: "DELETE" },
        { endpoint: `/api/defense-schedules/${sid}/schedule-panelists/${pid}`, method: "DELETE" },

        { endpoint: `/api/admin/defense-schedules/${sid}/panelists`, method: "DELETE", body: { user_id: panelistUserId } },
        { endpoint: `/api/defense-schedules/${sid}/panelists`, method: "DELETE", body: { user_id: panelistUserId } },
        { endpoint: `/api/admin/defense-schedules/${sid}/panelists`, method: "DELETE", body: { panelist_id: panelistUserId } },
        { endpoint: `/api/defense-schedules/${sid}/panelists`, method: "DELETE", body: { panelist_id: panelistUserId } },

        { endpoint: `/api/admin/defense-schedule-panelists/${pid}`, method: "DELETE" },
        { endpoint: `/api/defense-schedule-panelists/${pid}`, method: "DELETE" },
        {
            endpoint: "/api/admin/defense-schedule-panelists",
            method: "DELETE",
            body: { defense_schedule_id: scheduleId, user_id: panelistUserId },
        },
        {
            endpoint: "/api/defense-schedule-panelists",
            method: "DELETE",
            body: { defense_schedule_id: scheduleId, user_id: panelistUserId },
        },
    ]

    await executeMutationAttempts(
        attempts,
        "Failed to remove panelist. Please verify panelist endpoints for defense schedules.",
    )
}

async function replaceDefenseSchedulePanelist(
    scheduleId: string,
    currentPanelistUserId: string,
    nextPanelistUserId: string,
): Promise<void> {
    if (currentPanelistUserId === nextPanelistUserId) return

    const sid = encodeURIComponent(scheduleId)
    const currentId = encodeURIComponent(currentPanelistUserId)

    const directAttempts: MutationAttempt[] = [
        {
            endpoint: `/api/admin/defense-schedules/${sid}/panelists/${currentId}`,
            method: "PATCH",
            body: { user_id: nextPanelistUserId },
        },
        {
            endpoint: `/api/defense-schedules/${sid}/panelists/${currentId}`,
            method: "PATCH",
            body: { user_id: nextPanelistUserId },
        },
        {
            endpoint: `/api/admin/defense-schedules/${sid}/panelists/${currentId}`,
            method: "PATCH",
            body: { panelist_id: nextPanelistUserId },
        },
        {
            endpoint: `/api/defense-schedules/${sid}/panelists/${currentId}`,
            method: "PATCH",
            body: { panelist_id: nextPanelistUserId },
        },
        {
            endpoint: `/api/admin/defense-schedules/${sid}/panelists`,
            method: "PATCH",
            body: { old_user_id: currentPanelistUserId, new_user_id: nextPanelistUserId },
        },
        {
            endpoint: `/api/defense-schedules/${sid}/panelists`,
            method: "PATCH",
            body: { old_user_id: currentPanelistUserId, new_user_id: nextPanelistUserId },
        },
        {
            endpoint: "/api/admin/defense-schedule-panelists",
            method: "PATCH",
            body: {
                defense_schedule_id: scheduleId,
                old_user_id: currentPanelistUserId,
                new_user_id: nextPanelistUserId,
            },
        },
        {
            endpoint: "/api/defense-schedule-panelists",
            method: "PATCH",
            body: {
                defense_schedule_id: scheduleId,
                old_user_id: currentPanelistUserId,
                new_user_id: nextPanelistUserId,
            },
        },
    ]

    let directErrorMessage: string | null = null

    try {
        await executeMutationAttempts(
            directAttempts,
            "Failed to update panelist using direct update endpoint.",
        )
        return
    } catch (err) {
        directErrorMessage =
            err instanceof Error
                ? err.message
                : "Failed to update panelist using direct update endpoint."
    }

    try {
        await removePanelistFromDefenseSchedule(scheduleId, currentPanelistUserId)
        await addPanelistToDefenseSchedule(scheduleId, nextPanelistUserId)
    } catch (fallbackErr) {
        throw new Error(
            fallbackErr instanceof Error
                ? fallbackErr.message
                : directErrorMessage ?? "Failed to update panelist assignment.",
        )
    }
}

async function provisionPanelistUser(
    payload: ProvisionUserPayload,
): Promise<ProvisionUserResult> {
    const res = await fetch("/api/users/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: payload.name,
            email: payload.email,
            role: PANELIST_ROLE,
            status: payload.status,
            sendLoginDetails: true,
        }),
    })

    const data = (await res.json()) as ProvisionUserResponse

    if (!res.ok) {
        throw new Error(data.error || data.message || "Failed to create panelist user.")
    }

    const item = extractSingle(data.item ?? data)
    const normalized = normalizeUserOption(item)

    if (!normalized) {
        throw new Error("Panelist user was created but response payload is invalid.")
    }

    return {
        user: {
            ...normalized,
            role: normalized.role ?? PANELIST_ROLE,
            status: normalized.status ?? String(payload.status).toLowerCase(),
        },
        message: data.message ?? null,
        emailError: data.emailError ?? null,
    }
}

async function fetchDefenseScheduleById(id: string): Promise<DefenseScheduleRecord> {
    const errors: string[] = []

    for (const base of READ_ENDPOINTS) {
        const endpoint = `${base}/${encodeURIComponent(id)}`

        try {
            const res = await fetch(endpoint, { cache: "no-store" })

            if (res.ok) {
                const payload = (await res.json()) as unknown
                const single = extractSingle(payload)
                const normalized = normalizeDefenseSchedule(single)

                if (normalized) return normalized
                errors.push("Received invalid defense schedule payload.")
                continue
            }

            if (res.status !== 404) {
                errors.push(await readErrorMessage(res))
            }
        } catch (err) {
            errors.push(err instanceof Error ? err.message : "Network error")
        }
    }

    throw new Error(errors[0] ?? "Defense schedule not found.")
}

async function updateDefenseScheduleStatus(
    id: string,
    nextStatus: DefenseScheduleStatus,
): Promise<DefenseScheduleRecord | null> {
    const errors: string[] = []

    const statusEndpoints = [
        `/api/admin/defense-schedules/${encodeURIComponent(id)}/status`,
        `/api/defense-schedules/${encodeURIComponent(id)}/status`,
        `/api/admin/defense-schedules/${encodeURIComponent(id)}`,
        `/api/defense-schedules/${encodeURIComponent(id)}`,
    ] as const

    for (const endpoint of statusEndpoints) {
        try {
            const res = await fetch(endpoint, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: nextStatus }),
            })

            if (res.ok) {
                const payload = (await res.json()) as unknown
                const single = extractSingle(payload)
                const normalized = normalizeDefenseSchedule(single)
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
        throw new Error(errors[0] ?? "Failed to update schedule status.")
    }

    return null
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
                const single = extractSingle(data)
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

export default function AdminDefenseScheduleDetailsPage() {
    const router = useRouter()
    const params = useParams<{ id?: string | string[] }>()
    const scheduleId = React.useMemo(() => {
        const raw = params?.id
        if (Array.isArray(raw)) return raw[0] ?? ""
        return raw ?? ""
    }, [params])

    const [schedule, setSchedule] = React.useState<DefenseScheduleRecord | null>(null)
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [busyStatus, setBusyStatus] = React.useState<DefenseScheduleStatus | null>(null)

    const [groups, setGroups] = React.useState<ThesisGroupOption[]>([])
    const [rubrics, setRubrics] = React.useState<RubricTemplateOption[]>([])
    const [users, setUsers] = React.useState<UserDirectoryOption[]>([])
    const [metaLoading, setMetaLoading] = React.useState(true)

    const [editOpen, setEditOpen] = React.useState(false)
    const [editBusy, setEditBusy] = React.useState(false)
    const [editForm, setEditForm] = React.useState<ScheduleFormValues>(makeInitialFormValues())

    const [deleteOpen, setDeleteOpen] = React.useState(false)
    const [deleteBusy, setDeleteBusy] = React.useState(false)

    // Panelist CRUD states
    const [addPanelistOpen, setAddPanelistOpen] = React.useState(false)
    const [addPanelistBusy, setAddPanelistBusy] = React.useState(false)
    const [addPanelistUserId, setAddPanelistUserId] = React.useState("")

    const [editPanelistOpen, setEditPanelistOpen] = React.useState(false)
    const [editPanelistBusy, setEditPanelistBusy] = React.useState(false)
    const [editingPanelist, setEditingPanelist] = React.useState<PanelistLite | null>(null)
    const [editPanelistUserId, setEditPanelistUserId] = React.useState("")

    const [removePanelistOpen, setRemovePanelistOpen] = React.useState(false)
    const [removePanelistBusy, setRemovePanelistBusy] = React.useState(false)
    const [removingPanelist, setRemovingPanelist] = React.useState<PanelistLite | null>(null)

    const [createPanelistUserOpen, setCreatePanelistUserOpen] = React.useState(false)
    const [createPanelistBusy, setCreatePanelistBusy] = React.useState(false)
    const [createPanelistName, setCreatePanelistName] = React.useState("")
    const [createPanelistEmail, setCreatePanelistEmail] = React.useState("")
    const [createPanelistStatus, setCreatePanelistStatus] = React.useState<UserStatus>("active")
    const [createPanelistAssignMode, setCreatePanelistAssignMode] =
        React.useState<"assign" | "directory">("assign")
    const [createPanelistForceAssign, setCreatePanelistForceAssign] = React.useState(false)

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

    const panelistUsers = React.useMemo(() => {
        return users
            .filter((user) => (user.role ?? "").toLowerCase() === PANELIST_ROLE)
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [users])

    const panelistCandidateOptions = React.useMemo(() => {
        const merged: UserDirectoryOption[] = [...panelistUsers]

        for (const panelist of schedule?.panelists ?? []) {
            if (!panelist.id) continue
            if (merged.some((u) => u.id === panelist.id)) continue

            merged.push({
                id: panelist.id,
                name: panelist.name,
                email: panelist.email,
                role: PANELIST_ROLE,
                status: "active",
            })
        }

        return uniqueById(merged).sort((a, b) => a.name.localeCompare(b.name))
    }, [panelistUsers, schedule])

    const unassignedPanelistOptions = React.useMemo(() => {
        if (!schedule) return panelistCandidateOptions

        const assignedIds = new Set(
            schedule.panelists.map((panelist) => panelist.id).filter(Boolean),
        )

        return panelistCandidateOptions.filter((user) => !assignedIds.has(user.id))
    }, [panelistCandidateOptions, schedule])

    const editPanelistOptions = React.useMemo(() => {
        if (!editingPanelist) return panelistCandidateOptions
        if (!schedule) return panelistCandidateOptions

        const assignedIds = new Set(
            schedule.panelists.map((panelist) => panelist.id).filter(Boolean),
        )

        return panelistCandidateOptions.filter(
            (user) => user.id === editingPanelist.id || !assignedIds.has(user.id),
        )
    }, [editingPanelist, panelistCandidateOptions, schedule])

    const hasPanelistUsers = panelistUsers.length > 0
    const panelistMutationBusy =
        addPanelistBusy || editPanelistBusy || removePanelistBusy || createPanelistBusy

    const resolvedGroupTitle = React.useMemo(() => {
        if (!schedule) return "Unassigned Group"
        return schedule.group_title || groupTitleById.get(schedule.group_id) || schedule.group_id || "Unassigned Group"
    }, [schedule, groupTitleById])

    const resolvedRubricName = React.useMemo(() => {
        if (!schedule) return "Not set"
        return (
            schedule.rubric_template_name ||
            (schedule.rubric_template_id ? rubricNameById.get(schedule.rubric_template_id) : null) ||
            schedule.rubric_template_id ||
            "Not set"
        )
    }, [schedule, rubricNameById])

    const resolvedCreatedBy = React.useMemo(() => {
        if (!schedule) return "System"

        if (schedule.created_by_name) return schedule.created_by_name
        if (schedule.created_by_email) return schedule.created_by_email

        const creatorId = schedule.created_by_id
        if (creatorId) {
            const user = userById.get(creatorId)
            if (user?.name) return user.name
            if (user?.email) return user.email
            return creatorId
        }

        if (schedule.created_by) return schedule.created_by
        return "System"
    }, [schedule, userById])

    const resolvedCreatedBySubline = React.useMemo(() => {
        if (!schedule) return null

        if (schedule.created_by_name) {
            return schedule.created_by_email || schedule.created_by_id || null
        }

        if (schedule.created_by_email && schedule.created_by_id) {
            return schedule.created_by_id
        }

        return null
    }, [schedule])

    const loadSchedule = React.useCallback(async (): Promise<boolean> => {
        if (!scheduleId) {
            setError("Invalid defense schedule ID.")
            setSchedule(null)
            setLoading(false)
            return false
        }

        setLoading(true)
        setError(null)

        try {
            const row = await fetchDefenseScheduleById(scheduleId)
            setSchedule(row)
            return true
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load defense schedule.")
            setSchedule(null)
            return false
        } finally {
            setLoading(false)
        }
    }, [scheduleId])

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

    const refreshScheduleSilently = React.useCallback(async () => {
        if (!scheduleId) return

        try {
            const latest = await fetchDefenseScheduleById(scheduleId)
            setSchedule(latest)
        } catch {
            await loadSchedule()
        }
    }, [loadSchedule, scheduleId])

    React.useEffect(() => {
        void loadSchedule()
        void loadReferenceData()
    }, [loadSchedule, loadReferenceData])

    React.useEffect(() => {
        if (!addPanelistOpen) return
        if (unassignedPanelistOptions.length === 0) {
            setAddPanelistUserId("")
            return
        }

        if (!unassignedPanelistOptions.some((option) => option.id === addPanelistUserId)) {
            setAddPanelistUserId(unassignedPanelistOptions[0]!.id)
        }
    }, [addPanelistOpen, addPanelistUserId, unassignedPanelistOptions])

    React.useEffect(() => {
        if (!editPanelistOpen || !editingPanelist) return
        if (editPanelistOptions.length === 0) {
            setEditPanelistUserId(editingPanelist.id)
            return
        }

        if (!editPanelistOptions.some((option) => option.id === editPanelistUserId)) {
            const currentInOptions = editPanelistOptions.find(
                (option) => option.id === editingPanelist.id,
            )
            setEditPanelistUserId(
                currentInOptions?.id ?? editPanelistOptions[0]!.id,
            )
        }
    }, [editPanelistOpen, editingPanelist, editPanelistOptions, editPanelistUserId])

    const groupSelectOptions = React.useMemo(() => {
        if (!editForm.group_id) return groups
        if (groups.some((g) => g.id === editForm.group_id)) return groups
        return [{ id: editForm.group_id, title: `Current: ${editForm.group_id}` }, ...groups]
    }, [groups, editForm.group_id])

    const rubricSelectOptions = React.useMemo(() => {
        if (!editForm.rubric_template_id) return rubrics
        if (rubrics.some((r) => r.id === editForm.rubric_template_id)) return rubrics
        return [{ id: editForm.rubric_template_id, name: `Current: ${editForm.rubric_template_id}` }, ...rubrics]
    }, [rubrics, editForm.rubric_template_id])

    const handleRefresh = React.useCallback(async () => {
        const ok = await loadSchedule()
        await loadReferenceData()

        if (ok) {
            toast.success("Defense schedule refreshed.")
        } else {
            toast.error("Could not refresh defense schedule.")
        }
    }, [loadSchedule, loadReferenceData])

    const openEditDialog = React.useCallback(() => {
        if (!schedule) return

        const dateParts = parseIsoToDateParts(schedule.scheduled_at)

        setEditForm({
            group_id: schedule.group_id,
            scheduled_date: dateParts.date,
            scheduled_hour: dateParts.hour,
            scheduled_minute: dateParts.minute,
            scheduled_period: dateParts.period,
            room: schedule.room ?? "",
            status: STATUS_ACTIONS.includes(schedule.status) ? schedule.status : "scheduled",
            rubric_template_id: schedule.rubric_template_id ?? "",
        })
        setEditOpen(true)
    }, [schedule])

    const openCreatePanelistUserDialog = React.useCallback(
        (
            mode: "assign" | "directory" = "assign",
            options?: { forceAssign?: boolean },
        ) => {
            const forceAssign = Boolean(options?.forceAssign) && !!schedule

            setCreatePanelistName("")
            setCreatePanelistEmail("")
            setCreatePanelistStatus("active")
            setCreatePanelistAssignMode(
                schedule ? (forceAssign ? "assign" : mode) : "directory",
            )
            setCreatePanelistForceAssign(forceAssign)
            setCreatePanelistUserOpen(true)

            if (forceAssign) {
                toast.info("No available panelist user. Create one now and it will be assigned automatically.")
            }
        },
        [schedule],
    )

    const openAddPanelistDialog = React.useCallback(() => {
        if (!schedule) return

        if (unassignedPanelistOptions.length === 0) {
            openCreatePanelistUserDialog("assign", { forceAssign: true })
            return
        }

        setAddPanelistUserId(unassignedPanelistOptions[0]!.id)
        setAddPanelistOpen(true)
    }, [openCreatePanelistUserDialog, schedule, unassignedPanelistOptions])

    const openEditPanelistDialog = React.useCallback(
        (panelist: PanelistLite) => {
            if (!panelist.id) {
                toast.error("This panelist cannot be edited because the user ID is missing.")
                return
            }

            setEditingPanelist(panelist)

            const preferred =
                editPanelistOptions.find((option) => option.id === panelist.id)?.id ??
                panelist.id

            setEditPanelistUserId(preferred)
            setEditPanelistOpen(true)
        },
        [editPanelistOptions],
    )

    const openRemovePanelistDialog = React.useCallback((panelist: PanelistLite) => {
        if (!panelist.id) {
            toast.error("This panelist cannot be removed because the user ID is missing.")
            return
        }

        setRemovingPanelist(panelist)
        setRemovePanelistOpen(true)
    }, [])

    const handleSetStatus = React.useCallback(
        async (nextStatus: DefenseScheduleStatus) => {
            if (!schedule || busyStatus) return

            setBusyStatus(nextStatus)
            setError(null)

            try {
                const updated = await updateDefenseScheduleStatus(schedule.id, nextStatus)

                if (updated) {
                    setSchedule(updated)
                } else {
                    setSchedule((prev) =>
                        prev
                            ? {
                                ...prev,
                                status: nextStatus,
                                updated_at: new Date().toISOString(),
                            }
                            : prev,
                    )
                }

                toast.success(`Status updated to ${toTitleCase(nextStatus)}.`)
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to update status."
                setError(message)
                toast.error(message)
            } finally {
                setBusyStatus(null)
            }
        },
        [schedule, busyStatus],
    )

    const handleAddPanelist = React.useCallback(async () => {
        if (!schedule || addPanelistBusy) return

        const userId = addPanelistUserId.trim()
        if (!userId) {
            toast.error("Please select a panelist user to assign.")
            return
        }

        if (schedule.panelists.some((panelist) => panelist.id === userId)) {
            toast.error("This panelist is already assigned to the schedule.")
            return
        }

        setAddPanelistBusy(true)
        setError(null)

        try {
            await addPanelistToDefenseSchedule(schedule.id, userId)
            await refreshScheduleSilently()

            const selected = panelistCandidateOptions.find((u) => u.id === userId)
            const displayName = selected?.name || "Panelist"

            setAddPanelistOpen(false)
            toast.success(`${displayName} was added to the panel.`)
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to add panelist to this schedule."
            setError(message)
            toast.error(message)
        } finally {
            setAddPanelistBusy(false)
        }
    }, [
        addPanelistBusy,
        addPanelistUserId,
        panelistCandidateOptions,
        refreshScheduleSilently,
        schedule,
    ])

    const handleUpdatePanelist = React.useCallback(async () => {
        if (!schedule || !editingPanelist || editPanelistBusy) return

        const nextUserId = editPanelistUserId.trim()
        if (!nextUserId) {
            toast.error("Please select the replacement panelist user.")
            return
        }

        if (!editingPanelist.id) {
            toast.error("Cannot update panelist because the current panelist ID is missing.")
            return
        }

        if (nextUserId === editingPanelist.id) {
            toast.error("Please choose a different panelist user.")
            return
        }

        setEditPanelistBusy(true)
        setError(null)

        try {
            await replaceDefenseSchedulePanelist(schedule.id, editingPanelist.id, nextUserId)
            await refreshScheduleSilently()

            const selected = panelistCandidateOptions.find((u) => u.id === nextUserId)
            const displayName = selected?.name || "panelist"

            setEditPanelistOpen(false)
            setEditingPanelist(null)
            toast.success(`Panelist updated to ${displayName}.`)
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to update panelist assignment."
            setError(message)
            toast.error(message)
        } finally {
            setEditPanelistBusy(false)
        }
    }, [
        editPanelistBusy,
        editPanelistUserId,
        editingPanelist,
        panelistCandidateOptions,
        refreshScheduleSilently,
        schedule,
    ])

    const handleRemovePanelist = React.useCallback(async () => {
        if (!schedule || !removingPanelist || removePanelistBusy) return

        if (!removingPanelist.id) {
            toast.error("Cannot remove panelist because the user ID is missing.")
            return
        }

        setRemovePanelistBusy(true)
        setError(null)

        try {
            await removePanelistFromDefenseSchedule(schedule.id, removingPanelist.id)
            await refreshScheduleSilently()

            const displayName = removingPanelist.name || "Panelist"

            setRemovePanelistOpen(false)
            setRemovingPanelist(null)
            toast.success(`${displayName} was removed from the panel.`)
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to remove panelist from schedule."
            setError(message)
            toast.error(message)
        } finally {
            setRemovePanelistBusy(false)
        }
    }, [removePanelistBusy, refreshScheduleSilently, removingPanelist, schedule])

    const handleCreatePanelistUser = React.useCallback(async () => {
        if (createPanelistBusy) return

        const name = createPanelistName.trim()
        const email = createPanelistEmail.trim().toLowerCase()

        if (!name) {
            toast.error("Panelist name is required.")
            return
        }

        if (!email) {
            toast.error("Panelist email is required.")
            return
        }

        if (!isValidEmail(email)) {
            toast.error("Please provide a valid email address.")
            return
        }

        const duplicateEmailUser = users.find(
            (user) => (user.email ?? "").toLowerCase() === email,
        )

        if (duplicateEmailUser) {
            toast.error("A user with this email already exists.")
            return
        }

        setCreatePanelistBusy(true)
        setError(null)

        try {
            const result = await provisionPanelistUser({
                name,
                email,
                status: createPanelistStatus,
            })

            setUsers((prev) => uniqueById([result.user, ...prev]))

            const shouldAssign =
                !!schedule &&
                (createPanelistForceAssign || createPanelistAssignMode === "assign")

            if (shouldAssign && schedule) {
                await addPanelistToDefenseSchedule(schedule.id, result.user.id)
                await refreshScheduleSilently()
            }

            setAddPanelistUserId(result.user.id)
            setCreatePanelistUserOpen(false)

            setCreatePanelistName("")
            setCreatePanelistEmail("")
            setCreatePanelistStatus("active")
            setCreatePanelistAssignMode(schedule ? "assign" : "directory")
            setCreatePanelistForceAssign(false)

            if (shouldAssign) {
                toast.success(
                    `${result.user.name} created and assigned as panelist to this schedule.`,
                )
            } else {
                toast.success(
                    result.message ||
                    `${result.user.name} created successfully as panelist.`,
                )
            }

            if (result.emailError) {
                toast.error(`Panelist created, but login email could not be sent: ${result.emailError}`)
            }

            await loadReferenceData()
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to create panelist user."
            setError(message)
            toast.error(message)
        } finally {
            setCreatePanelistBusy(false)
        }
    }, [
        createPanelistAssignMode,
        createPanelistBusy,
        createPanelistEmail,
        createPanelistForceAssign,
        createPanelistName,
        createPanelistStatus,
        loadReferenceData,
        refreshScheduleSilently,
        schedule,
        users,
    ])

    const handleSaveEdit = React.useCallback(async () => {
        if (!schedule || editBusy) return

        const groupId = editForm.group_id.trim()
        if (!groupId) {
            toast.error("Please select a thesis group.")
            return
        }

        const scheduledAtIso = buildScheduledAtIso(editForm)
        if (!scheduledAtIso) {
            toast.error("Please select a valid schedule date and time.")
            return
        }

        const payload: DefenseScheduleMutationPayload = {
            group_id: groupId,
            scheduled_at: scheduledAtIso,
            room: editForm.room.trim() || null,
            status: editForm.status,
            rubric_template_id: editForm.rubric_template_id.trim() || null,
        }

        setEditBusy(true)
        setError(null)

        try {
            const updated = await updateDefenseSchedule(schedule.id, payload)

            if (updated) {
                setSchedule(updated)
            } else {
                await loadSchedule()
            }

            setEditOpen(false)
            toast.success("Defense schedule updated successfully.")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to update defense schedule."
            setError(message)
            toast.error(message)
        } finally {
            setEditBusy(false)
        }
    }, [schedule, editBusy, editForm, loadSchedule])

    const handleDelete = React.useCallback(async () => {
        if (!schedule || deleteBusy) return

        setDeleteBusy(true)
        setError(null)

        try {
            await deleteDefenseSchedule(schedule.id)
            toast.success("Defense schedule deleted successfully.")
            router.push("/dashboard/admin/defense-schedules")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to delete defense schedule."
            setError(message)
            toast.error(message)
        } finally {
            setDeleteBusy(false)
        }
    }, [schedule, deleteBusy, router])

    const handleAddPanelistOpenChange = React.useCallback(
        (open: boolean) => {
            if (!open && addPanelistBusy) return
            setAddPanelistOpen(open)
        },
        [addPanelistBusy],
    )

    const handleEditPanelistOpenChange = React.useCallback(
        (open: boolean) => {
            if (!open && editPanelistBusy) return
            setEditPanelistOpen(open)
            if (!open) setEditingPanelist(null)
        },
        [editPanelistBusy],
    )

    const handleCreatePanelistUserOpenChange = React.useCallback(
        (open: boolean) => {
            if (!open && createPanelistBusy) return
            setCreatePanelistUserOpen(open)

            if (!open) {
                setCreatePanelistForceAssign(false)
                setCreatePanelistAssignMode(schedule ? "assign" : "directory")
            }
        },
        [createPanelistBusy, schedule],
    )

    const handleRemovePanelistOpenChange = React.useCallback(
        (open: boolean) => {
            if (!open && removePanelistBusy) return
            setRemovePanelistOpen(open)
            if (!open) setRemovingPanelist(null)
        },
        [removePanelistBusy],
    )

    const handleEditOpenChange = React.useCallback(
        (open: boolean) => {
            if (!open && editBusy) return
            setEditOpen(open)
        },
        [editBusy],
    )

    const handleDeleteOpenChange = React.useCallback(
        (open: boolean) => {
            if (!open && deleteBusy) return
            setDeleteOpen(open)
        },
        [deleteBusy],
    )

    return (
        <DashboardLayout
            title="Defense Schedule Details"
            description="Review, update, and manage a defense schedule."
        >
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/dashboard/admin/defense-schedules">Back to Defense Schedules</Link>
                    </Button>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={loading}>
                            Refresh
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={loading || !schedule}
                            onClick={openEditDialog}
                        >
                            Edit Schedule
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={loading || !schedule}
                            onClick={() => setDeleteOpen(true)}
                        >
                            Delete Schedule
                        </Button>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                {loading ? (
                    <div className="space-y-3">
                        <div className="h-28 animate-pulse rounded-lg border bg-muted/50" />
                        <div className="h-28 animate-pulse rounded-lg border bg-muted/50" />
                        <div className="h-40 animate-pulse rounded-lg border bg-muted/50" />
                    </div>
                ) : !schedule ? (
                    <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                        Defense schedule not found.
                    </div>
                ) : (
                    <>
                        <DefenseScheduleOverviewSection
                            schedule={schedule}
                            resolvedGroupTitle={resolvedGroupTitle}
                            resolvedRubricName={resolvedRubricName}
                            resolvedCreatedBy={resolvedCreatedBy}
                            resolvedCreatedBySubline={resolvedCreatedBySubline}
                            statusActions={STATUS_ACTIONS}
                            busyStatus={busyStatus}
                            onSetStatus={handleSetStatus}
                            formatDateTime={formatDateTime}
                            toTitleCase={toTitleCase}
                            statusBadgeClass={statusBadgeClass}
                        />

                        <DefenseSchedulePanelistsSection
                            panelists={schedule.panelists}
                            hasPanelistUsers={hasPanelistUsers}
                            panelistMutationBusy={panelistMutationBusy}
                            addPanelistBusy={addPanelistBusy}
                            onOpenAddPanelistDialog={openAddPanelistDialog}
                            onOpenCreatePanelistUserDialog={() => openCreatePanelistUserDialog("assign")}
                            onOpenEditPanelistDialog={openEditPanelistDialog}
                            onOpenRemovePanelistDialog={openRemovePanelistDialog}
                        />
                    </>
                )}
            </div>

            <DefenseSchedulePanelistDialogs
                scheduleExists={!!schedule}
                addPanelistOpen={addPanelistOpen}
                onAddPanelistOpenChange={handleAddPanelistOpenChange}
                addPanelistBusy={addPanelistBusy}
                addPanelistUserId={addPanelistUserId}
                setAddPanelistUserId={setAddPanelistUserId}
                unassignedPanelistOptions={unassignedPanelistOptions}
                onAddPanelist={handleAddPanelist}
                editPanelistOpen={editPanelistOpen}
                onEditPanelistOpenChange={handleEditPanelistOpenChange}
                editPanelistBusy={editPanelistBusy}
                editingPanelist={editingPanelist}
                editPanelistUserId={editPanelistUserId}
                setEditPanelistUserId={setEditPanelistUserId}
                editPanelistOptions={editPanelistOptions}
                onUpdatePanelist={handleUpdatePanelist}
                createPanelistUserOpen={createPanelistUserOpen}
                onCreatePanelistUserOpenChange={handleCreatePanelistUserOpenChange}
                createPanelistBusy={createPanelistBusy}
                createPanelistName={createPanelistName}
                setCreatePanelistName={setCreatePanelistName}
                createPanelistEmail={createPanelistEmail}
                setCreatePanelistEmail={setCreatePanelistEmail}
                createPanelistStatus={createPanelistStatus}
                setCreatePanelistStatus={setCreatePanelistStatus}
                createPanelistAssignMode={createPanelistAssignMode}
                setCreatePanelistAssignMode={setCreatePanelistAssignMode}
                createPanelistForceAssign={createPanelistForceAssign}
                createPanelistStatuses={CREATE_PANELIST_STATUSES}
                toTitleCase={toTitleCase}
                onCreatePanelistUser={handleCreatePanelistUser}
                removePanelistOpen={removePanelistOpen}
                onRemovePanelistOpenChange={handleRemovePanelistOpenChange}
                removePanelistBusy={removePanelistBusy}
                removingPanelist={removingPanelist}
                onRemovePanelist={handleRemovePanelist}
                onOpenCreatePanelistUserDialog={openCreatePanelistUserDialog}
            />

            <DefenseScheduleEditDeleteDialogs
                editOpen={editOpen}
                onEditOpenChange={handleEditOpenChange}
                editBusy={editBusy}
                editForm={editForm}
                setEditForm={setEditForm}
                groupSelectOptions={groupSelectOptions}
                rubricSelectOptions={rubricSelectOptions}
                metaLoading={metaLoading}
                statusActions={STATUS_ACTIONS}
                hourOptions={HOUR_OPTIONS}
                minuteOptions={MINUTE_OPTIONS}
                rubricNoneValue={RUBRIC_NONE_VALUE}
                toTitleCase={toTitleCase}
                formatCalendarDate={formatCalendarDate}
                onSaveEdit={handleSaveEdit}
                deleteOpen={deleteOpen}
                onDeleteOpenChange={handleDeleteOpenChange}
                deleteBusy={deleteBusy}
                onDelete={handleDelete}
            />
        </DashboardLayout>
    )
}
