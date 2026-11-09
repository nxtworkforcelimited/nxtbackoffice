begin;
create sequence public.receipt_draft_number_seq;
create table public.receipt_drafts (
 id uuid primary key,
 tenant_id uuid not null references public.tenants(id),
 reference text not null default ('DRF-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.receipt_draft_number_seq')::text,8,'0')) unique,
 recipient text not null check (length(trim(recipient)) between 1 and 160),
 description text not null check (length(trim(description)) between 1 and 1000),
 amount numeric(14,2) not null check (amount > 0 and amount <= 100000000),
 currency text not null default 'USD' check (currency='USD'),
 status text not null default 'awaiting_payment' check (status='awaiting_payment'),
 created_at timestamptz not null default now()
);
alter table public.receipt_drafts enable row level security;
revoke all on public.receipt_drafts from anon,authenticated;
grant select on public.receipt_drafts to authenticated;
grant insert (id,tenant_id,recipient,description,amount) on public.receipt_drafts to authenticated;
grant usage on sequence public.receipt_draft_number_seq to authenticated;
create policy receipt_draft_read on public.receipt_drafts for select to authenticated
 using (public.has_capability(tenant_id,'finance') or public.has_capability(tenant_id,'finance_admin'));
create policy receipt_draft_create on public.receipt_drafts for insert to authenticated
 with check (public.has_capability(tenant_id,'finance_admin'));
create index receipt_drafts_tenant_created_idx on public.receipt_drafts(tenant_id,created_at desc);
comment on table public.receipt_drafts is 'Unpaid draft documents only. Never used as invoice payments or ledger entries.';
commit;
