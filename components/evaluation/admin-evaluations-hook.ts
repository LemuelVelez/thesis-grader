"use client"

import * as React from "react"
import { toast } from "sonner"

import {
    ASSIGNMENT_PRESET_META,
    ASSIGNMENT_STATUSES,
    CREATE_PRESETS,
    EDIT_PRESETS,
    EvaluationStatus,
    GROUP_ENDPOINTS,
    PANELIST_EVALUATIONS_ENDPOINT,
    STATUS_FILTERS,
    STUDENT_EVALUATIONS_ENDPOINT_CANDIDATES,
    appendAndSortEvaluations,
    compactString,
    extractApiMessage,
    extractItems,
    formatDateTime,
    getEvaluationFormDefault,
    isRecord,
    isSameRef,
    isSameRefRecord,
    isUserAssignable,
    isUuidLike,
    mapApiItemByKind,
    mapApiItemByRole,
    matchAny,
    normalizeStatus,
    parseJsonLoose,
    parseJsonSafely,
    removeEvaluation,
    replaceEvaluation,
    roleLabel,
    toAssignmentPreset,
    toPanelistApiRecord,
    toStudentApiRecord,
    toTitleCase,
    toUnifiedFromPanelist,
    toUnifiedFromStudent,
    uniqueById,
    uniqueEvaluations,
    type AssigneeRole,
    type AssignmentPreset,
    type DefenseScheduleOption,
    type DefenseSchedulesResponse,
    type EvaluationAction,
    type EvaluationFormState,
    type EvaluationKind,
    type EvaluationRecord,
    type EvaluationRef,
    type EvaluationResponse,
    type EvaluationsResponse,
    type FilterStatus,
    type FormMode,
    type GroupedEvaluationBucket,
    type ThesisGroupOption,
    type UserOption,
    type UsersResponse,
} from "./admin-evaluations-model"

export type AdminEvaluationsPageState = ReturnType<typeof useAdminEvaluationsPage>

export function useAdminEvaluationsPage() {
    const [evaluations, setEvaluations] = React.useState<EvaluationRecord[]>([])
    const [schedules, setSchedules] = React.useState<DefenseScheduleOption[]>([])
    const [groups, setGroups] = React.useState<ThesisGroupOption[]>([])
    const [evaluators, setEvaluators] = React.useState<UserOption[]>([])

    const [loadingTable, setLoadingTable] = React.useState(true)
    const [loadingMeta, setLoadingMeta] = React.useState(true)
    const [refreshing, setRefreshing] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<FilterStatus>("all")

    const [busyKey, setBusyKey] = React.useState<string | null>(null)

    const [formOpen, setFormOpen] = React.useState(false)
    const [formMode, setFormMode] = React.useState<FormMode>("create")
    const [formBusy, setFormBusy] = React.useState(false)
    const [editingRef, setEditingRef] = React.useState<EvaluationRef | null>(null)
    const [form, setForm] = React.useState<EvaluationFormState>(getEvaluationFormDefault())

    const [assignmentPreset, setAssignmentPreset] =
        React.useState<AssignmentPreset>("all-panelists")

    const [scheduleQuery, setScheduleQuery] = React.useState("")
    const [evaluatorQuery, setEvaluatorQuery] = React.useState("")

    const [pendingDeleteRef, setPendingDeleteRef] = React.useState<EvaluationRef | null>(null)

    const [viewOpen, setViewOpen] = React.useState(false)
    const [viewingRef, setViewingRef] = React.useState<EvaluationRef | null>(null)

    const [studentEvaluationsEndpoint, setStudentEvaluationsEndpoint] =
        React.useState<string | null>(null)

    const groupNameById = React.useMemo(() => {
        const map = new Map<string, string>()
        for (const group of groups) {
            map.set(group.id.toLowerCase(), group.title)
        }
        return map
    }, [groups])

    const scheduleById = React.useMemo(() => {
        const map = new Map<string, DefenseScheduleOption>()
        for (const schedule of schedules) {
            map.set(schedule.id.toLowerCase(), schedule)
        }
        return map
    }, [schedules])

    const evaluatorById = React.useMemo(() => {
        const map = new Map<string, UserOption>()
        for (const evaluator of evaluators) {
            map.set(evaluator.id.toLowerCase(), evaluator)
        }
        return map
    }, [evaluators])

    const assignmentKeysByScheduleRole = React.useMemo(() => {
        const map = new Map<string, Set<string>>()

        for (const row of evaluations) {
            const scheduleId = row.schedule_id.trim().toLowerCase()
            const evaluatorId = row.evaluator_id.trim().toLowerCase()

            if (!scheduleId || !evaluatorId) continue

            const composite = `${scheduleId}|${row.assignee_role}`

            if (!map.has(composite)) {
                map.set(composite, new Set<string>())
            }

            map.get(composite)!.add(evaluatorId)
        }

        return map
    }, [evaluations])

    const editingRecord = React.useMemo(() => {
        if (!editingRef) return null
        return evaluations.find((row) => isSameRefRecord(editingRef, row)) ?? null
    }, [editingRef, evaluations])

    const assignmentMeta = React.useMemo(
        () => ASSIGNMENT_PRESET_META[assignmentPreset],
        [assignmentPreset],
    )

    const availablePresets = React.useMemo<AssignmentPreset[]>(() => {
        if (formMode === "create") return CREATE_PRESETS
        if (!editingRecord) return EDIT_PRESETS
        return [
            editingRecord.assignee_role === "student"
                ? "particular-student"
                : "particular-panelist",
        ]
    }, [editingRecord, formMode])

    const resolveGroupNameFromSchedule = React.useCallback(
        (schedule: DefenseScheduleOption | null | undefined): string => {
            if (!schedule) return "Unknown Group"

            const inlineTitle = compactString(schedule.group_title)
            if (inlineTitle) return inlineTitle

            const mappedTitle = groupNameById.get(schedule.group_id.toLowerCase())
            if (mappedTitle) return mappedTitle

            return "Unassigned Group"
        },
        [groupNameById],
    )

    const resolveScheduleById = React.useCallback(
        (scheduleId: string): DefenseScheduleOption | null => {
            const id = scheduleId.trim().toLowerCase()
            if (!id) return null
            return scheduleById.get(id) ?? null
        },
        [scheduleById],
    )

    const resolveEvaluatorById = React.useCallback(
        (evaluatorId: string): UserOption | null => {
            const id = evaluatorId.trim().toLowerCase()
            if (!id) return null
            return evaluatorById.get(id) ?? null
        },
        [evaluatorById],
    )

    const discoverStudentEvaluationsEndpoint = React.useCallback(async (): Promise<string> => {
        let lastMessage = ""

        for (const endpoint of STUDENT_EVALUATIONS_ENDPOINT_CANDIDATES) {
            try {
                const res = await fetch(`${endpoint}?limit=1`, { cache: "no-store" })
                const payload = await parseJsonLoose(res)

                if (res.ok) {
                    return endpoint
                }

                if (res.status === 404 || res.status === 405) {
                    continue
                }

                lastMessage = extractApiMessage(payload) || `Request failed (${res.status})`
            } catch (err) {
                lastMessage = err instanceof Error ? err.message : "Network error."
            }
        }

        throw new Error(lastMessage || "Student evaluation endpoint is unavailable.")
    }, [])

    const resolveStudentEvaluationsEndpoint = React.useCallback(async (): Promise<string> => {
        if (studentEvaluationsEndpoint) return studentEvaluationsEndpoint
        const endpoint = await discoverStudentEvaluationsEndpoint()
        setStudentEvaluationsEndpoint(endpoint)
        return endpoint
    }, [discoverStudentEvaluationsEndpoint, studentEvaluationsEndpoint])

    const resolveEndpointByRole = React.useCallback(
        async (role: AssigneeRole): Promise<string> => {
            if (role === "panelist") return PANELIST_EVALUATIONS_ENDPOINT
            return resolveStudentEvaluationsEndpoint()
        },
        [resolveStudentEvaluationsEndpoint],
    )

    const resolveEndpointByKind = React.useCallback(
        async (kind: EvaluationKind): Promise<string> => {
            if (kind === "panelist") return PANELIST_EVALUATIONS_ENDPOINT
            return resolveStudentEvaluationsEndpoint()
        },
        [resolveStudentEvaluationsEndpoint],
    )

    const fetchStudentEvaluations = React.useCallback(async () => {
        let lastMessage = ""

        for (const endpoint of STUDENT_EVALUATIONS_ENDPOINT_CANDIDATES) {
            try {
                const res = await fetch(endpoint, { cache: "no-store" })
                const payload = await parseJsonLoose(res)

                if (!res.ok) {
                    if (res.status === 404 || res.status === 405) continue
                    lastMessage = extractApiMessage(payload) || `Request failed (${res.status})`
                    continue
                }

                const rows = extractItems(payload)
                    .map(toStudentApiRecord)
                    .filter((row): row is NonNullable<ReturnType<typeof toStudentApiRecord>> => !!row)

                return { endpoint, rows }
            } catch (err) {
                lastMessage = err instanceof Error ? err.message : "Network error."
            }
        }

        throw new Error(lastMessage || "Student evaluation endpoint is unavailable.")
    }, [])

    const loadEvaluations = React.useCallback(async () => {
        setLoadingTable(true)
        try {
            const panelistRes = await fetch(PANELIST_EVALUATIONS_ENDPOINT, { cache: "no-store" })
            const panelistData = await parseJsonSafely<EvaluationsResponse>(panelistRes)
            const panelistRows = extractItems(panelistData)
                .map(toPanelistApiRecord)
                .filter((row): row is NonNullable<ReturnType<typeof toPanelistApiRecord>> => !!row)
            const mappedPanelists = panelistRows.map(toUnifiedFromPanelist)

            let mappedStudents: EvaluationRecord[] = []
            let resolvedStudentEndpoint: string | null = studentEvaluationsEndpoint

            try {
                const studentBundle = await fetchStudentEvaluations()
                resolvedStudentEndpoint = studentBundle.endpoint
                mappedStudents = studentBundle.rows.map(toUnifiedFromStudent)
            } catch {
                resolvedStudentEndpoint = null
                mappedStudents = []
            }

            setStudentEvaluationsEndpoint(resolvedStudentEndpoint)

            const merged = uniqueEvaluations([...mappedPanelists, ...mappedStudents]).sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            )

            setEvaluations(merged)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to fetch evaluations."
            setError(message)
            setEvaluations([])
            throw err
        } finally {
            setLoadingTable(false)
        }
    }, [fetchStudentEvaluations, studentEvaluationsEndpoint])

    const loadMeta = React.useCallback(async () => {
        setLoadingMeta(true)
        try {
            const [scheduleRes, usersRes] = await Promise.all([
                fetch("/api/defense-schedules", { cache: "no-store" }),
                fetch("/api/users", { cache: "no-store" }),
            ])

            const scheduleData = await parseJsonSafely<DefenseSchedulesResponse>(scheduleRes)
            const usersData = await parseJsonSafely<UsersResponse>(usersRes)

            const safeSchedules = Array.isArray(scheduleData.items)
                ? scheduleData.items.filter(
                    (row): row is DefenseScheduleOption =>
                        !!row &&
                        typeof row.id === "string" &&
                        typeof row.group_id === "string" &&
                        typeof row.scheduled_at === "string",
                )
                : []

            const safeUsers = Array.isArray(usersData.items)
                ? usersData.items.filter(
                    (row): row is UserOption =>
                        !!row && typeof row.id === "string" && typeof row.role === "string",
                )
                : []

            const collectedGroups: ThesisGroupOption[] = []

            for (const endpoint of GROUP_ENDPOINTS) {
                try {
                    const res = await fetch(endpoint, { cache: "no-store" })
                    if (!res.ok) {
                        if (res.status === 404 || res.status === 401 || res.status === 403) continue
                        continue
                    }

                    const payload = await parseJsonLoose(res)
                    const rows = extractItems(payload)

                    const normalized = rows
                        .map((row) => {
                            if (!isRecord(row)) return null
                            const id = compactString(typeof row.id === "string" ? row.id : null)
                            if (!id) return null

                            const title =
                                compactString(typeof row.title === "string" ? row.title : null) ??
                                compactString(typeof row.name === "string" ? row.name : null) ??
                                id

                            return { id, title }
                        })
                        .filter((row): row is ThesisGroupOption => !!row)

                    collectedGroups.push(...normalized)
                } catch {
                    // proceed with other endpoint
                }
            }

            setSchedules(safeSchedules)
            setEvaluators(safeUsers)
            setGroups(uniqueById(collectedGroups))
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load assignment data."
            setError(message)
            throw err
        } finally {
            setLoadingMeta(false)
        }
    }, [])

    React.useEffect(() => {
        let active = true

            ; (async () => {
                setError(null)
                try {
                    await Promise.all([loadEvaluations(), loadMeta()])
                } catch (err) {
                    if (!active) return
                    const message =
                        err instanceof Error ? err.message : "Failed to initialize evaluations."
                    setError(message)
                    toast.error("Unable to load evaluations", { description: message })
                }
            })()

        return () => {
            active = false
        }
    }, [loadEvaluations, loadMeta])

    const refreshAll = React.useCallback(async () => {
        setRefreshing(true)
        setError(null)

        try {
            await Promise.all([loadEvaluations(), loadMeta()])
            toast.success("Evaluations refreshed")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to refresh."
            setError(message)
            toast.error("Refresh failed", { description: message })
        } finally {
            setRefreshing(false)
        }
    }, [loadEvaluations, loadMeta])

    const filtered = React.useMemo(() => {
        const q = search.trim().toLowerCase()

        return evaluations.filter((item) => {
            const normalized = normalizeStatus(item.status)
            if (statusFilter !== "all" && normalized !== statusFilter) return false
            if (!q) return true

            const schedule = scheduleById.get(item.schedule_id.toLowerCase()) ?? null
            const groupName = resolveGroupNameFromSchedule(schedule)
            const scheduleDate = schedule ? formatDateTime(schedule.scheduled_at) : "schedule unavailable"
            const scheduleRoom = compactString(schedule?.room) ?? ""

            const evaluator = evaluatorById.get(item.evaluator_id.toLowerCase()) ?? null
            const evaluatorName =
                compactString(evaluator?.name) ?? compactString(evaluator?.email) ?? "unknown assignee"
            const evaluatorRole = evaluator ? roleLabel(evaluator.role) : toTitleCase(item.assignee_role)
            const flow = item.assignee_role === "student" ? "student evaluation" : "panelist evaluation"

            return (
                matchAny(groupName, q) ||
                matchAny(scheduleDate, q) ||
                matchAny(scheduleRoom, q) ||
                matchAny(evaluatorName, q) ||
                matchAny(evaluatorRole, q) ||
                matchAny(flow, q) ||
                matchAny(normalized, q)
            )
        })
    }, [
        evaluations,
        evaluatorById,
        resolveGroupNameFromSchedule,
        scheduleById,
        search,
        statusFilter,
    ])

    const groupedFiltered = React.useMemo<GroupedEvaluationBucket[]>(() => {
        const map = new Map<string, GroupedEvaluationBucket>()

        for (const item of filtered) {
            const schedule = resolveScheduleById(item.schedule_id)
            const groupName = resolveGroupNameFromSchedule(schedule)
            const normalizedGroup = compactString(groupName)?.toLowerCase() ?? "unassigned-group"

            const existing = map.get(normalizedGroup) ?? {
                key: normalizedGroup,
                groupName,
                items: [],
                pending: 0,
                submitted: 0,
                locked: 0,
            }

            existing.items.push(item)

            const status = normalizeStatus(item.status)
            if (status === "pending") existing.pending += 1
            else if (status === "submitted") existing.submitted += 1
            else if (status === "locked") existing.locked += 1

            map.set(normalizedGroup, existing)
        }

        const buckets = Array.from(map.values()).map((bucket) => {
            const sortedItems = [...bucket.items].sort((a, b) => {
                const aSchedule = resolveScheduleById(a.schedule_id)
                const bSchedule = resolveScheduleById(b.schedule_id)

                const aTime = aSchedule ? new Date(aSchedule.scheduled_at).getTime() : new Date(a.created_at).getTime()
                const bTime = bSchedule ? new Date(bSchedule.scheduled_at).getTime() : new Date(b.created_at).getTime()

                return bTime - aTime
            })

            return {
                ...bucket,
                items: sortedItems,
            }
        })

        return buckets.sort((a, b) => a.groupName.localeCompare(b.groupName))
    }, [filtered, resolveGroupNameFromSchedule, resolveScheduleById])

    const stats = React.useMemo(() => {
        let pending = 0
        let submitted = 0
        let locked = 0

        for (const item of evaluations) {
            const status = normalizeStatus(item.status)
            if (status === "pending") pending += 1
            else if (status === "submitted") submitted += 1
            else if (status === "locked") locked += 1
        }

        return {
            total: evaluations.length,
            pending,
            submitted,
            locked,
        }
    }, [evaluations])

    const assignableUsers = React.useMemo(() => {
        return evaluators.filter((item) => {
            const roleMatches = normalizeStatus(String(item.role)) === assignmentMeta.role
            if (!roleMatches) return false
            return isUserAssignable(item.status)
        })
    }, [assignmentMeta.role, evaluators])

    const bulkAssignmentPreview = React.useMemo(() => {
        if (assignmentMeta.mode !== "all") {
            return { total: 0, valid: 0, invalid: 0, alreadyAssigned: 0, toCreate: 0 }
        }

        const scheduleKey = form.schedule_id.trim().toLowerCase()
        const composite = `${scheduleKey}|${assignmentMeta.role}`
        const existingAssignees = scheduleKey ? assignmentKeysByScheduleRole.get(composite) ?? new Set<string>() : new Set<string>()

        let valid = 0
        let invalid = 0
        let alreadyAssigned = 0
        let toCreate = 0

        for (const user of assignableUsers) {
            const id = user.id.trim()
            if (!isUuidLike(id)) {
                invalid += 1
                continue
            }

            valid += 1

            if (scheduleKey && existingAssignees.has(id.toLowerCase())) {
                alreadyAssigned += 1
            } else {
                toCreate += 1
            }
        }

        return {
            total: assignableUsers.length,
            valid,
            invalid,
            alreadyAssigned,
            toCreate,
        }
    }, [
        assignmentMeta.mode,
        assignmentMeta.role,
        assignableUsers,
        assignmentKeysByScheduleRole,
        form.schedule_id,
    ])

    const openCreateForm = React.useCallback(() => {
        setFormMode("create")
        setEditingRef(null)
        setForm(getEvaluationFormDefault())
        setAssignmentPreset("all-panelists")
        setScheduleQuery("")
        setEvaluatorQuery("")
        setFormOpen(true)
    }, [])

    const openEditForm = React.useCallback(
        (row: EvaluationRecord) => {
            setFormMode("edit")
            setEditingRef({ id: row.id, kind: row.kind })
            setForm({
                schedule_id: row.schedule_id,
                evaluator_id: row.evaluator_id,
                status: row.status,
            })

            setAssignmentPreset(toAssignmentPreset(row.assignee_role, "particular"))

            const selectedSchedule = resolveScheduleById(row.schedule_id)
            const selectedEvaluator = resolveEvaluatorById(row.evaluator_id)

            setScheduleQuery(selectedSchedule ? resolveGroupNameFromSchedule(selectedSchedule) : "")
            setEvaluatorQuery(
                compactString(selectedEvaluator?.name) ?? compactString(selectedEvaluator?.email) ?? "",
            )

            setFormOpen(true)
        },
        [resolveEvaluatorById, resolveGroupNameFromSchedule, resolveScheduleById],
    )

    const closeForm = React.useCallback(() => {
        setFormOpen(false)
        setFormBusy(false)
        setEditingRef(null)
        setForm(getEvaluationFormDefault())
        setAssignmentPreset("all-panelists")
        setScheduleQuery("")
        setEvaluatorQuery("")
    }, [])

    const openViewDialog = React.useCallback((row: EvaluationRecord) => {
        setViewingRef({ id: row.id, kind: row.kind })
        setViewOpen(true)
    }, [])

    const onFormFieldChange = React.useCallback(
        <K extends keyof EvaluationFormState>(key: K, value: EvaluationFormState[K]) => {
            setForm((prev) => ({ ...prev, [key]: value }))
        },
        [],
    )

    const submitForm = React.useCallback(async () => {
        if (formBusy) return

        const schedule_id = form.schedule_id.trim()
        const evaluator_id = form.evaluator_id.trim()
        const status = normalizeStatus(String(form.status)) as EvaluationStatus

        if (!schedule_id) {
            toast.error("Please select a schedule.")
            return
        }

        if (!isUuidLike(schedule_id)) {
            toast.error("Selected schedule is invalid.", {
                description: "Please pick a schedule from the quick-pick list.",
            })
            return
        }

        if (formMode === "edit" && assignmentMeta.mode === "all") {
            toast.error("Editing supports particular assignee only.")
            return
        }

        if (assignmentMeta.mode === "particular" && !evaluator_id) {
            toast.error(`Please select a ${assignmentMeta.roleSingular}.`)
            return
        }

        if (assignmentMeta.mode === "particular" && !isUuidLike(evaluator_id)) {
            toast.error(`Selected ${assignmentMeta.roleSingular} id is invalid.`, {
                description: "Please choose the assignee from the quick-pick list.",
            })
            return
        }

        const scheduleRoleKey = `${schedule_id.toLowerCase()}|${assignmentMeta.role}`
        const existingSetForSchedule = assignmentKeysByScheduleRole.get(scheduleRoleKey) ?? new Set<string>()

        if (formMode === "create" && assignmentMeta.mode === "particular") {
            if (existingSetForSchedule.has(evaluator_id.toLowerCase())) {
                toast.error("Duplicate assignment", {
                    description: "This assignee already has an evaluation for the selected schedule.",
                })
                return
            }
        }

        if (formMode === "edit" && editingRecord) {
            const targetRole = editingRecord.assignee_role
            const duplicate = evaluations.some((row) => {
                if (row.id === editingRecord.id && row.kind === editingRecord.kind) return false
                return (
                    row.assignee_role === targetRole &&
                    row.schedule_id.toLowerCase() === schedule_id.toLowerCase() &&
                    row.evaluator_id.toLowerCase() === evaluator_id.toLowerCase()
                )
            })

            if (duplicate) {
                toast.error("Duplicate assignment", {
                    description: "Another evaluation already exists with the same schedule and assignee.",
                })
                return
            }
        }

        setFormBusy(true)
        setError(null)

        try {
            if (formMode === "create" && assignmentMeta.mode === "all") {
                const targets = assignableUsers

                if (targets.length === 0) {
                    toast.error(`No active ${assignmentMeta.rolePlural} available for assignment.`)
                    return
                }

                const endpoint = await resolveEndpointByRole(assignmentMeta.role)
                const validTargets = targets.filter((user) => isUuidLike(user.id))
                const invalidCount = targets.length - validTargets.length

                const targetsToCreate = validTargets.filter(
                    (user) => !existingSetForSchedule.has(user.id.toLowerCase()),
                )
                const alreadyAssignedCount = validTargets.length - targetsToCreate.length

                if (targetsToCreate.length === 0) {
                    toast.info("No new assignments to create", {
                        description:
                            [
                                alreadyAssignedCount > 0 ? `${alreadyAssignedCount} already assigned` : null,
                                invalidCount > 0 ? `${invalidCount} invalid user id(s) skipped` : null,
                            ]
                                .filter((x): x is string => !!x)
                                .join(" • ") || "Everything is already up to date.",
                    })
                    return
                }

                const settled = await Promise.allSettled(
                    targetsToCreate.map(async (user) => {
                        const payload =
                            assignmentMeta.role === "panelist"
                                ? { schedule_id, evaluator_id: user.id, status: status || "pending" }
                                : { schedule_id, student_id: user.id, status: status || "pending" }

                        const res = await fetch(endpoint, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(payload),
                        })

                        const data = await parseJsonSafely<EvaluationResponse>(res)
                        const mapped = mapApiItemByRole(assignmentMeta.role, data.item)
                        return mapped
                    }),
                )

                const createdItems: EvaluationRecord[] = []
                const failures: string[] = []

                for (const result of settled) {
                    if (result.status === "fulfilled") {
                        if (result.value) createdItems.push(result.value)
                    } else {
                        const message =
                            result.reason instanceof Error ? result.reason.message : "Unknown assignment failure"
                        failures.push(message)
                    }
                }

                const successCount = settled.length - failures.length

                if (successCount > 0) {
                    if (createdItems.length === successCount && createdItems.length > 0) {
                        setEvaluations((prev) => appendAndSortEvaluations(prev, createdItems))
                    } else {
                        await loadEvaluations()
                    }
                }

                if (successCount === 0) {
                    throw new Error(failures[0] ?? `Failed to assign to selected ${assignmentMeta.rolePlural}.`)
                }

                const summaryParts = [
                    `${successCount} created`,
                    failures.length > 0 ? `${failures.length} failed` : null,
                    alreadyAssignedCount > 0 ? `${alreadyAssignedCount} already assigned` : null,
                    invalidCount > 0 ? `${invalidCount} invalid id(s) skipped` : null,
                ].filter((x): x is string => !!x)

                if (failures.length > 0) {
                    toast.error("Partial assignment completed", { description: summaryParts.join(" • ") })
                } else {
                    toast.success("Bulk assignment completed", { description: summaryParts.join(" • ") })
                }

                closeForm()
                return
            }

            if (formMode === "create") {
                const endpoint = await resolveEndpointByRole(assignmentMeta.role)

                const payload =
                    assignmentMeta.role === "panelist"
                        ? { schedule_id, evaluator_id, status: status || "pending" }
                        : { schedule_id, student_id: evaluator_id, status: status || "pending" }

                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                })

                const data = await parseJsonSafely<EvaluationResponse>(res)
                const mapped = mapApiItemByRole(assignmentMeta.role, data.item)

                if (mapped) {
                    setEvaluations((prev) => appendAndSortEvaluations(prev, [mapped]))
                } else {
                    await loadEvaluations()
                }

                toast.success(
                    assignmentMeta.role === "student" ? "Student evaluation assigned" : "Panelist evaluation assigned",
                    { description: `Assigned to selected ${assignmentMeta.roleSingular}.` },
                )

                closeForm()
                return
            }

            if (!editingRecord) {
                throw new Error("No evaluation selected for update.")
            }

            const role: AssigneeRole = editingRecord.assignee_role
            const endpoint = await resolveEndpointByRole(role)

            const payload =
                role === "panelist"
                    ? { schedule_id, evaluator_id, status: status || "pending" }
                    : { schedule_id, student_id: evaluator_id, status: status || "pending" }

            const res = await fetch(`${endpoint}/${editingRecord.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            const data = await parseJsonSafely<EvaluationResponse>(res)
            const mapped = mapApiItemByRole(role, data.item)

            if (mapped) {
                setEvaluations((prev) => replaceEvaluation(prev, mapped))
            } else {
                await loadEvaluations()
            }

            toast.success(role === "student" ? "Student evaluation updated" : "Panelist evaluation updated", {
                description: "Changes were saved successfully.",
            })

            closeForm()
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to save evaluation."
            setError(message)
            toast.error("Save failed", { description: message })
        } finally {
            setFormBusy(false)
        }
    }, [
        assignmentKeysByScheduleRole,
        assignmentMeta,
        assignableUsers,
        closeForm,
        editingRecord,
        evaluations,
        form,
        formBusy,
        formMode,
        loadEvaluations,
        resolveEndpointByRole,
    ])

    const deleteEvaluation = React.useCallback(
        async (evaluation: EvaluationRecord) => {
            const key = `${evaluation.kind}:${evaluation.id}:delete`
            setBusyKey(key)
            setError(null)

            try {
                const endpoint = await resolveEndpointByKind(evaluation.kind)

                const res = await fetch(`${endpoint}/${evaluation.id}`, { method: "DELETE" })
                await parseJsonSafely<{ deleted?: number; error?: string; message?: string }>(res)

                setEvaluations((prev) => removeEvaluation(prev, evaluation))
                setPendingDeleteRef(null)

                if (editingRef && isSameRef(editingRef, { id: evaluation.id, kind: evaluation.kind })) {
                    closeForm()
                }

                if (viewingRef && isSameRef(viewingRef, { id: evaluation.id, kind: evaluation.kind })) {
                    setViewOpen(false)
                    setViewingRef(null)
                }

                toast.success(evaluation.kind === "student" ? "Student evaluation deleted" : "Panelist evaluation deleted")
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to delete evaluation."
                setError(message)
                toast.error("Delete failed", { description: message })
            } finally {
                setBusyKey(null)
            }
        },
        [closeForm, editingRef, resolveEndpointByKind, viewingRef],
    )

    const runAction = React.useCallback(
        async (evaluation: EvaluationRecord, action: EvaluationAction) => {
            const actionKey = `${evaluation.kind}:${evaluation.id}:${action}`
            if (busyKey) return

            setBusyKey(actionKey)
            setError(null)

            try {
                const endpointBase = await resolveEndpointByKind(evaluation.kind)

                let res: Response
                if (action === "submit") {
                    res = await fetch(`${endpointBase}/${evaluation.id}/submit`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({}),
                    })
                } else if (action === "lock") {
                    res = await fetch(`${endpointBase}/${evaluation.id}/lock`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({}),
                    })
                } else {
                    res = await fetch(`${endpointBase}/${evaluation.id}/status`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "pending" }),
                    })

                    if (res.status === 404 || res.status === 405) {
                        res = await fetch(`${endpointBase}/${evaluation.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "pending" }),
                        })
                    }
                }

                const data = await parseJsonSafely<EvaluationResponse>(res)
                const mapped = mapApiItemByKind(evaluation.kind, data.item)

                if (mapped) {
                    setEvaluations((prev) => replaceEvaluation(prev, mapped))
                } else {
                    await loadEvaluations()
                }

                if (action === "submit") {
                    toast.success(evaluation.kind === "student" ? "Student evaluation submitted" : "Panelist evaluation submitted")
                } else if (action === "lock") {
                    toast.success(evaluation.kind === "student" ? "Student evaluation locked" : "Panelist evaluation locked")
                } else {
                    toast.success("Evaluation set to pending")
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to update evaluation."
                setError(message)
                toast.error("Action failed", { description: message })
            } finally {
                setBusyKey(null)
            }
        },
        [busyKey, loadEvaluations, resolveEndpointByKind],
    )

    const scheduleSuggestions = React.useMemo(() => {
        const q = scheduleQuery.trim().toLowerCase()

        const items = [...schedules]
            .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
            .filter((item) => {
                if (!q) return true

                const groupName = resolveGroupNameFromSchedule(item)
                const scheduleDate = formatDateTime(item.scheduled_at)
                const room = compactString(item.room) ?? ""
                const status = item.status ?? ""

                return (
                    matchAny(groupName, q) ||
                    matchAny(scheduleDate, q) ||
                    matchAny(room, q) ||
                    matchAny(status, q)
                )
            })

        return items.slice(0, 8)
    }, [resolveGroupNameFromSchedule, scheduleQuery, schedules])

    const evaluatorSuggestions = React.useMemo(() => {
        if (assignmentMeta.mode === "all") return []

        const q = evaluatorQuery.trim().toLowerCase()

        const matched = assignableUsers.filter((item) => {
            if (!q) return true

            return (
                matchAny(compactString(item.name) ?? "", q) ||
                matchAny(compactString(item.email) ?? "", q) ||
                matchAny(String(item.role), q)
            )
        })

        return matched
            .sort((a, b) => (compactString(a.name) ?? "").localeCompare(compactString(b.name) ?? ""))
            .slice(0, 8)
    }, [assignmentMeta.mode, assignableUsers, evaluatorQuery])

    const selectedSchedule = React.useMemo(() => resolveScheduleById(form.schedule_id), [
        form.schedule_id,
        resolveScheduleById,
    ])

    const selectedEvaluator = React.useMemo(() => resolveEvaluatorById(form.evaluator_id), [
        form.evaluator_id,
        resolveEvaluatorById,
    ])

    const allModePreview = React.useMemo(() => assignableUsers.slice(0, 8), [assignableUsers])

    const selectedViewEvaluation = React.useMemo(() => {
        if (!viewingRef) return null
        return evaluations.find((row) => isSameRefRecord(viewingRef, row)) ?? null
    }, [evaluations, viewingRef])

    const selectedViewSchedule = React.useMemo(() => {
        if (!selectedViewEvaluation) return null
        return resolveScheduleById(selectedViewEvaluation.schedule_id)
    }, [resolveScheduleById, selectedViewEvaluation])

    const selectedViewEvaluator = React.useMemo(() => {
        if (!selectedViewEvaluation) return null
        return resolveEvaluatorById(selectedViewEvaluation.evaluator_id)
    }, [resolveEvaluatorById, selectedViewEvaluation])

    React.useEffect(() => {
        if (!formOpen) return

        if (formMode === "edit" && editingRecord) {
            const expectedPreset = toAssignmentPreset(editingRecord.assignee_role, "particular")
            if (assignmentPreset !== expectedPreset) {
                setAssignmentPreset(expectedPreset)
            }
        }

        if (form.schedule_id && !scheduleQuery.trim()) {
            const picked = resolveScheduleById(form.schedule_id)
            if (picked) {
                setScheduleQuery(resolveGroupNameFromSchedule(picked))
            }
        }

        if (assignmentMeta.mode === "particular" && form.evaluator_id && !evaluatorQuery.trim()) {
            const picked = resolveEvaluatorById(form.evaluator_id)
            if (picked) {
                setEvaluatorQuery(compactString(picked.name) ?? compactString(picked.email) ?? "")
            }
        }
    }, [
        assignmentMeta.mode,
        assignmentPreset,
        editingRecord,
        evaluatorQuery,
        form.evaluator_id,
        form.schedule_id,
        formMode,
        formOpen,
        resolveEvaluatorById,
        resolveGroupNameFromSchedule,
        resolveScheduleById,
        scheduleQuery,
    ])

    React.useEffect(() => {
        if (!formOpen) return

        if (assignmentMeta.mode === "all") {
            if (form.evaluator_id) {
                setForm((prev) => ({ ...prev, evaluator_id: "" }))
            }
            if (evaluatorQuery) {
                setEvaluatorQuery("")
            }
            return
        }

        if (!form.evaluator_id) return

        const selected = resolveEvaluatorById(form.evaluator_id)
        const selectedRole = selected ? normalizeStatus(String(selected.role)) : ""
        if (selectedRole !== assignmentMeta.role) {
            setForm((prev) => ({ ...prev, evaluator_id: "" }))
            setEvaluatorQuery("")
        }
    }, [assignmentMeta.mode, assignmentMeta.role, evaluatorQuery, form.evaluator_id, formOpen, resolveEvaluatorById])

    React.useEffect(() => {
        if (!viewOpen) {
            setViewingRef(null)
            return
        }

        if (viewingRef && !selectedViewEvaluation) {
            setViewOpen(false)
            setViewingRef(null)
        }
    }, [selectedViewEvaluation, viewOpen, viewingRef])

    return {
        // data
        evaluations,
        schedules,
        groups,
        evaluators,

        // loading/error
        loadingTable,
        loadingMeta,
        refreshing,
        error,

        // filters
        search,
        setSearch,
        statusFilter,
        setStatusFilter,

        // busy
        busyKey,

        // form state
        formOpen,
        formMode,
        formBusy,
        editingRef,
        form,
        assignmentPreset,
        setAssignmentPreset,
        assignmentMeta,
        availablePresets,
        scheduleQuery,
        setScheduleQuery,
        evaluatorQuery,
        setEvaluatorQuery,

        // actions state
        pendingDeleteRef,
        setPendingDeleteRef,
        viewOpen,
        setViewOpen,

        // derived
        filtered,
        groupedFiltered,
        stats,
        assignableUsers,
        bulkAssignmentPreview,
        scheduleSuggestions,
        evaluatorSuggestions,
        selectedSchedule,
        selectedEvaluator,
        allModePreview,
        selectedViewEvaluation,
        selectedViewSchedule,
        selectedViewEvaluator,

        // resolvers/helpers needed by UI
        scheduleById,
        evaluatorById,
        resolveGroupNameFromSchedule,
        resolveScheduleById,
        resolveEvaluatorById,

        // handlers
        refreshAll,
        openCreateForm,
        openEditForm,
        closeForm,
        openViewDialog,
        onFormFieldChange,
        submitForm,
        deleteEvaluation,
        runAction,

        // constants (for UI use)
        STATUS_FILTERS,
        ASSIGNMENT_STATUSES,
        toTitleCase,
        normalizeStatus,
        statusLabel: toTitleCase,
        formatDateTime,
        compactString,
        roleLabel,
    }
}
