begin;
create table public.paynow_transactions(
 id uuid primary key,
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 invoice_id uuid not null references public.business_items(id) on delete cascade,
 initiated_by uuid,
 merchant_reference text not null unique,
 amount numeric(14,2) not null check(amount>0),
 currency text not null default 'USD' check(currency='USD'),
 status text not null default 'initiating',
 browser_url text,
 poll_url text,
 paynow_reference text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(tenant_id,initiated_by) references public.memberships(tenant_id,user_id)
);
create unique index paynow_reference_unique on public.paynow_transactions(paynow_reference) where paynow_reference is not null;
alter table public.paynow_transactions enable row level security;
revoke all on public.paynow_transactions from anon,authenticated;

create function public.apply_paynow_payment(session_id uuid,paynow_reference text,payment_status text)
returns public.business_items language plpgsql security definer set search_path='' as $$
declare s public.paynow_transactions;b public.business_items;receipt_ref text;
begin
 if current_user<>'service_role' then raise exception 'Service role required';end if;
 select * into s from public.paynow_transactions where id=session_id for update;if not found then raise exception 'Payment session unavailable';end if;
 select * into b from public.business_items where tenant_id=s.tenant_id and id=s.invoice_id and kind='invoice' for update;if not found then raise exception 'Invoice unavailable';end if;
 if lower(s.status)='paid' then return b;end if;
 if lower(payment_status) not in ('paid','awaiting delivery','delivered') then raise exception 'Payment is not confirmed';end if;
 if b.status='paid' and b.paid=b.total then
  update public.paynow_transactions set status='paid',paynow_reference=paynow_reference,updated_at=now() where id=s.id;return b;
 end if;
 if b.status<>'issued' or round((b.total-b.paid)::numeric,2)<>round(s.amount,2) then raise exception 'Invoice balance changed. Payment needs finance review';end if;
 receipt_ref:='PAYNOW-'||coalesce(nullif(paynow_reference,''),s.merchant_reference);
 if not exists(select 1 from public.invoice_payments where tenant_id=s.tenant_id and invoice_id=s.invoice_id and reference=receipt_ref) then
  insert into public.invoice_payments(tenant_id,invoice_id,amount,reference) values(s.tenant_id,s.invoice_id,s.amount,receipt_ref);
 end if;
 update public.business_items set paid=least(total,paid+s.amount),status=case when paid+s.amount>=total then 'paid' else 'issued' end where id=b.id returning * into b;
 update public.paynow_transactions set status='paid',paynow_reference=paynow_reference,updated_at=now() where id=s.id;
 return b;
end;$$;
revoke all on function public.apply_paynow_payment(uuid,text,text) from public,anon,authenticated;
grant execute on function public.apply_paynow_payment(uuid,text,text) to service_role;
commit;