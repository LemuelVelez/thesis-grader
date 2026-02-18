import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { db } from '../../lib/db';

import type {
    AuditLogInsert,
    AuditLogPatch,
    AuditLogRow,
    DbEntityName,
    DefenseScheduleInsert,
    DefenseSchedulePatch,
    DefenseScheduleRow,
    EvaluationExtraInsert,
    EvaluationExtraPatch,
    EvaluationExtraRow,
    EvaluationInsert,
    EvaluationOverallPercentageRow,
    EvaluationPatch,
    EvaluationRow,
    EvaluationScoreInsert,
    EvaluationScorePatch,
    EvaluationScoreRow,
    EvaluationStatus,
    GroupMemberInsert,
    GroupMemberRow,
    ISODateTime,
    NotificationInsert,
    NotificationPatch,
    NotificationRow,
    NotificationType,
    PanelistProfileInsert,
    PanelistProfilePatch,
    PanelistProfileRow,
    PasswordResetInsert,
    PasswordResetPatch,
    PasswordResetRow,
    RubricCriteriaInsert,
    RubricCriteriaPatch,
    RubricCriteriaRow,
    RubricScaleLevelInsert,
    RubricScaleLevelPatch,
    RubricScaleLevelRow,
    RubricTemplateInsert,
    RubricTemplatePatch,
    RubricTemplateRow,
    SchedulePanelistInsert,
    SchedulePanelistRow,
    SessionInsert,
    SessionPatch,
    SessionRow,
    StaffProfileInsert,
    StaffProfilePatch,
    StaffProfileRow,
    StudentEvalStatus,
    StudentEvaluationInsert,
    StudentEvaluationPatch,
    StudentEvaluationRow,
    StudentEvaluationScoreInsert,
    StudentEvaluationScorePatch,
    StudentEvaluationScoreRow,
    StudentFeedbackFormInsert,
    StudentFeedbackFormPatch,
    StudentFeedbackFormRow,
    StudentInsert,
    StudentPatch,
    StudentRow,
    ThesisGroupInsert,
    ThesisGroupPatch,
    ThesisGroupRankingRow,
    ThesisGroupRow,
    ThesisRole,
    UserInsert,
    UserPatch,
    UserRow,
    UserStatus,
    UUID,
} from '../models/Model';

import type {
    DatabaseServices,
    EntityServiceMap,
    ListQuery,
    NotificationBroadcastPayload,
    PageResult,
    PushSubscriptionInsert,
    PushSubscriptionPatch,
    PushSubscriptionRow,
} from './Services';

type Queryable = {
    query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[],
    ): Promise<QueryResult<T>>;
};

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function nowIso(): ISODateTime {
    return new Date().toISOString();
}

function quoteIdentifier(identifier: string): string {
    const parts = identifier.split('.');
    const quoted = parts.map((part) => {
        const trimmed = part.trim();
        if (!SAFE_IDENTIFIER.test(trimmed)) {
            throw new Error(`Unsafe SQL identifier: ${identifier}`);
        }
        return `"${trimmed}"`;
    });
    return quoted.join('.');
}

function toRecord(value: unknown): Record<string, unknown> {
    return (value ?? {}) as Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stripUndefined(input: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) {
            out[key] = value;
        }
    }
    return out;
}

function normalizeLimit(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        return null;
    }
    return value;
}

function normalizeOffset(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        return null;
    }
    return value;
}

function buildWhereClause(
    where?: Record<string, unknown>,
): { sql: string; values: unknown[] } {
    const entries = Object.entries(where ?? {}).filter(([, value]) => value !== undefined);

    if (entries.length === 0) {
        return { sql: '', values: [] };
    }

    const values: unknown[] = [];
    const predicates: string[] = [];

    for (const [columnRaw, value] of entries) {
        const column = quoteIdentifier(columnRaw);

        if (value === null) {
            predicates.push(`${column} IS NULL`);
            continue;
        }

        if (Array.isArray(value)) {
            if (value.length === 0) {
                predicates.push('FALSE');
                continue;
            }
            values.push(value);
            predicates.push(`${column} = ANY($${values.length})`);
            continue;
        }

        values.push(value);
        predicates.push(`${column} = $${values.length}`);
    }

    return {
        sql: `WHERE ${predicates.join(' AND ')}`,
        values,
    };
}

function buildOrderBy<Row extends object>(
    orderBy: ListQuery<Row>['orderBy'] | undefined,
    orderDirection: ListQuery<Row>['orderDirection'] | undefined,
): string {
    if (typeof orderBy !== 'string' || orderBy.trim().length === 0) {
        return '';
    }

    const dir = orderDirection === 'desc' ? 'DESC' : 'ASC';
    return `ORDER BY ${quoteIdentifier(orderBy)} ${dir}`;
}

function parseCountRow(row: unknown): number {
    const raw = (row as { count?: string | number } | null)?.count;
    const count = typeof raw === 'string' ? Number(raw) : raw;
    return Number.isFinite(count) ? Number(count) : 0;
}

function isPool(executor: Queryable): executor is Pool {
    return (
        typeof (executor as Pool).connect === 'function' &&
        typeof (executor as { end?: unknown }).end === 'function'
    );
}

let savepointCounter = 0;
function nextSavepointName(): string {
    savepointCounter += 1;
    return `sp_${savepointCounter.toString(36)}`;
}

abstract class PgReadonlyService<Row extends object> {
    constructor(
        protected readonly executor: Queryable,
        protected readonly relation: string,
    ) { }

    async findOne(where: Partial<Row>): Promise<Row | null> {
        const whereSql = buildWhereClause(toRecord(where));
        const sql = `
      SELECT *
      FROM ${quoteIdentifier(this.relation)}
      ${whereSql.sql}
      LIMIT 1
    `;
        const result = await this.executor.query<Row>(sql, whereSql.values);
        return result.rows[0] ?? null;
    }

    async findMany(query: ListQuery<Row> = {}): Promise<Row[]> {
        const whereSql = buildWhereClause(toRecord(query.where));
        const orderSql = buildOrderBy(query.orderBy, query.orderDirection);
        const limit = normalizeLimit(query.limit);
        const offset = normalizeOffset(query.offset);

        let sql = `SELECT * FROM ${quoteIdentifier(this.relation)}`;
        if (whereSql.sql) sql += ` ${whereSql.sql}`;
        if (orderSql) sql += ` ${orderSql}`;
        if (limit !== null) sql += ` LIMIT ${limit}`;
        if (offset !== null) sql += ` OFFSET ${offset}`;

        const result = await this.executor.query<Row>(sql, whereSql.values);
        return result.rows;
    }

    async count(where?: Partial<Row>): Promise<number> {
        const whereSql = buildWhereClause(toRecord(where));
        const sql = `
      SELECT COUNT(*)::int AS count
      FROM ${quoteIdentifier(this.relation)}
      ${whereSql.sql}
    `;
        const result = await this.executor.query<{ count: string | number }>(sql, whereSql.values);
        return parseCountRow(result.rows[0]);
    }

    async exists(where: Partial<Row>): Promise<boolean> {
        const whereSql = buildWhereClause(toRecord(where));
        const sql = `
      SELECT EXISTS(
        SELECT 1 FROM ${quoteIdentifier(this.relation)} ${whereSql.sql}
      ) AS "exists"
    `;
        const result = await this.executor.query<{ exists: boolean }>(sql, whereSql.values);
        return Boolean(result.rows[0]?.exists);
    }

    async findPage(query: ListQuery<Row> = {}): Promise<PageResult<Row>> {
        const [items, total] = await Promise.all([
            this.findMany(query),
            this.count(query.where),
        ]);

        return {
            items,
            total,
            limit: normalizeLimit(query.limit) ?? items.length,
            offset: normalizeOffset(query.offset) ?? 0,
        };
    }
}

class PgTableService<Row extends object, Insert extends object, Patch extends object>
    extends PgReadonlyService<Row> {
    async create(payload: Insert): Promise<Row> {
        const record = stripUndefined(toRecord(payload));
        const entries = Object.entries(record);

        if (entries.length === 0) {
            const sql = `INSERT INTO ${quoteIdentifier(this.relation)} DEFAULT VALUES RETURNING *`;
            const result = await this.executor.query<Row>(sql);
            return result.rows[0];
        }

        const columns = entries.map(([key]) => quoteIdentifier(key)).join(', ');
        const placeholders = entries.map((_, index) => `$${index + 1}`).join(', ');
        const values = entries.map(([, value]) => value);

        const sql = `
      INSERT INTO ${quoteIdentifier(this.relation)} (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;
        const result = await this.executor.query<Row>(sql, values);
        return result.rows[0];
    }

    async createMany(payloads: Insert[]): Promise<Row[]> {
        if (payloads.length === 0) return [];

        const out: Row[] = [];
        for (const payload of payloads) {
            out.push(await this.create(payload));
        }
        return out;
    }

    async update(where: Partial<Row>, patch: Patch): Promise<Row[]> {
        const patchRecord = stripUndefined(toRecord(patch));
        const setEntries = Object.entries(patchRecord);

        if (setEntries.length === 0) return [];

        const setParts: string[] = [];
        const values: unknown[] = [];

        for (const [key, value] of setEntries) {
            values.push(value);
            setParts.push(`${quoteIdentifier(key)} = $${values.length}`);
        }

        const whereSql = buildWhereClause(toRecord(where));
        const shiftedWhereSql =
            whereSql.values.length > 0
                ? whereSql.sql.replace(/\$(\d+)/g, (_, n: string) => `$${Number(n) + values.length}`)
                : whereSql.sql;

        const sql = `
      UPDATE ${quoteIdentifier(this.relation)}
      SET ${setParts.join(', ')}
      ${shiftedWhereSql}
      RETURNING *
    `;

        const result = await this.executor.query<Row>(sql, [...values, ...whereSql.values]);
        return result.rows;
    }

    async updateOne(where: Partial<Row>, patch: Patch): Promise<Row | null> {
        const rows = await this.update(where, patch);
        return rows[0] ?? null;
    }

    async delete(where: Partial<Row>): Promise<number> {
        const whereSql = buildWhereClause(toRecord(where));
        const sql = `
      DELETE FROM ${quoteIdentifier(this.relation)}
      ${whereSql.sql}
    `;
        const result = await this.executor.query(sql, whereSql.values);
        return result.rowCount ?? 0;
    }

    async upsert(where: Partial<Row>, create: Insert, patch?: Patch): Promise<Row> {
        const existing = await this.findOne(where);

        if (!existing) {
            return this.create(create);
        }

        if (!patch) {
            return existing;
        }

        const updated = await this.updateOne(where, patch);
        return updated ?? existing;
    }
}

class PgJoinTableService<Row extends object, Insert extends object>
    extends PgReadonlyService<Row> {
    async create(payload: Insert): Promise<Row> {
        const record = stripUndefined(toRecord(payload));
        const entries = Object.entries(record);

        if (entries.length === 0) {
            throw new Error(`Cannot insert empty payload into ${this.relation}`);
        }

        const columns = entries.map(([key]) => quoteIdentifier(key)).join(', ');
        const placeholders = entries.map((_, index) => `$${index + 1}`).join(', ');
        const values = entries.map(([, value]) => value);

        const sql = `
      INSERT INTO ${quoteIdentifier(this.relation)} (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;
        const result = await this.executor.query<Row>(sql, values);
        return result.rows[0];
    }

    async createMany(payloads: Insert[]): Promise<Row[]> {
        if (payloads.length === 0) return [];

        const out: Row[] = [];
        for (const payload of payloads) {
            out.push(await this.create(payload));
        }
        return out;
    }

    async delete(where: Partial<Row>): Promise<number> {
        const whereSql = buildWhereClause(toRecord(where));
        const sql = `
      DELETE FROM ${quoteIdentifier(this.relation)}
      ${whereSql.sql}
    `;
        const result = await this.executor.query(sql, whereSql.values);
        return result.rowCount ?? 0;
    }
}

/* -------------------------------------------------------------------------- */
/*                             CONCRETE SERVICES                              */
/* -------------------------------------------------------------------------- */

class PgUsersService extends PgTableService<UserRow, UserInsert, UserPatch> {
    constructor(executor: Queryable) {
        super(executor, 'users');
    }

    findById(id: UUID): Promise<UserRow | null> {
        return this.findOne({ id });
    }

    findByEmail(email: string): Promise<UserRow | null> {
        return this.findOne({ email: email.toLowerCase() });
    }

    listByRole(
        role: ThesisRole,
        query: Omit<ListQuery<UserRow>, 'where'> = {},
    ): Promise<UserRow[]> {
        return this.findMany({
            ...query,
            where: { role },
        });
    }

    setStatus(userId: UUID, status: UserStatus): Promise<UserRow | null> {
        return this.updateOne({ id: userId }, { status, updated_at: nowIso() });
    }

    setAvatarKey(userId: UUID, avatarKey: string | null): Promise<UserRow | null> {
        return this.updateOne(
            { id: userId },
            { avatar_key: avatarKey, updated_at: nowIso() },
        );
    }
}

class PgSessionsService extends PgTableService<SessionRow, SessionInsert, SessionPatch> {
    constructor(executor: Queryable) {
        super(executor, 'sessions');
    }

    findById(id: UUID): Promise<SessionRow | null> {
        return this.findOne({ id });
    }

    findByTokenHash(tokenHash: string): Promise<SessionRow | null> {
        return this.findOne({ token_hash: tokenHash });
    }

    revokeByUser(userId: UUID): Promise<number> {
        return this.delete({ user_id: userId });
    }

    async revokeExpired(now: ISODateTime = nowIso()): Promise<number> {
        const sql = `
      DELETE FROM ${quoteIdentifier('sessions')}
      WHERE ${quoteIdentifier('expires_at')} <= $1
    `;
        const result = await this.executor.query(sql, [now]);
        return result.rowCount ?? 0;
    }
}

class PgPasswordResetsService extends PgTableService<
    PasswordResetRow,
    PasswordResetInsert,
    PasswordResetPatch
> {
    constructor(executor: Queryable) {
        super(executor, 'password_resets');
    }

    findById(id: UUID): Promise<PasswordResetRow | null> {
        return this.findOne({ id });
    }

    findByTokenHash(tokenHash: string): Promise<PasswordResetRow | null> {
        return this.findOne({ token_hash: tokenHash });
    }

    markUsed(id: UUID, usedAt: ISODateTime = nowIso()): Promise<PasswordResetRow | null> {
        return this.updateOne({ id }, { used_at: usedAt });
    }

    async purgeExpired(now: ISODateTime = nowIso()): Promise<number> {
        const sql = `
      DELETE FROM ${quoteIdentifier('password_resets')}
      WHERE ${quoteIdentifier('expires_at')} <= $1 OR ${quoteIdentifier('used_at')} IS NOT NULL
    `;
        const result = await this.executor.query(sql, [now]);
        return result.rowCount ?? 0;
    }
}

class PgThesisGroupsService extends PgTableService<
    ThesisGroupRow,
    ThesisGroupInsert,
    ThesisGroupPatch
> {
    constructor(executor: Queryable) {
        super(executor, 'thesis_groups');
    }

    findById(id: UUID): Promise<ThesisGroupRow | null> {
        return this.findOne({ id });
    }

    listByAdviser(adviserId: UUID): Promise<ThesisGroupRow[]> {
        return this.findMany({
            where: { adviser_id: adviserId },
            orderBy: 'updated_at',
            orderDirection: 'desc',
        });
    }
}

class PgGroupMembersService extends PgJoinTableService<GroupMemberRow, GroupMemberInsert> {
    constructor(executor: Queryable) {
        super(executor, 'group_members');
    }

    listByGroup(groupId: UUID): Promise<GroupMemberRow[]> {
        return this.findMany({ where: { group_id: groupId } });
    }

    listByStudent(studentId: UUID): Promise<GroupMemberRow[]> {
        return this.findMany({ where: { student_id: studentId } });
    }

    removeMember(groupId: UUID, studentId: UUID): Promise<number> {
        return this.delete({
            group_id: groupId,
            student_id: studentId,
        });
    }
}

class PgDefenseSchedulesService extends PgTableService<
    DefenseScheduleRow,
    DefenseScheduleInsert,
    DefenseSchedulePatch
> {
    constructor(executor: Queryable) {
        super(executor, 'defense_schedules');
    }

    findById(id: UUID): Promise<DefenseScheduleRow | null> {
        return this.findOne({ id });
    }

    listByGroup(groupId: UUID): Promise<DefenseScheduleRow[]> {
        return this.findMany({
            where: { group_id: groupId },
            orderBy: 'scheduled_at',
            orderDirection: 'desc',
        });
    }

    async listByPanelist(staffId: UUID): Promise<DefenseScheduleRow[]> {
        const sql = `
      SELECT ds.*
      FROM ${quoteIdentifier('defense_schedules')} ds
      INNER JOIN ${quoteIdentifier('schedule_panelists')} sp
        ON sp.${quoteIdentifier('schedule_id')} = ds.${quoteIdentifier('id')}
      WHERE sp.${quoteIdentifier('staff_id')} = $1
      ORDER BY ds.${quoteIdentifier('scheduled_at')} DESC
    `;
        const result = await this.executor.query<DefenseScheduleRow>(sql, [staffId]);
        return result.rows;
    }

    setStatus(
        id: UUID,
        status: DefenseScheduleRow['status'],
    ): Promise<DefenseScheduleRow | null> {
        return this.updateOne({ id }, { status, updated_at: nowIso() });
    }
}

class PgSchedulePanelistsService extends PgJoinTableService<
    SchedulePanelistRow,
    SchedulePanelistInsert
> {
    constructor(executor: Queryable) {
        super(executor, 'schedule_panelists');
    }

    listBySchedule(scheduleId: UUID): Promise<SchedulePanelistRow[]> {
        return this.findMany({ where: { schedule_id: scheduleId } });
    }

    listByStaff(staffId: UUID): Promise<SchedulePanelistRow[]> {
        return this.findMany({ where: { staff_id: staffId } });
    }

    removePanelist(scheduleId: UUID, staffId: UUID): Promise<number> {
        return this.delete({
            schedule_id: scheduleId,
            staff_id: staffId,
        });
    }
}

class PgRubricTemplatesService extends PgTableService<
    RubricTemplateRow,
    RubricTemplateInsert,
    RubricTemplatePatch
> {
    constructor(executor: Queryable) {
        super(executor, 'rubric_templates');
    }

    findById(id: UUID): Promise<RubricTemplateRow | null> {
        return this.findOne({ id });
    }

    listActive(): Promise<RubricTemplateRow[]> {
        return this.findMany({
            where: { active: true },
            orderBy: 'version',
            orderDirection: 'desc',
        });
    }

    async getActiveLatest(): Promise<RubricTemplateRow | null> {
        const sql = `
      SELECT *
      FROM ${quoteIdentifier('rubric_templates')}
      WHERE ${quoteIdentifier('active')} = TRUE
      ORDER BY ${quoteIdentifier('version')} DESC, ${quoteIdentifier('updated_at')} DESC
      LIMIT 1
    `;
        const result = await this.executor.query<RubricTemplateRow>(sql);
        return result.rows[0] ?? null;
    }

    setActive(templateId: UUID, active: boolean): Promise<RubricTemplateRow | null> {
        return this.updateOne({ id: templateId }, { active, updated_at: nowIso() });
    }
}

class PgRubricCriteriaService extends PgTableService<
    RubricCriteriaRow,
    RubricCriteriaInsert,
    RubricCriteriaPatch
> {
    constructor(executor: Queryable) {
        super(executor, 'rubric_criteria');
    }

    findById(id: UUID): Promise<RubricCriteriaRow | null> {
        return this.findOne({ id });
    }

    listByTemplate(templateId: UUID): Promise<RubricCriteriaRow[]> {
        return this.findMany({
            where: { template_id: templateId },
            orderBy: 'created_at',
            orderDirection: 'asc',
        });
    }
}

class PgEvaluationsService extends PgTableService<
    EvaluationRow,
    EvaluationInsert,
    EvaluationPatch
> {
    constructor(executor: Queryable) {
        super(executor, 'evaluations');
    }

    findById(id: UUID): Promise<EvaluationRow | null> {
        return this.findOne({ id });
    }

    listBySchedule(scheduleId: UUID): Promise<EvaluationRow[]> {
        return this.findMany({
            where: { schedule_id: scheduleId },
            orderBy: 'created_at',
            orderDirection: 'desc',
        });
    }

    listByEvaluator(evaluatorId: UUID): Promise<EvaluationRow[]> {
        return this.findMany({
            where: { evaluator_id: evaluatorId },
            orderBy: 'created_at',
            orderDirection: 'desc',
        });
    }

    submit(
        evaluationId: UUID,
        submittedAt: ISODateTime = nowIso(),
    ): Promise<EvaluationRow | null> {
        return this.updateOne(
            { id: evaluationId },
            { status: 'submitted' as EvaluationStatus, submitted_at: submittedAt },
        );
    }

    lock(
        evaluationId: UUID,
        lockedAt: ISODateTime = nowIso(),
    ): Promise<EvaluationRow | null> {
        return this.updateOne(
            { id: evaluationId },
            { status: 'locked' as EvaluationStatus, locked_at: lockedAt },
        );
    }

    setStatus(
        evaluationId: UUID,
        status: EvaluationStatus,
    ): Promise<EvaluationRow | null> {
        return this.updateOne({ id: evaluationId }, { status });
    }
}

class PgEvaluationScoresService extends PgTableService<
    EvaluationScoreRow,
    EvaluationScoreInsert,
    EvaluationScorePatch
> {
    constructor(executor: Queryable) {
        super(executor, 'evaluation_scores');
    }

    listByEvaluation(evaluationId: UUID): Promise<EvaluationScoreRow[]> {
        return this.findMany({
            where: { evaluation_id: evaluationId },
            orderBy: 'criterion_id',
            orderDirection: 'asc',
        });
    }

    async upsertScore(payload: EvaluationScoreInsert): Promise<EvaluationScoreRow> {
        const sql = `
      INSERT INTO ${quoteIdentifier('evaluation_scores')} (
        ${quoteIdentifier('evaluation_id')},
        ${quoteIdentifier('criterion_id')},
        ${quoteIdentifier('score')},
        ${quoteIdentifier('comment')}
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (${quoteIdentifier('evaluation_id')}, ${quoteIdentifier('criterion_id')})
      DO UPDATE SET
        ${quoteIdentifier('score')} = EXCLUDED.${quoteIdentifier('score')},
        ${quoteIdentifier('comment')} = EXCLUDED.${quoteIdentifier('comment')}
      RETURNING *
    `;
        const result = await this.executor.query<EvaluationScoreRow>(sql, [
            payload.evaluation_id,
            payload.criterion_id,
            payload.score,
            payload.comment ?? null,
        ]);
        return result.rows[0];
    }
}

class PgAuditLogsService extends PgTableService<AuditLogRow, AuditLogInsert, AuditLogPatch> {
    constructor(executor: Queryable) {
        super(executor, 'audit_logs');
    }

    findById(id: UUID): Promise<AuditLogRow | null> {
        return this.findOne({ id });
    }

    listByActor(actorId: UUID): Promise<AuditLogRow[]> {
        return this.findMany({
            where: { actor_id: actorId },
            orderBy: 'created_at',
            orderDirection: 'desc',
        });
    }

    listByEntity(entity: string, entityId?: UUID): Promise<AuditLogRow[]> {
        return this.findMany({
            where: entityId ? { entity, entity_id: entityId } : { entity },
            orderBy: 'created_at',
            orderDirection: 'desc',
        });
    }
}

class PgStudentsService extends PgTableService<StudentRow, StudentInsert, StudentPatch> {
    constructor(executor: Queryable) {
        super(executor, 'students');
    }

    findByUserId(userId: UUID): Promise<StudentRow | null> {
        return this.findOne({ user_id: userId });
    }
}

class PgStaffProfilesService extends PgTableService<
    StaffProfileRow,
    StaffProfileInsert,
    StaffProfilePatch
> {
    constructor(executor: Queryable) {
        super(executor, 'staff_profiles');
    }

    findByUserId(userId: UUID): Promise<StaffProfileRow | null> {
        return this.findOne({ user_id: userId });
    }
}

class PgStudentEvaluationsService extends PgTableService<
    StudentEvaluationRow,
    StudentEvaluationInsert,
    StudentEvaluationPatch
> {
    constructor(executor: Queryable) {
        super(executor, 'student_evaluations');
    }

    findById(id: UUID): Promise<StudentEvaluationRow | null> {
        return this.findOne({ id });
    }

    listBySchedule(scheduleId: UUID): Promise<StudentEvaluationRow[]> {
        return this.findMany({
            where: { schedule_id: scheduleId },
            orderBy: 'created_at',
            orderDirection: 'desc',
        });
    }

    listByStudent(studentId: UUID): Promise<StudentEvaluationRow[]> {
        return this.findMany({
            where: { student_id: studentId },
            orderBy: 'created_at',
            orderDirection: 'desc',
        });
    }

    submit(id: UUID, submittedAt: ISODateTime = nowIso()): Promise<StudentEvaluationRow | null> {
        return this.updateOne(
            { id },
            {
                status: 'submitted' as StudentEvalStatus,
                submitted_at: submittedAt,
                updated_at: nowIso(),
            },
        );
    }

    lock(id: UUID, lockedAt: ISODateTime = nowIso()): Promise<StudentEvaluationRow | null> {
        return this.updateOne(
            { id },
            {
                status: 'locked' as StudentEvalStatus,
                locked_at: lockedAt,
                updated_at: nowIso(),
            },
        );
    }

    setStatus(id: UUID, status: StudentEvalStatus): Promise<StudentEvaluationRow | null> {
        return this.updateOne({ id }, { status, updated_at: nowIso() });
    }
}

/**
 * MISSING BEFORE:
 * student_evaluation_scores concrete service.
 * Needed by StudentFeedbackService + EntityServiceMap coverage.
 */
class PgStudentEvaluationScoresService extends PgTableService<
    StudentEvaluationScoreRow,
    StudentEvaluationScoreInsert,
    StudentEvaluationScorePatch
> {
    constructor(executor: Queryable) {
        super(executor, 'student_evaluation_scores');
    }

    findById(id: UUID): Promise<StudentEvaluationScoreRow | null> {
        return this.findOne({ id });
    }

    findByStudentEvaluationId(studentEvaluationId: UUID): Promise<StudentEvaluationScoreRow | null> {
        return this.findOne({ student_evaluation_id: studentEvaluationId });
    }

    listBySchedule(scheduleId: UUID): Promise<StudentEvaluationScoreRow[]> {
        return this.findMany({
            where: { schedule_id: scheduleId },
            orderBy: 'computed_at',
            orderDirection: 'desc',
        });
    }

    listByStudent(studentId: UUID): Promise<StudentEvaluationScoreRow[]> {
        return this.findMany({
            where: { student_id: studentId },
            orderBy: 'computed_at',
            orderDirection: 'desc',
        });
    }
}

class PgEvaluationExtrasService extends PgTableService<
    EvaluationExtraRow,
    EvaluationExtraInsert,
    EvaluationExtraPatch
> {
    constructor(executor: Queryable) {
        super(executor, 'evaluation_extras');
    }

    findByEvaluationId(evaluationId: UUID): Promise<EvaluationExtraRow | null> {
        return this.findOne({ evaluation_id: evaluationId });
    }
}

class PgPanelistProfilesService extends PgTableService<
    PanelistProfileRow,
    PanelistProfileInsert,
    PanelistProfilePatch
> {
    constructor(executor: Queryable) {
        super(executor, 'panelist_profiles');
    }

    findByUserId(userId: UUID): Promise<PanelistProfileRow | null> {
        return this.findOne({ user_id: userId });
    }
}

class PgRubricScaleLevelsService extends PgTableService<
    RubricScaleLevelRow,
    RubricScaleLevelInsert,
    RubricScaleLevelPatch
> {
    constructor(executor: Queryable) {
        super(executor, 'rubric_scale_levels');
    }

    listByTemplate(templateId: UUID): Promise<RubricScaleLevelRow[]> {
        return this.findMany({
            where: { template_id: templateId },
            orderBy: 'score',
            orderDirection: 'asc',
        });
    }

    findByTemplateAndScore(
        templateId: UUID,
        score: number,
    ): Promise<RubricScaleLevelRow | null> {
        return this.findOne({
            template_id: templateId,
            score,
        });
    }
}

class PgNotificationsService extends PgTableService<
    NotificationRow,
    NotificationInsert,
    NotificationPatch
> {
    constructor(executor: Queryable) {
        super(executor, 'notifications');
    }

    findById(id: UUID): Promise<NotificationRow | null> {
        return this.findOne({ id });
    }

    listByUser(
        userId: UUID,
        query: Omit<ListQuery<NotificationRow>, 'where'> = {},
    ): Promise<NotificationRow[]> {
        return this.findMany({
            ...query,
            where: { user_id: userId },
        });
    }

    listUnread(userId: UUID, limit = 50): Promise<NotificationRow[]> {
        return this.findMany({
            where: { user_id: userId, read_at: null },
            orderBy: 'created_at',
            orderDirection: 'desc',
            limit,
        });
    }

    listByType(
        userId: UUID,
        type: NotificationType,
        query: Omit<ListQuery<NotificationRow>, 'where'> = {},
    ): Promise<NotificationRow[]> {
        return this.findMany({
            ...query,
            where: { user_id: userId, type },
        });
    }

    markAsRead(id: UUID, readAt: ISODateTime = nowIso()): Promise<NotificationRow | null> {
        return this.updateOne({ id }, { read_at: readAt });
    }

    async markAllAsRead(userId: UUID, readAt: ISODateTime = nowIso()): Promise<number> {
        const sql = `
      UPDATE ${quoteIdentifier('notifications')}
      SET ${quoteIdentifier('read_at')} = $1
      WHERE ${quoteIdentifier('user_id')} = $2
        AND ${quoteIdentifier('read_at')} IS NULL
    `;
        const result = await this.executor.query(sql, [readAt, userId]);
        return result.rowCount ?? 0;
    }

    async createForUsers(
        userIds: UUID[],
        payload: NotificationBroadcastPayload,
    ): Promise<NotificationRow[]> {
        const cleaned = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
        if (cleaned.length === 0) return [];

        const inserts = cleaned.map((userId) => ({
            ...payload,
            user_id: userId,
        })) as NotificationInsert[];

        return this.createMany(inserts);
    }
}

/**
 * MISSING BEFORE:
 * student_feedback_forms concrete service.
 * Needed by StudentFeedbackService + AdminRoute(/student-feedback/forms) + EntityServiceMap coverage.
 */
class PgStudentFeedbackFormsService extends PgTableService<
    StudentFeedbackFormRow,
    StudentFeedbackFormInsert,
    StudentFeedbackFormPatch
> {
    constructor(executor: Queryable) {
        super(executor, 'student_feedback_forms');
    }

    findById(id: UUID): Promise<StudentFeedbackFormRow | null> {
        return this.findOne({ id });
    }

    listActive(
        query: Omit<ListQuery<StudentFeedbackFormRow>, 'where'> = {},
    ): Promise<StudentFeedbackFormRow[]> {
        return this.findMany({
            ...query,
            where: { active: true },
            orderBy: query.orderBy ?? 'version',
            orderDirection: query.orderDirection ?? 'desc',
        });
    }

    async getActiveLatest(): Promise<StudentFeedbackFormRow | null> {
        const sql = `
      SELECT *
      FROM ${quoteIdentifier('student_feedback_forms')}
      WHERE ${quoteIdentifier('active')} = TRUE
      ORDER BY ${quoteIdentifier('version')} DESC, ${quoteIdentifier('updated_at')} DESC
      LIMIT 1
    `;
        const result = await this.executor.query<StudentFeedbackFormRow>(sql);
        return result.rows[0] ?? null;
    }

    setActive(formId: UUID, active: boolean): Promise<StudentFeedbackFormRow | null> {
        return this.updateOne(
            { id: formId },
            { active, updated_at: nowIso() } as StudentFeedbackFormPatch,
        );
    }
}

class PgPushSubscriptionsService extends PgTableService<
    PushSubscriptionRow,
    PushSubscriptionInsert,
    PushSubscriptionPatch
> {
    private ensureTablePromise: Promise<void> | null = null;

    constructor(executor: Queryable) {
        super(executor, 'public.push_subscriptions');
    }

    private async ensureTableReady(): Promise<void> {
        if (!this.ensureTablePromise) {
            this.ensureTablePromise = (async () => {
                const table = quoteIdentifier(this.relation);

                await this.executor.query(`
          CREATE TABLE IF NOT EXISTS ${table} (
            ${quoteIdentifier('id')} UUID PRIMARY KEY,
            ${quoteIdentifier('user_id')} UUID NOT NULL
              REFERENCES ${quoteIdentifier('public.users')}(${quoteIdentifier('id')})
              ON DELETE CASCADE,
            ${quoteIdentifier('endpoint')} TEXT NOT NULL UNIQUE,
            ${quoteIdentifier('p256dh')} TEXT NOT NULL,
            ${quoteIdentifier('auth')} TEXT NOT NULL,
            ${quoteIdentifier('content_encoding')} TEXT NULL,
            ${quoteIdentifier('subscription')} JSONB NOT NULL DEFAULT '{}'::jsonb,
            ${quoteIdentifier('created_at')} TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ${quoteIdentifier('updated_at')} TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

                await this.executor.query(`
          CREATE INDEX IF NOT EXISTS ${quoteIdentifier('idx_push_subscriptions_user_id')}
          ON ${table} (${quoteIdentifier('user_id')})
        `);

                await this.executor.query(`
          CREATE INDEX IF NOT EXISTS ${quoteIdentifier('idx_push_subscriptions_updated_at')}
          ON ${table} (${quoteIdentifier('updated_at')} DESC)
        `);
            })().catch((error) => {
                this.ensureTablePromise = null;
                throw error;
            });
        }

        return this.ensureTablePromise;
    }

    private async withReady<T>(work: () => Promise<T>): Promise<T> {
        await this.ensureTableReady();
        return work();
    }

    private normalizeCreatePayload(payload: PushSubscriptionInsert): PushSubscriptionInsert {
        const record = stripUndefined(toRecord(payload));
        const createdAtRaw = typeof record.created_at === 'string' ? record.created_at.trim() : '';
        const updatedAtRaw = typeof record.updated_at === 'string' ? record.updated_at.trim() : '';
        const now = nowIso();

        const endpoint = typeof record.endpoint === 'string' ? record.endpoint : '';
        const p256dh = typeof record.p256dh === 'string' ? record.p256dh : '';
        const auth = typeof record.auth === 'string' ? record.auth : '';

        const contentEncoding =
            typeof record.content_encoding === 'string'
                ? record.content_encoding.trim()
                : record.content_encoding === null
                    ? null
                    : 'aes128gcm';

        const rawSubscription = record.subscription;
        const subscription = isPlainObject(rawSubscription)
            ? rawSubscription
            : {
                endpoint,
                keys: { p256dh, auth },
                expirationTime: null,
            };

        return {
            ...payload,
            ...(record.id ? { id: record.id } : { id: randomUUID() }),
            content_encoding: contentEncoding,
            subscription,
            created_at: createdAtRaw.length > 0 ? (createdAtRaw as ISODateTime) : now,
            updated_at: updatedAtRaw.length > 0 ? (updatedAtRaw as ISODateTime) : now,
        } as unknown as PushSubscriptionInsert;
    }

    private normalizePatchPayload(patch: PushSubscriptionPatch): PushSubscriptionPatch {
        const out = stripUndefined(toRecord(patch)) as PushSubscriptionPatch;
        if (!out.updated_at) {
            out.updated_at = nowIso();
        }
        return out;
    }

    async findOne(where: Partial<PushSubscriptionRow>): Promise<PushSubscriptionRow | null> {
        return this.withReady(() => super.findOne(where));
    }

    async findMany(query: ListQuery<PushSubscriptionRow> = {}): Promise<PushSubscriptionRow[]> {
        return this.withReady(() => super.findMany(query));
    }

    async count(where?: Partial<PushSubscriptionRow>): Promise<number> {
        return this.withReady(() => super.count(where));
    }

    async exists(where: Partial<PushSubscriptionRow>): Promise<boolean> {
        return this.withReady(() => super.exists(where));
    }

    async findPage(query: ListQuery<PushSubscriptionRow> = {}): Promise<PageResult<PushSubscriptionRow>> {
        return this.withReady(() => super.findPage(query));
    }

    async create(payload: PushSubscriptionInsert): Promise<PushSubscriptionRow> {
        return this.withReady(() => super.create(this.normalizeCreatePayload(payload)));
    }

    async createMany(payloads: PushSubscriptionInsert[]): Promise<PushSubscriptionRow[]> {
        return this.withReady(async () => {
            if (payloads.length === 0) return [];
            const out: PushSubscriptionRow[] = [];
            for (const payload of payloads) {
                out.push(await super.create(this.normalizeCreatePayload(payload)));
            }
            return out;
        });
    }

    async update(
        where: Partial<PushSubscriptionRow>,
        patch: PushSubscriptionPatch,
    ): Promise<PushSubscriptionRow[]> {
        return this.withReady(() => super.update(where, this.normalizePatchPayload(patch)));
    }

    async updateOne(
        where: Partial<PushSubscriptionRow>,
        patch: PushSubscriptionPatch,
    ): Promise<PushSubscriptionRow | null> {
        return this.withReady(() => super.updateOne(where, this.normalizePatchPayload(patch)));
    }

    async delete(where: Partial<PushSubscriptionRow>): Promise<number> {
        return this.withReady(() => super.delete(where));
    }

    async upsert(
        where: Partial<PushSubscriptionRow>,
        create: PushSubscriptionInsert,
        patch?: PushSubscriptionPatch,
    ): Promise<PushSubscriptionRow> {
        return this.withReady(() =>
            super.upsert(
                where,
                this.normalizeCreatePayload(create),
                patch ? this.normalizePatchPayload(patch) : undefined,
            ),
        );
    }

    findById(id: UUID): Promise<PushSubscriptionRow | null> {
        return this.findOne({ id });
    }

    findByEndpoint(endpoint: string): Promise<PushSubscriptionRow | null> {
        return this.findOne({ endpoint });
    }

    listByUser(userId: UUID): Promise<PushSubscriptionRow[]> {
        return this.findMany({
            where: { user_id: userId },
            orderBy: 'updated_at',
            orderDirection: 'desc',
        });
    }

    async listByUsers(userIds: UUID[]): Promise<PushSubscriptionRow[]> {
        return this.withReady(async () => {
            const cleaned = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
            if (cleaned.length === 0) return [];

            const sql = `
        SELECT *
        FROM ${quoteIdentifier(this.relation)}
        WHERE ${quoteIdentifier('user_id')} = ANY($1::uuid[])
        ORDER BY ${quoteIdentifier('updated_at')} DESC
      `;
            const result = await this.executor.query<PushSubscriptionRow>(sql, [cleaned]);
            return result.rows;
        });
    }

    deleteByEndpoint(endpoint: string): Promise<number> {
        return this.delete({ endpoint });
    }
}

class PgEvaluationOverallPercentagesViewService extends PgReadonlyService<EvaluationOverallPercentageRow> {
    constructor(executor: Queryable) {
        super(executor, 'v_evaluation_overall_percentages');
    }

    listBySchedule(scheduleId: UUID): Promise<EvaluationOverallPercentageRow[]> {
        return this.findMany({
            where: { schedule_id: scheduleId },
            orderBy: 'created_at',
            orderDirection: 'desc',
        });
    }

    listByGroup(groupId: UUID): Promise<EvaluationOverallPercentageRow[]> {
        return this.findMany({
            where: { group_id: groupId },
            orderBy: 'created_at',
            orderDirection: 'desc',
        });
    }

    listByEvaluator(evaluatorId: UUID): Promise<EvaluationOverallPercentageRow[]> {
        return this.findMany({
            where: { evaluator_id: evaluatorId },
            orderBy: 'created_at',
            orderDirection: 'desc',
        });
    }
}

class PgThesisGroupRankingsViewService extends PgReadonlyService<ThesisGroupRankingRow> {
    constructor(executor: Queryable) {
        super(executor, 'v_thesis_group_rankings');
    }

    async leaderboard(limit = 50): Promise<ThesisGroupRankingRow[]> {
        const safeLimit = normalizeLimit(limit) ?? 50;
        const sql = `
      SELECT *
      FROM ${quoteIdentifier('v_thesis_group_rankings')}
      ORDER BY ${quoteIdentifier('rank')} ASC
      LIMIT ${safeLimit}
    `;
        const result = await this.executor.query<ThesisGroupRankingRow>(sql);
        return result.rows;
    }

    byGroup(groupId: UUID): Promise<ThesisGroupRankingRow | null> {
        return this.findOne({ group_id: groupId });
    }
}

/* -------------------------------------------------------------------------- */
/*                             SERVICES FACTORY                               */
/* -------------------------------------------------------------------------- */

function buildEntityServices(executor: Queryable): EntityServiceMap {
    return {
        users: new PgUsersService(executor),
        sessions: new PgSessionsService(executor),
        password_resets: new PgPasswordResetsService(executor),
        thesis_groups: new PgThesisGroupsService(executor),
        group_members: new PgGroupMembersService(executor),
        defense_schedules: new PgDefenseSchedulesService(executor),
        schedule_panelists: new PgSchedulePanelistsService(executor),
        rubric_templates: new PgRubricTemplatesService(executor),
        rubric_criteria: new PgRubricCriteriaService(executor),
        evaluations: new PgEvaluationsService(executor),
        evaluation_scores: new PgEvaluationScoresService(executor),
        audit_logs: new PgAuditLogsService(executor),
        students: new PgStudentsService(executor),
        staff_profiles: new PgStaffProfilesService(executor),
        student_evaluations: new PgStudentEvaluationsService(executor),

        // ✅ FIX: missing concrete services required by EntityServiceMap
        student_evaluation_scores: new PgStudentEvaluationScoresService(executor),
        student_feedback_forms: new PgStudentFeedbackFormsService(executor),

        evaluation_extras: new PgEvaluationExtrasService(executor),
        panelist_profiles: new PgPanelistProfilesService(executor),
        rubric_scale_levels: new PgRubricScaleLevelsService(executor),
        notifications: new PgNotificationsService(executor),
        push_subscriptions: new PgPushSubscriptionsService(executor),
        v_evaluation_overall_percentages: new PgEvaluationOverallPercentagesViewService(executor),
        v_thesis_group_rankings: new PgThesisGroupRankingsViewService(executor),
    };
}

async function runTransaction<T>(
    executor: Queryable,
    work: (services: DatabaseServices) => Promise<T>,
): Promise<T> {
    if (isPool(executor)) {
        const client = await executor.connect();
        try {
            await client.query('BEGIN');
            const txServices = createPgDatabaseServices(client);
            const out = await work(txServices);
            await client.query('COMMIT');
            return out;
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // ignore rollback error, keep original error
            }
            throw error;
        } finally {
            client.release();
        }
    }

    // Nested transaction / already inside client scope -> SAVEPOINT
    const client = executor as PoolClient;
    const savepoint = nextSavepointName();

    await client.query(`SAVEPOINT ${savepoint}`);
    try {
        const nestedServices = createPgDatabaseServices(client);
        const out = await work(nestedServices);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        return out;
    } catch (error) {
        try {
            await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        } catch {
            // ignore rollback error, keep original error
        }
        throw error;
    }
}

export function createPgDatabaseServices(executor: Queryable = db): DatabaseServices {
    const entities = buildEntityServices(executor);

    const services: DatabaseServices = {
        ...entities,

        get<K extends DbEntityName>(entity: K): EntityServiceMap[K] {
            return entities[entity];
        },

        async transaction<T>(work: (services: DatabaseServices) => Promise<T>): Promise<T> {
            return runTransaction(executor, work);
        },
    };

    return services;
}
