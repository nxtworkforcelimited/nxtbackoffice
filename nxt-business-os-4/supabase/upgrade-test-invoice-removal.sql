-- Recoverable test invoice removal, with ledger reversal and immutable audit history.
alter table public.business_items add column deleted_at timestamptz,add column deleted_by uuid references auth.users(id),add column deletion_reason text;
create policy hide_removed_invoices on public.business_items as restrictive for select to authenticated using(deleted_at is null or public.has_capability(tenant_id,'finance'));
create function public.remove_test_invoice(t uuid,r uuid,reason text) returns public.business_items language plpgsql security definer set search_path='' as $$declare b public.business_items;j public.accounting_journals;reversed jsonb;begin
 if auth.uid() is null or not public.has_capability(t,'finance_admin') or not exists(select 1 from public.accounting_reviewers where tenant_id=t and user_id=auth.uid()) then raise exception 'Only the configured accounting approvers can remove test invoices';end if;
 if length(trim(reason)) not between 5 and 500 then raise exception 'Give a reason of 5–500 characters';end if;
 select * into b from public.business_items where tenant_id=t and id=r for update;
 if not found or b.kind<>'invoice' then raise exception 'Invoice unavailable';end if;
 if b.deleted_at is not null then return b;end if;
 if b.status not in ('draft','issued') or b.paid<>0 or exists(select 1 from public.invoice_payments where tenant_id=t and invoice_id=r) then raise exception 'Invoices with payments cannot be removed. Use a credit note/refund workflow.';end if;
 if exists(select 1 from public.paynow_transactions where tenant_id=t and invoice_id=r) or exists(select 1 from public.omari_transactions where tenant_id=t and invoice_id=r) then raise exception 'This invoice has an online payment attempt. Reconcile it before removing.';end if;
 if b.payload ?| array['fiscal_receipt_id','fiscal_signature','fiscal_qr','zimra_receipt_id','fdms_receipt_id'] then raise exception 'Fiscalised invoices cannot be removed';end if;
 for j in select * from public.accounting_journals where tenant_id=t and source_type='Invoice issued' and source_id=r loop
 select jsonb_agg(jsonb_build_object('account',l->>'account','debit',(l->>'credit')::numeric,'credit',(l->>'debit')::numeric) order by n) into reversed from jsonb_array_elements(j.lines) with ordinality as x(l,n);
 insert into public.accounting_journals(tenant_id,entry_date,currency,description,lines,source_type,source_id,created_by) values(t,current_date,j.currency,'Test invoice removed: '||b.reference,reversed,'Test invoice reversal',b.id,auth.uid());
 end loop;
 update public.business_items set status='void',deleted_at=now(),deleted_by=auth.uid(),deletion_reason=trim(reason) where tenant_id=t and id=r returning * into b;return b;
 end;$$;
revoke all on function public.remove_test_invoice(uuid,uuid,text) from public,anon;
grant execute on function public.remove_test_invoice(uuid,uuid,text) to authenticated;
-- Old action RPCs must not reactivate or change removed invoices.
create function public.protect_removed_invoice() returns trigger language plpgsql security invoker set search_path='' as $$begin if old.deleted_at is not null then raise exception 'Removed invoice is locked; use an administrator recovery process';end if;return new;end;$$;
revoke all on function public.protect_removed_invoice() from public,anon,authenticated;
create trigger protect_removed_invoice before update on public.business_items for each row execute function public.protect_removed_invoice();
