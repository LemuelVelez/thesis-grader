/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

export type StudentEvaluationRow = {
    id: string
    schedule_id: string
    student_id: string
    status: "pending" | "submitted" | "locked" | string
    answers: any
    submitted_at: string | null
    locked_at: string | null
    created_at: string
    updated_at: string
}

export async function getStudentEvaluation(args: { schedule_id: string; student_id: string }) {
    const q = `
    select id, schedule_id, student_id, status::text as status, answers, submitted_at, locked_at, created_at, updated_at
    from student_evaluations
    where schedule_id = $1 and student_id = $2
    limit 1
  `
    const { rows } = await db.query(q, [args.schedule_id, args.student_id])
    return rows[0] as StudentEvaluationRow | undefined
}

export async function upsertStudentEvaluation(args: {
    schedule_id: string
    student_id: string
    status?: "pending" | "submitted" | "locked" | string
    answers?: any
}) {
    const q = `
    insert into student_evaluations (schedule_id, student_id, status, answers)
    values ($1, $2, $3::student_eval_status, $4::jsonb)
    on conflict (schedule_id, student_id)
    do update set
      status = excluded.status,
      answers = excluded.answers
    returning id
  `
    const { rows } = await db.query(q, [
        args.schedule_id,
        args.student_id,
        (args.status ?? "pending") as any,
        JSON.stringify(args.answers ?? {}),
    ])
    return rows[0]?.id as string | undefined
}

export async function submitStudentEvaluation(args: { schedule_id: string; student_id: string; answers?: any }) {
    const q = `
    update student_evaluations
    set status = 'submitted',
        answers = coalesce($3::jsonb, answers),
        submitted_at = now()
    where schedule_id = $1 and student_id = $2
    returning id
  `
    const { rows } = await db.query(q, [args.schedule_id, args.student_id, JSON.stringify(args.answers ?? null)])
    return rows[0]?.id as string | undefined
}

export async function lockStudentEvaluation(args: { schedule_id: string; student_id: string }) {
    const q = `
    update student_evaluations
    set status = 'locked',
        locked_at = now()
    where schedule_id = $1 and student_id = $2
    returning id
  `
    const { rows } = await db.query(q, [args.schedule_id, args.student_id])
    return rows[0]?.id as string | undefined
}

export async function listStudentEvaluationsBySchedule(schedule_id: string) {
    const q = `
    select id, schedule_id, student_id, status::text as status, answers, submitted_at, locked_at, created_at, updated_at
    from student_evaluations
    where schedule_id = $1
    order by updated_at desc
  `
    const { rows } = await db.query(q, [schedule_id])
    return (rows as StudentEvaluationRow[]) ?? []
}

export async function deleteStudentEvaluation(id: string) {
    const q = `delete from student_evaluations where id = $1`
    await db.query(q, [id])
}
