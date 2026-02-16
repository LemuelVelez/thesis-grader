import { NextRequest, NextResponse } from 'next/server';

import {
    type AuditLogInsert,
    type AuditLogPatch,
    type AuditLogRow,
    type RubricTemplateInsert,
    type RubricTemplatePatch,
    type RubricTemplateRow,
    type UUID,
} from '../models/Model';
import type { DatabaseServices } from '../services/Services';
import {
    isForeignKeyViolation,
    isUuidLike,
    json200,
    json201,
    json400,
    json404Api,
    json404Entity,
    json405,
    parseBoolean,
    parseListQuery,
    readJsonRecord,
    toErrorMessage,
} from './Route';

interface RubricTemplatesServiceLike {
    getActiveLatest: () => Promise<RubricTemplateRow | null>;
    listActive: () => Promise<RubricTemplateRow[]>;
    findMany: (query?: unknown) => Promise<RubricTemplateRow[]>;
    create: (input: RubricTemplateInsert) => Promise<RubricTemplateRow>;
    findById?: (id: UUID) => Promise<RubricTemplateRow | null>;
    updateOne?: (
        where: Partial<RubricTemplateRow>,
        patch: RubricTemplatePatch,
    ) => Promise<RubricTemplateRow | null>;
    delete?: (where: Partial<RubricTemplateRow>) => Promise<number>;
}

interface RubricTemplateCriteriaServiceLike {
    listByTemplate?: (templateId: UUID) => Promise<Record<string, unknown>[]>;
    findMany?: (query?: unknown) => Promise<Record<string, unknown>[]>;
    findById?: (id: UUID) => Promise<Record<string, unknown> | null>;
    create?: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    createMany?: (input: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>;
    updateOne?: (
        where: Record<string, unknown>,
        patch: Record<string, unknown>,
    ) => Promise<Record<string, unknown> | null>;
    delete?: (where: Record<string, unknown>) => Promise<number>;
}

function canWriteRubricTemplateCriteria(
    service: RubricTemplateCriteriaServiceLike | null,
): service is RubricTemplateCriteriaServiceLike {
    if (!service) return false;
    return (
        typeof service.createMany === 'function' ||
        typeof service.create === 'function'
    );
}

const RUBRIC_TEMPLATE_ID_CANDIDATE_KEYS = [
    'template_id',
    'rubric_template_id',
    'rubricTemplateId',
    'rubric_id',
    'rubricId',
] as const;

const RUBRIC_CRITERION_ID_CANDIDATE_KEYS = [
    'id',
    'criterion_id',
    'criteria_id',
    'rubric_criterion_id',
    'rubricCriterionId',
] as const;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isRubricTemplateCriteriaSegment(value: string | undefined): boolean {
    if (!value) return false;
    return (
        value === 'criteria' ||
        value === 'criterion' ||
        value === 'rubric-criteria' ||
        value === 'rubric-criterion'
    );
}

function hasOwnKey(obj: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function readFirstDefined(
    obj: Record<string, unknown>,
    keys: readonly string[],
): unknown {
    for (const key of keys) {
        if (hasOwnKey(obj, key)) return obj[key];
    }
    return undefined;
}

function toNonEmptyTrimmedString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function toNullableTrimmedString(value: unknown): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length === 0) return null;
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function parseRubricCriteriaInputsFromBody(body: Record<string, unknown>): Record<string, unknown>[] {
    const arrayCandidates: unknown[] = [
        body.criteria,
        body.criteria_items,
        body.criteriaItems,
        body.items,
        body.rows,
    ];

    for (const candidate of arrayCandidates) {
        if (!Array.isArray(candidate)) continue;
        const parsed = candidate.filter(isObjectRecord).map((entry) => ({ ...entry }));
        if (parsed.length > 0) return parsed;
    }

    const singleCandidates: unknown[] = [
        body.criterion,
        body.criteria_item,
        body.criteriaItem,
        body.item,
        body.row,
    ];

    for (const candidate of singleCandidates) {
        if (!isObjectRecord(candidate)) continue;
        return [{ ...candidate }];
    }

    const clone: Record<string, unknown> = { ...body };
    delete clone.criteria;
    delete clone.criteria_items;
    delete clone.criteriaItems;
    delete clone.items;
    delete clone.rows;
    delete clone.criterion;
    delete clone.criteria_item;
    delete clone.criteriaItem;
    delete clone.item;
    delete clone.row;

    return Object.keys(clone).length > 0 ? [clone] : [];
}

function normalizeRubricCriterionCreateInput(
    input: Record<string, unknown>,
): { item: Record<string, unknown> | null; error: string | null } {
    const criterionRaw = readFirstDefined(input, [
        'criterion',
        'title',
        'name',
        'label',
    ]);
    const criterion = toNonEmptyTrimmedString(criterionRaw);
    if (!criterion) {
        return {
            item: null,
            error: 'criterion/title/name is required and must be a non-empty string.',
        };
    }

    const descriptionRaw = readFirstDefined(input, [
        'description',
        'details',
        'note',
        'notes',
    ]);
    const description = toNullableTrimmedString(descriptionRaw);

    const weightRaw = readFirstDefined(input, [
        'weight',
        'percentage',
        'percent',
        'points',
    ]);
    const weight = toFiniteNumber(weightRaw);
    if (weight === null) {
        return {
            item: null,
            error: 'weight/percentage is required and must be numeric.',
        };
    }

    const minRaw = readFirstDefined(input, ['min_score', 'minScore', 'min']);
    const maxRaw = readFirstDefined(input, ['max_score', 'maxScore', 'max']);

    const minScore = minRaw === undefined ? 1 : toFiniteNumber(minRaw);
    const maxScore = maxRaw === undefined ? 5 : toFiniteNumber(maxRaw);

    if (minScore === null || maxScore === null) {
        return {
            item: null,
            error: 'min_score/max_score must be numeric when provided.',
        };
    }

    if (minScore > maxScore) {
        return {
            item: null,
            error: 'min_score cannot be greater than max_score.',
        };
    }

    return {
        item: {
            criterion,
            description: description ?? null,
            weight,
            min_score: minScore,
            max_score: maxScore,
        },
        error: null,
    };
}

function normalizeRubricCriterionPatchInput(
    input: Record<string, unknown>,
): { patch: Record<string, unknown> | null; error: string | null } {
    const patch: Record<string, unknown> = {};

    const hasCriterion = ['criterion', 'title', 'name', 'label'].some((key) =>
        hasOwnKey(input, key),
    );
    if (hasCriterion) {
        const criterion = toNonEmptyTrimmedString(
            readFirstDefined(input, ['criterion', 'title', 'name', 'label']),
        );
        if (!criterion) {
            return {
                patch: null,
                error: 'criterion/title/name must be a non-empty string.',
            };
        }
        patch.criterion = criterion;
    }

    const hasDescription = ['description', 'details', 'note', 'notes'].some((key) =>
        hasOwnKey(input, key),
    );
    if (hasDescription) {
        const description = toNullableTrimmedString(
            readFirstDefined(input, ['description', 'details', 'note', 'notes']),
        );
        if (description === undefined) {
            return {
                patch: null,
                error: 'description/details must be a string or null.',
            };
        }
        patch.description = description;
    }

    const hasWeight = ['weight', 'percentage', 'percent', 'points'].some((key) =>
        hasOwnKey(input, key),
    );
    if (hasWeight) {
        const weight = toFiniteNumber(
            readFirstDefined(input, ['weight', 'percentage', 'percent', 'points']),
        );
        if (weight === null) {
            return {
                patch: null,
                error: 'weight/percentage must be numeric.',
            };
        }
        patch.weight = weight;
    }

    const hasMin = ['min_score', 'minScore', 'min'].some((key) => hasOwnKey(input, key));
    if (hasMin) {
        const minScore = toFiniteNumber(
            readFirstDefined(input, ['min_score', 'minScore', 'min']),
        );
        if (minScore === null) {
            return {
                patch: null,
                error: 'min_score must be numeric.',
            };
        }
        patch.min_score = minScore;
    }

    const hasMax = ['max_score', 'maxScore', 'max'].some((key) => hasOwnKey(input, key));
    if (hasMax) {
        const maxScore = toFiniteNumber(
            readFirstDefined(input, ['max_score', 'maxScore', 'max']),
        );
        if (maxScore === null) {
            return {
                patch: null,
                error: 'max_score must be numeric.',
            };
        }
        patch.max_score = maxScore;
    }

    if (
        typeof patch.min_score === 'number' &&
        typeof patch.max_score === 'number' &&
        patch.min_score > patch.max_score
    ) {
        return {
            patch: null,
            error: 'min_score cannot be greater than max_score.',
        };
    }

    if (Object.keys(patch).length === 0) {
        return {
            patch: null,
            error:
                'No valid criterion fields were provided. Allowed fields: criterion, description, weight, min_score, max_score.',
        };
    }

    return { patch, error: null };
}

function resolveRubricTemplateCriteriaService(
    services: DatabaseServices,
): RubricTemplateCriteriaServiceLike | null {
    const bucket = services as unknown as Record<string, unknown>;
    const candidates = [
        bucket.rubric_template_criteria,
        bucket.rubricTemplateCriteria,
        bucket.rubric_criteria,
        bucket.rubricCriteria,
    ];

    for (const candidate of candidates) {
        if (candidate && typeof candidate === 'object') {
            return candidate as RubricTemplateCriteriaServiceLike;
        }
    }

    return null;
}

async function listRubricTemplateCriteriaByTemplate(
    service: RubricTemplateCriteriaServiceLike,
    templateId: UUID,
): Promise<Record<string, unknown>[]> {
    if (typeof service.listByTemplate === 'function') {
        const rows = await service.listByTemplate(templateId);
        return Array.isArray(rows) ? rows : [];
    }

    if (typeof service.findMany === 'function') {
        let fallback: Record<string, unknown>[] = [];

        for (const key of RUBRIC_TEMPLATE_ID_CANDIDATE_KEYS) {
            try {
                const rows = await service.findMany({ where: { [key]: templateId } });
                if (!Array.isArray(rows)) continue;
                if (rows.length > 0) return rows;
                fallback = rows;
            } catch {
                // try next key variant
            }
        }

        return fallback;
    }

    return [];
}

function extractRubricCriterionId(
    row: Record<string, unknown>,
): string | null {
    for (const key of RUBRIC_CRITERION_ID_CANDIDATE_KEYS) {
        const parsed = toNonEmptyTrimmedString(row[key]);
        if (parsed) return parsed;
    }
    return null;
}

function isRubricCriterionOwnedByTemplate(
    row: Record<string, unknown>,
    templateId: UUID,
): boolean {
    let foundTemplateKey = false;

    for (const key of RUBRIC_TEMPLATE_ID_CANDIDATE_KEYS) {
        if (!hasOwnKey(row, key)) continue;
        foundTemplateKey = true;

        const value = toNonEmptyTrimmedString(row[key]);
        if (!value) continue;

        if (value.toLowerCase() === templateId.toLowerCase()) {
            return true;
        }
    }

    // If row shape does not expose template key, don't reject it solely on that.
    return !foundTemplateKey;
}

async function findRubricTemplateCriterionByTemplateAndId(
    service: RubricTemplateCriteriaServiceLike,
    templateId: UUID,
    criterionId: UUID,
): Promise<Record<string, unknown> | null> {
    const rows = await listRubricTemplateCriteriaByTemplate(service, templateId);
    const fromList =
        rows.find((row) => {
            const id = extractRubricCriterionId(row);
            if (!id) return false;
            return id.toLowerCase() === criterionId.toLowerCase();
        }) ?? null;

    if (fromList) return fromList;

    if (typeof service.findById === 'function') {
        try {
            const row = await service.findById(criterionId);
            if (row && isRubricCriterionOwnedByTemplate(row, templateId)) {
                return row;
            }
        } catch {
            // no-op fallback
        }
    }

    if (typeof service.findMany === 'function') {
        for (const idKey of RUBRIC_CRITERION_ID_CANDIDATE_KEYS) {
            for (const templateKey of RUBRIC_TEMPLATE_ID_CANDIDATE_KEYS) {
                try {
                    const rowsByWhere = await service.findMany({
                        where: { [idKey]: criterionId, [templateKey]: templateId },
                        limit: 1,
                    });

                    if (Array.isArray(rowsByWhere) && rowsByWhere.length > 0) {
                        const row = rowsByWhere[0];
                        if (row && isRubricCriterionOwnedByTemplate(row, templateId)) return row;
                    }
                } catch {
                    // try next where shape
                }
            }
        }
    }

    return null;
}

async function updateRubricTemplateCriterion(
    service: RubricTemplateCriteriaServiceLike,
    templateId: UUID,
    criterionId: UUID,
    patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
    if (typeof service.updateOne !== 'function') {
        throw new Error('Rubric template criteria service does not support update.');
    }

    let lastError: unknown = null;

    const whereCandidates: Array<Record<string, unknown>> = [];

    for (const idKey of RUBRIC_CRITERION_ID_CANDIDATE_KEYS) {
        whereCandidates.push({ [idKey]: criterionId });

        for (const templateKey of RUBRIC_TEMPLATE_ID_CANDIDATE_KEYS) {
            whereCandidates.push({
                [idKey]: criterionId,
                [templateKey]: templateId,
            });
        }
    }

    const seen = new Set<string>();

    for (const where of whereCandidates) {
        const signature = Object.entries(where)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}:${String(v)}`)
            .join('|');

        if (seen.has(signature)) continue;
        seen.add(signature);

        try {
            const updated = await service.updateOne(where, patch);
            if (!updated) continue;

            if (!isRubricCriterionOwnedByTemplate(updated, templateId)) {
                continue;
            }

            return updated;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) throw lastError;
    return null;
}

async function deleteRubricTemplateCriterion(
    service: RubricTemplateCriteriaServiceLike,
    templateId: UUID,
    criterionId: UUID,
): Promise<number> {
    if (typeof service.delete !== 'function') {
        throw new Error('Rubric template criteria service does not support delete.');
    }

    let lastError: unknown = null;

    const whereCandidates: Array<Record<string, unknown>> = [];

    for (const idKey of RUBRIC_CRITERION_ID_CANDIDATE_KEYS) {
        whereCandidates.push({ [idKey]: criterionId });

        for (const templateKey of RUBRIC_TEMPLATE_ID_CANDIDATE_KEYS) {
            whereCandidates.push({
                [idKey]: criterionId,
                [templateKey]: templateId,
            });
        }
    }

    const seen = new Set<string>();

    for (const where of whereCandidates) {
        const signature = Object.entries(where)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}:${String(v)}`)
            .join('|');

        if (seen.has(signature)) continue;
        seen.add(signature);

        try {
            const deleted = await service.delete(where);
            if (deleted > 0) return deleted;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) throw lastError;
    return 0;
}

async function createRubricTemplateCriteriaForTemplate(
    service: RubricTemplateCriteriaServiceLike,
    templateId: UUID,
    criteriaInputs: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
    if (criteriaInputs.length === 0) return [];

    if (typeof service.createMany === 'function') {
        let lastCreateManyError: unknown = null;

        for (const key of RUBRIC_TEMPLATE_ID_CANDIDATE_KEYS) {
            try {
                const rows = await service.createMany(
                    criteriaInputs.map((item) => ({ ...item, [key]: templateId })),
                );
                if (Array.isArray(rows) && rows.length > 0) return rows;
            } catch (error) {
                lastCreateManyError = error;
            }
        }

        if (typeof service.create !== 'function' && lastCreateManyError) {
            throw lastCreateManyError;
        }
    }

    if (typeof service.create !== 'function') {
        throw new Error('Rubric template criteria service does not support create.');
    }

    const created: Record<string, unknown>[] = [];

    for (const input of criteriaInputs) {
        let createdItem: Record<string, unknown> | null = null;
        let lastError: unknown = null;

        for (const key of RUBRIC_TEMPLATE_ID_CANDIDATE_KEYS) {
            try {
                createdItem = await service.create({ ...input, [key]: templateId });
                break;
            } catch (error) {
                lastError = error;
                if (isForeignKeyViolation(error)) throw error;
            }
        }

        if (!createdItem) {
            if (lastError) throw lastError;
            throw new Error('Failed to create rubric template criterion.');
        }

        created.push(createdItem);
    }

    return created;
}

function readRubricTemplateCriteriaFromTemplateRow(
    template: RubricTemplateRow | null,
): Record<string, unknown>[] {
    if (!template) return [];
    const raw = template as unknown as Record<string, unknown>;

    const candidates: unknown[] = [raw.criteria, raw.rubric_criteria, raw.criteria_items];
    for (const candidate of candidates) {
        if (!Array.isArray(candidate)) continue;
        return candidate.filter(isObjectRecord).map((entry) => ({ ...entry }));
    }

    return [];
}

async function appendRubricCriteriaViaTemplatePatch(
    controller: RubricTemplatesServiceLike,
    templateId: UUID,
    criteriaInputs: Record<string, unknown>[],
): Promise<RubricTemplateRow | null> {
    if (typeof controller.findById !== 'function' || typeof controller.updateOne !== 'function') {
        return null;
    }

    const current = await controller.findById(templateId);
    if (!current) return null;

    const existing = readRubricTemplateCriteriaFromTemplateRow(current);
    const merged = [...existing, ...criteriaInputs];

    const patchCandidates: Array<Record<string, unknown>> = [
        { criteria: merged },
        { rubric_criteria: merged },
        { criteria_items: merged },
    ];

    let lastError: unknown = null;

    for (const patch of patchCandidates) {
        try {
            const updated = await controller.updateOne(
                { id: templateId } as Partial<RubricTemplateRow>,
                patch as RubricTemplatePatch,
            );
            if (updated) return updated;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) throw lastError;
    return current;
}

export async function dispatchRubricTemplatesRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = services.rubric_templates as unknown as RubricTemplatesServiceLike;
    const criteriaController = resolveRubricTemplateCriteriaService(services);
    const method = req.method.toUpperCase();

    const findTemplateById = async (templateId: UUID): Promise<RubricTemplateRow | null> => {
        if (typeof controller.findById === 'function') {
            try {
                const row = await controller.findById(templateId);
                if (row) return row;
            } catch {
                // fallback to findMany below
            }
        }

        try {
            const rows = await controller.findMany({
                where: { id: templateId },
                limit: 1,
            });

            if (Array.isArray(rows) && rows.length > 0) {
                return rows[0] ?? null;
            }
        } catch {
            // no-op
        }

        return null;
    };

    if (tail.length === 0) {
        if (method === 'GET') {
            const latest = parseBoolean(req.nextUrl.searchParams.get('latest'));
            if (latest === true) return json200({ item: await controller.getActiveLatest() });

            const active = parseBoolean(req.nextUrl.searchParams.get('active'));
            if (active === true) return json200({ items: await controller.listActive() });

            const query = parseListQuery<RubricTemplateRow>(req);
            return json200({ items: await controller.findMany(query) });
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');
            return json201({ item: await controller.create(body as RubricTemplateInsert) });
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    const id = tail[0];
    if (!id || !isUuidLike(id)) return json404Api();

    if (tail.length === 1) {
        const templateId = id as UUID;

        const allow: string[] = ['GET'];
        if (typeof controller.updateOne === 'function') {
            allow.push('PATCH', 'PUT');
        }
        if (typeof controller.delete === 'function') {
            allow.push('DELETE');
        }
        allow.push('OPTIONS');

        if (method === 'GET') {
            const item = await findTemplateById(templateId);
            if (!item) return json404Entity('Rubric template');
            return json200({ item });
        }

        if (method === 'PATCH' || method === 'PUT') {
            if (typeof controller.updateOne !== 'function') return json405(allow);

            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const item = await controller.updateOne(
                { id: templateId } as Partial<RubricTemplateRow>,
                body as RubricTemplatePatch,
            );

            if (!item) return json404Entity('Rubric template');
            return json200({ item });
        }

        if (method === 'DELETE') {
            if (typeof controller.delete !== 'function') return json405(allow);

            const deleted = await controller.delete({ id: templateId } as Partial<RubricTemplateRow>);
            if (deleted === 0) return json404Entity('Rubric template');
            return json200({ deleted });
        }

        return json405(allow);
    }

    if (tail.length === 2 && isRubricTemplateCriteriaSegment(tail[1])) {
        const templateId = id as UUID;

        if (method === 'GET') {
            try {
                const template = await findTemplateById(templateId);
                if (!template) return json404Entity('Rubric template');

                if (criteriaController) {
                    const items = await listRubricTemplateCriteriaByTemplate(criteriaController, templateId);
                    return json200({ items });
                }

                const items = readRubricTemplateCriteriaFromTemplateRow(template);
                return json200({ items });
            } catch (error) {
                return NextResponse.json(
                    { error: 'Failed to fetch rubric template criteria.', message: toErrorMessage(error) },
                    { status: 500 },
                );
            }
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            const template = await findTemplateById(templateId);
            if (!template) return json404Entity('Rubric template');

            const rawCriteriaInputs = parseRubricCriteriaInputsFromBody(body);
            if (rawCriteriaInputs.length === 0) {
                return json400('criteria is required. Provide criteria[] or a single criterion payload.');
            }

            const criteriaInputs: Record<string, unknown>[] = [];
            for (let i = 0; i < rawCriteriaInputs.length; i += 1) {
                const normalized = normalizeRubricCriterionCreateInput(rawCriteriaInputs[i]);
                if (!normalized.item) {
                    return json400(`Invalid criterion at index ${i}: ${normalized.error ?? 'Invalid payload.'}`);
                }
                criteriaInputs.push(normalized.item);
            }

            let criteriaServiceError: unknown = null;

            if (canWriteRubricTemplateCriteria(criteriaController)) {
                try {
                    const created = await createRubricTemplateCriteriaForTemplate(
                        criteriaController,
                        templateId,
                        criteriaInputs,
                    );

                    if (created.length === 1) return json201({ item: created[0] });
                    return json201({ items: created });
                } catch (error) {
                    criteriaServiceError = error;
                }
            }

            try {
                const updatedTemplate = await appendRubricCriteriaViaTemplatePatch(
                    controller,
                    templateId,
                    criteriaInputs,
                );

                if (!updatedTemplate) {
                    if (criteriaServiceError) {
                        return NextResponse.json(
                            {
                                error: 'Failed to create rubric template criteria.',
                                message: toErrorMessage(criteriaServiceError),
                            },
                            { status: 500 },
                        );
                    }

                    return NextResponse.json(
                        {
                            error: 'Rubric criteria endpoint is not configured.',
                            message:
                                'No rubric criteria service was found and rubric_templates.updateOne/findById is unavailable.',
                        },
                        { status: 500 },
                    );
                }

                const createdPayload =
                    criteriaInputs.length === 1
                        ? { item: criteriaInputs[0] }
                        : { items: criteriaInputs };

                return NextResponse.json(
                    {
                        ...createdPayload,
                        template: updatedTemplate,
                        ...(criteriaServiceError
                            ? {
                                warning:
                                    'Criteria service insert failed; criteria were appended through rubric template patch fallback.',
                            }
                            : {}),
                    },
                    { status: 201 },
                );
            } catch (error) {
                const primaryMessage =
                    criteriaServiceError != null
                        ? toErrorMessage(criteriaServiceError)
                        : null;
                const fallbackMessage = toErrorMessage(error);

                return NextResponse.json(
                    {
                        error: 'Failed to create rubric template criteria.',
                        message: primaryMessage
                            ? `Criteria service error: ${primaryMessage} | Fallback patch error: ${fallbackMessage}`
                            : fallbackMessage,
                    },
                    { status: 500 },
                );
            }
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    if (tail.length === 3 && isRubricTemplateCriteriaSegment(tail[1])) {
        const templateId = id as UUID;
        const criterionIdRaw = tail[2];

        if (!criterionIdRaw || !isUuidLike(criterionIdRaw)) {
            return json400('criterionId must be a valid UUID.');
        }

        const criterionId = criterionIdRaw as UUID;

        const allow: string[] = ['GET', 'OPTIONS'];
        if (criteriaController?.updateOne) allow.push('PATCH', 'PUT');
        if (criteriaController?.delete) allow.push('DELETE');

        const template = await findTemplateById(templateId);
        if (!template) return json404Entity('Rubric template');

        if (!criteriaController) {
            return NextResponse.json(
                {
                    error: 'Rubric criteria endpoint is not configured.',
                    message: 'No rubric criteria service was found in DatabaseServices.',
                },
                { status: 500 },
            );
        }

        if (method === 'GET') {
            try {
                const item = await findRubricTemplateCriterionByTemplateAndId(
                    criteriaController,
                    templateId,
                    criterionId,
                );
                if (!item) return json404Entity('Rubric criterion');
                return json200({ item });
            } catch (error) {
                return NextResponse.json(
                    { error: 'Failed to fetch rubric criterion.', message: toErrorMessage(error) },
                    { status: 500 },
                );
            }
        }

        if (method === 'PATCH' || method === 'PUT') {
            if (typeof criteriaController.updateOne !== 'function') {
                return json405(allow);
            }

            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');

            try {
                const existing = await findRubricTemplateCriterionByTemplateAndId(
                    criteriaController,
                    templateId,
                    criterionId,
                );
                if (!existing) return json404Entity('Rubric criterion');

                const normalized = normalizeRubricCriterionPatchInput(body);
                if (!normalized.patch) {
                    return json400(normalized.error ?? 'Invalid rubric criterion patch payload.');
                }

                const updated = await updateRubricTemplateCriterion(
                    criteriaController,
                    templateId,
                    criterionId,
                    normalized.patch,
                );

                if (!updated) return json404Entity('Rubric criterion');
                return json200({ item: updated });
            } catch (error) {
                return NextResponse.json(
                    { error: 'Failed to update rubric criterion.', message: toErrorMessage(error) },
                    { status: 500 },
                );
            }
        }

        if (method === 'DELETE') {
            if (typeof criteriaController.delete !== 'function') {
                return json405(allow);
            }

            try {
                const existing = await findRubricTemplateCriterionByTemplateAndId(
                    criteriaController,
                    templateId,
                    criterionId,
                );
                if (!existing) return json404Entity('Rubric criterion');

                const deleted = await deleteRubricTemplateCriterion(
                    criteriaController,
                    templateId,
                    criterionId,
                );
                if (deleted === 0) return json404Entity('Rubric criterion');

                return json200({ deleted });
            } catch (error) {
                return NextResponse.json(
                    { error: 'Failed to delete rubric criterion.', message: toErrorMessage(error) },
                    { status: 500 },
                );
            }
        }

        return json405(allow);
    }

    return json404Api();
}

export async function dispatchAuditLogsRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    const controller = services.audit_logs;
    const method = req.method.toUpperCase();

    if (tail.length === 0) {
        if (method === 'GET') {
            const query = parseListQuery<AuditLogRow>(req);
            return json200({ items: await controller.findMany(query) });
        }

        if (method === 'POST') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');
            return json201({ item: await controller.create(body as AuditLogInsert) });
        }

        return json405(['GET', 'POST', 'OPTIONS']);
    }

    const id = tail[0];
    if (!id || !isUuidLike(id)) return json404Api();

    if (tail.length === 1) {
        if (method === 'GET') {
            const item = await controller.findById(id as UUID);
            if (!item) return json404Entity('Audit log');
            return json200({ item });
        }
        if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonRecord(req);
            if (!body) return json400('Invalid JSON body.');
            const item = await controller.updateOne({ id: id as UUID }, body as AuditLogPatch);
            if (!item) return json404Entity('Audit log');
            return json200({ item });
        }
        if (method === 'DELETE') {
            const deleted = await controller.delete({ id: id as UUID });
            if (deleted === 0) return json404Entity('Audit log');
            return json200({ deleted });
        }
        return json405(['GET', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']);
    }

    return json404Api();
}
