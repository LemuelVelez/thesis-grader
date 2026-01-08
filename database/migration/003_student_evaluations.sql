-- 003_student_evaluations.sql

do $$ begin
  create type student_eval_status as enum ('pending','submitted','locked');
exception when duplicate_object then null;
end $$;

create table if not exists student_evaluations (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references defense_schedules(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  status student_eval_status not null default 'pending',
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, student_id)
);

create index if not exists student_evaluations_schedule_ix on student_evaluations (schedule_id);
create index if not exists student_evaluations_student_ix on student_evaluations (student_id);

create or replace function tg_student_evaluations_role_guard()
returns trigger
language plpgsql
as $$
begin
  perform tg_assert_user_role(new.student_id, 'student');
  return new;
end $$;

do $$ begin
  create trigger student_evaluations_role_guard
  before insert or update on student_evaluations
  for each row execute function tg_student_evaluations_role_guard();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger student_evaluations_touch_updated_at
  before update on student_evaluations
  for each row execute function tg_set_updated_at();
exception when duplicate_object then null;
end $$;
