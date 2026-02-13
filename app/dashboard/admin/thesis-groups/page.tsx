"use client"

import * as React from "react"
import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal, Plus } from "lucide-react"

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
  membersCount: number | null
  createdAt: string | null
  updatedAt: string | null
}

type ThesisGroupFormState = {
  title: string
  program: string
  adviserId: string
  semester: string
  customSemester: string
  schoolYearStart: string
}

type FetchResult = {
  endpoint: string
  payload: unknown | null
  status: number
}

const LIST_ENDPOINTS = [
  "/api/thesis-groups",
  "/api/admin/thesis-groups",
  "/api/thesis/groups",
  "/api/admin/thesis/groups",
] as const

const WRITE_BASE_ENDPOINTS = [...LIST_ENDPOINTS]

const STANDARD_SEMESTERS = ["1st Semester", "2nd Semester", "Summer"] as const
const SEMESTER_NONE_VALUE = "__none__"
const SEMESTER_OTHER_VALUE = "__other__"

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

function normalizeGroup(raw: unknown): ThesisGroupListItem | null {
  const rec = asRecord(raw)
  if (!rec) return null

  const id = toStringOrNull(rec.id ?? rec.group_id)
  if (!id) return null

  const title = toStringOrNull(rec.title ?? rec.group_title) ?? `Group ${id.slice(0, 8)}`
  const program = toStringOrNull(rec.program)
  const term = toStringOrNull(rec.term)
  const adviserId = toStringOrNull(rec.adviser_id ?? rec.adviserId)

  const membersCount = toNumberOrNull(
    rec.members_count ?? rec.member_count ?? rec.membersCount
  )

  const createdAt = toStringOrNull(rec.created_at ?? rec.createdAt)
  const updatedAt = toStringOrNull(rec.updated_at ?? rec.updatedAt)

  return {
    id,
    title,
    program,
    term,
    adviserId,
    membersCount,
    createdAt,
    updatedAt,
  }
}

function sortNewest(items: ThesisGroupListItem[]): ThesisGroupListItem[] {
  return [...items].sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return tb - ta
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
    adviserId: "",
    semester: "1st Semester",
    customSemester: "",
    schoolYearStart: currentYearText(),
  }
}

function defaultEditFormState(): ThesisGroupFormState {
  return {
    title: "",
    program: "",
    adviserId: "",
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

      if (!res.ok) {
        const payload = await parseResponseBodySafe(res)
        const message = extractErrorMessage(payload, `${endpoint} returned ${res.status}`)
        lastError = new Error(message)
        continue
      }

      const payload = await parseResponseBodySafe(res)
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
        const message = extractErrorMessage(payload, `${endpoint} returned ${res.status}`)
        lastError = new Error(message)
        continue
      }

      return { endpoint, payload, status: res.status }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Request failed")
    }
  }

  if (lastError) throw lastError
  throw new Error("No compatible thesis-group API endpoint found for this action.")
}

export default function AdminThesisGroupsPage() {
  const [groups, setGroups] = React.useState<ThesisGroupListItem[]>([])
  const [loading, setLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState<number>(0)
  const [activeBaseEndpoint, setActiveBaseEndpoint] = React.useState<string | null>(null)

  const [createOpen, setCreateOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const [createForm, setCreateForm] = React.useState<ThesisGroupFormState>(defaultCreateFormState())

  const [editTarget, setEditTarget] = React.useState<ThesisGroupListItem | null>(null)
  const [editForm, setEditForm] = React.useState<ThesisGroupFormState>(defaultEditFormState())

  const [deleteTarget, setDeleteTarget] = React.useState<ThesisGroupListItem | null>(null)

  const writeBases = React.useMemo(() => {
    if (!activeBaseEndpoint) return WRITE_BASE_ENDPOINTS
    return [
      activeBaseEndpoint,
      ...WRITE_BASE_ENDPOINTS.filter((endpoint) => endpoint !== activeBaseEndpoint),
    ]
  }, [activeBaseEndpoint])

  const createTermPreview = React.useMemo(() => buildTermPreview(createForm), [createForm])
  const editTermPreview = React.useMemo(() => buildTermPreview(editForm), [editForm])

  const resetCreateForm = React.useCallback(() => {
    setCreateForm(defaultCreateFormState())
    setFormError(null)
  }, [])

  const openEditDialog = React.useCallback((item: ThesisGroupListItem) => {
    const parsed = parseTermToFormFields(item.term)
    setEditTarget(item)
    setEditForm({
      title: item.title,
      program: item.program ?? "",
      adviserId: item.adviserId ?? "",
      semester: parsed.semester,
      customSemester: parsed.customSemester,
      schoolYearStart: parsed.schoolYearStart,
    })
    setFormError(null)
    setEditOpen(true)
  }, [])

  const openDeleteDialog = React.useCallback((item: ThesisGroupListItem) => {
    setDeleteTarget(item)
    setFormError(null)
    setDeleteOpen(true)
  }, [])

  const load = React.useCallback(
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
        setGroups([])
        setActiveBaseEndpoint(null)
        setError(e instanceof Error ? e.message : "Failed to load thesis groups.")
      } finally {
        setLoading(false)
      }
    },
    []
  )

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load, refreshKey])

  const onCreateSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setSubmitting(true)
      setFormError(null)

      const title = createForm.title.trim()
      if (!title) {
        setFormError("Thesis title is required.")
        setSubmitting(false)
        return
      }

      const termBuilt = buildTermFromForm(createForm)
      if (termBuilt.error) {
        setFormError(termBuilt.error)
        setSubmitting(false)
        return
      }

      try {
        await requestFirstAvailable(writeBases, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            program: toNullableTrimmed(createForm.program),
            term: termBuilt.term,
            adviser_id: toNullableTrimmed(createForm.adviserId),
          }),
        })

        setCreateOpen(false)
        resetCreateForm()
        setRefreshKey((v) => v + 1)
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "Failed to create thesis group.")
      } finally {
        setSubmitting(false)
      }
    },
    [createForm, resetCreateForm, writeBases]
  )

  const onEditSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!editTarget) return

      setSubmitting(true)
      setFormError(null)

      const title = editForm.title.trim()
      if (!title) {
        setFormError("Thesis title is required.")
        setSubmitting(false)
        return
      }

      const termBuilt = buildTermFromForm(editForm)
      if (termBuilt.error) {
        setFormError(termBuilt.error)
        setSubmitting(false)
        return
      }

      try {
        const endpoints = writeBases.map((base) => `${base}/${editTarget.id}`)
        const result = await requestFirstAvailable(endpoints, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            program: toNullableTrimmed(editForm.program),
            term: termBuilt.term,
            adviser_id: toNullableTrimmed(editForm.adviserId),
          }),
        })

        const updated = normalizeGroup(unwrapItem(result.payload))
        if (updated) {
          setGroups((prev) =>
            sortNewest(prev.map((item) => (item.id === updated.id ? updated : item)))
          )
        } else {
          setRefreshKey((v) => v + 1)
        }

        setEditOpen(false)
        setEditTarget(null)
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "Failed to update thesis group.")
      } finally {
        setSubmitting(false)
      }
    },
    [editForm, editTarget, writeBases]
  )

  const onDeleteConfirm = React.useCallback(async () => {
    if (!deleteTarget) return

    setSubmitting(true)
    setFormError(null)

    try {
      const endpoints = writeBases.map((base) => `${base}/${deleteTarget.id}`)
      await requestFirstAvailable(endpoints, { method: "DELETE" })

      setGroups((prev) => prev.filter((item) => item.id !== deleteTarget.id))
      setDeleteOpen(false)
      setDeleteTarget(null)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to delete thesis group.")
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
          <Button
            asChild
            variant="ghost"
            className="h-auto justify-start px-0 py-0 text-left font-medium"
          >
            <Link href={`/dashboard/admin/thesis-groups/${row.original.id}`}>
              {row.original.title}
            </Link>
          </Button>
        ),
      },
      {
        accessorKey: "program",
        header: "Program",
        cell: ({ row }) => row.original.program ?? "—",
      },
      {
        accessorKey: "term",
        header: "Term",
        cell: ({ row }) =>
          row.original.term ? <Badge variant="secondary">{row.original.term}</Badge> : "—",
      },
      {
        accessorKey: "membersCount",
        header: "Members",
        cell: ({ row }) =>
          row.original.membersCount === null ? "—" : String(row.original.membersCount),
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

              <DropdownMenuItem onClick={() => openEditDialog(row.original)}>
                Edit
              </DropdownMenuItem>

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
    [openDeleteDialog, openEditDialog]
  )

  return (
    <DashboardLayout
      title="Thesis Groups"
      description="Create, view, update, and delete thesis groups including thesis title and term."
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

          <Button onClick={() => setRefreshKey((v) => v + 1)} disabled={loading} variant="outline">
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
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
          if (!open) resetCreateForm()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Thesis Group</DialogTitle>
            <DialogDescription>
              Add a new thesis group, choose the semester from dropdown, then customize only the year.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onCreateSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-title">Thesis Title</Label>
              <Input
                id="create-title"
                value={createForm.title}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, title: event.target.value }))
                }
                placeholder="Enter thesis title"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-program">Program</Label>
              <Input
                id="create-program"
                value={createForm.program}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, program: event.target.value }))
                }
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
                      customSemester:
                        value === SEMESTER_OTHER_VALUE ? prev.customSemester : "",
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
                  <p className="text-xs text-muted-foreground">
                    Example: 2026 will be saved as AY 2026-2027.
                  </p>
                </div>
              ) : null}

              <div className="text-xs text-muted-foreground">
                Preview: <span className="font-medium">{createTermPreview}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-adviser">Adviser ID</Label>
              <Input
                id="create-adviser"
                value={createForm.adviserId}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, adviserId: event.target.value }))
                }
                placeholder="UUID (optional)"
                autoComplete="off"
              />
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
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          if (!submitting) setEditOpen(open)
          if (!open) setEditTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Thesis Group</DialogTitle>
            <DialogDescription>
              Update thesis title, semester dropdown, and customize school year.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Thesis Title</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, title: event.target.value }))
                }
                placeholder="Enter thesis title"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-program">Program</Label>
              <Input
                id="edit-program"
                value={editForm.program}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, program: event.target.value }))
                }
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
                  <p className="text-xs text-muted-foreground">
                    Example: 2026 will be saved as AY 2026-2027.
                  </p>
                </div>
              ) : null}

              <div className="text-xs text-muted-foreground">
                Preview: <span className="font-medium">{editTermPreview}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-adviser">Adviser ID</Label>
              <Input
                id="edit-adviser"
                value={editForm.adviserId}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, adviserId: event.target.value }))
                }
                placeholder="UUID (optional)"
                autoComplete="off"
              />
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
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!submitting) setDeleteOpen(open)
          if (!open) setDeleteTarget(null)
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
