"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import DataTable from "@/components/data-table"
import { createThesisGroupColumns } from "@/components/thesis-groups/thesis-group-columns"
import {
  fetchAllSuccessfulJson,
  fetchFirstAvailableJson,
  fetchMembersCountForGroup,
  requestFirstAvailable,
  requestFirstAvailableWithPayloadFallback,
} from "@/components/thesis-groups/thesis-group-api"
import {
  CreateStaffUserDialog,
  CreateThesisGroupDialog,
  DeleteThesisGroupDialog,
  EditThesisGroupDialog,
} from "@/components/thesis-groups/thesis-group-dialogs"
import {
  ADVISER_NONE_VALUE,
  LIST_ENDPOINTS,
  STAFF_LIST_ENDPOINTS,
  WRITE_BASE_ENDPOINTS,
  asRecord,
  buildTermFromForm,
  buildTermPreview,
  buildThesisGroupMutationPayload,
  dedupeStaffUsers,
  defaultCreateFormState,
  defaultEditFormState,
  extractErrorMessage,
  isDisabledStaff,
  isValidEmail,
  normalizeActionError,
  normalizeGroup,
  normalizeStaffUser,
  parseResponseBodySafe,
  parseTermToFormFields,
  sanitizeSelectValue,
  sortNewest,
  sortStaff,
  toNullableTrimmed,
  unwrapItem,
  unwrapItems,
  type StaffUserItem,
  type ThesisGroupFormState,
  type ThesisGroupListItem,
  type UserStatus,
} from "@/components/thesis-groups/thesis-group-utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export default function AdminThesisGroupsPage() {
  const [groups, setGroups] = React.useState<ThesisGroupListItem[]>([])
  const [staffUsers, setStaffUsers] = React.useState<StaffUserItem[]>([])

  const [loading, setLoading] = React.useState<boolean>(true)
  const [staffLoading, setStaffLoading] = React.useState<boolean>(true)
  const [membersCountSyncing, setMembersCountSyncing] = React.useState<boolean>(false)
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
    () => staffUsers.filter((staff) => !takenAdviserIdsForEdit.has(staff.id) && !isDisabledStaff(staff)),
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

  const hydrateMembersCount = React.useCallback(
    async (items: ThesisGroupListItem[], preferredBaseEndpoint: string | null, signal: AbortSignal) => {
      if (items.length === 0) {
        setMembersCountSyncing(false)
        return
      }

      setMembersCountSyncing(true)

      try {
        const pairs = await Promise.all(
          items.map(async (item) => {
            const count = await fetchMembersCountForGroup(item.id, preferredBaseEndpoint, signal)
            return [item.id, count] as const
          })
        )

        if (signal.aborted) return

        const resolvedCountByGroupId = new Map<string, number>()
        for (const [groupId, count] of pairs) {
          if (count === null) continue
          resolvedCountByGroupId.set(groupId, count)
        }

        if (resolvedCountByGroupId.size === 0) return

        setGroups((prev) =>
          sortNewest(
            prev.map((group) => {
              const nextCount = resolvedCountByGroupId.get(group.id)
              if (nextCount === undefined || group.membersCount === nextCount) return group
              return { ...group, membersCount: nextCount }
            })
          )
        )
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return
        toast.error("Could not sync member counts. Showing available values only.")
      } finally {
        if (!signal.aborted) setMembersCountSyncing(false)
      }
    },
    []
  )

  const loadGroups = React.useCallback(
    async (signal: AbortSignal) => {
      setLoading(true)
      setError(null)
      setMembersCountSyncing(false)

      try {
        const result = await fetchFirstAvailableJson(LIST_ENDPOINTS, signal)

        if (!result) {
          setGroups([])
          setActiveBaseEndpoint(null)
          setMembersCountSyncing(false)
          setError(
            "No compatible thesis-group API endpoint found. Wire one of: /api/thesis-groups or /api/admin/thesis-groups."
          )
          return
        }

        setActiveBaseEndpoint(result.endpoint)

        const normalized = unwrapItems(result.payload)
          .map(normalizeGroup)
          .filter((item): item is ThesisGroupListItem => item !== null)

        const sorted = sortNewest(normalized)
        setGroups(sorted)

        void hydrateMembersCount(sorted, result.endpoint, signal)
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return
        const message = e instanceof Error ? e.message : "Failed to load thesis groups."
        setGroups([])
        setActiveBaseEndpoint(null)
        setMembersCountSyncing(false)
        setError(message)
        toast.error(message)
      } finally {
        setLoading(false)
      }
    },
    [hydrateMembersCount]
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
        typeof body?.message === "string" && body.message.trim()
          ? body.message
          : "Staff user created successfully. Login details were sent to email."

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

  const columns = React.useMemo(
    () =>
      createThesisGroupColumns({
        membersCountSyncing,
        staffById,
        onEditDialog: openEditDialog,
        onDeleteDialog: openDeleteDialog,
      }),
    [membersCountSyncing, openDeleteDialog, openEditDialog, staffById]
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

          <Button
            onClick={() => setRefreshKey((v) => v + 1)}
            disabled={loading || staffLoading || membersCountSyncing}
            variant="outline"
          >
            {loading || staffLoading || membersCountSyncing ? "Refreshing..." : "Refresh"}
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
          <Badge variant="outline">
            {membersCountSyncing ? "Syncing member counts..." : "Member counts ready"}
          </Badge>
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

      <CreateThesisGroupDialog
        open={createOpen}
        setOpen={setCreateOpen}
        submitting={submitting}
        actionError={actionError}
        setActionError={setActionError}
        createForm={createForm}
        setCreateForm={setCreateForm}
        createTermPreview={createTermPreview}
        createAdviserSelectValue={createAdviserSelectValue}
        staffLoading={staffLoading}
        staffUsers={staffUsers}
        takenAdviserIds={takenAdviserIds}
        availableCreateStaff={availableCreateStaff}
        onSubmit={onCreateSubmit}
        openCreateStaffDialog={openCreateStaffDialog}
        resetCreateForm={resetCreateForm}
      />

      <EditThesisGroupDialog
        open={editOpen}
        setOpen={setEditOpen}
        submitting={submitting}
        actionError={actionError}
        setActionError={setActionError}
        editForm={editForm}
        setEditForm={setEditForm}
        editTermPreview={editTermPreview}
        editAdviserSelectValue={editAdviserSelectValue}
        editAdviserRawValue={editAdviserRawValue}
        selectedEditAdviserMissing={selectedEditAdviserMissing}
        staffLoading={staffLoading}
        staffUsers={staffUsers}
        availableEditStaff={availableEditStaff}
        takenAdviserIdsForEdit={takenAdviserIdsForEdit}
        editTarget={editTarget}
        setEditTarget={setEditTarget}
        onSubmit={onEditSubmit}
        openCreateStaffDialog={openCreateStaffDialog}
      />

      <CreateStaffUserDialog
        open={createStaffOpen}
        setOpen={setCreateStaffOpen}
        creatingStaffUser={creatingStaffUser}
        createStaffError={createStaffError}
        createStaffName={createStaffName}
        setCreateStaffName={setCreateStaffName}
        createStaffEmail={createStaffEmail}
        setCreateStaffEmail={setCreateStaffEmail}
        createStaffStatus={createStaffStatus}
        setCreateStaffStatus={setCreateStaffStatus}
        onSubmit={handleCreateStaffUser}
        resetCreateStaffForm={resetCreateStaffForm}
      />

      <DeleteThesisGroupDialog
        open={deleteOpen}
        setOpen={setDeleteOpen}
        submitting={submitting}
        actionError={actionError}
        setActionError={setActionError}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        onConfirm={onDeleteConfirm}
      />
    </DashboardLayout>
  )
}
