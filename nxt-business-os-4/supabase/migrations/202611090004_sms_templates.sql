-- SMS message templates with merge fields. Additive: nothing is deleted or reset.
-- Templates are read and written only by the SMS API (service role, capability checked), never by browsers directly.
begin;

create table if not exists public.sms_templates(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 80),
 category text not null default 'general' check(category in ('invoice','receipt','reminder','general')),
 body text not null check(length(btrim(body)) between 1 and 480),
 created_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 unique(tenant_id,id)
);
alter table public.sms_templates add column if not exists archived_at timestamptz;
create index if not exists sms_templates_tenant_idx on public.sms_templates(tenant_id,archived_at,name);
alter table public.sms_templates enable row level security;
revoke all on public.sms_templates from anon,authenticated;

-- The SMS page sends 'manual' and now 'template' messages. Keep every value already allowed.
alter table public.sms_outbox drop constraint if exists sms_outbox_source_type_check;
alter table public.sms_outbox
 add constraint sms_outbox_source_type_check
 check (source_type in ('task','project','social_post','manual_test','manual','template'));

commit;
