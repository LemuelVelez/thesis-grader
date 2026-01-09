import { db } from "@/lib/db"

export type StaffProfileRow = {
    user_id: string
    department: string | null
    created_at: string
}

export async function getStaffProfile(user_id: string) {
    const q = `
    select user_id, department, created_at
    from staff_profiles
    where user_id = $1
    limit 1
  `
    const { rows } = await db.query(q, [user_id])
    return rows[0] as StaffProfileRow | undefined
}

export async function upsertStaffProfile(args: { user_id: string; department?: string | null }) {
    const q = `
    insert into staff_profiles (user_id, department)
    values ($1, $2)
    on conflict (user_id)
    do update set
      department = excluded.department
    returning user_id
  `
    const { rows } = await db.query(q, [args.user_id, args.department ?? null])
    return rows[0]?.user_id as string | undefined
}

export async function deleteStaffProfile(user_id: string) {
    const q = `delete from staff_profiles where user_id = $1`
    await db.query(q, [user_id])
}
