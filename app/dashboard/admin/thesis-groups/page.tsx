"use client"

import * as React from "react"
import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal, Plus } from "lucide-react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import DataTable from "@/components/data-table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type ThesisGroupListItem = {
  id: string
  title: string
  program: string | null
  term: string | null
  adviserId: string | null
  manualAdviserInfo: string | null
  membersCount: number | null
  createdAt: string | null
  updatedAt: string | null
}

type StaffUserItem = {
  id: string
  name: string
  email: string | null
  status: string | null
}

type ThesisGroupFormState = {
  title: string
  program: string
  adviserUserId: string
  semester: string
  customSemester: string
  schoolYearStart: string
}

type FetchResult = {
  endpoint: string
  payload: unknown | null
  status: number
}

type MutationWithFallbackResult = {
  result: FetchResult
  payloadUsed: Record<string, unknown>
  usedFallback: boolean
}

type UserStatus = "active" | "disabled"

const LIST_ENDPOINTS = [
  "/api/thesis-groups",
  "/api/admin/thesis-groups",
  "/api/thesis/groups",
  "/api/admin/thesis/groups",
] as const

const STAFF_LIST_ENDPOINTS = [
  "/api/staff",
  `/api/users?where=${encodeURIComponent(JSON.stringify({ role: "staff" }))}`,
  "/api/users?role=staff",
  "/api/users",
] as const

const WRITE_BASE_ENDPOINTS = [...LIST_ENDPOINTS]

const STANDARD_SEMESTERS = ["1st Semester", "2nd Semester", "Summer"] as const
const SEMESTER_NONE_VALUE = "__none__"
const SEMESTER_OTHER_VALUE = "__other__"
const ADVISER_NONE_VALUE = "__none_adviser__"
const CREATE_USER_STATUSES: UserStatus[] = ["active", "disabled"]

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function unwrapItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload

  const rec = asRecord(payload)
  if (!rec) return []

  const directItems = rec.items
  if (Array.isArray(directItems)) return directItems

  const directData = rec.data
  if (Array.isArray(directData)) return directData

  const directGroups = rec.groups
  if (Array.isArray(directGroups)) return directGroups

  return []
}

function unwrapItem(payload: unknown): unknown {
  const rec = asRecord(payload)
  if (!rec) return payload

  if (rec.item) return rec.item
  if (rec.data) return rec.data

  return payload
}

function extractRoleLower(rec: Record<string, unknown>): string | null {
  const direct = toStringOrNull(rec.role ?? rec.user_role ?? rec.userRole)
  if (direct) return direct.toLowerCase()

  const userRec = asRecord(rec.user)
  const nested = userRec ? toStringOrNull(userRec.role ?? userRec.user_role) : null
  if (nested) return nested.toLowerCase()

  return null
}

function normalizeGroup(raw: unknown): ThesisGroupListItem | null {
  const rec = asRecord(raw)
  if (!rec) return null

  const id = toStringOrNull(rec.id ?? rec.group_id)
  if (!id) return null

  const title = toStringOrNull(rec.title ?? rec.group_title) ?? `Group ${id.slice(0, 8)}`
  const program = toStringOrNull(rec.program)
  const term = toStringOrNull(rec.term)
  const adviserId = toStringOrNull(rec.adviser_id ?? rec.adviserId)
  const manualAdviserInfo = toStringOrNull(
    rec.manual_adviser_info ??
    rec.manualAdviserInfo ??
    rec.adviser_name ??
    rec.adviserName ??
    rec.adviser
  )

  const membersCount = toNumberOrNull(rec.members_count ?? rec.member_count ?? rec.membersCount)

  const createdAt = toStringOrNull(rec.created_at ?? rec.createdAt)
  const updatedAt = toStringOrNull(rec.updated_at ?? rec.updatedAt)

  return {
    id,
    title,
    program,
    term,
    adviserId,
    manualAdviserInfo,
    membersCount,
    createdAt,
    updatedAt,
  }
}

function normalizeStaffUser(raw: unknown): StaffUserItem | null {
  const rec = asRecord(raw)
  if (!rec) return null

  const id = toStringOrNull(rec.id ?? rec.user_id)
  if (!id) return null

  const role = extractRoleLower(rec)
  if (role && role !== "staff") return null

  const name = toStringOrNull(rec.name ?? rec.full_name) ?? "Unnamed Staff"

  return {
    id,
    name,
    email: toStringOrNull(rec.email),
    status: toStringOrNull(rec.status),
  }
}

function dedupeStaffUsers(items: StaffUserItem[]): StaffUserItem[] {
  const map = new Map<string, StaffUserItem>()

  for (const item of items) {
    const existing = map.get(item.id)
    if (!existing) {
      map.set(item.id, item)
      continue
    }

    map.set(item.id, {
      id: item.id,
      name:
        existing.name === "Unnamed Staff" && item.name !== "Unnamed Staff"
          ? item.name
          : existing.name,
      email: existing.email ?? item.email,
      status: existing.status ?? item.status,
    })
  }

  return [...map.values()]
}

function sortNewest(items: ThesisGroupListItem[]): ThesisGroupListItem[] {
  return [...items].sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return tb - ta
  })
}

function sortStaff(items: StaffUserItem[]): StaffUserItem[] {
  return [...items].sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name, "en", { sensitivity: "base" })
    if (nameCompare !== 0) return nameCompare
    return a.id.localeCompare(b.id)
  })
}

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d)
}

function toNullableTrimmed(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function sanitizeSelectValue(value: string, fallback: string): string {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/**
 * Build payload with required adviser link only (manual adviser entry removed).
 */
function buildThesisGroupMutationPayload(input: {
  title: string
  program: string
  term: string | null
  adviserId: string
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: input.title,
    adviser_id: input.adviserId,
    adviserId: input.adviserId,
  }

  const program = toNullableTrimmed(input.program)
  if (program !== null) payload.program = program

  if (input.term !== null) payload.term = input.term

  return payload
}

function normalizeActionError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : fallback
  const msg = (raw ?? "").trim()

  if (!msg) return fallback

  if (/adviserid|adviser_id|foreign key|constraint|violates/i.test(msg)) {
    return "Unable to save adviser assignment due to a server schema mismatch. Please verify adviser user mapping in the API."
  }

  return msg
}

function parseResponseBodySafe(res: Response): Promise<unknown | null> {
  return res.text().then((text) => {
    if (!text) return null
    try {
      return JSON.parse(text) as unknown
    } catch {
      return { message: text }
    }
  })
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  const rec = asRecord(payload)
  if (!rec) return fallback
  const error = toStringOrNull(rec.error)
  if (error) return error
  const message = toStringOrNull(rec.message)
  if (message) return message
  return fallback
}

function currentYearText(): string {
  return String(new Date().getFullYear())
}

function defaultCreateFormState(): ThesisGroupFormState {
  return {
    title: "",
    program: "",
    adviserUserId: ADVISER_NONE_VALUE,
    semester: "1st Semester",
    customSemester: "",
    schoolYearStart: currentYearText(),
  }
}

function defaultEditFormState(): ThesisGroupFormState {
  return {
    title: "",
    program: "",
    adviserUserId: ADVISER_NONE_VALUE,
    semester: SEMESTER_NONE_VALUE,
    customSemester: "",
    schoolYearStart: currentYearText(),
  }
}

function parseTermToFormFields(term: string | null): Pick<
  ThesisGroupFormState,
  "semester" | "customSemester" | "schoolYearStart"
> {
  if (!term || !term.trim()) {
    return {
      semester: SEMESTER_NONE_VALUE,
      customSemester: "",
      schoolYearStart: currentYearText(),
    }
  }

  const raw = term.trim()

  const ayPattern = /^(.+?)\s+AY\s+(\d{4})\s*-\s*(\d{4})$/i
  const match = raw.match(ayPattern)

  let semesterLabel = raw
  let schoolYearStart = ""

  if (match) {
    semesterLabel = match[1].trim()
    schoolYearStart = match[2]
  }

  const known = STANDARD_SEMESTERS.find(
    (value) => value.toLowerCase() === semesterLabel.toLowerCase()
  )

  if (known) {
    return {
      semester: known,
      customSemester: "",
      schoolYearStart: schoolYearStart || currentYearText(),
    }
  }

  return {
    semester: SEMESTER_OTHER_VALUE,
    customSemester: semesterLabel,
    schoolYearStart: schoolYearStart || currentYearText(),
  }
}

function normalizeSchoolYearStart(raw: string): number | null {
  const text = raw.trim()
  if (!/^\d{4}$/.test(text)) return null

  const year = Number(text)
  if (!Number.isInteger(year)) return null
  if (year < 1900 || year > 9999) return null

  return year
}

function buildTermFromForm(form: ThesisGroupFormState): { term: string | null; error: string | null } {
  if (form.semester === SEMESTER_NONE_VALUE) {
    return { term: null, error: null }
  }

  const semesterLabel =
    form.semester === SEMESTER_OTHER_VALUE ? form.customSemester.trim() : form.semester.trim()

  if (!semesterLabel) {
    return { term: null, error: "Please specify the semester." }
  }

  const schoolYearStart = normalizeSchoolYearStart(form.schoolYearStart)
  if (schoolYearStart === null) {
    return {
      term: null,
      error: "School Year start must be a valid 4-digit year (e.g., 2026).",
    }
  }

  const schoolYearEnd = schoolYearStart + 1
  return {
    term: `${semesterLabel} AY ${schoolYearStart}-${schoolYearEnd}`,
    error: null,
  }
}

function buildTermPreview(form: ThesisGroupFormState): string {
  const built = buildTermFromForm(form)
  if (built.error) {
    if (form.semester === SEMESTER_NONE_VALUE) return "No term"
    const semesterLabel =
      form.semester === SEMESTER_OTHER_VALUE ? form.customSemester.trim() : form.semester
    return semesterLabel || "No term"
  }
  return built.term ?? "No term"
}

function isDisabledStaff(staff: StaffUserItem): boolean {
  return (staff.status ?? "").trim().toLowerCase() === "disabled"
}

function buildCompatibilityPayloadVariants(
  basePayload: Record<string, unknown>
): Record<string, unknown>[] {
  const variants: Record<string, unknown>[] = []
  const seen = new Set<string>()

  const pushUnique = (candidate: Record<string, unknown>) => {
    if (!candidate || Object.keys(candidate).length === 0) return
    const key = JSON.stringify(candidate)
    if (seen.has(key)) return
    seen.add(key)
    variants.push(candidate)
  }

  // Variant A: send both adviser key styles
  pushUnique({ ...basePayload })

  // Variant B: snake_case only
  if (Object.prototype.hasOwnProperty.call(basePayload, "adviserId")) {
    const next = { ...basePayload }
    delete next.adviserId
    pushUnique(next)
  }

  // Variant C: camelCase only
  if (Object.prototype.hasOwnProperty.call(basePayload, "adviser_id")) {
    const next = { ...basePayload }
    delete next.adviser_id
    pushUnique(next)
  }

  return variants
}

function shouldAttemptPayloadFallback(message: string): boolean {
  const normalized = message.trim().toLowerCase()
  if (!normalized) return false

  return (
    normalized.includes("internal server error") ||
    normalized.includes("returned 500") ||
    (normalized.includes("column") && normalized.includes("does not exist")) ||
    normalized.includes("schema") ||
    normalized.includes("foreign key") ||
    normalized.includes("constraint") ||
    normalized.includes("violates") ||
    normalized.includes("invalid input syntax")
  )
}

async function fetchFirstAvailableJson(
  endpoints: readonly string[],
  signal: AbortSignal
): Promise<FetchResult | null> {
  let lastError: Error | null = null

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
      })

      if (res.status === 404 || res.status === 405) {
        continue
      }

      const payload = await parseResponseBodySafe(res)

      if (!res.ok) {
        const message = extractErrorMessage(payload, `${endpoint} returned ${res.status}`)
        lastError = new Error(message)
        continue
      }

      return {
        endpoint,
        payload,
        status: res.status,
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error
      }
      lastError = error instanceof Error ? error : new Error("Request failed")
    }
  }

  if (lastError) throw lastError
  return null
}

async function fetchAllSuccessfulJson(
  endpoints: readonly string[],
  signal: AbortSignal
): Promise<FetchResult[]> {
  const results: FetchResult[] = []
  let lastError: Error | null = null

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
      })

      if (res.status === 404 || res.status === 405) continue

      const payload = await parseResponseBodySafe(res)

      if (!res.ok) {
        lastError = new Error(extractErrorMessage(payload, `${endpoint} returned ${res.status}`))
        continue
      }

      results.push({
        endpoint,
        payload,
        status: res.status,
      })
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error
      lastError = error instanceof Error ? error : new Error("Request failed")
    }
  }

  if (results.length === 0 && lastError) throw lastError
  return results
}

/**
 * IMPORTANT for UX:
 * - We only fallback on route-shape incompatibility (404/405).
 * - For validation/auth/server errors on a compatible route, stop immediately
 *   so we don't spam multiple POST/PATCH attempts.
 */
async function requestFirstAvailable(
  endpoints: readonly string[],
  init: RequestInit
): Promise<FetchResult> {
  let lastError: Error | null = null

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        ...init,
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      })

      if (res.status === 404 || res.status === 405) continue

      const payload = await parseResponseBodySafe(res)

      if (!res.ok) {
        throw new Error(extractErrorMessage(payload, `${endpoint} returned ${res.status}`))
      }

      return { endpoint, payload, status: res.status }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Request failed")
      break
    }
  }

  if (lastError) throw lastError
  throw new Error("No compatible thesis-group API endpoint found for this action.")
}

async function requestFirstAvailableWithPayloadFallback(
  endpoints: readonly string[],
  method: "POST" | "PATCH" | "PUT",
  payload: Record<string, unknown>
): Promise<MutationWithFallbackResult> {
  const variants = buildCompatibilityPayloadVariants(payload)
  let lastError: Error | null = null

  for (let index = 0; index < variants.length; index += 1) {
    const candidate = variants[index] ?? {}
    try {
      const result = await requestFirstAvailable(endpoints, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(candidate),
      })

      return {
        result,
        payloadUsed: candidate,
        usedFallback: index > 0,
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Request failed")
      lastError = err

      const hasAnotherVariant = index < variants.length - 1
      if (!hasAnotherVariant) break

      if (!shouldAttemptPayloadFallback(err.message)) break
    }
  }

  if (lastError) throw lastError
  throw new Error("Failed to submit thesis group request.")
}

export default function AdminThesisGroupsPage() {
  const [groups, setGroups] = React.useState<ThesisGroupListItem[]>([])
  const [staffUsers, setStaffUsers] = React.useState<StaffUserItem[]>([])

  const [loading, setLoading] = React.useState<boolean>(true)
  const [staffLoading, setStaffLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)
  const [staffError, setStaffError] = React.useState<string | null>(null)

  const [refreshKey, setRefreshKey] = React.useState<number>(0)
  const [activeBaseEndpoint, setActiveBaseEndpoint] = React.useState<string | null>(null)

  const [createOpen, setCreateOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const [submitting, setSubmitting] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  const [createForm, setCreateForm] = React.useState<ThesisGroupFormState>(defaultCreateFormState())

  const [editTarget, setEditTarget] = React.useState<ThesisGroupListItem | null>(null)
  const [editForm, setEditForm] = React.useState<ThesisGroupFormState>(defaultEditFormState())

  const [deleteTarget, setDeleteTarget] = React.useState<ThesisGroupListItem | null>(null)

  const [createStaffOpen, setCreateStaffOpen] = React.useState(false)
  const [creatingStaffUser, setCreatingStaffUser] = React.useState(false)
  const [createStaffError, setCreateStaffError] = React.useState<string | null>(null)
  const [createStaffName, setCreateStaffName] = React.useState("")
  const [createStaffEmail, setCreateStaffEmail] = React.useState("")
  const [createStaffStatus, setCreateStaffStatus] = React.useState<UserStatus>("active")

  const writeBases = React.useMemo(() => {
    if (!activeBaseEndpoint) return WRITE_BASE_ENDPOINTS
    return [
      activeBaseEndpoint,
      ...WRITE_BASE_ENDPOINTS.filter((endpoint) => endpoint !== activeBaseEndpoint),
    ]
  }, [activeBaseEndpoint])

  const createTermPreview = React.useMemo(() => buildTermPreview(createForm), [createForm])
  const editTermPreview = React.useMemo(() => buildTermPreview(editForm), [editForm])

  const createAdviserSelectValue = React.useMemo(
    () => sanitizeSelectValue(createForm.adviserUserId, ADVISER_NONE_VALUE),
    [createForm.adviserUserId]
  )

  const editAdviserSelectValue = React.useMemo(
    () => sanitizeSelectValue(editForm.adviserUserId, ADVISER_NONE_VALUE),
    [editForm.adviserUserId]
  )

  const editAdviserRawValue = React.useMemo(
    () => toNullableTrimmed(editForm.adviserUserId),
    [editForm.adviserUserId]
  )

  const staffById = React.useMemo(() => {
    const map = new Map<string, StaffUserItem>()
    for (const item of staffUsers) map.set(item.id, item)
    return map
  }, [staffUsers])

  const takenAdviserIds = React.useMemo(() => {
    const set = new Set<string>()
    for (const item of groups) {
      if (item.adviserId) set.add(item.adviserId)
    }
    return set
  }, [groups])

  const availableCreateStaff = React.useMemo(
    () => staffUsers.filter((staff) => !takenAdviserIds.has(staff.id) && !isDisabledStaff(staff)),
    [staffUsers, takenAdviserIds]
  )

  const takenAdviserIdsForEdit = React.useMemo(() => {
    const set = new Set(takenAdviserIds)
    if (editTarget?.adviserId) set.delete(editTarget.adviserId)
    return set
  }, [editTarget?.adviserId, takenAdviserIds])

  const availableEditStaff = React.useMemo(
    () =>
      staffUsers.filter(
        (staff) => !takenAdviserIdsForEdit.has(staff.id) && !isDisabledStaff(staff)
      ),
    [staffUsers, takenAdviserIdsForEdit]
  )

  const resetCreateForm = React.useCallback(() => {
    setCreateForm(defaultCreateFormState())
    setActionError(null)
  }, [])

  const resetCreateStaffForm = React.useCallback(() => {
    setCreateStaffName("")
    setCreateStaffEmail("")
    setCreateStaffStatus("active")
    setCreateStaffError(null)
  }, [])

  const openCreateStaffDialog = React.useCallback(() => {
    resetCreateStaffForm()
    setCreateStaffOpen(true)
  }, [resetCreateStaffForm])

  const openEditDialog = React.useCallback((item: ThesisGroupListItem) => {
    const parsed = parseTermToFormFields(item.term)
    setEditTarget(item)
    setEditForm({
      title: item.title,
      program: item.program ?? "",
      adviserUserId: sanitizeSelectValue(item.adviserId ?? ADVISER_NONE_VALUE, ADVISER_NONE_VALUE),
      semester: parsed.semester,
      customSemester: parsed.customSemester,
      schoolYearStart: parsed.schoolYearStart,
    })
    setActionError(null)
    setEditOpen(true)
  }, [])

  const openDeleteDialog = React.useCallback((item: ThesisGroupListItem) => {
    setDeleteTarget(item)
    setActionError(null)
    setDeleteOpen(true)
  }, [])

  const loadGroups = React.useCallback(
    async (signal: AbortSignal) => {
      setLoading(true)
      setError(null)

      try {
        const result = await fetchFirstAvailableJson(LIST_ENDPOINTS, signal)

        if (!result) {
          setGroups([])
          setActiveBaseEndpoint(null)
          setError(
            "No compatible thesis-group API endpoint found. Wire one of: /api/thesis-groups or /api/admin/thesis-groups."
          )
          return
        }

        setActiveBaseEndpoint(result.endpoint)

        const normalized = unwrapItems(result.payload)
          .map(normalizeGroup)
          .filter((item): item is ThesisGroupListItem => item !== null)

        setGroups(sortNewest(normalized))
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return
        const message = e instanceof Error ? e.message : "Failed to load thesis groups."
        setGroups([])
        setActiveBaseEndpoint(null)
        setError(message)
        toast.error(message)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const loadStaffUsers = React.useCallback(async (signal: AbortSignal) => {
    setStaffLoading(true)
    setStaffError(null)

    try {
      const results = await fetchAllSuccessfulJson(STAFF_LIST_ENDPOINTS, signal)

      if (results.length === 0) {
        setStaffUsers([])
        setStaffError("No compatible staff endpoint found. Create a Staff user to continue.")
        return
      }

      const normalized = results
        .flatMap((result) => unwrapItems(result.payload))
        .map(normalizeStaffUser)
        .filter((item): item is StaffUserItem => item !== null)

      const merged = sortStaff(dedupeStaffUsers(normalized))
      setStaffUsers(merged)

      if (merged.length === 0) {
        setStaffError("No staff users found. Create a Staff user to continue adviser assignment.")
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return
      const message =
        e instanceof Error ? e.message : "Failed to load staff users for adviser selection."
      setStaffUsers([])
      setStaffError(message)
      toast.error(message)
    } finally {
      setStaffLoading(false)
    }
  }, [])

  const handleCreateStaffUser = React.useCallback(async () => {
    if (creatingStaffUser) return

    const name = createStaffName.trim()
    const email = createStaffEmail.trim().toLowerCase()

    setCreateStaffError(null)

    if (!name) {
      const msg = "Staff name is required."
      setCreateStaffError(msg)
      toast.error(msg)
      return
    }

    if (!email) {
      const msg = "Staff email is required."
      setCreateStaffError(msg)
      toast.error(msg)
      return
    }

    if (!isValidEmail(email)) {
      const msg = "Please provide a valid email address."
      setCreateStaffError(msg)
      toast.error(msg)
      return
    }

    setCreatingStaffUser(true)
    const loadingToastId = toast.loading("Creating staff user...")

    try {
      const res = await fetch("/api/users/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          name,
          email,
          role: "staff",
          status: createStaffStatus,
          sendLoginDetails: true,
        }),
      })

      const payload = await parseResponseBodySafe(res)
      const body = asRecord(payload)

      if (!res.ok) {
        throw new Error(extractErrorMessage(payload, "Failed to create staff user."))
      }

      const createdRaw = body?.item ?? body?.data ?? null
      const createdStaff = normalizeStaffUser(createdRaw)

      if (!createdStaff) {
        throw new Error(
          "Staff user was created but returned data shape is unsupported for adviser listing."
        )
      }

      setStaffUsers((prev) => sortStaff(dedupeStaffUsers([createdStaff, ...prev])))

      setCreateForm((prev) =>
        prev.adviserUserId === ADVISER_NONE_VALUE ? { ...prev, adviserUserId: createdStaff.id } : prev
      )

      setEditForm((prev) =>
        prev.adviserUserId === ADVISER_NONE_VALUE ? { ...prev, adviserUserId: createdStaff.id } : prev
      )

      const successMessage =
        toStringOrNull(body?.message) ??
        "Staff user created successfully. Login details were sent to email."

      toast.success(successMessage, { id: loadingToastId })
      setCreateStaffOpen(false)
      resetCreateStaffForm()
    } catch (e) {
      const message = normalizeActionError(e, "Failed to create staff user.")
      setCreateStaffError(message)
      toast.error(message, { id: loadingToastId })
    } finally {
      setCreatingStaffUser(false)
    }
  }, [
    createStaffEmail,
    createStaffName,
    createStaffStatus,
    creatingStaffUser,
    resetCreateStaffForm,
  ])

  React.useEffect(() => {
    const controller = new AbortController()
    void loadGroups(controller.signal)
    void loadStaffUsers(controller.signal)
    return () => controller.abort()
  }, [loadGroups, loadStaffUsers, refreshKey])

  React.useEffect(() => {
    if (!createOpen) return
    if (createAdviserSelectValue !== ADVISER_NONE_VALUE) return

    const firstAvailable = availableCreateStaff[0]?.id
    if (!firstAvailable) return

    setCreateForm((prev) =>
      sanitizeSelectValue(prev.adviserUserId, ADVISER_NONE_VALUE) === ADVISER_NONE_VALUE
        ? { ...prev, adviserUserId: firstAvailable }
        : prev
    )
  }, [availableCreateStaff, createAdviserSelectValue, createOpen])

  const onCreateSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setSubmitting(true)
      setActionError(null)

      const title = createForm.title.trim()
      if (!title) {
        const message = "Thesis title is required."
        setActionError(message)
        toast.error(message)
        setSubmitting(false)
        return
      }

      const termBuilt = buildTermFromForm(createForm)
      if (termBuilt.error) {
        setActionError(termBuilt.error)
        toast.error(termBuilt.error)
        setSubmitting(false)
        return
      }

      const selectedAdviserIdRaw = toNullableTrimmed(createForm.adviserUserId)
      const selectedAdviserId =
        !selectedAdviserIdRaw || selectedAdviserIdRaw === ADVISER_NONE_VALUE
          ? null
          : selectedAdviserIdRaw

      if (!selectedAdviserId) {
        const message = "Please select a staff adviser. If none is available, create a Staff user first."
        setActionError(message)
        toast.error(message)
        setSubmitting(false)
        return
      }

      const selectedStaff = staffById.get(selectedAdviserId)
      if (!selectedStaff) {
        const message = "Selected staff adviser no longer exists."
        setActionError(message)
        toast.error(message)
        setSubmitting(false)
        return
      }

      if (isDisabledStaff(selectedStaff)) {
        const message = "Selected staff adviser is disabled. Please choose another."
        setActionError(message)
        toast.error(message)
        setSubmitting(false)
        return
      }

      if (takenAdviserIds.has(selectedAdviserId)) {
        const message = "Selected staff adviser is already assigned to another thesis group."
        setActionError(message)
        toast.error(message)
        setSubmitting(false)
        return
      }

      const payload = buildThesisGroupMutationPayload({
        title,
        program: createForm.program,
        term: termBuilt.term,
        adviserId: selectedAdviserId,
      })

      const loadingToastId = toast.loading("Creating thesis group...")

      try {
        const createResult = await requestFirstAvailableWithPayloadFallback(writeBases, "POST", payload)

        setCreateOpen(false)
        resetCreateForm()
        setRefreshKey((v) => v + 1)

        if (createResult.usedFallback) {
          toast.success("Thesis group created successfully.", {
            id: loadingToastId,
            description: "Saved using compatibility adviser key mapping.",
          })
        } else {
          toast.success("Thesis group created successfully.", { id: loadingToastId })
        }
      } catch (e) {
        const message = normalizeActionError(e, "Failed to create thesis group.")
        setActionError(message)
        toast.error(message, { id: loadingToastId })
      } finally {
        setSubmitting(false)
      }
    },
    [createForm, resetCreateForm, staffById, takenAdviserIds, writeBases]
  )

  const onEditSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!editTarget) return

      setSubmitting(true)
      setActionError(null)

      const title = editForm.title.trim()
      if (!title) {
        const message = "Thesis title is required."
        setActionError(message)
        toast.error(message)
        setSubmitting(false)
        return
      }

      const termBuilt = buildTermFromForm(editForm)
      if (termBuilt.error) {
        setActionError(termBuilt.error)
        toast.error(termBuilt.error)
        setSubmitting(false)
        return
      }

      const selectedAdviserIdRaw = toNullableTrimmed(editForm.adviserUserId)
      const selectedAdviserId =
        !selectedAdviserIdRaw || selectedAdviserIdRaw === ADVISER_NONE_VALUE
          ? null
          : selectedAdviserIdRaw

      if (!selectedAdviserId) {
        const message = "Please select a staff adviser. If none is available, create a Staff user first."
        setActionError(message)
        toast.error(message)
        setSubmitting(false)
        return
      }

      const selectedStaff = staffById.get(selectedAdviserId)
      if (!selectedStaff) {
        const message = "Selected staff adviser no longer exists."
        setActionError(message)
        toast.error(message)
        setSubmitting(false)
        return
      }

      if (takenAdviserIdsForEdit.has(selectedAdviserId)) {
        const message = "Selected staff adviser is already assigned to another thesis group."
        setActionError(message)
        toast.error(message)
        setSubmitting(false)
        return
      }

      if (isDisabledStaff(selectedStaff) && selectedAdviserId !== editTarget.adviserId) {
        const message = "Selected staff adviser is disabled. Please choose another."
        setActionError(message)
        toast.error(message)
        setSubmitting(false)
        return
      }

      const payload = buildThesisGroupMutationPayload({
        title,
        program: editForm.program,
        term: termBuilt.term,
        adviserId: selectedAdviserId,
      })

      const loadingToastId = toast.loading("Saving changes...")

      try {
        const endpoints = writeBases.map((base) => `${base}/${editTarget.id}`)
        const updateResult = await requestFirstAvailableWithPayloadFallback(endpoints, "PATCH", payload)

        const updated = normalizeGroup(unwrapItem(updateResult.result.payload))
        if (updated) {
          setGroups((prev) => sortNewest(prev.map((item) => (item.id === updated.id ? updated : item))))
        } else {
          setRefreshKey((v) => v + 1)
        }

        setEditOpen(false)
        setEditTarget(null)

        if (updateResult.usedFallback) {
          toast.success("Thesis group updated successfully.", {
            id: loadingToastId,
            description: "Updated using compatibility adviser key mapping.",
          })
        } else {
          toast.success("Thesis group updated successfully.", { id: loadingToastId })
        }
      } catch (e) {
        const message = normalizeActionError(e, "Failed to update thesis group.")
        setActionError(message)
        toast.error(message, { id: loadingToastId })
      } finally {
        setSubmitting(false)
      }
    },
    [editForm, editTarget, staffById, takenAdviserIdsForEdit, writeBases]
  )

  const onDeleteConfirm = React.useCallback(async () => {
    if (!deleteTarget) return

    setSubmitting(true)
    setActionError(null)

    const loadingToastId = toast.loading("Deleting thesis group...")

    try {
      const endpoints = writeBases.map((base) => `${base}/${deleteTarget.id}`)
      await requestFirstAvailable(endpoints, { method: "DELETE" })

      setGroups((prev) => prev.filter((item) => item.id !== deleteTarget.id))
      setDeleteOpen(false)
      setDeleteTarget(null)
      toast.success("Thesis group deleted successfully.", { id: loadingToastId })
    } catch (e) {
      const message = normalizeActionError(e, "Failed to delete thesis group.")
      setActionError(message)
      toast.error(message, { id: loadingToastId })
    } finally {
      setSubmitting(false)
    }
  }, [deleteTarget, writeBases])

  const columns = React.useMemo<ColumnDef<ThesisGroupListItem>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Thesis Title",
        cell: ({ row }) => (
          <Button asChild variant="ghost" className="h-auto justify-start px-0 py-0 text-left font-medium">
            <Link href={`/dashboard/admin/thesis-groups/${row.original.id}`}>{row.original.title}</Link>
          </Button>
        ),
      },
      {
        accessorKey: "program",
        header: "Program",
        cell: ({ row }) => row.original.program ?? "—",
      },
      {
        id: "adviser",
        header: "Adviser",
        cell: ({ row }) => {
          const adviserId = row.original.adviserId

          if (!adviserId && row.original.manualAdviserInfo) {
            return (
              <div className="leading-tight">
                <Badge variant="outline" className="mb-1">
                  Legacy Manual Adviser
                </Badge>
                <div className="text-sm">{row.original.manualAdviserInfo}</div>
              </div>
            )
          }

          if (!adviserId) return "—"

          const staff = staffById.get(adviserId)
          if (!staff) {
            return (
              <div className="space-y-1">
                <Badge variant="outline">Assigned staff user</Badge>
                {row.original.manualAdviserInfo ? (
                  <div className="text-xs text-muted-foreground">{row.original.manualAdviserInfo}</div>
                ) : null}
              </div>
            )
          }

          return (
            <div className="leading-tight">
              <div>{staff.name}</div>
              {staff.email ? <div className="text-xs text-muted-foreground">{staff.email}</div> : null}
            </div>
          )
        },
      },
      {
        accessorKey: "term",
        header: "Term",
        cell: ({ row }) => (row.original.term ? <Badge variant="secondary">{row.original.term}</Badge> : "—"),
      },
      {
        accessorKey: "membersCount",
        header: "Members",
        cell: ({ row }) => (row.original.membersCount === null ? "—" : String(row.original.membersCount)),
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) => formatDateTime(row.original.updatedAt),
      },
      {
        id: "actions",
        header: "Actions",
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/admin/thesis-groups/${row.original.id}`}>Open</Link>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => openEditDialog(row.original)}>Edit</DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => openDeleteDialog(row.original)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [openDeleteDialog, openEditDialog, staffById]
  )

  const selectedEditAdviserMissing =
    !!editAdviserRawValue &&
    editAdviserRawValue !== ADVISER_NONE_VALUE &&
    !staffById.has(editAdviserRawValue)

  return (
    <DashboardLayout
      title="Thesis Groups"
      description="Create, view, update, and delete thesis groups with staff adviser assignment."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              resetCreateForm()
              setCreateOpen(true)
            }}
          >
            <Plus className="mr-2 size-4" />
            Add Thesis Group
          </Button>

          <Button onClick={() => setRefreshKey((v) => v + 1)} disabled={loading || staffLoading} variant="outline">
            {loading || staffLoading ? "Refreshing..." : "Refresh"}
          </Button>

          {!staffLoading && availableCreateStaff.length === 0 ? (
            <Button variant="secondary" onClick={openCreateStaffDialog}>
              <Plus className="mr-2 size-4" />
              Create Staff User
            </Button>
          ) : null}

          <Badge variant="outline">
            {staffLoading ? "Loading advisers..." : `Staff advisers: ${staffUsers.length}`}
          </Badge>

          <Badge variant="outline">Available for new group: {availableCreateStaff.length}</Badge>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {staffError ? (
          <Alert>
            <AlertDescription>{staffError}</AlertDescription>
          </Alert>
        ) : null}

        <DataTable
          columns={columns}
          data={groups}
          filterColumnId="title"
          filterPlaceholder="Search thesis title..."
        />
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!submitting) setCreateOpen(open)
          if (!open) {
            resetCreateForm()
            setActionError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[82vh] p-0">
          <ScrollArea className="max-h-[82vh]">
            <div className="p-6">
              <DialogHeader>
                <DialogTitle>Create Thesis Group</DialogTitle>
                <DialogDescription>
                  Assign an adviser from Staff users and save thesis details.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={onCreateSubmit} className="mt-4 space-y-4">
                {actionError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="create-title">Thesis Title</Label>
                  <Input
                    id="create-title"
                    value={createForm.title}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Enter thesis title"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="create-program">Program</Label>
                  <Input
                    id="create-program"
                    value={createForm.program}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, program: event.target.value }))}
                    placeholder="e.g., BSIT"
                    autoComplete="off"
                  />
                </div>

                <div className="rounded-lg border p-3 space-y-3">
                  <div className="space-y-2">
                    <Label>Semester</Label>
                    <Select
                      value={createForm.semester}
                      onValueChange={(value) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          semester: value,
                          customSemester: value === SEMESTER_OTHER_VALUE ? prev.customSemester : "",
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select semester" />
                      </SelectTrigger>
                      <SelectContent>
                        {STANDARD_SEMESTERS.map((semester) => (
                          <SelectItem key={`create-sem-${semester}`} value={semester}>
                            {semester}
                          </SelectItem>
                        ))}
                        <SelectItem value={SEMESTER_OTHER_VALUE}>Others (please specify)</SelectItem>
                        <SelectItem value={SEMESTER_NONE_VALUE}>No term</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {createForm.semester === SEMESTER_OTHER_VALUE ? (
                    <div className="space-y-2">
                      <Label htmlFor="create-custom-semester">Specify Semester</Label>
                      <Input
                        id="create-custom-semester"
                        value={createForm.customSemester}
                        onChange={(event) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            customSemester: event.target.value,
                          }))
                        }
                        placeholder="e.g., Midyear"
                        autoComplete="off"
                      />
                    </div>
                  ) : null}

                  {createForm.semester !== SEMESTER_NONE_VALUE ? (
                    <div className="space-y-2">
                      <Label htmlFor="create-school-year-start">School Year (Start)</Label>
                      <Input
                        id="create-school-year-start"
                        value={createForm.schoolYearStart}
                        onChange={(event) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            schoolYearStart: event.target.value,
                          }))
                        }
                        placeholder="e.g., 2026"
                        inputMode="numeric"
                        autoComplete="off"
                      />
                      <p className="text-xs text-muted-foreground">Example: 2026 will be saved as AY 2026-2027.</p>
                    </div>
                  ) : null}

                  <div className="text-xs text-muted-foreground">
                    Preview: <span className="font-medium">{createTermPreview}</span>
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-3">
                  <div className="space-y-2">
                    <Label>Adviser (Staff User)</Label>
                    <Select
                      value={createAdviserSelectValue}
                      onValueChange={(value) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          adviserUserId: sanitizeSelectValue(value, ADVISER_NONE_VALUE),
                        }))
                      }
                      disabled={staffLoading}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={staffLoading ? "Loading staff users..." : "Select adviser"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ADVISER_NONE_VALUE} disabled>
                          No staff adviser selected
                        </SelectItem>

                        {staffUsers.map((staff) => {
                          const taken = takenAdviserIds.has(staff.id)
                          const disabledAccount = isDisabledStaff(staff)
                          const disabled = taken || disabledAccount
                          const suffix = taken ? " • Already assigned" : disabledAccount ? " • Disabled" : ""
                          const label = staff.email
                            ? `${staff.name} (${staff.email})${suffix}`
                            : `${staff.name}${suffix}`

                          return (
                            <SelectItem key={`create-adviser-${staff.id}`} value={staff.id} disabled={disabled}>
                              {label}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>

                    {staffLoading ? (
                      <p className="text-xs text-muted-foreground">Loading staff users…</p>
                    ) : availableCreateStaff.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Select from available Staff users. Assigned/disabled staff are not selectable.
                      </p>
                    ) : (
                      <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                        <p className="text-xs text-amber-700">
                          No available staff adviser right now. Create a Staff user to continue.
                        </p>
                        <Button type="button" size="sm" variant="secondary" onClick={openCreateStaffDialog}>
                          <Plus className="mr-2 size-4" />
                          Create Staff User
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Creating..." : "Create Group"}
                  </Button>
                </DialogFooter>
              </form>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          if (!submitting) setEditOpen(open)
          if (!open) {
            setEditTarget(null)
            setActionError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[74vh] p-0">
          <ScrollArea className="max-h-[74vh]">
            <div className="p-6">
              <DialogHeader>
                <DialogTitle>Edit Thesis Group</DialogTitle>
                <DialogDescription>
                  Update thesis details and assign an available staff adviser with conflict protection.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={onEditSubmit} className="mt-4 space-y-4">
                {actionError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="edit-title">Thesis Title</Label>
                  <Input
                    id="edit-title"
                    value={editForm.title}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Enter thesis title"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-program">Program</Label>
                  <Input
                    id="edit-program"
                    value={editForm.program}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, program: event.target.value }))}
                    placeholder="e.g., BSIT"
                    autoComplete="off"
                  />
                </div>

                <div className="rounded-lg border p-3 space-y-3">
                  <div className="space-y-2">
                    <Label>Semester</Label>
                    <Select
                      value={editForm.semester}
                      onValueChange={(value) =>
                        setEditForm((prev) => ({
                          ...prev,
                          semester: value,
                          customSemester: value === SEMESTER_OTHER_VALUE ? prev.customSemester : "",
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select semester" />
                      </SelectTrigger>
                      <SelectContent>
                        {STANDARD_SEMESTERS.map((semester) => (
                          <SelectItem key={`edit-sem-${semester}`} value={semester}>
                            {semester}
                          </SelectItem>
                        ))}
                        <SelectItem value={SEMESTER_OTHER_VALUE}>Others (please specify)</SelectItem>
                        <SelectItem value={SEMESTER_NONE_VALUE}>No term</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {editForm.semester === SEMESTER_OTHER_VALUE ? (
                    <div className="space-y-2">
                      <Label htmlFor="edit-custom-semester">Specify Semester</Label>
                      <Input
                        id="edit-custom-semester"
                        value={editForm.customSemester}
                        onChange={(event) =>
                          setEditForm((prev) => ({
                            ...prev,
                            customSemester: event.target.value,
                          }))
                        }
                        placeholder="e.g., Midyear"
                        autoComplete="off"
                      />
                    </div>
                  ) : null}

                  {editForm.semester !== SEMESTER_NONE_VALUE ? (
                    <div className="space-y-2">
                      <Label htmlFor="edit-school-year-start">School Year (Start)</Label>
                      <Input
                        id="edit-school-year-start"
                        value={editForm.schoolYearStart}
                        onChange={(event) =>
                          setEditForm((prev) => ({
                            ...prev,
                            schoolYearStart: event.target.value,
                          }))
                        }
                        placeholder="e.g., 2026"
                        inputMode="numeric"
                        autoComplete="off"
                      />
                      <p className="text-xs text-muted-foreground">Example: 2026 will be saved as AY 2026-2027.</p>
                    </div>
                  ) : null}

                  <div className="text-xs text-muted-foreground">
                    Preview: <span className="font-medium">{editTermPreview}</span>
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-3">
                  <div className="space-y-2">
                    <Label>Adviser (Staff User)</Label>
                    <Select
                      value={editAdviserSelectValue}
                      onValueChange={(value) =>
                        setEditForm((prev) => ({
                          ...prev,
                          adviserUserId: sanitizeSelectValue(value, ADVISER_NONE_VALUE),
                        }))
                      }
                      disabled={staffLoading}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={staffLoading ? "Loading staff users..." : "Select adviser"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ADVISER_NONE_VALUE} disabled>
                          No staff adviser selected
                        </SelectItem>

                        {selectedEditAdviserMissing && editAdviserRawValue ? (
                          <SelectItem value={editAdviserRawValue}>
                            Current assigned adviser (profile unavailable)
                          </SelectItem>
                        ) : null}

                        {staffUsers.map((staff) => {
                          const selected = editForm.adviserUserId === staff.id
                          const takenByOtherGroup = takenAdviserIdsForEdit.has(staff.id)
                          const disabledAccount = isDisabledStaff(staff)

                          const disabled = takenByOtherGroup || (disabledAccount && !selected)

                          const suffix = takenByOtherGroup
                            ? " • Already assigned"
                            : disabledAccount && !selected
                              ? " • Disabled"
                              : selected
                                ? " • Current"
                                : ""

                          const label = staff.email
                            ? `${staff.name} (${staff.email})${suffix}`
                            : `${staff.name}${suffix}`

                          return (
                            <SelectItem key={`edit-adviser-${staff.id}`} value={staff.id} disabled={disabled}>
                              {label}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>

                    {staffLoading ? (
                      <p className="text-xs text-muted-foreground">Loading staff users…</p>
                    ) : availableEditStaff.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Assigned/disabled staff are disabled unless it is the current adviser.
                      </p>
                    ) : (
                      <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                        <p className="text-xs text-amber-700">
                          No alternative available staff adviser. Create a Staff user if you need to reassign.
                        </p>
                        <Button type="button" size="sm" variant="secondary" onClick={openCreateStaffDialog}>
                          <Plus className="mr-2 size-4" />
                          Create Staff User
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createStaffOpen}
        onOpenChange={(open) => {
          if (!creatingStaffUser) setCreateStaffOpen(open)
          if (!open) resetCreateStaffForm()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Staff User</DialogTitle>
            <DialogDescription>
              A login credential email will be sent automatically after user creation.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void handleCreateStaffUser()
            }}
          >
            {createStaffError ? (
              <Alert variant="destructive">
                <AlertDescription>{createStaffError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="create-staff-name">Name</Label>
              <Input
                id="create-staff-name"
                value={createStaffName}
                onChange={(e) => setCreateStaffName(e.target.value)}
                placeholder="e.g., Prof. Maria Santos"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-staff-email">Email</Label>
              <Input
                id="create-staff-email"
                type="email"
                value={createStaffEmail}
                onChange={(e) => setCreateStaffEmail(e.target.value)}
                placeholder="e.g., maria.santos@example.edu"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={createStaffStatus} onValueChange={(value) => setCreateStaffStatus(value as UserStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {CREATE_USER_STATUSES.map((status) => (
                    <SelectItem key={`staff-status-${status}`} value={status}>
                      {status === "active" ? "Active" : "Disabled"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateStaffOpen(false)} disabled={creatingStaffUser}>
                Cancel
              </Button>
              <Button type="submit" disabled={creatingStaffUser}>
                {creatingStaffUser ? "Creating..." : "Create Staff User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!submitting) setDeleteOpen(open)
          if (!open) {
            setDeleteTarget(null)
            setActionError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete thesis group?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.{" "}
              {deleteTarget ? (
                <>
                  You are deleting <span className="font-medium">{deleteTarget.title}</span>.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {actionError ? (
            <Alert variant="destructive">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(event) => {
                event.preventDefault()
                void onDeleteConfirm()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  )
}
