-- 006b_roles_panelist_followup.sql
-- Uses 'panelist' AFTER 006 has committed.

-- Optional data migration:
-- Existing staff users already assigned as evaluators/panelists become panelists.
update users u
set role = 'panelist',
    updated_at = now()
where u.role = 'staff'
  and (
    exists (select 1 from evaluations e where e.evaluator_id = u.id)
    or exists (select 1 from schedule_panelists sp where sp.staff_id = u.id)
  );

create table if not exists panelist_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  expertise text,
  created_at timestamptz not null default now()
);

create or replace function tg_panelist_profiles_role_guard()
returns trigger
language plpgsql
as $$
begin
  perform tg_assert_user_role(new.user_id, 'panelist');
  return new;
end $$;

drop trigger if exists panelist_profiles_role_guard on panelist_profiles;
create trigger panelist_profiles_role_guard
before insert or update on panelist_profiles
for each row execute function tg_panelist_profiles_role_guard();

-- schedule_panelists.staff_id kept for compatibility, but role must be panelist
create or replace function tg_schedule_panelists_role_guard()
returns trigger
language plpgsql
as $$
begin
  perform tg_assert_user_role(new.staff_id, 'panelist');
  return new;
end $$;

drop trigger if exists schedule_panelists_role_guard on schedule_panelists;
create trigger schedule_panelists_role_guard
before insert or update on schedule_panelists
for each row execute function tg_schedule_panelists_role_guard();

-- evaluator must be panelist
create or replace function tg_evaluations_role_guard()
returns trigger
language plpgsql
as $$
begin
  perform tg_assert_user_role(new.evaluator_id, 'panelist');
  return new;
end $$;

drop trigger if exists evaluations_role_guard on evaluations;
create trigger evaluations_role_guard
before insert or update on evaluations
for each row execute function tg_evaluations_role_guard();

-- Adviser can be staff/panelist/admin
create or replace function tg_thesis_groups_adviser_guard()
returns trigger
language plpgsql
as $$
begin
  if new.adviser_id is not null then
    perform tg_assert_user_role_in(new.adviser_id, array['staff','panelist','admin']::thesis_role[]);
  end if;
  return new;
end $$;

drop trigger if exists thesis_groups_adviser_guard on thesis_groups;
create trigger thesis_groups_adviser_guard
before insert or update on thesis_groups
for each row execute function tg_thesis_groups_adviser_guard();
