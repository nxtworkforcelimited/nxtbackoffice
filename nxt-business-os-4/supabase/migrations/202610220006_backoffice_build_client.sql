begin;
alter table public.backoffice_builds
 add column if not exists client_id uuid;
alter table public.backoffice_builds
 drop constraint if exists backoffice_builds_tenant_id_client_id_fkey;
alter table public.backoffice_builds
 add constraint backoffice_builds_tenant_id_client_id_fkey
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id);
create index if not exists backoffice_builds_client_idx on public.backoffice_builds(tenant_id,client_id);
commit;