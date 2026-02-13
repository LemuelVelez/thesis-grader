import type {
    UserInsert,
    UserPatch,
    UserRow,
    UserStatus,
    UUID,
} from '../models/Model';
import type { ListQuery, Services } from '../services/Services';

function stripUndefined<T extends object>(input: T): Partial<T> {
    const out: Partial<T> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (value !== undefined) {
            (out as Record<string, unknown>)[key] = value;
        }
    }
    return out;
}

export type CreateAdminInput = Omit<UserInsert, 'role'>;
export type UpdateAdminInput = Omit<UserPatch, 'role'>;

export class AdminController {
    constructor(private readonly services: Services) { }

    /* --------------------------------- CREATE -------------------------------- */

    async create(input: CreateAdminInput): Promise<UserRow> {
        const payload: UserInsert = {
            ...input,
            role: 'admin',
        };
        return this.services.users.create(payload);
    }

    /* ---------------------------------- READ --------------------------------- */

    async getById(id: UUID): Promise<UserRow | null> {
        const user = await this.services.users.findById(id);
        if (!user || user.role !== 'admin') return null;
        return user;
    }

    async getAll(query: Omit<ListQuery<UserRow>, 'where'> = {}): Promise<UserRow[]> {
        return this.services.users.listByRole('admin', query);
    }

    /* --------------------------------- UPDATE -------------------------------- */

    async update(id: UUID, patch: UpdateAdminInput): Promise<UserRow | null> {
        const existing = await this.getById(id);
        if (!existing) return null;

        const cleanPatch = stripUndefined(patch) as UpdateAdminInput;
        if (Object.keys(cleanPatch).length === 0) return existing;

        return this.services.users.updateOne({ id }, cleanPatch as UserPatch);
    }

    async setStatus(id: UUID, status: UserStatus): Promise<UserRow | null> {
        const existing = await this.getById(id);
        if (!existing) return null;
        return this.services.users.setStatus(id, status);
    }

    /* --------------------------------- DELETE -------------------------------- */

    async delete(id: UUID): Promise<number> {
        const existing = await this.getById(id);
        if (!existing) return 0;
        return this.services.users.delete({ id });
    }
}

export default AdminController;
