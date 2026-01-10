/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

export type DbRubricTemplate = {
    id: string
    name: string
    version: number
    active: boolean
    description: string | null
    createdAt: string
    updatedAt: string
}

export type DbRubricCriterion = {
    id: string
    templateId: string
    criterion: string
    description: string | null
    weight: string
    minScore: number
    maxScore: number
    createdAt: string
}

export type DbEvaluation = {
    id: string
    scheduleId: string
    evaluatorId: string
    status: string
    submittedAt: string | null
    lockedAt: string | null
    createdAt: string
}

export type DbEvaluationScore = {
    evaluationId: string
    criterionId: string
    score: number
    comment: string | null
}

export type DbStudentEvaluation = {
    id: string
    scheduleId: string
    studentId: string
    status: "pending" | "submitted" | "locked" | string
    answers: any
    submittedAt: string | null
    lockedAt: string | null
    createdAt: string
    updatedAt: string
}

function normLimit(n: unknown, fallback = 50) {
    const x = Number(n)
    if (!Number.isFinite(x) || x <= 0) return fallback
    return Math.min(200, Math.floor(x))
}

function normOffset(n: unknown) {
    const x = Number(n)
    if (!Number.isFinite(x) || x < 0) return 0
    return Math.floor(x)
}

/**
 * Some deployments use TEXT for student_evaluations.status, others use ENUM.
 * Hard-casting to a specific enum name can cause 500 if that enum doesn't exist.
 *
 * We detect the column type once and only cast if it's an enum (using the actual udt_name).
 */
let _studentStatusTypeIdent: string | null | undefined

async function getStudentStatusTypeIdent(): Promise<string | null> {
    if (_studentStatusTypeIdent !== undefined) return _studentStatusTypeIdent
    try {
        const { rows } = await db.query(
            `
            select data_type, udt_name
            from information_schema.columns
            where table_name = 'student_evaluations'
              and column_name = 'status'
              and table_schema not in ('pg_catalog','information_schema')
            order by (case when table_schema = 'public' then 0 else 1 end), table_schema
            limit 1
            `,
            []
        )

        const row = rows?.[0]
        const isEnum = String(row?.data_type ?? "") === "USER-DEFINED"
        const udt = String(row?.udt_name ?? "").trim()

        if (isEnum && udt && /^[A-Za-z_][A-Za-z0-9_]*$/.test(udt)) {
            _studentStatusTypeIdent = `"${udt}"`
        } else {
            _studentStatusTypeIdent = null
        }
    } catch {
        _studentStatusTypeIdent = null
    }
    return _studentStatusTypeIdent
}

/** -------------------- Rubric Templates -------------------- */

export async function listRubricTemplates(params: { q?: string; limit?: number; offset?: number }) {
    const q = (params.q ?? "").trim()
    const limit = normLimit(params.limit, 50)
    const offset = normOffset(params.offset)
    const whereQ = q ? `%${q}%` : null

    const countQ = `
    select count(*)::int as count
    from rubric_templates rt
    where ($1::text is null) or (rt.name ilike $1) or (coalesce(rt.description,'') ilike $1)
  `
    const listQ = `
    select
      rt.id,
      rt.name,
      rt.version,
      rt.active,
      rt.description,
      rt.created_at as "createdAt",
      rt.updated_at as "updatedAt"
    from rubric_templates rt
    where ($1::text is null) or (rt.name ilike $1) or (coalesce(rt.description,'') ilike $1)
    order by rt.updated_at desc
    limit $2 offset $3
  `
    const [{ rows: countRows }, { rows }] = await Promise.all([
        db.query(countQ, [whereQ]),
        db.query(listQ, [whereQ, limit, offset]),
    ])

    return { total: (countRows?.[0]?.count ?? 0) as number, templates: rows as DbRubricTemplate[] }
}

export async function getRubricTemplateById(id: string) {
    const q = `
    select
      rt.id,
      rt.name,
      rt.version,
      rt.active,
      rt.description,
      rt.created_at as "createdAt",
      rt.updated_at as "updatedAt"
    from rubric_templates rt
    where rt.id = $1
    limit 1
  `
    const { rows } = await db.query(q, [id])
    return (rows[0] ?? null) as DbRubricTemplate | null
}

export async function createRubricTemplate(input: { name: string; description?: string | null; version?: number; active?: boolean }) {
    const q = `
    insert into rubric_templates (name, description, version, active)
    values ($1, $2, $3, $4)
    returning
      id,
      name,
      version,
      active,
      description,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `
    const { rows } = await db.query(q, [
        input.name,
        input.description ?? null,
        input.version ?? 1,
        input.active ?? true,
    ])
    return rows[0] as DbRubricTemplate
}

export async function updateRubricTemplate(
    id: string,
    patch: Partial<{ name: string; description: string | null; version: number; active: boolean }>
) {
    const sets: string[] = []
    const values: any[] = []
    let i = 1

    if (patch.name !== undefined) {
        sets.push(`name = $${i++}`)
        values.push(patch.name)
    }
    if (patch.description !== undefined) {
        sets.push(`description = $${i++}`)
        values.push(patch.description)
    }
    if (patch.version !== undefined) {
        sets.push(`version = $${i++}`)
        values.push(patch.version)
    }
    if (patch.active !== undefined) {
        sets.push(`active = $${i++}`)
        values.push(patch.active)
    }

    if (!sets.length) {
        const current = await getRubricTemplateById(id)
        if (!current) throw Object.assign(new Error("Template not found"), { status: 404 })
        return current
    }

    values.push(id)
    const q = `
    update rubric_templates
    set ${sets.join(", ")}
    where id = $${i}
    returning
      id,
      name,
      version,
      active,
      description,
      created_at as "createdAt",
      updated_at as "updatedAt"
  `
    const { rows } = await db.query(q, values)
    return (rows[0] ?? null) as DbRubricTemplate | null
}

export async function deleteRubricTemplate(id: string) {
    const q = `delete from rubric_templates where id = $1 returning id`
    const { rows } = await db.query(q, [id])
    return (rows[0]?.id ?? null) as string | null
}

/** -------------------- Rubric Criteria -------------------- */

export async function listRubricCriteria(templateId: string) {
    const q = `
    select
      rc.id,
      rc.template_id as "templateId",
      rc.criterion,
      rc.description,
      rc.weight::text as weight,
      rc.min_score as "minScore",
      rc.max_score as "maxScore",
      rc.created_at as "createdAt"
    from rubric_criteria rc
    where rc.template_id = $1
    order by rc.created_at asc
  `
    const { rows } = await db.query(q, [templateId])
    return rows as DbRubricCriterion[]
}

export async function createRubricCriterion(input: {
    templateId: string
    criterion: string
    description?: string | null
    weight?: number | string
    minScore?: number
    maxScore?: number
}) {
    const q = `
    insert into rubric_criteria (template_id, criterion, description, weight, min_score, max_score)
    values ($1, $2, $3, $4, $5, $6)
    returning
      id,
      template_id as "templateId",
      criterion,
      description,
      weight::text as weight,
      min_score as "minScore",
      max_score as "maxScore",
      created_at as "createdAt"
  `
    const { rows } = await db.query(q, [
        input.templateId,
        input.criterion,
        input.description ?? null,
        input.weight ?? 1,
        input.minScore ?? 1,
        input.maxScore ?? 5,
    ])
    return rows[0] as DbRubricCriterion
}

export async function updateRubricCriterion(
    id: string,
    patch: Partial<{ criterion: string; description: string | null; weight: number | string; minScore: number; maxScore: number }>
) {
    const sets: string[] = []
    const values: any[] = []
    let i = 1

    if (patch.criterion !== undefined) {
        sets.push(`criterion = $${i++}`)
        values.push(patch.criterion)
    }
    if (patch.description !== undefined) {
        sets.push(`description = $${i++}`)
        values.push(patch.description)
    }
    if (patch.weight !== undefined) {
        sets.push(`weight = $${i++}`)
        values.push(patch.weight)
    }
    if (patch.minScore !== undefined) {
        sets.push(`min_score = $${i++}`)
        values.push(patch.minScore)
    }
    if (patch.maxScore !== undefined) {
        sets.push(`max_score = $${i++}`)
        values.push(patch.maxScore)
    }

    if (!sets.length) return null

    values.push(id)
    const q = `
    update rubric_criteria
    set ${sets.join(", ")}
    where id = $${i}
    returning
      id,
      template_id as "templateId",
      criterion,
      description,
      weight::text as weight,
      min_score as "minScore",
      max_score as "maxScore",
      created_at as "createdAt"
  `
    const { rows } = await db.query(q, values)
    return (rows[0] ?? null) as DbRubricCriterion | null
}

export async function deleteRubricCriterion(id: string) {
    const q = `delete from rubric_criteria where id = $1 returning id`
    const { rows } = await db.query(q, [id])
    return (rows[0]?.id ?? null) as string | null
}

/** -------------------- Evaluations -------------------- */

export async function listEvaluations(params: {
    scheduleId?: string
    evaluatorId?: string
    status?: string
    limit?: number
    offset?: number
}) {
    const limit = normLimit(params.limit, 50)
    const offset = normOffset(params.offset)

    const where: string[] = []
    const values: any[] = []
    let i = 1

    if (params.scheduleId) {
        where.push(`e.schedule_id = $${i++}`)
        values.push(params.scheduleId)
    }
    if (params.evaluatorId) {
        where.push(`e.evaluator_id = $${i++}`)
        values.push(params.evaluatorId)
    }
    if (params.status) {
        where.push(`e.status = $${i++}`)
        values.push(params.status)
    }
    const whereSql = where.length ? `where ${where.join(" and ")}` : ""

    const q = `
    select
      e.id,
      e.schedule_id as "scheduleId",
      e.evaluator_id as "evaluatorId",
      e.status,
      e.submitted_at as "submittedAt",
      e.locked_at as "lockedAt",
      e.created_at as "createdAt"
    from evaluations e
    ${whereSql}
    order by e.created_at desc
    limit $${i} offset $${i + 1}
  `
    const { rows } = await db.query(q, [...values, limit, offset])
    return rows as DbEvaluation[]
}

export async function getEvaluationById(id: string) {
    const q = `
    select
      e.id,
      e.schedule_id as "scheduleId",
      e.evaluator_id as "evaluatorId",
      e.status,
      e.submitted_at as "submittedAt",
      e.locked_at as "lockedAt",
      e.created_at as "createdAt"
    from evaluations e
    where e.id = $1
    limit 1
  `
    const { rows } = await db.query(q, [id])
    return (rows[0] ?? null) as DbEvaluation | null
}

export async function getEvaluationByAssignment(scheduleId: string, evaluatorId: string) {
    const q = `
    select
      e.id,
      e.schedule_id as "scheduleId",
      e.evaluator_id as "evaluatorId",
      e.status,
      e.submitted_at as "submittedAt",
      e.locked_at as "lockedAt",
      e.created_at as "createdAt"
    from evaluations e
    where e.schedule_id = $1 and e.evaluator_id = $2
    limit 1
  `
    const { rows } = await db.query(q, [scheduleId, evaluatorId])
    return (rows[0] ?? null) as DbEvaluation | null
}

export async function createEvaluation(input: { scheduleId: string; evaluatorId: string; status?: string }) {
    const q = `
    insert into evaluations (schedule_id, evaluator_id, status)
    values ($1, $2, $3)
    on conflict (schedule_id, evaluator_id)
    do update set status = excluded.status
    returning
      id,
      schedule_id as "scheduleId",
      evaluator_id as "evaluatorId",
      status,
      submitted_at as "submittedAt",
      locked_at as "lockedAt",
      created_at as "createdAt"
  `
    const { rows } = await db.query(q, [input.scheduleId, input.evaluatorId, input.status ?? "pending"])
    return rows[0] as DbEvaluation
}

export async function updateEvaluation(
    id: string,
    patch: Partial<{ status: string; submittedAt: string | null; lockedAt: string | null }>
) {
    const sets: string[] = []
    const values: any[] = []
    let i = 1

    if (patch.status !== undefined) {
        sets.push(`status = $${i++}`)
        values.push(patch.status)
    }
    if (patch.submittedAt !== undefined) {
        sets.push(`submitted_at = $${i++}::timestamptz`)
        values.push(patch.submittedAt)
    }
    if (patch.lockedAt !== undefined) {
        sets.push(`locked_at = $${i++}::timestamptz`)
        values.push(patch.lockedAt)
    }

    if (!sets.length) return null

    values.push(id)
    const q = `
    update evaluations
    set ${sets.join(", ")}
    where id = $${i}
    returning
      id,
      schedule_id as "scheduleId",
      evaluator_id as "evaluatorId",
      status,
      submitted_at as "submittedAt",
      locked_at as "lockedAt",
      created_at as "createdAt"
  `
    const { rows } = await db.query(q, values)
    return (rows[0] ?? null) as DbEvaluation | null
}

/** -------------------- Evaluation Scores -------------------- */

export async function listEvaluationScores(evaluationId: string) {
    const q = `
    select
      es.evaluation_id as "evaluationId",
      es.criterion_id as "criterionId",
      es.score,
      es.comment
    from evaluation_scores es
    where es.evaluation_id = $1
  `
    const { rows } = await db.query(q, [evaluationId])
    return rows as DbEvaluationScore[]
}

export async function upsertEvaluationScore(input: {
    evaluationId: string
    criterionId: string
    score: number
    comment?: string | null
}) {
    const q = `
    insert into evaluation_scores (evaluation_id, criterion_id, score, comment)
    values ($1, $2, $3, $4)
    on conflict (evaluation_id, criterion_id)
    do update set score = excluded.score, comment = excluded.comment
    returning
      evaluation_id as "evaluationId",
      criterion_id as "criterionId",
      score,
      comment
  `
    const { rows } = await db.query(q, [
        input.evaluationId,
        input.criterionId,
        input.score,
        input.comment ?? null,
    ])
    return rows[0] as DbEvaluationScore
}

export async function bulkUpsertEvaluationScores(input: {
    evaluationId: string
    items: Array<{ criterionId: string; score: number; comment?: string | null }>
}) {
    const client = await db.connect()
    try {
        await client.query("begin")
        const out: DbEvaluationScore[] = []
        for (const it of input.items) {
            const { rows } = await client.query(
                `
        insert into evaluation_scores (evaluation_id, criterion_id, score, comment)
        values ($1, $2, $3, $4)
        on conflict (evaluation_id, criterion_id)
        do update set score = excluded.score, comment = excluded.comment
        returning
          evaluation_id as "evaluationId",
          criterion_id as "criterionId",
          score,
          comment
      `,
                [input.evaluationId, it.criterionId, it.score, it.comment ?? null]
            )
            if (rows[0]) out.push(rows[0] as DbEvaluationScore)
        }
        await client.query("commit")
        return out
    } catch (err) {
        await client.query("rollback")
        throw err
    } finally {
        client.release()
    }
}

export async function deleteEvaluationScores(evaluationId: string) {
    const q = `delete from evaluation_scores where evaluation_id = $1 returning evaluation_id`
    const { rowCount } = await db.query(q, [evaluationId])
    return rowCount
}

/** -------------------- Student Evaluations -------------------- */

export async function listStudentEvaluations(params: {
    scheduleId?: string
    studentId?: string
    status?: string
    limit?: number
    offset?: number
}) {
    const limit = normLimit(params.limit, 50)
    const offset = normOffset(params.offset)

    const where: string[] = []
    const values: any[] = []
    let i = 1

    if (params.scheduleId) {
        where.push(`se.schedule_id = $${i++}`)
        values.push(params.scheduleId)
    }
    if (params.studentId) {
        where.push(`se.student_id = $${i++}`)
        values.push(params.studentId)
    }
    if (params.status) {
        // SAFE for TEXT or ENUM column
        where.push(`lower(se.status::text) = lower($${i++})`)
        values.push(params.status)
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : ""

    const q = `
    select
      se.id,
      se.schedule_id as "scheduleId",
      se.student_id as "studentId",
      se.status,
      se.answers,
      se.submitted_at as "submittedAt",
      se.locked_at as "lockedAt",
      se.created_at as "createdAt",
      se.updated_at as "updatedAt"
    from student_evaluations se
    ${whereSql}
    order by se.updated_at desc
    limit $${i} offset $${i + 1}
  `
    const { rows } = await db.query(q, [...values, limit, offset])
    return rows as DbStudentEvaluation[]
}

export async function getStudentEvaluationById(id: string) {
    const q = `
    select
      se.id,
      se.schedule_id as "scheduleId",
      se.student_id as "studentId",
      se.status,
      se.answers,
      se.submitted_at as "submittedAt",
      se.locked_at as "lockedAt",
      se.created_at as "createdAt",
      se.updated_at as "updatedAt"
    from student_evaluations se
    where se.id = $1
    limit 1
  `
    const { rows } = await db.query(q, [id])
    return (rows[0] ?? null) as DbStudentEvaluation | null
}

export async function upsertStudentEvaluation(input: {
    scheduleId: string
    studentId: string
    status?: "pending" | "submitted" | "locked" | string
    answers?: any
    submittedAt?: string | null
    lockedAt?: string | null
}) {
    const typeIdent = await getStudentStatusTypeIdent()
    const statusCast = typeIdent ? `::${typeIdent}` : ""

    const q = `
    insert into student_evaluations (schedule_id, student_id, status, answers, submitted_at, locked_at)
    values ($1, $2, $3${statusCast}, $4::jsonb, $5::timestamptz, $6::timestamptz)
    on conflict (schedule_id, student_id)
    do update set
      status = excluded.status,
      answers = excluded.answers,
      submitted_at = excluded.submitted_at,
      locked_at = excluded.locked_at
    returning
      id,
      schedule_id as "scheduleId",
      student_id as "studentId",
      status,
      answers,
      submitted_at as "submittedAt",
      locked_at as "lockedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `
    const { rows } = await db.query(q, [
        input.scheduleId,
        input.studentId,
        input.status ?? "pending",
        JSON.stringify(input.answers ?? {}),
        input.submittedAt ?? null,
        input.lockedAt ?? null,
    ])
    return rows[0] as DbStudentEvaluation
}

export async function updateStudentEvaluation(
    id: string,
    patch: Partial<{
        status: "pending" | "submitted" | "locked" | string
        answers: any
        submittedAt: string | null
        lockedAt: string | null
    }>
) {
    const typeIdent = await getStudentStatusTypeIdent()
    const statusCast = typeIdent ? `::${typeIdent}` : ""

    const sets: string[] = []
    const values: any[] = []
    let i = 1

    if (patch.status !== undefined) {
        sets.push(`status = $${i++}${statusCast}`)
        values.push(patch.status)
    }
    if (patch.answers !== undefined) {
        sets.push(`answers = $${i++}::jsonb`)
        values.push(JSON.stringify(patch.answers ?? {}))
    }
    if (patch.submittedAt !== undefined) {
        sets.push(`submitted_at = $${i++}::timestamptz`)
        values.push(patch.submittedAt)
    }
    if (patch.lockedAt !== undefined) {
        sets.push(`locked_at = $${i++}::timestamptz`)
        values.push(patch.lockedAt)
    }

    if (!sets.length) return null

    values.push(id)
    const q = `
    update student_evaluations
    set ${sets.join(", ")}
    where id = $${i}
    returning
      id,
      schedule_id as "scheduleId",
      student_id as "studentId",
      status,
      answers,
      submitted_at as "submittedAt",
      locked_at as "lockedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `
    const { rows } = await db.query(q, values)
    return (rows[0] ?? null) as DbStudentEvaluation | null
}

export async function deleteStudentEvaluation(id: string) {
    const q = `delete from student_evaluations where id = $1 returning id`
    const { rows } = await db.query(q, [id])
    return (rows[0]?.id ?? null) as string | null
}
