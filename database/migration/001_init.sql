-- 001_init.sql
-- Run with: psql "$DATABASE_URL" -f database/migration/001_init.sql

create extension if not exists pgcrypto;

do $$ begin
  create type thesis_role as enum ('student','staff','admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type user_status as enum ('active','disabled');
exception when duplicate_object then null;
end $$;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  role thesis_role not null,
  status user_status not null default 'active',
  password_hash text not null,
  avatar_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_email_lower_ux on users (lower(email));

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists sessions_token_hash_ux on sessions (token_hash);
create index if not exists sessions_user_id_ix on sessions (user_id);
create index if not exists sessions_expires_at_ix on sessions (expires_at);

create table if not exists password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists password_resets_token_hash_ux on password_resets (token_hash);
create index if not exists password_resets_user_id_ix on password_resets (user_id);

-- (Optional core entities scaffold for later modules)
create table if not exists thesis_groups (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  adviser_id uuid references users(id) on delete set null,
  program text,
  term text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references thesis_groups(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  primary key (group_id, student_id)
);

create table if not exists defense_schedules (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references thesis_groups(id) on delete cascade,
  scheduled_at timestamptz not null,
  room text,
  status text not null default 'scheduled',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists defense_schedules_group_ix on defense_schedules (group_id);
create index if not exists defense_schedules_scheduled_at_ix on defense_schedules (scheduled_at);

create table if not exists schedule_panelists (
  schedule_id uuid not null references defense_schedules(id) on delete cascade,
  staff_id uuid not null references users(id) on delete cascade,
  primary key (schedule_id, staff_id)
);

create table if not exists rubric_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references rubric_templates(id) on delete cascade,
  criterion text not null,
  description text,
  weight numeric(6,3) not null default 1,
  min_score int not null default 1,
  max_score int not null default 5,
  created_at timestamptz not null default now()
);

create index if not exists rubric_criteria_template_ix on rubric_criteria (template_id);

create table if not exists evaluations (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references defense_schedules(id) on delete cascade,
  evaluator_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending',
  submitted_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists evaluations_unique_assignment_ux on evaluations (schedule_id, evaluator_id);

create table if not exists evaluation_scores (
  evaluation_id uuid not null references evaluations(id) on delete cascade,
  criterion_id uuid not null references rubric_criteria(id) on delete cascade,
  score int not null,
  comment text,
  primary key (evaluation_id, criterion_id)
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_actor_ix on audit_logs (actor_id);
create index if not exists audit_logs_created_at_ix on audit_logs (created_at);
