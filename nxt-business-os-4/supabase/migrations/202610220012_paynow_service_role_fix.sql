begin;
create or replace function public.apply_paynow_payment(session_id uuid,paynow_reference text,payment_status text)
returns public.business_items language plpgsql security definer set search_path='' as $$
declare s public.paynow_transactions;b public.business_items;receipt_ref text;
begin
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