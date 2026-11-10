-- Cold Calling: automatic Business IDs, alternative number, and remove-with-restore.
-- Safe to run more than once. Nothing is deleted. Existing rows keep their values.
begin;

-- Columns the app already writes. Some live databases have them and some do not, so every one is guarded.
alter table public.cold_call_prospects
 add column if not exists business_id text not null default '',
 add column if not exists category text not null default '',
 add column if not exists location_address text not null default '',
 add column if not exists website_source text not null default '',
 add column if not exists existing_system text not null default '',
 add column if not exists contact_method text not null default '',
 add column if not exists person_spoken_to text not null default '',
 add column if not exists interest_level text not null default '',
 add column if not exists registration_status text not null default '',
 add column if not exists integration_needed text not null default '',
 add column if not exists follow_up_method text not null default 'Call',
 add column if not exists next_action text not null default '',
 add column if not exists converted_deal_id uuid,
 add column if not exists converted_at timestamptz;

-- New: alternative contact number, and removal that can be undone.
alter table public.cold_call_prospects
 add column if not exists alt_phone text not null default '' check(length(alt_phone)<=80),
 add column if not exists archived_at timestamptz,
 add column if not exists archived_by uuid,
 add column if not exists archive_reason text not null default '' check(length(archive_reason)<=500);

create index if not exists cold_call_prospects_active_idx on public.cold_call_prospects(tenant_id,campaign) where archived_at is null;

-- A new prospect with no Business ID gets the next one in its own list: IB-0001, IB-0002 and so on.
-- A list is one tenant, one target (NXT or one client) and one list name, so lists never share numbers.
create or replace function public.cold_call_assign_business_id() returns trigger language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if btrim(coalesce(new.business_id,''))<>'' then new.business_id:=btrim(new.business_id);return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text||'|'||coalesce(new.target_type,'')||'|'||coalesce(new.client_id::text,'')||'|'||coalesce(new.campaign,''),0));
 select coalesce(max(substring(business_id from '^IB-([0-9]{1,6})$')::integer),0)+1 into n from public.cold_call_prospects
  where tenant_id=new.tenant_id and target_type=new.target_type and client_id is not distinct from new.client_id and campaign=new.campaign;
 new.business_id:='IB-'||lpad(n::text,4,'0');
 return new;
end$$;
revoke all on function public.cold_call_assign_business_id() from public,anon,authenticated;
drop trigger if exists cold_call_business_id on public.cold_call_prospects;
create trigger cold_call_business_id before insert on public.cold_call_prospects for each row execute function public.cold_call_assign_business_id();

-- Fill the blanks on prospects that already exist, oldest first, continuing after the highest number in each list.
with blank as (
 select id,tenant_id,target_type,client_id,campaign,row_number() over(partition by tenant_id,target_type,client_id,campaign order by created_at,id) rn
 from public.cold_call_prospects where btrim(coalesce(business_id,''))=''
), base as (
 select tenant_id,target_type,client_id,campaign,coalesce(max(substring(business_id from '^IB-([0-9]{1,6})$')::integer),0) m
 from public.cold_call_prospects group by 1,2,3,4
)
update public.cold_call_prospects p set business_id='IB-'||lpad((base.m+blank.rn)::text,4,'0')
from blank join base on base.tenant_id=blank.tenant_id and base.target_type=blank.target_type and base.client_id is not distinct from blank.client_id and base.campaign=blank.campaign
where p.id=blank.id;

commit;
