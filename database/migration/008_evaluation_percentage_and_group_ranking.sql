-- 008_evaluation_percentage_and_group_ranking.sql
-- Adds overall percentage computation + thesis group ranking (high to low).

create or replace view v_evaluation_overall_percentages as
with criteria as (
  select
    e.id as evaluation_id,
    rc.id as criterion_id,
    rc.weight,
    rc.max_score
  from evaluations e
  join defense_schedules ds on ds.id = e.schedule_id
  join rubric_criteria rc on rc.template_id = ds.rubric_template_id
),
totals as (
  select
    c.evaluation_id,
    sum(coalesce(es.score, 0)::numeric * c.weight) as weighted_score,
    sum(c.max_score::numeric * c.weight) as weighted_max,
    count(*) as criteria_count,
    count(es.score) as criteria_scored
  from criteria c
  left join evaluation_scores es
    on es.evaluation_id = c.evaluation_id
   and es.criterion_id = c.criterion_id
  group by c.evaluation_id
)
select
  e.id as evaluation_id,
  e.schedule_id,
  ds.group_id,
  e.evaluator_id,
  e.status,
  coalesce(t.criteria_count, 0) as criteria_count,
  coalesce(t.criteria_scored, 0) as criteria_scored,
  round(coalesce((t.weighted_score / nullif(t.weighted_max, 0)) * 100, 0), 2) as overall_percentage,
  round(coalesce(t.weighted_score, 0), 3) as weighted_score,
  round(coalesce(t.weighted_max, 0), 3) as weighted_max,
  e.submitted_at,
  e.locked_at,
  e.created_at
from evaluations e
join defense_schedules ds on ds.id = e.schedule_id
left join totals t on t.evaluation_id = e.id;

create or replace view v_thesis_group_rankings as
with group_scores as (
  select
    tg.id as group_id,
    tg.title as group_title,
    round(avg(v.overall_percentage) filter (where v.status in ('submitted','locked')), 2) as group_percentage,
    count(*) filter (where v.status in ('submitted','locked')) as submitted_evaluations,
    max(ds.scheduled_at) as latest_defense_at
  from thesis_groups tg
  left join defense_schedules ds on ds.group_id = tg.id
  left join v_evaluation_overall_percentages v on v.schedule_id = ds.id
  group by tg.id, tg.title
)
select
  group_id,
  group_title,
  group_percentage,
  submitted_evaluations,
  latest_defense_at,
  dense_rank() over (
    order by group_percentage desc nulls last,
             latest_defense_at desc nulls last,
             group_title asc
  ) as rank
from group_scores;
