import type {
    DbNumeric,
    EvaluationRow,
    EvaluationScoreRow,
    ISODateTime,
    RubricCriteriaRow,
    ThesisGroupRankingRow,
    UUID,
} from '../models/Model';
import type { Services } from '../services/Services';

export type RankingTarget = 'group' | 'student';

export interface ThesisStudentRankingRow {
    student_id: UUID;
    student_name: string | null;
    student_email: string | null;
    group_id: UUID | null;
    group_title: string | null;
    student_percentage: DbNumeric | null;
    submitted_evaluations: number;
    latest_defense_at: ISODateTime | null;
    rank: number;
}

interface RankAccumulator {
    target_id: UUID;
    weighted_score: number;
    weighted_max: number;
    evaluation_ids: Set<string>;
    latest_defense_at_ts: number | null;
    latest_defense_at: ISODateTime | null;
    mapped_group_id: UUID | null;
}

const MAX_SCAN_LIMIT = 50_000;

function toNumber(value: unknown, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
}

function toTimestamp(value: unknown): number | null {
    if (typeof value !== 'string' || value.trim().length === 0) return null;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function toLowerKey(id: string): string {
    return id.trim().toLowerCase();
}

function metricValue(value: DbNumeric | null): number {
    if (value == null) return Number.NEGATIVE_INFINITY;
    return toNumber(value, Number.NEGATIVE_INFINITY);
}

function toPercentage(weightedScore: number, weightedMax: number): DbNumeric | null {
    if (!Number.isFinite(weightedScore) || !Number.isFinite(weightedMax) || weightedMax <= 0) {
        return null;
    }
    const pct = (weightedScore / weightedMax) * 100;
    return Number(pct.toFixed(2));
}

function buildCriterionMap(criteria: RubricCriteriaRow[]): Map<string, RubricCriteriaRow> {
    const map = new Map<string, RubricCriteriaRow>();
    for (const row of criteria) {
        map.set(toLowerKey(row.id), row);
    }
    return map;
}

async function listSubmittedEvaluations(services: Services): Promise<EvaluationRow[]> {
    const [submitted, locked] = await Promise.all([
        services.evaluations.findMany({
            where: { status: 'submitted' },
            limit: MAX_SCAN_LIMIT,
        }),
        services.evaluations.findMany({
            where: { status: 'locked' },
            limit: MAX_SCAN_LIMIT,
        }),
    ]);

    const dedup = new Map<string, EvaluationRow>();
    for (const row of [...submitted, ...locked]) {
        dedup.set(toLowerKey(row.id), row);
    }

    return [...dedup.values()];
}

async function listScoresByTarget(
    services: Services,
    target: RankingTarget,
): Promise<EvaluationScoreRow[]> {
    return services.evaluation_scores.findMany({
        where: { target_type: target },
        limit: MAX_SCAN_LIMIT,
    });
}

async function loadScheduleMeta(
    services: Services,
    scheduleIds: UUID[],
): Promise<Map<string, { group_id: UUID | null; scheduled_at: ISODateTime | null }>> {
    const unique = [...new Set(scheduleIds.map((id) => toLowerKey(id)))];
    const rows = await Promise.all(
        unique.map(async (idLower) => {
            const row = await services.defense_schedules.findById(idLower as UUID);
            return [idLower, row] as const;
        }),
    );

    const map = new Map<string, { group_id: UUID | null; scheduled_at: ISODateTime | null }>();
    for (const [idLower, row] of rows) {
        map.set(idLower, {
            group_id: row?.group_id ?? null,
            scheduled_at: row?.scheduled_at ?? null,
        });
    }
    return map;
}

function contributionFromScore(
    scoreValue: number,
    criterion: RubricCriteriaRow | undefined,
): { weightedScore: number; weightedMax: number } {
    const weight = toNumber(criterion?.weight, 1);
    if (weight <= 0) return { weightedScore: 0, weightedMax: 0 };

    const minScore = toNumber(criterion?.min_score, 0);
    const maxScore = toNumber(criterion?.max_score, 100);

    let normalized = 0;
    if (maxScore > minScore) {
        normalized = (scoreValue - minScore) / (maxScore - minScore);
    } else if (maxScore > 0) {
        normalized = scoreValue / maxScore;
    }

    const clamped = clamp01(normalized);

    return {
        weightedScore: clamped * weight,
        weightedMax: weight,
    };
}

async function computeCoreRankings(
    services: Services,
    target: RankingTarget,
): Promise<RankAccumulator[]> {
    const [evaluations, scores, criteria] = await Promise.all([
        listSubmittedEvaluations(services),
        listScoresByTarget(services, target),
        services.rubric_criteria.findMany({ limit: MAX_SCAN_LIMIT }),
    ]);

    if (evaluations.length === 0 || scores.length === 0) return [];

    const evalMap = new Map<string, EvaluationRow>();
    for (const row of evaluations) evalMap.set(toLowerKey(row.id), row);

    const scheduleIds = evaluations.map((e) => e.schedule_id);
    const scheduleMap = await loadScheduleMeta(services, scheduleIds);

    const criterionMap = buildCriterionMap(criteria);

    const dedupeScoreKey = new Set<string>();
    const accMap = new Map<string, RankAccumulator>();

    for (const scoreRow of scores) {
        const evalKey = toLowerKey(scoreRow.evaluation_id);
        const evalRow = evalMap.get(evalKey);
        if (!evalRow) continue;

        const dedupeKey =
            `${scoreRow.evaluation_id}:${scoreRow.criterion_id}:${scoreRow.target_type}:${scoreRow.target_id}`.toLowerCase();
        if (dedupeScoreKey.has(dedupeKey)) continue;
        dedupeScoreKey.add(dedupeKey);

        const scheduleMeta = scheduleMap.get(toLowerKey(evalRow.schedule_id));
        const criterion = criterionMap.get(toLowerKey(scoreRow.criterion_id));

        const scoreValue = toNumber(scoreRow.score, Number.NaN);
        if (!Number.isFinite(scoreValue)) continue;

        const { weightedScore, weightedMax } = contributionFromScore(scoreValue, criterion);

        const targetId = scoreRow.target_id;
        const accKey = `${target}:${targetId}`.toLowerCase();

        const current =
            accMap.get(accKey) ??
            ({
                target_id: targetId,
                weighted_score: 0,
                weighted_max: 0,
                evaluation_ids: new Set<string>(),
                latest_defense_at_ts: null,
                latest_defense_at: null,
                mapped_group_id: target === 'group' ? targetId : null,
            } satisfies RankAccumulator);

        current.weighted_score += weightedScore;
        current.weighted_max += weightedMax;
        current.evaluation_ids.add(toLowerKey(evalRow.id));

        const scheduleTimeTs =
            toTimestamp(scheduleMeta?.scheduled_at) ?? toTimestamp(evalRow.created_at);

        if (
            scheduleTimeTs !== null &&
            (current.latest_defense_at_ts === null || scheduleTimeTs > current.latest_defense_at_ts)
        ) {
            current.latest_defense_at_ts = scheduleTimeTs;
            current.latest_defense_at =
                scheduleMeta?.scheduled_at ?? evalRow.created_at ?? null;

            if (target === 'student') {
                current.mapped_group_id = scheduleMeta?.group_id ?? current.mapped_group_id;
            }
        } else if (target === 'student' && !current.mapped_group_id && scheduleMeta?.group_id) {
            current.mapped_group_id = scheduleMeta.group_id;
        }

        accMap.set(accKey, current);
    }

    return [...accMap.values()];
}

export async function computeGroupRankings(
    services: Services,
    limit?: number,
): Promise<ThesisGroupRankingRow[]> {
    const core = await computeCoreRankings(services, 'group');

    const groupIds = [...new Set(core.map((row) => row.target_id))];
    const groupPairs = await Promise.all(
        groupIds.map(async (groupId) => [groupId, await services.thesis_groups.findById(groupId)] as const),
    );
    const groupMap = new Map<string, string | null>();
    for (const [groupId, group] of groupPairs) {
        groupMap.set(toLowerKey(groupId), group?.title ?? null);
    }

    const rows: ThesisGroupRankingRow[] = core.map((row) => ({
        group_id: row.target_id,
        group_title: groupMap.get(toLowerKey(row.target_id)) ?? null,
        group_percentage: toPercentage(row.weighted_score, row.weighted_max),
        submitted_evaluations: row.evaluation_ids.size,
        latest_defense_at: row.latest_defense_at,
        rank: 0,
    }));

    rows.sort((a, b) => {
        const metricDiff = metricValue(b.group_percentage) - metricValue(a.group_percentage);
        if (metricDiff !== 0) return metricDiff;

        const tsA = toTimestamp(a.latest_defense_at) ?? Number.NEGATIVE_INFINITY;
        const tsB = toTimestamp(b.latest_defense_at) ?? Number.NEGATIVE_INFINITY;
        if (tsB !== tsA) return tsB - tsA;

        const textA = (a.group_title ?? a.group_id).toLowerCase();
        const textB = (b.group_title ?? b.group_id).toLowerCase();
        return textA.localeCompare(textB);
    });

    rows.forEach((row, index) => {
        row.rank = index + 1;
    });

    if (typeof limit === 'number' && limit > 0) {
        return rows.slice(0, limit);
    }

    return rows;
}

export async function computeStudentRankings(
    services: Services,
    limit?: number,
): Promise<ThesisStudentRankingRow[]> {
    const core = await computeCoreRankings(services, 'student');

    const studentIds = [...new Set(core.map((row) => row.target_id))];
    const groupIds = [
        ...new Set(core.map((row) => row.mapped_group_id).filter((v): v is UUID => !!v)),
    ];

    const [studentPairs, groupPairs] = await Promise.all([
        Promise.all(
            studentIds.map(async (studentId) => [studentId, await services.users.findById(studentId)] as const),
        ),
        Promise.all(
            groupIds.map(async (groupId) => [groupId, await services.thesis_groups.findById(groupId)] as const),
        ),
    ]);

    const studentMap = new Map<string, { name: string | null; email: string | null }>();
    for (const [studentId, user] of studentPairs) {
        studentMap.set(toLowerKey(studentId), {
            name: user?.name ?? null,
            email: user?.email ?? null,
        });
    }

    const groupMap = new Map<string, string | null>();
    for (const [groupId, group] of groupPairs) {
        groupMap.set(toLowerKey(groupId), group?.title ?? null);
    }

    const rows: ThesisStudentRankingRow[] = core.map((row) => {
        const userMeta = studentMap.get(toLowerKey(row.target_id));
        const groupId = row.mapped_group_id;
        const groupTitle = groupId ? groupMap.get(toLowerKey(groupId)) ?? null : null;

        return {
            student_id: row.target_id,
            student_name: userMeta?.name ?? null,
            student_email: userMeta?.email ?? null,
            group_id: groupId ?? null,
            group_title: groupTitle,
            student_percentage: toPercentage(row.weighted_score, row.weighted_max),
            submitted_evaluations: row.evaluation_ids.size,
            latest_defense_at: row.latest_defense_at,
            rank: 0,
        };
    });

    rows.sort((a, b) => {
        const metricDiff =
            metricValue(b.student_percentage) - metricValue(a.student_percentage);
        if (metricDiff !== 0) return metricDiff;

        const tsA = toTimestamp(a.latest_defense_at) ?? Number.NEGATIVE_INFINITY;
        const tsB = toTimestamp(b.latest_defense_at) ?? Number.NEGATIVE_INFINITY;
        if (tsB !== tsA) return tsB - tsA;

        const textA = (a.student_name ?? a.student_id).toLowerCase();
        const textB = (b.student_name ?? b.student_id).toLowerCase();
        return textA.localeCompare(textB);
    });

    rows.forEach((row, index) => {
        row.rank = index + 1;
    });

    if (typeof limit === 'number' && limit > 0) {
        return rows.slice(0, limit);
    }

    return rows;
}

export async function getGroupRankingsWithFallback(
    services: Services,
    limit?: number,
): Promise<ThesisGroupRankingRow[]> {
    try {
        const items = await services.v_thesis_group_rankings.leaderboard(limit);
        if (Array.isArray(items) && items.length > 0) {
            return items;
        }

        // If view exists but empty, still fallback to computed to support
        // environments where target-aware scoring is newer than the view.
        return computeGroupRankings(services, limit);
    } catch {
        return computeGroupRankings(services, limit);
    }
}

export async function getGroupRankingByGroupIdWithFallback(
    services: Services,
    groupId: UUID,
): Promise<ThesisGroupRankingRow | null> {
    try {
        const item = await services.v_thesis_group_rankings.byGroup(groupId);
        if (item) return item;
    } catch {
        // ignore, fallback below
    }

    const all = await computeGroupRankings(services);
    return all.find((row) => toLowerKey(row.group_id) === toLowerKey(groupId)) ?? null;
}

export async function getStudentRankings(
    services: Services,
    limit?: number,
): Promise<ThesisStudentRankingRow[]> {
    return computeStudentRankings(services, limit);
}

export async function getStudentRankingByStudentId(
    services: Services,
    studentId: UUID,
): Promise<ThesisStudentRankingRow | null> {
    const all = await computeStudentRankings(services);
    return all.find((row) => toLowerKey(row.student_id) === toLowerKey(studentId)) ?? null;
}
