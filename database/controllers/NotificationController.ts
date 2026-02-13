import type {
    NotificationInsert,
    NotificationPatch,
    NotificationRow,
    NotificationType,
    UUID,
} from '../models/Model';
import type {
    ListQuery,
    NotificationBroadcastPayload,
    Services,
} from '../services/Services';

function stripUndefined<T extends object>(input: T): Partial<T> {
    const out: Partial<T> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (value !== undefined) {
            (out as Record<string, unknown>)[key] = value;
        }
    }
    return out;
}

export type ListUserNotificationsQuery = Omit<ListQuery<NotificationRow>, 'where'>;

export class NotificationController {
    constructor(private readonly services: Services) { }

    /* --------------------------------- CREATE -------------------------------- */

    async create(payload: NotificationInsert): Promise<NotificationRow> {
        return this.services.notifications.create(payload);
    }

    async broadcast(
        userIds: UUID[],
        payload: NotificationBroadcastPayload,
    ): Promise<NotificationRow[]> {
        if (userIds.length === 0) return [];
        return this.services.notifications.createForUsers(userIds, payload);
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
}

export default NotificationController;
