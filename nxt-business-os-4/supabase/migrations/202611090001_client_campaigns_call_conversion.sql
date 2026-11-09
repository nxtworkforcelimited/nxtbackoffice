-- Client campaigns tab and cold-call conversion link.
-- Additive only: nothing is dropped, renamed, reset or deleted.
begin;

-- A prospect that becomes "converted" is linked to the CRM deal created for it,
-- so converting twice never creates a second deal.
alter table public.cold_call_prospects add column if not exists converted_deal_id uuid;
alter table public.cold_call_prospects add column if not exists converted_at timestamptz;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='cold_call_prospects_converted_deal_fk') then
  alter table public.cold_call_prospects add constraint cold_call_prospects_converted_deal_fk
   foreign key(tenant_id,converted_deal_id) references public.deals(tenant_id,id);
 end if;
end $$;

-- One row per campaign run for a client.
create table if not exists public.client_campaigns(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 client_id uuid not null,
 name text not null check(length(name) between 1 and 160),
 objective text not null default '' check(length(objective)<=2000),
 channel text not null default '' check(length(channel)<=100),
 status text not null default 'planned' check(status in ('planned','active','paused','completed')),
 start_date date,
 end_date date,
 budget numeric(14,2) not null default 0 check(budget>=0),
 currency text not null default 'USD' check(length(currency)=3),
 target_leads integer check(target_leads is null or target_leads>=0),
 utm_campaign text not null default '' check(length(utm_campaign)<=160),
 call_campaign text not null default '' check(length(call_campaign)<=160),
 client_summary text not null default '' check(length(client_summary)<=2000),
 internal_notes text not null default '' check(length(internal_notes)<=5000),
 client_visible boolean not null default false,
 archived_at timestamptz,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 check(end_date is null or start_date is null or end_date>=start_date)
);
create index if not exists client_campaigns_client_idx on public.client_campaigns(tenant_id,client_id,created_at desc);
alter table public.client_campaigns enable row level security;
drop policy if exists client_campaigns_staff_read on public.client_campaigns;
drop policy if exists client_campaigns_staff_insert on public.client_campaigns;
drop policy if exists client_campaigns_staff_update on public.client_campaigns;
-- Staff only. Clients never read this table directly, so budget and internal
-- notes cannot leak. They use client_visible_campaigns() below.
create policy client_campaigns_staff_read on public.client_campaigns for select to authenticated using(public.is_staff(tenant_id));
create policy client_campaigns_staff_insert on public.client_campaigns for insert to authenticated with check(public.is_staff(tenant_id));
create policy client_campaigns_staff_update on public.client_campaigns for update to authenticated using(public.is_staff(tenant_id)) with check(public.is_staff(tenant_id));
grant select,insert,update on public.client_campaigns to authenticated;
revoke all on public.client_campaigns from anon;
drop trigger if exists client_campaigns_touch on public.client_campaigns;
create trigger client_campaigns_touch before update on public.client_campaigns for each row execute function public.touch_record();

-- Client-safe view of campaigns: only the signed-in client's own, only those
-- marked visible, and only the columns meant for clients.
create or replace function public.client_visible_campaigns(t uuid)
returns table(id uuid,name text,objective text,channel text,status text,start_date date,end_date date,target_leads integer,utm_campaign text,client_summary text)
language sql stable security definer set search_path='' as $$
 select c.id,c.name,c.objective,c.channel,c.status,c.start_date,c.end_date,c.target_leads,c.utm_campaign,c.client_summary
 from public.client_campaigns c
 join public.memberships m on m.tenant_id=c.tenant_id and m.client_id=c.client_id and m.role='client' and m.user_id=(select auth.uid())
 where c.tenant_id=t and c.client_visible and c.archived_at is null
 order by c.created_at desc
$$;
revoke all on function public.client_visible_campaigns(uuid) from public,anon;
grant execute on function public.client_visible_campaigns(uuid) to authenticated;
commit;
