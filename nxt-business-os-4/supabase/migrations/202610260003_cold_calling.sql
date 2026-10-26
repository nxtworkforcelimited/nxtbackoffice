begin;
create table if not exists public.cold_call_prospects(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 client_id uuid,
 campaign text not null default '' check(length(campaign)<=160),
 target_type text not null default 'nxt' check(target_type in ('nxt','client')),
 company text not null check(length(company) between 1 and 200),
 contact_name text not null default '' check(length(contact_name)<=160),
 phone text not null check(length(phone) between 6 and 40),
 email text not null default '' check(length(email)<=254),
 source text not null default '' check(length(source)<=160),
 owner_id uuid,
 status text not null default 'new' check(status in ('new','attempted','connected','callback','interested','not_interested','wrong_number','converted')),
 notes text not null default '' check(length(notes)<=5000),
 feedback text not null default '' check(length(feedback)<=5000),
 next_follow_up timestamptz,
 last_called_at timestamptz,
 last_outcome text,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 foreign key(tenant_id,owner_id) references public.memberships(tenant_id,user_id)
);
create table if not exists public.cold_call_activities(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 prospect_id uuid not null,
 caller_id uuid not null default auth.uid(),
 called_at timestamptz not null default now(),
 outcome text not null check(outcome in ('no_answer','voicemail','connected','callback','interested','not_interested','wrong_number','converted')),
 notes text not null default '' check(length(notes)<=5000),
 feedback text not null default '' check(length(feedback)<=5000),
 duration_seconds integer check(duration_seconds is null or duration_seconds between 0 and 28800),
 created_at timestamptz not null default now(),
 foreign key(tenant_id,prospect_id) references public.cold_call_prospects(tenant_id,id) on delete cascade,
 foreign key(tenant_id,caller_id) references public.memberships(tenant_id,user_id)
);
alter table public.cold_call_prospects enable row level security;
alter table public.cold_call_activities enable row level security;
drop policy if exists cold_call_prospect_read on public.cold_call_prospects;
drop policy if exists cold_call_prospect_write on public.cold_call_prospects;
drop policy if exists cold_call_activity_read on public.cold_call_activities;
drop policy if exists cold_call_activity_write on public.cold_call_activities;
create policy cold_call_prospect_read on public.cold_call_prospects for select to authenticated using(public.is_staff(tenant_id));
create policy cold_call_prospect_write on public.cold_call_prospects for all to authenticated using(public.is_staff(tenant_id)) with check(public.is_staff(tenant_id));
create policy cold_call_activity_read on public.cold_call_activities for select to authenticated using(public.is_staff(tenant_id));
create policy cold_call_activity_write on public.cold_call_activities for insert to authenticated with check(public.is_staff(tenant_id) and caller_id=auth.uid());
grant select,insert,update on public.cold_call_prospects to authenticated;
grant select,insert on public.cold_call_activities to authenticated;
create index if not exists cold_call_prospects_tenant_idx on public.cold_call_prospects(tenant_id,status,owner_id);
create index if not exists cold_call_activities_day_idx on public.cold_call_activities(tenant_id,called_at desc);
drop trigger if exists cold_call_prospect_touch on public.cold_call_prospects;
create trigger cold_call_prospect_touch before update on public.cold_call_prospects for each row execute function public.touch_record();
commit;