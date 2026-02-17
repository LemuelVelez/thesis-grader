-- 011_fix_group_target_id_backfill.sql
-- Normalizes legacy group target identifiers in evaluation_scores.
-- Fixes cases where target_id was saved as defense_schedules.id instead of thesis_groups.id.

begin;

-- 1) Convert group target_id values that point to defense_schedules.id into canonical group_id.
update evaluation_scores es
set target_id = ds.group_id
from defense_schedules ds
where coalesce(es.target_type, 'group') = 'group'
  and es.target_id = ds.id
  and ds.group_id is not null
  and es.target_id is distinct from ds.group_id;

-- 2) Backfill missing target fields using evaluation -> schedule -> group mapping.
update evaluation_scores es
set
  target_type = coalesce(es.target_type, 'group'),
  target_id = coalesce(es.target_id, ds.group_id)
from evaluations e
join defense_schedules ds on ds.id = e.schedule_id
where es.evaluation_id = e.id
  and (es.target_type is null or es.target_id is null);

-- 3) Remove duplicates that may appear after canonical remapping.
with ranked as (
  select
    ctid,
    row_number() over (
      partition by evaluation_id, criterion_id, coalesce(target_type, 'group'), target_id
      order by id
    ) as rn
  from evaluation_scores
  where target_id is not null
)
delete from evaluation_scores es
using ranked r
where es.ctid = r.ctid
  and r.rn > 1;

-- 4) Rebuild uniqueness for one score per (evaluation + criterion + target).
drop index if exists evaluation_scores_eval_criterion_target_uidx;

create unique index if not exists evaluation_scores_eval_criterion_target_uidx
  on evaluation_scores (evaluation_id, criterion_id, target_type, target_id);

-- 5) Supporting index for fast reads by evaluation and target.
create index if not exists evaluation_scores_evaluation_target_ix
  on evaluation_scores (evaluation_id, target_type, target_id);

commit;
