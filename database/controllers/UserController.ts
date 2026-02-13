import type {
    UserInsert,
    UserPatch,
    UserRow,
    UserStatus,
    UUID,
} from '../models/Model';
import type { ListQuery, PageResult, Services } from '../services/Services';

function stripUndefined<T extends object>(input: T): Partial<T> {
    const out: Partial<T> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (value !== undefined) {
            (out as Record<string, unknown>)[key] = value;
        }
    }
    return out;
}

export class UserController {
    constructor(private readonly services: Services) { }

    /* --------------------------------- CREATE -------------------------------- */

    async create(payload: UserInsert): Promise<UserRow> {
        return this.services.users.create(payload);
    }

    /* ---------------------------------- READ --------------------------------- */

    async getById(id: UUID): Promise<UserRow | null> {
        return this.services.users.findById(id);
    }

    async getByEmail(email: string): Promise<UserRow | null> {
        return this.services.users.findByEmail(email);
    }

    async getAll(query: ListQuery<UserRow> = {}): Promise<UserRow[]> {
        return this.services.users.findMany(query);
    }

    async getPage(query: ListQuery<UserRow> = {}): Promise<PageResult<UserRow>> {
        return this.services.users.findPage(query);
    }

    async exists(where: Partial<UserRow>): Promise<boolean> {
        return this.services.users.exists(where);
    }

    /* --------------------------------- UPDATE -------------------------------- */

    async update(id: UUID, patch: UserPatch): Promise<UserRow | null> {
        const cleanPatch = stripUndefined(patch) as UserPatch;
        if (Object.keys(cleanPatch).length === 0) {
            return this.services.users.findById(id);
        }
        return this.services.users.updateOne({ id }, cleanPatch);
    }

    async setStatus(id: UUID, status: UserStatus): Promise<UserRow | null> {
        return this.services.users.setStatus(id, status);
    }

    async setAvatarKey(id: UUID, avatarKey: string | null): Promise<UserRow | null> {
        return this.services.users.setAvatarKey(id, avatarKey);
    }

    async upsertByEmail(createPayload: UserInsert, patch: UserPatch = {}): Promise<UserRow> {
        const cleanPatch = stripUndefined(patch) as UserPatch;
        const patchPayload = Object.keys(cleanPatch).length > 0 ? cleanPatch : undefined;
        return this.services.users.upsert(
            { email: createPayload.email },
            createPayload,
            patchPayload,
        );
    }

    /* --------------------------------- DELETE -------------------------------- */

    async delete(id: UUID): Promise<number> {
        return this.services.users.delete({ id });
    }
}

export default UserController;
