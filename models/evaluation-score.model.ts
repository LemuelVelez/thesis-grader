
import { db } from "@/lib/db"

export type EvaluationScoreRow = {
    evaluation_id: string
    criterion_id: string
    score: number
    comment: string | null
}

export async function listEvaluationScores(evaluation_id: string) {
    const q = `
    select evaluation_id, criterion_id, score, comment
    from evaluation_scores
    where evaluation_id = $1
    order by criterion_id asc
  `
    const { rows } = await db.query(q, [evaluation_id])
    return (rows as EvaluationScoreRow[]) ?? []
}

export async function upsertEvaluationScore(args: {
    evaluation_id: string
    criterion_id: string
    score: number
    comment?: string | null
}) {
    const q = `
    insert into evaluation_scores (evaluation_id, criterion_id, score, comment)
    values ($1, $2, $3, $4)
    on conflict (evaluation_id, criterion_id)
    do update set
      score = excluded.score,
      comment = excluded.comment
  `
    await db.query(q, [args.evaluation_id, args.criterion_id, args.score, args.comment ?? null])
}

export async function bulkUpsertEvaluationScores(args: {
    evaluation_id: string
    scores: { criterion_id: string; score: number; comment?: string | null }[]
}) {
    const items = args.scores ?? []
    if (!items.length) return

    // Simple sequential upsert keeps it DB-safe and avoids large dynamic SQL.
    for (const s of items) {
        await upsertEvaluationScore({
            evaluation_id: args.evaluation_id,
            criterion_id: s.criterion_id,
            score: s.score,
            comment: s.comment ?? null,
        })
    }
}

export async function deleteEvaluationScores(evaluation_id: string) {
    const q = `delete from evaluation_scores where evaluation_id = $1`
    await db.query(q, [evaluation_id])
}
