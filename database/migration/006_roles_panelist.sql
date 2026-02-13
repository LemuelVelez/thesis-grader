-- 006_roles_panelist.sql
-- IMPORTANT: keep this file only for adding enum value.
-- PostgreSQL requires committing enum value before using it elsewhere.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'thesis_role'
      and e.enumlabel = 'panelist'
  ) then
    alter type thesis_role add value 'panelist';
  end if;
end $$;
