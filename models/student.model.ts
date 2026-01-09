
import { db } from "@/lib/db"

export type StudentProfileRow = {
    user_id: string
    program: string | null
    section: string | null
    created_at: string
}

export async function getStudentProfile(user_id: string) {
    const q = `
    select user_id, program, section, created_at
    from students
    where user_id = $1
    limit 1
  `
    const { rows } = await db.query(q, [user_id])
    return rows[0] as StudentProfileRow | undefined
}

export async function upsertStudentProfile(args: { user_id: string; program?: string | null; section?: string | null }) {
    const q = `
    insert into students (user_id, program, section)
    values ($1, $2, $3)
    on conflict (user_id)
    do update set
      program = excluded.program,
      section = excluded.section
    returning user_id
  `
    const { rows } = await db.query(q, [args.user_id, args.program ?? null, args.section ?? null])
    return rows[0]?.user_id as string | undefined
}

export async function deleteStudentProfile(user_id: string) {
    const q = `delete from students where user_id = $1`
    await db.query(q, [user_id])
}
