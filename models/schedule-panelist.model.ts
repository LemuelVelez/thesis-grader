
import { db } from "@/lib/db"

export type SchedulePanelistRow = {
    schedule_id: string
    staff_id: string
}

export type PanelistUserRow = {
    schedule_id: string
    staff_id: string
    staff_name: string
    staff_email: string
}

export async function addSchedulePanelist(args: { schedule_id: string; staff_id: string }) {
    const q = `
    insert into schedule_panelists (schedule_id, staff_id)
    values ($1, $2)
    on conflict do nothing
  `
    await db.query(q, [args.schedule_id, args.staff_id])
}

export async function removeSchedulePanelist(args: { schedule_id: string; staff_id: string }) {
    const q = `delete from schedule_panelists where schedule_id = $1 and staff_id = $2`
    await db.query(q, [args.schedule_id, args.staff_id])
}

export async function listSchedulePanelists(schedule_id: string) {
    const q = `
    select
      sp.schedule_id,
      sp.staff_id,
      u.name as staff_name,
      u.email as staff_email
    from schedule_panelists sp
    join users u on u.id = sp.staff_id
    where sp.schedule_id = $1
    order by u.name asc
  `
    const { rows } = await db.query(q, [schedule_id])
    return (rows as PanelistUserRow[]) ?? []
}
