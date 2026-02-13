import type {
    StaffProfilePatch,
    StaffProfileRow,
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

export type CreateStaffInput = Omit<UserInsert, 'role'> & {
    department?: string | null;
};

export type UpdateStaffInput = {
    user?: Omit<UserPatch, 'role'>;
    profile?: StaffProfilePatch;
};

export interface StaffAccount {
    user: UserRow;
    profile: StaffProfileRow | null;
}

export class StaffController {
    constructor(private readonly services: Services) { }

    private async toAccount(user: UserRow): Promise<StaffAccount> {
        const profile = await this.services.staff_profiles.findByUserId(user.id);
        return { user, profile };
    }

    /* --------------------------------- CREATE -------------------------------- */

    async create(input: CreateStaffInput): Promise<StaffAccount> {
        return this.services.transaction<StaffAccount>(async (tx) => {
            const user = await tx.users.create({
                ...input,
                role: 'staff',
            });

            await tx.staff_profiles.create({
                user_id: user.id,
                department: input.department ?? null,
            });

            const profile = await tx.staff_profiles.findByUserId(user.id);
            return { user, profile };
        });
    }

    /* ---------------------------------- READ --------------------------------- */

    async getById(userId: UUID): Promise<StaffAccount | null> {
        const user = await this.services.users.findById(userId);
        if (!user || user.role !== 'staff') return null;
        return this.toAccount(user);
    }

    async getAll(query: Omit<ListQuery<UserRow>, 'where'> = {}): Promise<StaffAccount[]> {
        const users = await this.services.users.listByRole('staff', query);
        return Promise.all(users.map((u) => this.toAccount(u)));
    }

    /* --------------------------------- UPDATE -------------------------------- */

    async update(userId: UUID, input: UpdateStaffInput): Promise<StaffAccount | null> {
        const cleanUserPatch = stripUndefined(input.user ?? {}) as Omit<UserPatch, 'role'>;
        const cleanProfilePatch = stripUndefined(input.profile ?? {}) as StaffProfilePatch;

        if (
            Object.keys(cleanUserPatch).length === 0 &&
            Object.keys(cleanProfilePatch).length === 0
        ) {
            return this.getById(userId);
        }

        return this.services.transaction<StaffAccount | null>(async (tx) => {
            const existingUser = await tx.users.findById(userId);
            if (!existingUser || existingUser.role !== 'staff') return null;

            let finalUser = existingUser;

            if (Object.keys(cleanUserPatch).length > 0) {
                const updated = await tx.users.updateOne({ id: userId }, cleanUserPatch as UserPatch);
                if (updated) finalUser = updated;
            }

            if (Object.keys(cleanProfilePatch).length > 0) {
                const existingProfile = await tx.staff_profiles.findByUserId(userId);
                if (existingProfile) {
                    await tx.staff_profiles.updateOne({ user_id: userId }, cleanProfilePatch);
                } else {
                    await tx.staff_profiles.create({
                        user_id: userId,
                        ...cleanProfilePatch,
                    });
                }
            }

            const finalProfile = await tx.staff_profiles.findByUserId(userId);
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
            if (!user || user.role !== 'staff') return 0;

            await tx.staff_profiles.delete({ user_id: userId });
            return tx.users.delete({ id: userId });
        });
    }
}

export default StaffController;
