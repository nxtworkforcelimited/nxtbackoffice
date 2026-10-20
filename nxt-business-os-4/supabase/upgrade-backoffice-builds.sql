-- Run once after the operations, finance and device-register upgrades.
begin;
create table public.backoffice_builds (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 title text not null check(length(trim(title)) between 1 and 160),
 description text not null default '' check(length(description)<=5000),
 url text not null default '' check(url='' or url ~ '^https?://'),
 status text not null default 'Not started' check(status in ('Not started','In progress','Under review','Complete')),
 assignee_id uuid,target_date date,
 review_notes text not null default '' check(length(review_notes)<=5000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(tenant_id,id),
 foreign key(tenant_id,assignee_id) references public.staff_directory(tenant_id,user_id)
);
alter table public.backoffice_builds enable row level security;
create policy builds_read on public.backoffice_builds for select to authenticated using(public.is_staff(tenant_id));
create policy builds_create on public.backoffice_builds for insert to authenticated with check(public.is_staff(tenant_id) and public.has_capability(tenant_id,'tickets'));
create policy builds_update on public.backoffice_builds for update to authenticated using(public.is_staff(tenant_id) and public.has_capability(tenant_id,'tickets')) with check(public.is_staff(tenant_id) and public.has_capability(tenant_id,'tickets'));
revoke all on public.backoffice_builds from anon;
grant select,insert,update on public.backoffice_builds to authenticated;
create function public.guard_backoffice_build() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op='UPDATE' and (new.id<>old.id or new.tenant_id<>old.tenant_id or new.created_at<>old.created_at) then raise exception 'Build identity cannot change';end if;
 if new.status='Complete' and length(trim(new.review_notes))=0 then raise exception 'Add review notes before completing a build';end if;
 new.updated_at:=now();return new;end;$$;
revoke all on function public.guard_backoffice_build() from public,anon,authenticated;
create trigger backoffice_build_guard before insert or update on public.backoffice_builds for each row execute function public.guard_backoffice_build();
create trigger backoffice_build_audit after insert or update on public.backoffice_builds for each row execute function public.record_audit();
alter table public.it_tickets add column backoffice_id uuid;
alter table public.it_tickets add constraint ticket_backoffice_workspace foreign key(tenant_id,backoffice_id) references public.backoffice_builds(tenant_id,id);
create index tickets_backoffice on public.it_tickets(tenant_id,backoffice_id,status);
-- Existing ticket status values retained for compatibility; the UI presents the four requested labels.
commit;
