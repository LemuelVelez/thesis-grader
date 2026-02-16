import {
    NOTIFICATION_TYPES,
    THESIS_ROLES,
    type JsonObject,
    type NotificationInsert,
    type NotificationPatch,
    type NotificationRow,
    type NotificationType,
    type ThesisRole,
    type UUID,
} from '../models/Model';
import type {
    ListQuery,
    NotificationBroadcastPayload,
    Services,
} from '../services/Services';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const webpush = require('web-push') as {
    setVapidDetails: (
        subject: string,
        publicKey: string,
        privateKey: string,
    ) => void;
    sendNotification: (
        subscription: WebPushSubscriptionPayload,
        payload?: string,
        options?: Record<string, unknown>,
    ) => Promise<{
        statusCode?: number;
        headers?: Record<string, string>;
        body?: string;
    }>;
};

function stripUndefined<T extends object>(input: T): Partial<T> {
    const out: Partial<T> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (value !== undefined) {
            (out as Record<string, unknown>)[key] = value;
        }
    }
    return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toTrimmedString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function toBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
    return undefined;
}

function toInteger(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value !== 'string') return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    return Math.trunc(parsed);
}

function unique<T>(values: T[]): T[] {
    return Array.from(new Set(values));
}

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toUuidArray(value: unknown): UUID[] {
    if (!Array.isArray(value)) return [];
    return unique(
        value
            .map((item) => toTrimmedString(item))
            .filter((v): v is string => !!v && UUID_RE.test(v))
            .map((v) => v as UUID),
    );
}

function safeJsonStringify(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch {
        return '{}';
    }
}

export type ListUserNotificationsQuery = Omit<ListQuery<NotificationRow>, 'where'>;

/* -------------------------------------------------------------------------- */
/*                             Web Push (VAPID) types                         */
/* -------------------------------------------------------------------------- */

type PushUrgency = 'very-low' | 'low' | 'normal' | 'high';

interface WebPushSubscriptionPayload {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
    expirationTime?: number | null;
    contentEncoding?: string;
}

interface StoredPushSubscription {
    id: string | null;
    userId: UUID;
    endpoint: string;
    p256dh: string;
    auth: string;
    contentEncoding: string | null;
    raw: JsonObject;
}

interface PushSubscriptionsServiceLike {
    findMany?: (query?: Record<string, unknown>) => Promise<unknown[]>;
    create?: (payload: Record<string, unknown>) => Promise<unknown>;
    updateOne?: (
        where: Record<string, unknown>,
        patch: Record<string, unknown>,
    ) => Promise<unknown>;
    delete?: (where: Record<string, unknown>) => Promise<number>;
    deleteByEndpoint?: (endpoint: string) => Promise<number>;
    findByEndpoint?: (endpoint: string) => Promise<unknown | null>;
    listByUser?: (userId: UUID) => Promise<unknown[]>;
    listByUsers?: (userIds: UUID[]) => Promise<unknown[]>;
}

export interface PushPublicKeyInfo {
    enabled: boolean;
    publicKey: string | null;
    reason?: string;
}

export interface PushSubscriptionMutationResult {
    item: {
        id: string | null;
        userId: UUID;
        endpoint: string;
        contentEncoding: string | null;
    };
    created: boolean;
    updated: boolean;
}

export interface PushUnsubscribeResult {
    deleted: number;
}

export interface PushDispatchResult {
    enabled: boolean;
    totalSubscriptions: number;
    sent: number;
    failed: number;
    removed: number;
    reason?: string;
}

let webPushConfiguredSignature: string | null = null;

/* -------------------------------------------------------------------------- */
/*                    Automatic notification (select-based)                   */
/* -------------------------------------------------------------------------- */

export const AUTO_NOTIFICATION_TEMPLATES = [
    'evaluation_submitted',
    'evaluation_locked',
    'defense_schedule_updated',
    'general_update',
] as const;

export type AutoNotificationTemplate = (typeof AUTO_NOTIFICATION_TEMPLATES)[number];

export const AUTO_NOTIFICATION_INCLUDE_FIELDS = [
    'group_title',
    'schedule_datetime',
    'schedule_room',
    'evaluator_name',
    'evaluation_status',
    'student_count',
    'program',
    'term',
] as const;

export type AutoNotificationIncludeField =
    (typeof AUTO_NOTIFICATION_INCLUDE_FIELDS)[number];

export type AutoNotificationContextKey = 'evaluationId' | 'scheduleId' | 'groupId';

export type AutoNotificationTarget =
    | {
        mode: 'users';
        userIds: UUID[];
    }
    | {
        mode: 'role';
        role: ThesisRole;
    }
    | {
        mode: 'group';
        groupId: UUID;
        includeAdviser?: boolean;
    }
    | {
        mode: 'schedule';
        scheduleId: UUID;
        includeStudents?: boolean;
        includePanelists?: boolean;
        includeCreator?: boolean;
    };

export interface AutoNotificationContextSelection {
    evaluationId?: UUID;
    scheduleId?: UUID;
    groupId?: UUID;
}

export interface NotificationAutoDispatchPayload {
    template: AutoNotificationTemplate;
    target: AutoNotificationTarget;
    include: AutoNotificationIncludeField[];
    context?: AutoNotificationContextSelection;
    type?: NotificationType;
}

export interface NotificationAutoDispatchResult {
    items: NotificationRow[];
    count: number;
    resolved: {
        template: AutoNotificationTemplate;
        type: NotificationType;
        targetMode: AutoNotificationTarget['mode'];
        recipientCount: number;
        recipientIds: UUID[];
        include: AutoNotificationIncludeField[];
        context: {
            evaluationId: UUID | null;
            scheduleId: UUID | null;
            groupId: UUID | null;
        };
    };
}

export interface NotificationAutomationOptions {
    templates: Array<{
        value: AutoNotificationTemplate;
        label: string;
        description: string;
        defaultType: NotificationType;
        requiredContext: AutoNotificationContextKey[];
        allowedIncludes: AutoNotificationIncludeField[];
        defaultIncludes: AutoNotificationIncludeField[];
    }>;
    targetModes: Array<{
        value: AutoNotificationTarget['mode'];
        label: string;
        description: string;
    }>;
    includeOptions: Array<{
        value: AutoNotificationIncludeField;
        label: string;
        description: string;
    }>;
    notificationTypes: NotificationType[];
    context: {
        roles: ThesisRole[];
        users: Array<{
            value: UUID;
            label: string;
            role: ThesisRole;
        }>;
        groups: Array<{
            value: UUID;
            label: string;
            program: string | null;
            term: string | null;
        }>;
        schedules: Array<{
            value: UUID;
            label: string;
            scheduledAt: string;
            room: string | null;
            groupId: UUID;
            groupTitle: string | null;
        }>;
        evaluations: Array<{
            value: UUID;
            label: string;
            status: string;
            scheduleId: UUID;
            evaluatorId: UUID;
            evaluatorName: string | null;
        }>;
    };
}

interface AutoTemplateDefinition {
    label: string;
    description: string;
    title: string;
    defaultType: NotificationType;
    requiredContext: AutoNotificationContextKey[];
    allowedIncludes: AutoNotificationIncludeField[];
    defaultIncludes: AutoNotificationIncludeField[];
}

const AUTO_TEMPLATE_DEFINITIONS: Record<
    AutoNotificationTemplate,
    AutoTemplateDefinition
> = {
    evaluation_submitted: {
        label: 'Evaluation Submitted',
        description:
            'Notify recipients when an evaluator submits an evaluation.',
        title: 'Evaluation submitted',
        defaultType: 'evaluation_submitted',
        requiredContext: ['evaluationId'],
        allowedIncludes: [
            'group_title',
            'schedule_datetime',
            'schedule_room',
            'evaluator_name',
            'evaluation_status',
        ],
        defaultIncludes: [
            'group_title',
            'evaluator_name',
            'evaluation_status',
            'schedule_datetime',
        ],
    },
    evaluation_locked: {
        label: 'Evaluation Locked',
        description:
            'Notify recipients when an evaluation is finalized/locked.',
        title: 'Evaluation locked',
        defaultType: 'evaluation_locked',
        requiredContext: ['evaluationId'],
        allowedIncludes: [
            'group_title',
            'schedule_datetime',
            'schedule_room',
            'evaluator_name',
            'evaluation_status',
        ],
        defaultIncludes: [
            'group_title',
            'evaluator_name',
            'evaluation_status',
            'schedule_datetime',
        ],
    },
    defense_schedule_updated: {
        label: 'Defense Schedule Updated',
        description:
            'Notify recipients that defense schedule details were updated.',
        title: 'Defense schedule updated',
        defaultType: 'general',
        requiredContext: ['scheduleId'],
        allowedIncludes: [
            'group_title',
            'schedule_datetime',
            'schedule_room',
            'student_count',
            'program',
            'term',
        ],
        defaultIncludes: ['group_title', 'schedule_datetime', 'schedule_room'],
    },
    general_update: {
        label: 'General Update',
        description:
            'Automatic general update from selected context data only.',
        title: 'New update',
        defaultType: 'general',
        requiredContext: [],
        allowedIncludes: [
            'group_title',
            'schedule_datetime',
            'schedule_room',
            'student_count',
            'program',
            'term',
        ],
        defaultIncludes: ['group_title', 'schedule_datetime'],
    },
};

const AUTO_INCLUDE_LABELS: Record<
    AutoNotificationIncludeField,
    { label: string; description: string }
> = {
    group_title: {
        label: 'Group title',
        description: 'Include thesis group title.',
    },
    schedule_datetime: {
        label: 'Schedule datetime',
        description: 'Include defense date/time.',
    },
    schedule_room: {
        label: 'Schedule room',
        description: 'Include defense room.',
    },
    evaluator_name: {
        label: 'Evaluator name',
        description: 'Include evaluator/panelist name.',
    },
    evaluation_status: {
        label: 'Evaluation status',
        description: 'Include current evaluation status.',
    },
    student_count: {
        label: 'Student count',
        description: 'Include total members in selected group.',
    },
    program: {
        label: 'Program',
        description: 'Include group program.',
    },
    term: {
        label: 'Term',
        description: 'Include group term.',
    },
};

interface ResolvedAutoContext {
    evaluation: {
        id: UUID;
        scheduleId: UUID;
        evaluatorId: UUID;
        status: string;
    } | null;
    schedule: {
        id: UUID;
        groupId: UUID;
        scheduledAt: string;
        room: string | null;
        createdBy: UUID | null;
    } | null;
    group: {
        id: UUID;
        title: string;
        program: string | null;
        term: string | null;
    } | null;
    evaluator: {
        id: UUID;
        name: string;
    } | null;
    studentCount: number | null;
}

export class NotificationController {
    constructor(private readonly services: Services) { }

    /* ------------------------------ PUSH HELPERS ----------------------------- */

    private getPushSubscriptionsService(): PushSubscriptionsServiceLike | null {
        const svc = (this.services as unknown as { push_subscriptions?: unknown })
            .push_subscriptions;

        if (!svc || typeof svc !== 'object') return null;
        return svc as PushSubscriptionsServiceLike;
    }

    private getPushConfig(): {
        enabled: boolean;
        reason?: string;
        subject: string | null;
        publicKey: string | null;
        privateKey: string | null;
        ttl: number;
        urgency: PushUrgency;
    } {
        const enabledFromEnv =
            toBoolean(process.env.PUSH_NOTIFICATIONS_ENABLED ?? 'true') ?? true;
        const subject = toTrimmedString(process.env.VAPID_SUBJECT);
        const publicKey = toTrimmedString(process.env.VAPID_PUBLIC_KEY);
        const privateKey = toTrimmedString(process.env.VAPID_PRIVATE_KEY);

        const ttlRaw = toInteger(process.env.PUSH_TTL_SECONDS ?? '60');
        const ttl = ttlRaw && ttlRaw > 0 ? ttlRaw : 60;

        const urgencyRaw = toTrimmedString(process.env.PUSH_URGENCY)?.toLowerCase();
        const urgency: PushUrgency =
            urgencyRaw === 'very-low' ||
                urgencyRaw === 'low' ||
                urgencyRaw === 'normal' ||
                urgencyRaw === 'high'
                ? urgencyRaw
                : 'normal';

        if (!enabledFromEnv) {
            return {
                enabled: false,
                reason: 'Push notifications are disabled by PUSH_NOTIFICATIONS_ENABLED.',
                subject,
                publicKey,
                privateKey,
                ttl,
                urgency,
            };
        }

        if (!subject || !publicKey || !privateKey) {
            return {
                enabled: false,
                reason:
                    'Missing VAPID config. Set VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.',
                subject,
                publicKey,
                privateKey,
                ttl,
                urgency,
            };
        }

        const normalizedSubject = subject.toLowerCase();
        if (
            !normalizedSubject.startsWith('mailto:') &&
            !normalizedSubject.startsWith('https://')
        ) {
            return {
                enabled: false,
                reason: 'VAPID_SUBJECT must start with "mailto:" or "https://".',
                subject,
                publicKey,
                privateKey,
                ttl,
                urgency,
            };
        }

        return {
            enabled: true,
            subject,
            publicKey,
            privateKey,
            ttl,
            urgency,
        };
    }

    private ensureWebPushConfigured(): {
        enabled: boolean;
        publicKey: string | null;
        reason?: string;
        ttl?: number;
        urgency?: PushUrgency;
    } {
        const cfg = this.getPushConfig();
        if (!cfg.enabled || !cfg.subject || !cfg.publicKey || !cfg.privateKey) {
            return {
                enabled: false,
                publicKey: cfg.publicKey,
                reason: cfg.reason,
            };
        }

        const signature = `${cfg.subject}|${cfg.publicKey}|${cfg.privateKey}`;
        if (webPushConfiguredSignature !== signature) {
            webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
            webPushConfiguredSignature = signature;
        }

        return {
            enabled: true,
            publicKey: cfg.publicKey,
            ttl: cfg.ttl,
            urgency: cfg.urgency,
        };
    }

    private readUuid(value: unknown): UUID | null {
        const str = toTrimmedString(value);
        if (!str || !UUID_RE.test(str)) return null;
        return str as UUID;
    }

    private parseWebPushSubscription(value: unknown): WebPushSubscriptionPayload | null {
        if (!isRecord(value)) return null;

        const endpoint = toTrimmedString(value.endpoint);
        const keys = isRecord(value.keys) ? value.keys : null;
        const p256dh = toTrimmedString(keys?.p256dh);
        const auth = toTrimmedString(keys?.auth);

        if (!endpoint || !p256dh || !auth) return null;

        const expirationTime =
            typeof value.expirationTime === 'number' && Number.isFinite(value.expirationTime)
                ? value.expirationTime
                : value.expirationTime === null
                    ? null
                    : undefined;

        const contentEncoding =
            toTrimmedString(value.contentEncoding ?? value.content_encoding) ?? undefined;

        return {
            endpoint,
            keys: { p256dh, auth },
            expirationTime,
            contentEncoding,
        };
    }

    private normalizeStoredPushSubscription(raw: unknown): StoredPushSubscription | null {
        if (!isRecord(raw)) return null;

        const subscriptionNode = isRecord(raw.subscription)
            ? raw.subscription
            : raw;

        const parsed = this.parseWebPushSubscription(subscriptionNode);
        if (!parsed) return null;

        const userId = this.readUuid(raw.user_id ?? raw.userId);
        if (!userId) return null;

        const id = toTrimmedString(raw.id ?? raw.subscription_id) ?? null;
        const contentEncoding =
            toTrimmedString(raw.content_encoding ?? raw.contentEncoding) ??
            parsed.contentEncoding ??
            null;

        const rawJson: JsonObject = {
            endpoint: parsed.endpoint,
            keys: {
                p256dh: parsed.keys.p256dh,
                auth: parsed.keys.auth,
            },
            expirationTime:
                parsed.expirationTime === undefined ? null : parsed.expirationTime,
        };

        return {
            id,
            userId,
            endpoint: parsed.endpoint,
            p256dh: parsed.keys.p256dh,
            auth: parsed.keys.auth,
            contentEncoding,
            raw: rawJson,
        };
    }

    private async findPushSubscriptionByEndpoint(
        endpoint: string,
    ): Promise<StoredPushSubscription | null> {
        const svc = this.getPushSubscriptionsService();
        if (!svc) return null;

        if (typeof svc.findByEndpoint === 'function') {
            const found = await svc.findByEndpoint(endpoint);
            return this.normalizeStoredPushSubscription(found);
        }

        if (typeof svc.findMany === 'function') {
            const rows = await svc.findMany({
                where: { endpoint },
                limit: 1,
            });
            const first = Array.isArray(rows) ? rows[0] : null;
            return this.normalizeStoredPushSubscription(first);
        }

        return null;
    }

    private async listPushSubscriptionsByUsers(
        userIds: UUID[],
    ): Promise<StoredPushSubscription[]> {
        const svc = this.getPushSubscriptionsService();
        if (!svc) return [];

        const ids = unique(userIds);
        if (ids.length === 0) return [];

        const out: StoredPushSubscription[] = [];

        if (typeof svc.listByUsers === 'function') {
            const rows = await svc.listByUsers(ids);
            for (const row of rows) {
                const parsed = this.normalizeStoredPushSubscription(row);
                if (parsed && ids.includes(parsed.userId)) out.push(parsed);
            }
            return unique(out.map((s) => `${s.userId}:${s.endpoint}`))
                .map((key) => {
                    const found = out.find((s) => `${s.userId}:${s.endpoint}` === key);
                    return found!;
                });
        }

        if (typeof svc.listByUser === 'function') {
            const chunks = await Promise.all(ids.map((id) => svc.listByUser!(id)));
            for (const chunk of chunks) {
                for (const row of chunk) {
                    const parsed = this.normalizeStoredPushSubscription(row);
                    if (parsed && ids.includes(parsed.userId)) out.push(parsed);
                }
            }

            return unique(out.map((s) => `${s.userId}:${s.endpoint}`))
                .map((key) => {
                    const found = out.find((s) => `${s.userId}:${s.endpoint}` === key);
                    return found!;
                });
        }

        if (typeof svc.findMany === 'function') {
            const chunks = await Promise.all(
                ids.map((id) =>
                    svc.findMany!({
                        where: { user_id: id },
                        limit: 1000,
                        orderBy: 'updated_at',
                        orderDirection: 'desc',
                    }),
                ),
            );

            for (const chunk of chunks) {
                for (const row of chunk) {
                    const parsed = this.normalizeStoredPushSubscription(row);
                    if (parsed && ids.includes(parsed.userId)) out.push(parsed);
                }
            }

            return unique(out.map((s) => `${s.userId}:${s.endpoint}`))
                .map((key) => {
                    const found = out.find((s) => `${s.userId}:${s.endpoint}` === key);
                    return found!;
                });
        }

        return [];
    }

    private async removeSubscriptionByEndpoint(
        endpoint: string,
        userId?: UUID,
    ): Promise<number> {
        const svc = this.getPushSubscriptionsService();
        if (!svc) return 0;

        if (typeof svc.deleteByEndpoint === 'function' && !userId) {
            return svc.deleteByEndpoint(endpoint);
        }

        if (typeof svc.delete === 'function') {
            if (userId) {
                return svc.delete({ endpoint, user_id: userId });
            }
            return svc.delete({ endpoint });
        }

        return 0;
    }

    private buildPushPayloadString(payload: NotificationBroadcastPayload): string {
        const title = toTrimmedString(payload.title) ?? 'New notification';
        const body = toTrimmedString(payload.body) ?? 'You have a new update.';
        const type = toTrimmedString(payload.type) ?? 'general';
        const data = isRecord(payload.data) ? payload.data : {};

        return safeJsonStringify({
            title,
            body,
            type,
            data,
            createdAt: new Date().toISOString(),
        });
    }

    private async trySendPush(
        userIds: UUID[],
        payload: NotificationBroadcastPayload,
    ): Promise<void> {
        try {
            await this.sendPushToUsers(userIds, payload);
        } catch {
            // Intentionally swallow push errors so DB notifications still succeed.
        }
    }

    /* -------------------------------- PUSH API ------------------------------ */

    async getPushPublicKey(): Promise<PushPublicKeyInfo> {
        const cfg = this.ensureWebPushConfigured();
        if (!cfg.enabled) {
            return {
                enabled: false,
                publicKey: cfg.publicKey,
                reason: cfg.reason,
            };
        }

        return {
            enabled: true,
            publicKey: cfg.publicKey,
        };
    }

    async registerPushSubscription(
        input: Record<string, unknown>,
    ): Promise<PushSubscriptionMutationResult> {
        const svc = this.getPushSubscriptionsService();
        if (!svc) {
            throw new Error(
                'push_subscriptions service is not configured in DatabaseServices.',
            );
        }

        const userId = this.readUuid(input.userId ?? input.user_id);
        if (!userId) {
            throw new Error('userId is required and must be a valid UUID.');
        }

        const user = await this.services.users.findById(userId);
        if (!user) {
            throw new Error('User not found.');
        }

        const subscription = this.parseWebPushSubscription(
            input.subscription ??
            input.pushSubscription ??
            input.push_subscription ??
            input,
        );

        if (!subscription) {
            throw new Error(
                'subscription is required with endpoint and keys { p256dh, auth }.',
            );
        }

        const existing = await this.findPushSubscriptionByEndpoint(subscription.endpoint);

        const persistPayload: Record<string, unknown> = {
            user_id: userId,
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            content_encoding: subscription.contentEncoding ?? 'aes128gcm',
            subscription: {
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.keys.p256dh,
                    auth: subscription.keys.auth,
                },
                expirationTime:
                    subscription.expirationTime === undefined
                        ? null
                        : subscription.expirationTime,
            },
            updated_at: new Date().toISOString(),
        };

        let created = false;
        let updated = false;
        let storedRaw: unknown = null;

        if (existing) {
            if (typeof svc.updateOne === 'function') {
                storedRaw = await svc.updateOne(
                    existing.id ? { id: existing.id } : { endpoint: existing.endpoint },
                    persistPayload,
                );
                updated = true;
            } else if (typeof svc.deleteByEndpoint === 'function' && typeof svc.create === 'function') {
                await svc.deleteByEndpoint(existing.endpoint);
                storedRaw = await svc.create(persistPayload);
                created = true;
            } else {
                throw new Error(
                    'push_subscriptions service must support updateOne(...) or deleteByEndpoint(...) + create(...).',
                );
            }
        } else {
            if (typeof svc.create !== 'function') {
                throw new Error('push_subscriptions service is missing create(...) method.');
            }

            storedRaw = await svc.create(persistPayload);
            created = true;
        }

        const normalized =
            this.normalizeStoredPushSubscription(storedRaw) ??
            ({
                id: null,
                userId,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                contentEncoding: subscription.contentEncoding ?? 'aes128gcm',
                raw: {
                    endpoint: subscription.endpoint,
                    keys: {
                        p256dh: subscription.keys.p256dh,
                        auth: subscription.keys.auth,
                    },
                    expirationTime:
                        subscription.expirationTime === undefined
                            ? null
                            : subscription.expirationTime,
                },
            } satisfies StoredPushSubscription);

        return {
            item: {
                id: normalized.id,
                userId: normalized.userId,
                endpoint: normalized.endpoint,
                contentEncoding: normalized.contentEncoding,
            },
            created,
            updated,
        };
    }

    async unregisterPushSubscription(
        input: Record<string, unknown>,
    ): Promise<PushUnsubscribeResult> {
        const svc = this.getPushSubscriptionsService();
        if (!svc) {
            throw new Error(
                'push_subscriptions service is not configured in DatabaseServices.',
            );
        }

        const userId = this.readUuid(input.userId ?? input.user_id);
        const endpoint =
            toTrimmedString(input.endpoint) ??
            toTrimmedString(
                (isRecord(input.subscription) ? input.subscription.endpoint : undefined),
            );

        if (!endpoint && !userId) {
            throw new Error('Provide endpoint or userId to unsubscribe.');
        }

        let deleted = 0;

        if (endpoint) {
            deleted += await this.removeSubscriptionByEndpoint(endpoint, userId ?? undefined);
            return { deleted };
        }

        // remove all subscriptions for the user
        if (userId) {
            const rows = await this.listPushSubscriptionsByUsers([userId]);
            for (const row of rows) {
                deleted += await this.removeSubscriptionByEndpoint(row.endpoint, userId);
            }
        }

        return { deleted };
    }

    async sendPushToUsers(
        userIds: UUID[],
        payload: NotificationBroadcastPayload,
    ): Promise<PushDispatchResult> {
        const uniqueUserIds = unique(userIds);
        if (uniqueUserIds.length === 0) {
            return {
                enabled: false,
                reason: 'No userIds provided.',
                totalSubscriptions: 0,
                sent: 0,
                failed: 0,
                removed: 0,
            };
        }

        const cfg = this.ensureWebPushConfigured();
        if (!cfg.enabled) {
            return {
                enabled: false,
                reason: cfg.reason ?? 'Push is not configured.',
                totalSubscriptions: 0,
                sent: 0,
                failed: 0,
                removed: 0,
            };
        }

        const subscriptions = await this.listPushSubscriptionsByUsers(uniqueUserIds);
        if (subscriptions.length === 0) {
            return {
                enabled: true,
                totalSubscriptions: 0,
                sent: 0,
                failed: 0,
                removed: 0,
            };
        }

        const pushPayload = this.buildPushPayloadString(payload);
        const options: Record<string, unknown> = {
            TTL: cfg.ttl ?? 60,
            urgency: cfg.urgency ?? 'normal',
        };

        const rawTopic = isRecord(payload.data)
            ? toTrimmedString(payload.data.topic)
            : null;
        if (rawTopic && rawTopic.length <= 32) {
            options.topic = rawTopic;
        }

        const results = await Promise.all(
            subscriptions.map(async (sub) => {
                try {
                    const response = await webpush.sendNotification(
                        {
                            endpoint: sub.endpoint,
                            keys: {
                                p256dh: sub.p256dh,
                                auth: sub.auth,
                            },
                            expirationTime: null,
                            contentEncoding: sub.contentEncoding ?? 'aes128gcm',
                        },
                        pushPayload,
                        options,
                    );

                    const statusCode =
                        typeof response?.statusCode === 'number'
                            ? response.statusCode
                            : 200;

                    // Non-2xx from provider still treated as failure and clean stale if needed.
                    if (statusCode < 200 || statusCode >= 300) {
                        if (statusCode === 404 || statusCode === 410) {
                            const removed = await this.removeSubscriptionByEndpoint(
                                sub.endpoint,
                                sub.userId,
                            );
                            return { sent: 0, failed: 1, removed: removed > 0 ? 1 : 0 };
                        }
                        return { sent: 0, failed: 1, removed: 0 };
                    }

                    return { sent: 1, failed: 0, removed: 0 };
                } catch (error) {
                    const statusCode =
                        isRecord(error) && typeof error.statusCode === 'number'
                            ? error.statusCode
                            : null;

                    if (statusCode === 404 || statusCode === 410) {
                        const removed = await this.removeSubscriptionByEndpoint(
                            sub.endpoint,
                            sub.userId,
                        );
                        return { sent: 0, failed: 1, removed: removed > 0 ? 1 : 0 };
                    }

                    return { sent: 0, failed: 1, removed: 0 };
                }
            }),
        );

        return results.reduce<PushDispatchResult>(
            (acc, r) => {
                acc.sent += r.sent;
                acc.failed += r.failed;
                acc.removed += r.removed;
                return acc;
            },
            {
                enabled: true,
                totalSubscriptions: subscriptions.length,
                sent: 0,
                failed: 0,
                removed: 0,
            },
        );
    }

    /* --------------------------------- CREATE -------------------------------- */

    async create(payload: NotificationInsert): Promise<NotificationRow> {
        const item = await this.services.notifications.create(payload);

        const userId = toTrimmedString(
            (item as unknown as Record<string, unknown>).user_id ??
            (payload as unknown as Record<string, unknown>).user_id,
        );

        if (userId && UUID_RE.test(userId)) {
            await this.trySendPush([userId as UUID], {
                type: item.type,
                title: item.title,
                body: item.body,
                data: isRecord(item.data) ? (item.data as JsonObject) : {},
            });
        }

        return item;
    }

    async broadcast(
        userIds: UUID[],
        payload: NotificationBroadcastPayload,
    ): Promise<NotificationRow[]> {
        if (userIds.length === 0) return [];
        const items = await this.services.notifications.createForUsers(userIds, payload);

        await this.trySendPush(userIds, payload);
        return items;
    }

    /* ---------------------------------- READ --------------------------------- */

    async getById(id: UUID): Promise<NotificationRow | null> {
        return this.services.notifications.findById(id);
    }

    async getAllByUser(
        userId: UUID,
        query: ListUserNotificationsQuery = {},
    ): Promise<NotificationRow[]> {
        return this.services.notifications.listByUser(userId, query);
    }

    async getUnread(userId: UUID, limit = 50): Promise<NotificationRow[]> {
        return this.services.notifications.listUnread(userId, limit);
    }

    async getByType(
        userId: UUID,
        type: NotificationType,
        query: ListUserNotificationsQuery = {},
    ): Promise<NotificationRow[]> {
        return this.services.notifications.listByType(userId, type, query);
    }

    /* --------------------------------- UPDATE -------------------------------- */

    async update(id: UUID, patch: NotificationPatch): Promise<NotificationRow | null> {
        const cleanPatch = stripUndefined(patch) as NotificationPatch;
        if (Object.keys(cleanPatch).length === 0) {
            return this.services.notifications.findById(id);
        }
        return this.services.notifications.updateOne({ id }, cleanPatch);
    }

    async markAsRead(id: UUID, readAt?: string): Promise<NotificationRow | null> {
        return this.services.notifications.markAsRead(id, readAt);
    }

    async markAllAsRead(userId: UUID, readAt?: string): Promise<number> {
        return this.services.notifications.markAllAsRead(userId, readAt);
    }

    /* --------------------------------- DELETE -------------------------------- */

    async delete(id: UUID): Promise<number> {
        return this.services.notifications.delete({ id });
    }

    /* --------------------------- Automatic functions -------------------------- */

    async getAutomationOptions(limit = 30): Promise<NotificationAutomationOptions> {
        const safeLimit = Number.isFinite(limit)
            ? Math.max(1, Math.min(Math.trunc(limit), 100))
            : 30;

        const [users, groups, schedules, evaluations] = await Promise.all([
            this.services.users.findMany({
                where: { status: 'active' },
                limit: safeLimit,
                orderBy: 'name',
                orderDirection: 'asc',
            }),
            this.services.thesis_groups.findMany({
                limit: safeLimit,
                orderBy: 'updated_at',
                orderDirection: 'desc',
            }),
            this.services.defense_schedules.findMany({
                limit: safeLimit,
                orderBy: 'scheduled_at',
                orderDirection: 'desc',
            }),
            this.services.evaluations.findMany({
                limit: safeLimit,
                orderBy: 'created_at',
                orderDirection: 'desc',
            }),
        ]);

        const scheduleIds = unique(evaluations.map((e) => e.schedule_id));
        const evaluatorIds = unique(evaluations.map((e) => e.evaluator_id));
        const groupIdsFromSchedules = unique(schedules.map((s) => s.group_id));

        const [scheduleRows, evaluatorRows, extraGroups] = await Promise.all([
            Promise.all(
                scheduleIds.map(async (id) => ({
                    id,
                    row: await this.services.defense_schedules.findById(id),
                })),
            ),
            Promise.all(
                evaluatorIds.map(async (id) => ({
                    id,
                    row: await this.services.users.findById(id),
                })),
            ),
            Promise.all(
                groupIdsFromSchedules.map(async (id) => ({
                    id,
                    row: await this.services.thesis_groups.findById(id),
                })),
            ),
        ]);

        const scheduleMap = new Map<UUID, { group_id: UUID; scheduled_at: string }>();
        for (const item of scheduleRows) {
            if (item.row) {
                scheduleMap.set(item.id as UUID, {
                    group_id: item.row.group_id,
                    scheduled_at: item.row.scheduled_at,
                });
            }
        }

        const evaluatorNameMap = new Map<UUID, string>();
        for (const item of evaluatorRows) {
            if (item.row?.name) {
                evaluatorNameMap.set(item.id as UUID, item.row.name);
            }
        }

        const groupTitleMap = new Map<UUID, string>();
        for (const group of groups) {
            groupTitleMap.set(group.id, group.title);
        }
        for (const item of extraGroups) {
            if (item.row) {
                groupTitleMap.set(item.id as UUID, item.row.title);
            }
        }

        const templates = AUTO_NOTIFICATION_TEMPLATES.map((template) => {
            const def = AUTO_TEMPLATE_DEFINITIONS[template];
            return {
                value: template,
                label: def.label,
                description: def.description,
                defaultType: def.defaultType,
                requiredContext: def.requiredContext,
                allowedIncludes: [...def.allowedIncludes],
                defaultIncludes: [...def.defaultIncludes],
            };
        });

        const includeOptions = AUTO_NOTIFICATION_INCLUDE_FIELDS.map((field) => ({
            value: field,
            label: AUTO_INCLUDE_LABELS[field].label,
            description: AUTO_INCLUDE_LABELS[field].description,
        }));

        return {
            templates,
            targetModes: [
                {
                    value: 'users',
                    label: 'Specific users',
                    description: 'Choose one or more specific users.',
                },
                {
                    value: 'role',
                    label: 'By role',
                    description: 'Send to all active users of selected role.',
                },
                {
                    value: 'group',
                    label: 'By thesis group',
                    description: 'Send to students in selected group.',
                },
                {
                    value: 'schedule',
                    label: 'By defense schedule',
                    description:
                        'Send to recipients linked to selected defense schedule.',
                },
            ],
            includeOptions,
            notificationTypes: [...NOTIFICATION_TYPES],
            context: {
                roles: [...THESIS_ROLES],
                users: users.map((user) => ({
                    value: user.id,
                    label: user.name,
                    role: user.role,
                })),
                groups: groups.map((group) => ({
                    value: group.id,
                    label: group.title,
                    program: group.program,
                    term: group.term,
                })),
                schedules: schedules.map((schedule) => ({
                    value: schedule.id,
                    label:
                        `Schedule ${schedule.id.slice(0, 8)} • ${schedule.scheduled_at}` +
                        (schedule.room ? ` • ${schedule.room}` : ''),
                    scheduledAt: schedule.scheduled_at,
                    room: schedule.room,
                    groupId: schedule.group_id,
                    groupTitle: groupTitleMap.get(schedule.group_id) ?? null,
                })),
                evaluations: evaluations.map((evaluation) => {
                    const schedule = scheduleMap.get(evaluation.schedule_id);
                    const evaluatorName =
                        evaluatorNameMap.get(evaluation.evaluator_id) ?? null;

                    return {
                        value: evaluation.id,
                        label:
                            `Evaluation ${evaluation.id.slice(0, 8)} • ${evaluation.status}` +
                            (evaluatorName ? ` • ${evaluatorName}` : '') +
                            (schedule?.scheduled_at ? ` • ${schedule.scheduled_at}` : ''),
                        status: evaluation.status,
                        scheduleId: evaluation.schedule_id,
                        evaluatorId: evaluation.evaluator_id,
                        evaluatorName,
                    };
                }),
            },
        };
    }

    async dispatchAutomaticFromSelection(
        input: Record<string, unknown>,
    ): Promise<NotificationAutoDispatchResult> {
        const payload = this.parseAutoDispatchPayload(input);
        return this.sendAutomatic(payload);
    }

    async sendAutomatic(
        payload: NotificationAutoDispatchPayload,
    ): Promise<NotificationAutoDispatchResult> {
        const recipientIds = await this.resolveRecipientUserIds(payload.target);

        if (recipientIds.length === 0) {
            return {
                items: [],
                count: 0,
                resolved: {
                    template: payload.template,
                    type:
                        payload.type ??
                        AUTO_TEMPLATE_DEFINITIONS[payload.template].defaultType,
                    targetMode: payload.target.mode,
                    recipientCount: 0,
                    recipientIds: [],
                    include: payload.include,
                    context: {
                        evaluationId: payload.context?.evaluationId ?? null,
                        scheduleId: payload.context?.scheduleId ?? null,
                        groupId: payload.context?.groupId ?? null,
                    },
                },
            };
        }

        const context = await this.resolveAutoContext(payload);
        const message = this.composeAutomaticNotificationPayload(payload, context);
        const items = await this.broadcast(recipientIds, message);

        return {
            items,
            count: items.length,
            resolved: {
                template: payload.template,
                type: message.type ?? AUTO_TEMPLATE_DEFINITIONS[payload.template].defaultType,
                targetMode: payload.target.mode,
                recipientCount: recipientIds.length,
                recipientIds,
                include: payload.include,
                context: {
                    evaluationId: context.evaluation?.id ?? null,
                    scheduleId: context.schedule?.id ?? null,
                    groupId: context.group?.id ?? null,
                },
            },
        };
    }

    private parseAutoDispatchPayload(
        input: Record<string, unknown>,
    ): NotificationAutoDispatchPayload {
        const template = this.toAutoTemplate(input.template);
        if (!template) {
            throw new Error(
                `Invalid template. Allowed: ${AUTO_NOTIFICATION_TEMPLATES.join(', ')}`,
            );
        }

        const target = this.parseAutoTarget(input);
        const include = this.parseIncludeFields(input.include, template);
        const type = this.toNotificationType(input.type) ?? undefined;

        const contextNode = isRecord(input.context) ? input.context : {};
        const evaluationId = this.readUuid(
            contextNode.evaluationId ?? contextNode.evaluation_id ?? input.evaluationId,
        );
        const scheduleId = this.readUuid(
            contextNode.scheduleId ?? contextNode.schedule_id ?? input.scheduleId,
        );
        const groupId = this.readUuid(
            contextNode.groupId ?? contextNode.group_id ?? input.groupId,
        );

        const context: AutoNotificationContextSelection | undefined =
            evaluationId || scheduleId || groupId
                ? {
                    evaluationId: evaluationId ?? undefined,
                    scheduleId: scheduleId ?? undefined,
                    groupId: groupId ?? undefined,
                }
                : undefined;

        return {
            template,
            target,
            include,
            context,
            type,
        };
    }

    private parseAutoTarget(input: Record<string, unknown>): AutoNotificationTarget {
        const targetNode = isRecord(input.target) ? input.target : {};

        const modeRaw =
            toTrimmedString(targetNode.mode) ??
            toTrimmedString(input.targetMode) ??
            toTrimmedString(input.audience);

        const mode = this.toTargetMode(modeRaw);
        if (!mode) {
            throw new Error(
                'targetMode is required. Allowed: users, role, group, schedule.',
            );
        }

        if (mode === 'users') {
            const targetNodeIds = toUuidArray(targetNode.userIds ?? targetNode.user_ids);
            const rootIds = toUuidArray(input.userIds);
            const userIds = targetNodeIds.length > 0 ? targetNodeIds : rootIds;

            if (userIds.length === 0) {
                throw new Error('For targetMode "users", userIds must be a non-empty UUID array.');
            }

            return {
                mode: 'users',
                userIds,
            };
        }

        if (mode === 'role') {
            const role = this.toRole(targetNode.role ?? input.role);
            if (!role) {
                throw new Error(`For targetMode "role", role is required. Allowed: ${THESIS_ROLES.join(', ')}.`);
            }
            return {
                mode: 'role',
                role,
            };
        }

        if (mode === 'group') {
            const groupId = this.readUuid(
                targetNode.groupId ??
                targetNode.group_id ??
                input.groupId ??
                input.group_id,
            );

            if (!groupId) {
                throw new Error('For targetMode "group", groupId must be a valid UUID.');
            }

            const includeAdviser = toBoolean(
                targetNode.includeAdviser ??
                targetNode.include_adviser ??
                input.includeAdviser,
            );

            return {
                mode: 'group',
                groupId,
                includeAdviser,
            };
        }

        const scheduleId = this.readUuid(
            targetNode.scheduleId ??
            targetNode.schedule_id ??
            input.scheduleId ??
            input.schedule_id,
        );

        if (!scheduleId) {
            throw new Error('For targetMode "schedule", scheduleId must be a valid UUID.');
        }

        return {
            mode: 'schedule',
            scheduleId,
            includeStudents:
                toBoolean(targetNode.includeStudents ?? targetNode.include_students) ??
                toBoolean(input.includeStudents) ??
                true,
            includePanelists:
                toBoolean(targetNode.includePanelists ?? targetNode.include_panelists) ??
                toBoolean(input.includePanelists) ??
                false,
            includeCreator:
                toBoolean(targetNode.includeCreator ?? targetNode.include_creator) ??
                toBoolean(input.includeCreator) ??
                false,
        };
    }

    private parseIncludeFields(
        value: unknown,
        template: AutoNotificationTemplate,
    ): AutoNotificationIncludeField[] {
        const definition = AUTO_TEMPLATE_DEFINITIONS[template];
        const allowed = new Set<AutoNotificationIncludeField>(definition.allowedIncludes);

        if (!Array.isArray(value) || value.length === 0) {
            return [...definition.defaultIncludes];
        }

        const include = unique(
            value
                .map((item) => this.toIncludeField(item))
                .filter((item): item is AutoNotificationIncludeField => !!item)
                .filter((item) => allowed.has(item)),
        );

        if (include.length === 0) {
            return [...definition.defaultIncludes];
        }

        return include;
    }

    private async resolveRecipientUserIds(
        target: AutoNotificationTarget,
    ): Promise<UUID[]> {
        if (target.mode === 'users') {
            return unique(target.userIds);
        }

        if (target.mode === 'role') {
            const users = await this.services.users.listByRole(target.role, {
                limit: 10000,
                orderBy: 'name',
                orderDirection: 'asc',
            });
            return unique(
                users.filter((u) => u.status === 'active').map((u) => u.id),
            );
        }

        if (target.mode === 'group') {
            const members = await this.services.group_members.listByGroup(target.groupId);
            const recipientIds = members.map((member) => member.student_id);

            if (target.includeAdviser) {
                const group = await this.services.thesis_groups.findById(target.groupId);
                if (group?.adviser_id) recipientIds.push(group.adviser_id);
            }

            return unique(recipientIds);
        }

        const schedule = await this.services.defense_schedules.findById(target.scheduleId);
        if (!schedule) {
            throw new Error('Selected schedule was not found.');
        }

        const recipientIds: UUID[] = [];

        if (target.includeStudents ?? true) {
            const members = await this.services.group_members.listByGroup(schedule.group_id);
            recipientIds.push(...members.map((member) => member.student_id));
        }

        if (target.includePanelists) {
            const panelists = await this.services.schedule_panelists.listBySchedule(
                target.scheduleId,
            );
            recipientIds.push(...panelists.map((panelist) => panelist.staff_id));
        }

        if (target.includeCreator && schedule.created_by) {
            recipientIds.push(schedule.created_by);
        }

        return unique(recipientIds);
    }

    private async resolveAutoContext(
        payload: NotificationAutoDispatchPayload,
    ): Promise<ResolvedAutoContext> {
        const include = new Set<AutoNotificationIncludeField>(payload.include);
        const required = AUTO_TEMPLATE_DEFINITIONS[payload.template].requiredContext;

        let evaluationId = payload.context?.evaluationId ?? null;
        let scheduleId = payload.context?.scheduleId ?? null;
        let groupId = payload.context?.groupId ?? null;

        if (payload.target.mode === 'schedule' && !scheduleId) {
            scheduleId = payload.target.scheduleId;
        }

        if (payload.target.mode === 'group' && !groupId) {
            groupId = payload.target.groupId;
        }

        const context: ResolvedAutoContext = {
            evaluation: null,
            schedule: null,
            group: null,
            evaluator: null,
            studentCount: null,
        };

        if (evaluationId) {
            const evaluation = await this.services.evaluations.findById(evaluationId);
            if (!evaluation) {
                throw new Error('Selected evaluation was not found.');
            }

            context.evaluation = {
                id: evaluation.id,
                scheduleId: evaluation.schedule_id,
                evaluatorId: evaluation.evaluator_id,
                status: evaluation.status,
            };

            if (!scheduleId) scheduleId = evaluation.schedule_id;
        }

        if (scheduleId) {
            const schedule = await this.services.defense_schedules.findById(scheduleId);
            if (!schedule) {
                throw new Error('Selected schedule was not found.');
            }

            context.schedule = {
                id: schedule.id,
                groupId: schedule.group_id,
                scheduledAt: schedule.scheduled_at,
                room: schedule.room,
                createdBy: schedule.created_by,
            };

            if (!groupId) groupId = schedule.group_id;
        }

        if (groupId) {
            const group = await this.services.thesis_groups.findById(groupId);
            if (!group) {
                throw new Error('Selected group was not found.');
            }

            context.group = {
                id: group.id,
                title: group.title,
                program: group.program,
                term: group.term,
            };

            if (include.has('student_count')) {
                const members = await this.services.group_members.listByGroup(group.id);
                context.studentCount = members.length;
            }
        }

        if (context.evaluation) {
            const evaluator = await this.services.users.findById(context.evaluation.evaluatorId);
            if (evaluator) {
                context.evaluator = {
                    id: evaluator.id,
                    name: evaluator.name,
                };
            }
        }

        for (const requiredKey of required) {
            if (requiredKey === 'evaluationId' && !context.evaluation) {
                throw new Error('template requires evaluationId context.');
            }
            if (requiredKey === 'scheduleId' && !context.schedule) {
                throw new Error('template requires scheduleId context.');
            }
            if (requiredKey === 'groupId' && !context.group) {
                throw new Error('template requires groupId context.');
            }
        }

        return context;
    }

    private composeAutomaticNotificationPayload(
        payload: NotificationAutoDispatchPayload,
        context: ResolvedAutoContext,
    ): NotificationBroadcastPayload {
        const definition = AUTO_TEMPLATE_DEFINITIONS[payload.template];
        const include = new Set<AutoNotificationIncludeField>(payload.include);

        let lead: string;
        if (payload.template === 'evaluation_submitted') {
            const actor = context.evaluator?.name ?? 'An evaluator';
            lead = `${actor} submitted an evaluation.`;
        } else if (payload.template === 'evaluation_locked') {
            const actor = context.evaluator?.name ?? 'An evaluator';
            lead = `${actor} locked an evaluation.`;
        } else if (payload.template === 'defense_schedule_updated') {
            lead = 'Defense schedule details were updated.';
        } else {
            lead = 'There is a new update available.';
        }

        const details: string[] = [];

        if (include.has('group_title') && context.group?.title) {
            details.push(`Group: ${context.group.title}`);
        }

        if (include.has('schedule_datetime') && context.schedule?.scheduledAt) {
            details.push(`Schedule: ${context.schedule.scheduledAt}`);
        }

        if (include.has('schedule_room') && context.schedule?.room) {
            details.push(`Room: ${context.schedule.room}`);
        }

        if (include.has('evaluator_name') && context.evaluator?.name) {
            details.push(`Evaluator: ${context.evaluator.name}`);
        }

        if (include.has('evaluation_status') && context.evaluation?.status) {
            details.push(`Status: ${context.evaluation.status}`);
        }

        if (
            include.has('student_count') &&
            typeof context.studentCount === 'number'
        ) {
            details.push(`Students: ${context.studentCount}`);
        }

        if (include.has('program') && context.group?.program) {
            details.push(`Program: ${context.group.program}`);
        }

        if (include.has('term') && context.group?.term) {
            details.push(`Term: ${context.group.term}`);
        }

        const body = details.length > 0 ? `${lead} ${details.join(' • ')}` : lead;

        const automationData: JsonObject = {
            template: payload.template,
            target_mode: payload.target.mode,
            include: [...payload.include],
        };

        const contextData: JsonObject = {};
        if (context.evaluation?.id) contextData.evaluation_id = context.evaluation.id;
        if (context.schedule?.id) contextData.schedule_id = context.schedule.id;
        if (context.group?.id) contextData.group_id = context.group.id;

        const detailsData: JsonObject = {};
        if (context.group?.title) detailsData.group_title = context.group.title;
        if (context.schedule?.scheduledAt) {
            detailsData.schedule_datetime = context.schedule.scheduledAt;
        }
        if (context.schedule?.room) detailsData.schedule_room = context.schedule.room;
        if (context.evaluator?.name) detailsData.evaluator_name = context.evaluator.name;
        if (context.evaluation?.status) {
            detailsData.evaluation_status = context.evaluation.status;
        }
        if (typeof context.studentCount === 'number') {
            detailsData.student_count = context.studentCount;
        }
        if (context.group?.program) detailsData.program = context.group.program;
        if (context.group?.term) detailsData.term = context.group.term;

        const data: JsonObject = {
            automation: automationData,
        };

        if (Object.keys(contextData).length > 0) {
            data.context = contextData;
        }

        if (Object.keys(detailsData).length > 0) {
            data.details = detailsData;
        }

        return {
            type: payload.type ?? definition.defaultType,
            title: definition.title,
            body,
            data,
        };
    }

    private toAutoTemplate(value: unknown): AutoNotificationTemplate | null {
        const str = toTrimmedString(value);
        if (!str) return null;
        return (AUTO_NOTIFICATION_TEMPLATES as readonly string[]).includes(str)
            ? (str as AutoNotificationTemplate)
            : null;
    }

    private toIncludeField(value: unknown): AutoNotificationIncludeField | null {
        const str = toTrimmedString(value);
        if (!str) return null;
        return (AUTO_NOTIFICATION_INCLUDE_FIELDS as readonly string[]).includes(str)
            ? (str as AutoNotificationIncludeField)
            : null;
    }

    private toRole(value: unknown): ThesisRole | null {
        const str = toTrimmedString(value);
        if (!str) return null;
        return (THESIS_ROLES as readonly string[]).includes(str)
            ? (str as ThesisRole)
            : null;
    }

    private toNotificationType(value: unknown): NotificationType | null {
        const str = toTrimmedString(value);
        if (!str) return null;
        return (NOTIFICATION_TYPES as readonly string[]).includes(str)
            ? (str as NotificationType)
            : null;
    }

    private toTargetMode(value: string | null):
        | AutoNotificationTarget['mode']
        | null {
        if (!value) return null;
        const normalized = value.trim().toLowerCase();

        if (normalized === 'users' || normalized === 'role' || normalized === 'group') {
            return normalized;
        }

        if (
            normalized === 'schedule' ||
            normalized === 'defense-schedule' ||
            normalized === 'defense_schedule'
        ) {
            return 'schedule';
        }

        return null;
    }
}

export default NotificationController;
