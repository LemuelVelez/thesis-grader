
import { db } from "@/lib/db"

export type EvaluationRow = {
    id: string
    schedule_id: string
    evaluator_id: string
    status: string
    submitted_at: string | null
    locked_at: string | null
    created_at: string
}

export async function createEvaluation(args: {
    schedule_id: string
    evaluator_id: string
    status?: string
}) {
    const q = `
    insert into evaluations (schedule_id, evaluator_id, status)
    values ($1, $2, $3)
    on conflict (schedule_id, evaluator_id) do nothing
    returning id
  `
    const { rows } = await db.query(q, [args.schedule_id, args.evaluator_id, args.status ?? "pending"])
    return rows[0]?.id as string | undefined
}

export async function getEvaluationById(id: string) {
    const q = `
    select id, schedule_id, evaluator_id, status, submitted_at, locked_at, created_at
    from evaluations
    where id = $1
    limit 1
  `
    const { rows } = await db.query(q, [id])
    return rows[0] as EvaluationRow | undefined
}

export async function getEvaluationByAssignment(args: { schedule_id: string; evaluator_id: string }) {
    const q = `
    select id, schedule_id, evaluator_id, status, submitted_at, locked_at, created_at
    from evaluations
    where schedule_id = $1 and evaluator_id = $2
    limit 1
  `
    const { rows } = await db.query(q, [args.schedule_id, args.evaluator_id])
    return rows[0] as EvaluationRow | undefined
}

export async function listEvaluationsBySchedule(schedule_id: string) {
    const q = `
    select id, schedule_id, evaluator_id, status, submitted_at, locked_at, created_at
    from evaluations
    where schedule_id = $1
    order by created_at asc
  `
    const { rows } = await db.query(q, [schedule_id])
    return (rows as EvaluationRow[]) ?? []
}

export async function updateEvaluationStatus(args: { id: string; status: string }) {
    const q = `
    update evaluations
    set status = $2
    where id = $1
    returning id
  `
    const { rows } = await db.query(q, [args.id, args.status])
    return rows[0]?.id as string | undefined
}

export async function markEvaluationSubmitted(id: string) {
    const q = `
    update evaluations
    set status = 'submitted',
        submitted_at = now()
    where id = $1
    returning id
  `
    const { rows } = await db.query(q, [id])
    return rows[0]?.id as string | undefined
}

export async function lockEvaluation(id: string) {
    const q = `
    update evaluations
    set status = 'locked',
        locked_at = now()
    where id = $1
    returning id
  `
    const { rows } = await db.query(q, [id])
    return rows[0]?.id as string | undefined
}

export async function deleteEvaluation(id: string) {
    const q = `delete from evaluations where id = $1`
    await db.query(q, [id])
}
