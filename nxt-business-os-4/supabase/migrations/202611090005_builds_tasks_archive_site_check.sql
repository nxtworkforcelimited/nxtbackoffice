-- Websites & Back Offices: per-build task list, archive instead of delete, and last automatic site check.
-- Additive only. Existing builds keep every value; nothing is deleted or reset.
begin;
alter table public.backoffice_builds
 add column if not exists tasks jsonb not null default '[]'::jsonb,
 add column if not exists archived_at timestamptz,
 add column if not exists site_check jsonb,
 add column if not exists site_checked_at timestamptz;
alter table public.backoffice_builds drop constraint if exists backoffice_builds_tasks_is_array;
alter table public.backoffice_builds add constraint backoffice_builds_tasks_is_array check(jsonb_typeof(tasks)='array' and jsonb_array_length(tasks)<=100);
create index if not exists backoffice_builds_active_idx on public.backoffice_builds(tenant_id,archived_at);
commit;
