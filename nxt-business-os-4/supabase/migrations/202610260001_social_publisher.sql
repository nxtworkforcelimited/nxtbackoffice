begin;

create table if not exists public.social_campaigns(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 client_id uuid,
 title text not null check(length(title) between 1 and 160),
 status text not null default 'active' check(status in ('active','paused','complete')),
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id)
);

alter table public.social_posts add column if not exists campaign_id uuid;
alter table public.social_posts add column if not exists platform_copy jsonb not null default '{}'::jsonb;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='social_posts_campaign_tenant') then
  alter table public.social_posts add constraint social_posts_campaign_tenant foreign key(tenant_id,campaign_id) references public.social_campaigns(tenant_id,id) on delete set null;
 end if;
end $$;

create table if not exists public.social_accounts(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 client_id uuid,
 provider text not null check(provider in ('facebook','instagram','linkedin','tiktok')),
 account_name text not null check(length(account_name) between 1 and 160),
 external_account_id text not null check(length(external_account_id) between 1 and 300),
 token_cipher text,
 refresh_cipher text,
 token_expires_at timestamptz,
 scopes text[] not null default '{}',
 status text not null default 'pending' check(status in ('pending','active','expired','disconnected')),
 created_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,provider,external_account_id),
 unique(tenant_id,id),
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id)
);

create table if not exists public.social_publish_jobs(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 post_id uuid not null,
 account_id uuid not null,
 provider text not null check(provider in ('facebook','instagram','linkedin','tiktok')),
 scheduled_at timestamptz not null,
 copy text not null default '' check(length(copy)<=5000),
 status text not null default 'scheduled' check(status in ('scheduled','publishing','published','failed','cancelled')),
 attempts integer not null default 0 check(attempts>=0),
 last_error text,
 provider_post_id text,
 provider_url text,
 last_attempt_at timestamptz,
 published_at timestamptz,
 created_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(post_id,account_id,scheduled_at),
 unique(tenant_id,id),
 foreign key(tenant_id,post_id) references public.social_posts(tenant_id,id) on delete cascade,
 foreign key(tenant_id,account_id) references public.social_accounts(tenant_id,id) on delete cascade
);

create table if not exists public.social_publish_events(
 id bigint generated always as identity primary key,
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 job_id uuid not null,
 event text not null check(length(event) between 1 and 80),
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 foreign key(tenant_id,job_id) references public.social_publish_jobs(tenant_id,id) on delete cascade
);

alter table public.social_campaigns enable row level security;
alter table public.social_accounts enable row level security;
alter table public.social_publish_jobs enable row level security;
alter table public.social_publish_events enable row level security;

drop policy if exists social_campaign_read on public.social_campaigns;
drop policy if exists social_campaign_write on public.social_campaigns;
create policy social_campaign_read on public.social_campaigns for select to authenticated using(public.has_capability(tenant_id,'content'));
create policy social_campaign_write on public.social_campaigns for all to authenticated using(public.has_capability(tenant_id,'content')) with check(public.has_capability(tenant_id,'content'));
grant select,insert,update on public.social_campaigns to authenticated;

revoke all on public.social_accounts,public.social_publish_jobs,public.social_publish_events from anon,authenticated;
grant select,insert,update,delete on public.social_accounts,public.social_publish_jobs,public.social_publish_events to service_role;

create index if not exists social_jobs_due_idx on public.social_publish_jobs(status,scheduled_at);
create index if not exists social_jobs_post_idx on public.social_publish_jobs(tenant_id,post_id);
create index if not exists social_accounts_client_idx on public.social_accounts(tenant_id,client_id,provider);
create index if not exists social_campaign_client_idx on public.social_campaigns(tenant_id,client_id);

drop trigger if exists social_campaign_touch on public.social_campaigns;
create trigger social_campaign_touch before update on public.social_campaigns for each row execute function public.touch_record();
drop trigger if exists social_account_touch on public.social_accounts;
create trigger social_account_touch before update on public.social_accounts for each row execute function public.touch_record();
drop trigger if exists social_job_touch on public.social_publish_jobs;
create trigger social_job_touch before update on public.social_publish_jobs for each row execute function public.touch_record();

create or replace function public.claim_social_publish_jobs(p_limit integer default 10)
returns setof public.social_publish_jobs
language plpgsql security definer set search_path='' as $$
begin
 return query
 with due as (
  select j.id from public.social_publish_jobs j
  join public.social_accounts a on a.tenant_id=j.tenant_id and a.id=j.account_id
  where j.status='scheduled' and j.scheduled_at<=now() and a.status='active'
  order by j.scheduled_at
  for update skip locked
  limit greatest(1,least(p_limit,50))
 )
 update public.social_publish_jobs j
 set status='publishing',attempts=j.attempts+1,last_attempt_at=now(),last_error=null,updated_at=now()
 from due
 where j.id=due.id
 returning j.*;
end;$$;

revoke all on function public.claim_social_publish_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_social_publish_jobs(integer) to service_role;

commit;