-- 009_student_notifications.sql
-- Adds student notifications and auto notify when evaluation is submitted/locked.

do $$ begin
  create type notification_type as enum ('general','evaluation_submitted','evaluation_locked');
exception when duplicate_object then null;
end $$;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type notification_type not null default 'general',
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_ix
  on notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_ix
  on notifications (user_id, read_at)
  where read_at is null;

create or replace function tg_notify_students_on_evaluation_status()
returns trigger
language plpgsql
as $$
declare
  v_group_id uuid;
  v_group_title text;
  v_ntype notification_type;
  v_title text;
  v_body text;
begin
  -- only notify when status enters submitted/locked
  if tg_op = 'INSERT' then
    if new.status not in ('submitted','locked') then
      return new;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return new;
    end if;
    if new.status not in ('submitted','locked') then
      return new;
    end if;
  end if;

  select ds.group_id, tg.title
    into v_group_id, v_group_title
  from defense_schedules ds
  join thesis_groups tg on tg.id = ds.group_id
  where ds.id = new.schedule_id;

  if v_group_id is null then
    return new;
  end if;

  if new.status = 'locked' then
    v_ntype := 'evaluation_locked';
    v_title := 'Evaluation finalized';
    v_body := format('Your thesis group "%s" has a finalized panel evaluation.',
                     coalesce(v_group_title, 'Untitled Group'));
  else
    v_ntype := 'evaluation_submitted';
    v_title := 'New panel evaluation submitted';
    v_body := format('A panelist submitted an evaluation for your thesis group "%s".',
                     coalesce(v_group_title, 'Untitled Group'));
  end if;

  insert into notifications (user_id, type, title, body, data)
  select
    gm.student_id,
    v_ntype,
    v_title,
    v_body,
    jsonb_build_object(
      'evaluation_id', new.id,
      'schedule_id', new.schedule_id,
      'group_id', v_group_id,
      'status', new.status
    )
  from group_members gm
  where gm.group_id = v_group_id;

  return new;
end $$;

drop trigger if exists evaluations_notify_students on evaluations;
create trigger evaluations_notify_students
after insert or update of status on evaluations
for each row execute function tg_notify_students_on_evaluation_status();
