import type {
    StudentPatch,
    StudentRow,
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

export type CreateStudentInput = Omit<UserInsert, 'role'> & {
    program?: string | null;
    section?: string | null;
};

export type UpdateStudentInput = {
    user?: Omit<UserPatch, 'role'>;
    profile?: StudentPatch;
};

export interface StudentAccount {
    user: UserRow;
    profile: StudentRow | null;
}

export class StudentController {
    constructor(private readonly services: Services) { }

    private async toAccount(user: UserRow): Promise<StudentAccount> {
        const profile = await this.services.students.findByUserId(user.id);
        return { user, profile };
    }

    /* --------------------------------- CREATE -------------------------------- */

    async create(input: CreateStudentInput): Promise<StudentAccount> {
        return this.services.transaction<StudentAccount>(async (tx) => {
            const user = await tx.users.create({
                ...input,
                role: 'student',
            });

            await tx.students.create({
                user_id: user.id,
                program: input.program ?? null,
                section: input.section ?? null,
            });

            const profile = await tx.students.findByUserId(user.id);
            return { user, profile };
        });
    }

    /* ---------------------------------- READ --------------------------------- */

    async getById(userId: UUID): Promise<StudentAccount | null> {
        const user = await this.services.users.findById(userId);
        if (!user || user.role !== 'student') return null;
        return this.toAccount(user);
    }

    async getAll(query: Omit<ListQuery<UserRow>, 'where'> = {}): Promise<StudentAccount[]> {
        const users = await this.services.users.listByRole('student', query);
        return Promise.all(users.map((u) => this.toAccount(u)));
    }

    /* --------------------------------- UPDATE -------------------------------- */

    async update(userId: UUID, input: UpdateStudentInput): Promise<StudentAccount | null> {
        const cleanUserPatch = stripUndefined(input.user ?? {}) as Omit<UserPatch, 'role'>;
        const cleanProfilePatch = stripUndefined(input.profile ?? {}) as StudentPatch;

        if (
            Object.keys(cleanUserPatch).length === 0 &&
            Object.keys(cleanProfilePatch).length === 0
        ) {
            return this.getById(userId);
        }

        return this.services.transaction<StudentAccount | null>(async (tx) => {
            const existingUser = await tx.users.findById(userId);
            if (!existingUser || existingUser.role !== 'student') return null;

            let finalUser = existingUser;

            if (Object.keys(cleanUserPatch).length > 0) {
                const updated = await tx.users.updateOne({ id: userId }, cleanUserPatch as UserPatch);
                if (updated) finalUser = updated;
            }

            if (Object.keys(cleanProfilePatch).length > 0) {
                const existingProfile = await tx.students.findByUserId(userId);
                if (existingProfile) {
                    await tx.students.updateOne({ user_id: userId }, cleanProfilePatch);
                } else {
                    await tx.students.create({
                        user_id: userId,
                        ...cleanProfilePatch,
                    });
                }
            }

            const finalProfile = await tx.students.findByUserId(userId);
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
            if (!user || user.role !== 'student') return 0;

            await tx.students.delete({ user_id: userId });
            return tx.users.delete({ id: userId });
        });
    }
}

export default StudentController;
