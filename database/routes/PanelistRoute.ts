import { NextRequest, NextResponse } from 'next/server';

import { PanelistController } from '../controllers/PanelistController';
import { USER_STATUSES, type JsonObject, type UserRow, type UUID } from '../models/Model';
import type { DatabaseServices, ListQuery } from '../services/Services';
import {
    isRecord,
    isUniqueViolation,
    isUuidLike,
    json200,
    json201,
    json400,
    json404Api,
    json404Entity,
    json405,
    omitWhere,
    parseListQuery,
    readJsonRecord,
    toErrorMessage,
    toNonEmptyString,
    toUserStatus,
} from './Route';

type EvaluationTargetType = 'group' | 'student';

type EvaluationScoresControllerLike = {
    findMany?: (query: ListQuery<Record<string, unknown>>) => Promise<unknown[]>;
    create?: (input: Record<string, unknown>) => Promise<unknown>;
    updateOne?: (
        where: Record<string, unknown>,
        patch: Record<string, unknown>,
    ) => Promise<unknown | null>;
    delete?: (where: Record<string, unknown>) => Promise<number>;
    listByEvaluation?: (evaluationId: UUID) => Promise<unknown[]>;
};

type EvaluationExtrasControllerLike = {
    findMany?: (query: ListQuery<Record<string, unknown>>) => Promise<unknown[]>;
    create?: (input: Record<string, unknown>) => Promise<unknown>;
    updateOne?: (
        where: Record<string, unknown>,
        patch: Record<string, unknown>,
    ) => Promise<unknown | null>;
    findById?: (id: UUID) => Promise<unknown | null>;
};

type EvaluationLikeController = {
    findById?: (id: UUID) => Promise<unknown | null>;
    findMany?: (query: ListQuery<Record<string, unknown>>) => Promise<unknown[]>;
};

type ServicesWithLooseGet = {
    get?: (key: string) => unknown;
};

function tryGetServiceByAnyKey(
    services: DatabaseServices,
    key: string,
): unknown | null {
    const getter = (services as unknown as ServicesWithLooseGet).get;
    if (typeof getter !== 'function') return null;

    try {
        const value = getter.call(services, key);
        return value ?? null;
    } catch {
        return null;
    }
}

function normalizePanelistTail(tail: string[]): string[] {
    const clean = tail.filter((segment) => typeof segment === 'string' && segment.trim().length > 0);

    let offset = 0;
    if (clean[offset]?.toLowerCase() === 'api') offset += 1;
    if (
        clean[offset]?.toLowerCase() === 'panelist' ||
        clean[offset]?.toLowerCase() === 'panelists'
    ) {
        offset += 1;
    }

    return clean.slice(offset);
}

const PANELIST_EVALUATION_SEGMENTS = [
    'notes',
    'note',
    'private-notes',
    'private-panel-notes',
    'scores',
    'score',
] as const;

type PanelistEvaluationSegment = (typeof PANELIST_EVALUATION_SEGMENTS)[number];

function isPanelistEvaluationSegment(value: string | undefined): value is PanelistEvaluationSegment {
    if (!value) return false;
    return (PANELIST_EVALUATION_SEGMENTS as readonly string[]).includes(value);
}

function resolvePanelistSegment(
    routeTail: string[],
    startIndex: number,
): PanelistEvaluationSegment | null {
    const direct = routeTail[startIndex]?.toLowerCase();
    if (isPanelistEvaluationSegment(direct)) return direct;

    const first = routeTail[startIndex]?.toLowerCase();
    const second = routeTail[startIndex + 1]?.toLowerCase();

    // Supports /private/notes and /private/panel-notes variants
    if (first === 'private' && (second === 'notes' || second === 'note')) {
        return 'private-notes';
    }
    if (first === 'private' && second === 'panel-notes') {
        return 'private-panel-notes';
    }

    return null;
}

type ResolvedPanelistEvaluationRoute = {
    routeTail: string[];
    evaluationId: UUID;
    segment: PanelistEvaluationSegment;
};

/**
 * Supports both route shapes:
 * 1) /api/panelist/evaluations/:evaluationId/:segment
 * 2) /api/panelist/:evaluationId/:segment   (legacy/alternate catch-all shape)
 */
function resolvePanelistEvaluationRoute(tail: string[]): ResolvedPanelistEvaluationRoute | null {
    const routeTail = normalizePanelistTail(tail);

    // Canonical: evaluations/:id/:segment
    if (
        routeTail.length >= 3 &&
        routeTail[0]?.toLowerCase() === 'evaluations' &&
        isUuidLike(routeTail[1])
    ) {
        const segment = resolvePanelistSegment(routeTail, 2);
        if (!segment) return null;

        return {
            routeTail,
            evaluationId: routeTail[1] as UUID,
            segment,
        };
    }

    // Alternate: :id/:segment
    if (routeTail.length >= 2 && isUuidLike(routeTail[0])) {
        const segment = resolvePanelistSegment(routeTail, 1);
        if (!segment) return null;

        return {
            routeTail: ['evaluations', routeTail[0], ...routeTail.slice(1)],
            evaluationId: routeTail[0] as UUID,
            segment,
        };
    }

    return null;
}

function resolveEvaluationScoresController(
    services: DatabaseServices,
): EvaluationScoresControllerLike | null {
    if ((services as Partial<DatabaseServices>).evaluation_scores) {
        return (services as Partial<DatabaseServices>)
            .evaluation_scores as unknown as EvaluationScoresControllerLike;
    }

    const maybeCamel = (
        services as unknown as {
            evaluationScores?: EvaluationScoresControllerLike;
        }
    ).evaluationScores;
    if (maybeCamel) return maybeCamel;

    const viaRegistry = tryGetServiceByAnyKey(services, 'evaluation_scores');
    if (viaRegistry) return viaRegistry as EvaluationScoresControllerLike;

    return null;
}

function isEvaluationExtrasControllerLike(value: unknown): value is EvaluationExtrasControllerLike {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as EvaluationExtrasControllerLike;
    return (
        typeof candidate.findMany === 'function' ||
        typeof candidate.create === 'function' ||
        typeof candidate.updateOne === 'function' ||
        typeof candidate.findById === 'function'
    );
}

function resolveEvaluationExtrasController(
    services: DatabaseServices,
): EvaluationExtrasControllerLike | null {
    const directCandidates: unknown[] = [
        (services as Partial<DatabaseServices>).evaluation_extras,
        (services as unknown as { evaluationExtras?: unknown }).evaluationExtras,
        (services as unknown as { evaluation_extra?: unknown }).evaluation_extra,
        (services as unknown as { evaluationExtra?: unknown }).evaluationExtra,
    ];

    for (const candidate of directCandidates) {
        if (isEvaluationExtrasControllerLike(candidate)) {
            return candidate;
        }
    }

    const registryKeys = [
        'evaluation_extras',
        'evaluation_extra',
        'evaluationExtras',
        'evaluationExtra',
    ] as const;

    for (const key of registryKeys) {
        const viaRegistry = tryGetServiceByAnyKey(services, key);
        if (isEvaluationExtrasControllerLike(viaRegistry)) {
            return viaRegistry;
        }
    }

    const dynamicEntries = Object.entries(services as unknown as Record<string, unknown>);
    for (const [key, value] of dynamicEntries) {
        const lowered = key.toLowerCase();
        if (!lowered.includes('evaluation') || !lowered.includes('extra')) continue;
        if (isEvaluationExtrasControllerLike(value)) {
            return value;
        }
    }

    return null;
}

function isEvaluationLikeController(value: unknown): value is EvaluationLikeController {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as EvaluationLikeController;
    return (
        typeof candidate.findById === 'function' ||
        typeof candidate.findMany === 'function'
    );
}

function resolveEvaluationController(services: DatabaseServices): EvaluationLikeController | null {
    const directCandidates: unknown[] = [
        (services as Partial<DatabaseServices>).evaluations,
        (services as unknown as { evaluation?: unknown }).evaluation,
        (services as unknown as { evaluationsController?: unknown }).evaluationsController,
    ];

    for (const candidate of directCandidates) {
        if (isEvaluationLikeController(candidate)) return candidate;
    }

    const registryKeys = ['evaluations', 'evaluation'] as const;
    for (const key of registryKeys) {
        const viaRegistry = tryGetServiceByAnyKey(services, key);
        if (isEvaluationLikeController(viaRegistry)) {
            return viaRegistry;
        }
    }

    return null;
}

function resolveDefenseSchedulesController(services: DatabaseServices): EvaluationLikeController | null {
    const directCandidates: unknown[] = [
        (services as Partial<DatabaseServices>).defense_schedules,
        (services as unknown as { defenseSchedules?: unknown }).defenseSchedules,
        (services as unknown as { defense_schedule?: unknown }).defense_schedule,
        (services as unknown as { schedules?: unknown }).schedules,
    ];

    for (const candidate of directCandidates) {
        if (isEvaluationLikeController(candidate)) return candidate;
    }

    const registryKeys = [
        'defense_schedules',
        'defenseSchedules',
        'defense_schedule',
        'schedules',
        'schedule',
    ] as const;

    for (const key of registryKeys) {
        const viaRegistry = tryGetServiceByAnyKey(services, key);
        if (isEvaluationLikeController(viaRegistry)) {
            return viaRegistry;
        }
    }

    return null;
}

async function findOneById(
    controller: EvaluationLikeController,
    id: UUID,
): Promise<Record<string, unknown> | null> {
    if (typeof controller.findById === 'function') {
        const row = await controller.findById(id);
        if (isRecord(row)) return row as Record<string, unknown>;
    }

    if (typeof controller.findMany === 'function') {
        const rows = await controller.findMany({
            where: { id },
            limit: 1,
        } as ListQuery<Record<string, unknown>>);

        if (Array.isArray(rows) && rows.length > 0 && isRecord(rows[0])) {
            return rows[0] as Record<string, unknown>;
        }
    }

    return null;
}

async function resolveCanonicalGroupContextForEvaluation(
    services: DatabaseServices,
    evaluationId: UUID,
): Promise<{ scheduleId: UUID | null; groupId: UUID | null }> {
    const evaluations = resolveEvaluationController(services);
    if (!evaluations) {
        return { scheduleId: null, groupId: null };
    }

    const evaluationRow = await findOneById(evaluations, evaluationId);
    if (!evaluationRow) {
        return { scheduleId: null, groupId: null };
    }

    const scheduleId = pickUuid([
        evaluationRow.schedule_id,
        evaluationRow.scheduleId,
    ]);

    if (!scheduleId) {
        return { scheduleId: null, groupId: null };
    }

    const schedules = resolveDefenseSchedulesController(services);
    if (!schedules) {
        return { scheduleId, groupId: null };
    }

    const scheduleRow = await findOneById(schedules, scheduleId as UUID);
    if (!scheduleRow) {
        return { scheduleId, groupId: null };
    }

    const groupId = pickUuid([
        scheduleRow.group_id,
        scheduleRow.groupId,
    ]);

    return {
        scheduleId: scheduleId as UUID,
        groupId: groupId as UUID | null,
    };
}

function pickUuid(candidates: unknown[]): string | null {
    for (const value of candidates) {
        const parsed = toNonEmptyString(value);
        if (parsed && isUuidLike(parsed)) return parsed;
    }
    return null;
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function sameUuid(left: string, right: string): boolean {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function toTargetType(value: unknown): EvaluationTargetType | null {
    const raw = toNonEmptyString(value)?.toLowerCase();
    if (!raw) return null;
    if (raw === 'group') return 'group';
    if (raw === 'student' || raw === 'individual') return 'student';
    return null;
}

function normalizeEvaluationScorePayload(
    body: Record<string, unknown>,
    scopedEvaluationId: UUID,
): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    const evaluationId = pickUuid([
        scopedEvaluationId,
        body.evaluation_id,
        body.evaluationId,
        body.eval_id,
        body.evalId,
    ]);
    if (evaluationId) out.evaluation_id = evaluationId;

    const criterionId = pickUuid([
        body.criterion_id,
        body.criterionId,
        body.criteria_id,
        body.criteriaId,
        body.rubric_criterion_id,
        body.rubricCriterionId,
    ]);
    if (criterionId) out.criterion_id = criterionId;

    const studentId = pickUuid([body.student_id, body.studentId]);
    const groupId = pickUuid([body.group_id, body.groupId]);

    const explicitTargetType = toTargetType(
        body.target_type ??
        body.targetType ??
        body.subject_type ??
        body.subjectType,
    );

    const targetType: EvaluationTargetType | null =
        explicitTargetType ?? (studentId ? 'student' : groupId ? 'group' : null);

    if (targetType) out.target_type = targetType;

    let targetId: string | null = null;

    if (targetType === 'student') {
        targetId = pickUuid([
            studentId,
            body.target_id,
            body.targetId,
            body.subject_id,
            body.subjectId,
        ]);
    } else if (targetType === 'group') {
        targetId = pickUuid([
            groupId,
            body.target_id,
            body.targetId,
            body.subject_id,
            body.subjectId,
        ]);
    } else {
        targetId = pickUuid([
            body.target_id,
            body.targetId,
            body.subject_id,
            body.subjectId,
            studentId,
            groupId,
        ]);
    }

    if (targetId) out.target_id = targetId;

    const scoreRaw = hasOwn(body, 'score') ? body.score : body.value;
    if (typeof scoreRaw === 'number' && Number.isFinite(scoreRaw)) {
        out.score = scoreRaw;
    } else if (typeof scoreRaw === 'string' && scoreRaw.trim().length > 0) {
        const parsed = Number(scoreRaw);
        if (Number.isFinite(parsed)) out.score = parsed;
    }

    if (hasOwn(body, 'comment')) {
        const commentRaw = body.comment;
        if (commentRaw === null || typeof commentRaw === 'string') {
            out.comment = commentRaw;
        } else {
            out.comment = null;
        }
    }

    return out;
}

async function normalizeEvaluationScorePayloadForWrite(
    body: Record<string, unknown>,
    scopedEvaluationId: UUID,
    services: DatabaseServices,
): Promise<Record<string, unknown>> {
    const normalized = normalizeEvaluationScorePayload(body, scopedEvaluationId);
    const explicitStudentId = pickUuid([body.student_id, body.studentId]);
    const explicitGroupId = pickUuid([body.group_id, body.groupId]);

    const targetType = toTargetType(normalized.target_type);
    const currentTargetId = pickUuid([normalized.target_id]);

    const canonical = await resolveCanonicalGroupContextForEvaluation(services, scopedEvaluationId);

    if (!targetType) {
        if (explicitStudentId) {
            normalized.target_type = 'student';
            normalized.target_id = explicitStudentId;
            return normalized;
        }

        if (explicitGroupId) {
            normalized.target_type = 'group';
            normalized.target_id = explicitGroupId;
            return normalized;
        }

        if (
            currentTargetId &&
            canonical.groupId &&
            canonical.scheduleId &&
            sameUuid(currentTargetId, canonical.scheduleId)
        ) {
            normalized.target_type = 'group';
            normalized.target_id = canonical.groupId;
            return normalized;
        }

        if (!currentTargetId && canonical.groupId) {
            normalized.target_type = 'group';
            normalized.target_id = canonical.groupId;
            return normalized;
        }

        return normalized;
    }

    if (targetType === 'student') {
        const studentId = pickUuid([explicitStudentId, normalized.target_id]);
        if (studentId) {
            normalized.target_type = 'student';
            normalized.target_id = studentId;
        }
        return normalized;
    }

    // targetType === 'group'
    if (explicitGroupId) {
        normalized.target_type = 'group';
        normalized.target_id = explicitGroupId;
        return normalized;
    }

    if (!currentTargetId && canonical.groupId) {
        normalized.target_type = 'group';
        normalized.target_id = canonical.groupId;
        return normalized;
    }

    if (
        currentTargetId &&
        canonical.groupId &&
        canonical.scheduleId &&
        sameUuid(currentTargetId, canonical.scheduleId)
    ) {
        normalized.target_type = 'group';
        normalized.target_id = canonical.groupId;
    }

    return normalized;
}

function validateNormalizedScorePayload(payload: Record<string, unknown>): string | null {
    const evaluationId = toNonEmptyString(payload.evaluation_id);
    if (!evaluationId || !isUuidLike(evaluationId)) {
        return 'evaluation_id is required and must be a valid UUID.';
    }

    const criterionId = toNonEmptyString(payload.criterion_id);
    if (!criterionId || !isUuidLike(criterionId)) {
        return 'criterion_id is required and must be a valid UUID.';
    }

    const targetType = toTargetType(payload.target_type);
    if (!targetType) {
        return 'target_type is required and must be either "group" or "student".';
    }

    const targetId = toNonEmptyString(payload.target_id);
    if (!targetId || !isUuidLike(targetId)) {
        return 'target_id is required and must be a valid UUID.';
    }

    const score = payload.score;
    if (typeof score !== 'number' || !Number.isFinite(score)) {
        return 'score must be a finite number.';
    }

    return null;
}

async function findExistingEvaluationScoreByTarget(
    controller: EvaluationScoresControllerLike,
    payload: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
    const evaluationId = toNonEmptyString(payload.evaluation_id);
    const criterionId = toNonEmptyString(payload.criterion_id);
    const targetType = toTargetType(payload.target_type);
    const targetId = toNonEmptyString(payload.target_id);

    if (!evaluationId || !criterionId || !targetType || !targetId) return null;

    if (typeof controller.findMany === 'function') {
        const rows = await controller.findMany({
            where: {
                evaluation_id: evaluationId,
                criterion_id: criterionId,
                target_type: targetType,
                target_id: targetId,
            },
            limit: 1,
        } as ListQuery<Record<string, unknown>>);

        if (Array.isArray(rows) && rows.length > 0 && isRecord(rows[0])) {
            return rows[0] as Record<string, unknown>;
        }
    }

    if (typeof controller.listByEvaluation === 'function') {
        const rows = await controller.listByEvaluation(evaluationId as UUID);
        const matched = rows.find((row) => {
            if (!isRecord(row)) return false;

            const rowCriterion = toNonEmptyString(row.criterion_id);
            const rowTargetType = toTargetType(row.target_type);
            const rowTargetId = toNonEmptyString(row.target_id);

            if (!rowCriterion || !rowTargetType || !rowTargetId) return false;

            return (
                sameUuid(rowCriterion, criterionId) &&
                rowTargetType === targetType &&
                sameUuid(rowTargetId, targetId)
            );
        });

        if (matched && isRecord(matched)) return matched as Record<string, unknown>;
    }

    return null;
}

async function upsertEvaluationScoreByTarget(
    controller: EvaluationScoresControllerLike,
    payload: Record<string, unknown>,
): Promise<{ item: unknown; created: boolean }> {
    const evaluationId = toNonEmptyString(payload.evaluation_id) as UUID;
    const criterionId = toNonEmptyString(payload.criterion_id) as UUID;
    const targetType = toTargetType(payload.target_type) as EvaluationTargetType;
    const targetId = toNonEmptyString(payload.target_id) as UUID;

    const where = {
        evaluation_id: evaluationId,
        criterion_id: criterionId,
        target_type: targetType,
        target_id: targetId,
    };

    const existing = await findExistingEvaluationScoreByTarget(controller, payload);
    if (existing && typeof controller.updateOne === 'function') {
        const existingId = pickUuid([existing.id]);
        if (existingId) {
            const updatedById = await controller.updateOne({ id: existingId }, payload);
            if (updatedById) return { item: updatedById, created: false };
        }

        const updatedByComposite = await controller.updateOne(where, payload);
        if (updatedByComposite) return { item: updatedByComposite, created: false };
    }

    if (typeof controller.create === 'function') {
        try {
            const created = await controller.create(payload);
            return { item: created, created: true };
        } catch (error) {
            if (isUniqueViolation(error)) {
                // Retry update after possible race.
                const latest = await findExistingEvaluationScoreByTarget(controller, payload);
                if (latest && typeof controller.updateOne === 'function') {
                    const latestId = pickUuid([latest.id]);
                    const updated =
                        (latestId
                            ? await controller.updateOne({ id: latestId }, payload)
                            : null) ??
                        (await controller.updateOne(where, payload));
                    if (updated) return { item: updated, created: false };
                }
            }
            throw error;
        }
    }

    throw new Error('Evaluation scores service is unavailable.');
}

function readPanelNoteFromData(data: Record<string, unknown>): string {
    const panelistNode = isRecord(data.panelist) ? data.panelist : null;

    const candidates: unknown[] = [
        panelistNode?.private_notes,
        panelistNode?.privateNotes,
        data.panelist_private_notes,
        data.private_panel_notes,
        data.panelist_notes,
        data.panel_notes,
        data.notes,
    ];

    for (const value of candidates) {
        if (typeof value === 'string') return value;
        if (value === null) return '';
    }

    return '';
}

function extractDataObject(row: unknown): Record<string, unknown> {
    if (!isRecord(row)) return {};
    const data = row.data;
    return isRecord(data) ? data : {};
}

function parseNotesValue(value: unknown): string | null {
    if (value === null) return '';
    if (typeof value === 'string') return value;
    return null;
}

async function findEvaluationExtraByEvaluationId(
    controller: EvaluationExtrasControllerLike,
    evaluationId: UUID,
): Promise<Record<string, unknown> | null> {
    if (typeof controller.findMany === 'function') {
        const rows = await controller.findMany({
            where: { evaluation_id: evaluationId },
            limit: 1,
        } as ListQuery<Record<string, unknown>>);

        if (Array.isArray(rows) && rows.length > 0 && isRecord(rows[0])) {
            return rows[0] as Record<string, unknown>;
        }
    }

    if (typeof controller.findById === 'function') {
        const row = await controller.findById(evaluationId);
        if (row && isRecord(row)) return row as Record<string, unknown>;
    }

    return null;
}

async function upsertPanelNote(
    controller: EvaluationExtrasControllerLike,
    evaluationId: UUID,
    notes: string,
): Promise<Record<string, unknown>> {
    const existing = await findEvaluationExtraByEvaluationId(controller, evaluationId);
    const baseData = existing ? extractDataObject(existing) : {};

    const existingPanelistNode = isRecord(baseData.panelist)
        ? (baseData.panelist as Record<string, unknown>)
        : {};

    const previousPrivate = readPanelNoteFromData(baseData);

    const nextData: JsonObject = {
        ...baseData,
        panelist: {
            ...existingPanelistNode,
            private_notes: notes,
            privateNotes: notes,
        },
        panelist_private_notes: notes,
        private_panel_notes: notes,
    };

    // Keep "notes" synchronized only when it was previously used for private notes,
    // so we don't overwrite unrelated public/general notes fields.
    if (!hasOwn(baseData, 'notes')) {
        nextData.notes = notes;
    } else if (typeof baseData.notes === 'string' && baseData.notes === previousPrivate) {
        nextData.notes = notes;
    } else if (baseData.notes === null && previousPrivate.length === 0) {
        nextData.notes = notes;
    }

    let saved: unknown | null = null;

    if (existing && typeof controller.updateOne === 'function') {
        const existingId = toNonEmptyString(existing.id);
        saved =
            (existingId
                ? await controller.updateOne({ id: existingId }, { data: nextData })
                : null) ??
            (await controller.updateOne(
                { evaluation_id: evaluationId },
                { data: nextData },
            ));
    } else if (typeof controller.create === 'function') {
        try {
            saved = await controller.create({
                evaluation_id: evaluationId,
                data: nextData,
            });
        } catch (error) {
            if (isUniqueViolation(error) && typeof controller.updateOne === 'function') {
                saved = await controller.updateOne(
                    { evaluation_id: evaluationId },
                    { data: nextData },
                );
            } else {
                throw error;
            }
        }
    } else if (typeof controller.updateOne === 'function') {
        saved = await controller.updateOne(
            { evaluation_id: evaluationId },
            { data: nextData },
        );
    } else {
        throw new Error('Evaluation extras service is unavailable.');
    }

    const source = isRecord(saved) ? saved : existing ?? {};
    const updatedAt = toNonEmptyString(source.updated_at) ?? null;

    return {
        evaluation_id: evaluationId,
        notes,
        updated_at: updatedAt,
    };
}

async function listPanelistEvaluationScores(
    controller: EvaluationScoresControllerLike,
    req: NextRequest,
    evaluationId: UUID,
): Promise<unknown[]> {
    const search = req.nextUrl.searchParams;

    const criterionId = pickUuid([
        search.get('criterion_id'),
        search.get('criterionId'),
    ]);
    const targetTypeRaw = search.get('target_type') ?? search.get('targetType');
    const targetType = targetTypeRaw ? toTargetType(targetTypeRaw) : null;
    const targetId = pickUuid([search.get('target_id'), search.get('targetId')]);

    if (targetTypeRaw && !targetType) {
        throw new Error('target_type must be either "group" or "student".');
    }

    if (typeof controller.listByEvaluation === 'function') {
        const rows = await controller.listByEvaluation(evaluationId);
        return rows.filter((row) => {
            if (!isRecord(row)) return false;

            if (criterionId) {
                const rowCriterion = toNonEmptyString(row.criterion_id);
                if (!rowCriterion || rowCriterion.toLowerCase() !== criterionId.toLowerCase()) {
                    return false;
                }
            }

            if (targetType) {
                const rowTargetType = toTargetType(row.target_type);
                if (rowTargetType !== targetType) return false;
            }

            if (targetId) {
                const rowTargetId = toNonEmptyString(row.target_id);
                if (!rowTargetId || rowTargetId.toLowerCase() !== targetId.toLowerCase()) {
                    return false;
                }
            }

            return true;
        });
    }

    if (typeof controller.findMany !== 'function') {
        throw new Error('Evaluation scores list endpoint is unavailable.');
    }

    const query = parseListQuery<Record<string, unknown>>(req);
    const where = (isRecord(query.where) ? { ...query.where } : {}) as Record<string, unknown>;

    where.evaluation_id = evaluationId;
    if (criterionId) where.criterion_id = criterionId;
    if (targetType) where.target_type = targetType;
    if (targetId) where.target_id = targetId;

    const merged: ListQuery<Record<string, unknown>> = {
        ...query,
        where,
    };

    return await controller.findMany(merged);
}

async function dispatchPanelistEvaluationsRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const method = req.method.toUpperCase();

    const resolved = resolvePanelistEvaluationRoute(tail);
    if (!resolved) return json404Api();

    const { routeTail, evaluationId, segment } = resolved;

    // Notes routes
    // GET    /api/panelist/evaluations/:evaluationId/notes
    // PATCH  /api/panelist/evaluations/:evaluationId/notes
    // PUT    /api/panelist/evaluations/:evaluationId/notes
    // POST   /api/panelist/evaluations/:evaluationId/notes
    if (
        (
            segment === 'notes' ||
            segment === 'note' ||
            segment === 'private-notes' ||
            segment === 'private-panel-notes'
        ) &&
        routeTail.length >= 3
    ) {
        const extras = resolveEvaluationExtrasController(services);
        if (!extras) {
            return json400('Private notes service is unavailable for this environment.');
        }

        if (method === 'GET') {
            const existing = await findEvaluationExtraByEvaluationId(extras, evaluationId as UUID);
            if (!existing) {
                return json200({
                    item: {
                        evaluation_id: evaluationId,
                        notes: '',
                        updated_at: null,
                    },
                });
            }

            const data = extractDataObject(existing);
            const notes = readPanelNoteFromData(data);
            const updatedAt = toNonEmptyString(existing.updated_at) ?? null;

            return json200({
                item: {
                    evaluation_id: evaluationId,
                    notes,
                    updated_at: updatedAt,
                },
            });
        }

        if (method === 'PATCH' || method === 'PUT' || method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const rawNotes =
                body.notes ??
                body.note ??
                body.private_notes ??
                body.privateNotes ??
                body.private_panel_notes ??
                body.privatePanelNotes;
            const notes = parseNotesValue(rawNotes);

            if (notes === null) {
                return json400('notes must be a string or null.');
            }

            try {
                const item = await upsertPanelNote(extras, evaluationId as UUID, notes);
                return json200({
                    item,
                    message: 'Private panel notes saved.',
                });
            } catch (error) {
                return json400(toErrorMessage(error));
            }
        }

        return json405(['GET', 'PATCH', 'PUT', 'POST', 'OPTIONS']);
    }

    // Scores routes
    // GET/POST/PATCH/PUT /api/panelist/evaluations/:evaluationId/scores
    if (
        (segment === 'scores' || segment === 'score') &&
        routeTail.length >= 3
    ) {
        const scores = resolveEvaluationScoresController(services);
        if (!scores) return json404Api();

        if (method === 'GET') {
            try {
                const items = await listPanelistEvaluationScores(
                    scores,
                    req,
                    evaluationId as UUID,
                );
                return json200({ items });
            } catch (error) {
                return json400(toErrorMessage(error));
            }
        }

        if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const maybeBatch = body.scores;

            if (Array.isArray(maybeBatch)) {
                const items: unknown[] = [];
                const errors: Array<{ index: number; message: string }> = [];

                for (let i = 0; i < maybeBatch.length; i += 1) {
                    const node = maybeBatch[i];
                    if (!isRecord(node)) {
                        errors.push({
                            index: i,
                            message: 'Invalid score payload object.',
                        });
                        continue;
                    }

                    try {
                        const payload = await normalizeEvaluationScorePayloadForWrite(
                            node,
                            evaluationId as UUID,
                            services,
                        );
                        const invalid = validateNormalizedScorePayload(payload);
                        if (invalid) {
                            errors.push({ index: i, message: invalid });
                            continue;
                        }

                        const result = await upsertEvaluationScoreByTarget(scores, payload);
                        items.push(result.item);
                    } catch (error) {
                        errors.push({ index: i, message: toErrorMessage(error) });
                    }
                }

                return NextResponse.json(
                    {
                        items,
                        saved: items.length,
                        failed: errors.length,
                        errors,
                        message:
                            errors.length > 0
                                ? 'Some scores were saved. Please review failed items.'
                                : 'Draft scores saved successfully.',
                    },
                    { status: errors.length > 0 ? 207 : 200 },
                );
            }

            const payload = await normalizeEvaluationScorePayloadForWrite(
                body,
                evaluationId as UUID,
                services,
            );
            const invalid = validateNormalizedScorePayload(payload);
            if (invalid) return json400(invalid);

            try {
                const result = await upsertEvaluationScoreByTarget(scores, payload);
                return result.created
                    ? json201({
                        item: result.item,
                        message: 'Draft score saved successfully.',
                    })
                    : json200({
                        item: result.item,
                        message: 'Draft score updated successfully.',
                    });
            } catch (error) {
                return json400(toErrorMessage(error));
            }
        }

        return json405(['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS']);
    }

    return json404Api();
}

export async function dispatchPanelistRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const routeTail = normalizePanelistTail(tail);

    // Accept both:
    // - /api/panelist/evaluations/:evaluationId/{notes|scores}
    // - /api/panelist/:evaluationId/{notes|scores}
    const resolvedPanelistEvaluationRoute = resolvePanelistEvaluationRoute(routeTail);
    if (resolvedPanelistEvaluationRoute) {
        return dispatchPanelistEvaluationsRequest(req, resolvedPanelistEvaluationRoute.routeTail, services);
    }

    // Keep old behavior for any /evaluations/* paths.
    if (routeTail.length > 0 && routeTail[0] === 'evaluations') {
        return dispatchPanelistEvaluationsRequest(req, routeTail, services);
    }

    const controller = new PanelistController(services);
    const method = req.method.toUpperCase();

    if (routeTail.length === 0) {
        if (method === 'GET') {
            const query = parseListQuery<UserRow>(req);
            const items = await controller.getAll(omitWhere(query));
            return json200({ items });
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.create(
                body as Parameters<PanelistController['create']>[0],
            );
            return json201({ item });
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    const id = routeTail[0];
    if (!id || !isUuidLike(id)) return json404Api();

    if (routeTail.length === 1) {
        if (method === 'GET') {
            const item = await controller.getById(id as UUID);
            if (!item) return json404Entity('Panelist');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.update(
                id as UUID,
                body as Parameters<PanelistController['update']>[1],
            );
            if (!item) return json404Entity('Panelist');
            return json200({ item });
        }

        if (method === 'DELETE') {
            const deleted = await controller.delete(id as UUID);
            if (deleted === 0) return json404Entity('Panelist');
            return json200({ deleted });
        }

        return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
    }

    if (routeTail.length === 2 && routeTail[1] === 'status') {
        if (method !== 'PATCH' && method !== 'POST') {
            return json405(['PATCH', 'POST', 'OPTIONS']);
        }

        const body = await readJsonRecord(req);
        if (!body) return json400('Invalid JSON body.');

        const status = toUserStatus(body.status);
        if (!status) {
            return json400(`Invalid status. Allowed: ${USER_STATUSES.join(', ')}`);
        }

        const item = await controller.setStatus(id as UUID, status);
        if (!item) return json404Entity('Panelist');
        return json200({ item });
    }

    return json404Api();
}
