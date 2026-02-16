export type NotificationRecord = {
    id: string
    user_id: string
    type: string
    title: string
    body: string
    data: Record<string, unknown>
    read_at: string | null
    created_at: string
}

export type NotificationsResponse = {
    items?: NotificationRecord[]
    item?: NotificationRecord
    updated?: number
    count?: number
    resolved?: {
        recipientCount: number
        recipientIds: string[]
        template: string
        targetMode: string
    }
    error?: string
    message?: string
}

export type AutoNotificationTemplate =
    | "evaluation_submitted"
    | "evaluation_locked"
    | "defense_schedule_updated"
    | "general_update"

export type AutoNotificationIncludeField =
    | "group_title"
    | "schedule_datetime"
    | "schedule_room"
    | "evaluator_name"
    | "evaluation_status"
    | "student_count"
    | "program"
    | "term"

export type AutoNotificationContextKey = "evaluationId" | "scheduleId" | "groupId"

export type TargetMode = "users" | "role" | "group" | "schedule"

export type ThesisRole = string
export type NotificationType = string

export type NotificationAutomationOptions = {
    templates: Array<{
        value: AutoNotificationTemplate
        label: string
        description: string
        defaultType: NotificationType
        requiredContext: AutoNotificationContextKey[]
        allowedIncludes: AutoNotificationIncludeField[]
        defaultIncludes: AutoNotificationIncludeField[]
    }>
    targetModes: Array<{
        value: TargetMode
        label: string
        description: string
    }>
    includeOptions: Array<{
        value: AutoNotificationIncludeField
        label: string
        description: string
    }>
    notificationTypes: NotificationType[]
    context: {
        roles: ThesisRole[]
        users: Array<{
            value: string
            label: string
            role: ThesisRole
        }>
        groups: Array<{
            value: string
            label: string
            program: string | null
            term: string | null
        }>
        schedules: Array<{
            value: string
            label: string
            scheduledAt: string
            room: string | null
            groupId: string
            groupTitle: string | null
        }>
        evaluations: Array<{
            value: string
            label: string
            status: string
            scheduleId: string
            evaluatorId: string
            evaluatorName: string | null
        }>
    }
}

export type AutomationOptionsResponse = {
    item?: NotificationAutomationOptions
    error?: string
    message?: string
}

/* ------------------------------- Push Types -------------------------------- */

export type PushPublicKeyInfo = {
    enabled: boolean
    publicKey: string | null
    reason?: string
}

export type PushPublicKeyResponse = {
    item?: PushPublicKeyInfo
    error?: string
    message?: string
}

export type PushDispatchResult = {
    enabled: boolean
    totalSubscriptions: number
    sent: number
    failed: number
    removed: number
    reason?: string
}

export type PushSendResponse = {
    item?: PushDispatchResult
    error?: string
    message?: string
}

/* --------------------------- Friendly View Types --------------------------- */

export type FriendlyNotificationDetail = {
    label: string
    value: string
}

export type FriendlyNotificationContent = {
    title: string
    summary: string
    details: FriendlyNotificationDetail[]
    formalSubject: string
    formalMessage: string
}

export const NONE_VALUE = "__none__"
export const PUSH_SW_PATH = "/push-sw.js"

export const READ_FILTERS = [
    { value: "all", label: "All" },
    { value: "unread", label: "Unread" },
    { value: "read", label: "Read" },
] as const

export type ReadFilter = (typeof READ_FILTERS)[number]["value"]

export const SELECT_TRIGGER_CLASS =
    "w-full min-w-0 max-w-full [&>span]:block [&>span]:truncate"

export const SELECT_CONTENT_CLASS = "max-w-3xl"

export const FRIENDLY_TYPE_COPY: Record<string, { title: string; summary: string }> = {
    evaluation_submitted: {
        title: "Evaluation submitted",
        summary: "A thesis evaluation has been submitted and recorded successfully.",
    },
    evaluation_locked: {
        title: "Evaluation finalized",
        summary: "The evaluation has been finalized and is now locked for edits.",
    },
    defense_schedule_updated: {
        title: "Defense schedule update",
        summary: "Please review the updated defense schedule details.",
    },
    general_update: {
        title: "General announcement",
        summary: "You have received a new official update from the system.",
    },
    general: {
        title: "New notification",
        summary: "You have received a new official update.",
    },
}

export const FRIENDLY_DETAIL_LABELS: Record<string, string> = {
    grouptitle: "Thesis group",
    groupname: "Thesis group",
    schedule: "Schedule",
    scheduledatetime: "Schedule",
    scheduledat: "Schedule",
    scheduleroom: "Room",
    evaluatorname: "Evaluator",
    evaluationstatus: "Evaluation status",
    studentcount: "Students",
    program: "Program",
    term: "Term",
    topic: "Topic",
    message: "Message",
    role: "Role",
    url: "Open page",
    link: "Link",
}
