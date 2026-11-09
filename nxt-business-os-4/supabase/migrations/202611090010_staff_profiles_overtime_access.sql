-- Staff profiles, salary ranges, overtime approval, hidden menus per staff and profile reminders.
-- Additive only. Nothing is deleted or reset. Existing columns and rows are kept as they are.
begin;

-- 1. Profile details. Some of these exist already on the live table; "if not exists" keeps them.
alter table public.employees
 add column if not exists home_address text not null default '',
 add column if not exists emergency_contact text not null default '',
 add column if not exists emergency_phone text not null default '',
 add column if not exists next_of_kin_relationship text not null default '',
 add column if not exists medical_conditions text not null default '',
 add column if not exists medical_declared boolean not null default false,
 add column if not exists licence_number text not null default '',
 add column if not exists licence_expiry date,
 add column if not exists reminders_paused boolean not null default false;

-- 2. Salary range. Its own table so a staff member reading their own profile never receives it.
create table if not exists public.employee_salary_ranges(
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 employee_id uuid not null,
 currency text not null default 'USD' check(currency in ('USD','ZWG','GBP','AUD')),
 min_monthly numeric(14,2) not null check(min_monthly>=0),
 max_monthly numeric(14,2) not null check(max_monthly>=min_monthly),
 updated_by uuid,
 updated_at timestamptz not null default now(),
 primary key(tenant_id,employee_id),
 foreign key(tenant_id,employee_id) references public.employees(tenant_id,id) on delete cascade
);
alter table public.employee_salary_ranges enable row level security;
revoke all on public.employee_salary_ranges from anon,authenticated;
-- No policies and no grants: only the server (service role) reads or writes this table, after checking the caller is the owner or has payroll access.

-- 3. Overtime goes through approval. Rows recorded before this upgrade were entered by managers, so they count as approved.
alter table public.employee_extra_hours
 add column if not exists status text not null default 'approved',
 add column if not exists reviewed_by uuid,
 add column if not exists reviewed_at timestamptz,
 add column if not exists review_note text not null default '';
alter table public.employee_extra_hours drop constraint if exists employee_extra_hours_status_check;
alter table public.employee_extra_hours add constraint employee_extra_hours_status_check check(status in ('pending','approved','rejected'));
create index if not exists employee_extra_hours_status_idx on public.employee_extra_hours(tenant_id,status,work_date);

-- 4. Menus the owner has switched off for a staff member. Written by the server only (owner only); read by the server for the member.
create table if not exists public.member_hidden_apps(
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 user_id uuid not null,
 app text not null check(app ~ '^[a-z_]{2,30}$'),
 hidden_by uuid,
 created_at timestamptz not null default now(),
 primary key(tenant_id,user_id,app)
);
alter table public.member_hidden_apps enable row level security;
revoke all on public.member_hidden_apps from anon,authenticated;

-- 5. Reminder log: one row per staff member per reminder, so nobody is emailed twice for the same week.
create table if not exists public.staff_profile_reminders(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 employee_id uuid not null,
 reminder_key text not null,
 missing text[] not null default '{}',
 created_at timestamptz not null default now(),
 unique(tenant_id,employee_id,reminder_key)
);
alter table public.staff_profile_reminders enable row level security;
revoke all on public.staff_profile_reminders from anon,authenticated;

commit;
