-- 013_create_student_evaluation_scores.sql
-- Records computed score summaries for student feedback (student_evaluations).
-- Also stores which feedback form version was used via student_evaluations.form_id.

begin;

-- Track which form version a student evaluation used (for consistent scoring over time).
alter table student_evaluations
  add column if not exists form_id uuid null references student_feedback_forms(id) on delete set null;

create index if not exists student_evaluations_form_id_idx
  on student_evaluations (form_id);

-- Best-effort backfill for existing rows (use ACTIVE form, else latest version).
with active_form as (
  select id from student_feedback_forms where active is true limit 1
),
latest_form as (
  select id from student_feedback_forms order by version desc limit 1
),
chosen as (
  select coalesce((select id from active_form), (select id from latest_form)) as id
)
update student_evaluations
set form_id = (select id from chosen)
where form_id is null;

-- Score summaries (persisted). One score row per student evaluation.
create table if not exists student_evaluation_scores (
  id uuid primary key default gen_random_uuid(),

  student_evaluation_id uuid not null references student_evaluations(id) on delete cascade,
  schedule_id uuid not null references defense_schedules(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  form_id uuid null references student_feedback_forms(id) on delete set null,

  total_score numeric not null default 0,
  max_score numeric not null default 0,
  percentage numeric not null default 0,
  breakdown jsonb not null default '{}'::jsonb,

  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists student_evaluation_scores_student_evaluation_uidx
  on student_evaluation_scores (student_evaluation_id);

create index if not exists student_evaluation_scores_schedule_idx
  on student_evaluation_scores (schedule_id);

create index if not exists student_evaluation_scores_student_idx
  on student_evaluation_scores (student_id);

create index if not exists student_evaluation_scores_form_idx
  on student_evaluation_scores (form_id);

commit;
