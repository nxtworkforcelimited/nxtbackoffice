begin;
create table public.omari_transactions(
 id uuid primary key,
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 invoice_id uuid not null references public.business_items(id) on delete cascade,
 initiated_by uuid,
 reference uuid not null unique,
 msisdn text not null check(msisdn ~ '^2637[0-9]{8}$'),
 amount numeric(14,2) not null check(amount>0),
 currency text not null check(currency in ('USD','ZWG')),
 status text not null,
 otp_reference text,
 payment_reference text,
 debit_reference text,
 environment text not null check(environment in ('uat','production')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(tenant_id,initiated_by) references public.memberships(tenant_id,user_id)
);
create unique index omari_payment_reference_unique on public.omari_transactions(payment_reference) where payment_reference is not null;
alter table public.omari_transactions enable row level security;
revoke all on public.omari_transactions from anon,authenticated;

create function public.apply_omari_payment(session_id uuid,p_payment_reference text,p_debit_reference text)
returns public.business_items language plpgsql security definer set search_path='' as $$
declare s public.omari_transactions;b public.business_items;receipt_ref text;
begin
 select * into s from public.omari_transactions where id=session_id for update;if not found then raise exception 'Omari session unavailable';end if;
 select * into b from public.business_items where tenant_id=s.tenant_id and id=s.invoice_id and kind='invoice' for update;if not found then raise exception 'Invoice unavailable';end if;
 if lower(s.status)='paid' then return b;end if;
 if b.status='paid' and b.paid=b.total then update public.omari_transactions set status='paid',payment_reference=p_payment_reference,debit_reference=p_debit_reference,updated_at=now() where id=s.id;return b;end if;
 if b.status<>'issued' or round((b.total-b.paid)::numeric,2)<>round(s.amount,2) then raise exception 'Invoice balance changed. Omari payment needs finance review';end if;
 receipt_ref:='OMARI-'||coalesce(nullif(p_payment_reference,''),s.reference::text);
 if not exists(select 1 from public.invoice_payments where tenant_id=s.tenant_id and invoice_id=s.invoice_id and reference=receipt_ref) then insert into public.invoice_payments(tenant_id,invoice_id,amount,reference) values(s.tenant_id,s.invoice_id,s.amount,receipt_ref);end if;
 update public.business_items set paid=least(total,paid+s.amount),status=case when paid+s.amount>=total then 'paid' else 'issued' end where id=b.id returning * into b;
 update public.omari_transactions set status='paid',payment_reference=p_payment_reference,debit_reference=p_debit_reference,updated_at=now() where id=s.id;
 return b;
end;$$;
revoke all on function public.apply_omari_payment(uuid,text,text) from public,anon,authenticated;
grant execute on function public.apply_omari_payment(uuid,text,text) to service_role;
commit;