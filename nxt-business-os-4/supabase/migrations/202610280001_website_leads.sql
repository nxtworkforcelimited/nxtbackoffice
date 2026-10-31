begin;
create table public.website_lead_forms (
 slug text primary key,
 tenant_id uuid not null references public.tenants(id),
 client_id uuid not null,
 business_name text not null,
 active boolean not null default true,
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id)
);
create table public.website_leads (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 client_id uuid not null,
 form_slug text not null references public.website_lead_forms(slug),
 name text not null check(length(name) between 2 and 100),
 phone text not null check(phone ~ '^\+?[0-9]{7,15}$'),
 email text not null check(length(email)<=254 and email=lower(trim(email))),
 interest text not null default 'general' check(interest in ('buyer','seller','runner','general')),
 source text not null default 'KaguviGo landing page',
 status text not null default 'new' check(status in ('new','contacted','qualified','converted','closed')),
 notes text not null default '' check(length(notes)<=5000),
 consent_version text not null,
 consented_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 excel_synced_at timestamptz,
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 unique(tenant_id,client_id,email)
);
create index website_leads_business_date on public.website_leads(tenant_id,client_id,created_at desc);
create index website_leads_excel_pending on public.website_leads(form_slug,created_at) where excel_synced_at is null;
create table public.website_lead_limits (
 bucket text primary key,
 hits integer not null,
 expires_at timestamptz not null
);
alter table public.website_lead_forms enable row level security;
alter table public.website_leads enable row level security;
alter table public.website_lead_limits enable row level security;
revoke all on public.website_lead_forms,public.website_leads,public.website_lead_limits from anon,authenticated;
grant select on public.website_lead_forms,public.website_leads to authenticated;
grant update(status,notes,updated_at) on public.website_leads to authenticated;
grant all on public.website_lead_forms,public.website_leads,public.website_lead_limits to service_role;
create policy website_forms_crm_read on public.website_lead_forms for select to authenticated using(public.has_capability(tenant_id,'crm'));
create policy website_leads_crm_read on public.website_leads for select to authenticated using(public.has_capability(tenant_id,'crm'));
create policy website_leads_crm_update on public.website_leads for update to authenticated using(public.has_capability(tenant_id,'crm')) with check(public.has_capability(tenant_id,'crm'));

-- Only the server may invoke intake. It binds the business from the form, never from visitor input.
create function public.capture_website_lead(p_slug text,p_name text,p_phone text,p_email text,p_interest text,p_bucket text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare f public.website_lead_forms; n integer;
begin
 select * into f from public.website_lead_forms where slug=p_slug and active;
 if not found then raise exception 'FORM_UNAVAILABLE'; end if;
 if length(p_bucket)<>64 or p_name !~ '[[:alpha:]]' or length(p_name) not between 2 and 100
 or p_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
 or length(p_email)>254 then raise exception 'INVALID_LEAD'; end if;
 delete from public.website_lead_limits where expires_at<now();
 insert into public.website_lead_limits(bucket,hits,expires_at) values(p_bucket,1,now()+interval '1 hour')
 on conflict(bucket) do update set hits=public.website_lead_limits.hits+1 returning hits into n;
 if n>12 then return false; end if;
 insert into public.website_leads(tenant_id,client_id,form_slug,name,phone,email,interest,consent_version)
 values(f.tenant_id,f.client_id,f.slug,trim(p_name),p_phone,lower(trim(p_email)),p_interest,'kaguvigo-launch-2026-11-01-v1')
 on conflict(tenant_id,client_id,email) do nothing;
 return true;
end;$$;
revoke all on function public.capture_website_lead(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.capture_website_lead(text,text,text,text,text,text) to service_role;
commit;
