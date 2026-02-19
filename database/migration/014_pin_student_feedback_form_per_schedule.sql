-- 014_pin_student_feedback_form_per_schedule.sql
-- Pins the ACTIVE student feedback form per defense schedule at assignment time,
-- so all student evaluations for the schedule use a consistent form version.

begin;

alter table defense_schedules
  add column if not exists student_feedback_form_id uuid null
    references student_feedback_forms(id) on delete set null;

create index if not exists defense_schedules_student_feedback_form_id_idx
  on defense_schedules (student_feedback_form_id);

-- Backfill: prefer ACTIVE form, else latest version.
with active_form as (
  select id from student_feedback_forms where active is true limit 1
),
latest_form as (
  select id from student_feedback_forms order by version desc limit 1
),
chosen as (
  select coalesce((select id from active_form), (select id from latest_form)) as id
)
update defense_schedules
set student_feedback_form_id = (select id from chosen)
where student_feedback_form_id is null;

-- Align existing student_evaluations.form_id to the pinned schedule form when missing.
update student_evaluations se
set form_id = ds.student_feedback_form_id
from defense_schedules ds
where se.schedule_id = ds.id
  and se.form_id is null
  and ds.student_feedback_form_id is not null;

commit;
