import type {
    StudentInsert,
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

function normalizeNullableString(value: unknown): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export type CreateAdminInput = Omit<UserInsert, 'role'>;
export type UpdateAdminInput = Omit<UserPatch, 'role'>;

export interface UpsertStudentProfileInput {
    program?: string | null;
    section?: string | null;
}

export interface UpsertStudentProfileResult {
    item: StudentRow;
    created: boolean;
    roleUpdated: boolean;
}

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

    async getStudentProfileByUserId(userId: UUID): Promise<StudentRow | null> {
        return this.services.students.findByUserId(userId);
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

    async upsertStudentProfileForUser(
        userId: UUID,
        input: UpsertStudentProfileInput = {},
    ): Promise<UpsertStudentProfileResult | null> {
        const user = await this.services.users.findById(userId);
        if (!user) return null;

        let roleUpdated = false;
        if (user.role !== 'student') {
            const updatedUser = await this.services.users.updateOne(
                { id: userId },
                { role: 'student' },
            );
            if (!updatedUser) return null;
            roleUpdated = updatedUser.role === 'student';
        }

        const normalizedProgram = normalizeNullableString(input.program);
        const normalizedSection = normalizeNullableString(input.section);

        const existing = await this.services.students.findByUserId(userId);

        const patch = stripUndefined<StudentPatch>({
            program: normalizedProgram,
            section: normalizedSection,
        }) as StudentPatch;

        if (existing) {
            if (Object.keys(patch).length === 0) {
                return {
                    item: existing,
                    created: false,
                    roleUpdated,
                };
            }

            const updated = await this.services.students.updateOne(
                { user_id: userId },
                patch,
            );

            return {
                item: updated ?? existing,
                created: false,
                roleUpdated,
            };
        }

        const created = await this.services.students.create({
            user_id: userId,
            program: normalizedProgram ?? null,
            section: normalizedSection ?? null,
        } as StudentInsert);

        return {
            item: created,
            created: true,
            roleUpdated,
        };
    }

    /* --------------------------------- DELETE -------------------------------- */

    async delete(id: UUID): Promise<number> {
        const existing = await this.getById(id);
        if (!existing) return 0;
        return this.services.users.delete({ id });
    }
}

export default AdminController;
