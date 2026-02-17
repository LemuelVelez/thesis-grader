-- 010_evaluation_scores_targets.sql
-- Fixes panelist score writes by adding per-target columns to evaluation_scores.
-- Supports group-level and student-level criterion scores in one evaluation.

begin;

-- Ensure id exists for stable PATCH /api/evaluation-scores/:id workflows
alter table if exists evaluation_scores
  add column if not exists id uuid;

update evaluation_scores
set id = gen_random_uuid()
where id is null;

alter table evaluation_scores
  alter column id set default gen_random_uuid();

-- Replace previous PK (often composite) with id PK to allow multiple targets per criterion
do $$
declare
  v_pk_name text;
begin
  select c.conname
    into v_pk_name
  from pg_constraint c
  where c.conrelid = 'evaluation_scores'::regclass
    and c.contype = 'p'
  limit 1;

  if v_pk_name is not null then
    execute format('alter table evaluation_scores drop constraint %I', v_pk_name);
  end if;
end $$;

alter table evaluation_scores
  add constraint evaluation_scores_pkey primary key (id);

-- Add target columns expected by API payloads
alter table if exists evaluation_scores
  add column if not exists target_type text,
  add column if not exists target_id uuid;

-- Backfill legacy rows as group-level scores
update evaluation_scores es
set
  target_type = coalesce(es.target_type, 'group'),
  target_id = coalesce(es.target_id, ds.group_id)
from evaluations e
join defense_schedules ds on ds.id = e.schedule_id
where es.evaluation_id = e.id
  and (es.target_type is null or es.target_id is null);

-- Add check constraint once
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'evaluation_scores_target_type_check'
      and conrelid = 'evaluation_scores'::regclass
  ) then
    alter table evaluation_scores
      add constraint evaluation_scores_target_type_check
      check (target_type in ('group', 'student'));
  end if;
end $$;

-- Only enforce NOT NULL if backfill is complete
do $$
begin
  if not exists (
    select 1
    from evaluation_scores
    where target_type is null or target_id is null
  ) then
    alter table evaluation_scores alter column target_type set not null;
    alter table evaluation_scores alter column target_id set not null;
  else
    raise notice 'Some evaluation_scores rows still have null target fields. NOT NULL skipped.';
  end if;
end $$;

-- Drop old uniqueness on (evaluation_id, criterion_id) if present
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'evaluation_scores_evaluation_id_criterion_id_key'
      and conrelid = 'evaluation_scores'::regclass
  ) then
    alter table evaluation_scores
      drop constraint evaluation_scores_evaluation_id_criterion_id_key;
  end if;
end $$;

drop index if exists evaluation_scores_eval_criterion_uidx;

-- New uniqueness: one row per evaluation + criterion + target
create unique index if not exists evaluation_scores_eval_criterion_target_uidx
  on evaluation_scores (evaluation_id, criterion_id, target_type, target_id);

create index if not exists evaluation_scores_evaluation_target_ix
  on evaluation_scores (evaluation_id, target_type, target_id);

create index if not exists evaluation_scores_target_ix
  on evaluation_scores (target_type, target_id);

comment on column evaluation_scores.target_type is
  'Scoring target type: group or student';
comment on column evaluation_scores.target_id is
  'Target identifier. group_id when target_type=group, student user_id when target_type=student';

commit;
