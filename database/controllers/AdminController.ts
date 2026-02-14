import type {
    DefenseScheduleInsert,
    DefenseSchedulePatch,
    DefenseScheduleRow,
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

export interface AdminDefenseScheduleView extends DefenseScheduleRow {
    group_title: string | null;
    rubric_template_name: string | null;
    created_by_name: string | null;
    created_by_email: string | null;
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

    async createDefenseSchedule(input: DefenseScheduleInsert): Promise<DefenseScheduleRow> {
        return this.services.defense_schedules.create(input);
    }

    async createDefenseScheduleDetailed(
        input: DefenseScheduleInsert,
    ): Promise<AdminDefenseScheduleView> {
        const created = await this.createDefenseSchedule(input);
        return this.enrichDefenseSchedule(created);
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

    async getDefenseScheduleById(id: UUID): Promise<DefenseScheduleRow | null> {
        return this.services.defense_schedules.findById(id);
    }

    async getDefenseScheduleByIdDetailed(
        id: UUID,
    ): Promise<AdminDefenseScheduleView | null> {
        const row = await this.getDefenseScheduleById(id);
        if (!row) return null;
        return this.enrichDefenseSchedule(row);
    }

    async getDefenseSchedules(query: ListQuery<DefenseScheduleRow> = {}): Promise<DefenseScheduleRow[]> {
        return this.services.defense_schedules.findMany(query);
    }

    async getDefenseSchedulesDetailed(
        query: ListQuery<DefenseScheduleRow> = {},
    ): Promise<AdminDefenseScheduleView[]> {
        const rows = await this.getDefenseSchedules(query);
        return Promise.all(rows.map((row) => this.enrichDefenseSchedule(row)));
    }

    async getDefenseSchedulesByGroup(groupId: UUID): Promise<DefenseScheduleRow[]> {
        return this.services.defense_schedules.listByGroup(groupId);
    }

    async getDefenseSchedulesByGroupDetailed(
        groupId: UUID,
    ): Promise<AdminDefenseScheduleView[]> {
        const rows = await this.getDefenseSchedulesByGroup(groupId);
        return Promise.all(rows.map((row) => this.enrichDefenseSchedule(row)));
    }

    async getDefenseSchedulesByPanelist(panelistId: UUID): Promise<DefenseScheduleRow[]> {
        return this.services.defense_schedules.listByPanelist(panelistId);
    }

    async getDefenseSchedulesByPanelistDetailed(
        panelistId: UUID,
    ): Promise<AdminDefenseScheduleView[]> {
        const rows = await this.getDefenseSchedulesByPanelist(panelistId);
        return Promise.all(rows.map((row) => this.enrichDefenseSchedule(row)));
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

    async updateDefenseSchedule(
        id: UUID,
        patch: DefenseSchedulePatch,
    ): Promise<DefenseScheduleRow | null> {
        const existing = await this.services.defense_schedules.findById(id);
        if (!existing) return null;

        const cleanPatch = stripUndefined(patch) as DefenseSchedulePatch;
        if (Object.keys(cleanPatch).length === 0) return existing;

        return this.services.defense_schedules.updateOne({ id }, cleanPatch);
    }

    async updateDefenseScheduleDetailed(
        id: UUID,
        patch: DefenseSchedulePatch,
    ): Promise<AdminDefenseScheduleView | null> {
        const updated = await this.updateDefenseSchedule(id, patch);
        if (!updated) return null;
        return this.enrichDefenseSchedule(updated);
    }

    async setDefenseScheduleStatus(
        id: UUID,
        status: DefenseScheduleRow['status'],
    ): Promise<DefenseScheduleRow | null> {
        const existing = await this.services.defense_schedules.findById(id);
        if (!existing) return null;

        return this.services.defense_schedules.setStatus(id, status);
    }

    async setDefenseScheduleStatusDetailed(
        id: UUID,
        status: DefenseScheduleRow['status'],
    ): Promise<AdminDefenseScheduleView | null> {
        const updated = await this.setDefenseScheduleStatus(id, status);
        if (!updated) return null;
        return this.enrichDefenseSchedule(updated);
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

    async deleteDefenseSchedule(id: UUID): Promise<number> {
        const existing = await this.services.defense_schedules.findById(id);
        if (!existing) return 0;
        return this.services.defense_schedules.delete({ id });
    }

    /* ------------------------------- INTERNALS ------------------------------- */

    private async resolveCreatedBy(
        schedule: DefenseScheduleRow,
    ): Promise<{ id: UUID | null; name: string | null; email: string | null }> {
        let creatorId: UUID | null = schedule.created_by ?? null;

        if (!creatorId) {
            const candidateEntities = ['defense_schedules', 'defense_schedule'];

            for (const entity of candidateEntities) {
                try {
                    const logs = await this.services.audit_logs.listByEntity(entity, schedule.id);
                    const firstActorLog = logs
                        .filter((log) => !!log.actor_id)
                        .sort((a, b) => {
                            const aTime = new Date(a.created_at).getTime();
                            const bTime = new Date(b.created_at).getTime();
                            return aTime - bTime;
                        })[0];

                    if (firstActorLog?.actor_id) {
                        creatorId = firstActorLog.actor_id;
                        break;
                    }
                } catch {
                    // Best-effort fallback only.
                }
            }
        }

        if (!creatorId) {
            return { id: null, name: null, email: null };
        }

        const creator = await this.services.users.findById(creatorId);
        if (!creator) {
            return { id: creatorId, name: null, email: null };
        }

        return {
            id: creator.id,
            name: creator.name ?? null,
            email: creator.email ?? null,
        };
    }

    private async enrichDefenseSchedule(
        schedule: DefenseScheduleRow,
    ): Promise<AdminDefenseScheduleView> {
        const [group, rubricTemplate, creator] = await Promise.all([
            this.services.thesis_groups.findById(schedule.group_id),
            schedule.rubric_template_id
                ? this.services.rubric_templates.findById(schedule.rubric_template_id)
                : Promise.resolve(null),
            this.resolveCreatedBy(schedule),
        ]);

        return {
            ...schedule,
            created_by: creator.id ?? schedule.created_by,
            group_title: group?.title ?? null,
            rubric_template_name: rubricTemplate?.name ?? null,
            created_by_name: creator.name ?? null,
            created_by_email: creator.email ?? null,
        };
    }
}

export default AdminController;
