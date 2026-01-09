-- 004_add_rubric_descriptions.sql
-- Adds description support to rubric_templates and rubric_criteria

alter table if exists rubric_templates
  add column if not exists description text;

-- rubric_criteria already has description in your 001_init.sql, but keep this safe/idempotent:
alter table if exists rubric_criteria
  add column if not exists description text;
