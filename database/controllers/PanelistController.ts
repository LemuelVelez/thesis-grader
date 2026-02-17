import type {
    PanelistProfilePatch,
    PanelistProfileRow,
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

function normalizeNullableText(value: unknown): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return undefined;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export type CreatePanelistInput = Omit<UserInsert, 'role'> & {
    expertise?: string | null;
};

export type UpdatePanelistInput = {
    user?: Omit<UserPatch, 'role'>;
    profile?: PanelistProfilePatch;
};

export interface PanelistAccount {
    user: UserRow;
    profile: PanelistProfileRow | null;
}

export class PanelistController {
    constructor(private readonly services: Services) { }

    private async toAccount(user: UserRow): Promise<PanelistAccount> {
        const profile = await this.services.panelist_profiles.findByUserId(user.id);
        return { user, profile };
    }

    /* --------------------------------- CREATE -------------------------------- */

    async create(input: CreatePanelistInput): Promise<PanelistAccount> {
        return this.services.transaction<PanelistAccount>(async (tx) => {
            const { expertise: rawExpertise, ...userInput } = input;
            const expertise = normalizeNullableText(rawExpertise);

            const user = await tx.users.create({
                ...userInput,
                role: 'panelist',
            });

            await tx.panelist_profiles.create({
                user_id: user.id,
                expertise: expertise ?? null,
            });

            const profile = await tx.panelist_profiles.findByUserId(user.id);
            return { user, profile };
        });
    }

    /* ---------------------------------- READ --------------------------------- */

    async getById(userId: UUID): Promise<PanelistAccount | null> {
        const user = await this.services.users.findById(userId);
        if (!user || user.role !== 'panelist') return null;
        return this.toAccount(user);
    }

    async getAll(query: Omit<ListQuery<UserRow>, 'where'> = {}): Promise<PanelistAccount[]> {
        const users = await this.services.users.listByRole('panelist', query);
        return Promise.all(users.map((u) => this.toAccount(u)));
    }

    /* --------------------------------- UPDATE -------------------------------- */

    async update(userId: UUID, input: UpdatePanelistInput): Promise<PanelistAccount | null> {
        const cleanUserPatch = stripUndefined(input.user ?? {}) as Omit<UserPatch, 'role'>;
        const cleanProfilePatch = stripUndefined(input.profile ?? {}) as PanelistProfilePatch;

        const normalizedExpertise = normalizeNullableText(cleanProfilePatch.expertise);
        if (normalizedExpertise !== undefined) {
            cleanProfilePatch.expertise = normalizedExpertise;
        }

        if (
            Object.keys(cleanUserPatch).length === 0 &&
            Object.keys(cleanProfilePatch).length === 0
        ) {
            return this.getById(userId);
        }

        return this.services.transaction<PanelistAccount | null>(async (tx) => {
            const existingUser = await tx.users.findById(userId);
            if (!existingUser || existingUser.role !== 'panelist') return null;

            let finalUser = existingUser;

            if (Object.keys(cleanUserPatch).length > 0) {
                const updated = await tx.users.updateOne({ id: userId }, cleanUserPatch as UserPatch);
                if (updated) finalUser = updated;
            }

            if (Object.keys(cleanProfilePatch).length > 0) {
                const existingProfile = await tx.panelist_profiles.findByUserId(userId);
                if (existingProfile) {
                    await tx.panelist_profiles.updateOne({ user_id: userId }, cleanProfilePatch);
                } else {
                    await tx.panelist_profiles.create({
                        user_id: userId,
                        ...cleanProfilePatch,
                    });
                }
            }

            const finalProfile = await tx.panelist_profiles.findByUserId(userId);
            return {
                user: finalUser,
                profile: finalProfile,
            };
        });
    }

    async setStatus(userId: UUID, status: UserStatus): Promise<UserRow | null> {
        const existing = await this.getById(userId);
        if (!existing) return null;
        return this.services.users.setStatus(userId, status);
    }

    /* --------------------------------- DELETE -------------------------------- */

    async delete(userId: UUID): Promise<number> {
        return this.services.transaction<number>(async (tx) => {
            const user = await tx.users.findById(userId);
            if (!user || user.role !== 'panelist') return 0;

            await tx.panelist_profiles.delete({ user_id: userId });
            return tx.users.delete({ id: userId });
        });
    }
}

export default PanelistController;
