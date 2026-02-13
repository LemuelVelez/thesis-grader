-- 007_rubric_form3c_and_score_rules.sql
-- Binds schedules to rubric templates, seeds Form 3-C rubric,
-- and enforces criterion/template and score-range guards.

-- 1) Every defense schedule can point to a rubric template
alter table if exists defense_schedules
  add column if not exists rubric_template_id uuid references rubric_templates(id) on delete set null;

create index if not exists defense_schedules_rubric_template_ix
  on defense_schedules (rubric_template_id);

-- 2) Seed CCS Form 3-C template
insert into rubric_templates (name, version, active, description)
select
  'CCS Thesis Form 3-C (Draft November 2, 2021)',
  1,
  true,
  'Rubric based on CCS Thesis Form 3-C categories; configured for 1-5 scoring.'
where not exists (
  select 1
  from rubric_templates
  where lower(name) = lower('CCS Thesis Form 3-C (Draft November 2, 2021)')
    and version = 1
);

-- Optional score labels for UI
create table if not exists rubric_scale_levels (
  template_id uuid not null references rubric_templates(id) on delete cascade,
  score int not null check (score between 1 and 5),
  adjectival text not null,
  description text,
  primary key (template_id, score)
);

with tpl as (
  select id
  from rubric_templates
  where lower(name) = lower('CCS Thesis Form 3-C (Draft November 2, 2021)')
    and version = 1
  order by created_at desc
  limit 1
)
insert into rubric_scale_levels (template_id, score, adjectival, description)
select tpl.id, v.score, v.adjectival, v.description
from tpl
cross join (
  values
    (5, 'Professional / Accomplished', 'Excellent performance/output'),
    (4, 'Competent', 'Meets expected standard with minor gaps'),
    (3, 'Developing', 'Acceptable but needs improvements'),
    (2, 'Needs Improvement', 'Major gaps present'),
    (1, 'Absent / Very Poor', 'Criterion missing or not demonstrated')
) as v(score, adjectival, description)
on conflict do nothing;

-- 3) Seed Form 3-C criteria
with tpl as (
  select id
  from rubric_templates
  where lower(name) = lower('CCS Thesis Form 3-C (Draft November 2, 2021)')
    and version = 1
  order by created_at desc
  limit 1
)
insert into rubric_criteria (template_id, criterion, description, weight, min_score, max_score)
select tpl.id, v.criterion, v.description, v.weight, 1, 5
from tpl
cross join (
  values
    (
      'Introduction (Context/Background)',
      'Background information should clearly establish project context and link sources to the current project.',
      25::numeric
    ),
    (
      'Research Concept (Question/Problem/Thesis/Hypothesis/Purpose/Objectives)',
      'The thesis/problem/question/purpose/objectives should be clear, specific, and well-defined.',
      25::numeric
    ),
    (
      'Methodology/Experimental Plan/Creative–Scholarly Process',
      'Method or scholarly process should be detailed enough for expert understanding and potential replication.',
      25::numeric
    ),
    (
      'Project Presentation',
      'Presenters should be prepared, knowledgeable, and able to answer questions effectively.',
      25::numeric
    )
) as v(criterion, description, weight)
where not exists (
  select 1
  from rubric_criteria rc
  where rc.template_id = tpl.id
    and lower(rc.criterion) = lower(v.criterion)
);

-- 4) Backfill existing schedules with this template if null
with tpl as (
  select id
  from rubric_templates
  where lower(name) = lower('CCS Thesis Form 3-C (Draft November 2, 2021)')
    and version = 1
  order by created_at desc
  limit 1
)
update defense_schedules ds
set rubric_template_id = (select id from tpl)
where ds.rubric_template_id is null
  and exists (select 1 from tpl);

-- 5) Auto-assign active template on insert when rubric_template_id is omitted
create or replace function tg_defense_schedules_default_rubric()
returns trigger
language plpgsql
as $$
begin
  if new.rubric_template_id is null then
    select rt.id
      into new.rubric_template_id
    from rubric_templates rt
    where rt.active = true
    order by rt.version desc, rt.created_at desc
    limit 1;
  end if;

  return new;
end $$;

drop trigger if exists defense_schedules_default_rubric on defense_schedules;
create trigger defense_schedules_default_rubric
before insert on defense_schedules
for each row execute function tg_defense_schedules_default_rubric();

-- 6) Guard evaluation_scores:
--    - criterion must belong to the schedule's rubric template
--    - score must be within criterion min/max (dropdown range)
create or replace function tg_evaluation_scores_guard()
returns trigger
language plpgsql
as $$
declare
  v_min int;
  v_max int;
  v_criterion_template uuid;
  v_schedule_template uuid;
begin
  select rc.min_score, rc.max_score, rc.template_id
    into v_min, v_max, v_criterion_template
  from rubric_criteria rc
  where rc.id = new.criterion_id;

  if not found then
    raise exception 'Rubric criterion % not found', new.criterion_id;
  end if;

  select ds.rubric_template_id
    into v_schedule_template
  from evaluations e
  join defense_schedules ds on ds.id = e.schedule_id
  where e.id = new.evaluation_id;

  if v_schedule_template is null then
    raise exception 'Evaluation % has no rubric template via schedule', new.evaluation_id;
  end if;

  if v_criterion_template <> v_schedule_template then
    raise exception
      'Criterion % belongs to template %, but evaluation % expects template %',
      new.criterion_id, v_criterion_template, new.evaluation_id, v_schedule_template;
  end if;

  if new.score < v_min or new.score > v_max then
    raise exception
      'Score % out of allowed range [%..%] for criterion %',
      new.score, v_min, v_max, new.criterion_id;
  end if;

  return new;
end $$;

drop trigger if exists evaluation_scores_guard on evaluation_scores;
create trigger evaluation_scores_guard
before insert or update on evaluation_scores
for each row execute function tg_evaluation_scores_guard();
