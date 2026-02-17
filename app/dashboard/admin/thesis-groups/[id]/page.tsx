/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { MoreHorizontal, Plus } from "lucide-react"
import { toast } from "sonner"

import DashboardLayout from "@/components/dashboard-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

import ThesisGroupDetailsDialogs from "@/components/thesis-groups/thesis-group-details-dialogs"
import {
    asRecord,
    dedupeById,
    defaultMemberForm,
    extractErrorMessage,
    formatDateTime,
    isDisabledStatus,
    isMissingStudentProfileMessage,
    normalizeGroup,
    normalizeMember,
    normalizeSchedule,
    normalizeStaffUser,
    normalizeStudentUser,
    sanitizeStudentSelectValue,
    toNullableTrimmed,
    toStringOrNull,
    sortMembers,
    unwrapDetail,
    unwrapItems,
} from "@/components/thesis-groups/thesis-group-details-helpers"
import {
    ensureUserRoleIsStudent,
    fetchAllSuccessfulJson,
    fetchFirstAvailableJson,
    parseResponseBodySafe,
    requestFirstAvailable,
    upsertStudentProfile,
} from "@/components/thesis-groups/thesis-group-details-service"
import {
    CREATE_USER_STATUSES,
    STAFF_LIST_ENDPOINTS,
    STUDENT_LIST_ENDPOINTS,
    STUDENT_NONE_VALUE,
    detailEndpoints,
    memberEndpoints,
    scheduleEndpoints,
    type DefenseScheduleItem,
    type GroupMemberItem,
    type MemberDialogMode,
    type MemberFormState,
    type StaffUserItem,
    type StudentUserItem,
    type ThesisGroupDetail,
    type UserStatus,
} from "@/components/thesis-groups/thesis-group-details-types"

export default function AdminThesisGroupDetailsPage() {
    const params = useParams<{ id: string | string[] }>()
    const groupId = React.useMemo(() => {
        const raw = params?.id
        if (Array.isArray(raw)) return raw[0] ?? ""
        return raw ?? ""
    }, [params])

    const [group, setGroup] = React.useState<ThesisGroupDetail | null>(null)
    const [staffUsers, setStaffUsers] = React.useState<StaffUserItem[]>([])
    const [studentUsers, setStudentUsers] = React.useState<StudentUserItem[]>([])
    const [members, setMembers] = React.useState<GroupMemberItem[]>([])
    const [schedules, setSchedules] = React.useState<DefenseScheduleItem[]>([])

    const [loading, setLoading] = React.useState<boolean>(true)
    const [staffLoading, setStaffLoading] = React.useState<boolean>(true)
    const [studentsLoading, setStudentsLoading] = React.useState<boolean>(true)

    const [error, setError] = React.useState<string | null>(null)
    const [staffError, setStaffError] = React.useState<string | null>(null)
    const [studentsError, setStudentsError] = React.useState<string | null>(null)

    const [refreshKey, setRefreshKey] = React.useState<number>(0)

    const [memberDialogOpen, setMemberDialogOpen] = React.useState(false)
    const [memberDialogMode, setMemberDialogMode] = React.useState<MemberDialogMode>("create")
    const [memberTarget, setMemberTarget] = React.useState<GroupMemberItem | null>(null)
    const [memberSubmitting, setMemberSubmitting] = React.useState(false)
    const [memberActionError, setMemberActionError] = React.useState<string | null>(null)

    const [deleteMemberOpen, setDeleteMemberOpen] = React.useState(false)
    const [deleteMemberTarget, setDeleteMemberTarget] = React.useState<GroupMemberItem | null>(null)

    const [memberForm, setMemberForm] = React.useState<MemberFormState>(() =>
        defaultMemberForm(STUDENT_NONE_VALUE)
    )

    const [createStudentOpen, setCreateStudentOpen] = React.useState(false)
    const [creatingStudentUser, setCreatingStudentUser] = React.useState(false)
    const [createStudentError, setCreateStudentError] = React.useState<string | null>(null)
    const [createStudentName, setCreateStudentName] = React.useState("")
    const [createStudentEmail, setCreateStudentEmail] = React.useState("")
    const [createStudentStatus, setCreateStudentStatus] = React.useState<UserStatus>("active")

    const [studentProfileDialogOpen, setStudentProfileDialogOpen] = React.useState(false)
    const [studentProfileSubmitting, setStudentProfileSubmitting] = React.useState(false)
    const [studentProfileError, setStudentProfileError] = React.useState<string | null>(null)
    const [studentProfileTarget, setStudentProfileTarget] = React.useState<StudentUserItem | null>(null)
    const [studentProfileProgram, setStudentProfileProgram] = React.useState("")
    const [studentProfileSection, setStudentProfileSection] = React.useState("")
    const [studentProfileMissingUserIds, setStudentProfileMissingUserIds] = React.useState<string[]>([])

    const staffById = React.useMemo(() => {
        const map = new Map<string, StaffUserItem>()
        for (const item of staffUsers) map.set(item.id, item)
        return map
    }, [staffUsers])

    const studentsById = React.useMemo(() => {
        const map = new Map<string, StudentUserItem>()
        for (const item of studentUsers) map.set(item.id, item)
        return map
    }, [studentUsers])

    const studentIdsAlreadyUsed = React.useMemo(() => {
        const set = new Set<string>()
        for (const member of members) {
            if (member.linkedUserId) set.add(member.linkedUserId)
            if (member.studentId && studentsById.has(member.studentId)) set.add(member.studentId)
        }
        return set
    }, [members, studentsById])

    const currentEditStudentUserId = React.useMemo(() => {
        if (!memberTarget) return null
        if (memberTarget.linkedUserId) return memberTarget.linkedUserId
        if (memberTarget.studentId && studentsById.has(memberTarget.studentId)) {
            return memberTarget.studentId
        }
        return null
    }, [memberTarget, studentsById])

    const availableStudentsForCreate = React.useMemo(() => {
        return studentUsers.filter(
            (student) => !studentIdsAlreadyUsed.has(student.id) && !isDisabledStatus(student.status)
        )
    }, [studentIdsAlreadyUsed, studentUsers])

    const availableStudentsForEdit = React.useMemo(() => {
        return studentUsers.filter((student) => {
            const isCurrent = currentEditStudentUserId === student.id
            const usedByOther = studentIdsAlreadyUsed.has(student.id) && !isCurrent
            if (usedByOther) return false
            if (isDisabledStatus(student.status) && !isCurrent) return false
            return true
        })
    }, [currentEditStudentUserId, studentIdsAlreadyUsed, studentUsers])

    const availableStudentsForDialog =
        memberDialogMode === "edit" ? availableStudentsForEdit : availableStudentsForCreate

    const normalizedMemberSelectValue = React.useMemo(
        () => sanitizeStudentSelectValue(memberForm.studentUserId),
        [memberForm.studentUserId]
    )

    const selectedStudentForMember = React.useMemo(() => {
        if (normalizedMemberSelectValue === STUDENT_NONE_VALUE) return null
        return studentsById.get(normalizedMemberSelectValue) ?? null
    }, [normalizedMemberSelectValue, studentsById])

    const selectedStudentMissing =
        normalizedMemberSelectValue !== STUDENT_NONE_VALUE &&
        !availableStudentsForDialog.some((item) => item.id === normalizedMemberSelectValue)

    const editableStudentIds = React.useMemo(() => {
        const set = new Set(studentIdsAlreadyUsed)
        if (currentEditStudentUserId) set.delete(currentEditStudentUserId)
        return set
    }, [currentEditStudentUserId, studentIdsAlreadyUsed])

    const selectedStudentNeedsProfile = React.useMemo(() => {
        if (!selectedStudentForMember) return false
        return studentProfileMissingUserIds.includes(selectedStudentForMember.id)
    }, [selectedStudentForMember, studentProfileMissingUserIds])

    const load = React.useCallback(
        async (signal: AbortSignal) => {
            if (!groupId) {
                setGroup(null)
                setMembers([])
                setSchedules([])
                setError("Invalid thesis group id.")
                setLoading(false)
                return
            }

            setLoading(true)
            setError(null)

            try {
                const detailPayload = await fetchFirstAvailableJson(detailEndpoints(groupId), signal)

                if (!detailPayload) {
                    setGroup(null)
                    setMembers([])
                    setSchedules([])
                    setError(
                        "No compatible thesis-group detail endpoint found. Wire one of: /api/thesis-groups/:id or /api/admin/thesis-groups/:id."
                    )
                    setLoading(false)
                    return
                }

                const rawDetail = unwrapDetail(detailPayload)
                const parsedGroup = normalizeGroup(rawDetail)

                if (!parsedGroup) {
                    setGroup(null)
                    setMembers([])
                    setSchedules([])
                    setError("Group record was returned, but with an invalid shape.")
                    setLoading(false)
                    return
                }

                setGroup(parsedGroup)

                const detailRec = asRecord(rawDetail)

                const embeddedMembers = detailRec
                    ? unwrapItems(detailRec.members)
                        .map(normalizeMember)
                        .filter((m): m is GroupMemberItem => m !== null)
                    : []

                const embeddedSchedules = detailRec
                    ? unwrapItems(detailRec.defense_schedules ?? detailRec.schedules)
                        .map(normalizeSchedule)
                        .filter((s): s is DefenseScheduleItem => s !== null)
                    : []

                if (embeddedMembers.length > 0) {
                    setMembers(sortMembers(embeddedMembers))
                } else {
                    const membersPayload = await fetchFirstAvailableJson(memberEndpoints(groupId), signal)
                    const memberItems = unwrapItems(membersPayload)
                        .map(normalizeMember)
                        .filter((m): m is GroupMemberItem => m !== null)
                    setMembers(sortMembers(memberItems))
                }

                if (embeddedSchedules.length > 0) {
                    setSchedules(embeddedSchedules)
                } else {
                    const schedulesPayload = await fetchFirstAvailableJson(scheduleEndpoints(groupId), signal)
                    const scheduleItems = unwrapItems(schedulesPayload)
                        .map(normalizeSchedule)
                        .filter((s): s is DefenseScheduleItem => s !== null)
                    setSchedules(scheduleItems)
                }
            } catch (e) {
                if (e instanceof Error && e.name === "AbortError") return
                const message = e instanceof Error ? e.message : "Failed to load thesis group details."
                setGroup(null)
                setMembers([])
                setSchedules([])
                setError(message)
                toast.error(message)
            } finally {
                setLoading(false)
            }
        },
        [groupId]
    )

    const refreshMembersOnly = React.useCallback(async () => {
        if (!groupId) return
        try {
            const controller = new AbortController()
            const payload = await fetchFirstAvailableJson(memberEndpoints(groupId), controller.signal)
            const items = unwrapItems(payload)
                .map(normalizeMember)
                .filter((item): item is GroupMemberItem => item !== null)
            setMembers(sortMembers(items))
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to refresh thesis group members."
            toast.error(message)
        }
    }, [groupId])

    const loadStaffUsers = React.useCallback(async (signal: AbortSignal) => {
        setStaffLoading(true)
        setStaffError(null)

        try {
            const results = await fetchAllSuccessfulJson(STAFF_LIST_ENDPOINTS, signal)

            if (results.length === 0) {
                setStaffUsers([])
                setStaffError("No compatible staff endpoint found. Adviser profile preview is unavailable.")
                return
            }

            const items = results
                .flatMap((result) => unwrapItems(result.payload))
                .map(normalizeStaffUser)
                .filter((item): item is StaffUserItem => item !== null)

            const merged = dedupeById(items).sort((a, b) =>
                a.name.localeCompare(b.name, "en", { sensitivity: "base" })
            )

            setStaffUsers(merged)

            if (merged.length === 0) {
                setStaffError("No staff users were returned from the available endpoints.")
            }
        } catch (e) {
            if (e instanceof Error && e.name === "AbortError") return
            const message = e instanceof Error ? e.message : "Failed to load staff users for adviser preview."
            setStaffUsers([])
            setStaffError(message)
            toast.error(message)
        } finally {
            setStaffLoading(false)
        }
    }, [])

    const loadStudentUsers = React.useCallback(async (signal: AbortSignal) => {
        setStudentsLoading(true)
        setStudentsError(null)

        try {
            const results = await fetchAllSuccessfulJson(STUDENT_LIST_ENDPOINTS, signal)

            if (results.length === 0) {
                setStudentUsers([])
                setStudentsError("No compatible student endpoint found. Create a Student user to add members.")
                return
            }

            const items = results
                .flatMap((result) => unwrapItems(result.payload))
                .map(normalizeStudentUser)
                .filter((item): item is StudentUserItem => item !== null)

            const merged = dedupeById(items).sort((a, b) =>
                a.name.localeCompare(b.name, "en", { sensitivity: "base" })
            )

            setStudentUsers(merged)

            if (merged.length === 0) {
                setStudentsError(
                    "No student users were returned from available endpoints. Create a Student user to continue."
                )
            }
        } catch (e) {
            if (e instanceof Error && e.name === "AbortError") return
            const message = e instanceof Error ? e.message : "Failed to load student users for member assignment."
            setStudentUsers([])
            setStudentsError(message)
            toast.error(message)
        } finally {
            setStudentsLoading(false)
        }
    }, [])

    React.useEffect(() => {
        const controller = new AbortController()
        void load(controller.signal)
        void loadStaffUsers(controller.signal)
        void loadStudentUsers(controller.signal)
        return () => controller.abort()
    }, [load, loadStaffUsers, loadStudentUsers, refreshKey])

    React.useEffect(() => {
        if (memberForm.studentUserId === normalizedMemberSelectValue) return
        setMemberForm((prev) => ({ ...prev, studentUserId: normalizedMemberSelectValue }))
    }, [memberForm.studentUserId, normalizedMemberSelectValue])

    React.useEffect(() => {
        if (!memberDialogOpen) return

        const exists = availableStudentsForDialog.some((student) => student.id === normalizedMemberSelectValue)
        if (exists) return

        const firstStudent = availableStudentsForDialog[0]?.id ?? STUDENT_NONE_VALUE
        setMemberForm((prev) => ({ ...prev, studentUserId: sanitizeStudentSelectValue(firstStudent) }))
    }, [availableStudentsForDialog, memberDialogOpen, normalizedMemberSelectValue])

    const adviserContent = React.useMemo(() => {
        if (!group?.adviserId) {
            if (group?.manualAdviserInfo) {
                return (
                    <div className="space-y-1">
                        <Badge variant="outline">Legacy Manual Adviser</Badge>
                        <p className="text-sm">{group.manualAdviserInfo}</p>
                    </div>
                )
            }

            return <span className="text-muted-foreground">Not assigned</span>
        }

        const staff = staffById.get(group.adviserId)
        if (!staff) {
            if (staffLoading) {
                return <span className="text-muted-foreground">Loading adviser profile…</span>
            }

            return (
                <div className="space-y-1">
                    <Badge variant="outline">Assigned Staff Adviser</Badge>
                    <p className="text-xs text-muted-foreground">
                        Staff profile details are not available from the current endpoint.
                    </p>
                </div>
            )
        }

        return (
            <div className="space-y-0.5 leading-tight">
                <div className="font-medium">{staff.name}</div>
                {staff.email ? <div className="text-xs text-muted-foreground">{staff.email}</div> : null}
            </div>
        )
    }, [group?.adviserId, group?.manualAdviserInfo, staffById, staffLoading])

    const resetCreateMemberForm = React.useCallback(() => {
        const firstStudentId = sanitizeStudentSelectValue(availableStudentsForCreate[0]?.id ?? STUDENT_NONE_VALUE)
        setMemberForm({
            studentUserId: firstStudentId,
            program: group?.program ?? "",
            section: "",
        })
    }, [availableStudentsForCreate, group?.program])

    const resetCreateStudentForm = React.useCallback(() => {
        setCreateStudentName("")
        setCreateStudentEmail("")
        setCreateStudentStatus("active")
        setCreateStudentError(null)
    }, [])

    const resetStudentProfileDialog = React.useCallback(() => {
        setStudentProfileError(null)
        setStudentProfileTarget(null)
        setStudentProfileProgram("")
        setStudentProfileSection("")
    }, [])

    const markStudentProfileMissing = React.useCallback((userId: string) => {
        setStudentProfileMissingUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]))
    }, [])

    const clearStudentProfileMissing = React.useCallback((userId: string) => {
        setStudentProfileMissingUserIds((prev) => prev.filter((id) => id !== userId))
    }, [])

    const openCreateStudentProfileDialog = React.useCallback(
        (student?: StudentUserItem | null) => {
            const target = student ?? selectedStudentForMember
            if (!target) {
                toast.error("Please select a student user first.")
                return
            }

            setStudentProfileTarget(target)
            setStudentProfileProgram(
                toNullableTrimmed(memberForm.program) ??
                toNullableTrimmed(target.program ?? "") ??
                toNullableTrimmed(group?.program ?? "") ??
                ""
            )
            setStudentProfileSection(
                toNullableTrimmed(memberForm.section) ?? toNullableTrimmed(target.section ?? "") ?? ""
            )
            setStudentProfileError(null)
            setStudentProfileDialogOpen(true)
        },
        [group?.program, memberForm.program, memberForm.section, selectedStudentForMember]
    )

    const syncStudentProfileState = React.useCallback((userId: string, program: string | null, section: string | null) => {
        setStudentUsers((prev) => prev.map((item) => (item.id === userId ? { ...item, program, section } : item)))
    }, [])

    const handleCreateStudentProfile = React.useCallback(async () => {
        if (studentProfileSubmitting) return

        if (!studentProfileTarget) {
            const message = "Please select a student user first."
            setStudentProfileError(message)
            toast.error(message)
            return
        }

        setStudentProfileSubmitting(true)
        setStudentProfileError(null)

        const loadingToastId = toast.loading("Creating student profile...")

        try {
            const result = await upsertStudentProfile(studentProfileTarget.id, {
                program: studentProfileProgram,
                section: studentProfileSection,
            })

            const responseRec = asRecord(unwrapDetail(result.payload))
            const normalizedProgram =
                toStringOrNull(responseRec?.program ?? responseRec?.course) ??
                toNullableTrimmed(studentProfileProgram)
            const normalizedSection =
                toStringOrNull(responseRec?.section) ??
                toNullableTrimmed(studentProfileSection)

            syncStudentProfileState(studentProfileTarget.id, normalizedProgram, normalizedSection)
            clearStudentProfileMissing(studentProfileTarget.id)

            if (selectedStudentForMember?.id === studentProfileTarget.id) {
                setMemberForm((prev) => ({
                    ...prev,
                    program: toNullableTrimmed(prev.program) ? prev.program : normalizedProgram ?? "",
                    section: toNullableTrimmed(prev.section) ? prev.section : normalizedSection ?? "",
                }))
            }

            toast.success("Student profile created successfully. You can now add the member.", {
                id: loadingToastId,
            })

            setStudentProfileDialogOpen(false)
            resetStudentProfileDialog()
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to create student profile."
            setStudentProfileError(message)
            toast.error(message, { id: loadingToastId })
        } finally {
            setStudentProfileSubmitting(false)
        }
    }, [
        clearStudentProfileMissing,
        resetStudentProfileDialog,
        selectedStudentForMember?.id,
        studentProfileProgram,
        studentProfileSection,
        studentProfileSubmitting,
        studentProfileTarget,
        syncStudentProfileState,
    ])

    const handleCreateStudentUser = React.useCallback(async () => {
        if (creatingStudentUser) return

        const name = createStudentName.trim()
        const email = createStudentEmail.trim().toLowerCase()

        setCreateStudentError(null)

        if (!name) {
            const msg = "Student name is required."
            setCreateStudentError(msg)
            toast.error(msg)
            return
        }

        if (!email) {
            const msg = "Student email is required."
            setCreateStudentError(msg)
            toast.error(msg)
            return
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            const msg = "Please provide a valid email address."
            setCreateStudentError(msg)
            toast.error(msg)
            return
        }

        setCreatingStudentUser(true)
        const loadingToastId = toast.loading("Creating student user...")

        try {
            const res = await fetch("/api/users/provision", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                cache: "no-store",
                body: JSON.stringify({
                    name,
                    email,
                    role: "student",
                    status: createStudentStatus,
                    sendLoginDetails: true,
                }),
            })

            const payload = await parseResponseBodySafe(res)
            const body = asRecord(payload)

            if (!res.ok) {
                throw new Error(extractErrorMessage(payload, "Failed to create student user.", res.status))
            }

            const createdRaw = body?.item ?? body?.data ?? null
            const createdStudent = normalizeStudentUser(createdRaw)

            if (!createdStudent) {
                throw new Error(
                    "Student user was created but returned data shape is unsupported for member assignment."
                )
            }

            setStudentUsers((prev) =>
                dedupeById([createdStudent, ...prev]).sort((a, b) =>
                    a.name.localeCompare(b.name, "en", { sensitivity: "base" })
                )
            )

            setMemberForm((prev) =>
                prev.studentUserId === STUDENT_NONE_VALUE
                    ? { ...prev, studentUserId: sanitizeStudentSelectValue(createdStudent.id) }
                    : prev
            )

            const successMessage =
                toStringOrNull(body?.message) ??
                "Student user created successfully. Login details were sent to email."

            toast.success(successMessage, {
                id: loadingToastId,
                description: "Before adding this user as a member, create a student profile.",
                action: {
                    label: "Create Profile",
                    onClick: () => openCreateStudentProfileDialog(createdStudent),
                },
            })

            setCreateStudentOpen(false)
            resetCreateStudentForm()
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to create student user."
            setCreateStudentError(message)
            toast.error(message, { id: loadingToastId })
        } finally {
            setCreatingStudentUser(false)
        }
    }, [
        createStudentEmail,
        createStudentName,
        createStudentStatus,
        creatingStudentUser,
        openCreateStudentProfileDialog,
        resetCreateStudentForm,
    ])

    const openCreateStudentDialog = React.useCallback(() => {
        resetCreateStudentForm()
        setCreateStudentOpen(true)
    }, [resetCreateStudentForm])

    const openCreateMemberDialog = React.useCallback(() => {
        setMemberDialogMode("create")
        setMemberTarget(null)
        resetCreateMemberForm()
        setMemberActionError(null)
        setMemberDialogOpen(true)
    }, [resetCreateMemberForm])

    const openEditMemberDialog = React.useCallback(
        (member: GroupMemberItem) => {
            const linkedId =
                member.linkedUserId ??
                (member.studentId && studentsById.has(member.studentId) ? member.studentId : null)

            const fallbackStudentId = availableStudentsForEdit[0]?.id ?? STUDENT_NONE_VALUE
            const selectedStudentId = sanitizeStudentSelectValue(linkedId ?? fallbackStudentId)

            setMemberDialogMode("edit")
            setMemberTarget(member)
            setMemberForm({
                studentUserId: selectedStudentId,
                program: member.program ?? group?.program ?? "",
                section: member.section ?? "",
            })
            setMemberActionError(null)
            setMemberDialogOpen(true)
        },
        [availableStudentsForEdit, group?.program, studentsById]
    )

    const openDeleteMemberDialog = React.useCallback((member: GroupMemberItem) => {
        setDeleteMemberTarget(member)
        setMemberActionError(null)
        setDeleteMemberOpen(true)
    }, [])

    const onMemberSubmit = React.useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault()

            if (!groupId) {
                const message = "Invalid thesis group id."
                setMemberActionError(message)
                toast.error(message)
                return
            }

            setMemberSubmitting(true)
            setMemberActionError(null)

            let selectedStudentSnapshot: StudentUserItem | null = null

            try {
                const selectedId =
                    normalizedMemberSelectValue === STUDENT_NONE_VALUE ? null : normalizedMemberSelectValue
                if (!selectedId) {
                    throw new Error("Please select a student user. If none is available, create one first.")
                }

                const selected = studentsById.get(selectedId)
                if (!selected) {
                    throw new Error("Selected student user is no longer available.")
                }

                selectedStudentSnapshot = selected

                if (memberDialogMode === "create" && studentIdsAlreadyUsed.has(selected.id)) {
                    throw new Error("Selected student is already a member of this thesis group.")
                }

                if (
                    memberDialogMode === "edit" &&
                    editableStudentIds.has(selected.id) &&
                    selected.id !== currentEditStudentUserId
                ) {
                    throw new Error("Selected student is already assigned to this thesis group.")
                }

                const successNotes: string[] = []

                const roleFix = await ensureUserRoleIsStudent(selected.id)
                if (roleFix.updated) {
                    const fromRole = roleFix.roleBefore ? ` from "${roleFix.roleBefore}"` : ""
                    successNotes.push(`Linked user role was auto-updated${fromRole} to "student".`)
                }

                const payload = {
                    user_id: selected.id,
                    userId: selected.id,
                    student_user_id: selected.id,
                    studentUserId: selected.id,
                    student_id: selected.id,
                    studentId: selected.id,
                    name: selected.name,
                    program:
                        toNullableTrimmed(memberForm.program) ??
                        toNullableTrimmed(selected.program ?? "") ??
                        null,
                    section:
                        toNullableTrimmed(memberForm.section) ??
                        toNullableTrimmed(selected.section ?? "") ??
                        null,
                }

                if (memberDialogMode === "create") {
                    const result = await requestFirstAvailable(memberEndpoints(groupId), {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    })

                    const created = normalizeMember(unwrapDetail(result.payload))

                    if (created) {
                        setMembers((prev) => sortMembers([created, ...prev.filter((item) => item.id !== created.id)]))
                    } else {
                        await refreshMembersOnly()
                    }

                    if (selectedStudentSnapshot) {
                        clearStudentProfileMissing(selectedStudentSnapshot.id)
                    }

                    if (successNotes.length > 0) {
                        toast.success("Member added successfully.", { description: successNotes.join(" ") })
                    } else {
                        toast.success("Member added successfully.")
                    }
                } else {
                    if (!memberTarget) throw new Error("No member selected for editing.")

                    const identifier =
                        memberTarget.memberId ??
                        memberTarget.linkedUserId ??
                        memberTarget.studentId ??
                        memberTarget.id

                    if (!identifier) throw new Error("Unable to resolve member identifier for update.")

                    const endpoints = memberEndpoints(groupId).map(
                        (base) => `${base}/${encodeURIComponent(identifier)}`
                    )

                    const result = await requestFirstAvailable(endpoints, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    })

                    const updated = normalizeMember(unwrapDetail(result.payload))

                    if (updated) {
                        setMembers((prev) => {
                            const withoutTarget = prev.filter((item) => item.id !== memberTarget.id)
                            return sortMembers([updated, ...withoutTarget.filter((item) => item.id !== updated.id)])
                        })
                    } else {
                        await refreshMembersOnly()
                    }

                    if (selectedStudentSnapshot) {
                        clearStudentProfileMissing(selectedStudentSnapshot.id)
                    }

                    if (successNotes.length > 0) {
                        toast.success("Member updated successfully.", { description: successNotes.join(" ") })
                    } else {
                        toast.success("Member updated successfully.")
                    }
                }

                setMemberDialogOpen(false)
                setMemberTarget(null)
            } catch (e) {
                const message = e instanceof Error ? e.message : "Failed to save member."
                setMemberActionError(message)

                if (selectedStudentSnapshot && isMissingStudentProfileMessage(message)) {
                    markStudentProfileMissing(selectedStudentSnapshot.id)
                    toast.error(message, {
                        action: {
                            label: "Create Profile",
                            onClick: () => openCreateStudentProfileDialog(selectedStudentSnapshot),
                        },
                    })
                } else {
                    toast.error(message)
                }
            } finally {
                setMemberSubmitting(false)
            }
        },
        [
            clearStudentProfileMissing,
            currentEditStudentUserId,
            editableStudentIds,
            groupId,
            markStudentProfileMissing,
            memberDialogMode,
            memberForm,
            memberTarget,
            normalizedMemberSelectValue,
            openCreateStudentProfileDialog,
            refreshMembersOnly,
            studentIdsAlreadyUsed,
            studentsById,
        ]
    )

    const onDeleteMemberConfirm = React.useCallback(async () => {
        if (!deleteMemberTarget || !groupId) return

        setMemberSubmitting(true)
        setMemberActionError(null)

        try {
            const identifier =
                deleteMemberTarget.memberId ??
                deleteMemberTarget.linkedUserId ??
                deleteMemberTarget.studentId ??
                deleteMemberTarget.id

            if (!identifier) {
                throw new Error("Unable to resolve member identifier for delete.")
            }

            const endpoints = memberEndpoints(groupId).map(
                (base) => `${base}/${encodeURIComponent(identifier)}`
            )

            await requestFirstAvailable(endpoints, { method: "DELETE" })

            setMembers((prev) => prev.filter((item) => item.id !== deleteMemberTarget.id))
            setDeleteMemberOpen(false)
            setDeleteMemberTarget(null)
            toast.success("Member removed successfully.")
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to remove member."
            setMemberActionError(message)
            toast.error(message)
        } finally {
            setMemberSubmitting(false)
        }
    }, [deleteMemberTarget, groupId])

    return (
        <DashboardLayout
            title={group ? `Thesis Group: ${group.title}` : "Thesis Group Details"}
            description="View thesis group profile, members, defense schedules, and assigned staff adviser."
        >
            <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline">
                        <Link href="/dashboard/admin/thesis-groups">Back to Thesis Groups</Link>
                    </Button>

                    <Button
                        onClick={() => setRefreshKey((v) => v + 1)}
                        disabled={loading || staffLoading || studentsLoading}
                    >
                        {loading || staffLoading || studentsLoading ? "Refreshing..." : "Refresh"}
                    </Button>
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

                {studentsError ? (
                    <Alert>
                        <AlertDescription>{studentsError}</AlertDescription>
                    </Alert>
                ) : null}

                {!group && loading ? (
                    <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                        Loading thesis group details...
                    </div>
                ) : null}

                {!group && !loading ? (
                    <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                        No group data found for this record.
                    </div>
                ) : null}

                {group ? (
                    <>
                        <section className="space-y-2">
                            <h2 className="text-sm font-semibold">Overview</h2>
                            <div className="overflow-hidden rounded-lg border">
                                <Table>
                                    <TableBody>
                                        <TableRow>
                                            <TableCell className="w-48 font-medium">Group ID</TableCell>
                                            <TableCell>{group.id}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="font-medium">Title</TableCell>
                                            <TableCell>{group.title}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="font-medium">Program</TableCell>
                                            <TableCell>{group.program ?? "—"}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="font-medium">Term</TableCell>
                                            <TableCell>{group.term ?? "—"}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="font-medium">Adviser</TableCell>
                                            <TableCell>{adviserContent}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="font-medium">Created</TableCell>
                                            <TableCell>{formatDateTime(group.createdAt)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="font-medium">Last Updated</TableCell>
                                            <TableCell>{formatDateTime(group.updatedAt)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </div>
                        </section>

                        <section className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h2 className="text-sm font-semibold">Members ({members.length})</h2>

                                <div className="flex items-center gap-2">
                                    <Badge variant="outline">
                                        {studentsLoading
                                            ? "Loading students..."
                                            : `Available students: ${availableStudentsForCreate.length}`}
                                    </Badge>

                                    {!studentsLoading && availableStudentsForCreate.length === 0 ? (
                                        <Button size="sm" variant="secondary" onClick={openCreateStudentDialog}>
                                            <Plus className="mr-2 size-4" />
                                            Create Student User
                                        </Button>
                                    ) : null}

                                    <Button onClick={openCreateMemberDialog} size="sm">
                                        <Plus className="mr-2 size-4" />
                                        Add Member
                                    </Button>
                                </div>
                            </div>

                            <div className="overflow-hidden rounded-lg border">
                                <Table>
                                    <TableHeader className="bg-muted/40">
                                        <TableRow>
                                            <TableHead>Student ID</TableHead>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Program</TableHead>
                                            <TableHead>Section</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {members.length > 0 ? (
                                            members.map((member) => (
                                                <TableRow key={member.id}>
                                                    <TableCell>{member.studentId ?? "—"}</TableCell>
                                                    <TableCell>{member.name ?? "—"}</TableCell>
                                                    <TableCell>{member.program ?? "—"}</TableCell>
                                                    <TableCell>{member.section ?? "—"}</TableCell>
                                                    <TableCell className="text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    aria-label="Member actions"
                                                                >
                                                                    <MoreHorizontal className="size-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-40">
                                                                <DropdownMenuItem
                                                                    onClick={() => openEditMemberDialog(member)}
                                                                >
                                                                    Edit
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    className="text-destructive focus:text-destructive"
                                                                    onClick={() => openDeleteMemberDialog(member)}
                                                                >
                                                                    Delete
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                                    No group members found.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-sm font-semibold">Defense Schedules ({schedules.length})</h2>
                            <div className="overflow-hidden rounded-lg border">
                                <Table>
                                    <TableHeader className="bg-muted/40">
                                        <TableRow>
                                            <TableHead>Schedule ID</TableHead>
                                            <TableHead>Scheduled At</TableHead>
                                            <TableHead>Room</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Rubric Template</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {schedules.length > 0 ? (
                                            schedules.map((schedule) => (
                                                <TableRow key={schedule.id}>
                                                    <TableCell>{schedule.id}</TableCell>
                                                    <TableCell>{formatDateTime(schedule.scheduledAt)}</TableCell>
                                                    <TableCell>{schedule.room ?? "—"}</TableCell>
                                                    <TableCell>{schedule.status ?? "—"}</TableCell>
                                                    <TableCell>{schedule.rubricTemplateId ?? "—"}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                                    No schedules found for this group.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </section>
                    </>
                ) : null}
            </div>

            <ThesisGroupDetailsDialogs
                memberDialog={{
                    open: memberDialogOpen,
                    onOpenChange: (open) => {
                        if (!memberSubmitting) setMemberDialogOpen(open)
                        if (!open) {
                            setMemberTarget(null)
                            setMemberActionError(null)
                        }
                    },
                    mode: memberDialogMode,
                    submitting: memberSubmitting,
                    actionError: memberActionError,
                    onSubmit: onMemberSubmit,
                    memberForm,
                    setMemberForm,
                    normalizedMemberSelectValue,
                    availableStudentsForDialog,
                    selectedStudentMissing,
                    studentsLoading,
                    selectedStudentForMember,
                    selectedStudentNeedsProfile,
                    onOpenCreateStudentDialog: openCreateStudentDialog,
                    onOpenCreateStudentProfileDialog: openCreateStudentProfileDialog,
                }}
                createStudentDialog={{
                    open: createStudentOpen,
                    onOpenChange: (open) => {
                        if (!creatingStudentUser) setCreateStudentOpen(open)
                        if (!open) resetCreateStudentForm()
                    },
                    submitting: creatingStudentUser,
                    error: createStudentError,
                    name: createStudentName,
                    email: createStudentEmail,
                    status: createStudentStatus,
                    statusOptions: CREATE_USER_STATUSES,
                    setName: setCreateStudentName,
                    setEmail: setCreateStudentEmail,
                    setStatus: setCreateStudentStatus,
                    onSubmit: handleCreateStudentUser,
                }}
                studentProfileDialog={{
                    open: studentProfileDialogOpen,
                    onOpenChange: (open) => {
                        if (!studentProfileSubmitting) setStudentProfileDialogOpen(open)
                        if (!open && !studentProfileSubmitting) {
                            resetStudentProfileDialog()
                        }
                    },
                    submitting: studentProfileSubmitting,
                    error: studentProfileError,
                    target: studentProfileTarget,
                    program: studentProfileProgram,
                    section: studentProfileSection,
                    setProgram: setStudentProfileProgram,
                    setSection: setStudentProfileSection,
                    onSubmit: handleCreateStudentProfile,
                }}
                deleteMemberDialog={{
                    open: deleteMemberOpen,
                    onOpenChange: (open) => {
                        if (!memberSubmitting) setDeleteMemberOpen(open)
                        if (!open) {
                            setDeleteMemberTarget(null)
                            setMemberActionError(null)
                        }
                    },
                    submitting: memberSubmitting,
                    error: memberActionError,
                    target: deleteMemberTarget,
                    onConfirm: onDeleteMemberConfirm,
                }}
            />
        </DashboardLayout>
    )
}
