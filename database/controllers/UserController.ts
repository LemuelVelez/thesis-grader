import type {
    UserInsert,
    UserPatch,
    UserRow,
    UserStatus,
    UUID,
} from '../models/Model';
import type { ListQuery, PageResult, Services } from '../services/Services';

const USER_ID_ALIAS_KEYS = [
    'auth_user_id',
    'authUserId',
    'user_id',
    'userId',
    'external_id',
    'externalId',
    'uid',
] as const;

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

    /**
     * Resolves a user by canonical users.id first, then by common alternate identity keys.
     * This hardens /api/users/:id against identity mismatch (e.g. auth_user_id vs users.id).
     */
    private async findByIdOrAlias(id: UUID): Promise<UserRow | null> {
        // 1) Canonical lookup
        try {
            const direct = await this.services.users.findById(id);
            if (direct) return direct;
        } catch {
            // Continue to alias lookup
        }

        // 2) Alias lookup (best effort, schema-dependent)
        for (const aliasKey of USER_ID_ALIAS_KEYS) {
            try {
                const query = {
                    where: { [aliasKey]: id } as unknown as Partial<UserRow>,
                    limit: 1,
                } as ListQuery<UserRow>;

                const matches = await this.services.users.findMany(query);
                if (Array.isArray(matches) && matches.length > 0 && matches[0]) {
                    return matches[0];
                }
            } catch {
                // Ignore per-alias failures (unknown column, adapter constraints, etc.)
            }
        }

        return null;
    }

    private async resolveCanonicalId(id: UUID): Promise<UUID | null> {
        const user = await this.findByIdOrAlias(id);
        return user?.id ?? null;
    }

    /* --------------------------------- CREATE -------------------------------- */

    async create(payload: UserInsert): Promise<UserRow> {
        return this.services.users.create(payload);
    }

    /* ---------------------------------- READ --------------------------------- */

    async getById(id: UUID): Promise<UserRow | null> {
        return this.findByIdOrAlias(id);
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

        // Empty patch should still return resolved user (including alias id inputs)
        if (Object.keys(cleanPatch).length === 0) {
            return this.findByIdOrAlias(id);
        }

        const canonicalId = await this.resolveCanonicalId(id);
        if (!canonicalId) return null;

        return this.services.users.updateOne({ id: canonicalId }, cleanPatch);
    }

    async setStatus(id: UUID, status: UserStatus): Promise<UserRow | null> {
        const canonicalId = await this.resolveCanonicalId(id);
        if (!canonicalId) return null;

        return this.services.users.setStatus(canonicalId, status);
    }

    async setAvatarKey(id: UUID, avatarKey: string | null): Promise<UserRow | null> {
        const canonicalId = await this.resolveCanonicalId(id);
        if (!canonicalId) return null;

        return this.services.users.setAvatarKey(canonicalId, avatarKey);
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
        const canonicalId = await this.resolveCanonicalId(id);
        if (!canonicalId) return 0;

        return this.services.users.delete({ id: canonicalId });
    }
}

export default UserController;
