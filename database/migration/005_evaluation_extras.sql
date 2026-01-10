-- Stores extra staff scoring: overall, system, per-member scores/comments (JSONB)

create table if not exists evaluation_extras (
  evaluation_id uuid primary key references evaluations(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at auto-touch (tg_set_updated_at is created in 002_profiles_and_constraints.sql)
do $$ begin
  create trigger evaluation_extras_touch_updated_at
  before update on evaluation_extras
  for each row execute function tg_set_updated_at();
exception when duplicate_object then null;
end $$;
