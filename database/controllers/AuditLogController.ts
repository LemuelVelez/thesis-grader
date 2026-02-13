import type {
    AuditLogInsert,
    AuditLogPatch,
    AuditLogRow,
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

export type CreateAuditLogInput = AuditLogInsert;
export type UpdateAuditLogInput = AuditLogPatch;

export class AuditLogController {
    constructor(private readonly services: Services) { }

    /* --------------------------------- CREATE -------------------------------- */

    async create(input: CreateAuditLogInput): Promise<AuditLogRow> {
        return this.services.audit_logs.create(input);
    }

    /* ---------------------------------- READ --------------------------------- */

    async getById(id: UUID): Promise<AuditLogRow | null> {
        return this.services.audit_logs.findById(id);
    }

    async getAll(query: ListQuery<AuditLogRow> = {}): Promise<AuditLogRow[]> {
        return this.services.audit_logs.findMany(query);
    }

    async getByActor(actorId: UUID): Promise<AuditLogRow[]> {
        return this.services.audit_logs.listByActor(actorId);
    }

    async getByEntity(entity: string, entityId?: UUID): Promise<AuditLogRow[]> {
        return this.services.audit_logs.listByEntity(entity, entityId);
    }

    /* --------------------------------- UPDATE -------------------------------- */

    async update(id: UUID, patch: UpdateAuditLogInput): Promise<AuditLogRow | null> {
        const existing = await this.getById(id);
        if (!existing) return null;

        const cleanPatch = stripUndefined(patch) as UpdateAuditLogInput;
        if (Object.keys(cleanPatch).length === 0) return existing;

        return this.services.audit_logs.updateOne({ id }, cleanPatch as AuditLogPatch);
    }

    /* --------------------------------- DELETE -------------------------------- */

    async delete(id: UUID): Promise<number> {
        return this.services.audit_logs.delete({ id });
    }
}

export default AuditLogController;
