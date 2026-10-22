-- Remove task dependency behavior; project dependencies are unchanged.
begin;
update public.work_flow set depends_on=null,updated_at=now() where kind='tasks' and depends_on is not null;
commit;
