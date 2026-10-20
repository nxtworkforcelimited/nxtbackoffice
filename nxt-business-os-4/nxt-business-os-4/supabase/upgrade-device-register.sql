-- Run once after upgrade-team-operations.sql and upgrade-finance-access.sql.
begin;
create table public.devices (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 asset_tag text not null check(length(trim(asset_tag)) between 1 and 80),
 name text not null check(length(trim(name)) between 1 and 160),
 category text not null default 'Laptop' check(category in ('Laptop','Desktop','Phone','Tablet','Printer','Network','Other')),
 serial_number text not null default '',model text not null default '',location text not null default '',
 assigned_to uuid, status text not null default 'Available' check(status in ('Available','Assigned','Under repair','Lost','Retired')),
 purchased_on date,warranty_until date,notes text not null default '' check(length(notes)<=5000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,id),unique(tenant_id,asset_tag),
 foreign key(tenant_id,assigned_to) references public.staff_directory(tenant_id,user_id),
 check(status<>'Assigned' or assigned_to is not null),
 check(purchased_on is null or warranty_until is null or warranty_until>=purchased_on)
);
create table public.device_history (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,device_id uuid not null,
 changed_by uuid not null default auth.uid(),changed_at timestamptz not null default now(),snapshot jsonb not null,
 foreign key(tenant_id,device_id) references public.devices(tenant_id,id)
);
alter table public.devices enable row level security;
alter table public.device_history enable row level security;
create policy devices_read on public.devices for select to authenticated using(public.is_staff(tenant_id));
create policy devices_create on public.devices for insert to authenticated with check(public.is_staff(tenant_id) and public.has_capability(tenant_id,'tickets'));
create policy devices_update on public.devices for update to authenticated using(public.is_staff(tenant_id) and public.has_capability(tenant_id,'tickets')) with check(public.is_staff(tenant_id) and public.has_capability(tenant_id,'tickets'));
create policy device_history_read on public.device_history for select to authenticated using(public.is_staff(tenant_id));
create policy device_history_append on public.device_history for insert to authenticated with check(pg_trigger_depth()>0 and changed_by=auth.uid() and public.is_staff(tenant_id) and public.has_capability(tenant_id,'tickets'));
revoke all on public.devices,public.device_history from anon;
grant select,insert,update on public.devices to authenticated;
grant select,insert on public.device_history to authenticated;
create function public.guard_device() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op='UPDATE' and (new.id<>old.id or new.tenant_id<>old.tenant_id or new.created_at<>old.created_at) then raise exception 'Device identity cannot change';end if;
 new.updated_at:=now();return new;end;$$;
create function public.log_device() returns trigger language plpgsql security invoker set search_path='' as $$begin
 insert into public.device_history(tenant_id,device_id,changed_by,snapshot) values(new.tenant_id,new.id,auth.uid(),to_jsonb(new));return new;end;$$;
revoke all on function public.guard_device(),public.log_device() from public,anon,authenticated;
create trigger device_guard before insert or update on public.devices for each row execute function public.guard_device();
create trigger device_history_log after insert or update on public.devices for each row execute function public.log_device();
alter table public.it_tickets add column device_id uuid;
alter table public.it_tickets add constraint ticket_device_workspace foreign key(tenant_id,device_id) references public.devices(tenant_id,id);
create index device_history_parent on public.device_history(tenant_id,device_id,changed_at);
create index ticket_device on public.it_tickets(tenant_id,device_id);
commit;
