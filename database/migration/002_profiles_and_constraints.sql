-- 002_profiles_and_constraints.sql

-- Basic profile tables
create table if not exists students (
  user_id uuid primary key references users(id) on delete cascade,
  program text,
  section text,
  created_at timestamptz not null default now()
);

create table if not exists staff_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  department text,
  created_at timestamptz not null default now()
);

-- Helpers for role enforcement (strict separation)
create or replace function tg_assert_user_role(p_user_id uuid, p_role thesis_role)
returns void
language plpgsql
as $$
begin
  if p_user_id is null then
    return;
  end if;

  if not exists (select 1 from users where id = p_user_id and role = p_role) then
    raise exception 'User % must have role %', p_user_id, p_role;
  end if;
end $$;

create or replace function tg_assert_user_role_in(p_user_id uuid, p_roles thesis_role[])
returns void
language plpgsql
as $$
begin
  if p_user_id is null then
    return;
  end if;

  if not exists (select 1 from users where id = p_user_id and role = any(p_roles)) then
    raise exception 'User % must have one of roles %', p_user_id, p_roles;
  end if;
end $$;

-- updated_at auto-touch
create or replace function tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Students table role enforcement
create or replace function tg_students_role_guard()
returns trigger
language plpgsql
as $$
begin
  perform tg_assert_user_role(new.user_id, 'student');
  return new;
end $$;

do $$ begin
  create trigger students_role_guard
  before insert or update on students
  for each row execute function tg_students_role_guard();
exception when duplicate_object then null;
end $$;

-- Staff profiles role enforcement
create or replace function tg_staff_profiles_role_guard()
returns trigger
language plpgsql
as $$
begin
  perform tg_assert_user_role(new.user_id, 'staff');
  return new;
end $$;

do $$ begin
  create trigger staff_profiles_role_guard
  before insert or update on staff_profiles
  for each row execute function tg_staff_profiles_role_guard();
exception when duplicate_object then null;
end $$;

-- Enforce member/panelist roles on existing tables created in 001
create or replace function tg_group_members_role_guard()
returns trigger
language plpgsql
as $$
begin
  perform tg_assert_user_role(new.student_id, 'student');
  return new;
end $$;

do $$ begin
  create trigger group_members_role_guard
  before insert or update on group_members
  for each row execute function tg_group_members_role_guard();
exception when duplicate_object then null;
end $$;

create or replace function tg_schedule_panelists_role_guard()
returns trigger
language plpgsql
as $$
begin
  perform tg_assert_user_role(new.staff_id, 'staff');
  return new;
end $$;

do $$ begin
  create trigger schedule_panelists_role_guard
  before insert or update on schedule_panelists
  for each row execute function tg_schedule_panelists_role_guard();
exception when duplicate_object then null;
end $$;

create or replace function tg_evaluations_role_guard()
returns trigger
language plpgsql
as $$
begin
  perform tg_assert_user_role(new.evaluator_id, 'staff');
  return new;
end $$;

do $$ begin
  create trigger evaluations_role_guard
  before insert or update on evaluations
  for each row execute function tg_evaluations_role_guard();
exception when duplicate_object then null;
end $$;

create or replace function tg_thesis_groups_adviser_guard()
returns trigger
language plpgsql
as $$
begin
  if new.adviser_id is not null then
    perform tg_assert_user_role_in(new.adviser_id, array['staff','admin']::thesis_role[]);
  end if;
  return new;
end $$;

do $$ begin
  create trigger thesis_groups_adviser_guard
  before insert or update on thesis_groups
  for each row execute function tg_thesis_groups_adviser_guard();
exception when duplicate_object then null;
end $$;

create or replace function tg_defense_schedules_created_by_guard()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is not null then
    perform tg_assert_user_role_in(new.created_by, array['staff','admin']::thesis_role[]);
  end if;
  return new;
end $$;

do $$ begin
  create trigger defense_schedules_created_by_guard
  before insert or update on defense_schedules
  for each row execute function tg_defense_schedules_created_by_guard();
exception when duplicate_object then null;
end $$;

-- updated_at triggers (existing tables)
do $$ begin
  create trigger users_touch_updated_at
  before update on users
  for each row execute function tg_set_updated_at();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger thesis_groups_touch_updated_at
  before update on thesis_groups
  for each row execute function tg_set_updated_at();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger defense_schedules_touch_updated_at
  before update on defense_schedules
  for each row execute function tg_set_updated_at();
exception when duplicate_object then null;
end $$;

do $$ begin
  create trigger rubric_templates_touch_updated_at
  before update on rubric_templates
  for each row execute function tg_set_updated_at();
exception when duplicate_object then null;
end $$;
