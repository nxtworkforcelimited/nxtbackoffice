begin;
create function public.can_delete_test_data(t uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships m join auth.users u on u.id=m.user_id where m.tenant_id=t and m.user_id=auth.uid() and m.role='owner' and lower(u.email)='nyasha@nxt-workforce.com' and u.email_confirmed_at is not null);
$$;
revoke all on function public.can_delete_test_data(uuid) from public,anon;
grant execute on function public.can_delete_test_data(uuid) to authenticated;
-- Apply the named-account gate to every existing record DELETE policy.
do $$ declare p record;begin for p in select tablename,policyname,qual from pg_policies where schemaname='public' and cmd='DELETE' loop
 execute format('alter policy %I on public.%I using ((%s) and public.can_delete_test_data(tenant_id))',p.policyname,p.tablename,p.qual);
end loop;end $$;
alter table public.it_tickets add column archived_at timestamptz;
create table nxt_private.test_cleanup_audit(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,record_type text not null,record_id uuid not null,record_title text not null,reason text not null,removed_by uuid not null,removed_at timestamptz not null default now());
alter table nxt_private.test_cleanup_audit enable row level security;
revoke all on nxt_private.test_cleanup_audit from public,anon,authenticated;
create or replace function public.remove_test_invoice(t uuid,r uuid,reason text) returns public.business_items language plpgsql security definer set search_path='' as $$
declare b public.business_items;j public.accounting_journals;reversed jsonb;begin
 if not public.can_delete_test_data(t) then raise exception 'Only nyasha@nxt-workforce.com can remove records';end if;
 if length(trim(reason)) not between 5 and 500 then raise exception 'Give a reason of 5-500 characters';end if;
 select * into b from public.business_items where tenant_id=t and id=r for update;
 if not found or b.kind<>'invoice' then raise exception 'Invoice unavailable';end if;
 if b.deleted_at is not null then return b;end if;
 if b.status not in ('draft','issued') or b.paid<>0 or exists(select 1 from public.invoice_payments where tenant_id=t and invoice_id=r) then raise exception 'Invoices with payments cannot be removed. Use a credit note/refund workflow.';end if;
 if exists(select 1 from public.paynow_transactions where tenant_id=t and invoice_id=r) or exists(select 1 from public.omari_transactions where tenant_id=t and invoice_id=r) then raise exception 'This invoice has an online payment attempt. Reconcile it before removing.';end if;
 if b.payload ?| array['fiscal_receipt_id','fiscal_signature','fiscal_qr','zimra_receipt_id','fdms_receipt_id'] then raise exception 'Fiscalised invoices cannot be removed';end if;
 for j in select * from public.accounting_journals where tenant_id=t and source_type='Invoice issued' and source_id=r loop
 select jsonb_agg(jsonb_build_object('account',l->>'account','debit',(l->>'credit')::numeric,'credit',(l->>'debit')::numeric) order by n) into reversed from jsonb_array_elements(j.lines) with ordinality as x(l,n);
 insert into public.accounting_journals(tenant_id,entry_date,currency,description,lines,source_type,source_id,created_by) values(t,current_date,j.currency,'Test invoice removed: '||b.reference,reversed,'Test invoice reversal',b.id,auth.uid());end loop;
 update public.business_items set status='void',deleted_at=now(),deleted_by=auth.uid(),deletion_reason=trim(reason) where tenant_id=t and id=r returning * into b;
 return b;end;$$;
create function public.remove_test_record(t uuid,k text,r uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare title text;b public.business_items;begin
 if not public.can_delete_test_data(t) then raise exception 'Only nyasha@nxt-workforce.com can remove records';end if;
 if length(trim(reason)) not between 5 and 500 then raise exception 'Give a reason of 5-500 characters';end if;
 if k in ('clients','projects','tasks','it_tickets') then
 execute format('select title from public.%I where tenant_id=$1 and id=$2 for update',k) into title using t,r;
 if title is null then raise exception 'Record not found';end if;
 execute format('update public.%I set archived_at=now() where tenant_id=$1 and id=$2',k) using t,r;
 elsif k in ('invoice','quote','request','sms') then
 select * into b from public.business_items where tenant_id=t and id=r and kind=k and deleted_at is null for update;
 if not found then raise exception 'Record not found';end if;title:=b.reference||' - '||b.title;
 if k='invoice' then perform public.remove_test_invoice(t,r,reason);
 else update public.business_items set deleted_at=now(),deleted_by=auth.uid(),deletion_reason=trim(reason) where tenant_id=t and id=r;end if;
 else raise exception 'Unsupported record type';end if;
 insert into nxt_private.test_cleanup_audit(tenant_id,record_type,record_id,record_title,reason,removed_by) values(t,k,r,title,trim(reason),auth.uid());
 update public.sms_outbox set status='failed',last_error='Test record removed by authorised owner' where tenant_id=t and status='queued' and (source_id=r or (k='clients' and client_id=r));
 update public.notification_outbox set attempts=5,last_error='Test record removed by authorised owner' where tenant_id=t and sent_at is null and source_id=r;
end;$$;
revoke all on function public.remove_test_record(uuid,text,uuid,text),public.remove_test_invoice(uuid,uuid,text) from public,anon;
grant execute on function public.remove_test_record(uuid,text,uuid,text),public.remove_test_invoice(uuid,uuid,text) to authenticated;
-- Protect the attachment-removal RPC too; it runs with definer privileges.
do $$ declare ddl text;begin
 ddl:=pg_get_functiondef('public.remove_work_attachment(uuid,uuid)'::regprocedure);
 ddl:=regexp_replace(ddl,'\mbegin\M',E'begin\n if not public.can_delete_test_data(t) then raise exception ''Only nyasha@nxt-workforce.com can remove records'';end if;', 'i');
 execute ddl;
end $$;
commit;
