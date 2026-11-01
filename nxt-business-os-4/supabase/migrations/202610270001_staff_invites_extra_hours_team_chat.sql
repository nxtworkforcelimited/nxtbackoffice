-- Staff invites, employee extra hours and secure internal team chat.
-- Applied to production on 2026-10-27.
begin;
alter table public.staff_access_requests add column if not exists capabilities text[] not null default '{}'::text[];
alter table public.staff_access_requests add column if not exists job_title text not null default 'Staff Member';
alter table public.staff_access_requests add column if not exists department text not null default 'NXT Workforce';
alter table public.staff_access_requests drop constraint if exists staff_access_requests_preset_check;
alter table public.staff_access_requests add constraint staff_access_requests_preset_check check (preset in ('finance_payroll','custom'));

create table if not exists public.employee_extra_hours(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 employee_id uuid not null references public.employees(id) on delete cascade,
 work_date date not null,
 hours numeric(6,2) not null check(hours>0 and hours<=24),
 note text not null default '' check(length(note)<=1000),
 recorded_by uuid not null default auth.uid(),
 created_at timestamptz not null default now()
);
alter table public.employee_extra_hours enable row level security;

create table if not exists public.team_chat_messages(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 author_id uuid not null,
 body text not null check(length(trim(body)) between 1 and 5000),
 created_at timestamptz not null default now(),
 foreign key(tenant_id,author_id) references public.memberships(tenant_id,user_id) on delete cascade
);
alter table public.team_chat_messages enable row level security;
commit;
